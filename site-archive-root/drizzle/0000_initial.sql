CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`payload` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
