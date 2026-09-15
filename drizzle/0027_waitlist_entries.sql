-- Lista de espera para personas que necesitan apoyo psicológico por motivos
-- AJENOS al terremoto. Migración 100% aditiva: no toca ni borra datos
-- existentes. La ayuda gratuita de la emergencia está reservada para las
-- víctimas del terremoto; aquí se anotan quienes necesitan apoyo por otro
-- motivo, para avisarles cuando se libere un cupo voluntario.
--
-- UNA fila por correo (`waitlist_entries_email_unique`): si la persona vuelve a
-- enviar el formulario se ACTUALIZA su anotación (ON CONFLICT ... DO UPDATE) en
-- vez de duplicarla. `requester_hash` es un código irreversible de la conexión
-- (nunca la IP) para limitar abuso; `anonymized_at` marca las anotaciones
-- anonimizadas por el cron de retención (12 meses sin actividad).
CREATE TABLE IF NOT EXISTS `waitlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`requester_hash` text,
	`anonymized_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `waitlist_entries_email_unique` ON `waitlist_entries` (`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `waitlist_entries_status_created_idx` ON `waitlist_entries` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `waitlist_entries_requester_created_idx` ON `waitlist_entries` (`requester_hash`,`created_at`);
