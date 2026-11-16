-- Migration number: 0001
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS anime (
 id TEXT PRIMARY KEY, mal_id INTEGER UNIQUE, title TEXT NOT NULL, title_english TEXT, synopsis TEXT,
 poster_url TEXT, banner_url TEXT, format TEXT, status TEXT, season TEXT, release_year INTEGER,
 episode_count INTEGER, score REAL CHECK(score IS NULL OR (score >= 0 AND score <= 10)),
 official_url TEXT, featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS anime_genres (
 anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
 PRIMARY KEY(anime_id,genre_id)
);
CREATE TABLE IF NOT EXISTS seasons (
 id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 season_number INTEGER NOT NULL DEFAULT 1, title TEXT, UNIQUE(anime_id,season_number)
);
CREATE TABLE IF NOT EXISTS episodes (
 id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 season_id TEXT REFERENCES seasons(id) ON DELETE SET NULL, episode_number INTEGER NOT NULL CHECK(episode_number > 0),
 title TEXT, synopsis TEXT, thumbnail_url TEXT, duration_minutes INTEGER, release_date TEXT,
 UNIQUE(anime_id,season_id,episode_number)
);
CREATE TABLE IF NOT EXISTS viewing_sources (
 id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
 episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE, provider TEXT NOT NULL,
 source_type TEXT NOT NULL CHECK(source_type IN ('official_page','trailer','authorized_stream')),
 url TEXT NOT NULL, language TEXT, verified_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS featured_anime (
 anime_id TEXT PRIMARY KEY REFERENCES anime(id) ON DELETE CASCADE,
 position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status);
CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(release_year);
CREATE INDEX IF NOT EXISTS idx_anime_featured ON anime(featured,updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title);
CREATE INDEX IF NOT EXISTS idx_anime_genre ON anime_genres(genre_id,anime_id);
CREATE INDEX IF NOT EXISTS idx_seasons_anime ON seasons(anime_id,season_number);
CREATE INDEX IF NOT EXISTS idx_episodes_anime_season ON episodes(anime_id,season_id,episode_number);
CREATE INDEX IF NOT EXISTS idx_sources_anime_episode ON viewing_sources(anime_id,episode_id);
