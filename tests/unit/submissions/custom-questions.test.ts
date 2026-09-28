import { describe, expect, it } from "vitest";

import { validateCustomAnswers } from "@dogfood/submissions";

const questions = [
  { id: "why", prompt: "Why this project?", required: true, visibility: "PUBLIC" as const, order: 0 },
  { id: "notes", prompt: "Anything else?", required: false, visibility: "ORGANIZER_ONLY" as const, order: 1 },
];

describe("custom submission answers", () => {
  it("allows incomplete drafts but requires nonblank answers when submitting", () => {
    expect(validateCustomAnswers(questions, {}, false)).toEqual({});
    expect(() => validateCustomAnswers(questions, { why: "   " }, true)).toThrowError(
      expect.objectContaining({ code: "SUBMISSION_INCOMPLETE" }),
    );
    expect(validateCustomAnswers(questions, { why: "  Useful  " }, true)).toEqual({
      why: "Useful",
    });
  });

  it("rejects unknown question IDs and answers over 4,000 characters", () => {
    expect(() => validateCustomAnswers(questions, { surprise: "x" }, false)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => validateCustomAnswers(questions, { why: "x".repeat(4001) }, false)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });
});
