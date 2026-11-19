import { randomBytes } from "node:crypto";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { writeModelsFile, type ModelSettings } from "./config.js";
import { createAdminSession, deleteAdminSession, getAdminSession, getModelSettings, saveModelSettings } from "./db.js";
import { AuthError, publicError, RequestError } from "./errors.js";

const adminUsername = "admin";
const adminPassword = "admin123";
const cookieName = "loom_admin";

export function registerAdmin(app: Hono): void {
  app.post("/api/admin/login", admin(async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const username = field(body, "username");
    const password = field(body, "password");
    if (username !== adminUsername || password !== adminPassword) throw new AuthError("账号或密码错误");
    const token = randomBytes(32).toString("hex");
    createAdminSession(token, adminUsername);
    setCookie(c, cookieName, token, { httpOnly: true, path: "/", sameSite: "Lax" });
    return ok(c, { username: adminUsername });
  }));

  app.get("/api/admin/session", admin(async (c) => ok(c, { username: currentAdmin(c) })));

  app.post("/api/admin/logout", admin(async (c) => {
    const token = getCookie(c, cookieName);
    if (token) deleteAdminSession(token);
    deleteCookie(c, cookieName, { path: "/" });
    return ok(c, {});
  }));

  app.get("/api/admin/settings", admin(async (c) => {
    currentAdmin(c);
    return ok(c, getModelSettings() ?? { apiKey: "", baseUrl: "", model: "" });
  }));

  app.put("/api/admin/settings", admin(async (c) => {
    currentAdmin(c);
    const body: unknown = await c.req.json().catch(() => null);
    const settings = parseModelSettings(body);
    saveModelSettings(settings);
    writeModelsFile(settings);
    return ok(c, settings, "已保存");
  }));
}

function currentAdmin(c: Context): string {
  const token = getCookie(c, cookieName);
  if (!token) throw new AuthError("未登录");
  const session = getAdminSession(token);
  if (!session) throw new AuthError("未登录");
  return session.username;
}

function parseModelSettings(body: unknown): ModelSettings {
  const apiKey = field(body, "apiKey");
  const baseUrl = field(body, "baseUrl");
  const model = field(body, "model");
  if (!apiKey) throw new RequestError("请填写 API Key");
  if (!baseUrl) throw new RequestError("请填写 Base URL");
  if (!model) throw new RequestError("请填写模型 ID");
  if (apiKey.length > 500 || baseUrl.length > 300 || model.length > 200) throw new RequestError("配置过长");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new RequestError("Base URL 不是合法 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RequestError("Base URL 必须是 http 或 https");
  return { apiKey, baseUrl, model };
}

function field(body: unknown, name: string): string {
  if (typeof body !== "object" || body === null || !(name in body)) return "";
  const value = (body as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

function ok(c: Context, data: unknown, message = ""): Response {
  return c.json({ success: true, message, data });
}

function admin(handler: (c: Context) => Promise<Response>): (c: Context) => Promise<Response> {
  return async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      const message = publicError(error);
      const status = error instanceof AuthError ? 401 : error instanceof RequestError ? 400 : 500;
      if (status === 500) console.error(message);
      return c.json({ success: false, message, data: null }, status);
    }
  };
}
