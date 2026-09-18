import { describe, expect, it } from "vitest";

import type { Message } from "../../src/domain/message.js";
import type { ProposedAction } from "../../src/domain/proposed-action.js";
import {
  buildGmailMessageUrl,
  mergeEventDescriptions,
  formatEventTitle,
  isCalendarWritableAction,
  mapToGoogleEvent,
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
    expect(event.description).toBe(
      [
        "For: Harlee",
        "",
        "Bring lunch",
        "",
        `Gmail: ${buildGmailMessageUrl("gmail-123")}`,
        "Created by Family Assistant.",
      ].join("\n"),
    );
    expect(event.description).not.toContain("Source:");
    expect(event.description).not.toContain("From:");
    expect(event.description).not.toContain("Received:");
    expect(event).not.toHaveProperty("attendees");
    expect(event).not.toHaveProperty("conferenceData");
    expect(event).not.toHaveProperty("hangoutLink");
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

  it("does not add leading blank lines when an event has no child", () => {
    const action = buildAction({
      childName: null,
      description: "School-wide fundraiser",
    });
    const event = mapToGoogleEvent(
      {
        actionType: action.actionType,
        childName: action.childName,
        title: action.title,
        startAt: action.startAt,
        endAt: action.endAt,
        allDay: action.allDay,
        location: action.location,
        description: action.description,
        reminderOffsetsMinutes: action.reminderOffsetsMinutes,
      },
      message,
      family,
    );

    expect(event.description.startsWith("\n")).toBe(false);
    expect(event.description).toContain("School-wide fundraiser");
  });
});

describe("mergeEventDescriptions", () => {
  it("incorporates new email details and Gmail links without duplicating the footer", () => {
    const merged = mergeEventDescriptions(
      [
        "For: Harlee",
        "",
        "Bring lunch",
        "",
        "Gmail: https://mail.google.com/mail/u/0/#all/original",
        "Created by Family Assistant.",
      ].join("\n"),
      [
        "For: Harlee",
        "",
        "Bus leaves at 8:15.",
        "",
        "Gmail: https://mail.google.com/mail/u/0/#all/update",
        "Created by Family Assistant.",
      ].join("\n"),
    );

    expect(merged).toBe(
      [
        "For: Harlee",
        "Bring lunch",
        "Bus leaves at 8:15.",
        "",
        "Gmail: https://mail.google.com/mail/u/0/#all/original",
        "Gmail: https://mail.google.com/mail/u/0/#all/update",
        "Created by Family Assistant.",
      ].join("\n"),
    );
  });

  it("normalizes old metadata footers into the current Gmail link format", () => {
    const merged = mergeEventDescriptions(
      "For: Harlee\nCreated by Family Executive Assistant.\nGmail message ID: gmail-123",
      "For: Harlee\nCreated by Family Assistant.",
    );

    expect(merged).toContain(`Gmail: ${buildGmailMessageUrl("gmail-123")}`);
    expect(merged).not.toContain("Gmail message ID:");
    expect(merged).not.toContain("Family Executive Assistant");
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
