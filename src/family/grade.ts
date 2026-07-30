export function getLocalYearMonth(
  date: Date,
  timezone: string,
): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Failed to resolve local date in timezone ${timezone}`);
  }

  return { year, month };
}

/**
 * School year starts in the fall. After May (June–December) counts as the
 * next school year; January–May is still the current school year.
 */
export function getSchoolYearStartYear(year: number, month: number): number {
  if (month > 5) {
    return year;
  }

  return year - 1;
}

export function getCurrentSchoolYearStart(
  timezone: string,
  now = new Date(),
): number {
  const { year, month } = getLocalYearMonth(now, timezone);
  return getSchoolYearStartYear(year, month);
}

/** Grade number where 0 = kindergarten, 1 = first grade, etc. */
export function computeGradeNumber(
  startedKindergarten: number,
  timezone: string,
  now = new Date(),
): number {
  const schoolYearStart = getCurrentSchoolYearStart(timezone, now);
  return schoolYearStart - startedKindergarten;
}

export function formatGradeLabel(gradeNumber: number): string {
  if (gradeNumber <= 0) {
    return "K";
  }

  return String(gradeNumber);
}

export function formatGradeDisplay(gradeNumber: number): string {
  if (gradeNumber <= 0) {
    return "Kindergarten";
  }

  return `${gradeNumber}${ordinalSuffix(gradeNumber)} grade`;
}

function ordinalSuffix(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export interface ChildWithKindergartenYear {
  startedKindergarten: number;
}

export function getChildGradeLabel(
  child: ChildWithKindergartenYear,
  timezone: string,
  now = new Date(),
): string {
  return formatGradeLabel(
    computeGradeNumber(child.startedKindergarten, timezone, now),
  );
}

export function getChildGradeDisplay(
  child: ChildWithKindergartenYear,
  timezone: string,
  now = new Date(),
): string {
  return formatGradeDisplay(
    computeGradeNumber(child.startedKindergarten, timezone, now),
  );
}
