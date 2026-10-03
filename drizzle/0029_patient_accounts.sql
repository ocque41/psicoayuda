-- Migración aditiva: no borra ni modifica usuarios, conversaciones o citas existentes.
CREATE TABLE IF NOT EXISTS patient_accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL, country TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/Caracas', preferred_language TEXT NOT NULL DEFAULT 'es',
  age_band TEXT NOT NULL DEFAULT 'adult', onboarding_completed_at TEXT, deletion_state TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS patient_conversation_links (
  conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  verified_by TEXT NOT NULL, verified_at TEXT NOT NULL, last_read_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS patient_links_user_idx ON patient_conversation_links(user_id, verified_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_role_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_onboarding_drafts (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL, answers_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS account_drafts_expiry_idx ON account_onboarding_drafts(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS patient_session_requests (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES practice_appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', preferred_starts_at TEXT,
  timezone TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS patient_requests_user_date_idx ON patient_session_requests(user_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS patient_requests_chat_status_idx ON patient_session_requests(conversation_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS patient_requests_appointment_pending_idx ON patient_session_requests(appointment_id) WHERE status = 'pending';
