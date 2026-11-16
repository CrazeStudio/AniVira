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
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1 AS ok", params: [] })
      }
    );
    const payload = await response.json();
    const ok = response.ok && payload.success === true && !payload.errors?.length && payload.result?.[0]?.success !== false;
    res.statusCode = ok ? 200 : 502;
    return res.end(JSON.stringify({ ok, service: "anivira-api", database: ok, version: 3 }));
  } catch {
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, service: "anivira-api", database: false, error: "D1 health check failed" }));
  }
};
