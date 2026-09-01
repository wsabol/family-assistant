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

  const lines = [
    "Family context:",
    `Timezone: ${family.timezone}`,
    "Children:",
    children,
    `Default event duration minutes: ${family.defaultEventDurationMinutes}`,
    `Default all-day reminder minutes: ${family.defaultAllDayReminderMinutes.join(", ")}`,
    `Default timed event reminder minutes: ${family.defaultTimedEventReminderMinutes.join(", ")}`,
  ];

  const guidelines = family.interpretationGuidelines ?? [];
  if (guidelines.length > 0) {
    lines.push("", "Standing interpretation guidelines:");
    for (const guideline of guidelines) {
      lines.push(`- ${guideline}`);
    }
  }

  return lines.join("\n");
}

export interface BuildUserPromptInput {
  subject: string;
  senderEmail: string;
  senderName: string | null;
  receivedAt: string;
  bodyText: string;
  family: FamilyConfig;
  interpretationInstructions?: string | null;
}

export function buildUserPrompt(input: BuildUserPromptInput): string {
  const sender = input.senderName
    ? `${input.senderName} <${input.senderEmail}>`
    : input.senderEmail;

  const sections = [
    buildFamilyContext(input.family),
    "",
    "Email metadata:",
    `Subject: ${input.subject}`,
    `From: ${sender}`,
    `Received at (ISO): ${input.receivedAt}`,
    `Resolve relative dates relative to this received timestamp in ${input.family.timezone}.`,
  ];

  if (input.interpretationInstructions?.trim()) {
    sections.push(
      "",
      "Human interpretation guidance (follow these when resolving ambiguity):",
      input.interpretationInstructions.trim(),
    );
  }

  sections.push("", "Email body:", input.bodyText);

  return sections.join("\n");
}
