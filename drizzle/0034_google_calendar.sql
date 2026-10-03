-- OAuth de Calendar independiente del acceso a Nido. Solo añade tablas e índices.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK(audience IN ('pro','patient')),
  token_envelope TEXT NOT NULL,
  calendar_id TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected','needs_reconnect','disconnecting')),
  google_reminders INTEGER NOT NULL DEFAULT 0 CHECK(google_reminders IN (0,1)),
  auto_sync INTEGER NOT NULL DEFAULT 0 CHECK(auto_sync IN (0,1)),
  preferences_revision INTEGER NOT NULL DEFAULT 0 CHECK(preferences_revision>=0),
  sync_cursor TEXT,
  lease_id TEXT,
  lease_until TEXT,
  last_synced_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_user_audience_idx ON google_calendar_connections(user_id,audience);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS google_calendar_auto_sync_idx ON google_calendar_connections(status,auto_sync,updated_at,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK(audience IN ('pro','patient')),
  verifier_envelope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS google_calendar_state_expiry_idx ON google_calendar_oauth_states(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS google_calendar_state_user_idx ON google_calendar_oauth_states(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS google_calendar_event_links (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES practice_appointments(id) ON DELETE SET NULL,
  event_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','cancelled')),
  source_updated_at TEXT,
  google_reminders INTEGER NOT NULL DEFAULT 0 CHECK(google_reminders IN (0,1)),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_event_appointment_idx ON google_calendar_event_links(connection_id,appointment_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_event_id_idx ON google_calendar_event_links(connection_id,event_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS google_calendar_event_cleanup_idx ON google_calendar_event_links(connection_id,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_appointments_calendar_pro_id_idx ON practice_appointments(professional_id,id);
