import { describe, expect, it } from "vitest";

import { sessionDate } from "./sessionDate.ts";

// Noon UTC, so the day is the same in every time zone a test machine runs in.
const noon = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 12);

describe("a session's date", () => {
  it("is the month and day within this year", () => {
    expect(sessionDate(noon(2026, 10, 29), noon(2026, 12, 1))).toBe("Oct 29");
  });

  it("carries the year when it is not this one", () => {
    expect(sessionDate(noon(2025, 10, 29), noon(2026, 1, 2))).toBe("Oct 29, 2025");
  });
});
