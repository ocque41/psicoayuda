-- Aditiva: las respuestas históricas siguen siendo staff, sin inventar autores.
ALTER TABLE support_replies ADD COLUMN author_role TEXT NOT NULL DEFAULT 'staff';
--> statement-breakpoint
ALTER TABLE support_replies ADD COLUMN actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE support_replies ADD COLUMN submission_id TEXT;
--> statement-breakpoint
CREATE INDEX support_replies_thread_order_idx ON support_replies(contact_id, created_at, id);
--> statement-breakpoint
CREATE INDEX support_replies_actor_time_idx ON support_replies(author_role, actor_user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX support_replies_submission_idx ON support_replies(author_role, actor_user_id, submission_id);
--> statement-breakpoint
CREATE TRIGGER support_reply_shape BEFORE INSERT ON support_replies
WHEN NEW.author_role NOT IN ('staff', 'professional')
  OR length(trim(NEW.body)) < 3 OR length(NEW.body) > 2000
  OR (NEW.actor_user_id IS NOT NULL AND (NEW.submission_id IS NULL OR length(NEW.submission_id) <> 36))
  OR (NEW.author_role = 'professional' AND NEW.actor_user_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'support_reply_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER support_reply_professional_owner BEFORE INSERT ON support_replies
WHEN NEW.author_role = 'professional' AND NOT EXISTS (
  SELECT 1 FROM contact_messages AS ticket
  JOIN professionals AS professional ON professional.id = ticket.professional_id
  JOIN user AS actor ON actor.id = professional.user_id
  WHERE ticket.id = NEW.contact_id AND ticket.source = 'professional_dashboard'
    AND professional.status <> 'deleting' AND actor.id = NEW.actor_user_id
    AND lower(actor.email) = lower(NEW.author_email)
)
BEGIN
  SELECT RAISE(ABORT, 'support_reply_owner');
END;
--> statement-breakpoint
CREATE TRIGGER support_reply_staff_identity BEFORE INSERT ON support_replies
WHEN NEW.author_role = 'staff' AND NEW.actor_user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM user AS actor WHERE actor.id = NEW.actor_user_id
    AND actor.email_verified = 1 AND lower(actor.email) = lower(NEW.author_email)
)
BEGIN
  SELECT RAISE(ABORT, 'support_reply_identity');
END;
--> statement-breakpoint
CREATE TRIGGER support_reply_rate_limit BEFORE INSERT ON support_replies
WHEN NEW.actor_user_id IS NOT NULL AND (
  SELECT count(*) FROM support_replies
  WHERE author_role = NEW.author_role AND actor_user_id = NEW.actor_user_id
    AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
) >= 20
BEGIN
  SELECT RAISE(ABORT, 'support_reply_rate_limit');
END;
--> statement-breakpoint
CREATE TRIGGER support_reply_immutable BEFORE UPDATE OF contact_id, body, author_email, author_role, submission_id, created_at ON support_replies
BEGIN
  SELECT RAISE(ABORT, 'support_reply_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER support_reply_professional_reopen AFTER INSERT ON support_replies
WHEN NEW.author_role = 'professional'
BEGIN
  UPDATE contact_messages SET status = 'new', handled_by = NULL, handled_at = NULL
  WHERE id = NEW.contact_id AND status = 'resolved';
  UPDATE contact_messages SET updated_at = max(NEW.created_at,
    coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), NEW.created_at))
  WHERE id = NEW.contact_id;
END;

--> statement-breakpoint
CREATE INDEX contact_messages_updated_order_idx ON contact_messages(updated_at, id);
--> statement-breakpoint
CREATE INDEX contact_messages_status_updated_order_idx ON contact_messages(status, updated_at, id);
--> statement-breakpoint
CREATE INDEX contact_messages_pro_updated_order_idx ON contact_messages(professional_id, source, updated_at, id);
