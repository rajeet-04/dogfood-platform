import { describe, expect, it } from "vitest";

import { parseUtcDatetime, validateWindowOrder } from "../../../apps/web/lib/event-schedule";
import { getEventWindowSections } from "../../../apps/web/lib/event-window-fields";
import { toUtcLocalInput } from "../../../apps/web/lib/format";

describe("event schedule form fields", () => {
  it("maps each enabled window to labeled datetime controls", () => {
    const sections = getEventWindowSections([
      "registration",
      "submission",
      "judging",
    ]);

    expect(sections.flatMap((section) => section.fields)).toEqual([
      { label: "Registration opens", name: "registrationOpensAt" },
      { label: "Registration closes", name: "registrationClosesAt" },
      { label: "Submission opens", name: "submissionOpensAt" },
      { label: "Submission closes", name: "submissionClosesAt" },
      { label: "Judging opens", name: "judgingOpensAt" },
      { label: "Judging closes", name: "judgingClosesAt" },
    ]);
  });

  it("only renders the windows supported by the current editor", () => {
    expect(getEventWindowSections(["registration"]).flatMap((section) => section.fields)).toEqual([
      { label: "Registration opens", name: "registrationOpensAt" },
      { label: "Registration closes", name: "registrationClosesAt" },
    ]);
  });
});

describe("UTC event date-time parsing", () => {
  it("treats datetime-local values as UTC and allows empty boundaries", () => {
    expect(parseUtcDatetime("2026-09-28T09:30")?.toISOString()).toBe(
      "2026-09-28T09:30:00.000Z",
    );
    expect(parseUtcDatetime("")).toBeNull();
    expect(parseUtcDatetime(null)).toBeNull();
  });

  it("rejects invalid local date-time values", () => {
    expect(() => parseUtcDatetime("2026-02-30T09:30")).toThrow(
      "Enter a valid date and time.",
    );
  });

  it("requires each configured window to open before it closes", () => {
    expect(
      validateWindowOrder(
        new Date("2026-09-28T10:00:00Z"),
        new Date("2026-09-28T10:00:00Z"),
        "Registration",
      ),
    ).toBe("Registration open must be earlier than close.");
    expect(
      validateWindowOrder(
        new Date("2026-09-28T10:00:00Z"),
        new Date("2026-09-28T11:00:00Z"),
        "Submission",
      ),
    ).toBeNull();
  });

  it("formats existing boundaries as UTC wall-clock values", () => {
    expect(toUtcLocalInput("2026-09-28T09:30:00.000Z")).toBe(
      "2026-09-28T09:30",
    );
  });
});
