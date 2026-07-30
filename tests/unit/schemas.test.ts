import { describe, expect, it } from "vitest";

import { extractionResultSchema } from "../../src/ai/schemas.js";

describe("extractionResultSchema", () => {
  it("accepts a valid extraction payload", () => {
    const parsed = extractionResultSchema.parse({
      emailClassification: "actionable",
      summary: "Field trip on Friday",
      actions: [
        {
          actionType: "calendar_event",
          childName: "Harlee",
          title: "Field Trip",
          startAt: "2026-03-10T14:00:00.000Z",
          endAt: null,
          allDay: false,
          location: "Museum",
          description: "Bring lunch",
          reminderOffsetsMinutes: [60],
          confidence: 0.9,
          ambiguityReason: null,
          interpretationSummary: "Next Friday from email date",
          sourceExcerpt: "field trip next Friday",
        },
      ],
    });

    expect(parsed.actions.length).toBe(1);
  });

  it("rejects invalid confidence values", () => {
    expect(() =>
      extractionResultSchema.parse({
        emailClassification: "actionable",
        summary: "Test",
        actions: [
          {
            actionType: "calendar_event",
            childName: null,
            title: "Test",
            startAt: null,
            endAt: null,
            allDay: false,
            location: null,
            description: null,
            reminderOffsetsMinutes: [],
            confidence: 1.5,
            ambiguityReason: null,
            interpretationSummary: "Test",
            sourceExcerpt: "Test",
          },
        ],
      }),
    ).toThrow();
  });
});
