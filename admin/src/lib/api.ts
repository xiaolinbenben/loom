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
  if (!response.ok || !payload.success) {
    const error = new Error(payload.message || "请求失败") as Error & { status: number };
    error.status = response.status;
    throw error;
  }
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
