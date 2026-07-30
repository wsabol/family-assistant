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

export const PROMPT_VERSION = "school-email-v1";
