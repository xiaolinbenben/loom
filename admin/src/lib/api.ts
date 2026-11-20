export type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

export interface ModelSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface StorageSettings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  retentionDays: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || !payload.success) throw new Error(payload.message || "请求失败");
  return payload;
}

export function fetchSession(): Promise<Envelope<{ username: string }>> {
  return request("/api/admin/session");
}

export function login(username: string, password: string): Promise<Envelope<{ username: string }>> {
  return request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<Envelope<Record<string, never>>> {
  return request("/api/admin/logout", { method: "POST" });
}

export function fetchSettings(): Promise<Envelope<ModelSettings>> {
  return request("/api/admin/settings");
}

export function saveSettings(settings: ModelSettings): Promise<Envelope<ModelSettings>> {
  return request("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export function fetchStorage(): Promise<Envelope<StorageSettings>> {
  return request("/api/admin/storage");
}

export function saveStorage(settings: StorageSettings): Promise<Envelope<StorageSettings>> {
  return request("/api/admin/storage", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export interface ManagedAgent {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  included: boolean;
  instructions: string;
  skills: string[];
}

export interface InstalledSkill {
  name: string;
  description: string;
  agents: { id: string; name: string }[];
}

export function fetchLoomer(): Promise<Envelope<ManagedAgent>> {
  return request("/api/admin/loomer");
}

export function saveLoomer(agent: Pick<ManagedAgent, "name" | "summary" | "instructions">): Promise<Envelope<ManagedAgent>> {
  return request("/api/admin/loomer", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
}

export function fetchAgents(): Promise<Envelope<ManagedAgent[]>> {
  return request("/api/admin/agents");
}

export function createAgent(agent: ManagedAgent): Promise<Envelope<ManagedAgent>> {
  return request("/api/admin/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
}

export function updateAgent(id: string, agent: ManagedAgent): Promise<Envelope<ManagedAgent>> {
  return request(`/api/admin/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
}

export function deleteAgent(id: string): Promise<Envelope<Record<string, never>>> {
  return request(`/api/admin/agents/${id}`, { method: "DELETE" });
}

export function fetchSkills(): Promise<Envelope<InstalledSkill[]>> {
  return request("/api/admin/skills");
}

export function installSkill(name: string): Promise<Envelope<InstalledSkill>> {
  return request("/api/admin/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function uninstallSkill(name: string): Promise<Envelope<Record<string, never>>> {
  return request(`/api/admin/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
}
