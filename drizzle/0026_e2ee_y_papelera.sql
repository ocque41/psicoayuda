-- E2EE del chat + papelera con deshacer. Migración 100% aditiva: no toca ni
-- borra datos existentes.
--
-- `professionals.crypto_public_key`: clave pública ECDH P-256 (base64url, raw)
-- que el profesional publica desde su navegador. La privada nunca sale de su
-- dispositivo (IndexedDB) y su respaldo va cifrado con su código de
-- recuperación. Los mensajes se guardan como sobres opacos.
--
-- `recovery_keystores`: keystore JSON cifrado (AES-256-GCM) con el código de
-- recuperación; `id` deriva del código. El servidor no puede descifrarlo.
--
-- `conversations.deleted_at/purge_after/deleted_by_role`: papelera de 7 días con
-- deshacer. El borrado definitivo (purga del Durable Object + filas D1) lo hace
-- el cron de retención al vencer `purge_after`.
ALTER TABLE `professionals` ADD COLUMN `crypto_public_key` text;
--> statement-breakpoint
ALTER TABLE `professionals` ADD COLUMN `crypto_public_key_updated_at` integer;
--> statement-breakpoint
ALTER TABLE `conversations` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `conversations` ADD COLUMN `purge_after` integer;
--> statement-breakpoint
ALTER TABLE `conversations` ADD COLUMN `deleted_by_role` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversations_purge_after_idx` ON `conversations` (`purge_after`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recovery_keystores` (
	`id` text PRIMARY KEY NOT NULL,
	`wrapped` text NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
