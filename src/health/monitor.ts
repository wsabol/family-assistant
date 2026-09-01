import type { EnvConfig } from "../config.js";
import type { FamilyConfig } from "../config.js";
import type { HealthIncidentType } from "../domain/health-incident.js";
import { HealthIncidentsRepository } from "../db/repositories/health-incidents.js";
import { runHealthChecks, hasAlertChannel, type HealthCheckResult } from "./checks.js";
import { sendIncidentAlert } from "./alerts.js";

export interface HealthRunResult {
  checks: HealthCheckResult[];
  openIncidents: number;
  resolvedIncidents: number;
  alertsSent: number;
}

export async function runHealthMonitor(
  env: EnvConfig,
  db: import("better-sqlite3").Database,
  family?: FamilyConfig,
): Promise<HealthRunResult> {
  const incidentsRepo = new HealthIncidentsRepository(db);
  const checks = await runHealthChecks(env, family);
  let openIncidents = 0;
  let resolvedIncidents = 0;
  let alertsSent = 0;

  const checkedTypes = new Set<HealthIncidentType>();

  for (const check of checks) {
    if (!check.incidentType) {
      continue;
    }

    checkedTypes.add(check.incidentType);

    if (!check.ok) {
      const incident = incidentsRepo.recordOpen(
        check.incidentType,
        check.message,
      );
      openIncidents += 1;

      if (hasAlertChannel(env) && !incident.alertSentAt) {
        const sent = await sendIncidentAlert(env, incident, "open");
        if (sent) {
          incidentsRepo.markAlertSent(incident.id);
          alertsSent += 1;
        }
      }
    } else {
      const resolved = incidentsRepo.resolve(check.incidentType);
      if (resolved) {
        resolvedIncidents += 1;
        if (hasAlertChannel(env)) {
          const sent = await sendIncidentAlert(env, resolved, "resolved");
          if (sent) {
            alertsSent += 1;
          }
        }
      }
    }
  }

  for (const open of incidentsRepo.listOpen()) {
    if (!checkedTypes.has(open.incidentType)) {
      const resolved = incidentsRepo.resolve(open.incidentType);
      if (resolved && hasAlertChannel(env)) {
        resolvedIncidents += 1;
        const sent = await sendIncidentAlert(env, resolved, "resolved");
        if (sent) {
          alertsSent += 1;
        }
      }
    }
  }

  return { checks, openIncidents, resolvedIncidents, alertsSent };
}

export function recordAuthFailure(
  db: import("better-sqlite3").Database,
  service: "gmail" | "calendar",
  error: unknown,
): void {
  const incidentsRepo = new HealthIncidentsRepository(db);
  const incidentType: HealthIncidentType =
    service === "gmail" ? "gmail_auth" : "calendar_auth";
  const message =
    error instanceof Error ? error.message : String(error);
  incidentsRepo.recordOpen(incidentType, message);
}
