-- Aditiva: ninguna suscripción ni consentimiento se crea al migrar.
CREATE TABLE web_push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 role TEXT NOT NULL,
 session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
 endpoint_hash TEXT NOT NULL,
 sealed_subscription TEXT,
 vapid_key_hash TEXT NOT NULL,
 preferences_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 consent_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CONSTRAINT web_push_role_check CHECK(role IN ('professional','patient')),
 CONSTRAINT web_push_preferences_check CHECK(json_valid(preferences_json)),
 CONSTRAINT web_push_revision_check CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX web_push_endpoint_idx ON web_push_subscriptions(endpoint_hash);
--> statement-breakpoint
CREATE INDEX web_push_owner_idx ON web_push_subscriptions(user_id, role, revoked_at);
--> statement-breakpoint
CREATE INDEX web_push_scan_idx ON web_push_subscriptions(revoked_at, updated_at, id);
--> statement-breakpoint
CREATE TABLE web_push_deliveries (
 id TEXT PRIMARY KEY NOT NULL,
 subscription_id TEXT NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 event_hash TEXT NOT NULL,
 kind TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 event_version TEXT NOT NULL,
 preference_revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 lease_until INTEGER,
 claim_token TEXT,
 reason_code TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 CONSTRAINT web_push_kind_check CHECK(kind IN ('chat','appointment','after_session')),
 CONSTRAINT web_push_status_check CHECK(status IN ('pending','sending','sent','skipped','dead')),
 CONSTRAINT web_push_attempts_check CHECK(attempts BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX web_push_event_idx ON web_push_deliveries(subscription_id,event_hash);
--> statement-breakpoint
CREATE INDEX web_push_deliveries_due_idx ON web_push_deliveries(status,next_attempt_at,id);
--> statement-breakpoint
CREATE INDEX web_push_deliveries_expiry_idx ON web_push_deliveries(expires_at);
