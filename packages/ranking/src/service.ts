import { and, inArray, db, eq, schema, type EventState } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import { actorDisplayName, notifyEventMembersByRole } from "@dogfood/notifications";
import { normalizeJudgeBatch } from "@dogfood/normalization";
import { calculateWeightedScore } from "@dogfood/scoring";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

import {
  rankProjects,
  RANKING_VERSION,
  type RankableProject,
  type RankingConfig,
  type RankingResult,
  type TieBreaker,
} from "./engine";

export const SCORING_VERSION = "1.0";
export const NORMALIZATION_VERSION = "1.0";

/**
 * Ranking snapshots can be generated and published from JUDGING onwards.
 * Allowing the later states means an event that was advanced past judging
 * without releasing results can still be ranked and published.
 */
export const RANKING_ALLOWED_STATES: EventState[] = [
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
];

export function canRunRanking(eventState: EventState): boolean {
  return RANKING_ALLOWED_STATES.includes(eventState);
}

export type RankingGenerationConfig = {
  normalizationStrategy: "z-score" | "none";
  minimumBatchSize: number;
  tieBreakers: Array<TieBreaker>;
  rankingVersion?: string;
};

export type CriterionBreakdown = {
  name: string;
  meanWeightedScore: number;
  scoredBy: number;
};

export type RankingSnapshot = {
  id: string;
  eventId: string;
  scoringVersion: string;
  normalizationVersion: string;
  rankingVersion: string;
  configuration: RankingGenerationConfig;
  results: RankingResult & {
    criteria?: Record<string, Record<string, CriterionBreakdown>>;
  };
  generatedBy: string;
  generatedAt: Date;
  publishedAt: Date | null;
};

export type PublishedResults = {
  snapshotId: string;
  eventId: string;
  publishedAt: Date;
  eventState: EventState;
};

type SnapshotRow = typeof schema.rankingSnapshots.$inferSelect;

function toRankingSnapshot(row: SnapshotRow): RankingSnapshot {
  return {
    id: row.id,
    eventId: row.eventId,
    scoringVersion: row.scoringVersion,
    normalizationVersion: row.normalizationVersion,
    rankingVersion: row.rankingVersion,
    configuration: row.configuration as unknown as RankingGenerationConfig,
    results: row.results as unknown as RankingResult,
    generatedBy: row.generatedBy,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt,
  };
}

async function loadEvent(eventId: string) {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0];
}

async function requireOrganizer(
  actor: Actor,
  eventId: string,
  eventState: EventState,
): Promise<void> {
  const roles = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.eventId, eventId),
      ),
    );
  requirePermission(
    actor,
    ACTION.RANKING_GENERATE,
    {
      eventId,
      resourceEventId: eventId,
      roles: roles.map((r) => r.role),
      eventState,
    },
  );
}

type JudgeContribution = {
  judgeId: string;
  projectId: string;
  total: number;
};

export async function generateRankingSnapshot(
  actor: Actor,
  eventId: string,
  config: RankingGenerationConfig,
): Promise<RankingSnapshot> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireOrganizer(actor, eventId, event.state as EventState);

  if (!canRunRanking(event.state as EventState)) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Rankings can only be generated once judging has started",
    );
  }

  const normalizedConfig: RankingGenerationConfig = {
    normalizationStrategy: config.normalizationStrategy,
    minimumBatchSize: config.minimumBatchSize,
    tieBreakers: config.tieBreakers,
  };

  const assignments = await db
    .select()
    .from(schema.judgeAssignments)
    .where(eq(schema.judgeAssignments.eventId, eventId));
  if (assignments.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] No judge assignments for this event",
    );
  }
  const assignmentIds = assignments.map((a) => a.id);
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));

  const evaluations = await db
    .select()
    .from(schema.evaluations)
    .where(inArray(schema.evaluations.assignmentId, assignmentIds));
  const submitted = evaluations.filter(
    (e) => e.state === "SUBMITTED" || e.state === "LOCKED",
  );
  if (submitted.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] No submitted evaluations to rank",
    );
  }

  const criteriaCache = new Map<string, (typeof schema.rubricCriteria.$inferSelect)[]>();
  async function criteriaFor(rubricId: string) {
    const cached = criteriaCache.get(rubricId);
    if (cached) return cached;
    const rows = await db
      .select()
      .from(schema.rubricCriteria)
      .where(eq(schema.rubricCriteria.rubricId, rubricId))
      .orderBy(schema.rubricCriteria.sortOrder);
    criteriaCache.set(rubricId, rows);
    return rows;
  }

  const contributions: JudgeContribution[] = [];
  const criteriaByProject = new Map<
    string,
    Map<string, { name: string; weightedSum: number; count: number }>
  >();
  for (const evaluation of submitted) {
    const assignment = assignmentById.get(evaluation.assignmentId);
    if (!assignment) continue;
    const criteria = await criteriaFor(evaluation.rubricId);
    const weightByCriterion = new Map(
      criteria.map((c) => [c.id, Number.parseFloat(c.weight)]),
    );
    const nameByCriterion = new Map(criteria.map((c) => [c.id, c.name]));
    const scores = await db
      .select()
      .from(schema.evaluationScores)
      .where(eq(schema.evaluationScores.evaluationId, evaluation.id));
    const scored = scores.map((s) => ({
      criterionId: s.criterionId,
      score: Number.parseFloat(s.score),
      weight: weightByCriterion.get(s.criterionId) ?? 0,
    }));
    for (const s of scored) {
      let byCriterion = criteriaByProject.get(assignment.projectId);
      if (!byCriterion) {
        byCriterion = new Map();
        criteriaByProject.set(assignment.projectId, byCriterion);
      }
      const entry =
        byCriterion.get(s.criterionId) ?? {
          name: nameByCriterion.get(s.criterionId) ?? s.criterionId,
          weightedSum: 0,
          count: 0,
        };
      entry.weightedSum += s.score * s.weight;
      entry.count += 1;
      byCriterion.set(s.criterionId, entry);
    }
    const { total: rawTotal } = calculateWeightedScore(scored);
    const scoredWeight = scored.reduce((sum, s) => sum + s.weight, 0);
    const targetWeight = criteria.reduce(
      (sum, c) => sum + Number.parseFloat(c.weight),
      0,
    );
    const total =
      scoredWeight > 0 && targetWeight > 0
        ? rawTotal * (targetWeight / scoredWeight)
        : rawTotal;
    contributions.push({
      judgeId: assignment.judgeId,
      projectId: assignment.projectId,
      total,
    });
  }
  if (contributions.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] No usable scores to rank",
    );
  }

  const normalizedByProject = new Map<string, number[]>();
  const rawByProject = new Map<string, number[]>();
  const perJudge = new Map<string, Array<{ projectId: string; score: number }>>();
  for (const contribution of contributions) {
    if (!perJudge.has(contribution.judgeId)) {
      perJudge.set(contribution.judgeId, []);
    }
    perJudge.get(contribution.judgeId)!.push({
      projectId: contribution.projectId,
      score: contribution.total,
    });
    if (!rawByProject.has(contribution.projectId)) {
      rawByProject.set(contribution.projectId, []);
    }
    rawByProject.get(contribution.projectId)!.push(contribution.total);
  }

  for (const batch of perJudge.values()) {
    const normalized = normalizeJudgeBatch(batch, {
      strategy: config.normalizationStrategy,
      minimumBatchSize: config.minimumBatchSize,
    });
    if (!normalized.eligible) continue;
    for (const value of normalized.values) {
      if (!normalizedByProject.has(value.projectId)) {
        normalizedByProject.set(value.projectId, []);
      }
      normalizedByProject.get(value.projectId)!.push(value.normalizedScore);
    }
  }
  if (normalizedByProject.size === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] No judge batches met the minimum batch size",
    );
  }

  const projects: RankableProject[] = [];
  for (const [projectId, values] of normalizedByProject) {
    const competitiveScore =
      values.reduce((sum, v) => sum + v, 0) / values.length;
    const rawValues = rawByProject.get(projectId) ?? [];
    const secondaryScore = rawValues.length
      ? rawValues.reduce((sum, v) => sum + v, 0) / rawValues.length
      : 0;
    projects.push({ projectId, competitiveScore, secondaryScore });
  }

  const rankingConfig: RankingConfig = {
    tieBreakers: config.tieBreakers,
  };
  const results = rankProjects(projects, rankingConfig);

  const resultsWithBreakdown = {
    ...results,
    criteria: Object.fromEntries(
      [...criteriaByProject].map(([projectId, byCriterion]) => [
        projectId,
        Object.fromEntries(
          [...byCriterion].map(([criterionId, entry]) => [
            criterionId,
            {
              name: entry.name,
              meanWeightedScore: entry.weightedSum / entry.count,
              scoredBy: entry.count,
            },
          ]),
        ),
      ]),
    ),
  };

  const snapshot = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.rankingSnapshots)
      .values({
        eventId,
        scoringVersion: SCORING_VERSION,
        normalizationVersion: NORMALIZATION_VERSION,
        rankingVersion: RANKING_VERSION,
        configuration: normalizedConfig as unknown as Record<string, unknown>,
        results: resultsWithBreakdown as unknown as Record<string, unknown>,
        generatedBy: actor.userId,
        generatedAt: new Date(),
      })
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "ranking.generate",
      resourceType: "ranking_snapshot",
      resourceId: inserted.id,
      metadata: { entries: results.ranked.length },
    });
    return inserted;
  });

  return toRankingSnapshot(snapshot);
}

export async function getRankingSnapshot(
  actor: Actor,
  eventId: string,
  snapshotId: string,
): Promise<RankingSnapshot> {
  const rows = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(
      and(
        eq(schema.rankingSnapshots.id, snapshotId),
        eq(schema.rankingSnapshots.eventId, eventId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new DogfoodError("NOT_FOUND", "Ranking snapshot not found");

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.eventId, eventId),
      ),
    );
  const isOrganizer =
    actor.isPlatformAdmin ||
    roles.some((r) => r.role === "ORGANIZER");
  if (!isOrganizer && row.publishedAt === null) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Results are not public yet",
    );
  }

  return toRankingSnapshot(row);
}

export async function publishRankingSnapshot(
  actor: Actor,
  eventId: string,
  snapshotId: string,
): Promise<PublishedResults> {
  const rows = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(
      and(
        eq(schema.rankingSnapshots.id, snapshotId),
        eq(schema.rankingSnapshots.eventId, eventId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new DogfoodError("NOT_FOUND", "Ranking snapshot not found");

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireOrganizer(actor, eventId, event.state as EventState);

  if (!canRunRanking(event.state as EventState)) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Results can only be published once judging has started",
    );
  }

  const publishedAt = new Date();
  // Publishing never rewinds an event that already moved past RESULTS_READY.
  const nextState: EventState =
    event.state === "JUDGING" ? "RESULTS_READY" : (event.state as EventState);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.rankingSnapshots)
      .set({ publishedAt })
      .where(eq(schema.rankingSnapshots.id, row.id));
    await tx
      .update(schema.events)
      .set({
        state: nextState,
        publishedRankingSnapshotId: row.id,
        updatedAt: publishedAt,
      })
      .where(eq(schema.events.id, eventId));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "ranking.publish",
      resourceType: "ranking_snapshot",
      resourceId: row.id,
    });
    await notifyEventMembersByRole(
      tx,
      eventId,
      ["PARTICIPANT", "JUDGE", "ORGANIZER"],
      {
        type: "results_published",
        title: `Results for ${event.name} are published`,
        body: `${await actorDisplayName(tx, actor.userId)} published the final leaderboard.`,
        href: `/events/${eventId}`,
      },
      { excludeUserIds: [actor.userId] },
    );
  });

  return {
    snapshotId: row.id,
    eventId,
    publishedAt,
    eventState: nextState,
  };
}