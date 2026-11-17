const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function card(a) {
  const title = a.title?.english || a.title?.romaji || a.title?.native || "Untitled";
  const meta = [a.format, a.seasonYear, a.averageScore ? a.averageScore + "/100" : ""].filter(Boolean).join(" · ");
  return '<a class="anime-card" href="/anime?id=' + Number(a.id) + '" aria-label="View ' + esc(title) + '"><div class="poster-wrap"><img class="poster" loading="lazy" decoding="async" src="' + esc(a.coverImage?.large || "") + '" alt="' + esc(title) + ' poster"></div><div class="anime-title">' + esc(title) + '</div><div class="anime-meta">' + esc(meta) + "</div></a>";
}
$("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("#query").value.trim();
  if (!query) return;
  $("#search-status").textContent = "Searching AniList…";
  $("#results").innerHTML = "";
  try {
    const response = await fetch("/api/anilist?action=search&q=" + encodeURIComponent(query), {headers: {"accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Search failed.");
    $("#search-status").textContent = (data.items || []).length + " results";
    $("#results").innerHTML = (data.items || []).map(card).join("") || '<p class="empty">No anime found. Try another title.</p>';
  } catch (error) {
    $("#search-status").textContent = "Search is temporarily unavailable. Please try again.";
  }
});