const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fail(message) { $("#detail-state").textContent = message; }
async function loadAnime() {
  const id = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return fail("This anime link is not valid.");
  try {
    const response = await fetch("/api/anilist?action=detail&id=" + id, {headers: {"accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Anime details could not be loaded.");
    const anime = data.anime;
    const title = anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
    document.title = title + " — AniVira";
    $("#detail-title").textContent = title;
    $("#detail-alt-title").textContent = [anime.title?.romaji, anime.title?.native].filter((v) => v && v !== title).join(" · ");
    $("#detail-cover").src = anime.coverImage?.large || "";
    $("#detail-cover").alt = title + " poster";
    if (anime.bannerImage) { $("#detail-banner").src = anime.bannerImage; $("#detail-banner").hidden = false; }
    $("#detail-meta").textContent = [anime.format, anime.season && anime.seasonYear ? anime.season + " " + anime.seasonYear : anime.seasonYear, anime.episodes ? anime.episodes + " episodes" : "", anime.duration ? anime.duration + " min / episode" : "", anime.averageScore ? "Score " + anime.averageScore + "/100" : "", anime.status].filter(Boolean).join(" · ");
    $("#detail-genres").innerHTML = (anime.genres || []).map((genre) => '<span class="genre-chip">' + esc(genre) + "</span>").join("");
    $("#detail-description").textContent = anime.descriptionText || "No synopsis is available from AniList.";
    $("#anilist-link").href = "https://anilist.co/anime/" + id;
    const sources = anime.sources || [];
    $("#detail-sources").innerHTML = sources.length ? sources.map((source) => '<article class="detail-source"><div><strong>' + esc(source.label) + '</strong><small>' + esc([source.language, source.quality].filter(Boolean).join(" · ") || "YouTube video") + '</small></div><a href="/watch?id=' + Number(source.id) + '">Watch ↗</a></article>').join("") : '<p class="muted">No authorized viewing links have been added for this title yet.</p>';
    $("#detail-state").hidden = true;
    $("#anime-detail").hidden = false;
  } catch (error) {
    fail("Could not load this anime right now. Please return and try again.");
  }
}
loadAnime();