import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

export const envSchema = z.object({
  DATABASE_PATH: z.string().min(1, "DATABASE_PATH is required"),
  FAMILY_CONFIG_PATH: z.string().min(1, "FAMILY_CONFIG_PATH is required"),
  LOG_LEVEL: logLevelSchema.default("info"),
  LOG_DIR: z.string().min(1, "LOG_DIR is required"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_TOKEN_PATH: z.string().optional(),
  GOOGLE_CALENDAR_TOKEN_PATH: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  REVIEW_PORT: z.coerce.number().int().positive().default(3847),
  WATCH_BATCH_LIMIT: z.coerce.number().int().positive().default(20),
  WORK_BATCH_LIMIT: z.coerce.number().int().positive().default(5),
  CALENDAR_BATCH_LIMIT: z.coerce.number().int().positive().default(10),
  STALE_PROCESSING_MINUTES: z.coerce.number().int().positive().default(30),
  BODY_MAX_CHARS: z.coerce.number().int().positive().default(12000),
  DIGEST_DIR: z.string().default("./data/digests"),
  OAUTH_REDIRECT_PORT: z.coerce.number().int().positive().default(3456),
  ADMIN_PORT: z.coerce.number().int().positive().default(3848),
  ALERT_WEBHOOK_URL: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  ALERT_SMTP_HOST: z.string().optional(),
  ALERT_SMTP_PORT: z.coerce.number().int().positive().default(587),
  ALERT_SMTP_USER: z.string().optional(),
  ALERT_SMTP_PASS: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

const childSchema = z.object({
  name: z.string().min(1, "Child name is required"),
  aliases: z.array(z.string()).default([]),
  school: z.string().min(1, "Child school is required"),
  startedKindergarten: z
    .number()
    .int("startedKindergarten must be a whole year")
    .min(1990, "startedKindergarten must be 1990 or later")
    .max(2100, "startedKindergarten must be 2100 or earlier"),
});

const reviewHintsSchema = z
  .object({
    lowConfidenceThreshold: z.number().min(0).max(1).default(0.8),
    priorityActionTypes: z.array(z.string()).default([]),
  })
  .optional();

export const familyConfigSchema = z.object({
  timezone: z.string().min(1, "timezone is required"),
  schoolCalendarId: z.string().min(1, "schoolCalendarId is required"),
  gmailLabel: z.string().min(1, "gmailLabel is required"),
  children: z
    .array(childSchema)
    .min(1, "At least one child must be configured"),
  defaultEventDurationMinutes: z.number().int().positive(),
  defaultAllDayReminderMinutes: z.array(z.number().int()),
  defaultTimedEventReminderMinutes: z.array(z.number().int()),
  interpretationGuidelines: z.array(z.string()).default([]),
  reviewHints: reviewHintsSchema,
});

export type FamilyConfig = z.infer<typeof familyConfigSchema>;

export interface AppConfig {
  env: EnvConfig;
  family: FamilyConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function formatZodError(error: z.ZodError, label: string): string {
  const details = error.errors
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return `${label} validation failed: ${details}`;
}

export function loadEnvConfig(overrides?: Record<string, string | undefined>): EnvConfig {
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });

  if (!parsed.success) {
    throw new ConfigError(formatZodError(parsed.error, "Environment"));
  }

  return parsed.data;
}

export function loadFamilyConfig(configPath: string): FamilyConfig {
  const resolvedPath = resolve(configPath);

  if (!existsSync(resolvedPath)) {
    throw new ConfigError(
      `Family config not found at ${resolvedPath}. Copy config/family.example.json to config/family.json and customize it.`,
    );
  }

  let rawJson: unknown;

  try {
    rawJson = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse family config at ${resolvedPath}: ${message}`);
  }

  const parsed = familyConfigSchema.safeParse(rawJson);

  if (!parsed.success) {
    throw new ConfigError(formatZodError(parsed.error, "Family config"));
  }

  return parsed.data;
}

export function loadConfig(overrides?: Record<string, string | undefined>): AppConfig {
  const env = loadEnvConfig(overrides);
  const family = loadFamilyConfig(env.FAMILY_CONFIG_PATH);

  return { env, family };
}

export function resolvePath(pathValue: string): string {
  return resolve(pathValue);
}

export function isConfigured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function saveFamilyConfig(configPath: string, family: FamilyConfig): void {
  writeFileSync(configPath, `${JSON.stringify(family, null, 2)}\n`, "utf8");
}

export function validateAlertConfig(env: EnvConfig): string | null {
  if (isConfigured(env.ALERT_WEBHOOK_URL)) {
    try {
      const url = new URL(env.ALERT_WEBHOOK_URL!);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "ALERT_WEBHOOK_URL must use http or https";
      }
    } catch {
      return "ALERT_WEBHOOK_URL is not a valid URL";
    }
  }

  const smtpConfigured =
    isConfigured(env.ALERT_SMTP_HOST) ||
    isConfigured(env.ALERT_EMAIL_TO) ||
    isConfigured(env.ALERT_EMAIL_FROM);

  if (smtpConfigured) {
    if (
      !isConfigured(env.ALERT_SMTP_HOST) ||
      !isConfigured(env.ALERT_EMAIL_TO) ||
      !isConfigured(env.ALERT_EMAIL_FROM)
    ) {
      return "ALERT_SMTP_HOST, ALERT_EMAIL_TO, and ALERT_EMAIL_FROM are required for email alerts";
    }
  }

  return null;
}
