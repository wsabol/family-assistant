import type {
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
          original_payload_json,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_review')
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
        input.originalPayloadJson,
      );

    return Number(result.lastInsertRowid);
  }

  findById(id: number): ProposedAction | null {
    const row = this.db
      .prepare("SELECT * FROM proposed_actions WHERE id = ?")
      .get(id) as ProposedActionRow | undefined;
    return row ? mapProposedActionRow(row) : null;
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
