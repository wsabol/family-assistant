import type { CalendarLink } from "../../domain/proposed-action.js";

export interface CalendarLinkRow {
  id: number;
  proposed_action_id: number;
  google_calendar_id: string;
  google_event_id: string;
  event_html_link: string | null;
  created_at: string;
}

export function mapCalendarLinkRow(row: CalendarLinkRow): CalendarLink {
  return {
    id: row.id,
    proposedActionId: row.proposed_action_id,
    googleCalendarId: row.google_calendar_id,
    googleEventId: row.google_event_id,
    eventHtmlLink: row.event_html_link,
    createdAt: row.created_at,
  };
}

export class CalendarLinksRepository {
  constructor(private readonly db: import("better-sqlite3").Database) {}

  existsForAction(proposedActionId: number): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM calendar_links WHERE proposed_action_id = ? LIMIT 1",
      )
      .get(proposedActionId);
    return row !== undefined;
  }

  create(
    proposedActionId: number,
    googleCalendarId: string,
    googleEventId: string,
    eventHtmlLink: string | null,
  ): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO calendar_links (
          proposed_action_id,
          google_calendar_id,
          google_event_id,
          event_html_link
        ) VALUES (?, ?, ?, ?)
        `,
      )
      .run(proposedActionId, googleCalendarId, googleEventId, eventHtmlLink);

    return Number(result.lastInsertRowid);
  }

  listRecent(limit = 20): CalendarLink[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM calendar_links ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as CalendarLinkRow[];
    return rows.map(mapCalendarLinkRow);
  }
}
