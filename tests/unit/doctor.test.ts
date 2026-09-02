import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runDoctor } from "../../src/cli/doctor.js";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "family-assistant-doctor-"));

  const configDir = join(tempDir, "config");
  const dataDir = join(tempDir, "data");
  const logsDir = join(dataDir, "logs");

  mkdirSync(configDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  const familyConfigPath = join(configDir, "family.json");
  copyFileSync(
    join(process.cwd(), "config/family.example.json"),
    familyConfigPath,
  );

  process.env = {
    ...originalEnv,
    DATABASE_PATH: join(dataDir, "family-assistant.db"),
    FAMILY_CONFIG_PATH: familyConfigPath,
    LOG_LEVEL: "silent",
    LOG_DIR: logsDir,
    DIGEST_DIR: join(dataDir, "digests"),
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  };

  delete process.env.GOOGLE_TOKEN_PATH;
  delete process.env.GOOGLE_CALENDAR_TOKEN_PATH;
  delete process.env.AI_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("runDoctor", () => {
  it("fails readiness when required integration credentials are missing", async () => {
    const report = await runDoctor();

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === "Environment variables")?.status).toBe(
      "pass",
    );
    expect(report.checks.find((check) => check.name === "Family config")?.status).toBe("pass");
    expect(report.checks.find((check) => check.name === "Database connectivity")?.status).toBe(
      "pass",
    );
    expect(
      report.checks.find((check) => check.name === "Writable log directory")?.status,
    ).toBe("pass");
    expect(report.checks.find((check) => check.name === "Gmail credentials")?.status).toBe(
      "fail",
    );
    expect(report.checks.find((check) => check.name === "Calendar credentials")?.status).toBe(
      "fail",
    );
    expect(report.checks.find((check) => check.name === "AI credentials")?.status).toBe(
      "fail",
    );
  });

  it("fails when family config is missing", async () => {
    process.env.FAMILY_CONFIG_PATH = join(tempDir, "config/missing.json");

    const report = await runDoctor();

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.name === "Family config")?.status).toBe("fail");
  });

  it("creates the database file during the database check", async () => {
    const dbPath = process.env.DATABASE_PATH!;
    expect(existsSync(dbPath)).toBe(false);

    await runDoctor();

    expect(existsSync(dbPath)).toBe(true);
  });
});
