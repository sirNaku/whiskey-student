/* Whiskey Student, Phase 1 (personal use).
   Everything is stored on this device in IndexedDB: entries, photos, field notes,
   and (from v1.2) the Plan tab: calendar, idea bank, strategy and settings. */
(() => {
"use strict";
const APP_VERSION = "1.2.0";
const wideMQ = matchMedia("(min-width: 1000px)");
const isWide = () => wideMQ.matches;

/* ---------------- reference data ---------------- */
const CATEGORIES = ["Bourbon","Rye","Tennessee Whiskey","Wheated Bourbon","American Single Malt","Single Malt Scotch","Blended Malt Scotch","Blended Scotch","Single Grain","Irish Single Pot Still","Irish Single Malt","Irish Blend","Japanese Whisky","Canadian Whisky","World Whisky","Other"];
const COLORS = [["Pale Straw","#F2E2A0"],["Light Gold","#EAC96A"],["Gold","#DCAD44"],["Deep Gold","#CE9330"],["Amber","#BB7922"],["Deep Amber","#A4601A"],["Copper","#8D4B17"],["Russet","#733914"],["Mahogany","#592A10"],["Treacle","#3D1C0B"]];
const AXES = [["sweet","Sweet"],["fruit","Fruit"],["floral","Floral"],["spice","Spice"],["oak","Oak"],["smoke","Smoke & Peat"],["grain","Grain"],["nutty","Nutty & Rich"]];
const WHEEL = {
  "Sweet":["vanilla","caramel","honey","brown sugar","maple","toffee","butterscotch","molasses","candy corn"],
  "Fruit":["green apple","baked apple","pear","cherry","dark cherry","orange peel","lemon zest","banana","apricot","stone fruit","raisin","fig","dates","tropical fruit"],
  "Floral & Herbal":["heather","rose","honeysuckle","fresh-cut grass","mint","eucalyptus","hay"],
  "Spice":["cinnamon","clove","nutmeg","black pepper","rye spice","ginger","baking spice","anise","allspice"],
  "Oak & Wood":["charred oak","toasted oak","cedar","sawdust","pencil shavings","tobacco leaf","leather","oak tannin"],
  "Grain":["cornbread","malted barley","biscuit","bread dough","porridge","cereal","popcorn"],
  "Smoke & Maritime":["peat smoke","campfire","ash","iodine","sea salt","brine","smoked meat","medicinal"],
  "Nutty & Rich":["almond","hazelnut","walnut","marzipan","dark chocolate","milk chocolate","espresso","sherry","dried fruit cake"],
  "Other":["ethanol heat","solvent","sulfur","mineral","earthy","mushroom","new make"]
};
const SENSES = [["nose","Nose","What you smell before sipping. Nose it at the rim, then deeper in the glass."],["palate","Palate","Flavor, sweetness, heat and texture on the tongue."],["finish","Finish","What lingers after you swallow, and how it changes."]];
const NOTE_TYPES = ["Idea","Improvement","Bug","Feature","Observation"];
const NOTE_AREAS = ["General","Journal list","The bottle","The distillery","The pour","Nose / palate / finish","Flavor profile","Verdict","Personal notes","Photos","Data & backup","Phase 2"];
const MAX_PHOTOS = 6;

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = p => (p || "t") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
const fmtDate = s => { if (!s) return ""; const [y,m,d] = s.slice(0,10).split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString(undefined, {year:"numeric", month:"short", day:"numeric"}); };
const fmtStamp = iso => { try { return new Date(iso).toLocaleString(undefined, {month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"}); } catch { return iso; } };
const colorHex = i => (i === "" || i == null) ? "transparent" : (COLORS[i] || [null,"transparent"])[1];
const proofOf = abv => { const v = Number(abv); return v ? (v*2).toFixed(1).replace(/\.0$/, "") : ""; };
const clone = o => JSON.parse(JSON.stringify(o));

let toastTimer;
function toast(msg, action){
  const t = $("#toast"); clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : "");
  if (action) $("button", t).onclick = () => { t.hidden = true; action.run(); };
  t.hidden = false; toastTimer = setTimeout(() => t.hidden = true, action ? 8000 : 3200);
}

/* ---------------- storage (IndexedDB) ---------------- */
const DB_NAME = "whiskey-student", DB_VER = 2;
let idb;
function openDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("entries")) d.createObjectStore("entries", {keyPath:"id"});
      if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", {keyPath:"id"}).createIndex("entryId", "entryId");
      if (!d.objectStoreNames.contains("notes")) d.createObjectStore("notes", {keyPath:"id"});
      if (!d.objectStoreNames.contains("content")) d.createObjectStore("content", {keyPath:"id"});
      if (!d.objectStoreNames.contains("ideas")) d.createObjectStore("ideas", {keyPath:"id"});
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv", {keyPath:"key"});
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function store(name, mode = "readonly"){ return idb.transaction(name, mode).objectStore(name); }
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const all = name => req(store(name).getAll());
const put = (name, v) => req(store(name, "readwrite").put(v));
const del = (name, k) => req(store(name, "readwrite").delete(k));
const getOne = (name, k) => req(store(name).get(k));

/* in-memory mirrors */
let entries = [], notes = [];
async function loadAll(){ entries = await all("entries"); notes = await all("notes"); await loadPlan(); }

async function saveEntry(e){ e.updatedAt = new Date().toISOString(); if (!e.createdAt) e.createdAt = e.updatedAt; await put("entries", clone(e));
  const i = entries.findIndex(x => x.id === e.id); if (i >= 0) entries[i] = clone(e); else entries.push(clone(e)); }
async function deleteEntry(id){
  const e = entries.find(x => x.id === id);
  for (const pid of (e?.photos || [])) await del("photos", pid);
  await del("entries", id); entries = entries.filter(x => x.id !== id);
}
async function saveNote(n){ n.updatedAt = new Date().toISOString(); await put("notes", clone(n));
  const i = notes.findIndex(x => x.id === n.id); if (i >= 0) notes[i] = clone(n); else notes.push(clone(n)); }
async function deleteNote(id){ await del("notes", id); notes = notes.filter(x => x.id !== id); }

/* photo URLs, cached per session */
const urlCache = new Map();
async function photoURL(id){
  if (urlCache.has(id)) return urlCache.get(id);
  const p = await getOne("photos", id); if (!p) return null;
  const u = URL.createObjectURL(p.blob); urlCache.set(id, u); return u;
}

/* resize a camera photo to a sensible size before storing */
async function resizePhoto(file, max = 1600){
  let src;
  try { src = await createImageBitmap(file, {imageOrientation:"from-image"}); }
  catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w*k); c.height = Math.round(h*k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.85));
}

/* ---------------- navigation ---------------- */
let route = {name:"journal"};       // journal | entry | edit | notes | data | plan | item
let draft = null, dirty = false;
const listState = {q:"", cat:"", sort:"date"};

function go(next, {push = true} = {}){
  if (route.name === "edit" && dirty && next.name !== "edit") {
    toast("You have unsaved changes.", {label:"Discard", run:() => { dirty = false; draft = null; go(next, {push}); }});
    return;
  }
  route = next;
  if (push) history.pushState(next, "");
  render(); window.scrollTo({top:0});
}
window.addEventListener("popstate", ev => {
  const next = ev.state || {name:"journal"};
  if (route.name === "edit" && dirty) { history.pushState(route, ""); toast("You have unsaved changes.", {label:"Discard", run:() => { dirty = false; draft = null; go(next, {push:false}); }}); return; }
  route = next; render(); window.scrollTo({top:0});
});
$$(".tabs button").forEach(b => b.onclick = () => {
  const t = b.dataset.tab;
  if (t === "new") { if (route.name === "edit" && dirty) return toast("Save or cancel this entry first."); draft = blank(); dirty = false; go({name:"edit", id:draft.id, isNew:true}); }
  else go({name:t});
});

function setHeader({eyebrow = "Tasting journal", title = null, back = false, actions = ""} = {}){
  $("#eyebrow").textContent = eyebrow;
  $("#title").innerHTML = title == null ? `Whiskey <span>Student</span>` : esc(title);
  $("#backBtn").hidden = !back;
  $("#topActions").innerHTML = actions;
  const tab = route.name === "entry" ? "journal" : route.name === "edit" ? (route.isNew ? "new" : "journal") : route.name === "item" ? "plan" : route.name;
  $$(".tabs button").forEach(b => b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
}
$("#backBtn").onclick = () => history.length > 1 ? history.back() : go({name:"journal"});

function render(){
  if (isWide() && entries.length && (route.name === "journal" || route.name === "entry")) return renderSplit();
  $("#view").innerHTML = "";
  if (route.name === "entry") return renderEntry();
  if (route.name === "edit") return renderEditor();
  if (route.name === "notes") return renderNotes();
  if (route.name === "data") return renderData();
  if (route.name === "plan") return renderPlan();
  if (route.name === "item") return renderItem();
  return renderJournal();
}

/* ---------------- iPad split view: list beside the open entry ---------------- */
function renderSplit(){
  if (route.name === "journal") {
    const first = filtered()[0] || entries[0];
    route = {name:"entry", id:first.id}; history.replaceState(route, "");
  }
  const keep = $("#listPane")?.scrollTop || 0;
  $("#view").innerHTML = `<div class="split"><aside class="pane-list" id="listPane" aria-label="Your pours"></aside><section class="pane-detail" id="detailPane"></section></div>`;
  renderJournal();
  $("#listPane").scrollTop = keep;
  renderEntry();
}
function selectEntry(id){
  if (route.name === "entry" && route.id === id) return;
  route = {name:"entry", id}; history.pushState(route, "");
  $$("#list .item").forEach(b => b.setAttribute("aria-current", String(b.dataset.id === id)));
  renderEntry(); $("#detailPane")?.scrollTo?.({top:0});
}
wideMQ.addEventListener("change", () => { if (route.name !== "edit" && route.name !== "item") render(); });

/* keyboard shortcuts for the Magic Keyboard */
document.addEventListener("keydown", ev => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s" && route.name === "edit") { ev.preventDefault(); $("#ef")?.requestSubmit(); return; }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === "n") { ev.preventDefault(); $('.tabs [data-tab="new"]').click(); }
  else if (ev.key === "p") { ev.preventDefault(); go({name:"plan"}); }
  else if (ev.key === "/") { if (route.name !== "journal" && route.name !== "entry") go({name:"journal"}); setTimeout(() => $("#q")?.focus(), 0); ev.preventDefault(); }
  else if (ev.key === "e" && route.name === "entry") { $("#editBtn")?.click(); }
  else if ((ev.key === "ArrowDown" || ev.key === "ArrowUp" || ev.key === "j" || ev.key === "k") && isWide() && route.name === "entry") {
    const ids = filtered().map(e => e.id); const i = ids.indexOf(route.id);
    const next = ids[i + ((ev.key === "ArrowDown" || ev.key === "j") ? 1 : -1)];
    if (next) { ev.preventDefault(); selectEntry(next); $(`#list .item[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({block:"nearest"}); }
  }
});

/* ---------------- radar ---------------- */
function radar(p){
  const cx = 170, cy = 160, R = 105, n = AXES.length;
  const pt = (i, r) => { const a = -Math.PI/2 + i*2*Math.PI/n; return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]; };
  let s = `<svg viewBox="-40 0 420 320" role="img" aria-label="Flavor profile: ${AXES.map(([k,l]) => l + " " + (Number(p?.[k])||0)).join(", ")}">`;
  for (let k = 1; k <= 5; k++) s += `<polygon class="ring" points="${AXES.map((_,i) => pt(i, R*k/5).join(",")).join(" ")}"/>`;
  AXES.forEach((_, i) => { const [x,y] = pt(i, R); s += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; });
  const pts = AXES.map(([k], i) => pt(i, R*(Number(p?.[k])||0)/5));
  s += `<polygon class="shape" points="${pts.map(q => q.join(",")).join(" ")}"/>`;
  pts.forEach(q => s += `<circle class="pt" cx="${q[0]}" cy="${q[1]}" r="3"/>`);
  AXES.forEach(([k,l], i) => { const [x,y] = pt(i, R+22); const a = Math.abs(x-cx) < 6 ? "middle" : x > cx ? "start" : "end";
    s += `<text x="${x}" y="${y}" text-anchor="${a}" dominant-baseline="middle">${l} <tspan class="val">${Number(p?.[k])||0}</tspan></text>`; });
  return s + `</svg>`;
}

/* ---------------- journal list ---------------- */
function filtered(){
  const q = listState.q.trim().toLowerCase();
  const list = entries.filter(e => (!listState.cat || e.category === listState.cat) &&
    (!q || [e.name,e.distillery,e.bottler,e.region,e.country,e.category,e.thoughts,e.cask,(e.nose||{}).text,(e.palate||{}).text,(e.finish||{}).text,...((e.nose||{}).tags||[]),...((e.palate||{}).tags||[]),...((e.finish||{}).tags||[])].join(" ").toLowerCase().includes(q)));
  const by = listState.sort;
  list.sort((a,b) => by === "score" ? (Number(b.score)||0) - (Number(a.score)||0) : by === "name" ? (a.name||"").localeCompare(b.name||"") : (b.date||"").localeCompare(a.date||"") || (b.updatedAt||"").localeCompare(a.updatedAt||""));
  return list;
}

function renderJournal(){
  setHeader();
  const v = $("#listPane") || $("#view");
  if (!entries.length) {
    v.innerHTML = `<div class="empty"><h2>Your first pour is waiting</h2>
      <p>Log the bottle, its distillery, the color, what you smell and taste, and your verdict. Add photos of the bottle and label as you go.</p>
      <div class="btnrow" style="justify-content:center"><button class="btn primary" type="button" id="firstBtn">Start a tasting</button>
      <button class="btn" type="button" id="importLink">Import a backup</button></div></div>`;
    $("#firstBtn").onclick = () => { draft = blank(); dirty = false; go({name:"edit", id:draft.id, isNew:true}); };
    $("#importLink").onclick = () => go({name:"data"});
    return;
  }
  const dist = new Set(entries.map(e => (e.distillery||"").trim().toLowerCase()).filter(Boolean)).size;
  v.innerHTML = `
    <div class="summary"><span><b style="color:var(--ink)">${entries.length}</b> pour${entries.length>1?"s":""} · <b style="color:var(--ink)">${dist}</b> distiller${dist===1?"y":"ies"}</span></div>
    <div class="tools">
      <input class="field-s" id="q" type="search" placeholder="Search whiskey, distillery, flavors" aria-label="Search entries" value="${esc(listState.q)}">
      <select class="field-s" id="cat" aria-label="Filter by category"><option value="">All</option>${CATEGORIES.map(c => `<option ${c===listState.cat?"selected":""}>${esc(c)}</option>`).join("")}</select>
      <select class="field-s" id="sort" aria-label="Sort"><option value="date">Newest</option><option value="score" ${listState.sort==="score"?"selected":""}>Top score</option><option value="name" ${listState.sort==="name"?"selected":""}>A–Z</option></select>
    </div>
    <ul class="list" id="list"></ul>`;
  $("#q").oninput = e => { listState.q = e.target.value; drawList(); };
  $("#cat").onchange = e => { listState.cat = e.target.value; drawList(); };
  $("#sort").onchange = e => { listState.sort = e.target.value; drawList(); };
  drawList();
}
async function drawList(){
  const ul = $("#list"); if (!ul) return;
  const list = filtered();
  if (!list.length) { ul.innerHTML = `<li style="padding:20px;color:var(--muted)">Nothing matches that search.</li>`; return; }
  ul.innerHTML = list.map(e => `<li><button class="item" type="button" data-id="${esc(e.id)}" aria-current="${isWide() && route.name === "entry" && route.id === e.id}">
    <span class="thumb" data-thumb="${esc((e.photos||[])[0]||"")}"><span class="glass" style="background:${colorHex(e.color)}"></span></span>
    <span style="min-width:0"><div class="nm">${esc(e.name || "Untitled pour")}</div><div class="meta">${esc([e.distillery, fmtDate(e.date)].filter(Boolean).join(" · "))}</div></span>
    <span class="sc">${esc(e.score ?? "")}</span></button></li>`).join("");
  $$(".item", ul).forEach(b => b.onclick = () => isWide() ? selectEntry(b.dataset.id) : go({name:"entry", id:b.dataset.id}));
  for (const t of $$("[data-thumb]", ul)) { const id = t.dataset.thumb; if (!id) continue; const u = await photoURL(id); if (u) t.innerHTML = `<img src="${u}" alt="">`; }
}

/* ---------------- entry view ---------------- */
async function renderEntry(){
  const e = entries.find(x => x.id === route.id);
  if (!e) { route = {name:"journal"}; return render(); }
  const split = !!$("#detailPane");
  setHeader(split ? {actions:`<button class="btn small" type="button" id="editTop">Edit</button>`} : {eyebrow: e.category || "Whiskey", title: e.name || "Untitled pour", back:true,
    actions:`<button class="btn small" type="button" id="editTop">Edit</button>`});
  $("#editTop").onclick = () => { draft = clone(e); dirty = false; go({name:"edit", id:e.id}); };
  const abv = Number(e.abv);
  const fact = (k, v) => v ? `<div><div class="label">${k}</div><div class="v">${esc(v)}</div></div>` : "";
  const sense = key => { const s = e[key] || {}; const lbl = SENSES.find(x => x[0] === key)[1];
    const extra = key === "finish" && e.finishLength ? ` · ${esc(e.finishLength)}` : key === "palate" && e.mouthfeel ? ` · ${esc(e.mouthfeel)}` : "";
    if (!s.text && !(s.tags||[]).length && !extra) return "";
    return `<div class="sense"><div class="label">${lbl}${extra}</div>${s.text ? `<p>${esc(s.text)}</p>` : ""}<div class="chips">${(s.tags||[]).map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div></div>`; };
  const kvl = rows => { const r = rows.filter(([,v]) => v); return r.length ? `<dl class="kv">${r.map(([k,v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="muted" style="margin:0">Nothing recorded yet.</p>`; };
  const hasProfile = AXES.some(([k]) => Number(e.profile?.[k]));

  ($("#detailPane") || $("#view")).innerHTML = `<article class="page">
    <div class="eh">
      <div style="min-width:0"><h2>${esc(e.name || "Untitled pour")}</h2>
        <div class="by">${esc([e.distillery, e.region, e.country].filter(Boolean).join(" · "))}</div></div>
      ${e.score !== "" && e.score != null ? `<div class="score"><div class="n">${esc(e.score)}</div><div class="of">/ 100</div></div>` : ""}
    </div>
    ${(e.photos||[]).length ? `<div class="gallery" id="gallery"></div>` : ""}
    <div class="facts">
      ${fact("Tasted", fmtDate(e.date))}
      ${fact("ABV / Proof", abv ? `${abv}% · ${proofOf(abv)}` : "")}
      ${fact("Age", e.age)}${fact("Cask", e.cask)}${fact("Mash bill", e.mashbill)}${fact("Batch / Barrel", e.batch)}${fact("Price", e.price)}${fact("Bottler", e.bottler)}
    </div>
    <div class="cols"><div class="col">
    <section class="sec" style="margin-top:0"><h3><span class="k">I</span>Tasting notes</h3>
      ${e.color !== "" && e.color != null ? `<div class="sense"><div class="label">Appearance</div><div class="colorbar"><span class="sw" style="background:${colorHex(e.color)}"></span><div><b>${esc(COLORS[e.color][0])}</b><div class="muted" style="font-size:14px">${esc([e.legs ? "Legs: " + e.legs : "", e.appearance].filter(Boolean).join(" · "))}</div></div></div></div>` : ""}
      ${sense("nose")}${sense("palate")}${sense("finish")}
    </section></div><div class="col">
    ${hasProfile ? `<section class="sec"><h3><span class="k">II</span>Flavor profile</h3><div class="radar">${radar(e.profile)}</div></section>` : ""}
    <section class="sec"><h3><span class="k">III</span>Verdict</h3>${kvl([["Score", e.score !== "" && e.score != null ? e.score + " / 100" : ""],["Buy again", e.buyAgain],["Value", e.value],["Channel verdict", e.verdict],["Website", e.showOnSite ? "Public" + (e.siteNo ? " · No. " + e.siteNo : "") : ""]])}</section></div></div>
    <div class="cols"><div class="col">
    <section class="sec"><h3><span class="k">IV</span>The distillery</h3>
      ${kvl([["Distillery",e.distillery],["Location",e.distLocation],["Founded",e.founded],["Master distiller",e.masterDistiller],["Stills",e.stills],["Water source",e.water],["Owner",e.owner]])}
      ${e.distNotes ? `<p style="white-space:pre-wrap">${esc(e.distNotes)}</p>` : ""}</section>
    </div><div class="col"><section class="sec"><h3><span class="k">V</span>The pour</h3>${kvl([["Glassware",e.glass],["Served",e.serve],["Where",e.setting],["Source",e.source],["Bottle size",e.size]])}</section></div></div>
    ${e.thoughts || e.learned || e.pairing ? `<section class="sec"><h3><span class="k">VI</span>Personal notes</h3>
      ${e.thoughts ? `<div class="notesbox">${esc(e.thoughts)}</div>` : ""}
      ${e.learned ? `<div class="sense"><div class="label">What I learned</div><p>${esc(e.learned)}</p></div>` : ""}
      ${e.pairing ? `<div class="sense"><div class="label">Pairing</div><p>${esc(e.pairing)}</p></div>` : ""}</section>` : ""}
    ${e.episode || e.contentNotes ? `<section class="sec"><h3><span class="k">VII</span>For the channel</h3>${kvl([["Episode / post",e.episode],["Content notes",e.contentNotes]])}</section>` : ""}
    <div class="foot" id="foot">
      <button class="btn primary" type="button" id="editBtn">Edit entry</button>
      <button class="btn" type="button" id="againBtn">Log another pour</button>
      <button class="btn ghost danger" type="button" id="delBtn">Delete</button>
    </div></article>`;

  $("#editBtn").onclick = $("#editTop").onclick;
  $("#againBtn").onclick = () => {
    const c = clone(e);
    Object.assign(c, {id:uid(), date:today(), createdAt:"", score:"", buyAgain:"", value:"", photos:[], nose:{text:"",tags:[]}, palate:{text:"",tags:[]}, finish:{text:"",tags:[]},
      mouthfeel:"", finishLength:"", profile:Object.fromEntries(AXES.map(([k]) => [k,0])), thoughts:"", learned:"", episode:"", contentNotes:"", color:e.color,
      verdict:"", showOnSite:false, siteBlurb:"", siteNo:null});
    draft = c; dirty = true; go({name:"edit", id:c.id, isNew:true});
  };
  $("#delBtn").onclick = () => {
    $("#foot").innerHTML = `<div class="confirm">Delete this entry and its photos for good?
      <button class="btn danger" type="button" id="delYes">Delete</button><button class="btn ghost" type="button" id="delNo">Keep</button></div>`;
    $("#delNo").onclick = renderEntry;
    $("#delYes").onclick = async () => { await deleteEntry(e.id); toast("Entry deleted."); route = {name:"journal"}; history.replaceState(route, ""); render(); };
  };
  if ((e.photos||[]).length) {
    const g = $("#gallery");
    for (const pid of e.photos) { const u = await photoURL(pid); if (u) { const img = document.createElement("img"); img.src = u; img.alt = "Photo of " + (e.name || "this whiskey"); img.onclick = () => lightbox(u); g.appendChild(img); } }
  }
}
function lightbox(u){
  const d = document.createElement("div"); d.className = "lightbox";
  d.innerHTML = `<img src="${u}" alt=""><button class="iconbtn" type="button" aria-label="Close">✕</button>`;
  d.onclick = () => d.remove(); document.body.appendChild(d);
}

/* ---------------- editor ---------------- */
function blank(){
  return { id:uid(), date:today(), name:"", category:"", distillery:"", country:"", region:"", bottler:"", mashbill:"", age:"", abv:"", cask:"", batch:"", price:"", size:"750 ml", source:"",
    distLocation:"", founded:"", masterDistiller:"", stills:"", water:"", owner:"", distNotes:"",
    glass:"Glencairn", serve:"Neat", setting:"", color:"", legs:"", appearance:"", photos:[],
    nose:{text:"",tags:[]}, palate:{text:"",tags:[]}, finish:{text:"",tags:[]}, mouthfeel:"", finishLength:"",
    profile:Object.fromEntries(AXES.map(([k]) => [k,0])), score:"", buyAgain:"", value:"", verdict:"", thoughts:"", learned:"", pairing:"", episode:"", contentNotes:"",
    showOnSite:false, siteBlurb:"", siteNo:null };
}
/* fill in any fields missing from older or imported entries */
function normalize(e){
  const b = blank(); const out = Object.assign(b, e);
  for (const k of ["nose","palate","finish"]) out[k] = Object.assign({text:"",tags:[]}, e[k] || {});
  out.profile = Object.assign(b.profile, e.profile || {});
  out.photos = Array.isArray(e.photos) ? e.photos : [];
  return out;
}

async function renderEditor(){
  if (!draft || draft.id !== route.id) { const e = entries.find(x => x.id === route.id); draft = e ? clone(e) : blank(); dirty = false; }
  const E = draft; const isNew = !entries.find(x => x.id === E.id);
  setHeader({eyebrow: isNew ? "New tasting" : "Editing", title: E.name || "Untitled pour", back:true});

  const inp = (k, l, o = {}) => `<div class="f${o.wide?" wide":""}"><label for="f-${k}">${l}</label><input id="f-${k}" data-k="${k}" type="${o.type||"text"}" ${o.mode?`inputmode="${o.mode}"`:""} ${o.step?`step="${o.step}"`:""} placeholder="${esc(o.ph||"")}" value="${esc(E[k])}" autocomplete="off">${o.after||""}</div>`;
  const ta = (k, l, ph) => `<div class="f wide"><label for="f-${k}">${l}</label><textarea id="f-${k}" data-k="${k}" placeholder="${esc(ph||"")}">${esc(E[k])}</textarea></div>`;
  const sel = (k, l, opts) => `<div class="f"><label for="f-${k}">${l}</label><select id="f-${k}" data-k="${k}"><option value="">Choose…</option>${opts.map(o => `<option ${o===E[k]?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
  const seg = (k, l, opts) => `<div class="f wide"><span class="flabel">${l}</span><div class="seg" role="radiogroup" aria-label="${l}">${opts.map((o,i) => `<label><input type="radio" name="r-${k}" id="r-${k}-${i}" data-k="${k}" value="${esc(o)}" ${o===E[k]?"checked":""}>${esc(o)}</label>`).join("")}</div></div>`;
  const STEPS = [["s1","Bottle"],["s2","Photos"],["s3","Distillery"],["s4","Pour"],["s5","Tasting"],["s6","Profile"],["s7","Verdict"],["s8","Notes"]];

  $("#view").innerHTML = `
    <div class="editor"><nav class="steps" aria-label="Sections">${STEPS.map(([id,l],i) => `<a href="#${id}"><span class="k">${i+1}</span>${l}</a>`).join("")}</nav>
    <form id="ef" novalidate>
      <section class="sec" id="s1"><h3><span class="k">1</span>The bottle</h3>
        <div class="fg">
          ${inp("name","Whiskey name",{wide:true,ph:"e.g. Redbreast 12 Year Old"})}
          ${sel("category","Category",CATEGORIES)}
          ${inp("date","Date tasted",{type:"date"})}
          ${inp("country","Country",{ph:"Ireland"})}
          ${inp("region","Region / State",{ph:"County Cork"})}
          ${inp("age","Age statement",{ph:"12 years or NAS"})}
          ${inp("abv","ABV %",{type:"number",step:"0.1",mode:"decimal",ph:"40",after:`<span class="derived" id="proofOut"></span>`})}
          ${inp("bottler","Brand / Bottler",{ph:"Distillery or independent"})}
          ${inp("mashbill","Mash bill / Grain",{wide:true,ph:"e.g. 75% corn, 13% rye, 12% malted barley"})}
          ${inp("cask","Cask / Finish",{wide:true,ph:"New charred oak, ex-bourbon, oloroso sherry…"})}
          ${inp("batch","Batch / Barrel no.")}
          ${inp("price","Price paid",{ph:"$65"})}
          ${inp("size","Bottle size",{ph:"750 ml"})}
          ${sel("source","How you tasted it",["Own bottle","Bar pour","Sample","Distillery tour","Tasting event","Friend's bottle"])}
        </div></section>

      <section class="sec" id="s2"><h3><span class="k">2</span>Photos</h3>
        <p class="hint">Front label, back label, the pour in the glass. The first photo is the cover. Up to ${MAX_PHOTOS}.</p>
        <div class="photos-ed" id="photosEd"></div>
        <div class="btnrow">
          <label class="btn filebtn"><input type="file" accept="image/*" capture="environment" id="camIn">Take photo</label>
          <label class="btn filebtn"><input type="file" accept="image/*" multiple id="libIn">Choose from library</label>
        </div></section>

      <section class="sec" id="s3"><h3><span class="k">3</span>The distillery</h3>
        <p class="hint">Fill in what you know or research. Over time this becomes your study file on each producer.</p>
        <div class="fg">
          ${inp("distillery","Distillery",{ph:"Midleton Distillery"})}
          ${inp("distLocation","Location",{ph:"Midleton, County Cork"})}
          ${inp("founded","Founded")}
          ${inp("masterDistiller","Master distiller / blender")}
          ${sel("stills","Still type",["Pot still","Column still","Pot & column","Hybrid still","Unknown"])}
          ${inp("water","Water source")}
          ${inp("owner","Parent company")}
          ${ta("distNotes","Distillery notes","History, production details, what sets their process apart, tour notes")}
        </div></section>

      <section class="sec" id="s4"><h3><span class="k">4</span>The pour</h3>
        <div class="fg">
          ${sel("glass","Glassware",["Glencairn","Copita / Nosing glass","NEAT glass","Tulip","Rocks glass","Snifter"])}
          ${sel("serve","Served",["Neat","A few drops of water","Neat, then water","Large cube","On the rocks","In a cocktail"])}
          ${inp("setting","Setting",{wide:true,ph:"Home bar, studio, distillery, on location"})}
        </div>
        <div class="f wide" style="margin-top:14px"><span class="flabel">Color: <b id="colorName" style="color:var(--ink)">${E.color !== "" && E.color != null ? esc(COLORS[E.color][0]) : "tap the closest match"}</b></span>
          <div class="swatches" id="swatches">${COLORS.map(([n,h],i) => `<button type="button" data-i="${i}" aria-label="${n}" aria-pressed="${String(E.color)===String(i)}" style="background:${h}"></button>`).join("")}</div></div>
        <div class="fg" style="margin-top:12px">${seg("legs","Legs / Viscosity",["Thin, fast","Medium","Thick, slow"])}${inp("appearance","Other appearance notes",{wide:true,ph:"Clarity, haze, sediment"})}</div>
      </section>

      <section class="sec" id="s5"><h3><span class="k">5</span>Nose, palate, finish</h3>
        <p class="hint">Write it in your own words, then tap descriptors from the flavor wheel. Tags make entries searchable.</p>
        ${SENSES.map(([k,l,h]) => `<div class="sense-ed" data-sense="${k}"><h4>${l}</h4><p class="hint" style="margin:0 0 8px">${h}</p>
          <div class="sense-cols"><div><div class="f"><textarea id="s-${k}" data-sense-text="${k}" aria-label="${l} notes" placeholder="${l} notes">${esc(E[k].text)}</textarea></div>
          ${k==="palate" ? `<div style="margin-top:10px">${seg("mouthfeel","Mouthfeel",["Thin","Light","Medium","Oily","Creamy","Chewy","Drying"])}</div>` : ""}
          ${k==="finish" ? `<div style="margin-top:10px">${seg("finishLength","Finish length",["Short","Medium","Long","Very long"])}</div>` : ""}
          <div class="picked chips" data-picked="${k}"></div></div>
          <div class="wheel">${Object.entries(WHEEL).map(([g,ts]) => `<details><summary>${g}</summary><div class="chips">${ts.map(t => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div></details>`).join("")}</div></div>
        </div>`).join("")}
      </section>

      <section class="sec" id="s6"><h3><span class="k">6</span>Flavor profile</h3>
        <p class="hint">Rate each family from 0 (absent) to 5 (dominant).</p>
        <div class="profile"><div class="radar" id="liveRadar">${radar(E.profile)}</div>
        <div class="sliders">${AXES.map(([k,l]) => `<div class="sl"><label for="p-${k}">${l}</label><input type="range" id="p-${k}" data-p="${k}" min="0" max="5" step="1" value="${Number(E.profile?.[k])||0}"><output id="o-${k}">${Number(E.profile?.[k])||0}</output></div>`).join("")}</div></div>
      </section>

      <section class="sec" id="s7"><h3><span class="k">7</span>Verdict</h3>
        <div class="f wide"><label for="f-score">Score out of 100</label>
          <div class="scorebox"><input type="range" id="f-score" min="50" max="100" step="1" value="${E.score || 80}"><span class="big" id="scoreOut">${E.score || "—"}</span></div>
          <span class="derived">50–69 pass · 70–79 decent · 80–84 good · 85–89 very good · 90–94 outstanding · 95+ classic</span></div>
        <div class="fg" style="margin-top:12px">${seg("buyAgain","Would you buy it again?",["Yes","Maybe","No"])}${seg("value","Value for the price",["Steal","Fair","Pricey","Overpriced"])}
          ${seg("verdict","Channel verdict",["Buy","Bar Pour","Pass"])}</div>
        <div class="site-box">
          <label class="check"><input type="checkbox" id="f-site" ${E.showOnSite ? "checked" : ""}> <span><b>Show on my website</b><br><span class="muted small">Adds this pour to the public tasting log next time you publish. Personal notes never go public.</span></span></label>
          <div class="f wide" id="blurbBox" ${E.showOnSite ? "" : "hidden"}><label for="f-siteBlurb">Website blurb (optional, public)</label><textarea id="f-siteBlurb" data-k="siteBlurb" placeholder="One or two sentences for the website">${esc(E.siteBlurb)}</textarea></div>
        </div>
      </section>

      <section class="sec" id="s8"><h3><span class="k">8</span>Personal notes</h3>
        <div class="fg">
          ${ta("thoughts","Your thoughts","Overall impression, how it opened up with time or water, how it compares to others")}
          ${ta("learned","What I learned","A new fact, technique or term this pour taught you")}
          ${inp("pairing","Pairing",{wide:true,ph:"Food, cigar, or cocktail it would suit"})}
          ${inp("episode","Episode / post",{wide:true,ph:"Video title, IG post, or link"})}
          ${ta("contentNotes","Content notes","B-roll ideas, talking points, hook")}
        </div></section>

      <div class="formbar"><span class="msg" id="formMsg"></span>
        <button class="btn ghost" type="button" id="cancelBtn">Cancel</button>
        <button class="btn primary" type="submit" id="saveBtn">Save entry</button></div>
    </form></div>`;

  const f = $("#ef");
  const mark = () => { dirty = true; };
  const proof = () => { $("#proofOut").textContent = proofOf(E.abv) ? proofOf(E.abv) + " US proof" : ""; };
  proof();
  $$("[data-k]", f).forEach(el => el.addEventListener(el.type === "radio" ? "change" : "input", () => {
    E[el.dataset.k] = el.value; mark();
    if (el.dataset.k === "abv") proof();
    if (el.dataset.k === "name") $("#title").textContent = el.value || "Untitled pour";
  }));
  $$(".steps a").forEach(a => a.onclick = ev => { ev.preventDefault(); $(a.getAttribute("href")).scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); });

  /* photos */
  const drawPhotos = async () => {
    const box = $("#photosEd"); box.innerHTML = "";
    for (const [i, pid] of E.photos.entries()) {
      const u = await photoURL(pid); if (!u) continue;
      const d = document.createElement("div"); d.className = "ph";
      d.innerHTML = `<img src="${u}" alt="Photo ${i+1}">${i===0?'<span class="cover">Cover</span>':""}<button type="button" class="rm" aria-label="Remove photo ${i+1}">×</button>`;
      $(".rm", d).onclick = () => { E.photos = E.photos.filter(x => x !== pid); mark(); drawPhotos(); };
      if (i > 0) $("img", d).onclick = () => { E.photos = [pid, ...E.photos.filter(x => x !== pid)]; mark(); drawPhotos(); };
      box.appendChild(d);
    }
    if (!E.photos.length) box.innerHTML = `<p class="muted" style="grid-column:1/-1;margin:0;font-size:14px">No photos yet.</p>`;
    else if (E.photos.length > 1) box.insertAdjacentHTML("beforeend", `<p class="muted" style="grid-column:1/-1;margin:0;font-size:13px">Tap a photo to make it the cover.</p>`);
  };
  const addFiles = async files => {
    const room = MAX_PHOTOS - E.photos.length;
    if (room <= 0) return toast(`Up to ${MAX_PHOTOS} photos per entry.`);
    $("#formMsg").textContent = "Adding photos…";
    for (const file of [...files].slice(0, room)) {
      try { const blob = await resizePhoto(file); const id = uid("p"); await put("photos", {id, entryId:E.id, blob, createdAt:new Date().toISOString()}); E.photos.push(id); mark(); }
      catch { toast("One photo couldn't be read. Try a JPEG or PNG."); }
    }
    $("#formMsg").textContent = ""; drawPhotos();
  };
  $("#camIn").onchange = ev => { addFiles(ev.target.files); ev.target.value = ""; };
  $("#libIn").onchange = ev => { addFiles(ev.target.files); ev.target.value = ""; };
  drawPhotos();

  /* color */
  $$("#swatches button").forEach(b => b.onclick = () => {
    E.color = Number(b.dataset.i); mark();
    $$("#swatches button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#colorName").textContent = COLORS[E.color][0];
  });

  /* senses */
  const syncWheel = k => $$(`[data-sense="${k}"] [data-tag]`).forEach(c => c.setAttribute("aria-pressed", String(E[k].tags.includes(c.dataset.tag))));
  const drawPicked = k => {
    const box = $(`[data-picked="${k}"]`);
    box.innerHTML = E[k].tags.length ? E[k].tags.map(t => `<button type="button" class="chip" data-un="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)}</button>`).join("") : `<span class="muted" style="font-size:14px">No descriptors tagged yet.</span>`;
    $$("[data-un]", box).forEach(c => c.onclick = () => { E[k].tags = E[k].tags.filter(t => t !== c.dataset.un); mark(); drawPicked(k); syncWheel(k); });
  };
  SENSES.forEach(([k]) => {
    drawPicked(k); syncWheel(k);
    $(`[data-sense-text="${k}"]`).addEventListener("input", ev => { E[k].text = ev.target.value; mark(); });
    $$(`[data-sense="${k}"] [data-tag]`).forEach(c => c.onclick = () => {
      const t = c.dataset.tag; E[k].tags = E[k].tags.includes(t) ? E[k].tags.filter(x => x !== t) : [...E[k].tags, t]; mark(); drawPicked(k); syncWheel(k);
    });
  });

  /* profile & score */
  $$("[data-p]", f).forEach(r => r.addEventListener("input", () => {
    E.profile[r.dataset.p] = Number(r.value); $("#o-" + r.dataset.p).textContent = r.value; $("#liveRadar").innerHTML = radar(E.profile); mark();
  }));
  $("#f-score").addEventListener("input", ev => { E.score = Number(ev.target.value); $("#scoreOut").textContent = ev.target.value; mark(); });
  $("#f-site").addEventListener("change", ev => { E.showOnSite = ev.target.checked; $("#blurbBox").hidden = !E.showOnSite; mark(); });

  $("#cancelBtn").onclick = () => { dirty = false; const to = isNew ? {name:"journal"} : {name:"entry", id:E.id}; draft = null; cleanupOrphans(); go(to); };
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!E.name.trim()) { $("#formMsg").textContent = "Add the whiskey's name to save."; $("#f-name").focus(); return; }
    $("#saveBtn").disabled = true; $("#formMsg").textContent = "Saving…";
    try {
      await saveEntry(E); dirty = false; draft = null; await cleanupOrphans();
      toast("Saved " + E.name + ".");
      route = {name:"entry", id:E.id}; history.replaceState(route, ""); render(); window.scrollTo({top:0});
    } catch (err) {
      $("#saveBtn").disabled = false;
      $("#formMsg").textContent = (err && err.name === "QuotaExceededError") ? "This device is out of storage for this app. Export a backup and remove old photos." : "Couldn't save. Try again.";
    }
  });
}

/* remove photos that no saved entry or open draft points to */
async function cleanupOrphans(){
  const keep = new Set(entries.flatMap(e => e.photos || []));
  if (draft) (draft.photos || []).forEach(p => keep.add(p));
  const ids = await req(store("photos").getAllKeys());
  for (const id of ids) if (!keep.has(id)) { await del("photos", id); const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); } }
}

/* ---------------- field notes ---------------- */
let noteFilter = "Open";
function renderNotes(){
  setHeader({eyebrow:"Phase 1 log", title:"Field notes"});
  const v = $("#view");
  v.innerHTML = `
    <div class="notes-layout"><div class="nl-left">
    <form class="composer" id="nf">
      <label class="label" for="nText">What did you notice while using the journal?</label>
      <textarea id="nText" placeholder="e.g. I want a quick-add for bar pours with fewer fields"></textarea>
      <div class="row">
        <select id="nType" aria-label="Type">${NOTE_TYPES.map(t => `<option>${t}</option>`).join("")}</select>
        <select id="nArea" aria-label="Part of the app">${NOTE_AREAS.map(t => `<option>${t}</option>`).join("")}</select>
      </div>
      <button class="btn primary" type="submit">Add note</button>
    </form></div><div class="nl-right">
    <div class="filters" id="nFilters">${["Open","Done","All",...NOTE_TYPES].map(t => `<button type="button" data-f="${t}" aria-pressed="${t===noteFilter}">${t}</button>`).join("")}</div>
    <ul class="notes" id="nList"></ul></div></div>`;
  $("#nf").onsubmit = async ev => {
    ev.preventDefault();
    const text = $("#nText").value.trim(); if (!text) { $("#nText").focus(); return; }
    await saveNote({id:uid("n"), createdAt:new Date().toISOString(), type:$("#nType").value, area:$("#nArea").value, text, status:"Open"});
    $("#nText").value = ""; toast("Note added."); drawNotes();
  };
  $$("#nFilters button").forEach(b => b.onclick = () => { noteFilter = b.dataset.f; $$("#nFilters button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawNotes(); });
  drawNotes();
}
function drawNotes(){
  const ul = $("#nList"); if (!ul) return;
  const list = notes.filter(n => noteFilter === "All" ? true : noteFilter === "Open" || noteFilter === "Done" ? n.status === noteFilter : n.type === noteFilter)
    .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
  if (!list.length) { ul.innerHTML = `<li class="muted" style="padding:12px 2px">${notes.length ? "No notes in this view." : "No field notes yet. As you use the journal, jot down what works, what slows you down, and what you wish it did. These become the plan for Phase 2."}</li>`; return; }
  ul.innerHTML = list.map(n => `<li class="note ${n.status==="Done"?"done":""}" data-id="${esc(n.id)}">
    <div class="nh"><span class="pill t-${esc(n.type)}">${esc(n.type)}</span><span>${esc(n.area)}</span><span>·</span><span>${esc(fmtStamp(n.createdAt))}</span></div>
    <p>${esc(n.text)}</p>
    <div class="na"><button class="btn small ghost" type="button" data-act="toggle">${n.status==="Done"?"Reopen":"Mark done"}</button><button class="btn small ghost danger" type="button" data-act="del">Delete</button></div></li>`).join("");
  $$(".note", ul).forEach(li => {
    const n = notes.find(x => x.id === li.dataset.id);
    $('[data-act="toggle"]', li).onclick = async () => { n.status = n.status === "Done" ? "Open" : "Done"; await saveNote(n); drawNotes(); };
    $('[data-act="del"]', li).onclick = async () => { const keep = clone(n); await deleteNote(n.id); drawNotes(); toast("Note deleted.", {label:"Undo", run: async () => { await saveNote(keep); drawNotes(); }}); };
  });
}

/* =====================================================================
   PLAN: the HQ tools, now inside the app.
   Today (this week, shoots, follower goal), Calendar, Ideas, Strategy.
   Stored on this device in IndexedDB like everything else.
   ===================================================================== */
const PILLARS = ["Tasting & Reviews","Learning Journey POV","Head-to-Head","Education & How-To","History & Heritage","Distillery Visits"];
const PILLAR_KEY = {"Tasting & Reviews":"tasting","Learning Journey POV":"journey","Head-to-Head":"h2h","Education & How-To":"edu","History & Heritage":"history","Distillery Visits":"visits"};
const STATUSES = ["Idea","Planned","Scripted","Shot","Edited","Scheduled","Posted"];
const PLATFORMS = ["Instagram Reel","Instagram Reel + Short","Instagram Carousel","Instagram Story","Instagram Trial Reel","YouTube","YouTube Short","Shoot"];
const SERIES = ["Buy / Bar Pour / Pass","Blind Friday","Study Hall","Whiskey in 60","Lost Bottles","What I Got Wrong","Behind the Bar","Distillery Diaries","Ma-RYE-land","Journal Flip"];
const IG_GOAL = 1000, GOAL_DATE = "2027-01-31";
const CHECKPOINTS = [["2026-11-03",533],["2026-11-30",650],["2026-12-31",800],["2027-01-31",1000]];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const pkey = p => PILLAR_KEY[p] || "none";
const isoOf = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const dateOf = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const shortDate = s => s ? dateOf(s).toLocaleDateString(undefined, {weekday:"short", month:"short", day:"numeric"}) : "";
const fmtTime = t => { if (!t) return ""; const [h,m] = t.split(":").map(Number); if (isNaN(h)) return t; const d = new Date(2000,0,1,h,m||0); return d.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"}); };

let content = [], ideas = [], kv = {};
async function loadPlan(){
  content = await all("content"); ideas = await all("ideas");
  kv = Object.fromEntries((await all("kv")).map(r => [r.key, r.value]));
}
async function setKV(key, value){ kv[key] = value; await put("kv", {key, value: clone(value)}); }
async function saveItem(c){ c.updatedAt = new Date().toISOString(); if (!c.createdAt) c.createdAt = c.updatedAt; await put("content", clone(c));
  const i = content.findIndex(x => x.id === c.id); if (i >= 0) content[i] = clone(c); else content.push(clone(c)); }
async function deleteItem(id){ await del("content", id); content = content.filter(x => x.id !== id); }
async function saveIdea(x){ x.updatedAt = new Date().toISOString(); await put("ideas", clone(x));
  const i = ideas.findIndex(y => y.id === x.id); if (i >= 0) ideas[i] = clone(x); else ideas.push(clone(x)); }

/* first run of v1.2: load the strategy, growth plan, 60 ideas and the 12-week calendar */
async function seedPlan(){
  if (kv.seeded || !window.WS_SEED) return;
  const S = window.WS_SEED, now = new Date().toISOString();
  const tx = idb.transaction(["content","ideas","kv"], "readwrite");
  for (const c of S.content) tx.objectStore("content").put({...c, createdAt:now, updatedAt:"2026-11-10T00:00:00.000Z"});
  for (const x of S.ideas) tx.objectStore("ideas").put({...x, updatedAt:"2026-11-10T00:00:00.000Z"});
  for (const d of S.docs) tx.objectStore("kv").put({key:"doc:" + d.id, value:{...d, updatedAt:"2026-11-10T00:00:00.000Z"}});
  tx.objectStore("kv").put({key:"template", value:S.template});
  tx.objectStore("kv").put({key:"metrics", value:[{date:"2026-11-03", ig:533, yt:null}]});
  tx.objectStore("kv").put({key:"seeded", value:now});
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  await loadPlan();
}

let planTab = "today", weekOffset = 0, calMode = "month";
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
const planNav = () => `<div class="plan-nav" role="tablist" aria-label="Plan">${[["today","Today"],["calendar","Calendar"],["ideas","Ideas"],["strategy","Strategy"]].map(([k,l]) =>
  `<button type="button" role="tab" data-plan="${k}" aria-selected="${planTab===k}">${l}</button>`).join("")}</div>`;

function renderPlan(){
  if (route.sub) planTab = route.sub;
  setHeader({eyebrow:"Plan", title: {today:"This week", calendar:"Calendar", ideas:"Idea bank", strategy:"Strategy"}[planTab]});
  const v = $("#view");
  v.innerHTML = planNav() + `<div id="planBody"></div>`;
  $$(".plan-nav button").forEach(b => b.onclick = () => { planTab = b.dataset.plan; route = {name:"plan", sub:planTab}; history.replaceState(route, ""); renderPlan(); window.scrollTo({top:0}); });
  ({today:renderToday, calendar:renderCalendar, ideas:renderIdeas, strategy:renderStrategy})[planTab]();
}

const statusPill = s => `<span class="st st-${esc((s||"").toLowerCase())}">${esc(s)}</span>`;
const pillarDot = p => p ? `<span class="pdot p-${pkey(p)}" aria-hidden="true"></span>` : "";
const itemDate = c => c.platform === "Shoot" ? c.shootDate : c.postDate;
function openItem(id, preset){ go({name:"item", id: id || "", preset: preset || null}); }

/* ---------- Today ---------- */
function renderToday(){
  const body = $("#planBody");
  const now = new Date(), t = isoOf(now);
  const mon = addDays(mondayOf(now), weekOffset * 7);
  const days = Array.from({length:7}, (_, i) => addDays(mon, i));
  const template = kv.template || [];
  const bottles = new Set(entries.map(e => (e.name||"").trim().toLowerCase()).filter(Boolean)).size;

  // follower goal
  const metrics = (kv.metrics || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const lastIG = [...metrics].reverse().find(m => m.ig != null);
  const lastYT = [...metrics].reverse().find(m => m.yt != null);
  const ig = lastIG ? lastIG.ig : 533;
  const expected = (() => { for (let i = 1; i < CHECKPOINTS.length; i++) { const [d1,v1] = CHECKPOINTS[i]; const [d0,v0] = CHECKPOINTS[i-1];
      if (t <= d1) { const f = (dateOf(t) - dateOf(d0)) / (dateOf(d1) - dateOf(d0)); return Math.round(v0 + Math.max(0, Math.min(1, f)) * (v1 - v0)); } } return IG_GOAL; })();
  const next = CHECKPOINTS.find(([d]) => d >= t);
  const weeksLeft = Math.max(1, (dateOf(GOAL_DATE) - dateOf(t)) / (7 * 864e5));
  const perWeek = Math.max(0, Math.ceil((IG_GOAL - ig) / weeksLeft));
  const pct = Math.min(100, Math.round(ig / IG_GOAL * 100));
  const pace = ig >= IG_GOAL ? `<b class="ok">Goal reached.</b> Time for media kit v1.` : ig >= expected ? `<b class="ok">On pace</b> (target today ≈ ${expected}).` : `<b class="warn">${expected - ig} behind pace</b> (target today ≈ ${expected}). See Growth plan §9.`;

  // this week
  const weekHTML = days.map(d => {
    const ds = isoOf(d);
    const items = content.filter(c => itemDate(c) === ds).sort((a,b) => (a.time||"99").localeCompare(b.time||"99"));
    const used = new Set();
    const rows = [];
    for (const s of template.filter(s => s.day === d.getDay())) {
      const m = items.find(c => !used.has(c.id) && c.platform !== "Shoot" && (c.platform === s.platform || c.platform.startsWith(s.platform)));
      if (m) { used.add(m.id); rows.push(itemRow(m, s.time)); }
      else rows.push(`<li class="slot open"><span class="tm">${esc(fmtTime(s.time))}</span><span class="what"><span class="ti">${esc(s.slot)}</span><span class="meta">${esc(s.platform)} · open slot</span></span>
        <button class="btn small ghost" type="button" data-fill='${esc(JSON.stringify({postDate:ds, time:s.time, platform:s.platform}))}'>Fill</button></li>`);
    }
    items.filter(c => !used.has(c.id)).forEach(c => rows.push(itemRow(c, c.time)));
    return `<section class="day${ds===t?" is-today":""}"><h3>${DOW[d.getDay()]} <span class="muted">${d.toLocaleDateString(undefined,{month:"short", day:"numeric"})}</span></h3>
      ${rows.length ? `<ul class="slots">${rows.join("")}</ul>` : `<p class="muted none">Nothing planned.</p>`}</section>`;
  }).join("");

  const upcoming = content.filter(c => c.platform === "Shoot" && c.shootDate >= t && c.status !== "Posted").sort((a,b) => a.shootDate.localeCompare(b.shootDate));
  const shoot = upcoming[0];
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0])); content.filter(c => c.platform !== "Shoot").forEach(c => counts[c.status] = (counts[c.status]||0) + 1);
  const label = weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : "Week of " + mon.toLocaleDateString(undefined,{month:"short", day:"numeric"});

  body.innerHTML = `<div class="today">
    <div class="today-side">
      <div class="card goal o1"><div class="label">Instagram goal</div>
        <div class="goal-n"><span class="big">${ig}</span><span class="muted"> / ${IG_GOAL} followers</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${IG_GOAL}" aria-valuenow="${ig}" aria-label="Followers toward ${IG_GOAL}"><span style="width:${pct}%"></span></div>
        <p>${pace}</p>
        <p class="muted small">${ig < IG_GOAL ? `Needs about <b>${perWeek} a week</b> to reach ${IG_GOAL} by Jan 31.` : ""}${next && ig < IG_GOAL ? ` Next checkpoint: ${next[1]} by ${fmtDate(next[0])}.` : ""}${lastYT ? ` YouTube: <b>${lastYT.yt}</b> subscribers.` : ""}</p>
        <form class="logf" id="logF"><label class="sr" for="lgIG">Instagram followers</label><input id="lgIG" type="number" inputmode="numeric" min="0" placeholder="IG followers">
          <label class="sr" for="lgYT">YouTube subscribers</label><input id="lgYT" type="number" inputmode="numeric" min="0" placeholder="YT subs">
          <button class="btn small primary" type="submit">Log</button></form>
        <p class="muted small" style="margin:6px 0 0">${lastIG ? `Last logged ${fmtDate(lastIG.date)}.` : ""} Log on Sundays after the shoot.</p></div>
      <div class="card counter-c o4"><div class="label">Whiskey counter</div><div class="goal-n"><span class="big">${bottles}</span><span class="muted"> / 100 bottles</span></div>
        <div class="bar"><span style="width:${Math.min(100, bottles)}%"></span></div></div>
      <div class="card o3"><div class="label">Next shoot</div>
        ${shoot ? `<h3 class="sh-t"><button class="linkbtn" type="button" data-item="${esc(shoot.id)}">${esc(shoot.title)}</button></h3><p class="muted small" style="margin:2px 0 8px">${esc(shortDate(shoot.shootDate))}</p><p class="small" style="white-space:pre-wrap;margin:0">${esc(shoot.notes)}</p>`
          : `<p class="muted small">No shoot planned. Sunday is batch-shoot day.</p>`}</div>
      <div class="card o5"><div class="label">Pipeline</div><div class="pipe">${STATUSES.filter(s => s !== "Idea").map(s => `<div><b>${counts[s]||0}</b><span>${s}</span></div>`).join("")}</div></div>
    </div>
    <div class="today-main">
      <div class="wk-head"><h2>${label}</h2><div class="btnrow">
        <button class="btn small ghost" type="button" id="wkPrev" aria-label="Previous week">‹</button>
        ${weekOffset ? `<button class="btn small ghost" type="button" id="wkNow">This week</button>` : ""}
        <button class="btn small ghost" type="button" id="wkNext" aria-label="Next week">›</button>
        <button class="btn small" type="button" id="addPost">Plan a post</button></div></div>
      <div class="week">${weekHTML}</div>
    </div></div>`;

  $("#wkPrev").onclick = () => { weekOffset--; renderToday(); };
  $("#wkNext").onclick = () => { weekOffset++; renderToday(); };
  if ($("#wkNow")) $("#wkNow").onclick = () => { weekOffset = 0; renderToday(); };
  $("#addPost").onclick = () => openItem("", {});
  $$("[data-fill]", body).forEach(b => b.onclick = () => openItem("", JSON.parse(b.dataset.fill)));
  $$("[data-item]", body).forEach(b => b.onclick = () => openItem(b.dataset.item));
  $("#logF").onsubmit = async ev => {
    ev.preventDefault();
    const igv = $("#lgIG").value, ytv = $("#lgYT").value;
    if (igv === "" && ytv === "") { $("#lgIG").focus(); return; }
    const list = (kv.metrics || []).filter(m => m.date !== t);
    const prev = (kv.metrics || []).find(m => m.date === t) || {};
    list.push({date:t, ig: igv === "" ? (prev.ig ?? null) : Number(igv), yt: ytv === "" ? (prev.yt ?? null) : Number(ytv)});
    await setKV("metrics", list); toast("Logged."); renderToday();
  };
}
function itemRow(c, time){
  const shoot = c.platform === "Shoot";
  return `<li class="slot${shoot ? " shoot" : ""}"><span class="tm">${esc(fmtTime(time) || (shoot ? "Shoot" : ""))}</span>
    <button class="what" type="button" data-item="${esc(c.id)}">${pillarDot(c.pillar)}<span class="ti">${esc(c.title)}</span><span class="meta">${esc(shoot ? "Shoot day" : c.platform)}${c.series ? " · " + esc(c.series) : ""}</span></button>
    ${statusPill(c.status)}</li>`;
}

/* ---------- Calendar ---------- */
function renderCalendar(){
  const body = $("#planBody");
  const title = calMonth.toLocaleDateString(undefined, {month:"long", year:"numeric"});
  const chip = c => `<button type="button" class="chip-c p-${pkey(c.pillar)}${c.platform==="Shoot"?" shoot":""}${c.status==="Posted"?" posted":""}" data-item="${esc(c.id)}" title="${esc((c.platform==="Shoot"?"Shoot: ":c.platform + ": ") + c.title + " (" + c.status + ")")}">${c.platform==="Shoot" && !/shoot/i.test(c.title) ? "Shoot: " : ""}${esc(c.title)}</button>`;
  let html = `<div class="cal-head"><h2>${calMode === "month" ? esc(title) : "By status"}</h2><div class="btnrow">
    <div class="seg mini" role="group" aria-label="View"><button type="button" data-mode="month" aria-pressed="${calMode==="month"}">Month</button><button type="button" data-mode="board" aria-pressed="${calMode==="board"}">Board</button></div>
    ${calMode === "month" ? `<button class="btn small ghost" type="button" id="mPrev" aria-label="Previous month">‹</button><button class="btn small ghost" type="button" id="mNow">Today</button><button class="btn small ghost" type="button" id="mNext" aria-label="Next month">›</button>` : ""}
    <button class="btn small" type="button" id="calAdd">Plan a post</button></div></div>
    <div class="legend">${PILLARS.map(p => `<span>${pillarDot(p)}${esc(p)}</span>`).join("")}<span><span class="pdot dashed"></span>Shoot day</span></div>`;
  if (calMode === "board") {
    html += `<div class="board">${STATUSES.map(s => { const list = content.filter(c => c.status === s && c.platform !== "Shoot").sort((a,b) => (itemDate(a)||"9").localeCompare(itemDate(b)||"9"));
      return `<section class="col-b"><h3>${s} <span class="muted">${list.length}</span></h3>${list.map(c => `<button type="button" class="card-b p-${pkey(c.pillar)}" data-item="${esc(c.id)}"><b>${esc(c.title)}</b><span>${esc([c.platform, itemDate(c) && shortDate(itemDate(c))].filter(Boolean).join(" · "))}</span></button>`).join("")}</section>`; }).join("")}</div>`;
  } else if (matchMedia("(min-width: 820px)").matches) {
    const start = mondayOf(calMonth); const t = today();
    const lastDay = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0);
    const span = Math.round((addDays(mondayOf(lastDay), 6) - start) / 864e5) + 1;
    let cells = "";
    for (let i = 0; i < span; i++) {
      const d = addDays(start, i);
      const ds = isoOf(d); const list = content.filter(c => itemDate(c) === ds).sort((a,b) => (a.time||"99").localeCompare(b.time||"99"));
      cells += `<div class="cell${d.getMonth()!==calMonth.getMonth()?" out":""}${ds===t?" is-today":""}" data-day="${ds}"><span class="dn">${d.getDate()}</span>${list.map(chip).join("")}</div>`;
    }
    html += `<div class="cal">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x => `<div class="dow">${x}</div>`).join("")}${cells}</div>`;
  } else {
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate(); const t = today();
    let rows = "";
    for (let dd = 1; dd <= last; dd++) {
      const ds = isoOf(new Date(calMonth.getFullYear(), calMonth.getMonth(), dd));
      const list = content.filter(c => itemDate(c) === ds).sort((a,b) => (a.time||"99").localeCompare(b.time||"99"));
      if (list.length) rows += `<li${ds===t?' class="is-today"':""}><span class="ad">${esc(shortDate(ds))}</span><div class="ai">${list.map(chip).join("")}</div></li>`;
    }
    html += rows ? `<ul class="agenda">${rows}</ul>` : `<div class="empty"><p>Nothing planned this month.</p></div>`;
  }
  body.innerHTML = html;
  $$("[data-mode]", body).forEach(b => b.onclick = () => { calMode = b.dataset.mode; renderCalendar(); });
  if ($("#mPrev")) { $("#mPrev").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderCalendar(); };
    $("#mNext").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderCalendar(); };
    $("#mNow").onclick = () => { const d = new Date(); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); }; }
  $("#calAdd").onclick = () => openItem("", {});
  $$("[data-item]", body).forEach(b => b.onclick = ev => { ev.stopPropagation(); openItem(b.dataset.item); });
  $$("[data-day]", body).forEach(c => c.onclick = () => openItem("", {postDate:c.dataset.day}));
}

/* ---------- Item editor (a post or a shoot) ---------- */
function renderItem(){
  const existing = content.find(c => c.id === route.id);
  const c = existing ? clone(existing) : Object.assign({id:uid("c"), title:"", pillar:"", series:"", platform:"Instagram Reel", status:"Planned", shootDate:"", postDate:"", time:"", hook:"", notes:"", link:"", entryId:""}, route.preset || {});
  setHeader({eyebrow: existing ? "Edit post" : "Plan a post", title: c.title || (c.platform === "Shoot" ? "New shoot" : "New post"), back:true});
  const opt = (list, val, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map(o => `<option ${o===val?"selected":""}>${esc(o)}</option>`).join("");
  const entryOpts = entries.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"")).map(e => `<option value="${esc(e.id)}" ${e.id===c.entryId?"selected":""}>${esc(e.name || "Untitled pour")} · ${esc(fmtDate(e.date))}</option>`).join("");
  $("#view").innerHTML = `<form class="item-f" id="itF" novalidate><section class="sec">
    <div class="fg">
      <div class="f wide"><label for="i-title">Title</label><input id="i-title" name="title" value="${esc(c.title)}" placeholder="e.g. Blind Friday: $25 vs $60 bourbon" autocomplete="off"></div>
      <div class="f"><label for="i-platform">Platform</label><select id="i-platform" name="platform">${opt(PLATFORMS, c.platform)}</select></div>
      <div class="f"><label for="i-status">Status</label><select id="i-status" name="status">${opt(STATUSES, c.status)}</select></div>
      <div class="f"><label for="i-pillar">Pillar</label><select id="i-pillar" name="pillar">${opt(PILLARS, c.pillar, "None")}</select></div>
      <div class="f"><label for="i-series">Series</label><input id="i-series" name="series" list="seriesList" value="${esc(c.series)}" autocomplete="off"><datalist id="seriesList">${SERIES.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
      <div class="f"><label for="i-shoot">Shoot date</label><input id="i-shoot" name="shootDate" type="date" value="${esc(c.shootDate)}"></div>
      <div class="f"><label for="i-post">Post date</label><input id="i-post" name="postDate" type="date" value="${esc(c.postDate)}"></div>
      <div class="f"><label for="i-time">Post time</label><input id="i-time" name="time" type="time" value="${esc(c.time)}"></div>
      <div class="f wide"><label for="i-hook">Hook (first 3 seconds)</label><input id="i-hook" name="hook" value="${esc(c.hook)}" autocomplete="off"></div>
      <div class="f wide"><label for="i-notes">Notes / shot list</label><textarea id="i-notes" name="notes">${esc(c.notes)}</textarea></div>
      <div class="f wide"><label for="i-link">Link once posted</label><input id="i-link" name="link" type="url" inputmode="url" value="${esc(c.link)}" placeholder="YouTube links show on your website after you publish"></div>
      <div class="f wide"><label for="i-entry">Journal entry</label><select id="i-entry" name="entryId"><option value="">None</option>${entryOpts}</select></div>
    </div></section>
    <div class="formbar"><span class="msg" id="itMsg"></span>
      ${existing ? `<button class="btn ghost danger" type="button" id="itDel">Delete</button>` : ""}
      <button class="btn ghost" type="button" id="itCancel">Cancel</button>
      <button class="btn primary" type="submit">${existing ? "Save" : "Add to calendar"}</button></div></form>`;
  const f = $("#itF");
  $("#i-title").oninput = e => $("#title").textContent = e.target.value || "New post";
  $("#itCancel").onclick = () => history.length > 1 ? history.back() : go({name:"plan"});
  if ($("#itDel")) $("#itDel").onclick = () => {
    $("#itMsg").innerHTML = `Delete this post? <button class="btn small danger" type="button" id="itYes">Delete</button>`;
    $("#itYes").onclick = async () => { const keep = clone(existing); await deleteItem(c.id); toast("Deleted.", {label:"Undo", run: async () => { await saveItem(keep); render(); }}); history.back(); };
  };
  f.onsubmit = async ev => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.title.trim()) { $("#itMsg").textContent = "Give it a title."; $("#i-title").focus(); return; }
    Object.assign(c, data, {title:data.title.trim()});
    await saveItem(c); toast(existing ? "Saved." : "Added to the calendar.");
    history.length > 1 ? history.back() : go({name:"plan"});
  };
}

/* ---------- Ideas ---------- */
let ideaFilter = "", ideaQ = "";
function renderIdeas(){
  const body = $("#planBody");
  body.innerHTML = `<div class="ideas-top">
      <input class="field-s" id="iq" type="search" placeholder="Search ideas" aria-label="Search ideas" value="${esc(ideaQ)}">
      <details class="add-idea"><summary class="btn small">Add an idea</summary>
        <form id="ideaF" class="fg" style="margin-top:10px">
          <div class="f wide"><label for="n-title">Title</label><input id="n-title" name="title" required></div>
          <div class="f"><label for="n-pillar">Pillar</label><select id="n-pillar" name="pillar">${PILLARS.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
          <div class="f"><label for="n-format">Format / length</label><input id="n-format" name="format" placeholder="Reel 45s + YT"></div>
          <div class="f wide"><label for="n-hook">Hook</label><input id="n-hook" name="hook"></div>
          <div class="f wide"><label for="n-notes">Notes</label><textarea id="n-notes" name="notes"></textarea></div>
          <div class="f wide"><button class="btn primary" type="submit">Save idea</button></div></form></details></div>
    <div class="filters" id="ideaPills">${["", ...PILLARS].map(p => `<button type="button" data-p="${esc(p)}" aria-pressed="${p===ideaFilter}">${p ? pillarDot(p) + esc(p) : "All"}</button>`).join("")}</div>
    <ul class="idea-list" id="ideaList"></ul>`;
  const draw = () => {
    const q = ideaQ.toLowerCase();
    const list = ideas.filter(i => (!ideaFilter || i.pillar === ideaFilter) && (!q || [i.title, i.hook, i.notes, i.format].join(" ").toLowerCase().includes(q))).sort((a,b) => PILLARS.indexOf(a.pillar) - PILLARS.indexOf(b.pillar));
    $("#ideaList").innerHTML = list.length ? list.map(i => `<li class="idea p-${pkey(i.pillar)}" data-id="${esc(i.id)}">
      <div class="ib"><h3>${esc(i.title)}</h3>${i.hook ? `<p class="hook">“${esc(i.hook)}”</p>` : ""}<p class="muted small">${esc([i.format, i.notes].filter(Boolean).join(" — "))}</p>
        <div class="im">${pillarDot(i.pillar)}<span>${esc(i.pillar)}</span>${i.used ? `<span class="used">Scheduled ${i.used}×</span>` : ""}</div></div>
      <div class="ia"><button class="btn small" type="button" data-sched>Schedule</button></div></li>`).join("") : `<li class="muted" style="padding:16px 4px">No ideas match.</li>`;
    $$("#ideaList [data-sched]").forEach(b => b.onclick = () => {
      const li = b.closest("li"); const idea = ideas.find(x => x.id === li.dataset.id);
      const plat = /Carousel/.test(idea.format) ? "Instagram Carousel" : /^YT|YouTube/.test(idea.format) && !/Reel/.test(idea.format) ? "YouTube" : "Instagram Reel";
      $(".ia", li).innerHTML = `<form class="sched"><label class="sr" for="sd-${esc(idea.id)}">Post date</label><input id="sd-${esc(idea.id)}" type="date" required value="${today()}">
        <label class="sr" for="sp-${esc(idea.id)}">Platform</label><select id="sp-${esc(idea.id)}">${PLATFORMS.filter(p => p !== "Shoot").map(p => `<option ${p===plat?"selected":""}>${p}</option>`).join("")}</select>
        <button class="btn small primary" type="submit">Add</button><button class="btn small ghost" type="button" data-x>Cancel</button></form>`;
      $("[data-x]", li).onclick = draw;
      $("form", li).onsubmit = async ev => {
        ev.preventDefault();
        const pd = $("input", li).value;
        await saveItem({id:uid("c"), title:idea.title, pillar:idea.pillar, series:"", platform:$("select", li).value, status:"Planned", shootDate:"", postDate:pd, time:"", hook:idea.hook, notes:[idea.format, idea.notes].filter(Boolean).join(" — "), link:"", entryId:""});
        idea.used = (idea.used || 0) + 1; await saveIdea(idea);
        toast("Added to the calendar.", {label:"Open", run:() => { planTab = "calendar"; calMonth = (d => new Date(d.getFullYear(), d.getMonth(), 1))(dateOf(pd || today())); go({name:"plan", sub:"calendar"}); }});
        draw();
      };
    });
  };
  $("#iq").oninput = e => { ideaQ = e.target.value; draw(); };
  $$("#ideaPills button").forEach(b => b.onclick = () => { ideaFilter = b.dataset.p; $$("#ideaPills button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(); });
  $("#ideaF").onsubmit = async ev => {
    ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target).entries());
    if (!d.title.trim()) return;
    await saveIdea({id:uid("idea"), pillar:d.pillar, title:d.title.trim(), format:d.format, hook:d.hook, notes:d.notes, used:0});
    toast("Idea saved."); ideaFilter = ""; renderIdeas();
  };
  draw();
}

/* ---------- Strategy (Markdown documents you can edit) ---------- */
let docId = "strategy";
function md(src){
  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const L = src.replace(/\r/g, "").split("\n"); const out = []; const toc = []; let h = 0;
  const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  for (let i = 0; i < L.length; i++) {
    const l = L[i]; if (!l.trim()) continue; let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const lv = m[1].length, id = "h" + (h++); if (lv === 2) toc.push([id, m[2]]); out.push(`<h${lv} id="${id}">${inline(m[2])}</h${lv}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push("<hr>"); continue; }
    if (l.trim().startsWith("|")) {
      const rows = []; while (i < L.length && L[i].trim().startsWith("|")) rows.push(L[i++]); i--;
      const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
      const body = rows.filter((r, k) => !(k === 1 && /^[\s|:-]+$/.test(r)));
      const [head, ...rest] = body; const hc = cells(head);
      const headless = hc.every(x => !x);
      out.push(`<div class="tw"><table>${headless ? "" : `<thead><tr>${hc.map(x => `<th>${inline(x)}</th>`).join("")}</tr></thead>`}<tbody>${rest.map(r => `<tr>${cells(r).map(x => `<td>${inline(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (isList(l)) {
      const ordered = /^\s*\d/.test(l); const items = [];
      while (i < L.length && (isList(L[i]) || (!L[i].trim() && i + 1 < L.length && isList(L[i+1])))) { if (L[i].trim()) items.push(L[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "")); i++; }
      i--; out.push(`<${ordered ? "ol" : "ul"}>${items.map(x => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`); continue;
    }
    if (l.startsWith(">")) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    const p = [l]; while (i + 1 < L.length && L[i+1].trim() && !/^(#|\||\s*[-*+]\s|\s*\d+[.)]\s|>)/.test(L[i+1])) p.push(L[++i]);
    out.push(`<p>${inline(p.join(" "))}</p>`);
  }
  return {html: out.join("\n"), toc};
}
function renderStrategy(editing = false){
  const body = $("#planBody");
  const order = ["strategy","growth"]; const docs = Object.keys(kv).filter(k => k.startsWith("doc:")).map(k => kv[k]).sort((x,y) => ((order.indexOf(x.id)+1)||9) - ((order.indexOf(y.id)+1)||9));
  const doc = kv["doc:" + docId] || docs[0];
  if (!doc) { body.innerHTML = `<div class="empty"><p>No strategy documents yet.</p></div>`; return; }
  const tabs = `<div class="seg mini" role="group" aria-label="Document">${docs.map(d => `<button type="button" data-doc="${esc(d.id)}" aria-pressed="${d.id===doc.id}">${esc(d.title)}</button>`).join("")}</div>`;
  if (editing) {
    body.innerHTML = `<div class="doc-head">${tabs}<div class="btnrow"><button class="btn small ghost" type="button" id="dRestore">Restore original</button><button class="btn small ghost" type="button" id="dCancel">Cancel</button><button class="btn small primary" type="button" id="dSave">Save</button></div></div>
      <p class="muted small">Markdown: # headings, **bold**, *italic*, - lists, | tables |.</p>
      <textarea class="md-edit" id="dText" aria-label="${esc(doc.title)} (Markdown)">${esc(doc.markdown)}</textarea>`;
    $("#dCancel").onclick = () => renderStrategy(false);
    $("#dSave").onclick = async () => { await setKV("doc:" + doc.id, {...doc, markdown:$("#dText").value, updatedAt:new Date().toISOString()}); toast("Saved."); renderStrategy(false); };
    $("#dRestore").onclick = () => { const o = (window.WS_SEED?.docs || []).find(d => d.id === doc.id); if (o) { $("#dText").value = o.markdown; toast("Original loaded. Save to keep it."); } };
  } else {
    const {html, toc} = md(doc.markdown);
    body.innerHTML = `<div class="doc-head">${tabs}<button class="btn small" type="button" id="dEdit">Edit</button></div>
      <div class="doc"><nav class="toc" aria-label="Sections">${toc.map(([id, t]) => `<a href="#${id}" data-to="${id}">${esc(t.replace(/\*\*/g, ""))}</a>`).join("")}</nav><article class="md">${html}</article></div>`;
    $("#dEdit").onclick = () => renderStrategy(true);
    $$("[data-to]", body).forEach(a => a.onclick = ev => { ev.preventDefault(); document.getElementById(a.dataset.to)?.scrollIntoView({behavior:"smooth", block:"start"}); });
  }
  $$("[data-doc]", body).forEach(b => b.onclick = () => { docId = b.dataset.doc; renderStrategy(false); });
}

/* =====================================================================
   PUBLISH: send public tastings and posted videos to the website repo
   through the GitHub API. The token stays on this device.
   ===================================================================== */
const SITE_CATEGORY = c => /Wheated Bourbon|^Bourbon/.test(c) ? "Bourbon" : c === "Rye" ? "Rye" : /Tennessee/.test(c) ? "Tennessee" : /Scotch/.test(c) ? "Scotch" : /^Irish/.test(c) ? "Irish" : /Japanese/.test(c) ? "Japanese" : c === "American Single Malt" ? "American Single Malt" : "Other";
const verdictOf = e => e.verdict || (e.buyAgain === "Yes" ? "Buy" : e.buyAgain === "No" ? "Pass" : e.buyAgain === "Maybe" ? "Bar Pour" : (Number(e.score) >= 85 ? "Buy" : Number(e.score) >= 75 ? "Bar Pour" : Number(e.score) ? "Pass" : "Bar Pour"));
const slugify = s => (s || "whiskey").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "whiskey";
const senseText = s => [s?.text, (s?.tags || []).length ? (s.tags.join(", ")) : ""].filter(Boolean).join(s?.text ? " · " : "");

async function buildSiteData(){
  const pub = entries.filter(e => e.showOnSite).sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.createdAt||"").localeCompare(b.createdAt||""));
  let max = Math.max(0, ...entries.map(e => Number(e.siteNo) || 0));
  for (const e of pub) if (!e.siteNo) { e.siteNo = ++max; await put("entries", clone(e)); }
  const used = new Set();
  const tastings = pub.sort((a,b) => a.siteNo - b.siteNo).map(e => {
    let slug = slugify(e.name); if (used.has(slug)) slug += "-" + e.siteNo; used.add(slug);
    const price = Number(String(e.price || "").replace(/[^0-9.]/g, "")) || null;
    const isUrl = /^https?:\/\//.test(e.episode || "");
    return { number:e.siteNo, slug, name:e.name, distillery:e.distillery || e.bottler || "", category:SITE_CATEGORY(e.category || ""),
      region:[e.region, e.country].filter(Boolean).join(", "), proof: Number(e.abv) ? Number(proofOf(e.abv)) : null, age:e.age || "", price,
      mashBill:e.mashbill || "", date:e.date, color: e.color === "" || e.color == null ? 5 : Math.round(Number(e.color) * 10 / 9),
      nose:senseText(e.nose), palate:senseText(e.palate), finish:senseText(e.finish), notes:e.siteBlurb || "",
      flavor:{sweet:+e.profile?.sweet||0, fruit:+e.profile?.fruit||0, floral:+e.profile?.floral||0, spice:+e.profile?.spice||0, oak:+e.profile?.oak||0, grain:+e.profile?.grain||0, smoke:+e.profile?.smoke||0, richness:+e.profile?.nutty||0},
      verdict:verdictOf(e), videoUrl: isUrl ? e.episode : "" };
  });
  const videos = content.filter(c => c.status === "Posted" && /^https?:\/\//.test(c.link || "") && /YouTube|Short/.test(c.platform))
    .sort((a,b) => (b.postDate||"").localeCompare(a.postDate||""))
    .map(c => ({title:c.title, url:c.link, platform: /Short/.test(c.platform) && !/^YouTube$/.test(c.platform) ? "YouTube Short" : "YouTube", date:c.postDate || (c.updatedAt||"").slice(0,10), pillar:c.pillar || "", series:c.series || ""}));
  return {tastings, videos};
}
const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), ch => ch.charCodeAt(0)));

async function ghPutJSON(cfg, file, key, list, log){
  const path = [cfg.dir.replace(/^\/|\/$/g, ""), file].filter(Boolean).join("/");
  const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {"Authorization":"Bearer " + cfg.token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"};
  let sha, old;
  const g = await fetch(api + "?ref=" + encodeURIComponent(cfg.branch), {headers, cache:"no-store"});
  if (g.status === 200) { const j = await g.json(); sha = j.sha; try { old = JSON.parse(b64dec(j.content || "")); } catch {} }
  else if (g.status !== 404) throw ghError(g.status, cfg);
  if (old && JSON.stringify(old[key]) === JSON.stringify(list)) { log.push(`${file}: no changes.`); return false; }
  const body = {message:`Publish from Whiskey Student app: ${list.length} ${key}`, branch:cfg.branch, content:b64enc(JSON.stringify({updated:new Date().toISOString(), [key]:list}, null, 2) + "\n")};
  if (sha) body.sha = sha;
  const p = await fetch(api, {method:"PUT", headers:{...headers, "Content-Type":"application/json"}, body:JSON.stringify(body)});
  if (!p.ok) { if (p.status === 404 && !sha) throw new Error(`GitHub couldn't create ${path}. Check the repository, branch and folder names, and that the token has Contents: Read and write on that repo.`); throw ghError(p.status, cfg); }
  log.push(`${file}: published ${list.length} ${key}.`); return true;
}
function ghError(status, cfg){
  const m = status === 401 ? "GitHub rejected the token. It may have expired; create a new one and paste it in." :
    status === 403 ? "The token doesn't have permission. It needs Contents: Read and write on " + cfg.owner + "/" + cfg.repo + "." :
    status === 404 ? `GitHub couldn't find ${cfg.owner}/${cfg.repo} on branch ${cfg.branch}, or the token can't see it.` :
    status === 409 || status === 422 ? "The file changed on GitHub while publishing. Tap Publish again." : `GitHub returned an error (${status}). Try again.`;
  return new Error(m);
}
let publishing = false;
async function publishSite(logEl){
  const cfg = kv.github || {};
  if (!cfg.owner || !cfg.repo || !cfg.token) { toast("Add your GitHub details first."); return; }
  if (!navigator.onLine) { toast("You're offline. Publish when you have signal."); return; }
  if (publishing) return; publishing = true;
  const log = []; logEl.hidden = false; logEl.textContent = "Publishing…";
  try {
    const {tastings, videos} = await buildSiteData();
    const a = await ghPutJSON({branch:"main", dir:"src/data", ...cfg}, "tastings.json", "tastings", tastings, log);
    const b = await ghPutJSON({branch:"main", dir:"src/data", ...cfg}, "videos.json", "videos", videos, log);
    log.push(a || b ? "Your website rebuilds in about a minute." : "Nothing changed since the last publish.");
    await setKV("lastPublish", new Date().toISOString());
    toast(a || b ? "Published." : "Already up to date.");
  } catch (err) {
    log.push(err && err.message && !/Failed to fetch|NetworkError|Load failed/.test(err.message) ? err.message : "Couldn't reach GitHub. Check your connection and try again.");
    toast("Publish failed.");
  } finally { publishing = false; logEl.textContent = log.join("\n"); }
}


/* ---------------- data: backup, import, storage ---------------- */
const blobToDataURL = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

async function shareOrDownload(filename, blob){
  const file = new File([blob], filename, {type: blob.type});
  if (navigator.canShare && navigator.canShare({files:[file]})) {
    try { await navigator.share({files:[file], title:filename}); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return "downloaded";
}

async function exportBackup(withPhotos){
  const photos = [];
  if (withPhotos) for (const p of await all("photos")) photos.push({id:p.id, entryId:p.entryId, createdAt:p.createdAt, dataUrl: await blobToDataURL(p.blob)});
  const kvOut = Object.fromEntries(Object.entries(kv).filter(([k]) => k !== "github"));
  const payload = {app:"whiskey-student-journal", format:2, appVersion:APP_VERSION, exportedAt:new Date().toISOString(), entries, notes, photos, plan:{content, ideas, kv:kvOut}};
  const r = await shareOrDownload(`whiskey-student-backup-${today()}${withPhotos?"":"-no-photos"}.json`, new Blob([JSON.stringify(payload)], {type:"application/json"}));
  if (r !== "cancelled") { localStorage.setItem("wsj-last-backup", new Date().toISOString()); toast("Backup ready."); renderData(); }
}

function notesMarkdown(){
  const by = {};
  notes.slice().sort((a,b) => (a.createdAt||"").localeCompare(b.createdAt||"")).forEach(n => (by[n.type] = by[n.type] || []).push(n));
  let md = `# Whiskey Student — Phase 1 field notes\n\nExported ${fmtStamp(new Date().toISOString())} · ${notes.length} notes · ${entries.length} journal entries logged\n`;
  for (const t of NOTE_TYPES) { if (!by[t]) continue; md += `\n## ${t}\n\n`; by[t].forEach(n => md += `- [${n.status === "Done" ? "x" : " "}] **${n.area}** (${fmtDate(n.createdAt)}): ${n.text.replace(/\n+/g, " ")}\n`); }
  return md;
}

async function importFile(file){
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't a journal backup."); }
  let inEntries = [], inNotes = [], inPhotos = [];
  if (Array.isArray(data)) inEntries = data;                       // backup exported from the claude.ai journal
  else if (data && Array.isArray(data.entries)) { inEntries = data.entries; inNotes = data.notes || []; inPhotos = data.photos || []; }
  else return toast("That file isn't a journal backup.");
  let added = 0, updated = 0, skipped = 0;
  for (const p of inPhotos) { try { await put("photos", {id:p.id, entryId:p.entryId, createdAt:p.createdAt, blob: await dataURLToBlob(p.dataUrl)}); } catch {} }
  for (const raw of inEntries) {
    if (!raw || typeof raw !== "object" || !raw.id) { skipped++; continue; }
    if (raw.example) { skipped++; continue; }
    const cur = entries.find(e => e.id === raw.id);
    if (cur && (cur.updatedAt||"") >= (raw.updatedAt||"")) { skipped++; continue; }
    const e = normalize(raw); delete e.example;
    await put("entries", e); cur ? updated++ : added++;
  }
  for (const n of inNotes) { if (n && n.id && !notes.find(x => x.id === n.id)) await put("notes", n); }
  let planN = 0;
  if (data && data.plan && typeof data.plan === "object") {
    const newer = (cur, inc) => !cur || (inc.updatedAt || "") > (cur.updatedAt || "");
    for (const c of data.plan.content || []) if (c && c.id && newer(content.find(x => x.id === c.id), c)) { await put("content", c); planN++; }
    for (const x of data.plan.ideas || []) if (x && x.id && newer(ideas.find(y => y.id === x.id), x)) { await put("ideas", x); planN++; }
    for (const [k, v] of Object.entries(data.plan.kv || {})) {
      if (k === "github") continue;
      if (k.startsWith("doc:")) { if (newer(kv[k], v)) { await put("kv", {key:k, value:v}); planN++; } }
      else if (k === "metrics") { const m = new Map((kv.metrics || []).map(r => [r.date, r])); (v || []).forEach(r => { if (r && r.date && !m.has(r.date)) m.set(r.date, r); }); await put("kv", {key:k, value:[...m.values()]}); }
      else if (!(k in kv)) await put("kv", {key:k, value:v});
    }
  }
  await loadAll();
  toast(`Imported: ${added} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}${planN ? `, ${planN} plan items` : ""}.`);
  renderData();
}

async function renderData(){
  setHeader({eyebrow:"Your data", title:"Backup & storage"});
  const photoCount = (await req(store("photos").count()));
  const last = localStorage.getItem("wsj-last-backup");
  let usage = "";
  try { const est = await navigator.storage?.estimate?.(); if (est) usage = `${(est.usage/1048576).toFixed(1)} MB used on this device`; } catch {}
  let persisted = null; try { persisted = await navigator.storage?.persisted?.(); } catch {}
  $("#view").innerHTML = `
    <div class="stats"><div><div class="label">Entries</div><div class="v">${entries.length}</div></div><div><div class="label">Photos</div><div class="v">${photoCount}</div></div><div><div class="label">Notes</div><div class="v">${notes.length}</div></div><div><div class="label">Plan items</div><div class="v">${content.length}</div></div></div>
    <div class="cards"><div class="card"><h2>Back up your journal</h2>
      <p>Everything lives on this device only: journal, photos, notes, calendar, ideas and strategy. Save a backup to Files, iCloud Drive or Google Drive regularly. ${last ? `Last backup: <b style="color:var(--ink)">${esc(fmtStamp(last))}</b>.` : "<b style='color:var(--danger)'>No backup yet.</b>"}</p>
      <div class="btnrow"><button class="btn primary" type="button" id="bkFull">Back up with photos</button><button class="btn" type="button" id="bkLite">Back up without photos</button></div></div>
    <div class="card"><h2>Import</h2>
      <p>Restore a backup from this app, or bring in entries from the claude.ai journal (use its <b>Export backup</b> button, then pick that file here). Entries already on this device are kept unless the import is newer.</p>
      <label class="btn filebtn"><input type="file" accept="application/json,.json" id="impIn">Choose backup file</label></div>
    <div class="card publish"><h2>Publish to your website</h2>
      <p>Sends pours marked <b>Show on my website</b> (${entries.filter(e => e.showOnSite).length} now) and posted YouTube videos (${content.filter(c => c.status === "Posted" && /^https?:/.test(c.link||"") && /YouTube|Short/.test(c.platform)).length} now) to your website’s GitHub repo. ${kv.lastPublish ? `Last published <b style="color:var(--ink)">${esc(fmtStamp(kv.lastPublish))}</b>.` : "Not published yet."}</p>
      <div class="btnrow"><button class="btn primary" type="button" id="pubBtn" ${(kv.github||{}).token ? "" : "disabled"}>Publish now</button></div>
      <pre class="publog" id="pubLog" hidden></pre>
      <details class="gh" ${(kv.github||{}).token ? "" : "open"}><summary>GitHub settings</summary>
        <form id="ghF" class="fg" style="margin-top:10px" autocomplete="off">
          <div class="f"><label for="g-owner">Username</label><input id="g-owner" name="owner" value="${esc((kv.github||{}).owner||"")}" placeholder="your-github-name" autocapitalize="off" spellcheck="false"></div>
          <div class="f"><label for="g-repo">Website repository</label><input id="g-repo" name="repo" value="${esc((kv.github||{}).repo||"")}" placeholder="whiskey-student-site" autocapitalize="off" spellcheck="false"></div>
          <div class="f"><label for="g-branch">Branch</label><input id="g-branch" name="branch" value="${esc((kv.github||{}).branch||"main")}" autocapitalize="off" spellcheck="false"></div>
          <div class="f"><label for="g-dir">Data folder</label><input id="g-dir" name="dir" value="${esc((kv.github||{}).dir||"src/data")}" autocapitalize="off" spellcheck="false"></div>
          <div class="f wide"><label for="g-token">Access token</label><input id="g-token" name="token" type="password" value="${esc((kv.github||{}).token||"")}" placeholder="github_pat_…" autocapitalize="off" spellcheck="false"></div>
          <p class="muted small f wide" style="margin:0">Use a fine-grained token limited to the website repo only, with <b>Contents: Read and write</b>. It’s stored on this device only and is never included in backups. Each device needs it entered once.</p>
          <div class="f wide"><button class="btn" type="submit">Save settings</button></div></form></details></div>
    <div class="card"><h2>Field notes for Phase 2</h2>
      <p>Export your notes as a Markdown file, grouped by type, ready to share with Claude when you plan the next version.</p>
      <div class="btnrow"><button class="btn" type="button" id="mdBtn">Export field notes</button><button class="btn ghost" type="button" id="mdCopy">Copy to clipboard</button></div></div>
    <div class="card"><h2>Storage</h2>
      <p>${esc(usage || "Storage details aren't available in this browser.")}${persisted === true ? " Protected from automatic clean-up." : persisted === false ? " The browser may clear it if the device runs low on space." : ""}</p>
      ${persisted === false ? `<button class="btn" type="button" id="persistBtn">Protect my data</button>` : ""}
      <p style="margin-top:12px;font-size:13px">Whiskey Student · Phase 1 · v${APP_VERSION}</p></div>
    <div class="card kbd-card"><h2>Keyboard shortcuts</h2>
      <dl class="kv"><dt><kbd>N</kbd></dt><dd>New pour</dd><dt><kbd>P</kbd></dt><dd>Plan</dd><dt><kbd>/</kbd></dt><dd>Search the journal</dd><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Previous / next entry</dd><dt><kbd>E</kbd></dt><dd>Edit the open entry</dd><dt><kbd>⌘</kbd> <kbd>S</kbd></dt><dd>Save entry</dd></dl></div></div>`;
  $("#bkFull").onclick = () => exportBackup(true);
  $("#pubBtn").onclick = () => publishSite($("#pubLog"));
  $("#ghF").onsubmit = async ev => {
    ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target).entries());
    for (const k in d) d[k] = d[k].trim();
    if (d.repo === "whiskey-student") toast("That's the app's own repo. Use your website's repo instead.");
    await setKV("github", {owner:d.owner, repo:d.repo, branch:d.branch || "main", dir:d.dir || "src/data", token:d.token});
    toast("GitHub settings saved on this device."); renderData();
  };
  $("#bkLite").onclick = () => exportBackup(false);
  $("#impIn").onchange = ev => { const f = ev.target.files[0]; ev.target.value = ""; if (f) importFile(f); };
  $("#mdBtn").onclick = () => shareOrDownload(`whiskey-student-field-notes-${today()}.md`, new Blob([notesMarkdown()], {type:"text/markdown"}));
  $("#mdCopy").onclick = async () => { try { await navigator.clipboard.writeText(notesMarkdown()); toast("Field notes copied."); } catch { toast("Copy isn't allowed here. Use Export instead."); } };
  if ($("#persistBtn")) $("#persistBtn").onclick = async () => { const ok = await navigator.storage.persist(); toast(ok ? "Your data is now protected." : "The browser declined. Installing the app to your home screen usually helps."); renderData(); };
}

/* ---------------- boot ---------------- */
(async () => {
  try { idb = await openDB(); await loadAll(); await seedPlan(); }
  catch { $("#view").innerHTML = `<div class="empty"><h2>Storage is unavailable</h2><p>This browser is blocking on-device storage, often because of private browsing. Open the app in a regular window.</p></div>`; return; }
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) navigator.storage.persist(); } catch {}
  history.replaceState(route, "");
  render();
  const last = localStorage.getItem("wsj-last-backup");
  if (entries.length >= 3 && (!last || Date.now() - Date.parse(last) > 14*864e5)) setTimeout(() => toast("It's been a while since your last backup.", {label:"Back up", run:() => go({name:"data"})}), 1200);
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw && nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller)
          toast("A new version is ready.", {label:"Update", run:() => { nw.postMessage("skipWaiting"); }});
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
})();
