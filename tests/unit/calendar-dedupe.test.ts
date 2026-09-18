import { describe, expect, it } from "vitest";
import type { calendar_v3 } from "googleapis";

import type { ApprovedActionPayload } from "../../src/db/repositories/proposed-actions.js";
import type { GoogleCalendarEventInput } from "../../src/calendar/event-mapper.js";
import { isMatchingCalendarEvent } from "../../src/calendar/write.js";

function buildPayload(
  overrides: Partial<ApprovedActionPayload> = {},
): ApprovedActionPayload {
  return {
    actionType: "calendar_event",
    childName: "Oaklee",
    title: "Field Trip",
    startAt: "2026-09-11T13:30:00.000Z",
    endAt: "2026-09-11T17:00:00.000Z",
    allDay: false,
    location: null,
    description: null,
    reminderOffsetsMinutes: [],
    ...overrides,
  };
}

function buildEventBody(
  overrides: Partial<GoogleCalendarEventInput> = {},
): GoogleCalendarEventInput {
  return {
    summary: "Oaklee Field Trip",
    description: "For: Oaklee\nSource: School note",
    start: {
      dateTime: "2026-09-11T13:30:00.000Z",
      timeZone: "America/Chicago",
    },
    end: {
      dateTime: "2026-09-11T17:00:00.000Z",
      timeZone: "America/Chicago",
    },
    ...overrides,
  };
}

describe("isMatchingCalendarEvent", () => {
  it("matches the same child at the same timed event slot", () => {
    const existing: calendar_v3.Schema$Event = {
      summary: "Oaklee Fischer Park Field Trip",
      description: "For: Oaklee\nCreated by Family Executive Assistant.",
      start: { dateTime: "2026-09-11T13:30:00.000Z" },
      end: { dateTime: "2026-09-11T17:00:00.000Z" },
    };

    expect(
      isMatchingCalendarEvent(existing, buildEventBody(), buildPayload()),
    ).toBe(true);
  });

  it("allows a different child at the same timed event slot", () => {
    const existing: calendar_v3.Schema$Event = {
      summary: "Harlee Field Trip",
      description: "For: Harlee\nCreated by Family Executive Assistant.",
      start: { dateTime: "2026-09-11T13:30:00.000Z" },
      end: { dateTime: "2026-09-11T17:00:00.000Z" },
    };

    expect(
      isMatchingCalendarEvent(existing, buildEventBody(), buildPayload()),
    ).toBe(false);
  });

  it("allows the same child at a different time", () => {
    const existing: calendar_v3.Schema$Event = {
      summary: "Oaklee Field Trip",
      description: "For: Oaklee\nCreated by Family Executive Assistant.",
      start: { dateTime: "2026-09-11T14:30:00.000Z" },
      end: { dateTime: "2026-09-11T18:00:00.000Z" },
    };

    expect(
      isMatchingCalendarEvent(existing, buildEventBody(), buildPayload()),
    ).toBe(false);
  });

  it("matches all-day events by child and date", () => {
    const existing: calendar_v3.Schema$Event = {
      summary: "Oaklee Permission Slip Due",
      description: "For: Oaklee",
      start: { date: "2026-09-11" },
      end: { date: "2026-09-12" },
    };

    expect(
      isMatchingCalendarEvent(
        existing,
        buildEventBody({
          summary: "Oaklee Permission Slip Due",
          start: { date: "2026-09-11", timeZone: "America/Chicago" },
          end: { date: "2026-09-12", timeZone: "America/Chicago" },
        }),
        buildPayload({
          actionType: "deadline",
          title: "Permission Slip Due",
          startAt: "2026-09-11",
          endAt: null,
          allDay: true,
        }),
      ),
    ).toBe(true);
  });
});
