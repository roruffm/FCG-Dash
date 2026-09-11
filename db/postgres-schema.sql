CREATE TABLE IF NOT EXISTS dashboard_data (
  period TEXT NOT NULL,
  scope TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (period, scope)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  window_started BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_passwords (
  role TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_sync_events (
  jti TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_sync_events_expires_at_idx
  ON password_sync_events (expires_at);
