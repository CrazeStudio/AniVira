const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[char]));

function titleOf(anime) {
  return anime?.title?.english || anime?.title?.romaji || anime?.title?.native || "Untitled";
}

function episodeCard(episode, season, anime) {
  const sources = Array.isArray(episode.sources) ? episode.sources.filter(source => Number(source.id) > 0) : [];
  const thumbnail = sources[0]?.thumbnail || "";
  const episodeTitle = episode.title || "Episode " + Number(episode.number);
  const languageOptions = sources.map(source => {
    const label = [source.language || "Default audio", source.quality].filter(Boolean).join(" · ");
    return '<a class="episode-language" href="/watch?id=' + Number(source.id) + '" aria-label="Open episode video version ' + Number(episode.number) + ' in ' + esc(source.language || "default audio") + '">' + esc(label) + ' <span aria-hidden="true">↗</span></a>';
  }).join("");

  return '<article class="episode-card-visual">' +
    '<div class="episode-thumb-wrap">' +
      (thumbnail
        ? '<img class="episode-thumb" loading="lazy" decoding="async" src="' + esc(thumbnail) + '" alt="' + esc(episodeTitle) + ' thumbnail">'
        : '<img class="episode-thumb episode-thumb-placeholder" loading="lazy" decoding="async" src="' + esc(anime.coverImage?.large || "") + '" alt="' + esc(titleOf(anime)) + ' poster">') +
      '<span class="episode-number">EP ' + Number(episode.number) + '</span>' +
    '</div>' +
    '<div class="episode-card-info"><strong>' + esc(episodeTitle) + '</strong>' +
      '<small>' + esc(season.title || ("Season " + Number(season.number))) + ' · ' + sources.length + (sources.length === 1 ? ' video version' : ' video versions') + '</small>' +
      '<div class="episode-language-list">' + (languageOptions || '<span class="muted">No authorized viewing link available.</span>') + '</div>' +
    '</div></article>';
}

function renderSeason(season, anime) {
  const episodes = Array.isArray(season.episodes) ? season.episodes : [];
  return '<section class="episode-season-visual">' +
    '<div class="episode-season-heading"><div><p class="eyebrow">SEASON ' + Number(season.number) + '</p><h3>' + esc(season.title || ("Season " + Number(season.number))) + '</h3></div><span>' + episodes.length + (episodes.length === 1 ? ' episode' : ' episodes') + '</span></div>' +
    '<div class="episode-list-visual">' + episodes.map(episode => episodeCard(episode, season, anime)).join("") + '</div>' +
  '</section>';
}

async function load() {
  const id = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    $("#detail-state").textContent = "Invalid anime link.";
    return;
  }

  try {
    const response = await fetch("/api/anilist?action=detail&id=" + encodeURIComponent(id), {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load anime details.");

    const anime = data.anime;
    const title = titleOf(anime);
    document.title = title + " — AniVira";
    $("#detail-title").textContent = title;
    $("#detail-alt-title").textContent = [anime.title?.romaji, anime.title?.native]
      .filter(value => value && value !== title).join(" · ");
    $("#detail-cover").src = anime.coverImage?.large || "";
    $("#detail-cover").alt = title + " poster";

    if (anime.bannerImage) {
      $("#detail-banner").src = anime.bannerImage;
      $("#detail-banner").hidden = false;
    }
    $("#detail-meta").textContent = [
      anime.format,
      anime.season && anime.seasonYear ? anime.season + " " + anime.seasonYear : anime.seasonYear,
      anime.episodes ? anime.episodes + " episodes" : "",
      anime.averageScore ? "Score " + anime.averageScore + "/100" : "",
      anime.status
    ].filter(Boolean).join(" · ");

    $("#detail-genres").innerHTML = (anime.genres || [])
      .map(genre => '<span class="genre-chip">' + esc(genre) + '</span>').join("");
    $("#detail-description").textContent = anime.descriptionText || "No synopsis available.";
    $("#anilist-link").href = "https://anilist.co/anime/" + id;

    const seasons = Array.isArray(data.seasons) ? data.seasons : [];
    let html = seasons.map(season => renderSeason(season, anime)).join("");

    if (anime.sources?.length) {
      html += '<section class="episode-season-visual"><div class="episode-season-heading"><div><p class="eyebrow">ADDITIONAL SOURCES</p><h3>Other available videos</h3></div></div><div class="episode-list-visual">' +
        anime.sources.map(source =>
          '<article class="episode-card-visual legacy-source"><div class="episode-thumb-wrap"><img class="episode-thumb" loading="lazy" src="' + esc(anime.coverImage?.large || "") + '" alt="' + esc(title) + ' poster"></div><div class="episode-card-info"><strong>' + esc(source.label || "Video") + '</strong><small>' + esc([source.language, source.quality].filter(Boolean).join(" · ")) + '</small><div class="episode-language-list"><a class="episode-language" href="/watch?id=' + Number(source.id) + '">Watch episode / video ↗</a></div></div></article>'
        ).join("") + '</div></section>';
    }

    $("#detail-sources").innerHTML = html || '<p class="muted">No available episodes have been added yet.</p>';
    $("#detail-state").hidden = true;
    $("#anime-detail").hidden = false;
  } catch (error) {
    $("#detail-state").textContent = error?.message || "This anime has no available episodes yet.";
  }
}

load();
