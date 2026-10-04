CREATE TABLE IF NOT EXISTS wcl_cache (
  cache_key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wcl_cache_expires ON wcl_cache(expires_at);
