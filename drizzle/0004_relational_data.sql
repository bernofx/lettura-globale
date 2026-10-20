CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `adult_profiles` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email_normalized` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('Amministratore', 'Genitore', 'Supervisore', 'Terapista')),
	`pin_hash` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adult_profiles_email_unique` ON `adult_profiles` (`email_normalized`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `children` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_year` text NOT NULL DEFAULT '',
	`notes` text NOT NULL DEFAULT '',
	`avatar_color` text NOT NULL DEFAULT '',
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `adult_child_access` (
	`account_id` text NOT NULL,
	`adult_id` text NOT NULL,
	`child_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `adult_id`, `child_id`),
	FOREIGN KEY (`account_id`, `adult_id`) REFERENCES `adult_profiles`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`account_id`, `child_id`) REFERENCES `children`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `adult_child_access_child_idx` ON `adult_child_access` (`account_id`, `child_id`);
--> statement-breakpoint
CREATE TABLE `account_preferences` (
	`account_id` text PRIMARY KEY NOT NULL,
	`active_child_id` text,
	`active_sequence_id` text,
	`theme_palette` text NOT NULL DEFAULT 'violet' CHECK (`theme_palette` IN ('violet', 'ocean', 'forest', 'sunset')),
	`control_shape` text NOT NULL DEFAULT 'soft' CHECK (`control_shape` IN ('compact', 'soft', 'round')),
	`revision` integer NOT NULL DEFAULT 1,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `name`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_normalized_unique` ON `categories` (`account_id`, `normalized_name`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`r2_object_id` text,
	`local_path` text,
	`emoji` text,
	`source_name` text NOT NULL DEFAULT '',
	`source_url` text,
	`license_name` text NOT NULL DEFAULT '',
	`license_url` text,
	`author` text NOT NULL DEFAULT '',
	`is_private_upload` integer NOT NULL DEFAULT 0 CHECK (`is_private_upload` IN (0, 1)),
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `media_assets_r2_idx` ON `media_assets` (`account_id`, `r2_object_id`);
--> statement-breakpoint
CREATE TABLE `library_items` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`word` text NOT NULL,
	`normalized_word` text NOT NULL,
	`category_name` text NOT NULL,
	`article` text CHECK (`article` IS NULL OR `article` IN ('IL', 'LA')),
	`syllabification` text,
	`syllable_count` integer,
	`syllable_status` text,
	`media_asset_id` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`, `category_name`) REFERENCES `categories`(`account_id`, `name`) ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (`account_id`, `media_asset_id`) REFERENCES `media_assets`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `library_items_word_idx` ON `library_items` (`account_id`, `normalized_word`);
--> statement-breakpoint
CREATE INDEX `library_items_filter_idx` ON `library_items` (`account_id`, `category_name`, `syllable_count`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`owner_adult_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('recognition', 'articles', 'word-categories', 'naming')),
	`recognition_mode` text CHECK (`recognition_mode` IS NULL OR `recognition_mode` IN ('fixed', 'random')),
	`presentation` text CHECK (`presentation` IS NULL OR `presentation` IN ('images', 'words')),
	`auto_pronounce` integer NOT NULL DEFAULT 0 CHECK (`auto_pronounce` IN (0, 1)),
	`rounds` integer,
	`distractor_count` integer CHECK (`distractor_count` IS NULL OR `distractor_count` BETWEEN 1 AND 4),
	`distractor_source` text CHECK (`distractor_source` IS NULL OR `distractor_source` IN ('mixed', 'same-category')),
	`syllable_filter` text,
	`version` integer NOT NULL DEFAULT 1,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`, `owner_adult_id`) REFERENCES `adult_profiles`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `exercises_owner_idx` ON `exercises` (`account_id`, `owner_adult_id`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `exercise_items` (
	`account_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`library_item_id` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('prompt', 'option', 'recognition_pool', 'article_pool', 'category_pool', 'naming_pool')),
	`position` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`account_id`, `exercise_id`, `role`, `library_item_id`),
	FOREIGN KEY (`account_id`, `exercise_id`) REFERENCES `exercises`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`account_id`, `library_item_id`) REFERENCES `library_items`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `exercise_items_library_idx` ON `exercise_items` (`account_id`, `library_item_id`);
--> statement-breakpoint
CREATE TABLE `exercise_categories` (
	`account_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`category_name` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('recognition_filter', 'category_target', 'naming_filter')),
	`position` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`account_id`, `exercise_id`, `role`, `category_name`),
	FOREIGN KEY (`account_id`, `exercise_id`) REFERENCES `exercises`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`account_id`, `category_name`) REFERENCES `categories`(`account_id`, `name`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `sequences` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`owner_adult_id` text NOT NULL,
	`title` text NOT NULL,
	`last_used_at` integer,
	`version` integer NOT NULL DEFAULT 1,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`, `owner_adult_id`) REFERENCES `adult_profiles`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `sequences_owner_idx` ON `sequences` (`account_id`, `owner_adult_id`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `sequence_exercises` (
	`account_id` text NOT NULL,
	`sequence_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY (`account_id`, `sequence_id`, `position`),
	FOREIGN KEY (`account_id`, `sequence_id`) REFERENCES `sequences`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY (`account_id`, `exercise_id`) REFERENCES `exercises`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `sequence_exercises_exercise_idx` ON `sequence_exercises` (`account_id`, `exercise_id`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`child_id` text NOT NULL,
	`adult_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL CHECK (`source` IN ('sequence', 'quick')),
	`mode` text NOT NULL CHECK (`mode` IN ('teaching', 'test')),
	`presentation` text NOT NULL CHECK (`presentation` IN ('images', 'words', 'mixed')),
	`status` text NOT NULL DEFAULT 'completed' CHECK (`status` IN ('active', 'completed', 'abandoned')),
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`comment` text NOT NULL DEFAULT '',
	`deleted_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`, `child_id`) REFERENCES `children`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (`account_id`, `adult_id`) REFERENCES `adult_profiles`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `sessions_child_date_idx` ON `sessions` (`account_id`, `child_id`, `started_at`);
--> statement-breakpoint
CREATE INDEX `sessions_adult_date_idx` ON `sessions` (`account_id`, `adult_id`, `started_at`);
--> statement-breakpoint
CREATE TABLE `session_items` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text,
	`exercise_title` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('recognition', 'articles', 'word-categories', 'naming')),
	`presentation` text CHECK (`presentation` IS NULL OR `presentation` IN ('images', 'words')),
	PRIMARY KEY (`account_id`, `id`),
	UNIQUE (`account_id`, `session_id`, `position`),
	FOREIGN KEY (`account_id`, `session_id`) REFERENCES `sessions`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session_item_content` (
	`account_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('target', 'option')),
	`position` integer NOT NULL,
	`library_item_id` text,
	`word_snapshot` text NOT NULL,
	`category_snapshot` text NOT NULL,
	`emoji_snapshot` text,
	`image_path_snapshot` text,
	`remote_image_id` text,
	PRIMARY KEY (`account_id`, `session_item_id`, `role`, `position`),
	FOREIGN KEY (`account_id`, `session_item_id`) REFERENCES `session_items`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`session_id` text,
	`session_item_id` text,
	`exercise_id` text NOT NULL,
	`child_id` text,
	`adult_id` text,
	`word_id` text,
	`answer_id` text NOT NULL,
	`answer_label_snapshot` text NOT NULL DEFAULT '',
	`correct` integer NOT NULL CHECK (`correct` IN (0, 1)),
	`attempt_ordinal` integer NOT NULL,
	`mode` text NOT NULL CHECK (`mode` IN ('teaching', 'test')),
	`created_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_item_ordinal_unique` ON `attempts` (`account_id`, `session_item_id`, `attempt_ordinal`) WHERE `session_item_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_item_answer_unique` ON `attempts` (`account_id`, `session_item_id`, `answer_id`) WHERE `session_item_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `attempts_child_date_idx` ON `attempts` (`account_id`, `child_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `help_events` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`session_id` text,
	`session_item_id` text,
	`exercise_id` text NOT NULL,
	`child_id` text,
	`adult_id` text,
	`word_id` text,
	`mode` text CHECK (`mode` IS NULL OR `mode` IN ('teaching', 'test')),
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `help_events_child_date_idx` ON `help_events` (`account_id`, `child_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `data_migrations` (
	`account_id` text NOT NULL,
	`migration_key` text NOT NULL,
	`source_revision` integer NOT NULL,
	`source_checksum` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('running', 'verified', 'failed')),
	`details` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	PRIMARY KEY (`account_id`, `migration_key`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`adult_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `adult_profile_id` text;
