CREATE TABLE `alliance_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`website` text,
	`phone` text,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alliance_requests_status_created_idx` ON `alliance_requests` (`status`,`created_at`);