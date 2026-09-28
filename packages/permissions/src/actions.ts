export const ACTION = {
  EVENT_CONFIGURE: "event:configure",
  EVENT_TRANSITION: "event:transition",
  TRACK_MANAGE: "track:manage",
  PRIZE_MANAGE: "prize:manage",
  QUESTION_MANAGE: "question:manage",
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  EVENT_JOIN: "event:join",
  JUDGE_APPLY: "judge:apply",
  JUDGE_APPLICATION_MANAGE: "judge_application:manage",
  PROJECT_MANAGE: "project:manage",
  PROJECT_READ_PUBLIC: "project:read:public",
  PROJECT_READ_ASSIGNED: "project:read:assigned",
  EVALUATION_SUBMIT: "evaluation:submit",
  EVALUATION_READ: "evaluation:read",
  TEAM_JOIN: "team:join",
  TEAM_MANAGE: "team:manage",
  RANKING_GENERATE: "ranking:generate",
  EXPORT_EVENT: "export:event",
  READ_AUDIT: "audit:read",
} as const;

export type Action = (typeof ACTION)[keyof typeof ACTION];