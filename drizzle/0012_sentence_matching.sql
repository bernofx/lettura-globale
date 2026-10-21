ALTER TABLE `library_items` ADD `content_kind` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `phrase_structure` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `subject_text` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `verb_text` text;
--> statement-breakpoint
ALTER TABLE `library_items` ADD `complement_text` text;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `semantic_kind` text;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `sentence_option_count` integer;
--> statement-breakpoint
ALTER TABLE `exercises` ADD `sentence_difficulty` integer;
--> statement-breakpoint
ALTER TABLE `session_items` ADD `semantic_kind` text;
