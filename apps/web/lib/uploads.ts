import { createHash, randomUUID } from "node:crypto";
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

export type StoredProjectImage = StoredUpload & { sha256: string };

function imageContentType(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/** Store an image under its owning event after checking the bytes, not the filename or MIME claim. */
export async function saveProjectImage(file: File, eventId: string): Promise<StoredProjectImage> {
  if (file.size === 0) throw new Error("EMPTY_UPLOAD");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("UPLOAD_TOO_LARGE");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("UPLOAD_TOO_LARGE");
  const contentType = imageContentType(bytes);
  if (!contentType) throw new Error("UPLOAD_TYPE_NOT_ALLOWED");

  const scope = path.posix.join("events", eventId, "images");
  const name = `${randomUUID()}.${contentType === "image/png" ? "png" : "jpg"}`;
  const relativePath = path.posix.join(scope, name);
  const absolute = resolveUploadPath(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await writeFile(absolute, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      await deleteUpload(relativePath);
    }
    throw error;
  }
  return {
    name: file.name,
    path: relativePath,
    size: bytes.length,
    contentType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

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
