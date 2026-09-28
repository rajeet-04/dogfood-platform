import type { CustomQuestion, EventState } from "@dogfood/db";
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


export function validateCustomAnswers(
  questions: CustomQuestion[],
  answers: Record<string, string>,
  forSubmission: boolean,
): Record<string, string> {
  const known = new Set(questions.map((question) => question.id));
  const normalized: Record<string, string> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (!known.has(id) || typeof value !== "string" || value.length > 4_000) {
      throw new DogfoodError("VALIDATION_FAILED", "Invalid custom answer");
    }
    const text = value.trim();
    if (text) normalized[id] = text;
  }
  if (forSubmission && questions.some((question) => question.required && !normalized[question.id])) {
    throw new DogfoodError("SUBMISSION_INCOMPLETE", "A required custom answer is missing");
  }
  return normalized;
}

export function assertProjectUnlocked(project: { state: string }): void {
  if (project.state === "LOCKED") {
    throw new DogfoodError(
      "CONFLICT",
      "Submissions are locked for this project",
    );
  }
}
