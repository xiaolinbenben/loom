import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { food4agentRoot, skillsRoot } from "./config.js";
import { listAgents } from "./db.js";
import { RequestError } from "./errors.js";

const skillNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

export interface InstalledSkill {
  name: string;
  description: string;
  agents: { id: string; name: string }[];
}

export function normalizeSkillName(name: string): string {
  const skillName = name.trim();
  if (!skillNamePattern.test(skillName)) throw new RequestError("技能名称无效");
  return skillName;
}

export function isInstalledSkill(name: string): boolean {
  return existsSync(join(skillsRoot, name, "SKILL.md"));
}

export function listInstalledSkills(): InstalledSkill[] {
  if (!existsSync(skillsRoot)) return [];
  const agents = listAgents();
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => ({
      name: entry.name,
      description: skillDescription(join(skillsRoot, entry.name, "SKILL.md")),
      agents: assignedAgents(entry.name, agents),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function installSkill(name: string): InstalledSkill {
  const skillName = normalizeSkillName(name);
  const from = join(food4agentRoot(), "skills", skillName);
  if (!existsSync(join(from, "SKILL.md"))) {
    throw new RequestError(`找不到技能 ${skillName}：${from}。把 food4agent 放在 Loom 上一级目录，或设置 FOOD4AGENT_DIR。`);
  }
  const to = join(skillsRoot, skillName);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  return {
    name: skillName,
    description: skillDescription(join(to, "SKILL.md")),
    agents: assignedAgents(skillName),
  };
}

export function uninstallSkill(name: string): void {
  const skillName = normalizeSkillName(name);
  const usedBy = assignedAgents(skillName);
  if (usedBy.length > 0) throw new RequestError(`技能仍被使用：${usedBy.map((agent) => agent.name).join("、")}`);
  const path = join(skillsRoot, skillName);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new RequestError("技能还没有安装");
  rmSync(path, { recursive: true, force: true });
}

function assignedAgents(skillName: string, agents = listAgents()): { id: string; name: string }[] {
  return agents
    .filter((agent) => agent.skills.includes(skillName))
    .map((agent) => ({ id: agent.id, name: agent.name }));
}

function skillDescription(path: string): string {
  const text = readFileSync(path, "utf8");
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const body = front?.[1];
  if (!body) return "";
  const line = body.split(/\r?\n/).find((item) => item.startsWith("description:"));
  if (!line) return "";
  return line.slice("description:".length).trim().replace(/^["']|["']$/g, "");
}
