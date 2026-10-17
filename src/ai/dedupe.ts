import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { EnvConfig } from "../config.js";
import type { CalendarMemoryCandidate } from "../db/repositories/proposed-actions.js";
import { eventRelationshipSchema } from "../domain/proposed-action.js";
import type { ExtractionAction } from "./schemas.js";

const eventMatchSchema = z.object({
  relationship: eventRelationshipSchema,
  matchedActionId: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type EventMatch = z.infer<typeof eventMatchSchema>;

export async function classifyEventRelationship(
  env: EnvConfig,
  systemPrompt: string,
  sourceSubject: string,
  action: ExtractionAction,
  candidates: CalendarMemoryCandidate[],
): Promise<EventMatch> {
  if (candidates.length === 0) {
    return {
      relationship: "distinct_event",
      matchedActionId: null,
      confidence: 1,
      reasoning: "No completed internal events were available for comparison.",
    };
  }

  if (!env.AI_API_KEY) {
    throw new Error("AI_API_KEY is required for event matching");
  }

  const candidatePayload = candidates.map(({ action: candidate, sourceSubject }) => ({
    actionId: candidate.id,
    sourceSubject,
    actionType: candidate.actionType,
    childName: candidate.childName,
    title: candidate.title,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    allDay: candidate.allDay,
    location: candidate.location,
    description: candidate.description,
    sourceExcerpt: candidate.sourceExcerpt,
  }));

  const client = new OpenAI({ apiKey: env.AI_API_KEY });
  const completion = await client.chat.completions.create({
    model: env.AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          newAction: { sourceSubject, ...action },
          candidates: candidatePayload,
        }),
      },
    ],
    response_format: zodResponseFormat(eventMatchSchema, "event_match"),
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Event matching failed: empty response");
  }

  const match = eventMatchSchema.parse(JSON.parse(content) as unknown);
  const validIds = new Set(candidates.map(({ action: candidate }) => candidate.id));

  if (
    match.relationship !== "distinct_event" &&
    (match.matchedActionId === null || !validIds.has(match.matchedActionId))
  ) {
    return {
      relationship: "distinct_event",
      matchedActionId: null,
      confidence: 0,
      reasoning: "The model did not identify a valid internal event match.",
    };
  }

  return match.relationship === "distinct_event"
    ? { ...match, matchedActionId: null }
    : match;
}
