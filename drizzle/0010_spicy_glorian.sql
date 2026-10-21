CREATE TABLE `sound_assets` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`cue` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`account_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `sound_assets_account_cue_idx` ON `sound_assets` (`account_id`,`cue`);