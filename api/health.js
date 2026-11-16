module.exports = async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("allow", "GET");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ ok: false, error: "D1 environment is not configured" }));
  }
  async function query(sql) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sql, params: [] })
      }
    );
    const payload = await response.json();
    if (!response.ok || payload.success !== true || payload.errors?.length || payload.result?.[0]?.success === false) {
      throw new Error("D1 query failed");
    }
    return payload.result?.[0]?.results || [];
  }
  try {
    await query("SELECT 1 AS ok");
    const required = ["anime", "genres", "anime_genres", "seasons", "episodes", "viewing_sources", "featured_anime"];
    const rows = await query("SELECT name FROM sqlite_master WHERE type='table'");
    const existing = new Set(rows.map(row => row.name));
    const missingTables = required.filter(name => !existing.has(name));
    const schemaReady = missingTables.length === 0;
    res.statusCode = schemaReady ? 200 : 503;
    return res.end(JSON.stringify({
      ok: schemaReady,
      service: "anivira-api",
      database: true,
      schemaReady,
      missingTables,
      version: 4
    }));
  } catch {
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, service: "anivira-api", database: false, error: "D1 health check failed", version: 4 }));
  }
};
