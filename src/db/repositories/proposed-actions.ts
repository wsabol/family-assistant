import type {
  EventRelationship,
  ProposedAction,
  ProposedActionStatus,
  ProposedActionType,
} from "../../domain/proposed-action.js";

export interface ProposedActionRow {
  id: number;
  message_id: number;
  action_type: ProposedActionType;
  child_name: string | null;
  title: string;
  start_at: string | null;
  end_at: string | null;
  all_day: number;
  location: string | null;
  description: string | null;
  reminder_offsets_minutes: string;
  confidence: number;
  ambiguity_reason: string | null;
  interpretation_summary: string | null;
  source_excerpt: string | null;
  matched_action_id: number | null;
  event_relationship: EventRelationship | null;
  dedupe_reasoning: string | null;
  dedupe_confidence: number | null;
  original_payload_json: string;
  approved_payload_json: string | null;
  status: ProposedActionStatus;
  created_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
}

export function mapProposedActionRow(row: ProposedActionRow): ProposedAction {
  return {
    id: row.id,
    messageId: row.message_id,
    actionType: row.action_type,
    childName: row.child_name,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
    location: row.location,
    description: row.description,
    reminderOffsetsMinutes: JSON.parse(row.reminder_offsets_minutes) as number[],
    confidence: row.confidence,
    ambiguityReason: row.ambiguity_reason,
    interpretationSummary: row.interpretation_summary,
    sourceExcerpt: row.source_excerpt,
    matchedActionId: row.matched_action_id,
    eventRelationship: row.event_relationship,
    dedupeReasoning: row.dedupe_reasoning,
    dedupeConfidence: row.dedupe_confidence,
    originalPayloadJson: row.original_payload_json,
    approvedPayloadJson: row.approved_payload_json,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    completedAt: row.completed_at,
  };
}

export interface CreateProposedActionInput {
  messageId: number;
  actionType: ProposedActionType;
  childName: string | null;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  reminderOffsetsMinutes: number[];
  confidence: number;
  ambiguityReason: string | null;
  interpretationSummary: string | null;
  sourceExcerpt: string | null;
  originalPayloadJson: string;
  matchedActionId?: number | null;
  eventRelationship?: EventRelationship | null;
  dedupeReasoning?: string | null;
  dedupeConfidence?: number | null;
  status?: "awaiting_review" | "approved";
}

export interface CalendarMemoryCandidate {
  action: ProposedAction;
  sourceSubject: string;
  googleCalendarId: string;
  googleEventId: string;
  eventHtmlLink: string | null;
}

export interface ApprovedActionPayload {
  actionType: ProposedActionType;
  childName: string | null;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  reminderOffsetsMinutes: number[];
}

export class ProposedActionsRepository {
  constructor(private readonly db: import("better-sqlite3").Database) {}

  create(input: CreateProposedActionInput): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO proposed_actions (
          message_id,
          action_type,
          child_name,
          title,
          start_at,
          end_at,
          all_day,
          location,
          description,
          reminder_offsets_minutes,
          confidence,
          ambiguity_reason,
          interpretation_summary,
          source_excerpt,
          matched_action_id,
          event_relationship,
          dedupe_reasoning,
          dedupe_confidence,
          original_payload_json,
          approved_payload_json,
          status,
          reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'approved' THEN datetime('now') ELSE NULL END)
        `,
      )
      .run(
        input.messageId,
        input.actionType,
        input.childName,
        input.title,
        input.startAt,
        input.endAt,
        input.allDay ? 1 : 0,
        input.location,
        input.description,
        JSON.stringify(input.reminderOffsetsMinutes),
        input.confidence,
        input.ambiguityReason,
        input.interpretationSummary,
        input.sourceExcerpt,
        input.matchedActionId ?? null,
        input.eventRelationship ?? null,
        input.dedupeReasoning ?? null,
        input.dedupeConfidence ?? null,
        input.originalPayloadJson,
        input.status === "approved" ? JSON.stringify({
          actionType: input.actionType,
          childName: input.childName,
          title: input.title,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          location: input.location,
          description: input.description,
          reminderOffsetsMinutes: input.reminderOffsetsMinutes,
        }) : null,
        input.status ?? "awaiting_review",
        input.status ?? "awaiting_review",
      );

    return Number(result.lastInsertRowid);
  }

  findById(id: number): ProposedAction | null {
    const row = this.db
      .prepare("SELECT * FROM proposed_actions WHERE id = ?")
      .get(id) as ProposedActionRow | undefined;
    return row ? mapProposedActionRow(row) : null;
  }

  listCalendarMemoryCandidates(
    startAt: string | null,
    childName: string | null,
    limit = 30,
  ): CalendarMemoryCandidate[] {
    const rows = this.db
      .prepare(
        `
        SELECT pa.*, m.subject AS source_subject,
               cl.google_calendar_id, cl.google_event_id, cl.event_html_link
        FROM proposed_actions pa
        JOIN messages m ON m.id = pa.message_id
        JOIN calendar_links cl ON cl.proposed_action_id = pa.id
        WHERE pa.status = 'completed'
        ORDER BY
          CASE WHEN ? IS NOT NULL AND LOWER(pa.child_name) = LOWER(?) THEN 0 ELSE 1 END,
          CASE
            WHEN ? IS NOT NULL AND pa.start_at IS NOT NULL
            THEN ABS(julianday(pa.start_at) - julianday(?))
            ELSE 999999
          END,
          pa.completed_at DESC
        LIMIT ?
        `,
      )
      .all(childName, childName, startAt, startAt, limit) as Array<
        ProposedActionRow & {
          google_calendar_id: string;
          google_event_id: string;
          event_html_link: string | null;
          source_subject: string;
        }
      >;

    const candidates = rows.map((row) => ({
      action: mapProposedActionRow(row),
      sourceSubject: row.source_subject,
      googleCalendarId: row.google_calendar_id,
      googleEventId: row.google_event_id,
      eventHtmlLink: row.event_html_link,
    }));

    const uniqueByEvent = new Map<string, CalendarMemoryCandidate>();
    for (const candidate of candidates) {
      if (!uniqueByEvent.has(candidate.googleEventId)) {
        uniqueByEvent.set(candidate.googleEventId, candidate);
      }
    }
    return [...uniqueByEvent.values()];
  }

  listByMessageId(messageId: number): ProposedAction[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proposed_actions WHERE message_id = ? ORDER BY id ASC",
      )
      .all(messageId) as ProposedActionRow[];
    return rows.map(mapProposedActionRow);
  }

  listByStatus(status: ProposedActionStatus): ProposedAction[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proposed_actions WHERE status = ? ORDER BY created_at ASC",
      )
      .all(status) as ProposedActionRow[];
    return rows.map(mapProposedActionRow);
  }

  listAwaitingReviewSorted(family?: import("../../config.js").FamilyConfig): ProposedAction[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proposed_actions WHERE status = 'awaiting_review' ORDER BY confidence ASC, created_at ASC",
      )
      .all() as ProposedActionRow[];

    const actions = rows.map(mapProposedActionRow);
    const priorityTypes = family?.reviewHints?.priorityActionTypes ?? [];

    if (priorityTypes.length === 0) {
      return actions;
    }

    return [...actions].sort((a, b) => {
      const aPriority = priorityTypes.includes(a.actionType) ? 0 : 1;
      const bPriority = priorityTypes.includes(b.actionType) ? 0 : 1;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.confidence - b.confidence;
    });
  }

  countByStatus(): Record<ProposedActionStatus, number> {
    const rows = this.db
      .prepare(
        "SELECT status, COUNT(*) as count FROM proposed_actions GROUP BY status",
      )
      .all() as Array<{ status: ProposedActionStatus; count: number }>;

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts as Record<ProposedActionStatus, number>;
  }

  supersedeForMessage(messageId: number): number {
    const result = this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET status = 'superseded'
        WHERE message_id = ?
          AND status IN ('awaiting_review', 'approved')
        `,
      )
      .run(messageId);

    return result.changes;
  }

  updateDraft(id: number, payload: ApprovedActionPayload): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET action_type = ?,
            child_name = ?,
            title = ?,
            start_at = ?,
            end_at = ?,
            all_day = ?,
            location = ?,
            description = ?,
            reminder_offsets_minutes = ?,
            approved_payload_json = ?
        WHERE id = ? AND status = 'awaiting_review'
        `,
      )
      .run(
        payload.actionType,
        payload.childName,
        payload.title,
        payload.startAt,
        payload.endAt,
        payload.allDay ? 1 : 0,
        payload.location,
        payload.description,
        JSON.stringify(payload.reminderOffsetsMinutes),
        JSON.stringify(payload),
        id,
      );
  }

  approve(id: number, payload: ApprovedActionPayload): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET action_type = ?,
            child_name = ?,
            title = ?,
            start_at = ?,
            end_at = ?,
            all_day = ?,
            location = ?,
            description = ?,
            reminder_offsets_minutes = ?,
            approved_payload_json = ?,
            status = 'approved',
            reviewed_at = datetime('now')
        WHERE id = ? AND status = 'awaiting_review'
        `,
      )
      .run(
        payload.actionType,
        payload.childName,
        payload.title,
        payload.startAt,
        payload.endAt,
        payload.allDay ? 1 : 0,
        payload.location,
        payload.description,
        JSON.stringify(payload.reminderOffsetsMinutes),
        JSON.stringify(payload),
        id,
      );
  }

  setResolvedPayload(id: number, payload: ApprovedActionPayload): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET action_type = ?,
            child_name = ?,
            title = ?,
            start_at = ?,
            end_at = ?,
            all_day = ?,
            location = ?,
            description = ?,
            reminder_offsets_minutes = ?,
            approved_payload_json = ?
        WHERE id = ? AND status = 'writing'
        `,
      )
      .run(
        payload.actionType,
        payload.childName,
        payload.title,
        payload.startAt,
        payload.endAt,
        payload.allDay ? 1 : 0,
        payload.location,
        payload.description,
        JSON.stringify(payload.reminderOffsetsMinutes),
        JSON.stringify(payload),
        id,
      );
  }

  reject(id: number): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET status = 'rejected',
            reviewed_at = datetime('now')
        WHERE id = ? AND status = 'awaiting_review'
        `,
      )
      .run(id);
  }

  claimApproved(): ProposedAction | null {
    const claim = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `
          SELECT pa.* FROM proposed_actions pa
          LEFT JOIN calendar_links cl ON cl.proposed_action_id = pa.id
          WHERE pa.status = 'approved' AND cl.id IS NULL
          ORDER BY pa.reviewed_at ASC
          LIMIT 1
          `,
        )
        .get() as ProposedActionRow | undefined;

      if (!row) {
        return null;
      }

      const updated = this.db
        .prepare(
          `
          UPDATE proposed_actions
          SET status = 'writing'
          WHERE id = ? AND status = 'approved'
          `,
        )
        .run(row.id);

      if (updated.changes === 0) {
        return null;
      }

      return mapProposedActionRow({ ...row, status: "writing" });
    });

    return claim();
  }

  markCompleted(id: number): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET status = 'completed',
            completed_at = datetime('now')
        WHERE id = ?
        `,
      )
      .run(id);
  }

  markFailed(id: number): void {
    this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET status = 'failed'
        WHERE id = ?
        `,
      )
      .run(id);
  }

  recoverStaleWriting(staleMinutes: number): number {
    const result = this.db
      .prepare(
        `
        UPDATE proposed_actions
        SET status = 'approved'
        WHERE status = 'writing'
          AND reviewed_at IS NOT NULL
          AND reviewed_at < datetime('now', '-' || ? || ' minutes')
        `,
      )
      .run(staleMinutes);

    return result.changes;
  }
}
