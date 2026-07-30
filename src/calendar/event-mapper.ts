import type { Message } from "../domain/message.js";
import type { ProposedAction } from "../domain/proposed-action.js";
import type { ApprovedActionPayload } from "../db/repositories/proposed-actions.js";
import type { FamilyConfig } from "../config.js";

export function actionToApprovedPayload(
  action: ProposedAction,
): ApprovedActionPayload {
  if (action.approvedPayloadJson) {
    return JSON.parse(action.approvedPayloadJson) as ApprovedActionPayload;
  }

  return {
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
}

export function formatEventTitle(
  payload: ApprovedActionPayload,
): string {
  const childPrefix = payload.childName ? `${payload.childName} ` : "";

  switch (payload.actionType) {
    case "school_closure":
      return "School Closed";
    case "deadline":
      return payload.childName
        ? `Permission Slip Due — ${payload.childName}`
        : payload.title;
    case "bring_item":
      return payload.childName
        ? `Bring Item — ${payload.childName}`
        : payload.title;
    default:
      if (payload.title.toLowerCase().startsWith(payload.childName?.toLowerCase() ?? "")) {
        return payload.title;
      }
      return `${childPrefix}${payload.title}`.trim();
  }
}

export function buildEventDescription(
  payload: ApprovedActionPayload,
  message: Message,
): string {
  const lines = [
    payload.childName ? `For: ${payload.childName}` : null,
    `Source: ${message.subject}`,
    `From: ${message.senderName ? `${message.senderName} <${message.senderEmail}>` : message.senderEmail}`,
    `Received: ${message.receivedAt}`,
    "",
    payload.description ?? payload.title,
    "",
    "Created by Family Executive Assistant.",
    `Gmail message ID: ${message.gmailMessageId}`,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

export function resolveReminderMinutes(
  payload: ApprovedActionPayload,
  family: FamilyConfig,
): number[] {
  if (payload.reminderOffsetsMinutes.length > 0) {
    return payload.reminderOffsetsMinutes;
  }

  return payload.allDay
    ? family.defaultAllDayReminderMinutes
    : family.defaultTimedEventReminderMinutes;
}

export function computeEndAt(
  payload: ApprovedActionPayload,
  family: FamilyConfig,
): string | null {
  if (payload.endAt) {
    return payload.endAt;
  }

  if (!payload.startAt || payload.allDay) {
    return payload.startAt;
  }

  const start = new Date(payload.startAt);
  start.setMinutes(
    start.getMinutes() + family.defaultEventDurationMinutes,
  );
  return start.toISOString();
}

export interface GoogleCalendarEventInput {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: "popup" | "email"; minutes: number }>;
  };
}

export function mapToGoogleEvent(
  payload: ApprovedActionPayload,
  message: Message,
  family: FamilyConfig,
): GoogleCalendarEventInput {
  const summary = formatEventTitle(payload);
  const description = buildEventDescription(payload, message);
  const endAt = computeEndAt(payload, family);
  const reminders = resolveReminderMinutes(payload, family);

  if (!payload.startAt) {
    throw new Error("Approved action is missing startAt");
  }

  const event: GoogleCalendarEventInput = {
    summary,
    description,
    reminders: {
      useDefault: false,
      overrides: reminders.map((minutes) => ({
        method: "popup" as const,
        minutes,
      })),
    },
    start: { dateTime: payload.startAt, timeZone: family.timezone },
    end: { dateTime: payload.startAt, timeZone: family.timezone },
  };

  if (payload.location) {
    event.location = payload.location;
  }

  if (payload.allDay) {
    const startDate = payload.startAt.slice(0, 10);
    let endDate = endAt ? endAt.slice(0, 10) : startDate;

    if (endDate <= startDate) {
      const nextDay = new Date(`${startDate}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().slice(0, 10);
    }

    event.start = { date: startDate, timeZone: family.timezone };
    event.end = { date: endDate, timeZone: family.timezone };
  } else {
    event.start = {
      dateTime: payload.startAt,
      timeZone: family.timezone,
    };
    event.end = {
      dateTime: endAt ?? payload.startAt,
      timeZone: family.timezone,
    };
  }

  return event;
}

export function isCalendarWritableAction(
  payload: ApprovedActionPayload,
): boolean {
  return (
    payload.actionType !== "informational" &&
    payload.actionType !== "needs_review" &&
    payload.startAt !== null
  );
}
