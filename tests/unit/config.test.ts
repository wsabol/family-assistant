import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigError,
  loadEnvConfig,
  loadFamilyConfig,
} from "../../src/config.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.length = 0;
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "family-assistant-config-"));
  tempDirs.push(dir);
  return dir;
}

function writeFamilyConfig(dir: string, contents: unknown): string {
  const configPath = join(dir, "family.json");
  writeFileSync(configPath, JSON.stringify(contents, null, 2));
  return configPath;
}

describe("loadEnvConfig", () => {
  it("loads valid environment configuration", () => {
    const env = loadEnvConfig({
      DATABASE_PATH: "./data/test.db",
      FAMILY_CONFIG_PATH: "./config/family.json",
      LOG_LEVEL: "debug",
      LOG_DIR: "./data/logs",
    });

    expect(env.DATABASE_PATH).toBe("./data/test.db");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("throws a clear error when required env vars are missing", () => {
    expect(() =>
      loadEnvConfig({
        DATABASE_PATH: "",
        FAMILY_CONFIG_PATH: "./config/family.json",
        LOG_DIR: "./data/logs",
      }),
    ).toThrow(ConfigError);

    try {
      loadEnvConfig({
        DATABASE_PATH: "",
        FAMILY_CONFIG_PATH: "./config/family.json",
        LOG_DIR: "./data/logs",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("DATABASE_PATH");
    }
  });
});

describe("loadFamilyConfig", () => {
  it("loads a valid family config", () => {
    const dir = createTempDir();
    const configPath = writeFamilyConfig(dir, {
      timezone: "America/Chicago",
      schoolCalendarId: "calendar-id",
      gmailLabel: "School",
      children: [
        {
          name: "Ada",
          aliases: ["A."],
          school: "Example Elementary",
          grade: "3",
        },
      ],
      defaultEventDurationMinutes: 60,
      defaultAllDayReminderMinutes: [1080],
      defaultTimedEventReminderMinutes: [60],
    });

    const family = loadFamilyConfig(configPath);

    expect(family.timezone).toBe("America/Chicago");
    expect(family.children[0]?.name).toBe("Ada");
  });

  it("throws a clear error when timezone is missing", () => {
    const dir = createTempDir();
    const configPath = writeFamilyConfig(dir, {
      schoolCalendarId: "calendar-id",
      gmailLabel: "School",
      children: [],
      defaultEventDurationMinutes: 60,
      defaultAllDayReminderMinutes: [1080],
      defaultTimedEventReminderMinutes: [60],
    });

    expect(() => loadFamilyConfig(configPath)).toThrow(ConfigError);

    try {
      loadFamilyConfig(configPath);
    } catch (error) {
      expect((error as ConfigError).message).toContain("timezone");
    }
  });

  it("throws a clear error for invalid JSON", () => {
    const dir = createTempDir();
    const configPath = join(dir, "family.json");
    writeFileSync(configPath, "{ invalid json");

    expect(() => loadFamilyConfig(configPath)).toThrow(ConfigError);

    try {
      loadFamilyConfig(configPath);
    } catch (error) {
      expect((error as ConfigError).message).toContain("Failed to parse family config");
    }
  });

  it("throws when the config file does not exist", () => {
    const dir = createTempDir();
    const configPath = join(dir, "missing.json");

    expect(() => loadFamilyConfig(configPath)).toThrow(ConfigError);

    try {
      loadFamilyConfig(configPath);
    } catch (error) {
      expect((error as ConfigError).message).toContain("Family config not found");
    }
  });
});
