CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`category` text NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`professional_id` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`requester_hash` text,
	`handled_by` text,
	`handled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_messages_status_created_idx` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_source_created_idx` ON `contact_messages` (`source`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_email_created_idx` ON `contact_messages` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_professional_created_idx` ON `contact_messages` (`professional_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_requester_created_idx` ON `contact_messages` (`requester_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_created_idx` ON `contact_messages` (`created_at`);