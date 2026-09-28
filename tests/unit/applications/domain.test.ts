import { describe, expect, it } from "vitest";

import {
  JUDGE_APPLICATION_STATUS_LABEL,
  assertJudgeApplicationStatus,
} from "@dogfood/applications";

describe("judge application domain", () => {
  it("labels every status", () => {
    expect(JUDGE_APPLICATION_STATUS_LABEL.pending).toBe("Pending");
    expect(JUDGE_APPLICATION_STATUS_LABEL.approved).toBe("Approved");
    expect(JUDGE_APPLICATION_STATUS_LABEL.rejected).toBe("Rejected");
    expect(JUDGE_APPLICATION_STATUS_LABEL.revoked).toBe("Revoked");
  });

  it("asserts known statuses and rejects unknown ones", () => {
    expect(assertJudgeApplicationStatus("pending")).toBe("pending");
    expect(assertJudgeApplicationStatus("approved")).toBe("approved");
    expect(() => assertJudgeApplicationStatus("banana")).toThrow(
      "Unknown judge application status",
    );
  });
});