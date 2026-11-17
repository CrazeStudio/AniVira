const {
  query, ensureSchema, json, signingKeyReady, validSession, issueCookie, clearCookie,
  checkPassword, sameOrigin, loginBlocked, recordLoginFailure, clearLoginFailures, youtubeVideoId
} = require("./_lib");

const animeFields = "id title { romaji english native } coverImage { large medium } bannerImage description format season seasonYear status genres";
async function fetchAniListAnime(id) {
  const response = await fetch("https://graphql.anilist.co", {
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({query:"query($id:Int){Media(id:$id,type:ANIME){" + animeFields + "}}",variables:{id}}),
    signal:AbortSignal.timeout(12000)
  });
  const data = await response.json();
  if (!response.ok || data.errors || !data.data?.Media) throw new Error("AniList could not load this anime.");
  return data.data.Media;
}
function titleOf(anime) {
  return anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
}
module.exports = async function handler(req,res) {
  if (req.method !== "POST") return json(res,405,{error:"Method not allowed."});
  if (!sameOrigin(req)) return json(res,403,{error:"This request was blocked."});
  try {
    await ensureSchema();
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body && typeof body === "object" ? body : {};
    const action = String(body.action || "");

    if (action === "login") {
      if (!process.env.ADMIN_PASSWORD_HASH || !signingKeyReady()) return json(res,503,{error:"Admin authentication is not configured."});
      if (await loginBlocked(req)) return json(res,429,{error:"Too many failed sign-in attempts. Wait 15 minutes before trying again."});
      const password = typeof body.password === "string" ? body.password : "";
      if (!password || password.length > 200 || !checkPassword(password)) {
        await recordLoginFailure(req);
        return json(res,401,{error:"Incorrect password."});
      }
      await clearLoginFailures(req);
      issueCookie(res);
      return json(res,200,{ok:true});
    }
    if (action === "logout") {
      clearCookie(res);
      return json(res,200,{ok:true});
    }
    if (!validSession(req)) return json(res,401,{error:"Please sign in again."});

    if (action === "list") {
      const anime = await query("SELECT anilist_id,title,cover_image FROM anime ORDER BY created_at DESC",[]);
      const sources = await query("SELECT s.id,s.anilist_id,s.label,s.url,s.language,s.quality,a.title AS anime_title FROM sources s LEFT JOIN anime a ON a.anilist_id=s.anilist_id ORDER BY s.created_at DESC",[]);
      return json(res,200,{anime,sources});
    }
    if (action === "addAnime") {
      const id = Number(body.anilistId);
      if (!Number.isSafeInteger(id) || id < 1) return json(res,400,{error:"Invalid AniList ID."});
      const anime = await fetchAniListAnime(id);
      await query(
        "INSERT INTO anime(anilist_id,title,cover_image,banner_image,description,format,season,year,status,genres) VALUES(?,?,?,?,?,?,?,NULLIF(?,''),?,?) ON CONFLICT(anilist_id) DO UPDATE SET title=excluded.title,cover_image=excluded.cover_image,banner_image=excluded.banner_image,description=excluded.description,format=excluded.format,season=excluded.season,year=excluded.year,status=excluded.status,genres=excluded.genres",
        [anime.id,titleOf(anime),anime.coverImage?.large || "",anime.bannerImage || "",anime.description || "",anime.format || "",anime.season || "",anime.seasonYear ? anime.seasonYear : "",anime.status || "",JSON.stringify(anime.genres || [])]
      );
      return json(res,200,{ok:true});
    }
    if (action === "removeAnime") {
      const id = Number(body.anilistId);
      if (!Number.isSafeInteger(id) || id < 1) return json(res,400,{error:"Invalid AniList ID."});
      await query("DELETE FROM sources WHERE anilist_id=?",[id]);
      await query("DELETE FROM anime WHERE anilist_id=?",[id]);
      return json(res,200,{ok:true});
    }
    if (action === "addSource") {
      const id = Number(body.anilistId);
      const label = String(body.label || "").trim().slice(0,80);
      const url = String(body.url || "").trim();
      const language = String(body.language || "").trim().slice(0,40);
      const quality = String(body.quality || "").trim().slice(0,30);
      const videoId = youtubeVideoId(url);
      if (!Number.isSafeInteger(id) || id < 1 || !label || !videoId || body.authorized !== true) {
        return json(res,400,{error:"Choose an anime, enter a valid YouTube video URL and confirm that you are authorized to link it."});
      }
      const exists = await query("SELECT anilist_id FROM anime WHERE anilist_id=? LIMIT 1",[id]);
      if (!exists.length) return json(res,400,{error:"Import this anime into the catalogue first."});
      const canonicalUrl = "https://www.youtube.com/watch?v=" + videoId;
      await query("INSERT INTO sources(anilist_id,label,url,language,quality) VALUES(?,?,?,?,?)",[id,label,canonicalUrl,language,quality]);
      return json(res,200,{ok:true});
    }
    if (action === "removeSource") {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id < 1) return json(res,400,{error:"Invalid video link."});
      await query("DELETE FROM sources WHERE id=?",[id]);
      return json(res,200,{ok:true});
    }
    return json(res,400,{error:"Unknown admin action."});
  } catch {
    return json(res,500,{error:"The studio request failed. Check the database configuration and try again."});
  }
};