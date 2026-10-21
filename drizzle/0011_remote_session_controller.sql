CREATE TABLE `remote_controller_sessions` (
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`child_id` text NOT NULL,
	`owner_adult_id` text NOT NULL,
	`pairing_token_hash` text NOT NULL,
	`pairing_expires_at` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'waiting' CHECK (`status` IN ('waiting', 'pending', 'connected', 'closed')),
	`pending_adult_id` text,
	`pending_adult_name` text,
	`controller_key_hash` text,
	`controller_last_seen_at` integer,
	`latest_sequence` integer NOT NULL DEFAULT 0,
	`snapshot_json` text NOT NULL DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `session_id`),
	UNIQUE(`pairing_token_hash`)
);
--> statement-breakpoint
CREATE INDEX `remote_controller_sessions_pairing_idx` ON `remote_controller_sessions` (`pairing_token_hash`, `pairing_expires_at`);
--> statement-breakpoint
CREATE TABLE `remote_controller_events` (
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`server_sequence` integer NOT NULL,
	`client_event_id` text NOT NULL,
	`adult_id` text NOT NULL,
	`origin` text NOT NULL CHECK (`origin` IN ('mobile', 'desktop')),
	`command` text NOT NULL,
	`payload_json` text NOT NULL DEFAULT '{}',
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `session_id`, `server_sequence`),
	UNIQUE(`account_id`, `session_id`, `client_event_id`)
);
--> statement-breakpoint
CREATE INDEX `remote_controller_events_session_idx` ON `remote_controller_events` (`account_id`, `session_id`, `server_sequence`);
