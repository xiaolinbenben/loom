import { getModelSettings, getStorageSettings } from "./db.js";

export class RequestError extends Error {}

export class AuthError extends Error {}

export function publicError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [getModelSettings()?.apiKey, getStorageSettings()?.secretAccessKey]) {
    if (!secret || secret.length < 8) continue;
    message = message.split(secret).join("[redacted]");
  }
  return message;
}
