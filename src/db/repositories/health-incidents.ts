import type {
  HealthIncident,
  HealthIncidentStatus,
  HealthIncidentType,
} from "../../domain/health-incident.js";

export interface HealthIncidentRow {
  id: number;
  incident_type: HealthIncidentType;
  status: HealthIncidentStatus;
  message: string;
  details_json: string | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  alert_sent_at: string | null;
}

function mapRow(row: HealthIncidentRow): HealthIncident {
  return {
    id: row.id,
    incidentType: row.incident_type,
    status: row.status,
    message: row.message,
    detailsJson: row.details_json,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    alertSentAt: row.alert_sent_at,
  };
}

export class HealthIncidentsRepository {
  constructor(private readonly db: import("better-sqlite3").Database) {}

  recordOpen(
    incidentType: HealthIncidentType,
    message: string,
    detailsJson?: string,
  ): HealthIncident {
    const existing = this.db
      .prepare(
        "SELECT * FROM health_incidents WHERE incident_type = ? AND status = 'open'",
      )
      .get(incidentType) as HealthIncidentRow | undefined;

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE health_incidents
          SET message = ?, details_json = ?, last_seen_at = datetime('now')
          WHERE id = ?
          `,
        )
        .run(message, detailsJson ?? existing.details_json, existing.id);

      return mapRow(
        this.db
          .prepare("SELECT * FROM health_incidents WHERE id = ?")
          .get(existing.id) as HealthIncidentRow,
      );
    }

    const result = this.db
      .prepare(
        `
        INSERT INTO health_incidents (
          incident_type, status, message, details_json, first_seen_at, last_seen_at
        ) VALUES (?, 'open', ?, ?, datetime('now'), datetime('now'))
        `,
      )
      .run(incidentType, message, detailsJson ?? null);

    return mapRow(
      this.db
        .prepare("SELECT * FROM health_incidents WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as HealthIncidentRow,
    );
  }

  resolve(incidentType: HealthIncidentType): HealthIncident | null {
    const existing = this.db
      .prepare(
        "SELECT * FROM health_incidents WHERE incident_type = ? AND status = 'open'",
      )
      .get(incidentType) as HealthIncidentRow | undefined;

    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `
        UPDATE health_incidents
        SET status = 'resolved', resolved_at = datetime('now'), last_seen_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(existing.id);

    return mapRow(
      this.db
        .prepare("SELECT * FROM health_incidents WHERE id = ?")
        .get(existing.id) as HealthIncidentRow,
    );
  }

  markAlertSent(id: number): void {
    this.db
      .prepare(
        "UPDATE health_incidents SET alert_sent_at = datetime('now') WHERE id = ?",
      )
      .run(id);
  }

  listRecent(limit = 20): HealthIncident[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM health_incidents ORDER BY last_seen_at DESC LIMIT ?",
      )
      .all(limit) as HealthIncidentRow[];
    return rows.map(mapRow);
  }

  listOpen(): HealthIncident[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM health_incidents WHERE status = 'open' ORDER BY last_seen_at DESC",
      )
      .all() as HealthIncidentRow[];
    return rows.map(mapRow);
  }
}
