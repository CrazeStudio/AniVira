const { timingSafeEqual, createHash } = require("node:crypto");

module.exports = async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("allow", "GET");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }
  const expected = (process.env.ADMIN_API_KEY || "").trim();
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\\s+(.+)$/i);
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
  res.statusCode = 200;
  return res.end(JSON.stringify({ ok: true, authorized: true }));
};
