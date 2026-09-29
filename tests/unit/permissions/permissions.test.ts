import { describe, expect, it } from "vitest";

import { can, requirePermission } from "@dogfood/permissions";
import type {
  EventRole,
  EventState,
  PermissionContext,
} from "@dogfood/permissions";
import { ACTION } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

function actor(userId: string, isPlatformAdmin = false): Actor {
  return { userId, isPlatformAdmin };
}

function ctx(overrides: Partial<PermissionContext>): PermissionContext {
  return {
    eventId: "event-1",
    resourceEventId: "event-1",
    roles: [],
    eventState: "SUBMISSIONS_OPEN",
    ...overrides,
  };
}

describe("permission matrix", () => {
  it("lets a participant manage their own project before lock", () => {
    const granted = can(actor("u1"), ACTION.PROJECT_MANAGE, ctx({
      roles: ["PARTICIPANT"],
      ownsProject: true,
    }));
    expect(granted).toBe(true);
  });

  it("denies project management when the participant does not own the project", () => {
    expect(
      can(actor("u1"), ACTION.PROJECT_MANAGE, ctx({
        roles: ["PARTICIPANT"],
        ownsProject: false,
      })),
    ).toBe(false);
  });

  it("lets a judge read an assigned project", () => {
    expect(
      can(actor("j1"), ACTION.PROJECT_READ_ASSIGNED, ctx({
        roles: ["JUDGE"],
        isAssigned: true,
      })),
    ).toBe(true);
  });

  it("denies a judge from reading an unassigned project", () => {
    expect(
      can(actor("j1"), ACTION.PROJECT_READ_ASSIGNED, ctx({
        roles: ["JUDGE"],
        isAssigned: false,
      })),
    ).toBe(false);
  });

  it("denies a participant from reading an unassigned judge-only project", () => {
    expect(
      can(actor("p1"), ACTION.PROJECT_READ_ASSIGNED, ctx({
        roles: ["PARTICIPANT"],
        isAssigned: false,
      })),
    ).toBe(false);
  });

  it("lets an organizer configure the event but not a participant or judge", () => {
    expect(can(actor("o1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["ORGANIZER"] }))).toBe(true);
    expect(can(actor("p1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["PARTICIPANT"] }))).toBe(false);
    expect(can(actor("j1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["JUDGE"] }))).toBe(false);
  });

  it("denies an organizer from submitting a judge evaluation", () => {
    const submitted = can(actor("o1"), ACTION.EVALUATION_SUBMIT, ctx({
      roles: ["ORGANIZER"],
      isAssigned: true,
    }));
    expect(submitted).toBe(false);
  });

  it("lets a judge submit an evaluation they are assigned to", () => {
    expect(
      can(actor("j1"), ACTION.EVALUATION_SUBMIT, ctx({
        roles: ["JUDGE"],
        isAssigned: true,
      })),
    ).toBe(true);
  });

  it("lets an organizer inspect raw evaluations at any stage", () => {
    expect(
      can(actor("o1"), ACTION.EVALUATION_READ, ctx({
        roles: ["ORGANIZER"],
        eventState: "JUDGING",
      })),
    ).toBe(true);
  });

  it("lets a judge read only their own evaluation", () => {
    expect(
      can(actor("j1"), ACTION.EVALUATION_READ, ctx({
        roles: ["JUDGE"],
        ownsEvaluation: true,
      })),
    ).toBe(true);
    expect(
      can(actor("j1"), ACTION.EVALUATION_READ, ctx({
        roles: ["JUDGE"],
        ownsEvaluation: false,
      })),
    ).toBe(false);
  });

  it("denies any resource action from a different event", () => {
    const foreign = ctx({
      roles: ["ORGANIZER"],
      resourceEventId: "event-2",
    });
    expect(can(actor("o1"), ACTION.PROJECT_MANAGE, foreign)).toBe(false);
    expect(can(actor("o1"), ACTION.EVALUATION_SUBMIT, foreign)).toBe(false);
    expect(can(actor("o1"), ACTION.EVENT_CONFIGURE, foreign)).toBe(false);
  });

  it("lets a platform admin bypass role restrictions", () => {
    expect(
      can(actor("a1", true), ACTION.EVALUATION_SUBMIT, ctx({ roles: [] })),
    ).toBe(true);
  });

  it("requirePermission throws FORBIDDEN when denied and returns void when allowed", () => {
    expect(() =>
      requirePermission(actor("p1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["PARTICIPANT"] })),
    ).toThrow(DogfoodError);
    expect(() =>
      requirePermission(actor("p1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["PARTICIPANT"] })),
    ).toThrowError("FORBIDDEN");

    expect(
      requirePermission(actor("o1"), ACTION.EVENT_CONFIGURE, ctx({ roles: ["ORGANIZER"] })),
    ).toBeUndefined();
  });

  it("allows any signed-in actor to join an event at the policy level", () => {
    expect(can(actor("u1"), ACTION.EVENT_JOIN, ctx({ roles: [] }))).toBe(true);
    expect(can(actor("u1"), ACTION.EVENT_JOIN, ctx({ roles: ["PARTICIPANT"] }))).toBe(true);
    expect(can(actor("o1"), ACTION.EVENT_JOIN, ctx({ roles: ["ORGANIZER"] }))).toBe(true);
    expect(can(actor("j1"), ACTION.EVENT_JOIN, ctx({ roles: ["JUDGE"] }))).toBe(true);
  });

  it("allows any signed-in actor to apply as a judge at the policy level", () => {
    expect(can(actor("u1"), ACTION.JUDGE_APPLY, ctx({ roles: [] }))).toBe(true);
    expect(can(actor("o1"), ACTION.JUDGE_APPLY, ctx({ roles: ["ORGANIZER"] }))).toBe(true);
  });

  it("keeps judge application management organizer-only", () => {
    expect(
      can(actor("o1"), ACTION.JUDGE_APPLICATION_MANAGE, ctx({
        roles: ["ORGANIZER"],
      })),
    ).toBe(true);
    expect(
      can(actor("p1"), ACTION.JUDGE_APPLICATION_MANAGE, ctx({
        roles: ["PARTICIPANT"],
      })),
    ).toBe(false);
    expect(
      can(actor("j1"), ACTION.JUDGE_APPLICATION_MANAGE, ctx({
        roles: ["JUDGE"],
      })),
    ).toBe(false);
    expect(
      can(actor("u1"), ACTION.JUDGE_APPLICATION_MANAGE, ctx({ roles: [] })),
    ).toBe(false);
  });

  it("keeps member management organizer-only", () => {
    expect(can(actor("o1"), ACTION.MEMBER_INVITE, ctx({ roles: ["ORGANIZER"] }))).toBe(true);
    expect(can(actor("o1"), ACTION.MEMBER_REMOVE, ctx({ roles: ["ORGANIZER"] }))).toBe(true);
    expect(can(actor("p1"), ACTION.MEMBER_INVITE, ctx({ roles: ["PARTICIPANT"] }))).toBe(false);
    expect(can(actor("j1"), ACTION.MEMBER_REMOVE, ctx({ roles: ["JUDGE"] }))).toBe(false);
    expect(can(actor("u1"), ACTION.MEMBER_INVITE, ctx({ roles: [] }))).toBe(false);
  });
});