import {
  countTasksByAgent,
  deleteAgent as deleteAgentRow,
  getAgent,
  getHire,
  insertAgentsIfEmpty,
  listAgents,
  listHires,
  listTasks,
  saveAgent,
  saveHire,
  saveTaskSnapshot,
  type AgentRecord,
} from "./db.js";
import { RequestError } from "./errors.js";
import { isInstalledSkill, normalizeSkillName } from "./skills.js";

const idPattern = /^[a-z][a-z0-9-]{0,31}$/;
const loomerId = "loomer";
const loomerBase = [
  "请处理当前工作区。",
  "用户的要求如果写了，在 input/note.txt。上传的文件在 input/。",
  "只处理这个任务工作区。需要留下文件时写到 output/。",
  "需要外部事实时，用 curl 读取公开网页核实。不要声称没有联网权限。",
  "不要修改工作区以外的文件。做完就停止。",
].join("\n");

export interface AgentSnapshot {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  instructions: string;
  skills: string[];
  baseInstructions: string;
  agentUpdatedAt: string;
  baseUpdatedAt: string;
}

export function ensureAgents(): void {
  insertAgentsIfEmpty([loomerAgent(), listingAgent()]);
  const loomer = getAgent(loomerId);
  if (loomer && loomer.instructions.trim() === "") saveAgent("update", { ...loomer, instructions: loomerBase });
  backfillTaskSnapshots();
}

export function loadAgents(): AgentRecord[] {
  ensureAgents();
  return listAgents();
}

export function loadManagedAgents(): AgentRecord[] {
  return loadAgents().filter((agent) => agent.id !== loomerId);
}

export function loadLoomer(): AgentRecord {
  const loomer = loadAgents().find((agent) => agent.id === loomerId);
  if (!loomer) throw new Error("没有 Loomer");
  return loomer;
}

export function agentViews() {
  const agents = loadAgents();
  const base = agents.find((agent) => agent.id === loomerId);
  const hires = new Map(listHires().map((hire) => [hire.agentId, parseSnapshot(hire.snapshot)]));
  return agents.map((agent) => {
    const hire = hires.get(agent.id);
    const skills = hire && agent.id !== loomerId ? hire.skills : agent.skills;
    const missing = skills.filter((skill) => !isInstalledSkill(skill));
    return {
      id: agent.id,
      name: agent.name,
      summary: agent.summary,
      monthlyPrice: agent.monthlyPrice,
      included: agent.included,
      ready: missing.length === 0,
      missingSkills: missing,
      hired: agent.included || Boolean(hire),
      updateAvailable: Boolean(
        hire && base && agent.id !== loomerId && (hire.agentUpdatedAt !== agent.updatedAt || hire.baseUpdatedAt !== base.updatedAt),
      ),
    };
  });
}

export function taskPrompt(snapshot: AgentSnapshot): string {
  const lines = [snapshot.baseInstructions.trim(), "", `你正在执行交付智能体「${snapshot.name}」。`];
  if (snapshot.instructions.trim()) lines.push("", snapshot.instructions.trim());
  if (snapshot.skills.length > 0) lines.push("", `先读取这些技能并遵循：${snapshot.skills.join("、")}。`);
  return lines.join("\n");
}

export function snapshotForTask(agentId: string): AgentSnapshot {
  ensureAgents();
  const agent = getAgent(agentId);
  if (!agent) throw new RequestError("没有这个智能体");
  const snapshot = agent.id === loomerId ? snapshotOf(agent, agent) : hiredSnapshot(agent.id);
  assertReady(snapshot);
  return snapshot;
}

export function hireAgent(id: string): void {
  ensureAgents();
  const agent = getAgent(id);
  if (!agent) throw new RequestError("没有这个智能体");
  if (agent.id === loomerId) throw new RequestError("Loomer 不需要雇佣");
  const missing = missingSkills(agent);
  if (missing.length > 0) throw new RequestError(`技能还没有安装：${missing.join("、")}。请在后台安装`);
  saveHire(agent.id, JSON.stringify(snapshotOf(agent, loadLoomer())));
}

export function createManagedAgent(body: unknown): AgentRecord {
  ensureAgents();
  const agent = parseAgent(body, null);
  if (agent.id === loomerId) throw new RequestError("Loomer 不能在这里创建");
  if (getAgent(agent.id)) throw new RequestError("智能体 id 已存在");
  saveAgent("insert", agent);
  const saved = getAgent(agent.id);
  if (!saved) throw new Error("智能体没有保存");
  return saved;
}

export function updateManagedAgent(id: string, body: unknown): AgentRecord {
  ensureAgents();
  if (id === loomerId) throw new RequestError("Loomer 请在 Loomer 页面修改");
  const current = getAgent(id);
  if (!current) throw new RequestError("智能体不存在");
  const agent = parseAgent(body, id);
  saveAgent("update", agent);
  const saved = getAgent(id);
  if (!saved) throw new Error("智能体不存在");
  return saved;
}

export function updateLoomer(body: unknown): AgentRecord {
  const current = loadLoomer();
  if (!isRecord(body)) throw new RequestError("智能体无效");
  saveAgent("update", {
    ...current,
    name: requiredText(body, "name", 40),
    summary: requiredText(body, "summary", 200),
    instructions: requiredText(body, "instructions", 8000),
    skills: [],
  });
  return loadLoomer();
}

export function removeManagedAgent(id: string): void {
  ensureAgents();
  if (id === loomerId) throw new RequestError("不能删除 Loomer");
  const current = getAgent(id);
  if (!current) throw new RequestError("智能体不存在");
  if (countTasksByAgent(id) > 0) throw new RequestError("还有任务使用这个智能体");
  deleteAgentRow(id);
}

export function parseSnapshot(value: string): AgentSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("智能体快照损坏");
  }
  if (!isRecord(parsed)) throw new Error("智能体快照损坏");
  const skills = parsed.skills;
  if (!Array.isArray(skills) || skills.some((skill) => typeof skill !== "string")) throw new Error("智能体快照损坏");
  return {
    id: textField(parsed, "id"),
    name: textField(parsed, "name"),
    summary: textField(parsed, "summary"),
    monthlyPrice: typeof parsed.monthlyPrice === "number" ? parsed.monthlyPrice : 0,
    instructions: textField(parsed, "instructions"),
    skills,
    baseInstructions: textField(parsed, "baseInstructions"),
    agentUpdatedAt: textField(parsed, "agentUpdatedAt"),
    baseUpdatedAt: textField(parsed, "baseUpdatedAt"),
  };
}

function backfillTaskSnapshots(): void {
  const agents = listAgents();
  const base = agents.find((agent) => agent.id === loomerId);
  if (!base) return;
  for (const task of listTasks()) {
    if (task.snapshot) continue;
    const agent = agents.find((item) => item.id === task.agent);
    if (!agent) continue;
    saveTaskSnapshot(task.id, JSON.stringify(snapshotOf(agent, agent.id === loomerId ? agent : base)));
  }
}

function hiredSnapshot(id: string): AgentSnapshot {
  const saved = getHire(id);
  if (!saved) throw new RequestError("请先雇佣这个智能体");
  return parseSnapshot(saved);
}

function snapshotOf(agent: AgentRecord, base: AgentRecord): AgentSnapshot {
  return {
    id: agent.id,
    name: agent.name,
    summary: agent.summary,
    monthlyPrice: agent.monthlyPrice,
    instructions: agent.id === loomerId ? "" : agent.instructions,
    skills: agent.skills,
    baseInstructions: base.instructions,
    agentUpdatedAt: agent.updatedAt,
    baseUpdatedAt: base.updatedAt,
  };
}

function assertReady(snapshot: AgentSnapshot): void {
  const missing = snapshot.skills.filter((skill) => !isInstalledSkill(skill));
  if (missing.length > 0) throw new RequestError(`技能还没有安装：${missing.join("、")}。请在后台安装`);
}

function missingSkills(agent: AgentRecord): string[] {
  return agent.skills.filter((skill) => !isInstalledSkill(skill));
}

function parseAgent(body: unknown, id: string | null): AgentRecord {
  if (!isRecord(body)) throw new RequestError("智能体无效");
  const agentId = id ?? requiredText(body, "id", 32);
  if (!idPattern.test(agentId)) throw new RequestError("智能体 id 只能使用小写字母、数字和短横线");
  const monthlyPrice = body.monthlyPrice;
  if (typeof monthlyPrice !== "number" || !Number.isInteger(monthlyPrice) || monthlyPrice < 0 || monthlyPrice > 100000) {
    throw new RequestError("月费必须是 0 到 100000 的整数");
  }
  const skills = skillNames(body.skills);
  const missing = skills.filter((skill) => !isInstalledSkill(skill));
  if (missing.length > 0) throw new RequestError(`请先安装技能：${missing.join("、")}`);
  return {
    id: agentId,
    name: requiredText(body, "name", 40),
    summary: requiredText(body, "summary", 200),
    monthlyPrice,
    included: false,
    instructions: optionalText(body, "instructions", 8000) ?? "",
    skills,
    updatedAt: "",
  };
}

function skillNames(value: unknown): string[] {
  if (!Array.isArray(value)) throw new RequestError("技能无效");
  if (value.length > 20) throw new RequestError("技能过多");
  const names = value.map((item) => {
    if (typeof item !== "string") throw new RequestError("技能名称无效");
    return normalizeSkillName(item);
  });
  if (new Set(names).size !== names.length) throw new RequestError("技能重复");
  return names;
}

function requiredText(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > max) throw new RequestError(`${key}无效`);
  return value.trim();
}

function optionalText(record: Record<string, unknown>, key: string, max: number): string | null {
  if (!(key in record) || record[key] === null) return null;
  const value = record[key];
  if (typeof value !== "string") throw new RequestError(`${key}无效`);
  const text = value.trim();
  if (text.length > max) throw new RequestError(`${key}过长`);
  return text === "" ? null : text;
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loomerAgent(): AgentRecord {
  return {
    id: loomerId,
    name: "loomer",
    summary: "直接说明要做的事，在当前任务里完成。",
    monthlyPrice: 0,
    included: true,
    instructions: loomerBase,
    skills: [],
    updatedAt: "",
  };
}

function listingAgent(): AgentRecord {
  return {
    id: "listing",
    name: "电商运营",
    summary: "上传商品资料，直接得到可以上架的 Excel。",
    monthlyPrice: 199,
    included: false,
    instructions: "根据用户上传的商品资料和补充说明，整理可以上架的内容。图片用 save_image 换成地址，不要解读图片。做完就停止。",
    skills: [],
    updatedAt: "",
  };
}
