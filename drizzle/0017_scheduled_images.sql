CREATE TABLE scheduled_image_workers (
  account_id TEXT PRIMARY KEY NOT NULL,
  publisher_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE scheduled_image_requests (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  word TEXT NOT NULL,
  word_key TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'generated', 'approved', 'pull_request', 'published', 'existing', 'needs_review', 'failed', 'cancelled')),
  message TEXT NOT NULL DEFAULT '',
  pr_number INTEGER CHECK (pr_number > 0),
  metadata TEXT,
  image_base64 TEXT,
  proposal_digest TEXT,
  pr_head TEXT,
  generation_id TEXT,
  dispatched_at INTEGER,
  claim_id TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX scheduled_image_requests_word ON scheduled_image_requests (account_id, word_key);
--> statement-breakpoint
CREATE INDEX scheduled_image_requests_queue ON scheduled_image_requests (account_id, status, lease_until, created_at);
--> statement-breakpoint
CREATE TABLE scheduled_image_usage (
  month TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 1)
);
