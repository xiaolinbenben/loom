import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { createTaskSession, toolDetail, toolLabel } from "./agent.js";
import { parseSnapshot, snapshotForTask, taskPrompt } from "./catalog.js";
import { workspaceRoot } from "./config.js";
import { getModelSettings, getStorageSettings, getTask, insertTask, updateTask, type Task, type TaskStatus } from "./db.js";
import { publicError, RequestError } from "./errors.js";
import { isImageFile } from "./storage.js";

export interface ProgressEvent {
  type: "status" | "text" | "tool";
  status?: TaskStatus;
  error?: string | null;
  text?: string;
  label?: string;
  detail?: string;
}

const sessions = new Map<string, AgentSession>();
const buffers = new Map<string, ProgressEvent[]>();
const listeners = new Map<string, Set<(event: ProgressEvent) => void>>();
const queues = new Map<string, Promise<unknown>>();

export function taskView(task: Task) {
  return {
    id: task.id,
    status: task.status,
    agent: task.agent,
    createdAt: task.createdAt,
    error: task.error,
  };
}

function publish(taskId: string, event: ProgressEvent): void {
  const buffer = buffers.get(taskId) ?? [];
  buffer.push(event);
  if (buffer.length > 400) buffer.splice(0, buffer.length - 400);
  buffers.set(taskId, buffer);
  for (const listener of listeners.get(taskId) ?? []) listener(event);
}

export function bufferedEvents(taskId: string): ProgressEvent[] {
  return [...(buffers.get(taskId) ?? [])];
}

export function subscribe(taskId: string, listener: (event: ProgressEvent) => void): () => void {
  const group = listeners.get(taskId) ?? new Set();
  group.add(listener);
  listeners.set(taskId, group);
  return () => group.delete(listener);
}

export function statusEvent(task: Task): ProgressEvent {
  return {
    type: "status",
    status: task.status,
    error: task.error,
  };
}

export async function createTask(files: File[], note: string, agentId: string): Promise<Task> {
  requireModelSettings();
  const text = note.trim();
  const requestedAgent = agentId.trim();
  if (!requestedAgent) throw new RequestError("请选择智能体");
  if (files.length === 0 && !text) throw new RequestError("请上传资料或填写要做的事");
  if (files.length > 20) throw new RequestError("一次最多上传 20 个文件");
  for (const file of files) {
    if (file.size > 32 * 1024 * 1024) throw new RequestError(`${file.name} 超过 32MB`);
  }
  if (files.some((file) => isImageFile(file.name)) && !getStorageSettings()) {
    throw new RequestError("请先在后台配置对象存储");
  }
  const snapshot = snapshotForTask(requestedAgent);
  const id = randomUUID();
  const workspace = join(workspaceRoot, id);
  const input = join(workspace, "input");
  mkdirSync(input, { recursive: true });
  mkdirSync(join(workspace, "output"), { recursive: true });
  for (const file of files) {
    const target = join(input, uniqueName(input, fileName(file.name)));
    writeFileSync(target, Buffer.from(await file.arrayBuffer()));
  }
  if (text) writeFileSync(join(input, "note.txt"), text);
  const now = new Date().toISOString();
  const task: Task = {
    id,
    status: "running",
    workspace,
    sessionPath: null,
    agent: snapshot.id,
    createdAt: now,
    updatedAt: now,
    error: null,
    snapshot: JSON.stringify(snapshot),
  };
  insertTask(task);
  publish(id, statusEvent(task));
  void enqueue(id, () => runPrompt(id, taskPrompt(snapshot))).catch((error: unknown) => {
    console.error(publicError(error));
  });
  return task;
}

export function continueTask(id: string, text: string): Task {
  requireModelSettings();
  const task = getTask(id);
  if (!task) throw new RequestError("任务不存在");
  const note = text.trim();
  if (!note) throw new RequestError("请填写要继续说明的内容");
  if (note.length > 8000) throw new RequestError("补充说明过长");
  appendNote(task.workspace, note);
  const running = updateTask(id, { status: "running", error: null });
  publish(id, statusEvent(running));
  void enqueue(id, () => runPrompt(id, note)).catch((error: unknown) => {
    console.error(publicError(error));
  });
  return running;
}

async function runPrompt(id: string, prompt: string): Promise<void> {
  const task = getTask(id);
  if (!task) return;
  try {
    const session = await sessionFor(task);
    await session.prompt(prompt);
    const assistantError = lastAssistantError(session);
    const finished = updateTask(id, {
      status: assistantError ? "failed" : "succeeded",
      error: assistantError ? publicError(assistantError).slice(0, 500) : null,
    });
    publish(id, statusEvent(finished));
  } catch (error) {
    const failed = updateTask(id, { status: "failed", error: publicError(error).slice(0, 500) });
    publish(id, statusEvent(failed));
  }
}

async function sessionFor(task: Task): Promise<AgentSession> {
  const existing = sessions.get(task.id);
  if (existing) return existing;
  const session = await createTaskSession(task.workspace, task.id, parseSnapshot(task.snapshot).skills, task.sessionPath ?? undefined);
  const sessionPath = session.sessionFile;
  if (!sessionPath) throw new Error("Pi 没有创建 session 文件");
  updateTask(task.id, { status: "running", error: null, sessionPath });
  session.subscribe((event) => {
    try {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        publish(task.id, { type: "text", text: event.assistantMessageEvent.delta });
        return;
      }
      if (event.type === "tool_execution_start") {
        publish(task.id, {
          type: "tool",
          label: toolLabel(event.toolName),
          detail: toolDetail(event.toolName, event.args),
        });
      }
    } catch (error) {
      console.error(publicError(error));
    }
  });
  sessions.set(task.id, session);
  return session;
}

function lastAssistantError(session: AgentSession): string | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (!message || message.role !== "assistant") continue;
    const errorMessage = "errorMessage" in message ? message.errorMessage : undefined;
    return typeof errorMessage === "string" && errorMessage ? errorMessage : null;
  }
  return null;
}

function enqueue(taskId: string, job: () => Promise<void>): Promise<void> {
  const previous = queues.get(taskId) ?? Promise.resolve();
  const next = previous.then(job, job);
  queues.set(taskId, next);
  return next;
}

function appendNote(workspace: string, note: string): void {
  const path = join(workspace, "input", "note.txt");
  const previous = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  writeFileSync(path, previous ? `${previous}\n\n${note}` : note);
}

function fileName(name: string): string {
  const base = name.replaceAll("\\", "/").split("/").pop()?.trim() || "file";
  return base === "." || base === ".." ? "file" : base;
}

function uniqueName(directory: string, name: string): string {
  if (!existsSync(join(directory, name))) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (existsSync(join(directory, `${stem}-${index}${ext}`))) index += 1;
  return `${stem}-${index}${ext}`;
}

function requireModelSettings(): void {
  if (!getModelSettings()) throw new RequestError("请先在后台配置图灵 API");
}
