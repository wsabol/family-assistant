import { describe, expect, it } from "vitest";

import type { Message } from "../../src/domain/message.js";
import type { ProposedAction } from "../../src/domain/proposed-action.js";
import {
  describeEventRevision,
  formatEventTitle,
  isCalendarWritableAction,
  mapToGoogleEvent,
  mergeEventUpdatePayload,
  prependEventRevision,
} from "../../src/calendar/event-mapper.js";

const family = {
  timezone: "America/Chicago",
  schoolCalendarId: "calendar-id",
  gmailLabel: "School",
  children: [],
  defaultEventDurationMinutes: 60,
  defaultAllDayReminderMinutes: [1080],
  defaultTimedEventReminderMinutes: [60],
};

const message: Message = {
  id: 1,
  gmailMessageId: "gmail-123",
  gmailThreadId: null,
  subject: "Field trip next Friday",
  senderName: "Teacher",
  senderEmail: "teacher@school.edu",
  receivedAt: "2026-03-01T10:00:00.000Z",
  bodyText: "Please join us",
  rawBodyText: "Please join us",
  sourceLabel: "School",
  status: "processed",
  attemptCount: 1,
  lastError: null,
  modelName: "gpt-4o-mini",
  promptVersion: "school-email-v1",
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

function buildAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    id: 10,
    messageId: 1,
    actionType: "calendar_event",
    childName: "Harlee",
    title: "Field Trip",
    startAt: "2026-03-10T14:00:00.000Z",
    endAt: null,
    allDay: false,
    location: "Museum",
    description: "Bring lunch",
    reminderOffsetsMinutes: [60],
    confidence: 0.9,
    ambiguityReason: null,
    interpretationSummary: "Friday interpreted as next Friday",
    sourceExcerpt: "field trip next Friday at 2pm",
    matchedActionId: null,
    eventRelationship: null,
    dedupeReasoning: null,
    dedupeConfidence: null,
    originalPayloadJson: "{}",
    approvedPayloadJson: null,
    status: "approved",
    createdAt: "2026-03-01T10:00:00.000Z",
    reviewedAt: "2026-03-01T11:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("formatEventTitle", () => {
  it("prefixes child name for calendar events", () => {
    const action = buildAction();
    const payload = {
      actionType: action.actionType,
      childName: action.childName,
      title: action.title,
      startAt: action.startAt,
      endAt: action.endAt,
      allDay: action.allDay,
      location: action.location,
      description: action.description,
      reminderOffsetsMinutes: action.reminderOffsetsMinutes,
    };

    expect(formatEventTitle(payload)).toBe("Harlee Field Trip");
  });

  it("preserves the specific title for deadlines and bring-item actions", () => {
    const action = buildAction();
    const payload = {
      actionType: "deadline" as const,
      childName: action.childName,
      title: "Submit Course Selection Sheets",
      startAt: action.startAt,
      endAt: action.endAt,
      allDay: action.allDay,
      location: action.location,
      description: action.description,
      reminderOffsetsMinutes: action.reminderOffsetsMinutes,
    };

    expect(formatEventTitle(payload)).toBe(
      "Harlee Submit Course Selection Sheets",
    );
    expect(
      formatEventTitle({
        ...payload,
        actionType: "bring_item",
        title: "Bring Choir Uniform",
      }),
    ).toBe("Harlee Bring Choir Uniform");
  });
});

describe("mapToGoogleEvent", () => {
  it("maps timed events with computed end time", () => {
    const action = buildAction();
    const payload = {
      actionType: action.actionType,
      childName: action.childName,
      title: action.title,
      startAt: action.startAt,
      endAt: action.endAt,
      allDay: action.allDay,
      location: action.location,
      description: action.description,
      reminderOffsetsMinutes: action.reminderOffsetsMinutes,
    };

    const event = mapToGoogleEvent(payload, message, family);

    expect(event.summary).toBe("Harlee Field Trip");
    expect(event.start.dateTime).toBe("2026-03-10T14:00:00.000Z");
    expect(event.end.dateTime).toBeTruthy();
    expect(event.description).toContain("gmail-123");
  });

  it("maps all-day events with exclusive end date", () => {
    const action = buildAction({
      allDay: true,
      startAt: "2026-03-10",
      endAt: null,
    });
    const payload = {
      actionType: action.actionType,
      childName: action.childName,
      title: action.title,
      startAt: action.startAt,
      endAt: action.endAt,
      allDay: action.allDay,
      location: action.location,
      description: action.description,
      reminderOffsetsMinutes: action.reminderOffsetsMinutes,
    };

    const event = mapToGoogleEvent(payload, message, family);

    expect(event.start.date).toBe("2026-03-10");
    expect(event.end.date).toBe("2026-03-11");
  });
});

describe("event updates", () => {
  it("merges partial updates and resets the old end when start changes", () => {
    const previous = {
      actionType: "calendar_event" as const,
      childName: "Harlee",
      title: "Choir Concert",
      startAt: "2026-10-20T18:00:00-05:00",
      endAt: "2026-10-20T19:00:00-05:00",
      allDay: false,
      location: "Auditorium",
      description: "Fall concert",
      reminderOffsetsMinutes: [60],
    };
    const update = {
      ...previous,
      startAt: "2026-10-20T19:00:00-05:00",
      endAt: null,
      location: null,
      description: "Concert begins one hour later.",
      reminderOffsetsMinutes: [],
    };

    expect(mergeEventUpdatePayload(previous, update)).toEqual({
      ...update,
      endAt: null,
      location: "Auditorium",
      reminderOffsetsMinutes: [60],
    });
  });

  it("prepends newest revisions above the existing event body", () => {
    const description = prependEventRevision(
      "UPDATE 2026-10-10:\nLocation changed.\n\nOriginal body",
      "2026-10-17",
      "Start changed.",
    );

    expect(description).toBe(
      "UPDATE 2026-10-17:\nStart changed.\n\nUPDATE 2026-10-10:\nLocation changed.\n\nOriginal body",
    );
    expect(
      describeEventRevision(
        {
          actionType: "calendar_event",
          childName: "Harlee",
          title: "Concert",
          startAt: "2026-10-20T18:00:00-05:00",
          endAt: null,
          allDay: false,
          location: "Gym",
          description: "Original",
          reminderOffsetsMinutes: [],
        },
        {
          actionType: "calendar_event",
          childName: "Harlee",
          title: "Concert",
          startAt: "2026-10-20T19:00:00-05:00",
          endAt: null,
          allDay: false,
          location: "Auditorium",
          description: "Updated",
          reminderOffsetsMinutes: [],
        },
      ),
    ).toContain("Start changed");
  });
});

describe("isCalendarWritableAction", () => {
  it("rejects informational actions", () => {
    expect(
      isCalendarWritableAction({
        actionType: "informational",
        childName: null,
        title: "Newsletter",
        startAt: "2026-03-10",
        endAt: null,
        allDay: true,
        location: null,
        description: null,
        reminderOffsetsMinutes: [],
      }),
    ).toBe(false);
  });
});
