(() => {
  const $ = (s) => document.querySelector(s);
  const fileInput = $("#completed-json-file");
  const resolveButton = $("#resolve-completed-json");
  const downloadButton = $("#download-completed-json");
  const importButton = $("#import-completed-selected");
  const rowsRoot = $("#completed-import-rows");
  const statusNode = $("#completed-import-status");
  const countNode = $("#completed-import-count");
  if (!fileInput || !resolveButton || !rowsRoot) return;
  let sourceJson = null, entries = [], resolving = false, importing = false;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const titleOf = (x) => x?.title?.english || x?.title?.romaji || x?.title?.native || "Untitled";
  const norm = (s) => String(s || "").normalize("NFKD").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  const score = (a,b) => {
    const x=norm(a), y=norm(b); if(!x||!y)return 0; if(x===y)return 1;
    if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length)*.94;
    const aa=new Set(x.split(" ")),bb=new Set(y.split(" ")),overlap=[...aa].filter(t=>bb.has(t)).length;
    return (2*overlap/(aa.size+bb.size))*.88;
  };
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function anilistSearch(title) {
    const query = "query ($search: String) { Page(perPage: 8) { media(type: ANIME, search: $search, sort: SEARCH_MATCH) { id title { english romaji native } format seasonYear episodes status coverImage { medium } } } }";
    const response=await fetch("https://graphql.anilist.co",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({query,variables:{search:title}}),signal:AbortSignal.timeout(15000)});
    const data=await response.json(); if(!response.ok||data.errors)throw new Error("AniList search failed");
    return data.data?.Page?.media||[];
  }
  function selectedCount(){return entries.filter(x=>x.selectedId&&!x.imported).length;}
  function updateCount(){const selected=selectedCount(),imported=entries.filter(x=>x.imported).length;countNode.textContent=selected+" selected · "+imported+" imported · "+entries.length+" total";importButton.disabled=importing||selected===0;downloadButton.disabled=!sourceJson||!entries.length;}
  function renderRow(item,index){
    const candidates=item.candidates||[],chosen=item.selectedId?String(item.selectedId):"";
    const options=candidates.map(x=>'<option value="'+Number(x.id)+'" '+(String(x.id)===chosen?"selected":"")+'>'+esc(titleOf(x))+' · '+Number(x.id)+(x.seasonYear?" · "+Number(x.seasonYear):"")+'</option>').join("");
    const selected=candidates.find(x=>Number(x.id)===Number(item.selectedId));
    const state=item.imported?"Imported into catalogue":item.error?item.error:selected?(item.confidence>=.94?"Strong title match — check the edition":"Possible match — verify manually"):item.resolved?"No confident match. Select a result or leave unselected.":"Waiting for AniList lookup";
    const stateClass=item.imported||(selected&&item.confidence>=.94)?"good":"warn";
    return '<article class="completed-import-row" data-row="'+index+'"><img loading="lazy" src="'+esc(selected?.coverImage?.medium||candidates[0]?.coverImage?.medium||"")+'" alt=""><div><strong>'+(index+1)+'. '+esc(item.title)+'</strong><small>'+esc(item.platform||"Source not specified")+' · '+esc(item.completion_status||"Completion not verified")+'</small><small class="match-state '+stateClass+'">'+esc(state)+'</small></div><select data-match="'+index+'" aria-label="AniList match for '+esc(item.title)+'" '+(item.imported?"disabled":"")+'><option value="">Do not import / no match</option>'+options+'</select></article>';
  }
  function render(){rowsRoot.innerHTML=entries.map(renderRow).join("");updateCount();}
  fileInput.addEventListener("change",async()=>{
    const file=fileInput.files?.[0];sourceJson=null;entries=[];rowsRoot.innerHTML="";resolveButton.disabled=true;downloadButton.disabled=true;importButton.disabled=true;
    if(!file){statusNode.textContent="Choose a JSON file to begin.";return;}
    if(file.size>1500000){statusNode.textContent="File is too large. Maximum size is 1.5 MB.";return;}
    try{
      const parsed=JSON.parse(await file.text());
      if(!parsed||!Array.isArray(parsed.entries)||parsed.entries.length<1||parsed.entries.length>300)throw new Error("Expected an object with an entries array containing 1–300 anime.");
      if(parsed.entries.some(x=>!x||typeof x.title!=="string"||!x.title.trim()))throw new Error("Every entry must have a non-empty title.");
      sourceJson=parsed;entries=parsed.entries.map((x,i)=>({...x,originalIndex:i,title:x.title.trim(),candidates:[],selectedId:Number.isSafeInteger(Number(x.anilist_id))&&Number(x.anilist_id)>0?Number(x.anilist_id):null,resolved:false,confidence:0,imported:false,error:""}));
      statusNode.textContent="Loaded "+entries.length+" titles from "+file.name+". Resolve matches to AniList before importing.";resolveButton.disabled=false;render();
    }catch(error){statusNode.textContent=error.message||"Could not read this JSON file.";}
  });
  resolveButton.addEventListener("click",async()=>{
    if(resolving||!entries.length)return;resolving=true;resolveButton.disabled=true;resolveButton.textContent="Resolving…";let done=0;
    for(const item of entries){
      if(item.resolved&&!item.error){done++;continue;}
      statusNode.textContent="Searching AniList: "+(done+1)+"/"+entries.length+" — "+item.title;
      try{
        const candidates=await anilistSearch(item.title);item.candidates=candidates;
        const ranked=candidates.map(x=>({x,s:Math.max(score(item.title,x.title?.english),score(item.title,x.title?.romaji),score(item.title,x.title?.native))})).sort((a,b)=>b.s-a.s);
        if(!item.selectedId&&ranked.length&&ranked[0].s>=.72){item.selectedId=Number(ranked[0].x.id);item.confidence=ranked[0].s;}
        else if(item.selectedId){const existing=candidates.find(x=>Number(x.id)===Number(item.selectedId));if(existing)item.confidence=Math.max(score(item.title,existing.title?.english),score(item.title,existing.title?.romaji));else item.selectedId=null;}
        item.resolved=true;item.error="";
      }catch(error){item.error="AniList lookup failed — retry later";}
      done++;render();await wait(850);
    }
    resolving=false;resolveButton.disabled=false;resolveButton.textContent="Resolve again / retry failed";statusNode.textContent="Lookup finished. Review every selected match; season, movie, and franchise entries can have similar titles.";updateCount();
  });
  rowsRoot.addEventListener("change",event=>{
    const select=event.target.closest("[data-match]");if(!select)return;const item=entries[Number(select.dataset.match)];item.selectedId=select.value?Number(select.value):null;
    const chosen=item.candidates.find(x=>Number(x.id)===item.selectedId);item.confidence=chosen?Math.max(score(item.title,chosen.title?.english),score(item.title,chosen.title?.romaji),score(item.title,chosen.title?.native)):0;render();
  });
  downloadButton.addEventListener("click",()=>{
    if(!sourceJson)return;
    const corrected={...sourceJson,updated_at:new Date().toISOString().slice(0,10),entries:entries.map(({originalIndex,candidates,resolved,confidence,imported,error,selectedId,...entry})=>{
      const match=candidates.find(x=>Number(x.id)===Number(selectedId));
      return {...entry,...(selectedId&&match?{anilist_id:Number(match.id),anilist_title:titleOf(match),anilist_url:"https://anilist.co/anime/"+Number(match.id)+"/",cover_image:match.coverImage?.medium||""}:{anilist_id:null,anilist_title:null,anilist_url:null,cover_image:null})};
    })};
    const blob=new Blob([JSON.stringify(corrected,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="completed-anime-100-anilist-corrected.json";a.click();URL.revokeObjectURL(url);
  });
  async function adminPost(body){
    const response=await fetch("/api/admin",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Studio request failed.");return data;
  }
  importButton.addEventListener("click",async()=>{
    if(importing)return;const chosen=entries.filter(x=>x.selectedId&&!x.imported);if(!chosen.length)return;
    if(!confirm("Import "+chosen.length+" selected AniList entries into Managed anime? This adds metadata only; it does not add episodes or video sources."))return;
    importing=true;updateCount();let success=0,failed=0;
    for(let i=0;i<chosen.length;i++){
      const item=chosen[i];statusNode.textContent="Importing "+(i+1)+"/"+chosen.length+": "+item.title;
      try{await adminPost({action:"addAnime",anilistId:Number(item.selectedId)});item.imported=true;success++;}
      catch(error){item.error=error.message||"Import failed";failed++;}
      render();
    }
    importing=false;statusNode.textContent="Import complete: "+success+" added or updated, "+failed+" failed. Download the corrected JSON to preserve the AniList IDs.";updateCount();
    const managed=document.querySelector("#managed-anime");if(managed)managed.innerHTML='<p class="admin-muted">Reload the Studio page to refresh the managed-anime list and statistics.</p>';
  });
})();