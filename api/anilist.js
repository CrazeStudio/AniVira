const {query, ensureSchema, json, youtubeVideoId} = require("./_lib");

const endpoint = "https://graphql.anilist.co";
const fields = "id title { romaji english native } coverImage { large medium } bannerImage format season seasonYear averageScore status genres episodes duration";

async function ani(queryText, variables) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {"content-type": "application/json", "accept": "application/json"},
    body: JSON.stringify({query: queryText, variables: variables || {}}),
    signal: AbortSignal.timeout(12000)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("AniList returned an invalid response."); }
  if (!response.ok || data.errors) throw new Error(data.errors?.[0]?.message || "AniList request failed.");
  return data.data;
}
function currentSeason() {
  const month = new Date().getUTCMonth() + 1;
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}
function descriptionText(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
async function home(res) {
  const sorts = [
    {title:"Trending now",sort:"TRENDING_DESC"},
    {title:"Popular anime",sort:"POPULARITY_DESC"},
    {title:"Top rated",sort:"SCORE_DESC"},
    {title:"Recently updated",sort:"UPDATED_AT_DESC"}
  ];
  const year = new Date().getUTCFullYear();
  const sections = await Promise.all(sorts.map(async (section) => {
    const data = await ani("query($sort:[MediaSort]){Page(perPage:12){media(type:ANIME,sort:$sort){" + fields + "}}}",{sort:[section.sort]});
    return {title:section.title,items:data.Page.media || []};
  }));
  const season = await ani("query($season:MediaSeason,$year:Int){Page(perPage:12){media(type:ANIME,season:$season,seasonYear:$year,sort:POPULARITY_DESC){" + fields + "}}}",{season:currentSeason(),year});
  sections.splice(2,0,{title:"This season",items:season.Page.media || []});

  let sources = [];
  let sourceWarning = "";
  try {
    await ensureSchema();
    const [libraryRows, sourceRows] = await Promise.all([
      query("SELECT anilist_id,title,cover_image,format,season,year,status FROM anime ORDER BY created_at DESC LIMIT 48",[]),
      query("SELECT s.id,s.anilist_id,s.label,s.url,s.language,s.quality,a.title AS anime_title FROM sources s LEFT JOIN anime a ON a.anilist_id=s.anilist_id ORDER BY s.created_at DESC",[])
    ]);
    const validRows = sourceRows.filter((item) => youtubeVideoId(item.url));
    const byAnime = new Map();
    for (const item of validRows) {
      const id = Number(item.anilist_id);
      if (!byAnime.has(id)) byAnime.set(id,[]);
      byAnime.get(id).push({id:Number(item.id),label:item.label,language:item.language || "",quality:item.quality || ""});
    }
    const library = libraryRows.map((item) => ({
      id:Number(item.anilist_id),
      title:{english:item.title},
      coverImage:{large:item.cover_image || ""},
      format:item.format || "",
      season:item.season || "",
      seasonYear:item.year || null,
      status:item.status || "",
      sources:byAnime.get(Number(item.anilist_id)) || []
    }));
    if (library.length) sections.unshift({title:"AniVira collection",items:library});
    for (const section of sections) {
      section.items = section.items.map((item) => ({
        ...item,
        sources:item.sources || byAnime.get(Number(item.id)) || []
      }));
    }
    sources = validRows.map((item) => ({
      id:Number(item.id),
      anilist_id:Number(item.anilist_id),
      label:item.label,
      language:item.language || "",
      quality:item.quality || "",
      anime_title:item.anime_title || "Anime"
    }));
  } catch {
    sourceWarning = "The AniVira library and viewing links are unavailable until the site database is configured.";
  }
  return json(res,200,{sections,sources,sourceWarning},"public, s-maxage=90, stale-while-revalidate=240");
}
module.exports = async function handler(req,res) {
  if (req.method !== "GET") return json(res,405,{error:"Method not allowed."});
  const action = String(req.query.action || "home");
  try {
    if (action === "home") return await home(res);
    if (action === "search") {
      const term = String(req.query.q || "").trim().slice(0,80);
      if (!term) return json(res,400,{error:"Enter an anime title to search."});
      const data = await ani("query($search:String){Page(perPage:24){media(search:$search,type:ANIME,sort:SEARCH_MATCH){" + fields + "}}}",{search:term});
      return json(res,200,{items:data.Page.media || []},"public, s-maxage=30, stale-while-revalidate=60");
    }
    if (action === "detail") {
      const id = Number(req.query.id);
      if (!Number.isSafeInteger(id) || id < 1) return json(res,400,{error:"Invalid AniList ID."});
      const data = await ani("query($id:Int){Media(id:$id,type:ANIME){" + fields + " description startDate{year month day} popularity}}",{id});
      const anime = data.Media;
      if (!anime) return json(res,404,{error:"Anime not found."});
      let sources = [];
      let sourceWarning = "";
      try {
        await ensureSchema();
        const rows = await query("SELECT id,label,url,language,quality FROM sources WHERE anilist_id=? ORDER BY created_at DESC",[id]);
        sources = rows.filter((item) => youtubeVideoId(item.url)).map((item) => ({
          id:Number(item.id),label:item.label,language:item.language || "",quality:item.quality || ""
        }));
      } catch {
        sourceWarning = "Viewing links are temporarily unavailable.";
      }
      anime.descriptionText = descriptionText(anime.description);
      delete anime.description;
      return json(res,200,{anime:{...anime,sources},sourceWarning},"public, s-maxage=45, stale-while-revalidate=120");
    }
    if (action === "source") {
      const id = Number(req.query.id);
      if (!Number.isSafeInteger(id) || id < 1) return json(res,400,{error:"Invalid viewing link."});
      await ensureSchema();
      const rows = await query("SELECT s.id,s.anilist_id,s.label,s.url,s.language,s.quality,a.title AS anime_title FROM sources s JOIN anime a ON a.anilist_id=s.anilist_id WHERE s.id=? LIMIT 1",[id]);
      const item = rows[0];
      if (!item) return json(res,404,{error:"Viewing link not found."});
      const videoId = youtubeVideoId(item.url);
      if (!videoId) return json(res,404,{error:"This source is not a valid YouTube video."});
      return json(res,200,{source:{
        id:Number(item.id),anilist_id:Number(item.anilist_id),anime_title:item.anime_title,label:item.label,
        language:item.language || "",quality:item.quality || "",
        embedUrl:"https://www.youtube-nocookie.com/embed/" + videoId + "?rel=0",
        youtubeUrl:"https://www.youtube.com/watch?v=" + videoId
      }},"no-store");
    }
    return json(res,400,{error:"Unknown AniVira API action."});
  } catch (error) {
    const message = error.message && error.message.startsWith("AniList") ? error.message : "The request could not be completed right now.";
    return json(res,502,{error:message});
  }
};