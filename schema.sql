CREATE TABLE IF NOT EXISTS anime (anilist_id INTEGER PRIMARY KEY,title TEXT NOT NULL,cover_image TEXT,banner_image TEXT,description TEXT,format TEXT,season TEXT,year INTEGER,status TEXT,genres TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY AUTOINCREMENT,anilist_id INTEGER NOT NULL,season_number INTEGER NOT NULL,title TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(anilist_id,season_number));
CREATE TABLE IF NOT EXISTS episodes (id INTEGER PRIMARY KEY AUTOINCREMENT,season_id INTEGER NOT NULL,episode_number INTEGER NOT NULL,title TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(season_id,episode_number));
CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT,anilist_id INTEGER NOT NULL,episode_id INTEGER,label TEXT NOT NULL,url TEXT NOT NULL,language TEXT,quality TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_sources_anime ON sources(anilist_id);
CREATE INDEX IF NOT EXISTS idx_sources_episode ON sources(episode_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_episode_url ON sources(episode_id,url) WHERE episode_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS admin_attempts (ip_hash TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,window_started INTEGER NOT NULL,blocked_until INTEGER NOT NULL DEFAULT 0);