import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { type FamilyConfig } from "../config.js";
import { getChildGradeDisplay } from "../family/grade.js";
import { PROMPT_VERSION } from "./schemas.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(moduleDir, "../../config/prompts");

export function loadSystemPrompt(version = PROMPT_VERSION): string {
  const promptPath = join(promptsDir, `${version}.txt`);
  return readFileSync(promptPath, "utf8").trim();
}

export function buildFamilyContext(family: FamilyConfig): string {
  const children = family.children
    .map(
      (child) =>
        `- ${child.name} (aliases: ${child.aliases.join(", ") || "none"}), school: ${child.school}, grade: ${getChildGradeDisplay(child, family.timezone)}`,
    )
    .join("\n");

  return [
    "Family context:",
    `Timezone: ${family.timezone}`,
    "Children:",
    children,
    `Default event duration minutes: ${family.defaultEventDurationMinutes}`,
    `Default all-day reminder minutes: ${family.defaultAllDayReminderMinutes.join(", ")}`,
    `Default timed event reminder minutes: ${family.defaultTimedEventReminderMinutes.join(", ")}`,
  ].join("\n");
}

export interface BuildUserPromptInput {
  subject: string;
  senderEmail: string;
  senderName: string | null;
  receivedAt: string;
  bodyText: string;
  family: FamilyConfig;
}

export function buildUserPrompt(input: BuildUserPromptInput): string {
  const sender = input.senderName
    ? `${input.senderName} <${input.senderEmail}>`
    : input.senderEmail;

  return [
    buildFamilyContext(input.family),
    "",
    "Email metadata:",
    `Subject: ${input.subject}`,
    `From: ${sender}`,
    `Received at (ISO): ${input.receivedAt}`,
  `Resolve relative dates relative to this received timestamp in ${input.family.timezone}.`,
    "",
    "Email body:",
    input.bodyText,
  ].join("\n");
}
