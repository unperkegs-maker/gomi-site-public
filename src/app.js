// ===== 定数 =====
const URL_CANDS = ["source_url","primary_url","item_url","url","link","リンク"];
const CATEGORY_DISPLAY_KEY = "category_raw"; // 分別表示
const POPULAR_CITIES = ["横浜市","大阪市","名古屋市","札幌市","福岡市"]; // 初期サジェスト

// ===== 状態 =====
let ALL = [];
let FILTERED = [];
let page = 1;
let pageSize = 50;
let sortKey = "";
let sortAsc = true;
let qCache = "";
let displayMode = "auto";
let lastFocusEl = null;

// 市選択（"都道府県｜市区町村" 形式の文字列。空なら未選択）
let selectedCityPair = "";
let CITY_PAIRS = []; // ["神奈川県｜横浜市", …]
let suggestIndex = -1;

const el = (id)=>document.getElementById(id);

// ===== util =====
const escapeHtml = (s)=>String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
const uniq = (arr)=>[...new Set(arr)];
const has = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function getCityKey(){ const r = ALL[0]||{}; for (const k of ["municipality_name","city","市区町村"]) if (has(r,k)) return k; return "municipality_name"; }
function getItem(rec){ return rec["item_name"] || rec["item_name_raw"] || rec["item"] || rec["品目名"] || rec["品目"] || ""; }
function highlight(escaped, q){ if(!q) return escaped; try{ const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"); return escaped.replace(re,m=>`<mark>${m}</mark>`);}catch{return escaped;} }
function lockScroll(on){ document.documentElement.style.overflow = on?"hidden":""; document.body.style.overflow = on?"hidden":""; }

// ===== 初期化 =====
async function load(){
  const res = await fetch("data/merged.json", { cache:"no-store" });
  const data = await res.json();
  ALL = data.rows || [];

  try{
    displayMode = localStorage.getItem("displayMode") || "auto";
    pageSize = +(localStorage.getItem("pageSize") || 50);
    el("displayMode").value = displayMode;
    el("pageSize").value = String(pageSize);
  }catch{}

  buildCityPairs();
  setupCityCombo();

  el("search").onclick = runSearch;
  el("reset").onclick  = resetFilters;
  el("q").addEventListener("keydown", e=>{ if(e.key==="Enter") runSearch(); });
  el("pageSize").onchange = ()=>{ pageSize = +el("pageSize").value; savePrefs(); page=1; render(); };
  el("prev").onclick = ()=>{ if(page>1){ page--; render(); } };
  el("next").onclick = ()=>{ if(page<totalPages()){ page++; render(); } };
  el("displayMode").onchange = ()=>{ displayMode = el("displayMode").value; savePrefs(); render(); };

  setupDialog();
  runSearch();
}

function savePrefs(){ try{ localStorage.setItem("displayMode",displayMode); localStorage.setItem("pageSize",String(pageSize)); }catch{} }

function buildCityPairs(){
  const cityKey = getCityKey();
  CITY_PAIRS = uniq(
    ALL.map(r=>{
      const p = (r["prefecture"]||"").toString().trim();
      const c = (r[cityKey]||"").toString().trim();
      return (p && c) ? `${p}｜${c}` : "";
    }).filter(Boolean)
  ).sort((a,b)=>a.localeCompare(b,"ja"));
}

// ====== 市コンボボックス ======
function setupCityCombo(){
  const input = el("cityInput");
  const box   = el("citySuggest");
  const list  = box.querySelector("ul");

  const readRecents = ()=>{
    try{ return JSON.parse(localStorage.getItem("recentCities")||"[]") }catch{ return [] }
  };
  const writeRecents = (pair)=>{
    const arr = readRecents().filter(x=>x!==pair);
    arr.unshift(pair);
    localStorage.setItem("recentCities", JSON.stringify(arr.slice(0,5)));
  };

  const open = ()=>{ box.classList.add("open"); box.parentElement.setAttribute("aria-expanded","true"); };
  const close= ()=>{ box.classList.remove("open"); box.parentElement.setAttribute("aria-expanded","false"); suggestIndex=-1; };
  const isOpen= ()=>box.classList.contains("open");

  const renderItems = (pairs, headLabel)=>{
    list.innerHTML = "";
    if (headLabel){
      const li = document.createElement("li");
      li.style.cursor="default"; li.style.background="transparent";
      li.innerHTML = `<span class="badge">${escapeHtml(headLabel)}</span>`;
      li.setAttribute("aria-disabled","true");
      list.appendChild(li);
    }
    pairs.forEach((pair,i)=>{
      const [pref,city] = pair.split("｜");
      const li = document.createElement("li");
      li.setAttribute("role","option");
      li.setAttribute("data-pair", pair);
      li.innerHTML = `<div class="cityline"><span class="pref">${escapeHtml(pref)}</span><strong>${escapeHtml(city)}</strong></div>`;
      li.addEventListener("mousedown", (e)=>{ e.preventDefault(); select(pair); });
      list.appendChild(li);
    });
  };

  const suggestPopularOrRecent = ()=>{
    const recents = readRecents();
    if (recents.length){
      renderItems(recents, "最近使った自治体");
      open(); return;
    }
    // 人気（存在チェック）
    const popularPairs = CITY_PAIRS.filter(pair=>{
      const city = pair.split("｜")[1];
      return POPULAR_CITIES.includes(city);
    });
    if (popularPairs.length){
      renderItems(popularPairs, "人気の自治体");
      open();
    }
  };

  const query = ()=>input.value.trim();
  const search = ()=>{
    const q = query();
    if (!q){ suggestPopularOrRecent(); return; }
    const n = q.toLowerCase();
    const res = CITY_PAIRS.filter(pair=>{
      const [pref,city] = pair.split("｜");
      const s = `${pref}${city}`.toLowerCase();
      return s.includes(n);
    }).slice(0,30);
    renderItems(res);
    res.length ? open() : close();
  };

  const select = (pair)=>{
    selectedCityPair = pair;
    const [pref,city] = pair.split("｜");
    input.value = `${city}`; // 入力欄は市名メイン表示（都道府県は候補で確認できる）
    writeRecents(pair);
    close();
    runSearch();
  };

  input.addEventListener("focus", ()=>{
    if (!query()) suggestPopularOrRecent();
  });
  input.addEventListener("input", search);
  input.addEventListener("keydown", (e)=>{
    const opts = [...list.querySelectorAll('li[role="option"]')];
    if (!isOpen() && (e.key==="ArrowDown" || e.key==="Enter")){
      search(); return;
    }
    if (!opts.length) return;
    if (e.key==="ArrowDown"){ e.preventDefault(); suggestIndex=(suggestIndex+1)%opts.length; updateActive(); }
    else if (e.key==="ArrowUp"){ e.preventDefault(); suggestIndex=(suggestIndex-1+opts.length)%opts.length; updateActive(); }
    else if (e.key==="Enter"){ e.preventDefault(); if (suggestIndex>=0) select(opts[suggestIndex].dataset.pair); }
    else if (e.key==="Escape"){ close(); }
  });
  input.addEventListener("blur", ()=>{ setTimeout(close, 120); });

  function updateActive(){
    [...list.querySelectorAll('li[role="option"]')].forEach((li,i)=>{
      li.setAttribute("aria-selected", i===suggestIndex ? "true":"false");
      if (i===suggestIndex) li.scrollIntoView({block:"nearest"});
    });
  }
}

// ===== 検索 =====
function runSearch(){
  const cityInput = el("cityInput").value.trim();
  const q         = el("q").value.trim().toLowerCase();
  qCache = q;

  const cityKey = getCityKey();

  FILTERED = ALL.filter(r=>{
    // 1) 厳密一致（選択済みペアがある場合）
    if (selectedCityPair){
      const [pref, city] = selectedCityPair.split("｜");
      if (String(r["prefecture"]||"") !== pref) return false;
      if (String(r[cityKey]||"")      !== city) return false;
    }
    // 2) 未選択だが入力欄に文字がある場合は市名の部分一致
    else if (cityInput){
      const city = String(r[cityKey]||"").toLowerCase();
      if (!city.includes(cityInput.toLowerCase())) return false;
    }
    // 3) キーワード全文検索
    if (q){
      const joined = Object.values(r).join(" ").toLowerCase();
      if (!joined.includes(q)) return false;
    }
    return true;
  });

  page=1; sortKey=""; sortAsc=true;
  render();
}

function resetFilters(){
  selectedCityPair = "";
  el("cityInput").value = "";
  el("q").value = "";
  page = 1; sortKey=""; sortAsc=true;
  runSearch();
}

// ===== 描画 =====
function totalPages(){ return Math.max(1, Math.ceil(FILTERED.length / pageSize)); }
function render(){
  const total = FILTERED.length;
  const start = (page-1)*pageSize;
  const end   = Math.min(start+pageSize, total);
  el("pageInfo").textContent = `${Math.max(1,total?start+1:0)}-${end} / ${total}  |  ${page}/${totalPages()}`;

  const slice = FILTERED.slice(start,end);
  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  const mode = (displayMode === "auto") ? (isMobile ? "cards" : "table") : displayMode;

  document.getElementById("tableView").style.display = (mode==="table") ? "block" : "none";
  document.getElementById("cardView").style.display  = (mode==="cards") ? "grid"  : "none";

  if (mode==="table") renderTable(slice); else renderCards(slice);
}

function applySortFor(){
  if (!sortKey) return;
  const cityKey = getCityKey();
  FILTERED.sort((a,b)=>{
    let va, vb;
    if (sortKey === "__item__"){ va = getItem(a).toLowerCase(); vb = getItem(b).toLowerCase(); }
    else { va = (a[sortKey]??"").toString().toLowerCase(); vb = (b[sortKey]??"").toString().toLowerCase(); }
    if (va<vb) return sortAsc?-1:1;
    if (va>vb) return sortAsc?1:-1;
    return 0;
  });
}

function renderTable(rows){
  const thead = document.querySelector("#tbl thead");
  const tbody = document.querySelector("#tbl tbody");
  const cityKey = getCityKey();

  const columns = [
    { key:"prefecture",         label:"都道府県" },
    { key:cityKey,              label:"市区町村" },
    { key:"__item__",           label:"品名" },
    { key:CATEGORY_DISPLAY_KEY, label:"分別" },
    { key:"__detail__",         label:"詳細" },
  ];

  thead.innerHTML = "<tr>" + columns.map(c=>{
    if (c.key === "__detail__") return `<th>${c.label}</th>`;
    const isSort = sortKey===c.key;
    const arrow = isSort ? (sortAsc ? " ▲" : " ▼") : "";
    return `<th data-col="${escapeHtml(c.key)}" title="クリックで並び替え">${escapeHtml(c.label)}${arrow}</th>`;
  }).join("") + "</tr>";

  [...thead.querySelectorAll("th[data-col]")].forEach(th=>{
    th.onclick = ()=>{
      const key = th.getAttribute("data-col");
      if (sortKey === key) sortAsc = !sortAsc;
      else { sortKey = key; sortAsc = true; }
      applySortFor();
      render();
    };
  });

  const html = rows.map((r, idx)=>{
    const item = getItem(r);
    const cells = columns.map(c=>{
      if (c.key === "__detail__") return `<td><button class="linklike" data-detail="${startIndex()+idx}">詳細</button></td>`;
      if (c.key === "__item__")   return `<td>${highlight(escapeHtml(item), qCache)}</td>`;
      const v = r[c.key] ?? "";
      return `<td>${highlight(escapeHtml(String(v)), qCache)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  tbody.innerHTML = html || `<tr><td colspan="${columns.length}">該当なし</td></tr>`;
  tbody.querySelectorAll('button[data-detail]').forEach(btn=>{
    btn.onclick = ()=>{ lastFocusEl = btn; const i = +btn.getAttribute('data-detail'); openDetail(FILTERED[i]); };
  });

  function startIndex(){ return (page-1)*pageSize; }
}

function renderCards(rows){
  const wrap = document.getElementById("cardView");
  const cityKey = getCityKey();

  const cards = rows.map((r, idx)=>{
    const item = getItem(r) || "(品名未設定)";
    const muni = `${r["prefecture"]||""} ${r[cityKey]||""}`.trim();
    const cat  = r[CATEGORY_DISPLAY_KEY] || "";
    return `
      <article class="card">
        <h3>${highlight(escapeHtml(item), qCache)}</h3>
        <div class="meta">${escapeHtml(muni)} / ${highlight(escapeHtml(cat), qCache)}</div>
        <div class="btn-row"><button class="linklike" data-detail="${startIndex()+idx}">詳細</button></div>
      </article>`;
  }).join("");

  wrap.innerHTML = cards || `<div class="muted">該当なし</div>`;
  wrap.querySelectorAll('button[data-detail]').forEach(btn=>{
    btn.onclick = ()=>{ lastFocusEl = btn; const i = +btn.getAttribute('data-detail'); openDetail(FILTERED[i]); };
  });

  function startIndex(){ return (page-1)*pageSize; }
}

// ===== 詳細モーダル =====
function openDetail(rec){
  const dlg   = el("detailDialog");
  const title = el("detailTitle");
  const body  = el("detailBody");
  const cityKey = getCityKey();

  const item = getItem(rec) || "(品名未設定)";
  title.textContent = item;

  const how_method   = rec["pickup_method"] || "";
  const frequency    = rec["frequency"] || "";
  const scheduleNote = rec["schedule_note"] || "";
  const howto        = rec["how_to"] || "";
  const notes        = rec["notes"] || "";
  const notesRaw     = rec["note_raw"] || "";
  const categoryRaw  = rec[CATEGORY_DISPLAY_KEY] || "";
  const prefecture   = rec["prefecture"] || "";
  const municipality = rec[cityKey] || "";
  const sourceUpd    = rec["source_updated"] || "";
  const verified     = rec["last_verified"] || rec["checked_at"] || "";
  const [, urlVal]   = getField(rec, URL_CANDS);

  const rows = [
    ["都道府県", prefecture],
    ["市区町村", municipality],
    ["分別",     categoryRaw],
    ["回収方法", how_method],
    ["回収頻度", frequency],
    ["収集注記", scheduleNote],
    ["出し方",   howto],
    ["注意事項（要約）", notes],
    ["注意事項（原文）", notesRaw],
    ["最終更新", sourceUpd],
    ["最終確認", verified],
    ["出典URL",  urlVal ? `<a class="button" href="${escapeHtml(urlVal)}" target="_blank" rel="noopener">公式サイトで詳細を見る</a>` : ""],
  ].filter(([,v])=>String(v||"").trim() !== "");

  body.innerHTML = rows.map(([k,v])=>(`<b>${escapeHtml(k)}</b><div>${v}</div>`)).join("");

  lockScroll(true);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open","");
}

// ===== モーダル制御 =====
function setupDialog(){
  const dlg = el("detailDialog");
  const closeBtn = el("detailClose");
  try { closeBtn.setAttribute("type","button"); } catch {}

  const unlockScroll = ()=>{ document.documentElement.style.overflow=""; document.body.style.overflow=""; };
  const close = ()=>{
    try { if (typeof dlg.close==="function" && dlg.open) dlg.close(); dlg.removeAttribute("open"); } catch{}
    unlockScroll();
    try { lastFocusEl && lastFocusEl.focus(); } catch{}
  };

  closeBtn.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); close(); });
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape" && (dlg.open || dlg.hasAttribute("open"))) { e.preventDefault(); close(); }});
  const onBackDrop = (e)=>{ if (e.target===dlg){ e.preventDefault(); close(); } };
  dlg.addEventListener("click", onBackDrop);
  dlg.addEventListener("mousedown", onBackDrop);
  dlg.addEventListener("cancel", (e)=>{ e.preventDefault(); close(); });
  dlg.addEventListener("close", unlockScroll);
}

// ===== 補助 =====
function getField(rec, candidates){
  for (const k of candidates){
    const v = rec?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return [k, String(v)];
  }
  return ["",""];
}

load().catch(e=>{
  const cv = document.querySelector("#cardView");
  if (cv) cv.innerHTML = `<div>データ読み込み失敗: ${escapeHtml(e.message)}</div>`;
});
