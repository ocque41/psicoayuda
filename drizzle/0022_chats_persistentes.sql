CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`requester_hash` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_requests_email_created_idx` ON `access_requests` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_requests_created_idx` ON `access_requests` (`created_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `seeker_email` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_message_at` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_message_role` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `pro_last_read_at` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `closed_reason` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `reopened_at` integer;--> statement-breakpoint
CREATE INDEX `conversations_professional_activity_idx` ON `conversations` (`professional_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_status_activity_idx` ON `conversations` (`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_seeker_email_idx` ON `conversations` (`seeker_email`);