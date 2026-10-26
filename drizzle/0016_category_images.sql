ALTER TABLE categories ADD COLUMN symbol_library_item_id text;
--> statement-breakpoint
ALTER TABLE library_items ADD COLUMN category_symbol_only integer NOT NULL DEFAULT 0 CHECK (category_symbol_only IN (0, 1));
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN category_speak_word integer NOT NULL DEFAULT 0 CHECK (category_speak_word IN (0, 1));
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN category_show_target_image integer NOT NULL DEFAULT 0 CHECK (category_show_target_image IN (0, 1));
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN category_show_symbols integer NOT NULL DEFAULT 0 CHECK (category_show_symbols IN (0, 1));
