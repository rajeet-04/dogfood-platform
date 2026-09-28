import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

export type StoredUpload = {
  name: string;
  path: string;
  size: number;
  contentType: string;
};

export function isSupportedUpload(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}

function safeBaseName(name: string): string {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const base = path
    .basename(name, path.extname(name))
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "attachment"}${ext}`;
}

export async function saveUpload(
  file: File,
  scope: string,
): Promise<StoredUpload> {
  if (file.size === 0) {
    throw new Error("EMPTY_UPLOAD");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("UPLOAD_TOO_LARGE");
  }
  if (!isSupportedUpload(file.type)) {
    throw new Error("UPLOAD_TYPE_NOT_ALLOWED");
  }

  const dir = path.join(UPLOAD_ROOT, scope);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}-${safeBaseName(file.name)}`;
  const absolute = path.join(dir, storedName);
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));

  return {
    name: file.name,
    path: path.posix.join(scope, storedName),
    size: file.size,
    contentType: file.type,
  };
}

export function resolveUploadPath(relativePath: string): string {
  const absolute = path.resolve(UPLOAD_ROOT, relativePath);
  const root = path.resolve(UPLOAD_ROOT);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error("UPLOAD_PATH_INVALID");
  }
  return absolute;
}

export async function deleteUpload(relativePath: string): Promise<void> {
  try {
    await unlink(resolveUploadPath(relativePath));
  } catch {
    // A missing attachment should never block the surrounding workflow.
  }
}
