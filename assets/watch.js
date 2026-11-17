const $ = (s) => document.querySelector(s);
async function loadVideo() {
  const id = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isSafeInteger(id) || id < 1) { $("#watch-state").textContent = "This viewing link is not valid."; return; }
  try {
    const response = await fetch("/api/anilist?action=source&id=" + id, {headers: {"accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Video is unavailable.");
    const source = data.source;
    $("#youtube-player").src = source.embedUrl;
    $("#youtube-open").href = source.youtubeUrl;
    $("#watch-title").textContent = source.anime_title + " — " + source.label;
    $("#watch-details").textContent = [source.language, source.quality, "YouTube"].filter(Boolean).join(" · ");
    $("#watch-back").href = "/anime?id=" + Number(source.anilist_id);
    $("#watch-state").hidden = true;
    $("#watch-content").hidden = false;
    document.title = source.label + " — AniVira";
  } catch (error) {
    $("#watch-state").textContent = "This video link is unavailable. It may have been removed or restricted by YouTube.";
  }
}
loadVideo();