const $ = selector => document.querySelector(selector);

function setStatus(message) {
  const state = $("#watch-state");
  state.textContent = message;
  state.hidden = false;
  $("#watch-content").hidden = true;
}

function sourceForLanguage(episode, language) {
  const sources = Array.isArray(episode?.sources) ? episode.sources : [];
  if (!sources.length) return null;
  const wanted = String(language || "").trim().toLowerCase();
  return sources.find(source => String(source.language || "").trim().toLowerCase() === wanted) || sources[0];
}

function addOption(select, value, label) {
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = label;
  select.append(option);
}

function makeEpisodeNavigation(episodes, currentIndex, language) {
  const nav = document.createElement("nav");
  nav.className = "episode-navigation";
  nav.setAttribute("aria-label", "Episode navigation");

  const previous = currentIndex > 0 ? sourceForLanguage(episodes[currentIndex - 1], language) : null;
  const next = currentIndex >= 0 && currentIndex < episodes.length - 1
    ? sourceForLanguage(episodes[currentIndex + 1], language)
    : null;

  const addLink = (source, label, className) => {
    if (!source?.id) {
      const spacer = document.createElement("span");
      spacer.setAttribute("aria-hidden", "true");
      nav.append(spacer);
      return;
    }
    const link = document.createElement("a");
    link.className = "outline-link";
    link.href = "/watch?id=" + encodeURIComponent(Number(source.id));
    link.textContent = label;
    nav.append(link);
  };

  addLink(previous, "← Previous episode", "previous");
  addLink(next, "Next episode →", "next");
  return nav;
}

async function load() {
  const id = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    setStatus("Invalid viewing link.");
    return;
  }

  try {
    const response = await fetch("/api/anilist?action=source&id=" + encodeURIComponent(id), {
      headers: { Accept: "application/json" }
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response. Please try again.");
    }
    if (!response.ok) throw new Error(data?.error || "This video is unavailable.");

    const source = data?.source;
    if (!source || !source.embedUrl || !source.youtubeUrl) {
      throw new Error("This video link is incomplete or unavailable.");
    }

    const player = $("#youtube-player");
    player.src = source.embedUrl;
    player.title = (source.anime_title || "AniVira") + " — " + (source.label || "Episode");

    $("#youtube-open").href = source.youtubeUrl;
    $("#watch-title").textContent = [source.anime_title, source.label].filter(Boolean).join(" — ");
    $("#watch-details").textContent = [
      source.season_number ? "Season " + source.season_number : "",
      source.episode_number ? "Episode " + source.episode_number : "",
      source.language || "",
      source.quality || "",
      "YouTube"
    ].filter(Boolean).join(" · ");
    $("#watch-back").href = "/anime?id=" + encodeURIComponent(Number(source.anilist_id));

    const languages = Array.isArray(source.currentSources) ? source.currentSources : [];
    const episodes = Array.isArray(source.episodeList) ? source.episodeList : [];
    const currentEpisodeId = Number(source.episodeId);
    const currentIndex = episodes.findIndex(episode => Number(episode.id) === currentEpisodeId);
    const currentEpisode = currentIndex >= 0 ? episodes[currentIndex] : null;
    const languageSelect = $("#watch-language");
    const episodeSelect = $("#watch-episode");

    languageSelect.replaceChildren();
    languages.forEach(item => {
      if (!Number(item.id)) return;
      const label = [item.language || "Default audio", item.quality].filter(Boolean).join(" · ");
      addOption(languageSelect, Number(item.id), label);
    });
    languageSelect.value = String(Number(source.id));
    languageSelect.disabled = languageSelect.options.length < 2;

    episodeSelect.replaceChildren();
    episodes.forEach(episode => {
      const matchingSource = Number(episode.id) === currentEpisodeId\n        ? { id: Number(source.id) }\n        : sourceForLanguage(episode, source.language);
      if (!matchingSource?.id) return;
      const title = "Episode " + Number(episode.number) + (episode.title ? " · " + episode.title : "");
      addOption(episodeSelect, Number(matchingSource.id), title);
    });
    episodeSelect.value = String(Number(source.id));
    episodeSelect.disabled = episodeSelect.options.length < 2;

    $("#watch-controls").hidden = languageSelect.options.length < 2 && episodeSelect.options.length < 2;

    const oldNavigation = $(".episode-navigation");
    if (oldNavigation) oldNavigation.remove();
    if (currentIndex >= 0 && episodes.length > 1) {
      $("#watch-content").append(makeEpisodeNavigation(episodes, currentIndex, source.language));
    }

    $("#watch-state").hidden = true;
    $("#watch-content").hidden = false;
    document.title = (source.label || "Watch") + " — AniVira";
  } catch (error) {
    setStatus(error?.message || "This video is unavailable. Please try again.");
  }
}

$("#watch-language").addEventListener("change", event => {
  const sourceId = Number(event.target.value);
  if (Number.isSafeInteger(sourceId) && sourceId > 0) {
    location.href = "/watch?id=" + encodeURIComponent(sourceId);
  }
});

$("#watch-episode").addEventListener("change", event => {
  const sourceId = Number(event.target.value);
  if (Number.isSafeInteger(sourceId) && sourceId > 0) {
    location.href = "/watch?id=" + encodeURIComponent(sourceId);
  }
});

load();
