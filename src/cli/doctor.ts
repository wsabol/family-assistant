import { openDatabase } from "../db/connection.js";
import { runMigrations, verifyDomainTables } from "../db/migrations.js";
import {
  ConfigError,
  isConfigured,
  loadEnvConfig,
  loadFamilyConfig,
  resolvePath,
  validateAlertConfig,
} from "../config.js";
import { existsSync } from "node:fs";
import { canWriteToLogDirectory } from "../logger.js";
import { probeCredentials } from "../google/oauth.js";
import { createGmailClient, listLabelIdByName } from "../gmail/client.js";
import { verifyCalendarAccess } from "../calendar/client.js";
import { loadSystemPrompt } from "../ai/prompts.js";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  passed: boolean;
}

function addCheck(
  checks: DoctorCheck[],
  name: string,
  status: CheckStatus,
  message: string,
): void {
  checks.push({ name, status, message });
}

export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  let env;
  try {
    env = loadEnvConfig();
    addCheck(checks, "Environment variables", "pass", "Required environment variables are valid");
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    addCheck(checks, "Environment variables", "fail", message);
    return { checks, passed: false };
  }

  let family;
  try {
    family = loadFamilyConfig(env.FAMILY_CONFIG_PATH);
    addCheck(
      checks,
      "Family config",
      "pass",
      `Loaded family config with ${family.children.length} child(ren) and timezone ${family.timezone}`,
    );
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    addCheck(checks, "Family config", "fail", message);
  }

  try {
    const db = openDatabase(env.DATABASE_PATH);
    const migrationResult = runMigrations(db);
    const missingTables = verifyDomainTables(db);
    db.close();

    if (missingTables.length > 0) {
      addCheck(
        checks,
        "Database connectivity",
        "fail",
        `Database opened but missing tables: ${missingTables.join(", ")}`,
      );
    } else {
      const appliedSummary =
        migrationResult.applied.length > 0
          ? `Applied migrations: ${migrationResult.applied.join(", ")}`
          : "Database schema is up to date";
      addCheck(
        checks,
        "Database connectivity",
        "pass",
        `${appliedSummary} (${resolvePath(env.DATABASE_PATH)})`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck(checks, "Database connectivity", "fail", message);
  }

  if (canWriteToLogDirectory(env.LOG_DIR)) {
    addCheck(
      checks,
      "Writable log directory",
      "pass",
      `Log directory is writable (${resolvePath(env.LOG_DIR)})`,
    );
  } else {
    addCheck(
      checks,
      "Writable log directory",
      "fail",
      `Cannot write to log directory (${resolvePath(env.LOG_DIR)})`,
    );
  }

  const digestDir = resolvePath(env.DIGEST_DIR);
  if (canWriteToLogDirectory(digestDir)) {
    addCheck(
      checks,
      "Writable digest directory",
      "pass",
      `Digest directory is writable (${digestDir})`,
    );
  } else {
    addCheck(
      checks,
      "Writable digest directory",
      "fail",
      `Cannot write to digest directory (${digestDir})`,
    );
  }

  const promptPath = resolvePath("config/prompts/school-email-v1.txt");
  if (existsSync(promptPath)) {
    try {
      loadSystemPrompt();
      addCheck(checks, "Prompt file", "pass", "AI prompt file is readable");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addCheck(checks, "Prompt file", "fail", message);
    }
  } else {
    addCheck(checks, "Prompt file", "fail", `Prompt file not found at ${promptPath}`);
  }

  const alertError = validateAlertConfig(env);
  if (alertError) {
    addCheck(checks, "Alert configuration", "fail", alertError);
  } else if (isConfigured(env.ALERT_WEBHOOK_URL)) {
    addCheck(checks, "Alert configuration", "pass", "Webhook alert URL configured");
  } else {
    addCheck(
      checks,
      "Alert configuration",
      "warn",
      "No ALERT_WEBHOOK_URL configured (optional for proactive alerts)",
    );
  }

  if (isConfigured(env.GOOGLE_CLIENT_ID) && isConfigured(env.GOOGLE_CLIENT_SECRET)) {
    addCheck(
      checks,
      "Google OAuth client",
      "pass",
      "Google OAuth client ID and secret are configured",
    );
  } else {
    addCheck(
      checks,
      "Google OAuth client",
      "fail",
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required",
    );
  }

  const gmailProbe = await probeCredentials(env, "gmail");
  if (gmailProbe.ok) {
    addCheck(
      checks,
      "Gmail credentials",
      "pass",
      `Gmail authorized${gmailProbe.expiresAt ? ` (token expires ${gmailProbe.expiresAt})` : ""}`,
    );
  } else if (!gmailProbe.tokenPresent) {
    addCheck(
      checks,
      "Gmail credentials",
      "warn",
      "No saved Gmail token. Run: family-assistant auth gmail",
    );
  } else {
    addCheck(checks, "Gmail credentials", "fail", gmailProbe.error ?? "Gmail auth failed");
  }

  const calendarProbe = await probeCredentials(
    env,
    "calendar",
    family?.schoolCalendarId,
  );
  if (calendarProbe.ok) {
    addCheck(
      checks,
      "Calendar credentials",
      "pass",
      `Calendar authorized${calendarProbe.expiresAt ? ` (token expires ${calendarProbe.expiresAt})` : ""}`,
    );
  } else if (!calendarProbe.tokenPresent) {
    addCheck(
      checks,
      "Calendar credentials",
      "warn",
      "No saved Calendar token. Run: family-assistant auth calendar",
    );
  } else {
    addCheck(
      checks,
      "Calendar credentials",
      "fail",
      calendarProbe.error ?? "Calendar auth failed",
    );
  }

  if (isConfigured(env.AI_PROVIDER) && isConfigured(env.AI_API_KEY)) {
    addCheck(
      checks,
      "AI credentials",
      "pass",
      `Configured (${env.AI_PROVIDER}, model ${env.AI_MODEL})`,
    );
  } else {
    addCheck(checks, "AI credentials", "warn", "AI_PROVIDER and AI_API_KEY not configured");
  }

  if (family && gmailProbe.ok) {
    try {
      const client = await createGmailClient(env);
      const labelId = await listLabelIdByName(client, family.gmailLabel);

      if (labelId) {
        addCheck(
          checks,
          "Gmail labels",
          "pass",
          `Configured Gmail label exists: ${family.gmailLabel}`,
        );
      } else {
        addCheck(
          checks,
          "Gmail labels",
          "fail",
          `Gmail label not found: ${family.gmailLabel}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addCheck(checks, "Gmail labels", "fail", message);
    }
  } else {
    addCheck(checks, "Gmail labels", "skip", "Skipped (Gmail not authorized or family config missing)");
  }

  if (family && calendarProbe.ok) {
    try {
      await verifyCalendarAccess(env, family.schoolCalendarId);
      addCheck(
        checks,
        "Calendar access",
        "pass",
        `Can access calendar ${family.schoolCalendarId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addCheck(checks, "Calendar access", "fail", message);
    }
  } else {
    addCheck(
      checks,
      "Calendar access",
      "skip",
      "Skipped (Calendar not authorized or family config missing)",
    );
  }

  const passed = checks.every(
    (check) =>
      check.status === "pass" || check.status === "warn" || check.status === "skip",
  );

  return { checks, passed };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = ["Family Assistant Doctor", "======================"];

  for (const check of report.checks) {
    const statusLabel = check.status.toUpperCase().padEnd(4);
    lines.push(`[${statusLabel}] ${check.name}: ${check.message}`);
  }

  lines.push("");
  lines.push(report.passed ? "Overall: PASS" : "Overall: FAIL");

  return lines.join("\n");
}

export async function runDoctorCommand(): Promise<number> {
  const report = await runDoctor();
  console.log(formatDoctorReport(report));
  return report.passed ? 0 : 1;
}
