ALTER TABLE `account_preferences` ADD `sound_wrong` text NOT NULL DEFAULT 'classic';
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `sound_correct` text NOT NULL DEFAULT 'classic';
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `sound_finish` text NOT NULL DEFAULT 'fanfare';
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `sound_select` text NOT NULL DEFAULT 'plin';
