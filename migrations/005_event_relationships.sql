-- Track contextual relationships between extracted actions and internal event memory.

ALTER TABLE proposed_actions ADD COLUMN matched_action_id INTEGER REFERENCES proposed_actions (id);
ALTER TABLE proposed_actions ADD COLUMN event_relationship TEXT CHECK (
  event_relationship IN ('same_event', 'event_update', 'related_event', 'distinct_event')
);
ALTER TABLE proposed_actions ADD COLUMN dedupe_reasoning TEXT;
ALTER TABLE proposed_actions ADD COLUMN dedupe_confidence REAL;

CREATE INDEX IF NOT EXISTS idx_proposed_actions_matched_action_id
  ON proposed_actions (matched_action_id);
