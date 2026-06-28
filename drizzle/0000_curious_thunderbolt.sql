CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`help_request_id` text NOT NULL,
	`professional_id` text NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`help_request_id`) REFERENCES `help_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignments_help_request_idx` ON `assignments` (`help_request_id`);--> statement-breakpoint
CREATE INDEX `assignments_professional_idx` ON `assignments` (`professional_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_request_professional_unique` ON `assignments` (`help_request_id`,`professional_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `help_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`language` text DEFAULT 'es' NOT NULL,
	`country` text DEFAULT 'Venezuela',
	`state` text,
	`city` text,
	`lat` real,
	`lng` real,
	`location_consent` integer DEFAULT false NOT NULL,
	`need_category` text NOT NULL,
	`urgency` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`consent_contact` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `help_requests_status_idx` ON `help_requests` (`status`);--> statement-breakpoint
CREATE INDEX `help_requests_created_at_idx` ON `help_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `professionals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`display_name` text,
	`country` text,
	`city` text,
	`license_number` text,
	`license_country` text,
	`languages` text NOT NULL,
	`support_areas` text NOT NULL,
	`remote_available` integer DEFAULT true NOT NULL,
	`crisis_experience` integer DEFAULT false NOT NULL,
	`contact_email` text,
	`contact_notes` text,
	`short_bio` text,
	`status` text DEFAULT 'pending_verification' NOT NULL,
	`accepting_requests` integer DEFAULT false NOT NULL,
	`max_active_requests` integer DEFAULT 3 NOT NULL,
	`current_active_requests` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professionals_email_unique` ON `professionals` (`email`);--> statement-breakpoint
CREATE INDEX `professionals_status_idx` ON `professionals` (`status`);--> statement-breakpoint
CREATE INDEX `professionals_accepting_requests_idx` ON `professionals` (`accepting_requests`);--> statement-breakpoint
CREATE INDEX `professionals_remote_available_idx` ON `professionals` (`remote_available`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
