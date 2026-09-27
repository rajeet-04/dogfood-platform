import { appendAuditEvent } from "@dogfood/audit";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  or,
  schema,
  sql,
  type EventState,
} from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import {
  assertCertificateTier,
  tierForRank,
  type CertificateTier,
} from "./domain";

const ISSUABLE_STATES: EventState[] = [
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
];

export type CertificateDetail = {
  id: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  projectId: string | null;
  userId: string;
  displayName: string;
  projectTitle: string;
  teamName: string | null;
  tier: CertificateTier;
  rank: number | null;
  issuedAt: Date;
};

export type IssueResult = {
  issued: number;
  snapshotId: string;
};

type CertificateRow = typeof schema.certificates.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;

async function loadEvent(eventId: string): Promise<EventRow | undefined> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0];
}

async function requireIssuerPermission(
  event: EventRow,
  actor: Actor,
): Promise<void> {
  const roles = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.eventId, event.id),
      ),
    );
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId: event.id,
    resourceEventId: event.id,
    roles: roles.map((row) => row.role),
    eventState: event.state,
  });
}

function toCertificateDetail(row: CertificateRow, event: EventRow): CertificateDetail {
  return {
    id: row.id,
    eventId: row.eventId,
    eventName: event.name,
    eventSlug: event.slug,
    projectId: row.projectId,
    userId: row.userId,
    displayName: row.displayName,
    projectTitle: row.projectTitle,
    teamName: row.teamName,
    tier: assertCertificateTier(row.tier),
    rank: row.rank,
    issuedAt: row.issuedAt,
  };
}

export async function issueCertificates(
  actor: Actor,
  eventId: string,
): Promise<IssueResult> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  if (!ISSUABLE_STATES.includes(event.state)) {
    throw new DogfoodError(
      "EVENT_STATE_INVALID",
      "[EVENT_STATE_INVALID] Certificates can only be issued after results are ready",
    );
  }
  await requireIssuerPermission(event, actor);

  const snapshots = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(
      and(
        eq(schema.rankingSnapshots.eventId, eventId),
        sql`${schema.rankingSnapshots.publishedAt} is not null`,
      ),
    )
    .orderBy(desc(schema.rankingSnapshots.generatedAt))
    .limit(1);
  const snapshot = snapshots[0];
  if (!snapshot) {
    throw new DogfoodError("NOT_FOUND", "Results have not been published yet");
  }

  const ranked =
    (snapshot.results as {
      ranked?: Array<{ projectId: string; rank: number }>;
    }).ranked ?? [];
  const rankByProject = new Map<string, number>(
    ranked.map((item) => [item.projectId, item.rank]),
  );

  const projects = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.eventId, eventId),
        or(
          eq(schema.projects.state, "SUBMITTED"),
          eq(schema.projects.state, "LOCKED"),
        ),
      ),
    );

  if (projects.length === 0) {
    return { issued: 0, snapshotId: snapshot.id };
  }

  const teamIds = projects
    .map((project) => project.teamId)
    .filter((id): id is string => id !== null);
  const revisionIds = projects
    .map((project) => project.currentRevisionId)
    .filter((id): id is string => id !== null);

  const revisions = revisionIds.length
    ? await db
        .select()
        .from(schema.projectRevisions)
        .where(inArray(schema.projectRevisions.id, revisionIds))
    : [];
  const titleByProject = new Map(
    revisions.map((revision) => [revision.projectId, revision.title]),
  );

  const teams = teamIds.length
    ? await db
        .select()
        .from(schema.teams)
        .where(inArray(schema.teams.id, teamIds))
    : [];
  const nameByTeam = new Map(teams.map((team) => [team.id, team.name]));

  const memberships = teamIds.length
    ? await db
        .select()
        .from(schema.teamMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
        .where(
          and(
            eq(schema.teamMembers.eventId, eventId),
            inArray(schema.teamMembers.teamId, teamIds),
          ),
        )
    : [];

  const rows: Array<typeof schema.certificates.$inferInsert> = [];
  for (const project of projects) {
    const tier = tierForRank(rankByProject.get(project.id));
    const projectTitle = titleByProject.get(project.id) ?? project.slug;
    const teamName = project.teamId ? nameByTeam.get(project.teamId) ?? null : null;
    for (const { team_members, users } of memberships) {
      if (team_members.teamId !== project.teamId) continue;
      rows.push({
        eventId,
        projectId: project.id,
        userId: users.id,
        displayName: users.displayName,
        projectTitle,
        teamName,
        tier,
        rank: rankByProject.get(project.id) ?? null,
        issuedBy: actor.userId,
      });
    }
  }

  if (rows.length === 0) {
    return { issued: 0, snapshotId: snapshot.id };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.certificates)
      .where(eq(schema.certificates.eventId, eventId));
    await tx.insert(schema.certificates).values(rows);
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "certificate.issue",
      resourceType: "certificate",
      resourceId: null,
      metadata: {
        issued: rows.length,
        snapshotId: snapshot.id,
        eventState: event.state,
      },
    });
  });

  return { issued: rows.length, snapshotId: snapshot.id };
}

export async function getCertificate(
  certificateId: string,
): Promise<CertificateDetail> {
  const rows = await db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.id, certificateId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new DogfoodError("NOT_FOUND", "Certificate not found");
  const event = await loadEvent(row.eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  return toCertificateDetail(row, event);
}

export async function listCertificates(
  actor: Actor,
  eventId: string,
): Promise<CertificateDetail[]> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireIssuerPermission(event, actor);

  const rows = await db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.eventId, eventId))
    .orderBy(desc(schema.certificates.issuedAt));
  return rows.map((row) => toCertificateDetail(row, event));
}

export async function revokeCertificates(
  actor: Actor,
  eventId: string,
): Promise<{ revoked: number }> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireIssuerPermission(event, actor);

  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: schema.certificates.id })
      .from(schema.certificates)
      .where(eq(schema.certificates.eventId, eventId));
    if (current.length > 0) {
      await tx
        .delete(schema.certificates)
        .where(eq(schema.certificates.eventId, eventId));
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "certificate.revoke",
        resourceType: "certificate",
        resourceId: null,
        metadata: { revoked: current.length, eventState: event.state },
      });
    }
    return current.length;
  });

  return { revoked: result };
}