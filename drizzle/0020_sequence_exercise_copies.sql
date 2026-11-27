ALTER TABLE exercises ADD COLUMN sequence_id TEXT;
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN template_exercise_id TEXT;
--> statement-breakpoint
CREATE INDEX exercises_sequence_idx ON exercises (account_id, sequence_id) WHERE sequence_id IS NOT NULL;
