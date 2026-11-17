const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function animeCard(a) {
  const title = a.title?.english || a.title?.romaji || a.title?.native || "Untitled";
  const id = Number(a.id);
  const meta = [a.format, a.seasonYear, a.averageScore ? a.averageScore + "/100" : ""].filter(Boolean).join(" · ");
  const sourceChips = (a.sources || []).slice(0, 2).map((s) => '<span class="source-chip">' + esc(s.label) + "</span>").join("");
  return '<a class="anime-card" href="/anime?id=' + id + '" aria-label="View ' + esc(title) + '"><div class="poster-wrap"><img class="poster" loading="lazy" decoding="async" src="' + esc(a.coverImage?.large || "") + '" alt="' + esc(title) + ' poster"></div><div class="anime-title">' + esc(title) + '</div><div class="anime-meta">' + esc(meta) + "</div>" + (sourceChips ? '<div class="card-sources">' + sourceChips + "</div>" : "") + "</a>";
}
async function loadHome() {
  const root = $("#catalogues");
  const all = $("#all-sources");
  try {
    const response = await fetch("/api/anilist?action=home", {headers: {"accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Catalogue request failed.");
    root.innerHTML = (data.sections || []).map((section) => '<section class="catalogue"><div class="catalogue-head"><h2>' + esc(section.title) + '</h2><a class="text-link" href="/search">Explore all →</a></div><div class="anime-grid">' + (section.items || []).map(animeCard).join("") + "</div></section>").join("") || '<p class="empty">No catalogue sections are available right now.</p>';
    all.innerHTML = (data.sources || []).length ? data.sources.map((source) => '<article class="source-item"><strong>' + esc(source.label) + '</strong><span>' + esc(source.anime_title || "Anime") + ' · ' + esc([source.language, source.quality].filter(Boolean).join(" / ")) + '</span><a href="/watch?id=' + Number(source.id) + '">Watch video ↗</a></article>').join("") : '<p class="muted">No authorized YouTube videos have been added yet.</p>';
    if (data.sourceWarning) all.insertAdjacentHTML("beforeend", '<p class="muted">' + esc(data.sourceWarning) + "</p>");
  } catch (error) {
    root.innerHTML = '<p class="empty">Could not load AniList catalogues. Please try again later.</p>';
    all.innerHTML = '<p class="muted">Viewing links are temporarily unavailable.</p>';
  }
}
loadHome();