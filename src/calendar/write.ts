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
  describeEventRevision,
  isCalendarWritableAction,
  mapToGoogleEvent,
  mergeEventUpdatePayload,
  prependEventRevision,
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
  updated: number;
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
    updated: 0,
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

    let payload = actionToApprovedPayload(action);

    if (
      action.eventRelationship === "same_event" &&
      action.matchedActionId !== null
    ) {
      const matchedLink = linksRepo.findByActionId(action.matchedActionId);
      if (!matchedLink) {
        actionsRepo.markFailed(action.id);
        result.failed += 1;
        continue;
      }

      linksRepo.create(
        action.id,
        matchedLink.googleCalendarId,
        matchedLink.googleEventId,
        matchedLink.eventHtmlLink,
      );
      actionsRepo.markCompleted(action.id);
      result.skipped += 1;

      const duplicateMessage = messagesRepo.findById(action.messageId);
      if (duplicateMessage) {
        await markGmailProcessed(
          config,
          db,
          duplicateMessage.gmailMessageId,
          logger,
        );
      }
      continue;
    }

    const matchedAction =
      action.eventRelationship === "event_update" &&
      action.matchedActionId !== null
        ? actionsRepo.findById(action.matchedActionId)
        : null;
    const matchedLink = matchedAction
      ? linksRepo.findByActionId(matchedAction.id)
      : null;

    if (action.eventRelationship === "event_update") {
      if (!matchedAction || !matchedLink) {
        actionsRepo.markFailed(action.id);
        result.failed += 1;
        continue;
      }
      payload = mergeEventUpdatePayload(
        actionToApprovedPayload(matchedAction),
        payload,
      );
      actionsRepo.setResolvedPayload(action.id, payload);
    }

    if (!isCalendarWritableAction(payload)) {
      actionsRepo.markFailed(action.id);
      result.failed += 1;
      logger.warn(
        { proposedActionId: action.id },
        "Approved action is not calendar-writable",
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

      if (matchedAction && matchedLink) {
        const previousPayload = actionToApprovedPayload(matchedAction);
        const currentEvent = await withRetry(() =>
          calendar.events.get({
            calendarId: matchedLink.googleCalendarId,
            eventId: matchedLink.googleEventId,
          }),
        );
        const revision = describeEventRevision(previousPayload, payload);
        eventBody.description = prependEventRevision(
          currentEvent.data.description ?? eventBody.description,
          dateInTimeZone(new Date(), config.family.timezone),
          revision,
        );

        const response = await withRetry(() =>
          calendar.events.update({
            calendarId: matchedLink.googleCalendarId,
            eventId: matchedLink.googleEventId,
            requestBody: eventBody,
          }),
        );

        linksRepo.create(
          action.id,
          matchedLink.googleCalendarId,
          matchedLink.googleEventId,
          response.data.htmlLink ?? matchedLink.eventHtmlLink,
        );
        actionsRepo.markCompleted(action.id);
        result.updated += 1;
        await markGmailProcessed(config, db, message.gmailMessageId, logger);

        logger.info(
          {
            operation: "update_event",
            proposedActionId: action.id,
            matchedActionId: matchedAction.id,
            googleEventId: matchedLink.googleEventId,
          },
          "Updated calendar event",
        );
        continue;
      }

      const response = await withRetry(() =>
        calendar.events.insert({
          calendarId,
          requestBody: eventBody,
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

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
