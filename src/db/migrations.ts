import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = join(moduleDir, "../../migrations");

function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedMigrations(db: Database.Database): Set<string> {
  ensureMigrationTable(db);

  const rows = db
    .prepare("SELECT filename FROM schema_migrations ORDER BY filename ASC")
    .all() as Array<{ filename: string }>;

  return new Set(rows.map((row) => row.filename));
}

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

export function runMigrations(
  db: Database.Database,
  migrationsDir: string = defaultMigrationsDir,
): MigrationResult {
  ensureMigrationTable(db);

  const applied = getAppliedMigrations(db);
  const files = listMigrationFiles(migrationsDir);

  const appliedNow: string[] = [];
  const skipped: string[] = [];

  for (const filename of files) {
    if (applied.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, filename), "utf8");

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (filename) VALUES (?)",
      ).run(filename);
    });

    applyMigration();
    appliedNow.push(filename);
  }

  return { applied: appliedNow, skipped };
}

export function verifyDomainTables(db: Database.Database): string[] {
  const expectedTables = ["messages", "proposed_actions", "calendar_links"];
  const missing: string[] = [];

  for (const tableName of expectedTables) {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName) as { name: string } | undefined;

    if (!row) {
      missing.push(tableName);
    }
  }

  return missing;
}

export function getMigrationsDirectory(): string {
  return defaultMigrationsDir;
}
