ALTER TABLE `adult_profiles` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `children` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `adult_child_access` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `auto_pronounce_configured` integer NOT NULL DEFAULT 0 CHECK (`auto_pronounce_configured` IN (0, 1));
--> statement-breakpoint
ALTER TABLE `sequences` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `sessions` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `attempts` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `help_events` ADD `position` integer NOT NULL DEFAULT 0;
