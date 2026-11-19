import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.FOOD4AGENT_DIR
  ? resolve(process.env.FOOD4AGENT_DIR)
  : resolve(root, "../food4agent");
const agentPath = join(root, "agents", "listing", "agent.json");
const agent = JSON.parse(readFileSync(agentPath, "utf8"));

if (!Array.isArray(agent.skills) || agent.skills.length === 0) {
  console.error("agent.json 没有要安装的技能");
  process.exit(1);
}

mkdirSync(join(root, "skills"), { recursive: true });

for (const skill of agent.skills) {
  const name = skill?.name;
  const source = skill?.source;
  if (typeof name !== "string" || typeof source !== "string") {
    console.error("agent.json 里的技能无效");
    process.exit(1);
  }
  const expected = `https://github.com/xiaolinbenben/food4agent/skills/${name}`;
  if (source !== expected) {
    console.error(`技能 ${name} 的安装地址必须是 ${expected}`);
    process.exit(1);
  }
  const from = join(sourceRoot, "skills", name);
  if (!existsSync(join(from, "SKILL.md"))) {
    console.error(`找不到技能 ${name}：${from}`);
    console.error("把 food4agent 放在 Loom 上一级目录，或设置 FOOD4AGENT_DIR。");
    process.exit(1);
  }
  const to = join(root, "skills", name);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`已安装 ${name} -> skills/${name}`);
}
