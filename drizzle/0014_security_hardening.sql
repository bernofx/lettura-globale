CREATE TABLE `login_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_rate_limits_updated_idx` ON `login_rate_limits` (`updated_at`);
--> statement-breakpoint
ALTER TABLE `shared_launches` ADD `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `shared_launches` ADD `revoked_at` integer;
--> statement-breakpoint
UPDATE `shared_launches` SET `expires_at` = `created_at` + 2592000000 WHERE `expires_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `shared_launches_expiry_idx` ON `shared_launches` (`expires_at`, `revoked_at`);
