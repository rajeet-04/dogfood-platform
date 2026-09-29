import { appendAuditEvent } from "@dogfood/audit";
import { and, db, eq, schema } from "@dogfood/db";
import { getJudgeQueue } from "@dogfood/judging";
import { DogfoodError, z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const choiceSchema = z.object({
  winnerProjectId: z.string().uuid(),
  loserProjectId: z.string().uuid(),
}).refine((value) => value.winnerProjectId !== value.loserProjectId, {
  message: "Choose two different projects",
});

async function loadJudgingEvent(eventId: string, write = false) {
  const [event] = await db.select({ id: schema.events.id, state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  if (write ? event.state !== "JUDGING" : !["JUDGING", "RESULTS_READY", "PUBLISHED"].includes(event.state)) {
    throw new DogfoodError("CONFLICT", "Pairwise comparisons are available while judging is open");
  }
  return event;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    await loadJudgingEvent(eventId);
    const actor = await requireApiActor(request);
    const queue = await getJudgeQueue(actor, eventId);
    const comparisons = await db.select({
      winnerProjectId: schema.pairwiseComparisons.winnerProjectId,
      projectAId: schema.pairwiseComparisons.projectAId,
      projectBId: schema.pairwiseComparisons.projectBId,
    }).from(schema.pairwiseComparisons).where(and(
      eq(schema.pairwiseComparisons.eventId, eventId),
      eq(schema.pairwiseComparisons.judgeId, actor.userId),
    ));

    return json({
      projects: queue.map(({ project }) => ({ id: project.projectId, title: project.currentRevision.title })),
      comparisons: comparisons.map((comparison) => ({
        winnerProjectId: comparison.winnerProjectId,
        loserProjectId: comparison.winnerProjectId === comparison.projectAId ? comparison.projectBId : comparison.projectAId,
      })),
    });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    await loadJudgingEvent(eventId, true);
    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = choiceSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    // The existing queue applies both judge assignment and track-scope checks.
    const queue = await getJudgeQueue(actor, eventId);
    const assignedProjectIds = new Set(queue.map(({ project }) => project.projectId));
    const { winnerProjectId, loserProjectId } = parsed.data;
    if (!assignedProjectIds.has(winnerProjectId) || !assignedProjectIds.has(loserProjectId)) {
      throw new DogfoodError("FORBIDDEN", "Both projects must be assigned to you");
    }
    const [projectAId, projectBId] = [winnerProjectId, loserProjectId].sort();
    const comparison = await db.transaction(async (tx) => {
      const [saved] = await tx.insert(schema.pairwiseComparisons).values({
        eventId,
        judgeId: actor.userId,
        projectAId,
        projectBId,
        winnerProjectId,
      }).onConflictDoUpdate({
        target: [
          schema.pairwiseComparisons.eventId,
          schema.pairwiseComparisons.judgeId,
          schema.pairwiseComparisons.projectAId,
          schema.pairwiseComparisons.projectBId,
        ],
        set: { winnerProjectId, updatedAt: new Date() },
      }).returning({
        winnerProjectId: schema.pairwiseComparisons.winnerProjectId,
        projectAId: schema.pairwiseComparisons.projectAId,
        projectBId: schema.pairwiseComparisons.projectBId,
      });
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "pairwise.compare",
        resourceType: "pairwise_comparison",
        metadata: { winnerProjectId, loserProjectId },
      });
      return saved;
    });

    return json({
      comparison: {
        winnerProjectId: comparison.winnerProjectId,
        loserProjectId: comparison.winnerProjectId === comparison.projectAId ? comparison.projectBId : comparison.projectAId,
      },
    });
  });
}
