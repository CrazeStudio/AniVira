const { timingSafeEqual, createHash } = require("node:crypto");

module.exports = async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }
  const expected = (process.env.ADMIN_API_KEY || "").trim();
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const supplied = match ? match[1].trim() : "";
  if (!expected) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ ok: false, error: "ADMIN_API_KEY is not configured in Vercel" }));
  }
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!supplied || !timingSafeEqual(a, b)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Admin API key required" }));
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ ok: false, error: "D1 environment is not configured" }));
  }

  const migrations = [
    "CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
    "CREATE TABLE IF NOT EXISTS anime_genres (anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE, genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE, PRIMARY KEY (anime_id, genre_id))",
    "CREATE TABLE IF NOT EXISTS seasons (id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE, season_number INTEGER NOT NULL DEFAULT 1, title TEXT, UNIQUE (anime_id, season_number))",
    "CREATE TABLE IF NOT EXISTS viewing_sources (id TEXT PRIMARY KEY, anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE, provider TEXT NOT NULL, source_type TEXT NOT NULL CHECK (source_type IN ('official_page','trailer','authorized_stream')), url TEXT NOT NULL, language TEXT, verified_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS featured_anime (anime_id TEXT PRIMARY KEY REFERENCES anime(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)",
    "CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status)",
    "CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(release_year)",
    "CREATE INDEX IF NOT EXISTS idx_anime_featured ON anime(featured)",
    "CREATE INDEX IF NOT EXISTS idx_episodes_anime_season ON episodes(anime_id, season_id, episode_number)",
    "CREATE INDEX IF NOT EXISTS idx_sources_anime_episode ON viewing_sources(anime_id, episode_id)"
  ];
  async function query(sql) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sql, params: [] })
      }
    );
    let payload;
    try { payload = await response.json(); } catch {
      throw new Error("Cloudflare D1 returned an invalid response");
    }
    if (!response.ok || payload.success !== true || payload.errors?.length || payload.result?.[0]?.success === false) {
      throw new Error("A database migration statement failed");
    }
  }
  try {
    for (const sql of migrations) await query(sql);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, migrated: true, createdOrVerified: migrations.length }));
  } catch {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "Migration failed. Check that the existing anime and episodes tables use text IDs and that no incompatible partial tables already exist." }));
  }
};