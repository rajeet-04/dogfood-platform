import { appendAuditEvent } from "@dogfood/audit";
import {
  and,
  db,
  desc,
  eq,
  schema,
  type EventRole,
} from "@dogfood/db";
import {
  grantEventMembership,
  removeEventMembership,
} from "@dogfood/events";
import {
  actorDisplayName,
  notify,
  notifyEventMembersByRole,
} from "@dogfood/notifications";
import { ACTION, requirePermission, type Action } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { assertJudgeApplicationStatus } from "./domain";

type EventRow = typeof schema.events.$inferSelect;
type ApplicationRow = typeof schema.judgeApplications.$inferSelect;

export type JudgeApplicationInput = {
  rationale?: string | null;
  attachment?: JudgeApplicationAttachment | null;
};

export type JudgeApplicationAttachment = {
  name: string;
  path: string;
  size: number;
  contentType: string;
};

export type JudgeApplicationListItem = {
  id: string;
  eventId: string;
  userId: string;
  displayName: string;
  email: string;
  rationale: string | null;
  status: ApplicationRow["status"];
  createdAt: Date;
  decidedAt: Date | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  attachmentContentType: string | null;
};

export async function getMyJudgeApplication(
  actor: Actor,
  eventId: string,
): Promise<ApplicationRow | null> {
  const rows = await db
    .select()
    .from(schema.judgeApplications)
    .where(
      and(
        eq(schema.judgeApplications.eventId, eventId),
        eq(schema.judgeApplications.userId, actor.userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadEvent(eventId: string): Promise<EventRow | undefined> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0];
}

async function membershipRoles(
  userId: string,
  eventId: string,
): Promise<EventRole[]> {
  const rows = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, userId),
        eq(schema.eventMemberships.eventId, eventId),
      ),
    );
  return rows.map((row) => row.role);
}

async function requireEventPermission(
  event: EventRow,
  actor: Actor,
  action: Action,
): Promise<void> {
  const roles = await membershipRoles(actor.userId, event.id);
  requirePermission(actor, action, {
    eventId: event.id,
    resourceEventId: event.id,
    roles,
    eventState: event.state,
  });
}

export async function applyAsJudge(
  actor: Actor,
  eventId: string,
  input: JudgeApplicationInput = {},
): Promise<ApplicationRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await membershipRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.JUDGE_APPLY, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state,
  });

  if (event.state !== "REGISTRATION") {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Judge applications for this event are not open",
    );
  }

  const now = new Date();
  if (event.registrationOpensAt && now < event.registrationOpensAt) {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Registration for this event has not opened yet",
    );
  }
  if (event.registrationClosesAt && now > event.registrationClosesAt) {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Registration for this event has closed",
    );
  }

  if (roles.length > 0) {
    throw new DogfoodError(
      "FORBIDDEN",
      "You are already registered for this event",
    );
  }

  const existing = await getMyJudgeApplication(actor, eventId);
  if (existing) {
    if (existing.status === "pending") {
      return existing;
    }
    const reapplied = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.judgeApplications)
        .set({
          rationale: input.rationale ?? null,
          attachmentName: input.attachment?.name ?? null,
          attachmentPath: input.attachment?.path ?? null,
          attachmentSize: input.attachment?.size ?? null,
          attachmentContentType: input.attachment?.contentType ?? null,
          status: "pending",
          decidedAt: null,
          decidedBy: null,
        })
        .where(eq(schema.judgeApplications.id, existing.id))
        .returning();
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge_application.reapply",
        resourceType: "judge_application",
        resourceId: existing.id,
        metadata: { previousStatus: existing.status },
      });
      const actorName = await actorDisplayName(tx, actor.userId);
      await notifyEventMembersByRole(
        tx,
        eventId,
        ["ORGANIZER"],
        {
          type: "judge_application_received",
          title: `${actorName} re-applied to judge ${event.name}`,
          body: input.rationale ?? null,
          href: `/events/${eventId}/organizer#judge-applications`,
        },
        { excludeUserIds: [actor.userId] },
      );
      return updated;
    });
    return reapplied;
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.judgeApplications)
      .values({
        eventId,
        userId: actor.userId,
        rationale: input.rationale ?? null,
        attachmentName: input.attachment?.name ?? null,
        attachmentPath: input.attachment?.path ?? null,
        attachmentSize: input.attachment?.size ?? null,
        attachmentContentType: input.attachment?.contentType ?? null,
        status: "pending",
      })
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_application.apply",
      resourceType: "judge_application",
      resourceId: created.id,
      metadata: { hasRationale: Boolean(input.rationale) },
    });
    const actorName = await actorDisplayName(tx, actor.userId);
    await notifyEventMembersByRole(
      tx,
      eventId,
      ["ORGANIZER"],
      {
        type: "judge_application_received",
        title: `${actorName} applied to judge ${event.name}`,
        body: input.rationale ?? null,
        href: `/events/${eventId}/organizer#judge-applications`,
      },
      { excludeUserIds: [actor.userId] },
    );
    return created;
  });
}

export async function withdrawJudgeApplication(
  actor: Actor,
  eventId: string,
): Promise<void> {
  const application = await getMyJudgeApplication(actor, eventId);
  if (!application) {
    throw new DogfoodError("NOT_FOUND", "No judge application found");
  }
  if (application.status !== "pending") {
    throw new DogfoodError(
      "CONFLICT",
      "Only a pending application can be withdrawn",
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.judgeApplications)
      .where(eq(schema.judgeApplications.id, application.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_application.withdraw",
      resourceType: "judge_application",
      resourceId: application.id,
      metadata: {},
    });
  });
}

export async function listJudgeApplications(
  actor: Actor,
  eventId: string,
): Promise<JudgeApplicationListItem[]> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(event, actor, ACTION.JUDGE_APPLICATION_MANAGE);

  const rows = await db
    .select()
    .from(schema.judgeApplications)
    .innerJoin(schema.users, eq(schema.users.id, schema.judgeApplications.userId))
    .where(eq(schema.judgeApplications.eventId, eventId))
    .orderBy(desc(schema.judgeApplications.createdAt));

  return rows.map(({ judge_applications, users }) => ({
    id: judge_applications.id,
    eventId: judge_applications.eventId,
    userId: judge_applications.userId,
    displayName: users.displayName,
    email: users.email,
    rationale: judge_applications.rationale,
    status: assertJudgeApplicationStatus(judge_applications.status),
    createdAt: judge_applications.createdAt,
    decidedAt: judge_applications.decidedAt,
    attachmentName: judge_applications.attachmentName,
    attachmentSize: judge_applications.attachmentSize,
    attachmentContentType: judge_applications.attachmentContentType,
  }));
}

async function loadApplication(
  applicationId: string,
  eventId: string,
): Promise<ApplicationRow | undefined> {
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
  return rows[0];
}

export async function approveJudgeApplication(
  actor: Actor,
  eventId: string,
  applicationId: string,
): Promise<ApplicationRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(event, actor, ACTION.JUDGE_APPLICATION_MANAGE);

  const application = await loadApplication(applicationId, eventId);
  if (!application) throw new DogfoodError("NOT_FOUND", "Application not found");
  if (application.status !== "pending") {
    throw new DogfoodError(
      "CONFLICT",
      "Application has already been decided",
    );
  }

  const membership = await grantEventMembership(
    actor,
    eventId,
    application.userId,
    "JUDGE",
  );

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.judgeApplications)
      .set({
        status: "approved",
        decidedAt: new Date(),
        decidedBy: actor.userId,
      })
      .where(eq(schema.judgeApplications.id, application.id))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_application.approve",
      resourceType: "judge_application",
      resourceId: application.id,
      metadata: { grantedUserId: application.userId, membershipId: membership.id },
    });
    await notify(tx, {
      userId: application.userId,
      eventId,
      type: "judge_application_approved",
      title: `Your judge application for ${event.name} was approved`,
      body: `${await actorDisplayName(tx, actor.userId)} added you as a judge. You can start reviewing assigned projects.`,
      href: `/events/${eventId}/judge`,
    });
    return row;
  });
  return updated;
}

export async function rejectJudgeApplication(
  actor: Actor,
  eventId: string,
  applicationId: string,
): Promise<ApplicationRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(event, actor, ACTION.JUDGE_APPLICATION_MANAGE);

  const application = await loadApplication(applicationId, eventId);
  if (!application) throw new DogfoodError("NOT_FOUND", "Application not found");
  if (application.status !== "pending") {
    throw new DogfoodError(
      "CONFLICT",
      "Application has already been decided",
    );
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.judgeApplications)
      .set({
        status: "rejected",
        decidedAt: new Date(),
        decidedBy: actor.userId,
      })
      .where(eq(schema.judgeApplications.id, application.id))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_application.reject",
      resourceType: "judge_application",
      resourceId: application.id,
      metadata: {},
    });
    await notify(tx, {
      userId: application.userId,
      eventId,
      type: "judge_application_rejected",
      title: `Your judge application for ${event.name} was not accepted`,
      body: `${await actorDisplayName(tx, actor.userId)} reviewed your application. You can re-apply while registration is open.`,
      href: `/events/${eventId}`,
    });
    return row;
  });
}

export async function deactivateJudge(
  actor: Actor,
  eventId: string,
  userId: string,
): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(event, actor, ACTION.JUDGE_APPLICATION_MANAGE);

  const application = await db
    .select()
    .from(schema.judgeApplications)
    .where(
      and(
        eq(schema.judgeApplications.eventId, eventId),
        eq(schema.judgeApplications.userId, userId),
      ),
    )
    .limit(1);
  const row = application[0];
  if (!row) throw new DogfoodError("NOT_FOUND", "No judge application found");
  if (row.status !== "approved") {
    throw new DogfoodError(
      "CONFLICT",
      "Only an approved judge application can be revoked",
    );
  }

  try {
    await removeEventMembership(actor, eventId, userId);
  } catch (err) {
    if (!(err instanceof DogfoodError) || err.code !== "NOT_FOUND") throw err;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.judgeApplications)
      .set({
        status: "revoked",
        decidedAt: new Date(),
        decidedBy: actor.userId,
      })
      .where(eq(schema.judgeApplications.id, row.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_application.revoke",
      resourceType: "judge_application",
      resourceId: row.id,
      metadata: { grantedUserId: userId },
    });
  });
}