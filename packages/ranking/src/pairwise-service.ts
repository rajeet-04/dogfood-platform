import { and, db, desc, eq, inArray, isNotNull, isNull, schema, sql, type EventState } from "@dogfood/db";
import { appendAuditEvent } from "@dogfood/audit";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { canRunRanking } from "./service";
import { rankPairwiseProjects, type PairwiseComparison, type PairwiseRanking, type PairwiseRankingOptions } from "./pairwise";

export const PAIRWISE_RANKING_VERSION = "bradley-terry-mm-v1";

export type PairwiseSnapshotInput = {
  projectIds: string[];
  comparisons: Array<{
    comparisonId: string;
    judgeId: string;
    projectAId: string;
    projectBId: string;
    winnerProjectId: string;
    loserProjectId: string;
    updatedAt: string;
  }>;
};

export type PairwiseRankingSnapshot = {
  id: string;
  eventId: string;
  algorithmVersion: string;
  configuration: Required<PairwiseRankingOptions>;
  input: PairwiseSnapshotInput;
  results: PairwiseRanking;
  generatedBy: string;
  generatedAt: Date;
  publishedAt: Date | null;
  supersedesSnapshotId: string | null;
};

type SnapshotRow = typeof schema.pairwiseRankingSnapshots.$inferSelect;

function toSnapshot(row: SnapshotRow): PairwiseRankingSnapshot {
  return {
    id: row.id,
    eventId: row.eventId,
    algorithmVersion: row.algorithmVersion,
    configuration: row.configuration as Required<PairwiseRankingOptions>,
    input: row.input as unknown as PairwiseSnapshotInput,
    results: row.results as unknown as PairwiseRanking,
    generatedBy: row.generatedBy,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt,
    supersedesSnapshotId: row.supersedesSnapshotId,
  };
}

async function authorizeOrganizer(actor: Actor, eventId: string, state: EventState) {
  const memberships = await db.select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(and(
      eq(schema.eventMemberships.eventId, eventId),
      eq(schema.eventMemberships.userId, actor.userId),
      eq(schema.eventMemberships.isActive, true),
    ));
  requirePermission(actor, ACTION.RANKING_GENERATE, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map(({ role }) => role),
    eventState: state,
  });
}

async function eventForRanking(eventId: string) {
  const [event] = await db.select({ id: schema.events.id, state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  if (!canRunRanking(event.state as EventState)) {
    throw new DogfoodError("VALIDATION_FAILED", "Pairwise rankings can only be generated once judging has started");
  }
  return event;
}

export async function generatePairwiseRankingSnapshot(
  actor: Actor,
  eventId: string,
  requestedProjectIds: string[] | undefined,
  options: PairwiseRankingOptions = {},
): Promise<PairwiseRankingSnapshot> {
  const event = await eventForRanking(eventId);
  await authorizeOrganizer(actor, eventId, event.state as EventState);

  const requested = requestedProjectIds?.length ? [...new Set(requestedProjectIds)].sort() : undefined;
  if (requestedProjectIds && requested?.length !== requestedProjectIds.length) {
    throw new DogfoodError("VALIDATION_FAILED", "Project IDs must be unique");
  }
  const projects = await db.select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(
      eq(schema.projects.eventId, eventId),
      inArray(schema.projects.state, ["SUBMITTED", "LOCKED"]),
      ...(requested ? [inArray(schema.projects.id, requested)] : []),
    ));
  const projectIds = projects.map(({ id }) => id).sort();
  if (requested && projectIds.length !== requested.length) {
    throw new DogfoodError("VALIDATION_FAILED", "Every listed project must be submitted to this event");
  }

  const rows = await db.select({
    id: schema.pairwiseComparisons.id,
    judgeId: schema.pairwiseComparisons.judgeId,
    projectAId: schema.pairwiseComparisons.projectAId,
    projectBId: schema.pairwiseComparisons.projectBId,
    winnerProjectId: schema.pairwiseComparisons.winnerProjectId,
    updatedAt: schema.pairwiseComparisons.updatedAt,
  }).from(schema.pairwiseComparisons).where(and(
    eq(schema.pairwiseComparisons.eventId, eventId),
    inArray(schema.pairwiseComparisons.projectAId, projectIds),
    inArray(schema.pairwiseComparisons.projectBId, projectIds),
  ));

  const comparisons = rows.map((row) => ({
    comparisonId: row.id,
    judgeId: row.judgeId,
    projectAId: row.projectAId,
    projectBId: row.projectBId,
    winnerProjectId: row.winnerProjectId,
    loserProjectId: row.winnerProjectId === row.projectAId ? row.projectBId : row.projectAId,
    updatedAt: row.updatedAt.toISOString(),
  })).sort((a, b) =>
    a.projectAId.localeCompare(b.projectAId) ||
    a.projectBId.localeCompare(b.projectBId) ||
    a.judgeId.localeCompare(b.judgeId) ||
    a.comparisonId.localeCompare(b.comparisonId),
  );
  const configuration: Required<PairwiseRankingOptions> = {
    maxIterations: options.maxIterations ?? 10_000,
    tolerance: options.tolerance ?? 1e-10,
    priorWins: options.priorWins ?? 0.5,
  };
  const result: PairwiseRanking = rankPairwiseProjects(
    projectIds,
    comparisons.map(({ winnerProjectId, loserProjectId }): PairwiseComparison => ({ winnerProjectId, loserProjectId })),
    configuration,
  );
  const [previous] = await db.select({ id: schema.pairwiseRankingSnapshots.id })
    .from(schema.pairwiseRankingSnapshots)
    .where(and(
      eq(schema.pairwiseRankingSnapshots.eventId, eventId),
      isNotNull(schema.pairwiseRankingSnapshots.publishedAt),
    ))
    .orderBy(desc(schema.pairwiseRankingSnapshots.publishedAt))
    .limit(1);

  const [snapshot] = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(schema.pairwiseRankingSnapshots).values({
      eventId,
      algorithmVersion: PAIRWISE_RANKING_VERSION,
      configuration,
      input: { projectIds, comparisons } as unknown as Record<string, unknown>,
      results: result as unknown as Record<string, unknown>,
      generatedBy: actor.userId,
      supersedesSnapshotId: previous?.id ?? null,
    }).returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "pairwise_ranking.generate",
      resourceType: "pairwise_ranking_snapshot",
      resourceId: inserted.id,
      metadata: { projects: projectIds.length, comparisons: comparisons.length },
    });
    return [inserted];
  });
  return toSnapshot(snapshot);
}

export async function getPairwiseRankingSnapshot(actor: Actor, eventId: string, snapshotId: string) {
  const [snapshot] = await db.select().from(schema.pairwiseRankingSnapshots).where(and(
    eq(schema.pairwiseRankingSnapshots.id, snapshotId),
    eq(schema.pairwiseRankingSnapshots.eventId, eventId),
  )).limit(1);
  if (!snapshot) throw new DogfoodError("NOT_FOUND", "Pairwise ranking snapshot not found");
  if (snapshot.publishedAt === null) {
    const event = await eventForRanking(eventId);
    await authorizeOrganizer(actor, eventId, event.state as EventState);
  }
  return toSnapshot(snapshot);
}

export async function publishPairwiseRankingSnapshot(actor: Actor, eventId: string, snapshotId: string) {
  const event = await eventForRanking(eventId);
  await authorizeOrganizer(actor, eventId, event.state as EventState);
  return db.transaction(async (tx) => {
    // Serialize the read-current-link + publish transition for this event.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pairwise-ranking-publish:${eventId}`}, 0))`);
    const [snapshot] = await tx.select().from(schema.pairwiseRankingSnapshots).where(and(
      eq(schema.pairwiseRankingSnapshots.id, snapshotId),
      eq(schema.pairwiseRankingSnapshots.eventId, eventId),
    )).limit(1);
    if (!snapshot) throw new DogfoodError("NOT_FOUND", "Pairwise ranking snapshot not found");
    if (snapshot.publishedAt) throw new DogfoodError("CONFLICT", "Pairwise ranking snapshot is already published");
    const [latest] = await tx.select({ id: schema.pairwiseRankingSnapshots.id, publishedAt: schema.pairwiseRankingSnapshots.publishedAt })
      .from(schema.pairwiseRankingSnapshots)
      .where(and(
        eq(schema.pairwiseRankingSnapshots.eventId, eventId),
        isNotNull(schema.pairwiseRankingSnapshots.publishedAt),
      ))
      .orderBy(desc(schema.pairwiseRankingSnapshots.publishedAt))
      .limit(1);
    const supersedesSnapshotId = latest?.id ?? snapshot.supersedesSnapshotId;
    const now = new Date();
    const publishedAt = latest?.publishedAt && latest.publishedAt.getTime() >= now.getTime()
      ? new Date(latest.publishedAt.getTime() + 1)
      : now;
    const [published] = await tx.update(schema.pairwiseRankingSnapshots)
      .set({ publishedAt, supersedesSnapshotId })
      .where(and(
        eq(schema.pairwiseRankingSnapshots.id, snapshot.id),
        isNull(schema.pairwiseRankingSnapshots.publishedAt),
      )).returning();
    if (!published) throw new DogfoodError("CONFLICT", "Pairwise ranking snapshot is already published");
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "pairwise_ranking.publish",
      resourceType: "pairwise_ranking_snapshot",
      resourceId: snapshot.id,
      metadata: { supersedesSnapshotId },
    });
    return { snapshotId: snapshot.id, eventId, publishedAt, supersedesSnapshotId };
  });
}
