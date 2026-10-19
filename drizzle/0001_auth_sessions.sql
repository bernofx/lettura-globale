CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
