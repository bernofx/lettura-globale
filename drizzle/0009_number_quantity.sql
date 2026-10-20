ALTER TABLE `exercises` ADD `quantity_min` integer;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `quantity_max` integer;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `quantity_object_set` text;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `quantity_auto_complete` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `quantity_idle_seconds` integer DEFAULT 3 NOT NULL;
