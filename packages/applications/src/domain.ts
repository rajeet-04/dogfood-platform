import type { JudgeApplicationStatus } from "@dogfood/db";

export const JUDGE_APPLICATION_STATUS_LABEL: Record<
  JudgeApplicationStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

export function assertJudgeApplicationStatus(
  value: string,
): JudgeApplicationStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "revoked"
  ) {
    return value;
  }
  throw new Error(`Unknown judge application status: ${value}`);
}