ALTER TABLE exercises ADD COLUMN quantity_speak_numbers integer NOT NULL DEFAULT 0 CHECK (quantity_speak_numbers IN (0, 1));
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN quantity_errorless integer NOT NULL DEFAULT 0 CHECK (quantity_errorless IN (0, 1));
--> statement-breakpoint
ALTER TABLE attempts ADD COLUMN quantity_errorless integer NOT NULL DEFAULT 0 CHECK (quantity_errorless IN (0, 1));
--> statement-breakpoint
ALTER TABLE session_items ADD COLUMN quantity_errorless integer NOT NULL DEFAULT 0 CHECK (quantity_errorless IN (0, 1));
