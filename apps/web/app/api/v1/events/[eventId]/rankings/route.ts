import { and, db, desc, eq, schema } from "@dogfood/db";
import { generateRankingSnapshot } from "@dogfood/ranking";
import { DogfoodError, z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const rankingConfigSchema = z.object({
  normalizationStrategy: z.enum(["z-score", "none"]).default("z-score"),
  minimumBatchSize: z.number().int().min(0).max(1000).default(1),
  tieBreakers: z
    .enum(["secondary-score", "project-id"])
    .array()
    .max(8)
    .default(["secondary-score", "project-id"]),
});

type StoredSnapshot = typeof schema.rankingSnapshots.$inferSelect;

function toSnapshotSummary(row: StoredSnapshot) {
  return {
    id: row.id,
    eventId: row.eventId,
    scoringVersion: row.scoringVersion,
    normalizationVersion: row.normalizationVersion,
    rankingVersion: row.rankingVersion,
    generatedBy: row.generatedBy,
    generatedAt: new Date(row.generatedAt).toISOString(),
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = rankingConfigSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const snapshot = await generateRankingSnapshot(actor, eventId, parsed.data);
    return json({ snapshot }, { status: 201 });
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const actor = await requireApiActor(request);
    const [event] = await db
      .select({ createdBy: schema.events.createdBy })
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    if (!event) {
      throw new DogfoodError("NOT_FOUND", "Event not found");
    }

    const isOrganizer = actor.isPlatformAdmin || event.createdBy === actor.userId;
    const [membership] = await db
      .select({ role: schema.eventMemberships.role })
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, eventId),
          eq(schema.eventMemberships.userId, actor.userId),
        ),
      )
      .limit(1);
    if (!isOrganizer && membership?.role !== "ORGANIZER") {
      throw new DogfoodError("FORBIDDEN", "Only organizers can list ranking snapshots");
    }

    const rows = await db
      .select()
      .from(schema.rankingSnapshots)
      .where(eq(schema.rankingSnapshots.eventId, eventId))
      .orderBy(desc(schema.rankingSnapshots.generatedAt));

    return json({ items: rows.map(toSnapshotSummary) });
  });
}