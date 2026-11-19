import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dataDirFromEnv = process.env.LOOM_DATA_DIR;
export const dataDir = dataDirFromEnv ? resolve(dataDirFromEnv) : join(repoRoot, "data");
export const agentDir = join(dataDir, "agent");
export const sessionDir = join(dataDir, "sessions");
export const workspaceRoot = join(dataDir, "workspaces");
export const databasePath = join(dataDir, "loom.sqlite");
export const modelsPath = join(agentDir, "models.json");
export const skillsRoot = join(repoRoot, "skills");
export const agentsRoot = join(repoRoot, "agents");

export function promptTemplatePath(agentId: string): string {
  return join(agentsRoot, agentId, "prompts", `${agentId}.md`);
}

export interface ModelSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const defaultRetentionDays = 14;

export interface StorageSettings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  retentionDays: number;
}

export function writeModelsFile(config: ModelSettings): void {
  mkdirSync(agentDir, { recursive: true });
  const document = {
    providers: {
      terln: {
        name: "图灵",
        baseUrl: config.baseUrl,
        api: "openai-completions",
        apiKey: config.apiKey,
        models: [{ id: config.model }],
      },
    },
  };
  writeFileSync(modelsPath, `${JSON.stringify(document, null, 2)}\n`);
}
