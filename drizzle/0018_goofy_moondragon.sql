CREATE TABLE `click_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`href` text,
	`page` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_content` text,
	`country` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `click_events_created_idx` ON `click_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `click_events_type_created_idx` ON `click_events` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `click_events_campaign_idx` ON `click_events` (`utm_campaign`);