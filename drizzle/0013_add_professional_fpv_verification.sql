ALTER TABLE `professionals` ADD `fpv_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `fpv_verified_at` integer;--> statement-breakpoint
ALTER TABLE `professionals` ADD `fpv_snapshot` text;