import { describe, expect, it } from "vitest";

import { buildUserPrompt } from "../../src/ai/prompts.js";
import { familyConfigSchema } from "../../src/config.js";

const family = familyConfigSchema.parse({
  timezone: "America/Chicago",
  schoolCalendarId: "cal@test",
  gmailLabel: "School",
  children: [
    {
      name: "Alex",
      aliases: [],
      school: "Test School",
      startedKindergarten: 2020,
    },
  ],
  defaultEventDurationMinutes: 60,
  defaultAllDayReminderMinutes: [1080],
  defaultTimedEventReminderMinutes: [60],
  interpretationGuidelines: ["Early dismissal means 12:30 PM."],
});

describe("buildUserPrompt", () => {
  it("includes standing interpretation guidelines from family config", () => {
    const prompt = buildUserPrompt({
      subject: "Test",
      senderEmail: "school@example.com",
      senderName: null,
      receivedAt: "2026-02-01T12:00:00.000Z",
      bodyText: "Body",
      family,
    });

    expect(prompt).toContain("Standing interpretation guidelines");
    expect(prompt).toContain("Early dismissal means 12:30 PM.");
  });

  it("includes per-message interpretation instructions when provided", () => {
    const prompt = buildUserPrompt({
      subject: "Test",
      senderEmail: "school@example.com",
      senderName: null,
      receivedAt: "2026-02-01T12:00:00.000Z",
      bodyText: "Body",
      family,
      interpretationInstructions: "This email is about 1st grade only.",
    });

    expect(prompt).toContain("Human interpretation guidance");
    expect(prompt).toContain("This email is about 1st grade only.");
  });
});
