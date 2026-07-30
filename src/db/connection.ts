import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { resolvePath } from "../config.js";

export function openDatabase(databasePath: string): Database.Database {
  const resolvedPath = resolvePath(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function verifyDatabaseConnection(databasePath: string): Database.Database {
  const db = openDatabase(databasePath);
  db.prepare("SELECT 1").get();
  return db;
}
