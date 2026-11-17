const crypto = require("node:crypto");

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const DATABASE = process.env.CF_DATABASE_ID;
const TOKEN = process.env.CF_API_TOKEN;
const SESSION_SECRET = process.env.SESSION_SECRET || "";

const schema = [
  "CREATE TABLE IF NOT EXISTS anime (anilist_id INTEGER PRIMARY KEY, title TEXT NOT NULL, cover_image TEXT, banner_image TEXT, description TEXT, format TEXT, season TEXT, year INTEGER, status TEXT, genres TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY AUTOINCREMENT, anilist_id INTEGER NOT NULL, season_number INTEGER NOT NULL, title TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(anilist_id,season_number))",
  "CREATE TABLE IF NOT EXISTS episodes (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, episode_number INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(season_id,episode_number))",
  "CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, anilist_id INTEGER NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL, language TEXT, quality TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS idx_sources_anime ON sources(anilist_id)",
  "CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id)",
  "CREATE TABLE IF NOT EXISTS admin_attempts (ip_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, window_started INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0)"
];
async function query(sql, params) {
  if (!ACCOUNT || !DATABASE || !TOKEN) throw new Error("D1 database is not configured.");
  const bound = (params || []).map((value) => value === null || value === undefined ? "" : String(value));
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(ACCOUNT) + "/d1/database/" + encodeURIComponent(DATABASE) + "/query", {
    method:"POST",
    headers:{authorization:"Bearer " + TOKEN,"content-type":"application/json"},
    body:JSON.stringify({sql,params:bound}),
    signal:AbortSignal.timeout(12000)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("D1 returned an invalid response."); }
  if (!response.ok || !data.success) throw new Error(data.errors?.[0]?.message || "D1 query failed.");
  return data.result?.[0]?.results || [];
}
let schemaPromise;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of schema) await query(statement, []);
      const columns = await query("PRAGMA table_info(sources)", []);
      if (!columns.some((column) => column.name === "episode_id")) await query("ALTER TABLE sources ADD COLUMN episode_id INTEGER", []);
      await query("CREATE INDEX IF NOT EXISTS idx_sources_episode ON sources(episode_id)", []);
      await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_episode_url ON sources(episode_id,url) WHERE episode_id IS NOT NULL", []);
    })().catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}
function json(res, status, data, cacheControl) {
  res.statusCode = status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control",cacheControl || "no-store");
  res.setHeader("x-content-type-options","nosniff");
  return res.end(JSON.stringify(data));
}
function cookieValue(req) {
  const item = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("av_session="));
  return item ? item.slice("av_session=".length) : "";
}
function signingKeyReady() { return Buffer.byteLength(SESSION_SECRET,"utf8") >= 32; }
function sign(payload) { return crypto.createHmac("sha256",SESSION_SECRET).update(payload).digest("base64url"); }
function validSession(req) {
  if (!signingKeyReady()) return false;
  const parts = cookieValue(req).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected,actual)) return false;
  try {
    const session = JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    return Number.isFinite(session.exp) && session.exp > Date.now();
  } catch { return false; }
}
function issueCookie(res) {
  const payload = Buffer.from(JSON.stringify({iat:Date.now(),exp:Date.now()+8*60*60*1000})).toString("base64url");
  res.setHeader("Set-Cookie","av_session="+payload+"."+sign(payload)+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800");
}
function clearCookie(res) {
  res.setHeader("Set-Cookie","av_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
}
function checkPassword(password) {
  const parts = String(process.env.ADMIN_PASSWORD_HASH || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) return false;
  try {
    const salt = Buffer.from(parts[2],"base64");
    const expected = Buffer.from(parts[3],"base64");
    if (salt.length < 16 || expected.length !== 32) return false;
    const actual = crypto.pbkdf2Sync(password,salt,iterations,32,"sha256");
    return crypto.timingSafeEqual(actual,expected);
  } catch { return false; }
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    return parsed.host === host && (parsed.protocol === "https:" || (local && parsed.protocol === "http:"));
  } catch { return false; }
}
function requestKey(req) {
  const forwarded = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  const ip = String(forwarded).split(",")[0].trim().slice(0,100);
  const key = signingKeyReady() ? SESSION_SECRET : "anivira-rate-limit";
  return crypto.createHmac("sha256",key).update(ip).digest("hex");
}
async function loginBlocked(req) {
  const rows = await query("SELECT blocked_until FROM admin_attempts WHERE ip_hash=?", [requestKey(req)]);
  return rows.length > 0 && Number(rows[0].blocked_until) > Date.now();
}
async function recordLoginFailure(req) {
  const key = requestKey(req);
  const now = Date.now();
  const rows = await query("SELECT failures,window_started FROM admin_attempts WHERE ip_hash=?", [key]);
  const old = rows[0];
  if (!old || now - Number(old.window_started) > 15*60*1000) {
    await query("INSERT INTO admin_attempts(ip_hash,failures,window_started,blocked_until) VALUES(?,1,?,0) ON CONFLICT(ip_hash) DO UPDATE SET failures=1,window_started=excluded.window_started,blocked_until=0", [key,now]);
    return;
  }
  const failures = Number(old.failures)+1;
  const blockedUntil = failures >= 8 ? now+15*60*1000 : 0;
  await query("UPDATE admin_attempts SET failures=?,blocked_until=? WHERE ip_hash=?", [failures,blockedUntil,key]);
}
async function clearLoginFailures(req) {
  await query("DELETE FROM admin_attempts WHERE ip_hash=?", [requestKey(req)]);
}
function youtubeVideoId(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase().replace(/^www\./,"");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else if (["embed","shorts","live"].includes(segments[0])) id = segments[1] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}
module.exports = {
  query,ensureSchema,json,signingKeyReady,validSession,issueCookie,clearCookie,
  checkPassword,sameOrigin,loginBlocked,recordLoginFailure,clearLoginFailures,youtubeVideoId
};