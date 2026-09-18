import type { calendar_v3 } from "googleapis";
import type { Logger } from "pino";

import { type AppConfig } from "../config.js";
import { CalendarLinksRepository } from "../db/repositories/calendar-links.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import { type ApprovedActionPayload } from "../db/repositories/proposed-actions.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";
import { createCalendarClient } from "./client.js";
import { isGoogleAuthError } from "../google/oauth.js";
import { recordAuthFailure } from "../health/monitor.js";
import {
  actionToApprovedPayload,
  isCalendarWritableAction,
  mapToGoogleEvent,
  mergeEventDescriptions,
} from "./event-mapper.js";
import {
  applyMessageLabels,
  createGmailClient,
  ensureLabel,
  FAMILY_ASSISTANT_LABELS,
  listLabelIdByName,
  withRetry,
} from "../gmail/client.js";

export interface WriteCalendarResult {
  claimed: number;
  created: number;
  skipped: number;
  failed: number;
}

export async function runCalendarWriter(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): Promise<WriteCalendarResult> {
  const actionsRepo = new ProposedActionsRepository(db);
  const linksRepo = new CalendarLinksRepository(db);
  const messagesRepo = new MessagesRepository(db);

  const staleRecovered = actionsRepo.recoverStaleWriting(
    config.env.STALE_PROCESSING_MINUTES,
  );

  if (staleRecovered > 0) {
    logger.warn({ staleRecovered }, "Recovered stale writing actions");
  }

  const calendar = await createCalendarClient(config.env).catch((error) => {
    if (isGoogleAuthError(error)) {
      recordAuthFailure(db, "calendar", error);
    }
    throw error;
  });
  const calendarId = config.family.schoolCalendarId;

  const result: WriteCalendarResult = {
    claimed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  const batchLimit = config.env.CALENDAR_BATCH_LIMIT;

  for (let i = 0; i < batchLimit; i++) {
    const action = actionsRepo.claimApproved();
    if (!action) {
      break;
    }

    result.claimed += 1;

    if (linksRepo.existsForAction(action.id)) {
      actionsRepo.markCompleted(action.id);
      result.skipped += 1;
      continue;
    }

    const payload = actionToApprovedPayload(action);

    if (!isCalendarWritableAction(payload)) {
      actionsRepo.markCompleted(action.id);
      result.skipped += 1;
      logger.warn(
        { proposedActionId: action.id },
        "Approved action is not calendar-writable; skipped calendar creation",
      );
      continue;
    }

    const message = messagesRepo.findById(action.messageId);
    if (!message) {
      actionsRepo.markFailed(action.id);
      result.failed += 1;
      continue;
    }

    try {
      const eventBody = mapToGoogleEvent(payload, message, config.family);
      const existingEvent = await findExistingCalendarEvent(
        calendar,
        calendarId,
        eventBody,
        payload,
      );

      if (existingEvent?.id) {
        const mergedDescription = mergeEventDescriptions(
          existingEvent.description,
          eventBody.description,
        );
        if (mergedDescription !== (existingEvent.description ?? "")) {
          await withRetry(() =>
            calendar.events.patch({
              calendarId,
              eventId: existingEvent.id!,
              requestBody: {
                description: mergedDescription,
              },
              conferenceDataVersion: 0,
              sendUpdates: "none",
            }),
          );
        }

        linksRepo.create(
          action.id,
          calendarId,
          existingEvent.id,
          existingEvent.htmlLink ?? null,
        );
        actionsRepo.markCompleted(action.id);
        result.skipped += 1;

        await markGmailProcessed(config, db, message.gmailMessageId, logger);

        logger.info(
          {
            operation: "link_existing_event",
            proposedActionId: action.id,
            googleEventId: existingEvent.id,
            gmailMessageId: message.gmailMessageId,
          },
          "Skipped duplicate calendar event",
        );
        continue;
      }

      const response = await withRetry(() =>
        calendar.events.insert({
          calendarId,
          conferenceDataVersion: 0,
          requestBody: eventBody,
          sendUpdates: "none",
        }),
      );

      const googleEventId = response.data.id;
      if (!googleEventId) {
        throw new Error("Calendar API did not return an event ID");
      }

      linksRepo.create(
        action.id,
        calendarId,
        googleEventId,
        response.data.htmlLink ?? null,
      );
      actionsRepo.markCompleted(action.id);
      result.created += 1;

      await markGmailProcessed(config, db, message.gmailMessageId, logger);

      logger.info(
        {
          operation: "create_event",
          proposedActionId: action.id,
          googleEventId,
          gmailMessageId: message.gmailMessageId,
        },
        "Created calendar event",
      );
    } catch (error) {
      result.failed += 1;
      actionsRepo.markFailed(action.id);
      if (isGoogleAuthError(error)) {
        recordAuthFailure(db, "calendar", error);
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        { proposedActionId: action.id, error: errorMessage },
        "Failed to create calendar event",
      );
    }
  }

  logger.info(result, "Calendar writer completed");
  return result;
}

type CalendarClient = Awaited<ReturnType<typeof createCalendarClient>>;

export async function findExistingCalendarEvent(
  calendar: CalendarClient,
  calendarId: string,
  eventBody: ReturnType<typeof mapToGoogleEvent>,
  payload: ApprovedActionPayload,
): Promise<calendar_v3.Schema$Event | null> {
  const window = getCalendarSearchWindow(eventBody);
  const response = await withRetry(() =>
    calendar.events.list({
      calendarId,
      singleEvents: true,
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      orderBy: "startTime",
    }),
  );

  const events = response.data.items ?? [];
  return (
    events.find((event) => isMatchingCalendarEvent(event, eventBody, payload)) ??
    null
  );
}

function getCalendarSearchWindow(eventBody: ReturnType<typeof mapToGoogleEvent>): {
  timeMin: string;
  timeMax: string;
} {
  if (eventBody.start.date) {
    const start = new Date(`${eventBody.start.date}T00:00:00.000Z`);
    const end = eventBody.end.date
      ? new Date(`${eventBody.end.date}T00:00:00.000Z`)
      : new Date(start);
    if (end <= start) {
      end.setUTCDate(end.getUTCDate() + 1);
    }
    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }

  const start = new Date(eventBody.start.dateTime ?? "");
  const end = new Date(eventBody.end.dateTime ?? eventBody.start.dateTime ?? "");
  if (Number.isNaN(start.getTime())) {
    throw new Error("Calendar event is missing a valid start time");
  }
  if (Number.isNaN(end.getTime()) || end <= start) {
    end.setTime(start.getTime() + 60_000);
  }

  start.setMinutes(start.getMinutes() - 1);
  end.setMinutes(end.getMinutes() + 1);

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

export function isMatchingCalendarEvent(
  event: calendar_v3.Schema$Event,
  eventBody: ReturnType<typeof mapToGoogleEvent>,
  payload: ApprovedActionPayload,
): boolean {
  if (event.status === "cancelled") {
    return false;
  }

  if (eventBody.start.date) {
    if (event.start?.date !== eventBody.start.date) {
      return false;
    }
    if (eventBody.end.date && event.end?.date !== eventBody.end.date) {
      return false;
    }
  } else if (
    normalizeDateTime(event.start?.dateTime) !==
      normalizeDateTime(eventBody.start.dateTime) ||
    normalizeDateTime(event.end?.dateTime) !==
      normalizeDateTime(eventBody.end.dateTime)
  ) {
    return false;
  }

  if (payload.childName) {
    return eventMatchesChild(event, payload.childName);
  }

  return normalizeText(event.summary) === normalizeText(eventBody.summary);
}

function eventMatchesChild(
  event: calendar_v3.Schema$Event,
  childName: string,
): boolean {
  const child = normalizeText(childName);
  const summary = normalizeText(event.summary);
  const description = normalizeText(event.description);

  return (
    summary.startsWith(`${child} `) ||
    summary === child ||
    description.includes(`for ${child}`)
  );
}

function normalizeDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function markGmailProcessed(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  gmailMessageId: string,
  logger: Logger,
): Promise<void> {
  try {
    const gmail = await createGmailClient(config.env);
    const processedLabelId = await ensureLabel(
      gmail,
      FAMILY_ASSISTANT_LABELS.processed,
    );
    const queuedLabelId = await listLabelIdByName(
      gmail,
      FAMILY_ASSISTANT_LABELS.queued,
    );

    await applyMessageLabels(
      gmail,
      gmailMessageId,
      [processedLabelId],
      queuedLabelId ? [queuedLabelId] : [],
    );
  } catch (error) {
    if (isGoogleAuthError(error)) {
      recordAuthFailure(db, "gmail", error);
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { gmailMessageId, error: message },
      "Failed to apply processed Gmail label",
    );
  }
}

export function parseApprovedPayloadFromForm(
  body: Record<string, string | undefined>,
): ApprovedActionPayload {
  const reminderRaw = body.reminderOffsetsMinutes ?? "";
  const reminderOffsetsMinutes = reminderRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return {
    actionType: body.actionType as ApprovedActionPayload["actionType"],
    childName: body.childName?.trim() || null,
    title: body.title?.trim() ?? "",
    startAt: body.startAt?.trim() || null,
    endAt: body.endAt?.trim() || null,
    allDay: body.allDay === "on" || body.allDay === "true",
    location: body.location?.trim() || null,
    description: body.description?.trim() || null,
    reminderOffsetsMinutes,
  };
}
