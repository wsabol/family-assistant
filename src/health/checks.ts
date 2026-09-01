import { existsSync } from "node:fs";

import {
  type EnvConfig,
  type FamilyConfig,
  isConfigured,
  resolvePath,
  validateAlertConfig,
} from "../config.js";
import { loadSystemPrompt } from "../ai/prompts.js";
import { probeCredentials } from "../google/oauth.js";
import { canWriteToLogDirectory } from "../logger.js";

export interface HealthCheckResult {
  name: string;
  ok: boolean;
  message: string;
  incidentType?: import("../domain/health-incident.js").HealthIncidentType;
}

export async function runHealthChecks(
  env: EnvConfig,
  family?: FamilyConfig,
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  if (canWriteToLogDirectory(env.LOG_DIR)) {
    results.push({
      name: "log_directory",
      ok: true,
      message: `Writable (${resolvePath(env.LOG_DIR)})`,
    });
  } else {
    results.push({
      name: "log_directory",
      ok: false,
      message: `Cannot write to ${resolvePath(env.LOG_DIR)}`,
      incidentType: "writable_dirs",
    });
  }

  const digestDir = resolvePath(env.DIGEST_DIR);
  if (canWriteToLogDirectory(digestDir)) {
    results.push({
      name: "digest_directory",
      ok: true,
      message: `Writable (${digestDir})`,
    });
  } else {
    results.push({
      name: "digest_directory",
      ok: false,
      message: `Cannot write to ${digestDir}`,
      incidentType: "writable_dirs",
    });
  }

  const promptPath = resolvePath("config/prompts/school-email-v1.txt");
  if (existsSync(promptPath)) {
    try {
      loadSystemPrompt();
      results.push({ name: "prompt_file", ok: true, message: "Prompt file found" });
    } catch (error) {
      results.push({
        name: "prompt_file",
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    results.push({
      name: "prompt_file",
      ok: false,
      message: `Prompt file not found at ${promptPath}`,
    });
  }

  const alertError = validateAlertConfig(env);
  if (alertError) {
    results.push({ name: "alert_config", ok: false, message: alertError });
  } else if (isConfigured(env.ALERT_WEBHOOK_URL)) {
    results.push({
      name: "alert_config",
      ok: true,
      message: "Webhook alert channel configured",
    });
  } else {
    results.push({
      name: "alert_config",
      ok: true,
      message: "No alert channel configured (optional)",
    });
  }

  if (isConfigured(env.GOOGLE_CLIENT_ID) && isConfigured(env.GOOGLE_CLIENT_SECRET)) {
    const gmailProbe = await probeCredentials(env, "gmail");
    results.push({
      name: "gmail_auth",
      ok: gmailProbe.ok,
      message: gmailProbe.ok
        ? `Gmail authorized${gmailProbe.expiresAt ? ` (expires ${gmailProbe.expiresAt})` : ""}`
        : gmailProbe.error ?? "Gmail auth failed",
      incidentType: gmailProbe.ok ? undefined : "gmail_auth",
    });

    const calendarProbe = await probeCredentials(
      env,
      "calendar",
      family?.schoolCalendarId,
    );
    results.push({
      name: "calendar_auth",
      ok: calendarProbe.ok,
      message: calendarProbe.ok
        ? `Calendar authorized${calendarProbe.expiresAt ? ` (expires ${calendarProbe.expiresAt})` : ""}`
        : calendarProbe.error ?? "Calendar auth failed",
      incidentType: calendarProbe.ok ? undefined : "calendar_auth",
    });
  } else {
    results.push({
      name: "gmail_auth",
      ok: false,
      message: "Google OAuth client not configured",
      incidentType: "gmail_auth",
    });
    results.push({
      name: "calendar_auth",
      ok: false,
      message: "Google OAuth client not configured",
      incidentType: "calendar_auth",
    });
  }

  if (isConfigured(env.AI_API_KEY)) {
    results.push({
      name: "ai_credentials",
      ok: true,
      message: `Configured (${env.AI_PROVIDER}, ${env.AI_MODEL})`,
    });
  } else {
    results.push({
      name: "ai_credentials",
      ok: false,
      message: "AI_API_KEY not configured",
      incidentType: "ai_api",
    });
  }

  return results;
}

export function hasAlertChannel(env: EnvConfig): boolean {
  return isConfigured(env.ALERT_WEBHOOK_URL);
}
