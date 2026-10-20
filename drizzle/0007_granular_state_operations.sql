CREATE TABLE `state_operations` (
	`account_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`result_revision` integer NOT NULL,
	`request_checksum` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `operation_id`)
);
--> statement-breakpoint
CREATE INDEX `state_operations_account_created_idx` ON `state_operations` (`account_id`, `created_at`);
