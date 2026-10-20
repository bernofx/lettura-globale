ALTER TABLE `media_assets` ADD `image_path` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `image_key` text;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `source_exercise_id` text;
--> statement-breakpoint
ALTER TABLE `session_item_content` ADD `image_key_snapshot` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `source_name` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `library_items` ADD `source_url` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `license_name` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `library_items` ADD `license_url` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `author` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE `attempt_options` (
	`account_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`position` integer NOT NULL,
	`library_item_id` text NOT NULL,
	PRIMARY KEY (`account_id`, `attempt_id`, `position`),
	FOREIGN KEY (`account_id`, `attempt_id`) REFERENCES `attempts`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session_item_responses` (
	`account_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`position` integer NOT NULL,
	`answer_id` text NOT NULL,
	`label_snapshot` text NOT NULL,
	`correct` integer NOT NULL CHECK (`correct` IN (0, 1)),
	`first_attempt` integer NOT NULL CHECK (`first_attempt` IN (0, 1)),
	`created_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `session_item_id`, `position`),
	FOREIGN KEY (`account_id`, `session_item_id`) REFERENCES `session_items`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session_item_help_labels` (
	`account_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`position` integer NOT NULL,
	`label_snapshot` text NOT NULL,
	PRIMARY KEY (`account_id`, `session_item_id`, `position`),
	FOREIGN KEY (`account_id`, `session_item_id`) REFERENCES `session_items`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
