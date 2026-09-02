import Database from "better-sqlite3";

import { describe, expect, it } from "vitest";

import { HealthIncidentsRepository } from "../../src/db/repositories/health-incidents.js";
import { runMigrations } from "../../src/db/migrations.js";

describe("HealthIncidentsRepository", () => {
  it("deduplicates open incidents by type", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    const repo = new HealthIncidentsRepository(db);

    const first = repo.recordOpen("gmail_auth", "Token expired");
    const second = repo.recordOpen("gmail_auth", "Still expired");

    expect(first.id).toBe(second.id);
    expect(repo.listOpen()).toHaveLength(1);
    expect(repo.listOpen()[0]?.message).toBe("Still expired");

    const resolved = repo.resolve("gmail_auth");
    expect(resolved?.status).toBe("resolved");
    expect(repo.listOpen()).toHaveLength(0);
  });
});
