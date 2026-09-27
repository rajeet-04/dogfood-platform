import type { EventState } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

export type SubmissionWindowEvent = {
  state: EventState;
  submissionOpensAt: Date | null;
  submissionClosesAt: Date | null;
};

export function assertSubmissionWindow(
  serverNow: Date,
  event: SubmissionWindowEvent,
): void {
  if (event.state !== "SUBMISSIONS_OPEN") {
    throw new DogfoodError(
      "DEADLINE_PASSED",
      "Submissions are not currently open",
    );
  }
  if (event.submissionOpensAt && serverNow < event.submissionOpensAt) {
    throw new DogfoodError("DEADLINE_PASSED", "Submissions have not opened");
  }
  if (event.submissionClosesAt && !(serverNow < event.submissionClosesAt)) {
    throw new DogfoodError(
      "DEADLINE_PASSED",
      "The submission deadline has passed",
    );
  }
}

export function validateSubmissionCompleteness(
  revision: { title: string | null; description: string | null },
): boolean {
  return Boolean(revision.title?.trim() && revision.description?.trim());
}