const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let anime = [];
async function api(body) {
  const response = await fetch("/api/admin", {method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body),credentials:"same-origin"});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "Request failed."); error.status = response.status; throw error; }
  return data;
}
function message(value) { $("#admin-message").textContent = value; }
function displayLogin() { $("#login-panel").hidden = false; $("#dashboard").hidden = true; }
function displayDashboard() { $("#login-panel").hidden = true; $("#dashboard").hidden = false; }
async function refresh() {
  const data = await api({action:"list"});
  anime = data.anime || [];
  $("#managed-anime").innerHTML = anime.map((item) => '<div class="managed-row"><div><strong>' + esc(item.title) + '</strong><small>AniList ID ' + Number(item.anilist_id) + "</small></div><button class=\"small-danger\" type=\"button\" data-remove=\"" + Number(item.anilist_id) + '\">Remove</button></div>').join("") || '<p class="admin-muted">No anime added yet.</p>';
  $("#source-anime").innerHTML = '<option value="">Choose anime</option>' + anime.map((item) => '<option value="' + Number(item.anilist_id) + '">' + esc(item.title) + "</option>").join("");
  $("#managed-sources").innerHTML = (data.sources || []).map((source) => '<div class="managed-row"><div><strong>' + esc(source.label) + '</strong><small>' + esc(source.anime_title || "Anime") + " · " + esc(source.url) + "</small></div><button class=\"small-danger\" type=\"button\" data-source-remove=\"" + Number(source.id) + '\">Remove</button></div>').join("") || '<p class="admin-muted">No video links yet.</p>';
}
async function checkSession() {
  try { await refresh(); displayDashboard(); }
  catch (error) {
    if (error.status === 401) displayLogin();
    else { displayLogin(); $("#login-error").textContent = "Studio is not ready. Check the D1 and Vercel environment configuration."; }
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api({action:"login",password:$("#password").value});
    $("#password").value = "";
    displayDashboard();
    await refresh();
  } catch (error) {
    $("#login-error").textContent = error.message;
  }
});
$("#logout").addEventListener("click", async () => {
  try { await api({action:"logout"}); location.reload(); }
  catch (error) { message(error.message); }
});
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((tab) => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
  $("#anime-tab").hidden = button.dataset.tab !== "anime";
  $("#sources-tab").hidden = button.dataset.tab !== "sources";
}));
$("#anime-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const box = $("#anime-results");
  box.textContent = "Searching AniList…";
  try {
    const response = await fetch("/api/anilist?action=search&q=" + encodeURIComponent($("#anime-query").value.trim()), {headers:{"accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AniList search failed.");
    box.innerHTML = (data.items || []).map((item) => {
      const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
      const exists = anime.some((entry) => Number(entry.anilist_id) === Number(item.id));
      return '<div class="admin-result"><img src="' + esc(item.coverImage?.medium || "") + '" alt=""><div><strong>' + esc(title) + '</strong><small>' + esc([item.format, item.seasonYear].filter(Boolean).join(" · ")) + '</small></div><button type="button" data-add="' + Number(item.id) + '"' + (exists ? " disabled" : "") + ">" + (exists ? "Added" : "Add") + "</button></div>";
    }).join("") || '<p class="admin-muted">No anime found.</p>';
  } catch (error) { box.textContent = error.message; }
});
document.addEventListener("click", async (event) => {
  const add = event.target.closest("[data-add]");
  const remove = event.target.closest("[data-remove]");
  const removeSource = event.target.closest("[data-source-remove]");
  try {
    if (add) { await api({action:"addAnime",anilistId:Number(add.dataset.add)}); message("Anime metadata imported from AniList."); await refresh(); add.textContent = "Added"; add.disabled = true; }
    if (remove) { await api({action:"removeAnime",anilistId:Number(remove.dataset.remove)}); message("Anime and its viewing links were removed."); await refresh(); }
    if (removeSource) { await api({action:"removeSource",id:Number(removeSource.dataset.sourceRemove)}); message("Video link removed."); await refresh(); }
  } catch (error) { message(error.message); }
});
$("#source-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api({action:"addSource",anilistId:Number($("#source-anime").value),label:$("#source-label").value.trim(),url:$("#source-url").value.trim(),language:$("#source-language").value.trim(),quality:$("#source-quality").value.trim(),authorized:$("#source-authorized").checked});
    event.target.reset();
    message("Authorized YouTube link saved.");
    await refresh();
  } catch (error) { message(error.message); }
});
checkSession();