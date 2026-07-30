import type { Logger } from "pino";

import { type AppConfig } from "../config.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";
import { extractWithOpenAI } from "./client.js";
import { buildUserPrompt, loadSystemPrompt } from "./prompts.js";
import { PROMPT_VERSION } from "./schemas.js";

export interface WorkResult {
  claimed: number;
  processed: number;
  failed: number;
  actionsCreated: number;
}

export async function runWorker(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): Promise<WorkResult> {
  const messagesRepo = new MessagesRepository(db);
  const actionsRepo = new ProposedActionsRepository(db);
  const staleRecovered = messagesRepo.recoverStaleProcessing(
    config.env.STALE_PROCESSING_MINUTES,
  );

  if (staleRecovered > 0) {
    logger.warn({ staleRecovered }, "Recovered stale processing messages");
  }

  const result: WorkResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    actionsCreated: 0,
  };

  const batchLimit = config.env.WORK_BATCH_LIMIT;
  const systemPrompt = loadSystemPrompt();

  for (let i = 0; i < batchLimit; i++) {
    const message = messagesRepo.claimNextQueued();
    if (!message) {
      break;
    }

    result.claimed += 1;

    try {
      const userPrompt = buildUserPrompt({
        subject: message.subject,
        senderEmail: message.senderEmail,
        senderName: message.senderName,
        receivedAt: message.receivedAt,
        bodyText: message.bodyText,
        family: config.family,
      });

      const { result: extraction, modelName, rawJson } = await extractWithOpenAI(
        config.env,
        systemPrompt,
        userPrompt,
      );

      persistExtraction(
        actionsRepo,
        message.id,
        extraction,
        rawJson,
        result,
      );

      messagesRepo.markProcessed(message.id, modelName, PROMPT_VERSION);
      result.processed += 1;

      logger.info(
        {
          operation: "extract",
          internalMessageId: message.id,
          gmailMessageId: message.gmailMessageId,
          actionCount: extraction.actions.length,
          classification: extraction.emailClassification,
        },
        "Processed message with AI",
      );
    } catch (error) {
      result.failed += 1;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      messagesRepo.markFailed(message.id, errorMessage);
      logger.error(
        {
          internalMessageId: message.id,
          gmailMessageId: message.gmailMessageId,
          error: errorMessage,
        },
        "Failed to process message",
      );
    }
  }

  logger.info(result, "AI worker completed");
  return result;
}

function persistExtraction(
  actionsRepo: ProposedActionsRepository,
  messageId: number,
  extraction: import("./schemas.js").ExtractionResult,
  rawJson: string,
  result: WorkResult,
): void {
  if (
    extraction.emailClassification === "informational" &&
    extraction.actions.length === 0
  ) {
    actionsRepo.create({
      messageId,
      actionType: "informational",
      childName: null,
      title: extraction.summary.slice(0, 200) || "Informational email",
      startAt: null,
      endAt: null,
      allDay: false,
      location: null,
      description: extraction.summary,
      reminderOffsetsMinutes: [],
      confidence: 1,
      ambiguityReason: null,
      interpretationSummary: extraction.summary,
      sourceExcerpt: extraction.summary.slice(0, 300),
      originalPayloadJson: rawJson,
    });
    result.actionsCreated += 1;
    return;
  }

  for (const action of extraction.actions) {
    actionsRepo.create({
      messageId,
      actionType: action.actionType,
      childName: action.childName,
      title: action.title,
      startAt: action.startAt,
      endAt: action.endAt,
      allDay: action.allDay,
      location: action.location,
      description: action.description,
      reminderOffsetsMinutes: action.reminderOffsetsMinutes,
      confidence: action.confidence,
      ambiguityReason: action.ambiguityReason,
      interpretationSummary: action.interpretationSummary,
      sourceExcerpt: action.sourceExcerpt,
      originalPayloadJson: JSON.stringify(action),
    });
    result.actionsCreated += 1;
  }
}

export async function reprocessMessage(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  messageId: number,
  logger: Logger,
): Promise<void> {
  const messagesRepo = new MessagesRepository(db);
  const actionsRepo = new ProposedActionsRepository(db);

  const message = messagesRepo.findById(messageId);
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const superseded = actionsRepo.supersedeForMessage(messageId);
  messagesRepo.resetForReprocess(messageId);

  logger.info(
    { messageId, superseded },
    "Message queued for reprocessing; prior actions superseded",
  );

  await runWorker(config, db, logger);
}
