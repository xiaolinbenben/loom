import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getAdminUser, insertAdminUser } from "./db.js";

const username = "admin";
const keyLength = 64;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export interface AdminAccount {
  username: string;
  password?: string;
}

export function ensureAdminAccount(): AdminAccount {
  if (getAdminUser(username)) return { username };
  const password = randomBytes(18).toString("base64url");
  if (!insertAdminUser(username, hashPassword(password))) return { username };
  return { username, password };
}

export function authenticateAdmin(inputUsername: string, password: string): string | undefined {
  const user = getAdminUser(inputUsername);
  if (!user || !verifyPassword(password, user.passwordHash)) return undefined;
  return user.username;
}

export function adminAccountNotice(account: AdminAccount, whenExists: "silent" | "report"): string | undefined {
  if (account.password) return `管理员账号已创建\n用户名: ${account.username}\n密码: ${account.password}`;
  if (whenExists === "silent") return undefined;
  return `管理员账号已存在，未修改密码\n用户名: ${account.username}`;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keyLength, scryptOptions);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, hash] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, scryptOptions);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
