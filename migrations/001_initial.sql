-- Milestone 1: initial domain schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  subject TEXT NOT NULL,
  sender_name TEXT,
  sender_email TEXT NOT NULL,
  received_at TEXT NOT NULL,
  body_text TEXT NOT NULL,
  source_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_gmail_message_id
  ON messages (gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_status
  ON messages (status);

CREATE TABLE IF NOT EXISTS proposed_actions (
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
    status IN ('awaiting_review', 'approved', 'rejected', 'writing', 'completed', 'failed')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposed_actions_status
  ON proposed_actions (status);

CREATE INDEX IF NOT EXISTS idx_proposed_actions_message_id
  ON proposed_actions (message_id);

CREATE TABLE IF NOT EXISTS calendar_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposed_action_id INTEGER NOT NULL REFERENCES proposed_actions (id) ON DELETE CASCADE,
  google_calendar_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  event_html_link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_links_proposed_action_id
  ON calendar_links (proposed_action_id);
