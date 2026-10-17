import { describe, expect, it } from "vitest";

import {
  extractionResultSchema,
  normalizeExtractionResult,
} from "../../src/ai/schemas.js";

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

  it("normalizes null-like values", () => {
    const result = extractionResultSchema.parse({
      emailClassification: "actionable",
      summary: "Complete the form",
      actions: [
        {
          actionType: "deadline",
          childName: "needs_review",
          title: "Complete the form",
          startAt: "/null",
          endAt: "null",
          allDay: false,
          location: " /null ",
          description: "",
          reminderOffsetsMinutes: [],
          confidence: 1,
          ambiguityReason: "",
          interpretationSummary: "No deadline stated",
          sourceExcerpt: "Please complete the form.",
        },
      ],
    });

    expect(normalizeExtractionResult(result).actions[0]).toMatchObject({
      childName: null,
      startAt: null,
      endAt: null,
      location: null,
      description: null,
      ambiguityReason: null,
    });
  });

  it("removes invalid dates and lowers confidence", () => {
    const result = extractionResultSchema.parse({
      emailClassification: "actionable",
      summary: "Bring an item",
      actions: [
        {
          actionType: "bring_item",
          childName: "Oaklee",
          title: "Bring hay bales",
          startAt: "/Date(1696468800000)/",
          endAt: null,
          allDay: true,
          location: null,
          description: null,
          reminderOffsetsMinutes: [],
          confidence: 0.9,
          ambiguityReason: null,
          interpretationSummary: "Date copied from the message",
          sourceExcerpt: "Bring hay bales.",
        },
      ],
    });

    expect(normalizeExtractionResult(result).actions[0]).toMatchObject({
      startAt: null,
      confidence: 0.5,
      ambiguityReason: "The model returned an invalid date value.",
    });
  });
});
