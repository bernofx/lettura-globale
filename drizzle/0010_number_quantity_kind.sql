PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_exercises` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`owner_adult_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('recognition', 'articles', 'word-categories', 'naming', 'number-quantity')),
	`recognition_mode` text CHECK (`recognition_mode` IS NULL OR `recognition_mode` IN ('fixed', 'random')),
	`presentation` text CHECK (`presentation` IS NULL OR `presentation` IN ('images', 'words')),
	`auto_pronounce` integer NOT NULL DEFAULT 0 CHECK (`auto_pronounce` IN (0, 1)),
	`rounds` integer,
	`distractor_count` integer CHECK (`distractor_count` IS NULL OR `distractor_count` BETWEEN 1 AND 4),
	`distractor_source` text CHECK (`distractor_source` IS NULL OR `distractor_source` IN ('mixed', 'same-category')),
	`syllable_filter` text,
	`quantity_min` integer,
	`quantity_max` integer,
	`quantity_object_set` text,
	`quantity_auto_complete` integer DEFAULT false NOT NULL,
	`quantity_idle_seconds` integer DEFAULT 3 NOT NULL,
	`source_exercise_id` text,
	`position` integer NOT NULL DEFAULT 0,
	`auto_pronounce_configured` integer NOT NULL DEFAULT 0 CHECK (`auto_pronounce_configured` IN (0, 1)),
	`version` integer NOT NULL DEFAULT 1,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`account_id`, `id`),
	FOREIGN KEY (`account_id`, `owner_adult_id`) REFERENCES `adult_profiles`(`account_id`, `id`) ON UPDATE CASCADE ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_exercises` (`account_id`, `id`, `owner_adult_id`, `title`, `kind`, `recognition_mode`, `presentation`, `auto_pronounce`, `rounds`, `distractor_count`, `distractor_source`, `syllable_filter`, `quantity_min`, `quantity_max`, `quantity_object_set`, `quantity_auto_complete`, `quantity_idle_seconds`, `source_exercise_id`, `position`, `auto_pronounce_configured`, `version`, `deleted_at`, `created_at`, `updated_at`)
SELECT `account_id`, `id`, `owner_adult_id`, `title`, `kind`, `recognition_mode`, `presentation`, `auto_pronounce`, `rounds`, `distractor_count`, `distractor_source`, `syllable_filter`, `quantity_min`, `quantity_max`, `quantity_object_set`, `quantity_auto_complete`, `quantity_idle_seconds`, `source_exercise_id`, `position`, `auto_pronounce_configured`, `version`, `deleted_at`, `created_at`, `updated_at` FROM `exercises`;
--> statement-breakpoint
DROP TABLE `exercises`;
--> statement-breakpoint
ALTER TABLE `__new_exercises` RENAME TO `exercises`;
--> statement-breakpoint
CREATE INDEX `exercises_owner_idx` ON `exercises` (`account_id`, `owner_adult_id`, `deleted_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
