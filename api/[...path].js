const MAX_BODY = 256 * 1024;

function makeD1(env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    throw new Error("D1 environment is not configured");
  }

  async function query(sql, params = []) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sql,
          params: params.map(value =>
            value === undefined || value === null ? null :
            typeof value === "boolean" ? String(Number(value)) : String(value)
          )
        })
      }
    );

    let payload;
    try { payload = await response.json(); }
    catch { throw new Error("D1 returned an invalid response"); }

    if (!response.ok || payload.success !== true || payload.errors?.length) {
      throw new Error("D1 query failed");
    }
    const result = payload.result?.[0];
    if (!result || result.success === false) throw new Error("D1 query failed");
    return {
      results: Array.isArray(result.results) ? result.results : [],
      success: true,
      meta: result.meta || {}
    };
  }

  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first(columnName) {
          const result = await query(sql, params);
          const row = result.results[0] || null;
          return columnName && row ? row[columnName] ?? null : row;
        },
        async all() { return query(sql, params); },
        async run() {
          const result = await query(sql, params);
          return { success: true, meta: result.meta, results: result.results };
        }
      };
      return statement;
    }
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY) throw new Error("Request body is too large");
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  try {
    const body = ["GET", "HEAD"].includes(req.method) ? null : await readBody(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    const host = req.headers.host || "localhost";
    const request = new Request(new URL(req.url || "/", `https://${host}`), {
      method: req.method || "GET",
      headers,
      body: body?.length ? body : undefined
    });

    const env = {
      DB: makeD1(process.env),
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || "",
      ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || ""
    };
    const { default: app } = await import("../lib/api-handler.mjs");
    const response = await app.fetch(request, env);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const output = Buffer.from(await response.arrayBuffer());
    res.end(output);
  } catch (error) {
    const message = error?.message === "Request body is too large"
      ? "Request body is too large"
      : "Server configuration or database request failed";
    res.statusCode = message === "Request body is too large" ? 413 : 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: false, error: message }));
  }
};

module.exports.config = { api: { bodyParser: false } };
