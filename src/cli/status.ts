import type { Logger } from "pino";

import { MessagesRepository } from "../db/repositories/messages.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";

export function runStatus(
  db: import("better-sqlite3").Database,
  logger: Logger,
): void {
  const messagesRepo = new MessagesRepository(db);
  const actionsRepo = new ProposedActionsRepository(db);

  const messageCounts = messagesRepo.countByStatus();
  const actionCounts = actionsRepo.countByStatus();

  console.log("Family Assistant Status");
  console.log("=======================");
  console.log("");
  console.log("Messages:");
  for (const [status, count] of Object.entries(messageCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("");
  console.log("Proposed actions:");
  for (const [status, count] of Object.entries(actionCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  logger.info({ messageCounts, actionCounts }, "Status command completed");
}
