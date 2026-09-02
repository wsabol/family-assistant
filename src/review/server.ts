import express from "express";
import type { Logger } from "pino";

import { type AppConfig } from "../config.js";
import { parseApprovedPayloadFromForm } from "../calendar/write.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";
import { reprocessMessage } from "../ai/work.js";
import {
  awaitingPage,
  flashPage,
  inboxPage,
  messagePage,
} from "./views/pages.js";

export function createReviewApp(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): express.Express {
  const app = express();
  const messagesRepo = new MessagesRepository(db);
  const actionsRepo = new ProposedActionsRepository(db);

  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_req, res) => {
    const messages = messagesRepo.listRecent(100).map((message) => {
      const actions = actionsRepo.listByMessageId(message.id);
      return {
        message,
        actionCount: actions.length,
        awaitingCount: actions.filter((a) => a.status === "awaiting_review").length,
        actions,
      };
    });

    res.type("html").send(inboxPage(messages, config.family));
  });

  app.get("/actions/awaiting", (_req, res) => {
    const actions = actionsRepo.listAwaitingReviewSorted(config.family);
    res.type("html").send(awaitingPage(actions, config.family));
  });

  app.get("/messages/:id", (req, res) => {
    const messageId = Number(req.params.id);
    const message = messagesRepo.findById(messageId);

    if (!message) {
      res.status(404).type("html").send(flashPage("Not found", "Message not found."));
      return;
    }

    const actions = actionsRepo.listByMessageId(messageId);
    res.type("html").send(messagePage(message, actions, config.family));
  });

  app.post("/messages/:id/instructions", (req, res) => {
    const messageId = Number(req.params.id);
    const body = req.body as Record<string, string | undefined>;
    const instructions = body.interpretationInstructions?.trim() || null;
    messagesRepo.setInterpretationInstructions(messageId, instructions);
    res.redirect(`/messages/${messageId}`);
  });

  app.post("/messages/:id/reprocess", async (req, res) => {
    const messageId = Number(req.params.id);
    const body = req.body as Record<string, string | undefined>;
    const instructions = body.interpretationInstructions?.trim() || null;

    try {
      await reprocessMessage(config, db, messageId, logger, {
        interpretationInstructions: instructions,
      });
      res.redirect(`/messages/${messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).type("html").send(flashPage("Reprocess failed", message));
    }
  });

  app.post("/actions/:id/save", (req, res) => {
    const actionId = Number(req.params.id);
    const action = actionsRepo.findById(actionId);

    if (!action) {
      res.status(404).type("html").send(flashPage("Not found", "Action not found."));
      return;
    }

    const payload = parseApprovedPayloadFromForm(
      req.body as Record<string, string | undefined>,
    );
    const intent = req.body.intent as string | undefined;

    if (intent === "approve") {
      actionsRepo.approve(actionId, payload);
      logger.info({ proposedActionId: actionId }, "Action approved via review UI");
    } else if (intent === "reject") {
      actionsRepo.reject(actionId);
      logger.info({ proposedActionId: actionId }, "Action rejected via review UI");
    } else {
      actionsRepo.updateDraft(actionId, payload);
      logger.info({ proposedActionId: actionId }, "Action draft saved via review UI");
    }

    res.redirect(`/messages/${action.messageId}`);
  });

  return app;
}

export function startReviewServer(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): void {
  const app = createReviewApp(config, db, logger);
  const port = config.env.REVIEW_PORT;

  app.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    logger.info({ port, url }, "Review server started");
    console.log(`Review UI running at ${url}`);
  });
}
