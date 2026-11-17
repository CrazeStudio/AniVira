const {query,ensureSchema,json,signingKeyReady,validSession,issueCookie,clearCookie,checkPassword,sameOrigin,loginBlocked,recordLoginFailure,clearLoginFailures,youtubeVideoId}=require("./_lib");
const fields="id title { romaji english native } coverImage { large medium } bannerImage description format season seasonYear status genres";
async function fetchAnime(id){const r=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:"query($id:Int){Media(id:$id,type:ANIME){"+fields+"}}",variables:{id}}),signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok||d.errors||!d.data?.Media)throw Error("AniList could not load this anime.");return d.data.Media;}
const title=x=>x.title?.english||x.title?.romaji||x.title?.native||"Untitled",num=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:0;};
async function getYoutubeVideos(ids,key){
  const unique=[...new Set(ids.filter(id=>/^[A-Za-z0-9_-]{11}$/.test(id||"")))];
  const found=new Map();
  for(let i=0;i<unique.length;i+=50){
    const u=new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part","snippet,status,contentDetails");
    u.searchParams.set("id",unique.slice(i,i+50).join(","));
    u.searchParams.set("key",key);
    const r=await fetch(u,{signal:AbortSignal.timeout(12000)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.error)throw Error("YouTube video validation failed. Check YOUTUBE_API_KEY and its quota.");
    for(const video of d.items||[])found.set(video.id,video);
  }
  return found;
}
function availableInIndia(video){
  if(!video||video.status?.embeddable!==true||!["public","unlisted"].includes(video.status?.privacyStatus))return false;
  const restriction=video.contentDetails?.regionRestriction;
  if(restriction?.blocked?.includes("IN"))return false;
  if(Array.isArray(restriction?.allowed)&&!restriction.allowed.includes("IN"))return false;
  return true;
}
function episodeNumberFromTitle(value){
  const title=String(value||"");
  const patterns=[
    /\\bS\\d{1,2}\\s*[-_. ]*E(?:P(?:ISODE)?)?\\s*0*(\\d{1,4})\\b/i,
    /\\b(?:episode|ep)\\s*[#.:_-]?\\s*0*(\\d{1,4})\\b/i,
    /(?:^|\\s)#\\s*0*(\\d{1,4})(?=\\s|$|[-:])/i
  ];
  for(const pattern of patterns){const match=title.match(pattern);if(match){const n=Number(match[1]);if(Number.isSafeInteger(n)&&n>0)return n;}}
  return 0;
}

module.exports=async function(req,res){if(req.method!=="POST")return json(res,405,{error:"Method not allowed."});if(!sameOrigin(req))return json(res,403,{error:"This request was blocked."});try{await ensureSchema();let b=req.body;if(typeof b==="string")b=JSON.parse(b);b=b&&typeof b==="object"?b:{};const a=String(b.action||"");
if(a==="login"){if(!process.env.ADMIN_PASSWORD_HASH||!signingKeyReady())return json(res,503,{error:"Admin authentication is not configured."});if(await loginBlocked(req))return json(res,429,{error:"Too many failed sign-in attempts."});const p=typeof b.password==="string"?b.password:"";if(!p||p.length>200||!checkPassword(p)){await recordLoginFailure(req);return json(res,401,{error:"Incorrect password."});}await clearLoginFailures(req);issueCookie(res);return json(res,200,{ok:true});}
if(a==="logout"){clearCookie(res);return json(res,200,{ok:true});}if(!validSession(req))return json(res,401,{error:"Please sign in again."});
if(a==="list"){const [anime,seasons,episodes,sources]=await Promise.all([query("SELECT anilist_id,title,cover_image FROM anime ORDER BY created_at DESC",[]),query("SELECT id,anilist_id,season_number,title FROM seasons ORDER BY anilist_id,season_number",[]),query("SELECT e.id,s.anilist_id,e.season_id,e.episode_number,e.title FROM episodes e JOIN seasons s ON s.id=e.season_id ORDER BY s.anilist_id,s.season_number,e.episode_number",[]),query("SELECT s.id,s.anilist_id,s.episode_id,s.label,s.url,s.language,s.quality,a.title AS anime_title,e.episode_number,e.title AS episode_title,se.season_number FROM sources s LEFT JOIN anime a ON a.anilist_id=s.anilist_id LEFT JOIN episodes e ON e.id=s.episode_id LEFT JOIN seasons se ON se.id=e.season_id ORDER BY s.created_at DESC",[])]);return json(res,200,{anime,seasons,episodes,sources});}
if(a==="addAnime"){const id=num(b.anilistId);if(!id)return json(res,400,{error:"Invalid AniList ID."});const x=await fetchAnime(id);await query("INSERT INTO anime(anilist_id,title,cover_image,banner_image,description,format,season,year,status,genres) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(anilist_id) DO UPDATE SET title=excluded.title,cover_image=excluded.cover_image,banner_image=excluded.banner_image,description=excluded.description,format=excluded.format,season=excluded.season,year=excluded.year,status=excluded.status,genres=excluded.genres",[x.id,title(x),x.coverImage?.large||"",x.bannerImage||"",x.description||"",x.format||"",x.season||"",x.seasonYear||null,x.status||"",JSON.stringify(x.genres||[])]);return json(res,200,{ok:true});}
if(a==="removeAnime"){const id=num(b.anilistId);if(!id)return json(res,400,{error:"Invalid anime."});await query("DELETE FROM sources WHERE anilist_id=?",[id]);await query("DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anilist_id=?)",[id]);await query("DELETE FROM seasons WHERE anilist_id=?",[id]);await query("DELETE FROM anime WHERE anilist_id=?",[id]);return json(res,200,{ok:true});}
if(a==="addSeason"){const id=num(b.anilistId),n=num(b.seasonNumber);if(!id||!n)return json(res,400,{error:"Choose anime and season number."});if(!(await query("SELECT 1 FROM anime WHERE anilist_id=?",[id])).length)return json(res,400,{error:"Import anime first."});await query("INSERT INTO seasons(anilist_id,season_number,title) VALUES(?,?,?) ON CONFLICT(anilist_id,season_number) DO UPDATE SET title=excluded.title",[id,n,String(b.title||"Season "+n).slice(0,100)]);return json(res,200,{ok:true});}
if(a==="removeSeason"){const id=num(b.id);await query("DELETE FROM sources WHERE episode_id IN (SELECT id FROM episodes WHERE season_id=?)",[id]);await query("DELETE FROM episodes WHERE season_id=?",[id]);await query("DELETE FROM seasons WHERE id=?",[id]);return json(res,200,{ok:true});}
if(a==="addEpisode"){const sid=num(b.seasonId),n=num(b.episodeNumber),t=String(b.title||"").trim().slice(0,160);if(!sid||!n||!t)return json(res,400,{error:"Choose season, episode number and title."});await query("INSERT INTO episodes(season_id,episode_number,title) VALUES(?,?,?) ON CONFLICT(season_id,episode_number) DO UPDATE SET title=excluded.title",[sid,n,t]);return json(res,200,{ok:true});}
if(a==="removeEpisode"){const id=num(b.id);await query("DELETE FROM sources WHERE episode_id=?",[id]);await query("DELETE FROM episodes WHERE id=?",[id]);return json(res,200,{ok:true});}
if(a==="addSource"){const id=num(b.anilistId),eid=num(b.episodeId),v=youtubeVideoId(b.url),label=String(b.label||"").trim().slice(0,80);if(!id||!eid||!v||!label||b.authorized!==true)return json(res,400,{error:"Select an episode, valid YouTube URL and confirm authorization."});if(!(await query("SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=? AND s.anilist_id=?",[eid,id])).length)return json(res,400,{error:"Episode does not belong to this anime."});const key=process.env.YOUTUBE_API_KEY;if(!key)return json(res,503,{error:"Set YOUTUBE_API_KEY in Vercel to validate YouTube videos."});const video=(await getYoutubeVideos([v],key)).get(v);if(!availableInIndia(video))return json(res,400,{error:"This video is deleted, private, not embeddable, or unavailable in India."});await query("INSERT OR IGNORE INTO sources(anilist_id,episode_id,label,url,language,quality) VALUES(?,?,?,?,?,?)",[id,eid,label,"https://www.youtube.com/watch?v="+v,String(b.language||"").slice(0,40),String(b.quality||"").slice(0,30)]);return json(res,200,{ok:true});}if(a==="importPlaylist"){
  const id=num(b.anilistId),sid=num(b.seasonId),raw=String(b.playlist||"").trim();
  let playlistId=(raw.match(/[?&]list=([A-Za-z0-9_-]{10,})/)||[])[1]||(/^[A-Za-z0-9_-]{10,}$/.test(raw)?raw:"");
  if(!id||!sid||!playlistId||b.authorized!==true)return json(res,400,{error:"Choose anime and season, enter a valid playlist URL and confirm authorization."});
  if(!(await query("SELECT id FROM seasons WHERE id=? AND anilist_id=?",[sid,id])).length)return json(res,400,{error:"Season mismatch."});
  const key=process.env.YOUTUBE_API_KEY;if(!key)return json(res,503,{error:"Set YOUTUBE_API_KEY in Vercel to enable playlist import."});
  let token="",items=[],pages=0;
  do{
    const u=new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    for(const [k,v] of Object.entries({part:"snippet,contentDetails",playlistId,maxResults:"50",key}))u.searchParams.set(k,v);
    if(token)u.searchParams.set("pageToken",token);
    const r=await fetch(u,{signal:AbortSignal.timeout(12000)}),d=await r.json().catch(()=>({}));
    if(!r.ok||d.error)throw Error("YouTube playlist request failed. Check YOUTUBE_API_KEY and its quota.");
    items.push(...(d.items||[]));token=d.nextPageToken||"";pages++;
  }while(token&&pages<5);
  const ids=items.map(x=>x.contentDetails?.videoId||x.snippet?.resourceId?.videoId||"");
  const videos=await getYoutubeVideos(ids,key);
  let imported=0,skippedUnavailable=0,skippedUnnumbered=0,duplicates=0;
  for(const item of items){
    const videoId=item.contentDetails?.videoId||item.snippet?.resourceId?.videoId||"";
    const video=videos.get(videoId);
    if(!videoId||!availableInIndia(video)){skippedUnavailable++;continue;}
    const videoTitle=String(video.snippet?.title||item.snippet?.title||"").trim();
    const episodeNumber=episodeNumberFromTitle(videoTitle);
    if(!episodeNumber){skippedUnnumbered++;continue;}
    await query("INSERT OR IGNORE INTO episodes(season_id,episode_number,title) VALUES(?,?,?)",[sid,episodeNumber,videoTitle.slice(0,160)||("Episode "+episodeNumber)]);
    const episode=await query("SELECT id FROM episodes WHERE season_id=? AND episode_number=?",[sid,episodeNumber]);
    if(!episode.length)continue;
    const url="https://www.youtube.com/watch?v="+videoId;
    const existing=await query("SELECT id FROM sources WHERE episode_id=? AND url=?",[Number(episode[0].id),url]);
    if(existing.length){duplicates++;continue;}
    await query("INSERT INTO sources(anilist_id,episode_id,label,url,language,quality) VALUES(?,?,?,?,?,?)",[id,Number(episode[0].id),videoTitle.slice(0,80)||("Episode "+episodeNumber),url,String(b.language||"").slice(0,40),String(b.quality||"").slice(0,30)]);
    imported++;
  }
  return json(res,200,{ok:true,imported,scanned:items.length,skippedUnavailable,skippedUnnumbered,duplicates,limited:!!token});
}
if(a==="cleanupUnavailable"){
  const key=process.env.YOUTUBE_API_KEY;if(!key)return json(res,503,{error:"Set YOUTUBE_API_KEY in Vercel to check video availability."});
  const all=await query("SELECT id,anilist_id,url FROM sources ORDER BY id LIMIT 251",[]);
  const rows=all.slice(0,250),ids=rows.map(x=>youtubeVideoId(x.url)).filter(Boolean),videos=await getYoutubeVideos(ids,key);
  const affected=new Set();let removedSources=0;
  for(const row of rows){
    const videoId=youtubeVideoId(row.url),video=videoId?videos.get(videoId):null;
    if(!availableInIndia(video)){
      await query("DELETE FROM sources WHERE id=?",[Number(row.id)]);
      affected.add(Number(row.anilist_id));removedSources++;
    }
  }
  let removedEpisodes=0,removedSeasons=0,removedAnime=0;
  for(const animeId of affected){
    const beforeEpisodes=Number((await query("SELECT COUNT(*) AS total FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.anilist_id=?",[animeId]))[0]?.total||0);
    const beforeSeasons=Number((await query("SELECT COUNT(*) AS total FROM seasons WHERE anilist_id=?",[animeId]))[0]?.total||0);
    await query("DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anilist_id=?) AND NOT EXISTS(SELECT 1 FROM sources WHERE episode_id=episodes.id)",[animeId]);
    await query("DELETE FROM seasons WHERE anilist_id=? AND NOT EXISTS(SELECT 1 FROM episodes WHERE season_id=seasons.id)",[animeId]);
    const remaining=await query("SELECT id FROM sources WHERE anilist_id=? LIMIT 1",[animeId]);
    if(!remaining.length){
      await query("DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anilist_id=?)",[animeId]);
      await query("DELETE FROM seasons WHERE anilist_id=?",[animeId]);
      await query("DELETE FROM anime WHERE anilist_id=?",[animeId]);
      removedAnime++;
    }
    const afterEpisodes=Number((await query("SELECT COUNT(*) AS total FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.anilist_id=?",[animeId]))[0]?.total||0);
    const afterSeasons=Number((await query("SELECT COUNT(*) AS total FROM seasons WHERE anilist_id=?",[animeId]))[0]?.total||0);
    removedEpisodes+=Math.max(0,beforeEpisodes-afterEpisodes);
    removedSeasons+=Math.max(0,beforeSeasons-afterSeasons);
  }
  return json(res,200,{ok:true,checked:rows.length,removedSources,removedEpisodes,removedSeasons,removedAnime,limited:all.length>250});
}
if(a==="removeSource"){const id=num(b.id);await query("DELETE FROM sources WHERE id=?",[id]);return json(res,200,{ok:true});}return json(res,400,{error:"Unknown admin action."});}catch(e){return json(res,500,{error:/playlist|YouTube|configured|validation|quota/i.test(e.message||"")?e.message:"Studio request failed. Check database configuration."});}};