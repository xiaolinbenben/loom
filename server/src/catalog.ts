import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentPackagePath, deliveredAgentId, skillsRoot } from "./config.js";

export interface AgentSkill {
  name: string;
  source: string;
}

export interface AgentWorkflowStep {
  title: string;
  detail: string;
}

export interface AgentPackage {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  currency: "CNY";
  outputName: string;
  promptName: string;
  tasks: string[];
  rules: string[];
  workflow: AgentWorkflowStep[];
  skills: AgentSkill[];
}

export function loadAgent(): AgentPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(agentPackagePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取智能体定义：${message}`);
  }
  if (!isRecord(parsed)) throw new Error("agent.json 不是对象");
  const id = requiredString(parsed, "id");
  if (id !== deliveredAgentId) throw new Error(`当前只交付 ${deliveredAgentId}`);
  const promptName = requiredString(parsed, "promptName");
  if (promptName !== deliveredAgentId) throw new Error("提示模板名称必须与智能体相同");
  const monthlyPrice = parsed.monthlyPrice;
  if (typeof monthlyPrice !== "number" || !Number.isInteger(monthlyPrice) || monthlyPrice < 1) {
    throw new Error("月费必须是正整数");
  }
  if (parsed.currency !== "CNY") throw new Error("货币只支持 CNY");
  const outputName = requiredString(parsed, "outputName");
  if (outputName.includes("/") || outputName.includes("\\")) throw new Error("产出文件名不能包含路径");
  const workflow = steps(parsed.workflow);
  if (workflow.length !== 4) throw new Error("任务流程必须是四步");
  return {
    id,
    name: requiredString(parsed, "name"),
    summary: requiredString(parsed, "summary"),
    monthlyPrice,
    currency: "CNY",
    outputName,
    promptName,
    tasks: stringList(parsed.tasks, "tasks"),
    rules: stringList(parsed.rules, "rules"),
    workflow,
    skills: skills(parsed.skills),
  };
}

export function missingSkills(agent: AgentPackage): string[] {
  return agent.skills
    .filter((skill) => !existsSync(join(skillsRoot, skill.name, "SKILL.md")))
    .map((skill) => skill.name);
}

export function requireReadyAgent(): AgentPackage {
  const agent = loadAgent();
  const missing = missingSkills(agent);
  if (missing.length > 0) {
    throw new Error(`技能还没有安装：${missing.join("、")}。在仓库根目录运行 npm run install-skills`);
  }
  return agent;
}

export function agentView() {
  const agent = loadAgent();
  const missing = missingSkills(agent);
  return {
    id: agent.id,
    name: agent.name,
    summary: agent.summary,
    monthlyPrice: agent.monthlyPrice,
    currency: agent.currency,
    outputName: agent.outputName,
    tasks: agent.tasks,
    rules: agent.rules,
    workflow: agent.workflow,
    skills: agent.skills,
    ready: missing.length === 0,
    missingSkills: missing,
  };
}

function skills(value: unknown): AgentSkill[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("agent.json 的 skills 不能为空");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent.json 的 skills[${index}] 无效`);
    const name = requiredString(item, "name");
    const source = requiredString(item, "source");
    const expected = `https://github.com/xiaolinbenben/food4agent/skills/${name}`;
    if (source !== expected) throw new Error(`技能 ${name} 的安装地址必须是 ${expected}`);
    return { name, source };
  });
}

function steps(value: unknown): AgentWorkflowStep[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("agent.json 的 workflow 不能为空");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agent.json 的 workflow[${index}] 无效`);
    return { title: requiredString(item, "title"), detail: requiredString(item, "detail") };
  });
}

function stringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`agent.json 的 ${key} 不能为空`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") throw new Error(`agent.json 的 ${key}[${index}] 无效`);
    return item.trim();
  });
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`agent.json 缺少 ${key}`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
