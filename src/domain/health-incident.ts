export type HealthIncidentStatus = "open" | "resolved";

export type HealthIncidentType =
  | "gmail_auth"
  | "calendar_auth"
  | "ai_api"
  | "writable_dirs"
  | "test";

export interface HealthIncident {
  id: number;
  incidentType: HealthIncidentType;
  status: HealthIncidentStatus;
  message: string;
  detailsJson: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  alertSentAt: string | null;
}
