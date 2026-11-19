import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsRoot, promptTemplatePath, skillsRoot } from "./config.js";

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
  included: boolean;
  headline: string;
  inputLabel: string;
  placeholder: string;
  outputName: string | null;
  resultName: string | null;
  promptName: string;
  tasks: string[];
  rules: string[];
  workflow: AgentWorkflowStep[];
  skills: AgentSkill[];
}

export function loadAgents(): AgentPackage[] {
  if (!existsSync(agentsRoot)) throw new Error("没有智能体目录");
  const ids = readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(agentsRoot, entry.name, "agent.json")))
    .map((entry) => entry.name)
    .sort();
  if (ids.length === 0) throw new Error("没有可交付的智能体");
  const agents = ids.map(loadAgentFile);
  const included = agents.filter((agent) => agent.included);
  if (included.length !== 1) throw new Error("必须有且只有一个默认雇佣的智能体");
  const [defaultAgent] = included;
  if (!defaultAgent) throw new Error("必须有且只有一个默认雇佣的智能体");
  return [defaultAgent, ...agents.filter((agent) => agent.id !== defaultAgent.id)];
}

export function loadAgent(id: string): AgentPackage {
  const agent = loadAgents().find((item) => item.id === id);
  if (!agent) throw new Error(`没有这个智能体：${id}`);
  return agent;
}

export function missingSkills(agent: AgentPackage): string[] {
  return agent.skills
    .filter((skill) => !existsSync(join(skillsRoot, skill.name, "SKILL.md")))
    .map((skill) => skill.name);
}

export function requireReadyAgent(id: string): AgentPackage {
  const agent = loadAgent(id);
  const missing = missingSkills(agent);
  if (missing.length > 0) {
    throw new Error(`技能还没有安装：${missing.join("、")}。在仓库根目录运行 npm run install-skills`);
  }
  return agent;
}

export function agentViews() {
  return loadAgents().map((agent) => {
    const missing = missingSkills(agent);
    return {
      id: agent.id,
      name: agent.name,
      summary: agent.summary,
      monthlyPrice: agent.monthlyPrice,
      currency: agent.currency,
      included: agent.included,
      headline: agent.headline,
      inputLabel: agent.inputLabel,
      placeholder: agent.placeholder,
      outputName: agent.outputName,
      resultName: agent.resultName,
      tasks: agent.tasks,
      rules: agent.rules,
      workflow: agent.workflow,
      skills: agent.skills,
      ready: missing.length === 0,
      missingSkills: missing,
    };
  });
}

function loadAgentFile(directoryName: string): AgentPackage {
  const path = join(agentsRoot, directoryName, "agent.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取智能体定义：${message}`);
  }
  if (!isRecord(parsed)) throw new Error(`${directoryName} 的 agent.json 不是对象`);
  const id = requiredString(parsed, "id");
  if (id !== directoryName) throw new Error(`智能体 ${directoryName} 的 id 必须与目录相同`);
  const promptName = requiredString(parsed, "promptName");
  if (promptName !== id) throw new Error(`${id} 的提示模板名称必须与智能体相同`);
  if (!existsSync(promptTemplatePath(id))) throw new Error(`缺少提示模板：${id}`);
  const monthlyPrice = parsed.monthlyPrice;
  if (typeof monthlyPrice !== "number" || !Number.isInteger(monthlyPrice) || monthlyPrice < 0) {
    throw new Error(`${id} 的月费必须是非负整数`);
  }
  if (parsed.currency !== "CNY") throw new Error(`${id} 的货币只支持 CNY`);
  if (typeof parsed.included !== "boolean") throw new Error(`${id} 必须标明是否默认雇佣`);
  if (parsed.included !== (monthlyPrice === 0)) throw new Error(`${id} 只有免费智能体可以默认雇佣`);
  const outputName = optionalString(parsed, "outputName");
  const resultName = optionalString(parsed, "resultName");
  if (outputName && (outputName.includes("/") || outputName.includes("\\"))) throw new Error(`${id} 的产出文件名不能包含路径`);
  if (Boolean(outputName) !== Boolean(resultName)) throw new Error(`${id} 的产出文件和结果名称必须同时存在`);
  const workflow = steps(parsed.workflow, id);
  if (workflow.length !== 4) throw new Error(`${id} 的任务流程必须是四步`);
  return {
    id,
    name: requiredString(parsed, "name"),
    summary: requiredString(parsed, "summary"),
    monthlyPrice,
    currency: "CNY",
    included: parsed.included,
    headline: requiredString(parsed, "headline"),
    inputLabel: requiredString(parsed, "inputLabel"),
    placeholder: requiredString(parsed, "placeholder"),
    outputName,
    resultName,
    promptName,
    tasks: stringList(parsed.tasks, "tasks", id),
    rules: stringList(parsed.rules, "rules", id),
    workflow,
    skills: skills(parsed.skills, id),
  };
}

function skills(value: unknown, id: string): AgentSkill[] {
  if (!Array.isArray(value)) throw new Error(`${id} 的 skills 无效`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${id} 的 skills[${index}] 无效`);
    const name = requiredString(item, "name");
    const source = requiredString(item, "source");
    const expected = `https://github.com/xiaolinbenben/food4agent/skills/${name}`;
    if (source !== expected) throw new Error(`技能 ${name} 的安装地址必须是 ${expected}`);
    return { name, source };
  });
}

function steps(value: unknown, id: string): AgentWorkflowStep[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${id} 的 workflow 不能为空`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${id} 的 workflow[${index}] 无效`);
    return { title: requiredString(item, "title"), detail: requiredString(item, "detail") };
  });
}

function stringList(value: unknown, key: string, id: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${id} 的 ${key} 不能为空`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") throw new Error(`${id} 的 ${key}[${index}] 无效`);
    return item.trim();
  });
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`agent.json 缺少 ${key}`);
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  if (!(key in record) || record[key] === null) return null;
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`agent.json 的 ${key} 无效`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
