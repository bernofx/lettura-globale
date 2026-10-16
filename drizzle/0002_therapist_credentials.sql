CREATE TABLE `therapist_credentials` (
	`login_email` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`therapist_id` text NOT NULL,
	`pin_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`updated_at` integer NOT NULL
);
