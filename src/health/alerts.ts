import type { EnvConfig } from "../config.js";
import type { HealthIncident } from "../domain/health-incident.js";

export interface AlertPayload {
  incidentType: string;
  status: "open" | "resolved";
  message: string;
  timestamp: string;
}

function formatAlertText(payload: AlertPayload): string {
  return `[Family Assistant] ${payload.incidentType} ${payload.status}: ${payload.message} (${payload.timestamp})`;
}

export function buildWebhookBody(
  urlValue: string,
  payload: AlertPayload,
): object {
  const hostname = new URL(urlValue).hostname.toLowerCase();
  if (
    hostname === "hooks.slack.com" ||
    hostname.endsWith(".hooks.slack.com") ||
    hostname === "hooks.slack-gov.com" ||
    hostname.endsWith(".hooks.slack-gov.com")
  ) {
    return { text: formatAlertText(payload) };
  }
  if (
    hostname === "discord.com" ||
    hostname.endsWith(".discord.com") ||
    hostname === "discordapp.com" ||
    hostname.endsWith(".discordapp.com")
  ) {
    return { content: formatAlertText(payload) };
  }
  return payload;
}

export async function sendAlert(
  env: EnvConfig,
  payload: AlertPayload,
): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL?.trim()) {
    return false;
  }

  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookBody(env.ALERT_WEBHOOK_URL, payload)),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendIncidentAlert(
  env: EnvConfig,
  incident: HealthIncident,
  status: "open" | "resolved",
): Promise<boolean> {
  return sendAlert(env, {
    incidentType: incident.incidentType,
    status,
    message: incident.message,
    timestamp: new Date().toISOString(),
  });
}

export async function sendTestAlert(env: EnvConfig): Promise<boolean> {
  return sendAlert(env, {
    incidentType: "test",
    status: "open",
    message: "Family Assistant test alert — your notification channel is working.",
    timestamp: new Date().toISOString(),
  });
}
