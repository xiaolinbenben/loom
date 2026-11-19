import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { agentDir, modelsPath, promptTemplatePath, sessionDir, skillsRoot, writeModelsFile } from "./config.js";
import { requireReadyAgent } from "./catalog.js";
import { getModelSettings } from "./db.js";
import { closeSandbox, openTaskSandbox } from "./sandbox.js";
import { saveImageTool } from "./storage.js";

const toolLabels: Record<string, string> = {
  read: "读取文件",
  bash: "执行命令",
  edit: "修改文件",
  write: "写入文件",
  save_image: "保存图片",
  grep: "搜索内容",
  find: "查找文件",
  ls: "列出目录",
};

export function toolLabel(name: string): string {
  return toolLabels[name] ?? name;
}

export function toolDetail(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const value =
    name === "bash"
      ? record.command
      : name === "read" || name === "write" || name === "edit" || name === "save_image"
        ? record.path
        : undefined;
  return typeof value === "string" ? value.slice(0, 240) : "";
}

export async function createTaskSession(cwd: string, taskId: string, sessionPath?: string): Promise<AgentSession> {
  const agent = requireReadyAgent();
  const config = getModelSettings();
  if (!config) throw new Error("请先在后台配置图灵 API");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  writeModelsFile(config);
  const settingsManager = SettingsManager.inMemory();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath,
  });
  const model = modelRuntime.getModel("terln", config.model);
  if (!model) throw new Error(`图灵模型不可用：${config.model}`);

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalSkillPaths: agent.skills.map((skill) => join(skillsRoot, skill.name)),
    additionalPromptTemplatePaths: [promptTemplatePath],
  });
  await resourceLoader.reload();
  const skills = resourceLoader.getSkills();
  const skillErrors = skills.diagnostics.filter((item) => item.type === "error");
  if (skillErrors.length > 0) throw new Error(skillErrors.map((item) => item.message).join("；"));
  const missing = agent.skills.filter((skill) => !skills.skills.some((loaded) => loaded.name === skill.name));
  if (missing.length > 0) throw new Error(`没有加载技能：${missing.map((skill) => skill.name).join("、")}`);
  const prompts = resourceLoader.getPrompts();
  const promptErrors = prompts.diagnostics.filter((item) => item.type === "error");
  if (promptErrors.length > 0) throw new Error(promptErrors.map((item) => item.message).join("；"));
  if (!prompts.prompts.some((prompt) => prompt.name === agent.promptName)) throw new Error(`没有加载 ${agent.promptName} 提示模板`);

  const sessionManager = sessionPath
    ? SessionManager.open(sessionPath, sessionDir, cwd)
    : SessionManager.create(cwd, sessionDir);
  const sandbox = await openTaskSandbox(
    cwd,
    agent.skills.map((skill) => join(skillsRoot, skill.name)),
  );
  try {
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      thinkingLevel: "off",
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager,
      tools: ["read", "bash", "edit", "write", "save_image"],
      customTools: [saveImageTool(cwd, taskId), ...sandbox.tools],
    });
    return session;
  } catch (error) {
    try {
      await closeSandbox(sandbox.vm);
    } catch (closeError) {
      console.error(closeError);
    }
    throw error;
  }
}
