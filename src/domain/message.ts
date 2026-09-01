import { z } from "zod";

export const messageStatusSchema = z.enum([
  "queued",
  "processing",
  "processed",
  "failed",
]);

export type MessageStatus = z.infer<typeof messageStatusSchema>;

export interface Message {
  id: number;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string;
  senderName: string | null;
  senderEmail: string;
  receivedAt: string;
  bodyText: string;
  rawBodyText: string | null;
  sourceLabel: string;
  status: MessageStatus;
  attemptCount: number;
  lastError: string | null;
  modelName: string | null;
  promptVersion: string | null;
  interpretationInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}
