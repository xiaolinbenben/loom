import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dataDir, databasePath, type ModelSettings, type StorageSettings } from "./config.js";

export type TaskStatus = "running" | "succeeded" | "failed";

export interface Task {
  id: string;
  status: TaskStatus;
  workspace: string;
  sessionPath: string | null;
  agent: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface TaskRow {
  id: string;
  status: TaskStatus;
  workspace: string;
  session_path: string | null;
  skill: string;
  created_at: string;
  updated_at: string;
  error: string | null;
}

mkdirSync(dataDir, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  create table if not exists tasks (
    id text primary key,
    status text not null,
    workspace text not null,
    session_path text,
    skill text not null,
    created_at text not null,
    updated_at text not null,
    error text
  )
`);
database.exec(`
  create table if not exists model_settings (
    id integer primary key check (id = 1),
    api_key text not null,
    base_url text not null,
    model text not null,
    updated_at text not null
  );
  create table if not exists admin_sessions (
    token text primary key,
    username text not null,
    created_at text not null
  );
  create table if not exists admin_users (
    username text primary key,
    password_hash text not null,
    created_at text not null
  );
  create table if not exists storage_settings (
    id integer primary key check (id = 1),
    endpoint text not null,
    region text not null,
    bucket text not null,
    access_key_id text not null,
    secret_access_key text not null,
    retention_days integer not null,
    updated_at text not null
  )
`);

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    status: row.status,
    workspace: row.workspace,
    sessionPath: row.session_path,
    agent: row.skill,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  };
}

export function markInterruptedTasks(): void {
  database
    .prepare("update tasks set status = 'failed', error = '服务已重启，任务中断', updated_at = ? where status = 'running'")
    .run(new Date().toISOString());
}

export function insertTask(task: Task): void {
  database
    .prepare(
      `insert into tasks (id, status, workspace, session_path, skill, created_at, updated_at, error)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(task.id, task.status, task.workspace, task.sessionPath, task.agent, task.createdAt, task.updatedAt, task.error);
}

export function getTask(id: string): Task | undefined {
  const row = database.prepare("select * from tasks where id = ?").get(id) as TaskRow | undefined;
  return row ? mapTask(row) : undefined;
}

export function listTasks(): Task[] {
  const rows = database.prepare("select * from tasks order by created_at desc").all() as unknown as TaskRow[];
  return rows.map(mapTask);
}

export function updateTask(id: string, patch: { status: TaskStatus; error: string | null; sessionPath?: string | null }): Task {
  const current = getTask(id);
  if (!current) throw new Error("任务不存在");
  const updatedAt = new Date().toISOString();
  const sessionPath = patch.sessionPath === undefined ? current.sessionPath : patch.sessionPath;
  database
    .prepare("update tasks set status = ?, error = ?, session_path = ?, updated_at = ? where id = ?")
    .run(patch.status, patch.error, sessionPath, updatedAt, id);
  return { ...current, status: patch.status, error: patch.error, sessionPath, updatedAt };
}

interface ModelSettingsRow {
  api_key: string;
  base_url: string;
  model: string;
}

export function getModelSettings(): ModelSettings | undefined {
  const row = database.prepare("select api_key, base_url, model from model_settings where id = 1").get() as ModelSettingsRow | undefined;
  if (!row) return undefined;
  return { apiKey: row.api_key, baseUrl: row.base_url, model: row.model };
}

export function saveModelSettings(settings: ModelSettings): void {
  database
    .prepare(
      `insert into model_settings (id, api_key, base_url, model, updated_at)
       values (1, ?, ?, ?, ?)
       on conflict(id) do update set api_key = excluded.api_key, base_url = excluded.base_url, model = excluded.model, updated_at = excluded.updated_at`,
    )
    .run(settings.apiKey, settings.baseUrl, settings.model, new Date().toISOString());
}

interface StorageSettingsRow {
  endpoint: string;
  region: string;
  bucket: string;
  access_key_id: string;
  secret_access_key: string;
  retention_days: number;
}

export function getStorageSettings(): StorageSettings | undefined {
  const row = database.prepare(
    "select endpoint, region, bucket, access_key_id, secret_access_key, retention_days from storage_settings where id = 1",
  ).get() as StorageSettingsRow | undefined;
  if (!row) return undefined;
  return {
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key,
    retentionDays: row.retention_days,
  };
}

export function saveStorageSettings(settings: StorageSettings): void {
  database
    .prepare(
      `insert into storage_settings (id, endpoint, region, bucket, access_key_id, secret_access_key, retention_days, updated_at)
       values (1, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         endpoint = excluded.endpoint,
         region = excluded.region,
         bucket = excluded.bucket,
         access_key_id = excluded.access_key_id,
         secret_access_key = excluded.secret_access_key,
         retention_days = excluded.retention_days,
         updated_at = excluded.updated_at`,
    )
    .run(
      settings.endpoint,
      settings.region,
      settings.bucket,
      settings.accessKeyId,
      settings.secretAccessKey,
      settings.retentionDays,
      new Date().toISOString(),
    );
}

export function createAdminSession(token: string, username: string): void {
  database.prepare("insert into admin_sessions (token, username, created_at) values (?, ?, ?)").run(token, username, new Date().toISOString());
}

export function getAdminSession(token: string): { username: string } | undefined {
  return database.prepare("select username from admin_sessions where token = ?").get(token) as { username: string } | undefined;
}

export function deleteAdminSession(token: string): void {
  database.prepare("delete from admin_sessions where token = ?").run(token);
}

export function getAdminUser(username: string): { username: string; passwordHash: string } | undefined {
  const row = database.prepare("select username, password_hash from admin_users where username = ?").get(username) as
    | { username: string; password_hash: string }
    | undefined;
  if (!row) return undefined;
  return { username: row.username, passwordHash: row.password_hash };
}

export function insertAdminUser(username: string, passwordHash: string): boolean {
  const result = database
    .prepare(
      `insert into admin_users (username, password_hash, created_at) values (?, ?, ?)
       on conflict(username) do nothing`,
    )
    .run(username, passwordHash, new Date().toISOString());
  return Number(result.changes) === 1;
}
