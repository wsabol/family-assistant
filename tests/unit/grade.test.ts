import { describe, expect, it } from "vitest";

import {
  computeGradeNumber,
  formatGradeDisplay,
  getCurrentSchoolYearStart,
  getSchoolYearStartYear,
} from "../../src/family/grade.js";

const timezone = "America/Chicago";

describe("getSchoolYearStartYear", () => {
  it("treats January through May as the prior fall's school year", () => {
    expect(getSchoolYearStartYear(2026, 2)).toBe(2025);
  });

  it("treats June through December as the current year's school year", () => {
    expect(getSchoolYearStartYear(2026, 7)).toBe(2026);
  });
});

describe("computeGradeNumber", () => {
  it("returns 5th grade in February 2026 for kindergarten started in 2020", () => {
    const grade = computeGradeNumber(
      2020,
      timezone,
      new Date("2026-02-15T12:00:00Z"),
    );

    expect(grade).toBe(5);
    expect(formatGradeDisplay(grade)).toBe("5th grade");
  });

  it("returns 6th grade after May in 2026 for kindergarten started in 2020", () => {
    const grade = computeGradeNumber(
      2020,
      timezone,
      new Date("2026-07-15T12:00:00Z"),
    );

    expect(grade).toBe(6);
    expect(formatGradeDisplay(grade)).toBe("6th grade");
  });
});

describe("getCurrentSchoolYearStart", () => {
  it("uses family timezone for the school-year boundary", () => {
    expect(
      getCurrentSchoolYearStart(timezone, new Date("2026-05-31T12:00:00Z")),
    ).toBe(2025);
    expect(
      getCurrentSchoolYearStart(timezone, new Date("2026-06-01T12:00:00Z")),
    ).toBe(2026);
  });
});
