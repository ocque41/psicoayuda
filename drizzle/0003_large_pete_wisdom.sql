CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`help_request_id` text,
	`professional_id` text NOT NULL,
	`seeker_sid` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`first_seeker_msg_at` integer,
	`first_pro_reply_at` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`closed_at` text,
	`anonymized_at` text,
	FOREIGN KEY (`help_request_id`) REFERENCES `help_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_professional_idx` ON `conversations` (`professional_id`);--> statement-breakpoint
CREATE INDEX `conversations_help_request_idx` ON `conversations` (`help_request_id`);--> statement-breakpoint
CREATE INDEX `conversations_status_created_idx` ON `conversations` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `response_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`professional_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`response_delta_ms` integer,
	`answered` integer DEFAULT false NOT NULL,
	`sampled_at` integer NOT NULL,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_samples_conversation_unique` ON `response_samples` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `response_samples_professional_sampled_idx` ON `response_samples` (`professional_id`,`sampled_at`);--> statement-breakpoint
CREATE TABLE `seeker_sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`requester_hash` text,
	`role` text DEFAULT 'seeker' NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seeker_sessions_conversation_idx` ON `seeker_sessions` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `seeker_sessions_expires_idx` ON `seeker_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `professionals` ADD `response_bucket` text;--> statement-breakpoint
ALTER TABLE `professionals` ADD `response_median_ms` integer;--> statement-breakpoint
ALTER TABLE `professionals` ADD `response_sample_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `response_answered_ratio` real;--> statement-breakpoint
ALTER TABLE `professionals` ADD `response_computed_at` integer;