import { readFile } from "node:fs/promises";

import { and, db, eq, schema } from "@dogfood/db";
import { requirePermission, ACTION } from "@dogfood/permissions";
import { DogfoodError } from "@dogfood/validation";

import { resolveUploadPath } from "../../../../../../../../lib/uploads";
import {
  api,
  requireApiActor,
} from "../../../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; applicationId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, applicationId } = await params;
    const actor = await requireApiActor(request);

    const rows = await db
      .select()
      .from(schema.judgeApplications)
      .where(
        and(
          eq(schema.judgeApplications.id, applicationId),
          eq(schema.judgeApplications.eventId, eventId),
        ),
      )
      .limit(1);
    const application = rows[0];
    if (!application) {
      throw new DogfoodError("NOT_FOUND", "Application not found");
    }
    if (!application.attachmentPath) {
      throw new DogfoodError("NOT_FOUND", "This application has no attachment");
    }

    const isOwner = application.userId === actor.userId;
    if (!isOwner) {
      const [event] = await db
        .select({ state: schema.events.state })
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1);
      if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

      const memberships = await db
        .select({ role: schema.eventMemberships.role })
        .from(schema.eventMemberships)
        .where(
          and(
            eq(schema.eventMemberships.eventId, eventId),
            eq(schema.eventMemberships.userId, actor.userId),
          ),
        );
      requirePermission(actor, ACTION.JUDGE_APPLICATION_MANAGE, {
        eventId,
        resourceEventId: eventId,
        roles: memberships.map((m) => m.role),
        eventState: event.state,
      });
    }

    const absolute = resolveUploadPath(application.attachmentPath);
    let bytes: Buffer;
    try {
      bytes = await readFile(absolute);
    } catch {
      throw new DogfoodError("NOT_FOUND", "Attachment file is missing");
    }

    const fileName = application.attachmentName ?? "attachment";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": application.attachmentContentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
