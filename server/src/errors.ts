import { getModelSettings } from "./db.js";

export class RequestError extends Error {}

export class AuthError extends Error {}

export function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const secret = getModelSettings()?.apiKey;
  if (!secret) return message;
  return message.split(secret).join("[redacted]");
}
