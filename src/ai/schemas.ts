import { z } from "zod";

import { proposedActionTypeSchema } from "../domain/proposed-action.js";

export const extractionActionSchema = z.object({
  actionType: proposedActionTypeSchema.exclude(["informational"]),
  childName: z.string().nullable(),
  title: z.string().min(1),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  reminderOffsetsMinutes: z.array(z.number().int()),
  confidence: z.number().min(0).max(1),
  ambiguityReason: z.string().nullable(),
  interpretationSummary: z.string(),
  sourceExcerpt: z.string(),
});

export const extractionResultSchema = z.object({
  emailClassification: z.enum([
    "actionable",
    "informational",
    "ambiguous",
  ]),
  summary: z.string(),
  actions: z.array(extractionActionSchema),
});

export type ExtractionAction = z.infer<typeof extractionActionSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

const nullLikeValues = new Set(["", "/", "null", "/null"]);

function normalizeNullableText(value: string | null): string | null {
  if (value === null || nullLikeValues.has(value.trim().toLowerCase())) {
    return null;
  }
  return value.trim();
}

function normalizeDate(value: string | null): {
  value: string | null;
  invalid: boolean;
} {
  const normalized = normalizeNullableText(value);
  if (normalized === null) {
    return { value: null, invalid: false };
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isNaN(Date.parse(normalized));
  return valid
    ? { value: normalized, invalid: false }
    : { value: null, invalid: true };
}

export function normalizeExtractionResult(
  result: ExtractionResult,
): ExtractionResult {
  return {
    ...result,
    actions: result.actions.map((action) => {
      const startAt = normalizeDate(action.startAt);
      const endAt = normalizeDate(action.endAt);
      const invalidDate = startAt.invalid || endAt.invalid;
      const childName = normalizeNullableText(action.childName);

      return {
        ...action,
        childName:
          childName?.toLowerCase() === "needs_review" ? null : childName,
        startAt: startAt.value,
        endAt: endAt.value,
        location: normalizeNullableText(action.location),
        description: normalizeNullableText(action.description),
        confidence: invalidDate ? Math.min(action.confidence, 0.5) : action.confidence,
        ambiguityReason: invalidDate
          ? "The model returned an invalid date value."
          : normalizeNullableText(action.ambiguityReason),
      };
    }),
  };
}

export const PROMPT_VERSION = "school-email-v2";
