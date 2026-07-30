-- Add superseded action status, message processing metadata, and raw body storage

ALTER TABLE messages ADD COLUMN raw_body_text TEXT;
ALTER TABLE messages ADD COLUMN model_name TEXT;
ALTER TABLE messages ADD COLUMN prompt_version TEXT;

-- SQLite cannot alter CHECK constraints; rebuild proposed_actions with superseded status

CREATE TABLE proposed_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'calendar_event',
      'deadline',
      'bring_item',
      'school_closure',
      'volunteer_opportunity',
      'informational',
      'needs_review'
    )
  ),
  child_name TEXT,
  title TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  location TEXT,
  description TEXT,
  reminder_offsets_minutes TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  ambiguity_reason TEXT,
  interpretation_summary TEXT,
  source_excerpt TEXT,
  original_payload_json TEXT NOT NULL,
  approved_payload_json TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'awaiting_review',
      'approved',
      'rejected',
      'writing',
      'completed',
      'failed',
      'superseded'
    )
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  completed_at TEXT
);

INSERT INTO proposed_actions_new (
  id,
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
  approved_payload_json,
  status,
  created_at,
  reviewed_at,
  completed_at
)
SELECT
  id,
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
  approved_payload_json,
  status,
  created_at,
  reviewed_at,
  completed_at
FROM proposed_actions;

DROP TABLE proposed_actions;

ALTER TABLE proposed_actions_new RENAME TO proposed_actions;

CREATE INDEX IF NOT EXISTS idx_proposed_actions_status
  ON proposed_actions (status);

CREATE INDEX IF NOT EXISTS idx_proposed_actions_message_id
  ON proposed_actions (message_id);
