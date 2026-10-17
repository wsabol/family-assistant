import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config.js";
import { openDatabase } from "../../src/db/connection.js";
import {
  getMigrationsDirectory,
  runMigrations,
} from "../../src/db/migrations.js";
import { MessagesRepository } from "../../src/db/repositories/messages.js";
import { ProposedActionsRepository } from "../../src/db/repositories/proposed-actions.js";
import { runWorker } from "../../src/ai/work.js";

vi.mock("../../src/ai/client.js", () => ({
  extractWithOpenAI: vi.fn(async () => ({
    modelName: "test-model",
    rawJson: "{}",
    result: {
      emailClassification: "actionable",
      summary: "Two deadlines",
      actions: [
        {
          actionType: "deadline",
          childName: "Student",
          title: "Perfect-confidence deadline",
          startAt: "2026-03-10",
          endAt: null,
          allDay: true,
          location: null,
          description: null,
          reminderOffsetsMinutes: [],
          confidence: 1,
          ambiguityReason: null,
          interpretationSummary: "Exact date stated",
          sourceExcerpt: "Due March 10",
        },
        {
          actionType: "deadline",
          childName: "Student",
          title: "Review-confidence deadline",
          startAt: "2026-03-11",
          endAt: null,
          allDay: true,
          location: null,
          description: null,
          reminderOffsetsMinutes: [],
          confidence: 0.99,
          ambiguityReason: null,
          interpretationSummary: "Likely date stated",
          sourceExcerpt: "Due March 11",
        },
      ],
    },
  })),
}));

function testConfig(dbPath: string): AppConfig {
  return {
    env: {
      DATABASE_PATH: dbPath,
      FAMILY_CONFIG_PATH: "config/family.json",
      LOG_LEVEL: "silent",
      LOG_DIR: "./data/logs",
      AI_API_KEY: "test-key",
      AI_MODEL: "test-model",
      REVIEW_PORT: 3847,
      WATCH_BATCH_LIMIT: 20,
      WORK_BATCH_LIMIT: 5,
      CALENDAR_BATCH_LIMIT: 10,
      STALE_PROCESSING_MINUTES: 30,
      BODY_MAX_CHARS: 12000,
      DIGEST_DIR: "./data/digests",
      OAUTH_REDIRECT_PORT: 3456,
      ADMIN_PORT: 3848,
      ALERT_SMTP_PORT: 587,
    },
    family: {
      timezone: "America/Chicago",
      schoolCalendarId: "calendar-id",
      gmailLabel: "School",
      children: [
        {
          name: "Student",
          aliases: [],
          school: "School",
          startedKindergarten: 2020,
        },
      ],
      defaultEventDurationMinutes: 60,
      defaultAllDayReminderMinutes: [1080],
      defaultTimedEventReminderMinutes: [60],
      interpretationGuidelines: [],
    },
  };
}

describe("runWorker", () => {
  it("auto-approves proposed actions with confidence exactly 1.0", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "family-assistant-work-"));
    const dbPath = join(tempDir, "test.db");
    const db = openDatabase(dbPath);

    try {
      runMigrations(db, getMigrationsDirectory());
      const messagesRepo = new MessagesRepository(db);
      const messageId = messagesRepo.insert({
        gmailMessageId: "gmail-1",
        gmailThreadId: null,
        subject: "Class deadlines",
        senderName: "Teacher",
        senderEmail: "teacher@school.edu",
        receivedAt: "2026-03-01T10:00:00.000Z",
        bodyText: "Due dates",
        rawBodyText: "Due dates",
        sourceLabel: "School",
      });

      const result = await runWorker(
        testConfig(dbPath),
        db,
        { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      );
      const actions = new ProposedActionsRepository(db).listByMessageId(messageId);

      expect(result.actionsCreated).toBe(2);
      expect(result.actionsAutoApproved).toBe(1);
      expect(actions.map((action) => action.status)).toEqual([
        "approved",
        "awaiting_review",
      ]);
      expect(actions[0].approvedPayloadJson).toBeTruthy();
      expect(actions[0].reviewedAt).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
