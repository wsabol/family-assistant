import type { gmail_v1 } from "googleapis";
import type { Logger } from "pino";

import { type AppConfig } from "../config.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import {
  applyMessageLabels,
  buildWatchQuery,
  createGmailClient,
  ensureLabel,
  fetchFullMessage,
  FAMILY_ASSISTANT_LABELS,
  getHeader,
  listMessageIds,
  withRetry,
} from "./client.js";
import {
  extractBodiesFromPart,
  normalizeEmailBody,
  parseSender,
} from "./normalize-message.js";

export interface WatchResult {
  fetched: number;
  stored: number;
  skipped: number;
  errors: number;
}

export async function runWatcher(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): Promise<WatchResult> {
  const gmail = await createGmailClient(config.env);
  const messagesRepo = new MessagesRepository(db);
  const query = buildWatchQuery(config.family.gmailLabel);
  const batchLimit = config.env.WATCH_BATCH_LIMIT;

  const queuedLabelId = await ensureLabel(
    gmail,
    FAMILY_ASSISTANT_LABELS.queued,
  );
  const processedLabelId = await ensureLabel(
    gmail,
    FAMILY_ASSISTANT_LABELS.processed,
  );
  const errorLabelId = await ensureLabel(gmail, FAMILY_ASSISTANT_LABELS.error);

  const messageIds = await withRetry(() =>
    listMessageIds(gmail, query, batchLimit),
  );

  const result: WatchResult = {
    fetched: messageIds.length,
    stored: 0,
    skipped: 0,
    errors: 0,
  };

  for (const gmailMessageId of messageIds) {
    if (messagesRepo.existsByGmailId(gmailMessageId)) {
      result.skipped += 1;
      continue;
    }

    try {
      const message = await withRetry(() =>
        fetchFullMessage(gmail, gmailMessageId),
      );

      await storeMessage(
        config,
        messagesRepo,
        gmail,
        message,
        queuedLabelId,
        processedLabelId,
        errorLabelId,
        logger,
      );

      result.stored += 1;
    } catch (error) {
      result.errors += 1;
      const message =
        error instanceof Error ? error.message : String(error);
      logger.error(
        { gmailMessageId, error: message },
        "Failed to ingest Gmail message",
      );

      try {
        await applyMessageLabels(gmail, gmailMessageId, [errorLabelId]);
      } catch {
        // Best effort error labeling
      }
    }
  }

  logger.info(result, "Gmail watch completed");
  return result;
}

async function storeMessage(
  config: AppConfig,
  messagesRepo: MessagesRepository,
  gmail: gmail_v1.Gmail,
  message: gmail_v1.Schema$Message,
  queuedLabelId: string,
  _processedLabelId: string,
  _errorLabelId: string,
  logger: Logger,
): Promise<void> {
  const gmailMessageId = message.id!;
  const fromHeader = getHeader(message, "From") ?? "unknown@unknown";
  const { senderName, senderEmail } = parseSender(fromHeader);
  const subject = getHeader(message, "Subject") ?? "(no subject)";
  const receivedHeader = getHeader(message, "Date");
  const receivedAt = receivedHeader
    ? new Date(receivedHeader).toISOString()
    : new Date(Number(message.internalDate ?? Date.now())).toISOString();

  const bodies = extractBodiesFromPart(message.payload ?? {});
  const { rawBodyText, bodyText } = normalizeEmailBody(
    bodies.plainText,
    bodies.html,
    { maxChars: config.env.BODY_MAX_CHARS },
  );

  const messageId = messagesRepo.insert({
    gmailMessageId,
    gmailThreadId: message.threadId ?? null,
    subject,
    senderName,
    senderEmail,
    receivedAt,
    bodyText,
    rawBodyText,
    sourceLabel: config.family.gmailLabel,
  });

  await applyMessageLabels(gmail, gmailMessageId, [queuedLabelId]);

  logger.info(
    {
      operation: "ingest",
      gmailMessageId,
      internalMessageId: messageId,
      subject,
    },
    "Stored Gmail message",
  );
}
