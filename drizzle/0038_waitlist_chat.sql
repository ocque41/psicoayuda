ALTER TABLE `waitlist_entries` ADD `conversation_id` text;--> statement-breakpoint
CREATE INDEX `waitlist_entries_conversation_idx` ON `waitlist_entries` (`conversation_id`);