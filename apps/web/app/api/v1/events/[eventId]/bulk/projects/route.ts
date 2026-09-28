import {
  exportProjectArchive,
  importProjectArchive,
  parseProjectArchiveCsv,
  projectArchiveCsv,
} from "@dogfood/exports";
import { DogfoodError } from "@dogfood/validation";

import {
  api,
  json,
  requireApiActor,
} from "../../../../../../../server/api/http";

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;

async function readArchiveBody(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
    throw new DogfoodError("VALIDATION_FAILED", "Project archive exceeds the 10 MiB limit");
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new DogfoodError("VALIDATION_FAILED", "Project archive exceeds the 10 MiB limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const archive = await exportProjectArchive(actor, eventId);
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format === "csv") {
      return new Response(projectArchiveCsv(archive), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="projects-${eventId}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format !== "json") throw new DogfoodError("VALIDATION_FAILED", "format must be json or csv");
    return json(archive);
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const body = await readArchiveBody(request);
    const contentType = request.headers.get("content-type") ?? "";
    let payload: unknown;
    if (contentType.includes("text/csv")) {
      payload = parseProjectArchiveCsv(body, eventId);
    } else {
      try { payload = JSON.parse(body); }
      catch { throw new DogfoodError("VALIDATION_FAILED", "Request body must be valid JSON or CSV"); }
    }
    const result = await importProjectArchive(actor, eventId, payload);
    return json(result, { status: 201 });
  });
}
