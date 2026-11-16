const { Pool } = require("pg");
const { timingSafeEqual } = require("node:crypto");

let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  return pool;
}
const send = (res, status, data) => res.status(status).setHeader("Cache-Control","no-store").json(data);
const fail = (res, status, message) => send(res,status,{ok:false,error:message});
const str = (v,n=5000) => typeof v === "string" ? v.trim().slice(0,n) : "";
const makeId = () => require("node:crypto").randomUUID();
const safeId = v => /^[A-Za-z0-9_-]{1,80}$/.test(str(v,80)) ? str(v,80) : makeId();
const https = v => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const num = (v, fallback=null) => v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? fallback : Number(v);
function authorized(req) {
  const expected = process.env.ADMIN_API_KEY || "";
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i,"");
  if (!expected || !token || token.length > 512) return false;
  const a=Buffer.from(token), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
async function getAnime(id) {
  const p=db(), q=await p.query("SELECT * FROM anime WHERE id=$1",[id]);
  if (!q.rows[0]) return null;
  const [g,e,s]=await Promise.all([
    p.query("SELECT g.name FROM genres g JOIN anime_genres ag ON ag.genre_id=g.id WHERE ag.anime_id=$1 ORDER BY g.name",[id]),
    p.query("SELECT * FROM episodes WHERE anime_id=$1 ORDER BY season_id,episode_number",[id]),
    p.query("SELECT * FROM viewing_sources WHERE anime_id=$1 ORDER BY created_at DESC",[id])
  ]);
  return {...q.rows[0],genres:g.rows.map(x=>x.name),episodes:e.rows,sources:s.rows};
}
async function saveGenres(client, animeId, genres) {
  await client.query("DELETE FROM anime_genres WHERE anime_id=$1",[animeId]);
  for (const name of [...new Set((Array.isArray(genres)?genres:[]).map(x=>str(x,60)).filter(Boolean))]) {
    const g=await client.query("INSERT INTO genres(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",[name]);
    await client.query("INSERT INTO anime_genres(anime_id,genre_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[animeId,g.rows[0].id]);
  }
}
function validateAnime(b) {
  if (!b || !str(b.title,200)) return "A title is required";
  for (const k of ["poster_url","banner_url","official_url"]) if (b[k] && !https(b[k])) return k+" must be a valid HTTPS URL";
  if (b.score!==undefined && b.score!==null && b.score!=="" && (Number(b.score)<0 || Number(b.score)>10 || !Number.isFinite(Number(b.score)))) return "Score must be between 0 and 10";
  return null;
}
module.exports = async (req,res) => {
  const segments=Array.isArray(req.query.path)?req.query.path:[req.query.path].filter(Boolean);\n  const path="/api/"+segments.join("/").replace(/^\/+|\/+$/g,"");
  if (req.method==="OPTIONS") { res.setHeader("Allow","GET,POST,PATCH,DELETE,OPTIONS"); return res.status(204).end(); }
  if (Number(req.headers["content-length"]||0)>262144) return fail(res,413,"Request body is too large");
  try {
    const p=db();
    if (path==="/api/health" && req.method==="GET") {
      await p.query("SELECT 1");
      return send(res,200,{ok:true,service:"anivira-api",database:true,provider:"postgresql",version:3});
    }
    if (!path.startsWith("/api/")) return fail(res,404,"Not found");
    const adminPath=path.startsWith("/api/admin/");
    if (adminPath && !authorized(req)) return fail(res,401,"Admin API key required");
    if (path==="/api/admin/verify" && req.method==="GET") return send(res,200,{ok:true,authorized:true});
    if (path==="/api/anime" && req.method==="GET") {
      const q=str(req.query.q,120), genre=str(req.query.genre,60), status=str(req.query.status,40), format=str(req.query.format,30);
      const limit=Math.min(60,Math.max(1,Math.floor(Number(req.query.limit)||24))), offset=Math.max(0,Math.floor(Number(req.query.offset)||0));
      const vals=[],where=[];
      if(q){vals.push("%"+q+"%");where.push("(a.title ILIKE $"+vals.length+" OR a.title_english ILIKE $"+vals.length+" OR a.synopsis ILIKE $"+vals.length+")");}
      if(genre){vals.push(genre);where.push("EXISTS(SELECT 1 FROM anime_genres ag JOIN genres g ON g.id=ag.genre_id WHERE ag.anime_id=a.id AND g.name=$"+vals.length+")");}
      if(status){vals.push(status);where.push("a.status=$"+vals.length);}
      if(format){vals.push(format);where.push("a.format=$"+vals.length);}
      const clause=where.length?" WHERE "+where.join(" AND "):"";
      const count=await p.query("SELECT COUNT(*)::int AS total FROM anime a"+clause,vals);
      const rows=await p.query("SELECT a.* FROM anime a"+clause+" ORDER BY a.featured DESC,a.updated_at DESC LIMIT $"+(vals.length+1)+" OFFSET $"+(vals.length+2),[...vals,limit,offset]);
      return send(res,200,{data:rows.rows,total:count.rows[0].total,limit,offset,has_more:offset+limit<count.rows[0].total});
    }
    if(path==="/api/genres"&&req.method==="GET"){const r=await p.query("SELECT name FROM genres ORDER BY name");return send(res,200,{data:r.rows.map(x=>x.name)});}
    if(path==="/api/seasons"&&req.method==="GET"){const r=await p.query("SELECT * FROM seasons ORDER BY anime_id,season_number");return send(res,200,{data:r.rows});}
    let m=path.match(/^\/api\/anime\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==="GET"){const a=await getAnime(m[1]);return a?send(res,200,{data:a}):fail(res,404,"Anime not found");}
    if(path==="/api/episodes"&&req.method==="GET"){const id=str(req.query.anime_id,80),limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500));const r=id?await p.query("SELECT * FROM episodes WHERE anime_id=$1 ORDER BY season_id,episode_number",[id]):await p.query("SELECT * FROM episodes ORDER BY anime_id,season_id,episode_number LIMIT $1",[limit]);return send(res,200,{data:r.rows});}
    if(path==="/api/sources"&&req.method==="GET"){const id=str(req.query.anime_id,80),limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500));const r=id?await p.query("SELECT * FROM viewing_sources WHERE anime_id=$1 ORDER BY created_at DESC",[id]):await p.query("SELECT * FROM viewing_sources ORDER BY created_at DESC LIMIT $1",[limit]);return send(res,200,{data:r.rows});}
    if(path==="/api/featured"&&req.method==="GET"){const r=await p.query("SELECT a.* FROM anime a LEFT JOIN featured_anime f ON f.anime_id=a.id WHERE a.featured=TRUE OR f.active=TRUE ORDER BY COALESCE(f.position,999),a.updated_at DESC LIMIT 20");return send(res,200,{data:r.rows});}
    if(!adminPath) return fail(res,404,"Not found");
    if(path==="/api/admin/anime"&&req.method==="POST"){
      const b=req.body,problem=validateAnime(b);if(problem)return fail(res,400,problem);
      const id=safeId(b.id),client=await p.connect();
      try{await client.query("BEGIN");
        await client.query("INSERT INTO anime(id,mal_id,title,title_english,synopsis,poster_url,banner_url,format,status,season,release_year,episode_count,score,official_url,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
          [id,num(b.mal_id),str(b.title,200),str(b.title_english,200),str(b.synopsis,5000),str(b.poster_url,2048),str(b.banner_url,2048),str(b.format,30),str(b.status,40),str(b.season,30),num(b.release_year),num(b.episode_count),num(b.score),str(b.official_url,2048),!!b.featured]);
        await saveGenres(client,id,b.genres);await client.query("COMMIT");
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      return send(res,201,{ok:true,id,data:await getAnime(id)});
    }
    m=path.match(/^\/api\/admin\/anime\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==="PATCH"){
      const b=req.body||{},fields={title:200,title_english:200,synopsis:5000,poster_url:2048,banner_url:2048,format:30,status:40,season:30,official_url:2048},sets=[],vals=[];
      for(const [k,max] of Object.entries(fields))if(b[k]!==undefined){if(["poster_url","banner_url","official_url"].includes(k)&&b[k]&&!https(b[k]))return fail(res,400,k+" must be HTTPS");vals.push(str(b[k],max));sets.push(k+"=$"+vals.length);}
      for(const k of ["release_year","episode_count","score"])if(b[k]!==undefined){if(k==="score"&&b[k]!==null&&b[k]!==""&&(Number(b[k])<0||Number(b[k])>10))return fail(res,400,"Score must be between 0 and 10");vals.push(num(b[k]));sets.push(k+"=$"+vals.length);}
      if(b.featured!==undefined){vals.push(!!b.featured);sets.push("featured=$"+vals.length);}
      const client=await p.connect();try{await client.query("BEGIN");if(sets.length){vals.push(m[1]);const r=await client.query("UPDATE anime SET "+sets.join(",")+",updated_at=NOW() WHERE id=$"+vals.length,vals);if(!r.rowCount){await client.query("ROLLBACK");return fail(res,404,"Anime not found");}}if(b.genres!==undefined)await saveGenres(client,m[1],b.genres);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      return send(res,200,{ok:true,data:await getAnime(m[1])});
    }
    if(m&&req.method==="DELETE"){await p.query("DELETE FROM anime WHERE id=$1",[m[1]]);return send(res,200,{ok:true});}
    if(path==="/api/admin/episodes"&&req.method==="POST"){
      const b=req.body;if(!b||!str(b.anime_id,80)||!Number.isInteger(Number(b.episode_number))||Number(b.episode_number)<1)return fail(res,400,"Anime ID and a valid episode number are required");
      if(b.thumbnail_url&&!https(b.thumbnail_url))return fail(res,400,"Thumbnail must be HTTPS");const id=safeId(b.id);
      await p.query("INSERT INTO episodes(id,anime_id,season_id,episode_number,title,synopsis,thumbnail_url,duration_minutes,release_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,str(b.anime_id,80),str(b.season_id,80)||null,Number(b.episode_number),str(b.title,200),str(b.synopsis,3000),str(b.thumbnail_url,2048),num(b.duration_minutes),str(b.release_date,30)||null]);return send(res,201,{ok:true,id});
    }
    m=path.match(/^\/api\/admin\/episodes\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==="PATCH"){const b=req.body||{},fields={episode_number:"episode_number",title:"title",synopsis:"synopsis",thumbnail_url:"thumbnail_url",duration_minutes:"duration_minutes",release_date:"release_date"},sets=[],vals=[];for(const [k,col] of Object.entries(fields))if(b[k]!==undefined){if(k==="thumbnail_url"&&b[k]&&!https(b[k]))return fail(res,400,"Thumbnail must be HTTPS");vals.push(["episode_number","duration_minutes"].includes(k)?num(b[k]):str(b[k],k==="synopsis"?3000:2048));sets.push(col+"=$"+vals.length);}if(!sets.length)return fail(res,400,"No supported fields supplied");vals.push(m[1]);const r=await p.query("UPDATE episodes SET "+sets.join(",")+" WHERE id=$"+vals.length,vals);return r.rowCount?send(res,200,{ok:true}):fail(res,404,"Episode not found");}
    if(m&&req.method==="DELETE"){await p.query("DELETE FROM episodes WHERE id=$1",[m[1]]);return send(res,200,{ok:true});}
    if(path==="/api/admin/sources"&&req.method==="POST"){const b=req.body;if(!b||!str(b.anime_id,80)||!str(b.provider,120)||!https(b.url))return fail(res,400,"Anime, provider and HTTPS source URL are required");const type=["official_page","trailer","authorized_stream"].includes(b.source_type)?b.source_type:"official_page",id=safeId(b.id);await p.query("INSERT INTO viewing_sources(id,anime_id,episode_id,provider,source_type,url,language) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,str(b.anime_id,80),str(b.episode_id,80)||null,str(b.provider,120),type,str(b.url,2048),str(b.language,40)]);return send(res,201,{ok:true,id});}
    m=path.match(/^\/api\/admin\/sources\/([A-Za-z0-9_-]+)$/);
    if(m&&req.method==="PATCH"){const b=req.body||{},fields=["provider","source_type","url","language"],sets=[],vals=[];for(const k of fields)if(b[k]!==undefined){if(k==="url"&&!https(b[k]))return fail(res,400,"Source URL must be HTTPS");if(k==="source_type"&&!["official_page","trailer","authorized_stream"].includes(b[k]))return fail(res,400,"Invalid source type");vals.push(str(b[k],2048));sets.push(k+"=$"+vals.length);}if(!sets.length)return fail(res,400,"No supported fields supplied");vals.push(m[1]);const r=await p.query("UPDATE viewing_sources SET "+sets.join(",")+" WHERE id=$"+vals.length,vals);return r.rowCount?send(res,200,{ok:true}):fail(res,404,"Source not found");}
    if(m&&req.method==="DELETE"){await p.query("DELETE FROM viewing_sources WHERE id=$1",[m[1]]);return send(res,200,{ok:true});}
    return fail(res,404,"Not found");
  } catch(e) {
    console.error("AniVira API error:",e.message);
    return fail(res,500,"API request failed. Verify DATABASE_URL and the database schema.");
  }
};