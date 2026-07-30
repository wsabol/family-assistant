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
    } finally {
      db.close();
    }
  });
});
