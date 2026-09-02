CREATE TABLE IF NOT EXISTS health_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  message TEXT NOT NULL,
  details_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  alert_sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_incidents_open_type
  ON health_incidents (incident_type)
  WHERE status = 'open';
