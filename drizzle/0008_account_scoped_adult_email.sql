DROP INDEX `adult_profiles_email_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `adult_profiles_email_unique` ON `adult_profiles` (`account_id`, `email_normalized`) WHERE `deleted_at` IS NULL;
