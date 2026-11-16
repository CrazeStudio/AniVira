(()=>{
const base=()=>String(localStorage.getItem("anivira_api_base")||window.ANIVIRA_API_BASE||"").replace(/\/$/,"");
const get=async path=>{const b=base();if(!b)return null;const r=await fetch(b+path);if(!r.ok)throw Error("API unavailable");return r.json()};
const norm=a=>({id:String(a.id),title:a.title||"Untitled",alt:a.title_english||"",image:a.poster_url||"",banner:a.banner_url||"",year:a.release_year||a.season||"—",type:a.format||"Anime",episodes:a.episode_count??"?",score:a.score??null,url:a.official_url||"",synopsis:a.synopsis||"",genres:a.genres||[]});
const load=async(q="")=>{const r=await get("/api/anime?limit=60&offset=0"+(q?"&q="+encodeURIComponent(q):""));return (r?.data||[]).map(norm)};
const oldHome=window.renderHome;
window.renderHome=async()=>{await oldHome();try{const a=await load();if(a.length){homeContent.insertAdjacentHTML("afterbegin",shelf("AniVira catalogue",a,"Curated in the AniVira database"));bindCards(homeContent)}}catch{}};
const oldExplore=window.renderExplore;
window.renderExplore=async()=>{await oldExplore();try{const a=await load();const c=document.getElementById("catalogue");if(c&&a.length){c.insertAdjacentHTML("afterbegin",a.map(card).join(""));bindCards(c)}}catch{}};
const oldDetails=window.openDetails;
window.openDetails=async(id,fromSave=false)=>{
 if(!isNaN(Number(id)))return oldDetails(id,fromSave);
 modal.classList.add("open");document.getElementById("modalContent").innerHTML='<div class="loading">Loading catalogue entry…</div>';
 try{const r=await get("/api/anime/"+encodeURIComponent(id));const a=norm(r.data);const details=r.data;
 document.getElementById("modalHero").style.backgroundImage=a.banner?'url("'+esc(a.banner)+'")':'linear-gradient(120deg,#30213f,#171320)';
 const genres=(details.genres||[]).map(g=>'<span class="chip">'+esc(typeof g==="string"?g:g.name)+'</span>').join("");
 const episodes=(details.episodes||[]).map(e=>'<div style="padding:10px;border-bottom:1px solid #ffffff15">Episode '+esc(e.episode_number)+' · '+esc(e.title||"")+'</div>').join("");
 const sources=(details.sources||[]).map(s=>'<a class="secondary" style="display:inline-flex;margin:4px;text-decoration:none" target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(s.provider)+' · '+esc(s.language||s.source_type)+' ↗</a>').join("");
 document.getElementById("modalContent").innerHTML='<div class="eyebrow">ANIVIRA CATALOGUE</div><h2>'+esc(a.title)+'</h2><div class="meta"><span class="score">★ '+(a.score??"NR")+'</span><span>'+esc(a.type)+'</span><span>'+esc(a.year)+'</span><span>'+esc(a.episodes)+' episodes</span></div><div class="chips">'+genres+'</div><p>'+esc(a.synopsis)+'</p><div class="actions"><button class="primary" id="saveCloud">＋ Add to my list</button>'+(a.url?'<a class="secondary" href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">Official info ↗</a>':"")+'</div>'+(episodes?'<h3>Episodes</h3>'+episodes:"")+(sources?'<h3>Official & authorized sources</h3>'+sources:"");
 document.getElementById("saveCloud").onclick=()=>{const found=watchlist.some(x=>itemId(x)===String(id));watchlist=found?watchlist.filter(x=>itemId(x)!==String(id)):[...watchlist,a];localStorage.setItem("anivira-watchlist",JSON.stringify(watchlist));document.getElementById("saveCloud").textContent=found?"＋ Add to my list":"✓ In your list"};
 }catch{document.getElementById("modalContent").innerHTML='<div class="empty">Could not load this anime.</div>'}
};
let wait;searchInput.addEventListener("input",()=>{clearTimeout(wait);const q=searchInput.value.trim();if(q.length<2||!base())return;wait=setTimeout(async()=>{try{const a=await load(q);if(a.length){searchResults.insertAdjacentHTML("afterbegin",'<div style="grid-column:1/-1;color:#c4a9ff;font-weight:800">ANI VIRA DATABASE</div>'+a.map(card).join(""));bindCards(searchResults)}}catch{}},700)});
if(currentPage==="home"){load().then(a=>{if(a.length&&currentPage==="home"){homeContent.insertAdjacentHTML("afterbegin",shelf("AniVira catalogue",a,"Curated in the AniVira database"));bindCards(homeContent)}}).catch(()=>{})}
})();