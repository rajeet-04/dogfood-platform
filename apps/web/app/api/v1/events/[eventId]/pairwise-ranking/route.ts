import { and, db, eq, schema, type EventRole, type EventState } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import { rankPairwiseProjects } from "@dogfood/ranking";
import { DogfoodError, z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const inputSchema = z.object({
  projectIds: z.array(z.string().trim().min(1).max(128)).min(2).max(500),
  comparisons: z.array(z.object({
    winnerProjectId: z.string().trim().min(1).max(128),
    loserProjectId: z.string().trim().min(1).max(128),
  })).min(1).max(20_000).optional(),
  maxIterations: z.number().int().min(1).max(100_000).optional(),
  tolerance: z.number().positive().max(0.01).optional(),
  priorWins: z.number().positive().max(10).optional(),
});

/** Compute a reproducible pairwise ranking without creating a score snapshot. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const [event] = await db.select({ id: schema.events.id, state: schema.events.state })
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
    const membershipRows = await db.select({ role: schema.eventMemberships.role })
      .from(schema.eventMemberships)
      .where(and(
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.isActive, true),
      ));
    requirePermission(actor, ACTION.RANKING_GENERATE, {
      eventId,
      resourceEventId: eventId,
      roles: membershipRows.map((row) => row.role) as EventRole[],
      eventState: event.state as EventState,
    });
    if (!["JUDGING", "RESULTS_READY", "PUBLISHED"].includes(event.state)) {
      throw new DogfoodError("VALIDATION_FAILED", "Pairwise ranking is available once judging has started");
    }

    const comparisons = parsed.data.comparisons ?? (await db.select({
      winnerProjectId: schema.pairwiseComparisons.winnerProjectId,
      projectAId: schema.pairwiseComparisons.projectAId,
      projectBId: schema.pairwiseComparisons.projectBId,
    }).from(schema.pairwiseComparisons).where(eq(schema.pairwiseComparisons.eventId, eventId)))
      .map((comparison) => ({
        winnerProjectId: comparison.winnerProjectId,
        loserProjectId: comparison.winnerProjectId === comparison.projectAId ? comparison.projectBId : comparison.projectAId,
      }))
      .filter((comparison) => parsed.data.projectIds.includes(comparison.winnerProjectId) && parsed.data.projectIds.includes(comparison.loserProjectId));

    const ranking = rankPairwiseProjects(
      parsed.data.projectIds,
      comparisons,
      {
        maxIterations: parsed.data.maxIterations,
        tolerance: parsed.data.tolerance,
        priorWins: parsed.data.priorWins,
      },
    );
    return json({ eventId, ranking });
  });
}
