import { realpathSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { StorageSettings } from "./config.js";
import { getStorageSettings } from "./db.js";

const imageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const maxImageBytes = 32 * 1024 * 1024;

export function isImageFile(name: string): boolean {
  return Object.hasOwn(imageTypes, extension(name));
}

export function saveImageTool(workspace: string, taskId: string) {
  return defineTool({
    name: "save_image",
    label: "保存图片",
    description: "把当前任务工作区里的一张图片上传到对象存储，返回可写入表格的地址和过期时间。",
    promptSnippet: "保存工作区图片并返回地址",
    promptGuidelines: [
      "input/ 里的每张图片都调用 save_image。图片文件列填写返回的 url，不要解读图片内容，也不要只写文件名。",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "工作区内的图片路径，例如 input/photo.jpg" }),
    }),
    async execute(_toolCallId, params) {
      const saved = await saveWorkspaceImage(workspace, taskId, params.path);
      return {
        content: [{
          type: "text" as const,
          text: `已保存 ${saved.file}\nurl: ${saved.url}\nexpiresAt: ${saved.expiresAt}`,
        }],
        details: saved,
      };
    },
  });
}

export async function sweepExpiredImages(): Promise<void> {
  const settings = getStorageSettings();
  if (!settings) return;
  const cutoff = Date.now() - settings.retentionDays * 86_400_000;
  await withClient(settings, async (client) => {
    let continuationToken: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: settings.bucket,
        Prefix: "images/",
        ContinuationToken: continuationToken,
      }));
      const keys = (page.Contents ?? [])
        .filter((item) => item.Key && item.LastModified && item.LastModified.getTime() <= cutoff)
        .map((item) => item.Key as string);
      await removeObjects(client, settings.bucket, keys);
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  });
}

async function saveWorkspaceImage(workspace: string, taskId: string, inputPath: string): Promise<{
  file: string;
  url: string;
  expiresAt: string;
}> {
  const root = realpathSync(resolve(workspace));
  const path = workspaceFile(root, workspace, inputPath);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error("只能保存图片文件");
  if (stat.size > maxImageBytes) throw new Error("图片超过 32MB");
  if (!isImageFile(path)) throw new Error("只能保存图片文件");
  const settings = getStorageSettings();
  if (!settings) throw new Error("请先在后台配置对象存储");
  const file = relative(root, path).split(sep).join("/");
  const key = `images/${taskId}/${file}`;
  await withClient(settings, async (client) => {
    await client.send(new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: readFileSync(path),
      ContentType: imageTypes[extension(path)],
    }));
  });
  return {
    file,
    url: objectUrl(settings, key),
    expiresAt: new Date(Date.now() + settings.retentionDays * 86_400_000).toISOString(),
  };
}

function workspaceFile(root: string, workspace: string, inputPath: string): string {
  let real: string;
  try {
    real = realpathSync(resolve(workspace, inputPath));
  } catch {
    throw new Error("图片不存在");
  }
  if (!inside(root, real)) throw new Error("只能保存当前任务工作区里的图片");
  return real;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function objectUrl(settings: StorageSettings, key: string): string {
  const encodedKey = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return new URL(`${encodeURIComponent(settings.bucket)}/${encodedKey}`, `${settings.endpoint}/`).href;
}

function clientFor(settings: StorageSettings): S3Client {
  return new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
}

async function withClient<T>(settings: StorageSettings, run: (client: S3Client) => Promise<T>): Promise<T> {
  const client = clientFor(settings);
  try {
    return await run(client);
  } finally {
    client.destroy();
  }
}

async function removeObjects(client: S3Client, bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const result = await client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: keys.map((Key) => ({ Key })) },
  }));
  const failed = result.Errors ?? [];
  if (failed.length > 0) throw new Error(`删除对象失败：${failed.map((item) => item.Key ?? "").filter(Boolean).join("、")}`);
}

function extension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}
