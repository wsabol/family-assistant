import { z } from "zod";

export const proposedActionTypeSchema = z.enum([
  "calendar_event",
  "deadline",
  "bring_item",
  "school_closure",
  "volunteer_opportunity",
  "informational",
  "needs_review",
]);

export type ProposedActionType = z.infer<typeof proposedActionTypeSchema>;

export const proposedActionStatusSchema = z.enum([
  "awaiting_review",
  "approved",
  "rejected",
  "writing",
  "completed",
  "failed",
  "superseded",
]);

export type ProposedActionStatus = z.infer<typeof proposedActionStatusSchema>;

export const eventRelationshipSchema = z.enum([
  "same_event",
  "event_update",
  "related_event",
  "distinct_event",
]);

export type EventRelationship = z.infer<typeof eventRelationshipSchema>;

export interface ProposedAction {
  id: number;
  messageId: number;
  actionType: ProposedActionType;
  childName: string | null;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  reminderOffsetsMinutes: number[];
  confidence: number;
  ambiguityReason: string | null;
  interpretationSummary: string | null;
  sourceExcerpt: string | null;
  matchedActionId: number | null;
  eventRelationship: EventRelationship | null;
  dedupeReasoning: string | null;
  dedupeConfidence: number | null;
  originalPayloadJson: string;
  approvedPayloadJson: string | null;
  status: ProposedActionStatus;
  createdAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
}

export interface CalendarLink {
  id: number;
  proposedActionId: number;
  googleCalendarId: string;
  googleEventId: string;
  eventHtmlLink: string | null;
  createdAt: string;
}
