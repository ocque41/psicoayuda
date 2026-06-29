ALTER TABLE `help_requests` ADD `requester_hash` text;--> statement-breakpoint
ALTER TABLE `help_requests` ADD `anonymized_at` text;--> statement-breakpoint
CREATE INDEX `help_requests_email_created_idx` ON `help_requests` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `help_requests_requester_hash_created_idx` ON `help_requests` (`requester_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `professionals` ADD `conduct_accepted_at` text;