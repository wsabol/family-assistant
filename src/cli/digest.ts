import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Logger } from "pino";

import { type AppConfig, resolvePath } from "../config.js";
import { CalendarLinksRepository } from "../db/repositories/calendar-links.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";

export interface DigestResult {
  path: string;
}

export function runDigest(
  config: AppConfig,
  db: import("better-sqlite3").Database,
  logger: Logger,
): DigestResult {
  const messagesRepo = new MessagesRepository(db);
  const actionsRepo = new ProposedActionsRepository(db);
  const linksRepo = new CalendarLinksRepository(db);

  const messageCounts = messagesRepo.countByStatus();
  const actionCounts = actionsRepo.countByStatus();
  const recentMessages = messagesRepo.listRecent(20);
  const awaiting = actionsRepo.listByStatus("awaiting_review");
  const failedMessages = recentMessages.filter((m) => m.status === "failed");
  const recentLinks = linksRepo.listRecent(20);

  const today = new Date().toISOString().slice(0, 10);
  const digestDir = resolvePath(config.env.DIGEST_DIR);
  mkdirSync(digestDir, { recursive: true });
  const path = join(digestDir, `digest-${today}.md`);

  const lines = [
    `# Family Assistant Digest — ${today}`,
    "",
    "## Queue status",
    "",
    "### Messages",
    `- queued: ${messageCounts.queued ?? 0}`,
    `- processing: ${messageCounts.processing ?? 0}`,
    `- processed: ${messageCounts.processed ?? 0}`,
    `- failed: ${messageCounts.failed ?? 0}`,
    "",
    "### Proposed actions",
    `- awaiting_review: ${actionCounts.awaiting_review ?? 0}`,
    `- approved: ${actionCounts.approved ?? 0}`,
    `- rejected: ${actionCounts.rejected ?? 0}`,
    `- completed: ${actionCounts.completed ?? 0}`,
    `- failed: ${actionCounts.failed ?? 0}`,
    `- superseded: ${actionCounts.superseded ?? 0}`,
    "",
    "## Awaiting review",
    "",
  ];

  if (awaiting.length === 0) {
    lines.push("No items awaiting review.");
  } else {
    for (const action of awaiting) {
      lines.push(
        `- [${action.title}](http://127.0.0.1:${config.env.REVIEW_PORT}/messages/${action.messageId}) — ${action.actionType}, confidence ${action.confidence.toFixed(2)}`,
      );
    }
  }

  lines.push("", "## Calendar events created recently", "");

  if (recentLinks.length === 0) {
    lines.push("No recent calendar events.");
  } else {
    for (const link of recentLinks) {
      const linkText = link.eventHtmlLink
        ? `[event](${link.eventHtmlLink})`
        : link.googleEventId;
      lines.push(`- Action #${link.proposedActionId}: ${linkText}`);
    }
  }

  lines.push("", "## Errors", "");

  if (failedMessages.length === 0) {
    lines.push("No failed messages in recent history.");
  } else {
    for (const message of failedMessages) {
      lines.push(
        `- Message #${message.id} (${message.subject}): ${message.lastError ?? "unknown error"}`,
      );
    }
  }

  lines.push("", "## Recent messages", "");

  for (const message of recentMessages.slice(0, 10)) {
    lines.push(
      `- #${message.id} ${message.subject} — ${message.status} (${message.receivedAt})`,
    );
  }

  const content = lines.join("\n");
  writeFileSync(path, content, "utf8");

  logger.info({ path }, "Digest written");
  console.log(`Digest written to ${path}`);

  return { path };
}
