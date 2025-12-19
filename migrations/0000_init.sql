CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`asset_id` text,
	`asset_name` text,
	`asset_symbol` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`user_id` text,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`market` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`acquisition_price` real DEFAULT 0 NOT NULL,
	`acquisition_date` text,
	`current_price` real,
	`last_price_update` integer,
	`is_deleted` integer DEFAULT 0,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `monthly_statements` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`start_value` real DEFAULT 0 NOT NULL,
	`end_value` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `portfolio_history` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`user_id` text,
	`total_value` real NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`asset_id` text NOT NULL,
	`value` real NOT NULL,
	`amount` real,
	`unit_price` real,
	`date` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`link` text NOT NULL,
	`platform` text DEFAULT 'debank' NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `IDX_session_expire` ON `sessions` (`expire`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY DEFAULT lower(hex(randomblob(16))) NOT NULL,
	`email` text,
	`username` text,
	`password_hash` text,
	`first_name` text,
	`last_name` text,
	`profile_image_url` text,
	`auth_provider` text DEFAULT 'local',
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);