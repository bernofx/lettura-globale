CREATE TABLE IF NOT EXISTS official_catalog_images (
  id TEXT PRIMARY KEY NOT NULL,
  word_key TEXT NOT NULL UNIQUE,
  word TEXT NOT NULL,
  metadata TEXT NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('image/webp', 'image/png', 'image/jpeg')),
  object_key TEXT NOT NULL UNIQUE,
  published_at INTEGER NOT NULL
);
--> statement-breakpoint
DELETE FROM scheduled_image_workers;
