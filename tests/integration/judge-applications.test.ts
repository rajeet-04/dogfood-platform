import { and, db, eq, schema } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyAsJudge,
  approveJudgeApplication,
  deactivateJudge,
  getMyJudgeApplication,
  listJudgeApplications,
  rejectJudgeApplication,
  withdrawJudgeApplication,
} from "@dogfood/applications";
import { registerUser } from "@dogfood/auth";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let counter = 0;

describe("judge applications", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function openEvent(organizerId: string) {
    counter += 1;
    const event = await createEvent(actorFor(organizerId), {
      slug: `judge-app-${counter}`,
      name: `Judge App Event ${counter}`,
      timezone: "UTC",
    });
    await transitionEvent(actorFor(organizerId), event.id, "REGISTRATION");
    return event;
  }

  async function organizerAndApplicant() {
    const organizer = await registerUser({
      email: `org-ja-${counter}@example.com`,
      password: "pass",
      displayName: "Org",
    });
    const applicant = await registerUser({
      email: `app-ja-${counter}@example.com`,
      password: "pass",
      displayName: "Applicant",
    });
    return { organizer, applicant };
  }

  it("lets a user apply as a judge during registration", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);

    const application = await applyAsJudge(actorFor(applicant.id), event.id, {
      rationale: "I judged before.",
    });
    expect(application.status).toBe("pending");
    expect(application.rationale).toBe("I judged before.");

    const same = await applyAsJudge(actorFor(applicant.id), event.id);
    expect(same.id).toBe(application.id);

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "judge_application.apply"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("refuses applications before or after the registration window", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await createEvent(actorFor(organizer.id), {
      slug: `judge-app-closed-${counter}`,
      name: "Closed",
      timezone: "UTC",
    });

    await expect(
      applyAsJudge(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });

    await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
    await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");
    await expect(
      applyAsJudge(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("applies the registration time window to applications", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await createEvent(actorFor(organizer.id), {
      slug: `judge-app-window-${counter}`,
      name: "Window",
      timezone: "UTC",
      registrationClosesAt: new Date(Date.now() - 1000),
    });
    await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");

    await expect(
      applyAsJudge(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("refuses applications from users already registered in the event", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      applicant.id,
      "PARTICIPANT",
    );

    await expect(
      applyAsJudge(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("approving grants the JUDGE membership", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);

    const updated = await approveJudgeApplication(
      actorFor(organizer.id),
      event.id,
      application.id,
    );
    expect(updated.status).toBe("approved");

    const memberships = await db
      .select()
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, event.id),
          eq(schema.eventMemberships.userId, applicant.id),
        ),
      );
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("JUDGE");

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "judge_application.approve"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("rejecting leaves the applicant outside the event", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);

    const updated = await rejectJudgeApplication(
      actorFor(organizer.id),
      event.id,
      application.id,
    );
    expect(updated.status).toBe("rejected");

    const memberships = await db
      .select()
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, event.id),
          eq(schema.eventMemberships.userId, applicant.id),
        ),
      );
    expect(memberships).toHaveLength(0);
  });

  it("lets a rejected applicant re-apply as pending", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);
    await rejectJudgeApplication(
      actorFor(organizer.id),
      event.id,
      application.id,
    );

    const reapplied = await applyAsJudge(actorFor(applicant.id), event.id, {
      rationale: "Please reconsider.",
    });
    expect(reapplied.id).toBe(application.id);
    expect(reapplied.status).toBe("pending");
    expect(reapplied.rationale).toBe("Please reconsider.");
  });

  it("lets an applicant withdraw a pending application only", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);

    await withdrawJudgeApplication(actorFor(applicant.id), event.id);
    expect(await getMyJudgeApplication(actorFor(applicant.id), event.id)).toBeNull();

    const second = await applyAsJudge(actorFor(applicant.id), event.id);
    await rejectJudgeApplication(
      actorFor(organizer.id),
      event.id,
      second.id,
    );
    await expect(
      withdrawJudgeApplication(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only organizers can decide or list applications", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);

    await expect(
      listJudgeApplications(actorFor(applicant.id), event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      approveJudgeApplication(actorFor(applicant.id), event.id, application.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const listed = await listJudgeApplications(actorFor(organizer.id), event.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].displayName).toBe("Applicant");
    expect(listed[0].rationale).toBeNull();
  });

  it("deciding the same application twice is a conflict", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);

    await approveJudgeApplication(actorFor(organizer.id), event.id, application.id);
    await expect(
      approveJudgeApplication(actorFor(organizer.id), event.id, application.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deactivating a judge removes the membership and revokes the application", async () => {
    const { organizer, applicant } = await organizerAndApplicant();
    const event = await openEvent(organizer.id);
    const application = await applyAsJudge(actorFor(applicant.id), event.id);
    await approveJudgeApplication(
      actorFor(organizer.id),
      event.id,
      application.id,
    );

    await deactivateJudge(actorFor(organizer.id), event.id, applicant.id);

    const memberships = await db
      .select()
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, event.id),
          eq(schema.eventMemberships.userId, applicant.id),
        ),
      );
    expect(memberships).toHaveLength(0);

    const mine = await getMyJudgeApplication(actorFor(applicant.id), event.id);
    expect(mine?.status).toBe("revoked");

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "judge_application.revoke"),
        ),
      );
    expect(audits).toHaveLength(1);
  });
});