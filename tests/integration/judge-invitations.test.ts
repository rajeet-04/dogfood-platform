import { and, db, eq, schema } from "@dogfood/db";
import { registerUser } from "@dogfood/auth";
import { acceptJudgeInvitation, createEvent, createJudgeInvitation, listJudgeInvitations, revokeJudgeInvitation } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../fixtures/db";

const asActor = (userId: string): Actor => ({ userId, isPlatformAdmin: false });
let serial = 0;

describe("judge invitations", () => {
  beforeEach(async () => {
    await resetDb();
    serial += 1;
  });

  async function setup() {
    const organizer = await registerUser({ email: `invite-org-${serial}@example.com`, password: "pass", displayName: "Organizer" });
    const judge = await registerUser({ email: `invite-judge-${serial}@example.com`, password: "pass", displayName: "Judge" });
    const other = await registerUser({ email: `invite-other-${serial}@example.com`, password: "pass", displayName: "Other" });
    const event = await createEvent(asActor(organizer.id), { slug: `judge-invite-${serial}`, name: "Invite Event", timezone: "UTC" });
    return { organizer, judge, other, event };
  }

  it("stores only a token hash, lists safe fields and accepts once for a matching normalized email", async () => {
    const { organizer, judge, event } = await setup();
    const created = await createJudgeInvitation(asActor(organizer.id), event.id, ` ${judge.email.toUpperCase()} `);
    expect(created.invitation.email).toBe(judge.email.toLowerCase());
    expect(created.invitation).not.toHaveProperty("tokenHash");
    const [stored] = await db.select().from(schema.judgeInvitations).where(eq(schema.judgeInvitations.id, created.invitation.id));
    expect(stored.tokenHash).not.toBe(created.token);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const listed = await listJudgeInvitations(asActor(organizer.id), event.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");

    await expect(acceptJudgeInvitation(asActor(judge.id), event.id, created.token)).resolves.toEqual({ eventId: event.id, role: "JUDGE" });
    const [membership] = await db.select().from(schema.eventMemberships).where(and(eq(schema.eventMemberships.eventId, event.id), eq(schema.eventMemberships.userId, judge.id)));
    expect(membership.role).toBe("JUDGE");
    await expect(acceptJudgeInvitation(asActor(judge.id), event.id, created.token)).rejects.toMatchObject({ code: "INVITATION_INVALID" });

    const [audit] = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.eventId, event.id), eq(schema.auditEvents.resourceId, created.invitation.id)));
    expect(JSON.stringify(audit)).not.toContain(created.token);
    expect(JSON.stringify(audit)).not.toContain(stored.tokenHash);
  });

  it("rejects mismatched email, wrong-event, expired and revoked links", async () => {
    const { organizer, judge, other, event } = await setup();
    const otherEvent = await createEvent(asActor(organizer.id), { slug: `judge-invite-other-${serial}`, name: "Other event", timezone: "UTC" });
    const mismatch = await createJudgeInvitation(asActor(organizer.id), event.id, judge.email);
    await expect(acceptJudgeInvitation(asActor(other.id), event.id, mismatch.token)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await expect(acceptJudgeInvitation(asActor(judge.id), otherEvent.id, mismatch.token)).rejects.toMatchObject({ code: "INVITATION_INVALID" });

    const expired = await createJudgeInvitation(asActor(organizer.id), event.id, judge.email);
    await db.update(schema.judgeInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.judgeInvitations.id, expired.invitation.id));
    await expect(acceptJudgeInvitation(asActor(judge.id), event.id, expired.token)).rejects.toMatchObject({ code: "INVITATION_INVALID" });

    const revoked = await createJudgeInvitation(asActor(organizer.id), event.id, judge.email);
    await revokeJudgeInvitation(asActor(organizer.id), event.id, revoked.invitation.id);
    await expect(acceptJudgeInvitation(asActor(judge.id), event.id, revoked.token)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("denies invitation management to a deactivated organizer membership", async () => {
    const { organizer, judge, event } = await setup();
    const existing = await createJudgeInvitation(asActor(organizer.id), event.id, judge.email);
    await db.update(schema.eventMemberships)
      .set({ isActive: false })
      .where(and(
        eq(schema.eventMemberships.eventId, event.id),
        eq(schema.eventMemberships.userId, organizer.id),
      ));

    await expect(listJudgeInvitations(asActor(organizer.id), event.id))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createJudgeInvitation(asActor(organizer.id), event.id, judge.email))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revokeJudgeInvitation(asActor(organizer.id), event.id, existing.invitation.id))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
