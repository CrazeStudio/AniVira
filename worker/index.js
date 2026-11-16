const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error=(message,status=400)=>reply({ok:false,error:message},status);
const text=(v,max=5000)=>typeof v==="string"?v.trim().slice(0,max):"";
const id=()=>crypto.randomUUID();\nconst safeId=v=>/^[A-Za-z0-9_-]{1,80}$/.test(text(v,80))?text(v,80):id();
const isHttps=v=>{try{return new URL(v).protocol==="https:"}catch{return false}};
const clamp=(v,min,max,def)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Math.floor(Number(v)):def));
async function parse(req){try{return await req.json()}catch{return null}}
async function authorized(req,env){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!env.ADMIN_API_KEY||!token||token.length>512)return false;
 const enc=new TextEncoder(),[a,b]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(token)),crypto.subtle.digest("SHA-256",enc.encode(env.ADMIN_API_KEY))]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
function cors(req,env,res){
 const origin=req.headers.get("Origin"),allowed=(env.ALLOWED_ORIGIN||"").split(",").map(x=>x.trim()).filter(Boolean);
 const h=new Headers(res.headers);
 if(origin&&allowed.includes(origin)){h.set("access-control-allow-origin",origin);h.set("vary","Origin");}
 h.set("access-control-allow-methods","GET,POST,PATCH,DELETE,OPTIONS");
 h.set("access-control-allow-headers","content-type,authorization");
 h.set("access-control-max-age","86400");
 return new Response(res.body,{status:res.status,headers:h});
}
const db=env=>{if(!env.DB)throw new Error("Database binding DB is not configured");return env.DB};
async function getAnime(env,animeId){
 const a=await db(env).prepare("SELECT * FROM anime WHERE id=?").bind(animeId).first();
 if(!a)return null;
 const [g,e,s]=await Promise.all([
  db(env).prepare("SELECT g.name FROM genres g JOIN anime_genres ag ON ag.genre_id=g.id WHERE ag.anime_id=? ORDER BY g.name").bind(animeId).all(),
  db(env).prepare("SELECT * FROM episodes WHERE anime_id=? ORDER BY season_id,episode_number").bind(animeId).all(),
  db(env).prepare("SELECT * FROM viewing_sources WHERE anime_id=? ORDER BY created_at DESC").bind(animeId).all()
 ]);
 return {...a,genres:(g.results||[]).map(x=>x.name),episodes:e.results||[],sources:s.results||[]};
}
function validateAnime(b){
 if(!b||!text(b.title,200))return "A title is required";
 for(const k of ["poster_url","banner_url","official_url"])if(b[k]&&!isHttps(b[k]))return k+" must be a valid HTTPS URL";
 if(b.score!==undefined&&b.score!==null&&(Number(b.score)<0||Number(b.score)>10))return "Score must be between 0 and 10";
 return null;
}
async function saveGenres(database,animeId,genres){
 await database.prepare("DELETE FROM anime_genres WHERE anime_id=?").bind(animeId).run();
 for(const name of [...new Set((Array.isArray(genres)?genres:[]).map(x=>text(x,60)).filter(Boolean))]){
  await database.prepare("INSERT OR IGNORE INTO genres(name) VALUES(?)").bind(name).run();
  const g=await database.prepare("SELECT id FROM genres WHERE name=?").bind(name).first();
  if(g)await database.prepare("INSERT OR IGNORE INTO anime_genres(anime_id,genre_id) VALUES(?,?)").bind(animeId,g.id).run();
 }
}
export default {async fetch(req,env){
 const url=new URL(req.url),path=url.pathname.replace(/\/+$/,"")||"/";
 const done=r=>cors(req,env,r);
 if(req.method==="OPTIONS")return done(new Response(null,{status:204}));\n if(Number(req.headers.get("content-length")||0)>262144)return done(error("Request body is too large",413));
 try{
  if(path==="/api/health"&&req.method==="GET"){
   let database=false;try{await db(env).prepare("SELECT 1 AS ok").first();database=true}catch{}
   return done(reply({ok:database,service:"anivira-api",database,version:2}));
  }
  if(!path.startsWith("/api/"))return done(error("Not found",404));
  const database=db(env);
  if(path==="/api/anime"&&req.method==="GET"){
   const q=text(url.searchParams.get("q"),120),genre=text(url.searchParams.get("genre"),60),status=text(url.searchParams.get("status"),40),format=text(url.searchParams.get("format"),30);
   const limit=clamp(url.searchParams.get("limit"),1,60,24),offset=clamp(url.searchParams.get("offset"),0,1000000,0);
   let sql="SELECT DISTINCT a.* FROM anime a LEFT JOIN anime_genres ag ON ag.anime_id=a.id LEFT JOIN genres g ON g.id=ag.genre_id WHERE 1=1",args=[];
   if(q){sql+=" AND (a.title LIKE ? OR a.title_english LIKE ? OR a.synopsis LIKE ?)";args.push("%"+q+"%","%"+q+"%","%"+q+"%")}
   if(genre){sql+=" AND g.name=?";args.push(genre)}
   if(status){sql+=" AND a.status=?";args.push(status)}
   if(format){sql+=" AND a.format=?";args.push(format)}
   const count=await database.prepare(sql.replace("SELECT DISTINCT a.*","SELECT COUNT(DISTINCT a.id) AS total")).bind(...args).first();
   sql+=" ORDER BY a.featured DESC,a.updated_at DESC LIMIT ? OFFSET ?";args.push(limit,offset);
   const rows=await database.prepare(sql).bind(...args).all();
   return done(reply({data:rows.results||[],total:count?.total||0,limit,offset,has_more:offset+limit<(count?.total||0)}));
  }
  if(path==="/api/genres"&&req.method==="GET"){const r=await database.prepare("SELECT name FROM genres ORDER BY name").all();return done(reply({data:(r.results||[]).map(x=>x.name)}))}
  if(path==="/api/seasons"&&req.method==="GET"){const r=await database.prepare("SELECT * FROM seasons ORDER BY anime_id,season_number").all();return done(reply({data:r.results||[]}))}
  let m=path.match(/^\/api\/anime\/([A-Za-z0-9_-]+)$/);
  if(m&&req.method==="GET"){const a=await getAnime(env,m[1]);return done(a?reply({data:a}):error("Anime not found",404))}
  if(path==="/api/episodes"&&req.method==="GET"){
   const animeId=text(url.searchParams.get("anime_id"),80),limit=clamp(url.searchParams.get("limit"),1,1000,500);const r=animeId?await database.prepare("SELECT * FROM episodes WHERE anime_id=? ORDER BY season_id,episode_number").bind(animeId).all():await database.prepare("SELECT * FROM episodes ORDER BY anime_id,season_id,episode_number LIMIT ?").bind(limit).all();return done(reply({data:r.results||[]}));
  }
  if(path==="/api/sources"&&req.method==="GET"){
   const animeId=text(url.searchParams.get("anime_id"),80),limit=clamp(url.searchParams.get("limit"),1,1000,500);const r=animeId?await database.prepare("SELECT * FROM viewing_sources WHERE anime_id=? ORDER BY created_at DESC").bind(animeId).all():await database.prepare("SELECT * FROM viewing_sources ORDER BY created_at DESC LIMIT ?").bind(limit).all();return done(reply({data:r.results||[]}));
  }
  if(path==="/api/featured"&&req.method==="GET"){
   const r=await database.prepare("SELECT a.* FROM anime a LEFT JOIN featured_anime f ON f.anime_id=a.id WHERE a.featured=1 OR (f.active=1) ORDER BY COALESCE(f.position,999),a.updated_at DESC LIMIT 20").all();return done(reply({data:r.results||[]}));
  }
  if(!path.startsWith("/api/admin/")&&!["POST","PATCH","DELETE"].includes(req.method))return done(error("Not found",404));
  if(!await authorized(req,env))return done(error("Admin API key required",401));\n  if(path==="/api/admin/verify"&&req.method==="GET")return done(reply({ok:true,authorized:true}));
  if(path==="/api/admin/anime"&&req.method==="POST"){
   const b=await parse(req),problem=validateAnime(b);if(problem)return done(error(problem));
   const animeId=safeId(b.id);
   await database.prepare("INSERT INTO anime(id,mal_id,title,title_english,synopsis,poster_url,banner_url,format,status,season,release_year,episode_count,score,official_url,featured,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(animeId,Number(b.mal_id)||null,text(b.title,200),text(b.title_english,200),text(b.synopsis,5000),text(b.poster_url,2048),text(b.banner_url,2048),text(b.format,30),text(b.status,40),text(b.season,30),Number(b.release_year)||null,Number(b.episode_count)||null,b.score===""||b.score==null?null:Number(b.score),text(b.official_url,2048),b.featured?1:0).run();
   await saveGenres(database,animeId,b.genres);return done(reply({ok:true,id:animeId,data:await getAnime(env,animeId)},201));
  }
  m=path.match(/^\/api\/admin\/anime\/([A-Za-z0-9_-]+)$/);
  if(m&&req.method==="PATCH"){
   const b=await parse(req);if(!b)return done(error("Invalid JSON"));
   const fields={title:200,title_english:200,synopsis:5000,poster_url:2048,banner_url:2048,format:30,status:40,season:30,official_url:2048};
   const sets=[],values=[];
   for(const [k,max] of Object.entries(fields))if(b[k]!==undefined){if(["poster_url","banner_url","official_url"].includes(k)&&b[k]&&!isHttps(b[k]))return done(error(k+" must be HTTPS"));sets.push(k+"=?");values.push(text(b[k],max))}
   for(const k of ["release_year","episode_count","score"])if(b[k]!==undefined){if(k==="score"&&(Number(b[k])<0||Number(b[k])>10))return done(error("Score must be between 0 and 10"));sets.push(k+"=?");values.push(b[k]===""?null:Number(b[k])||null)}
   if(b.featured!==undefined){sets.push("featured=?");values.push(b.featured?1:0)}
   if(sets.length){sets.push("updated_at=CURRENT_TIMESTAMP");values.push(m[1]);const result=await database.prepare("UPDATE anime SET "+sets.join(",")+" WHERE id=?").bind(...values).run();if(!result.meta?.changes)return done(error("Anime not found",404))}
   if(b.genres!==undefined)await saveGenres(database,m[1],b.genres);
   return done(reply({ok:true,data:await getAnime(env,m[1])}));
  }
  if(m&&req.method==="DELETE"){await database.prepare("DELETE FROM anime WHERE id=?").bind(m[1]).run();return done(reply({ok:true}))}
  if(path==="/api/admin/episodes"&&req.method==="POST"){
   const b=await parse(req);if(!b||!text(b.anime_id,80)||!Number.isInteger(Number(b.episode_number))||Number(b.episode_number)<1)return done(error("Anime ID and a valid episode number are required"));
   for(const k of ["thumbnail_url"])if(b[k]&&!isHttps(b[k]))return done(error(k+" must be HTTPS"));
   const episodeId=safeId(b.id);
   await database.prepare("INSERT INTO episodes(id,anime_id,season_id,episode_number,title,synopsis,thumbnail_url,duration_minutes,release_date) VALUES(?,?,?,?,?,?,?,?,?)").bind(episodeId,text(b.anime_id,80),text(b.season_id,80)||null,Number(b.episode_number),text(b.title,200),text(b.synopsis,3000),text(b.thumbnail_url,2048),Number(b.duration_minutes)||null,text(b.release_date,30)).run();
   return done(reply({ok:true,id:episodeId},201));
  }
  m=path.match(/^\/api\/admin\/episodes\/([A-Za-z0-9_-]+)$/);
  if(m&&req.method==="PATCH"){
   const b=await parse(req);if(!b)return done(error("Invalid JSON"));const map={episode_number:"episode_number",title:"title",synopsis:"synopsis",thumbnail_url:"thumbnail_url",duration_minutes:"duration_minutes",release_date:"release_date"},sets=[],vals=[];
   for(const [k,col] of Object.entries(map))if(b[k]!==undefined){if(k==="thumbnail_url"&&b[k]&&!isHttps(b[k]))return done(error("Thumbnail must be HTTPS"));sets.push(col+"=?");vals.push(["episode_number","duration_minutes"].includes(k)?Number(b[k])||null:text(b[k],k==="synopsis"?3000:2048))}
   if(!sets.length)return done(error("No supported fields supplied"));vals.push(m[1]);await database.prepare("UPDATE episodes SET "+sets.join(",")+" WHERE id=?").bind(...vals).run();return done(reply({ok:true}));
  }
  if(m&&req.method==="DELETE"){await database.prepare("DELETE FROM episodes WHERE id=?").bind(m[1]).run();return done(reply({ok:true}))}
  if(path==="/api/admin/sources"&&req.method==="POST"){
   const b=await parse(req);if(!b||!text(b.anime_id,80)||!text(b.provider,120)||!isHttps(b.url))return done(error("Anime, provider and HTTPS source URL are required"));
   const type=["official_page","trailer","authorized_stream"].includes(b.source_type)?b.source_type:"official_page",sourceId=safeId(b.id);
   await database.prepare("INSERT INTO viewing_sources(id,anime_id,episode_id,provider,source_type,url,language) VALUES(?,?,?,?,?,?,?)").bind(sourceId,text(b.anime_id,80),text(b.episode_id,80)||null,text(b.provider,120),type,text(b.url,2048),text(b.language,40)).run();return done(reply({ok:true,id:sourceId},201));
  }
  m=path.match(/^\/api\/admin\/sources\/([A-Za-z0-9_-]+)$/);
  if(m&&req.method==="PATCH"){
   const b=await parse(req);if(!b)return done(error("Invalid JSON"));const fields=["provider","source_type","url","language"],sets=[],vals=[];
   for(const k of fields)if(b[k]!==undefined){if(k==="url"&&!isHttps(b[k]))return done(error("Source URL must be HTTPS"));if(k==="source_type"&&!["official_page","trailer","authorized_stream"].includes(b[k]))return done(error("Invalid source type"));sets.push(k+"=?");vals.push(text(b[k],2048))}
   if(!sets.length)return done(error("No supported fields supplied"));vals.push(m[1]);await database.prepare("UPDATE viewing_sources SET "+sets.join(",")+" WHERE id=?").bind(...vals).run();return done(reply({ok:true}));
  }
  if(m&&req.method==="DELETE"){await database.prepare("DELETE FROM viewing_sources WHERE id=?").bind(m[1]).run();return done(reply({ok:true}))}
  return done(error("Not found",404));
 }catch(e){return done(error("Request failed. Check the request and database configuration.",500))}
}};
