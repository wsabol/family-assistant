import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { openDatabase } from "../../src/db/connection.js";
import {
  getMigrationsDirectory,
  runMigrations,
  verifyDomainTables,
} from "../../src/db/migrations.js";
import { ProposedActionsRepository } from "../../src/db/repositories/proposed-actions.js";

describe("runMigrations", () => {
  it("applies migrations once and is idempotent on re-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "family-assistant-migrate-"));
    const dbPath = join(tempDir, "test.db");
    const db = openDatabase(dbPath);

    try {
      const firstRun = runMigrations(db, getMigrationsDirectory());
      expect(firstRun.applied).toContain("001_initial.sql");
      expect(verifyDomainTables(db)).toEqual([]);

      const secondRun = runMigrations(db, getMigrationsDirectory());
      expect(secondRun.applied).toEqual([]);
      expect(secondRun.skipped).toContain("001_initial.sql");
    } finally {
      db.close();
    }
  });

  it("creates expected domain tables and indexes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "family-assistant-schema-"));
    const dbPath = join(tempDir, "test.db");
    const db = openDatabase(dbPath);

    try {
      runMigrations(db, getMigrationsDirectory());

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC",
        )
        .all() as Array<{ name: string }>;

      expect(tables.map((row) => row.name)).toEqual([
        "calendar_links",
        "health_incidents",
        "messages",
        "proposed_actions",
        "schema_migrations",
        "sqlite_sequence",
      ]);

      const messageIndex = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages'",
        )
        .all() as Array<{ name: string }>;

      expect(messageIndex.some((row) => row.name.includes("gmail_message_id"))).toBe(
        true,
      );

      const actionColumns = db
        .prepare("PRAGMA table_info(proposed_actions)")
        .all() as Array<{ name: string }>;
      expect(actionColumns.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "matched_action_id",
          "event_relationship",
          "dedupe_reasoning",
          "dedupe_confidence",
        ]),
      );

      const message = db.prepare(
        `INSERT INTO messages (
          gmail_message_id, subject, sender_email, received_at,
          body_text, source_label, status
        ) VALUES ('gmail-1', 'Concert update', 'school@example.com',
          '2026-10-17T12:00:00Z', 'The concert moved.', 'School', 'processed')`,
      ).run();
      const actions = new ProposedActionsRepository(db);
      const actionId = actions.create({
        messageId: Number(message.lastInsertRowid),
        actionType: "calendar_event",
        childName: "Harlee",
        title: "Choir Concert",
        startAt: "2026-10-20T19:00:00-05:00",
        endAt: null,
        allDay: false,
        location: "Auditorium",
        description: "Updated concert time.",
        reminderOffsetsMinutes: [60],
        confidence: 1,
        ambiguityReason: null,
        interpretationSummary: "The email states the new time.",
        sourceExcerpt: "The concert moved to 7 PM.",
        originalPayloadJson: "{}",
        matchedActionId: null,
        eventRelationship: "event_update",
        dedupeReasoning: "Same named concert with a changed time.",
        dedupeConfidence: 0.98,
        status: "approved",
      });

      expect(actions.findById(actionId)).toMatchObject({
        eventRelationship: "event_update",
        dedupeConfidence: 0.98,
        status: "approved",
      });
    } finally {
      db.close();
    }
  });
});
