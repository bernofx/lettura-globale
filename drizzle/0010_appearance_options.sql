CREATE TABLE `account_preferences_next` (
	`account_id` text PRIMARY KEY NOT NULL,
	`active_child_id` text,
	`active_sequence_id` text,
	`theme_palette` text NOT NULL DEFAULT 'violet' CHECK (`theme_palette` IN ('violet', 'brand', 'ocean', 'forest', 'sunset', 'berry', 'slate')),
	`control_shape` text NOT NULL DEFAULT 'soft' CHECK (`control_shape` IN ('square', 'compact', 'soft', 'round')),
	`revision` integer NOT NULL DEFAULT 1,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `account_preferences_next` (`account_id`, `active_child_id`, `active_sequence_id`, `theme_palette`, `control_shape`, `revision`, `updated_at`)
SELECT `account_id`, `active_child_id`, `active_sequence_id`, `theme_palette`, `control_shape`, `revision`, `updated_at`
FROM `account_preferences`;
--> statement-breakpoint
DROP TABLE `account_preferences`;
--> statement-breakpoint
ALTER TABLE `account_preferences_next` RENAME TO `account_preferences`;
