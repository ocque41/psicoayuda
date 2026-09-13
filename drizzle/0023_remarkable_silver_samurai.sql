CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`professional_id` text,
	`professional_name` text,
	`package_id` text,
	`package_title` text,
	`conversation_id` text,
	`payer_email` text,
	`payer_name` text,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`amount_cents` integer NOT NULL,
	`application_fee_cents` integer NOT NULL,
	`currency` text DEFAULT 'eur' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`paid_at` text,
	`refunded_at` text,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`package_id`) REFERENCES `session_packages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_stripe_checkout_session_id_unique` ON `payments` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `payments_professional_created_idx` ON `payments` (`professional_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_created_idx` ON `payments` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `session_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`professional_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`sessions_count` integer NOT NULL,
	`validity_days` integer,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'eur' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_packages_professional_idx` ON `session_packages` (`professional_id`,`active`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `quota_released_at` integer;--> statement-breakpoint
ALTER TABLE `professionals` ADD `offers_paid_services` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `stripe_account_id` text;--> statement-breakpoint
ALTER TABLE `professionals` ADD `stripe_charges_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `stripe_payouts_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `stripe_details_submitted` integer DEFAULT false NOT NULL;