import type { Message, MessageStatus } from "../../domain/message.js";

export interface MessageRow {
  id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  subject: string;
  sender_name: string | null;
  sender_email: string;
  received_at: string;
  body_text: string;
  raw_body_text: string | null;
  source_label: string;
  status: MessageStatus;
  attempt_count: number;
  last_error: string | null;
  model_name: string | null;
  prompt_version: string | null;
  interpretation_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id,
    subject: row.subject,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    receivedAt: row.received_at,
    bodyText: row.body_text,
    rawBodyText: row.raw_body_text,
    sourceLabel: row.source_label,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    modelName: row.model_name,
    promptVersion: row.prompt_version,
    interpretationInstructions: row.interpretation_instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertMessageInput {
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string;
  senderName: string | null;
  senderEmail: string;
  receivedAt: string;
  bodyText: string;
  rawBodyText: string;
  sourceLabel: string;
}

export class MessagesRepository {
  constructor(private readonly db: import("better-sqlite3").Database) {}

  existsByGmailId(gmailMessageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM messages WHERE gmail_message_id = ? LIMIT 1")
      .get(gmailMessageId);
    return row !== undefined;
  }

  insert(input: InsertMessageInput): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO messages (
          gmail_message_id,
          gmail_thread_id,
          subject,
          sender_name,
          sender_email,
          received_at,
          body_text,
          raw_body_text,
          source_label,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
        `,
      )
      .run(
        input.gmailMessageId,
        input.gmailThreadId,
        input.subject,
        input.senderName,
        input.senderEmail,
        input.receivedAt,
        input.bodyText,
        input.rawBodyText,
        input.sourceLabel,
      );

    return Number(result.lastInsertRowid);
  }

  findById(id: number): Message | null {
    const row = this.db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .get(id) as MessageRow | undefined;
    return row ? mapMessageRow(row) : null;
  }

  listRecent(limit = 50): Message[] {
    const rows = this.db
      .prepare("SELECT * FROM messages ORDER BY received_at DESC LIMIT ?")
      .all(limit) as MessageRow[];
    return rows.map(mapMessageRow);
  }

  countByStatus(): Record<MessageStatus, number> {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM messages GROUP BY status")
      .all() as Array<{ status: MessageStatus; count: number }>;

    const counts: Record<MessageStatus, number> = {
      queued: 0,
      processing: 0,
      processed: 0,
      failed: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  recoverStaleProcessing(staleMinutes: number): number {
    const result = this.db
      .prepare(
        `
        UPDATE messages
        SET status = 'queued', updated_at = datetime('now')
        WHERE status = 'processing'
          AND updated_at < datetime('now', '-' || ? || ' minutes')
        `,
      )
      .run(staleMinutes);

    return result.changes;
  }

  claimNextQueued(): Message | null {
    const claim = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `
          SELECT * FROM messages
          WHERE status = 'queued'
          ORDER BY received_at ASC
          LIMIT 1
          `,
        )
        .get() as MessageRow | undefined;

      if (!row) {
        return null;
      }

      const updated = this.db
        .prepare(
          `
          UPDATE messages
          SET status = 'processing',
              attempt_count = attempt_count + 1,
              updated_at = datetime('now')
          WHERE id = ? AND status = 'queued'
          `,
        )
        .run(row.id);

      if (updated.changes === 0) {
        return null;
      }

      return mapMessageRow({
        ...row,
        status: "processing",
        attempt_count: row.attempt_count + 1,
      });
    });

    return claim();
  }

  markProcessed(
    id: number,
    modelName: string,
    promptVersion: string,
  ): void {
    this.db
      .prepare(
        `
        UPDATE messages
        SET status = 'processed',
            model_name = ?,
            prompt_version = ?,
            last_error = NULL,
            updated_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(modelName, promptVersion, id);
  }

  markFailed(id: number, error: string): void {
    this.db
      .prepare(
        `
        UPDATE messages
        SET status = 'failed',
            last_error = ?,
            updated_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(error, id);
  }

  resetForReprocess(id: number): void {
    this.db
      .prepare(
        `
        UPDATE messages
        SET status = 'queued',
            last_error = NULL,
            model_name = NULL,
            prompt_version = NULL,
            updated_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(id);
  }

  setInterpretationInstructions(id: number, instructions: string | null): void {
    this.db
      .prepare(
        `
        UPDATE messages
        SET interpretation_instructions = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(instructions, id);
  }
}
