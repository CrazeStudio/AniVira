-- AniVira schema. Run once in the Cloudflare D1 console; the API also creates missing tables.
CREATE TABLE IF NOT EXISTS anime (
  anilist_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  cover_image TEXT,
  banner_image TEXT,
  description TEXT,
  format TEXT,
  season TEXT,
  year INTEGER,
  status TEXT,
  genres TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anilist_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  language TEXT,
  quality TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sources_anime ON sources(anilist_id);

-- Stores HMAC-hashed network identifiers, never raw IP addresses, for admin login throttling.
CREATE TABLE IF NOT EXISTS admin_attempts (
  ip_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);