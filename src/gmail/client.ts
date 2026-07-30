import { google, type gmail_v1 } from "googleapis";

import { type EnvConfig } from "../config.js";
import { getAuthorizedClient } from "../google/oauth.js";
import { formatGmailLabelQuery } from "./normalize-message.js";

export const FAMILY_ASSISTANT_LABELS = {
  queued: "FamilyAssistant/Queued",
  processed: "FamilyAssistant/Processed",
  error: "FamilyAssistant/Error",
} as const;

export async function createGmailClient(env: EnvConfig) {
  const auth = await getAuthorizedClient(env, "gmail");
  return google.gmail({ version: "v1", auth });
}

export function buildWatchQuery(gmailLabel: string): string {
  const labelQuery = formatGmailLabelQuery(gmailLabel);
  const processedLabel = formatGmailLabelQuery(FAMILY_ASSISTANT_LABELS.processed);
  return `${labelQuery} -${processedLabel}`;
}

export async function listLabelIdByName(
  gmail: gmail_v1.Gmail,
  labelName: string,
): Promise<string | null> {
  const response = await gmail.users.labels.list({ userId: "me" });
  const labels = response.data.labels ?? [];

  for (const label of labels) {
    if (label.name === labelName && label.id) {
      return label.id;
    }
  }

  return null;
}

export async function ensureLabel(
  gmail: gmail_v1.Gmail,
  labelName: string,
): Promise<string> {
  const existing = await listLabelIdByName(gmail, labelName);
  if (existing) {
    return existing;
  }

  const response = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  if (!response.data.id) {
    throw new Error(`Failed to create Gmail label: ${labelName}`);
  }

  return response.data.id;
}

export async function listMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number,
): Promise<string[]> {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = response.data.messages ?? [];
  return messages.map((message) => message.id!).filter(Boolean);
}

export async function fetchFullMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<gmail_v1.Schema$Message> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  if (!response.data) {
    throw new Error(`Gmail message not found: ${messageId}`);
  }

  return response.data;
}

export async function applyMessageLabels(
  gmail: gmail_v1.Gmail,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = [],
): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  });
}

export function getHeader(
  message: gmail_v1.Schema$Message,
  name: string,
): string | null {
  const headers = message.payload?.headers ?? [];
  const header = headers.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? null;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
}
