import {
  MENU_CSV_URL, ADVERTS_CSV_URL,
  MENU_SECONDS, AD_SECONDS, FADE_MS,
  ENABLE_ADS_BY_DEFAULT, CACHE_VERSION
} from "./config.js";
import { qs, parseCSV, money, nowUK } from "./utils.js";

const screen = qs("screen") || "1";
const menuBg = document.getElementById("menuBg");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");

const menuLayer = document.getElementById("menuLayer");
const adLayer = document.getElementById("adLayer");
const adVideo = document.getElementById("adVideo");
const adImg = document.getElementById("adImg");

menuLayer.style.transitionDuration = `${FADE_MS}ms`;
adLayer.style.transitionDuration = `${FADE_MS}ms`;

(async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try {
    const swText = await fetch("./sw.js").then(r => r.text());
    const patched = swText.replace("self.__CACHE_VERSION__", JSON.stringify(CACHE_VERSION));
    const blob = new Blob([patched], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    await navigator.serviceWorker.register(url, { scope: "./" });
  } catch (e) {
    console.warn("SW registration failed", e);
  }
})();

function setStatus(text){ statusEl.textContent = text; }
function normalizeBool(v){
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function groupMenu(rows){
  const filtered = rows
    .filter(r => String(r.screen).trim() === String(screen))
    .filter(r => normalizeBool(r.enabled) !== false);

  const bySection = new Map();
  for (const r of filtered) {
    const section = r.section || "";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(r);
  }

  const sections = Array.from(bySection.keys()).map(name => {
    const items = bySection.get(name);
    const order = Number(items[0]?.section_order ?? 999);
    items.sort((a,b) => Number(a.item_order ?? 999) - Number(b.item_order ?? 999));
    return { name, order, items };
  }).sort((a,b) => a.order - b.order);

  return sections;
}

// Default positions — tune later
const L = { x: 90, w: 820 };
const R = { x: 1010, w: 820 };
const TOP = 150;
const GAP = 48;

const SCREEN_LAYOUT = {
  "1": { left: ["Fish","Sausages","Chips"], right: ["Chicken","Pies"] },
  "2": { left: ["Burgers","Kids Meals"], right: ["Classic Sides","Extras"] },
  "3": { left: ["Drinks","Sauces"], right: ["New","Box Meals"] },
};

function render(sections){
  overlay.innerHTML = "";
  const layout = SCREEN_LAYOUT[String(screen)] || { left: [], right: [] };
  const rightNames = new Set(layout.right);

  const left = [];
  const right = [];
  for (const s of sections) (rightNames.has(s.name) ? right : left).push(s);

  const renderCol = (col, colPos, namesOrder) => {
    let y = TOP;
    const ordered = [];
    for (const nm of namesOrder) {
      const found = col.find(s => s.name === nm);
      if (found) ordered.push(found);
    }
    for (const s of col) if (!ordered.includes(s)) ordered.push(s);

    for (const s of ordered) {
      const box = document.createElement("div");
      box.className = "section";
      box.style.left = colPos.x + "px";
      box.style.top = y + "px";
      box.style.width = colPos.w + "px";

      for (const it of s.items) {
        const line = document.createElement("div");
        line.className = "item";

        const name = document.createElement("div");
        name.className = "name";
        const qual = (it.qualifier || "").trim();
        name.innerHTML = qual ? `${it.item} <span class="qualifier">(${qual})</span>` : `${it.item}`;

        const price = document.createElement("div");
        price.className = "price";
        const p1 = (it.price ?? "").trim();
        const p2 = (it.price_2 ?? "").trim();
        const label = (it.price_label ?? "").trim();

        if (p2) {
          if (label.includes("|")) {
            const parts = label.split("|").map(x => x.trim());
            const a = parts[0] || "A";
            const b = parts[1] || "B";
            price.textContent = `${a} ${money(p1)} | ${b} ${money(p2)}`;
          } else {
            price.textContent = `${money(p1)} / ${money(p2)}`;
          }
        } else {
          price.textContent = money(p1);
        }

        line.appendChild(name);
        line.appendChild(price);
        box.appendChild(line);
      }

      overlay.appendChild(box);
      y += box.scrollHeight + GAP;
    }
  };

  renderCol(left, L, layout.left);
  renderCol(right, R, layout.right);
}

async function fetchCSV(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.text();
}

async function loadData(){
  let menuRows = [];
  let adsRows = [];
  let offline = false;
  let lastUpdated = "";

  try {
    if (!MENU_CSV_URL) throw new Error("MENU_CSV_URL not set");
    const csv = await fetchCSV(MENU_CSV_URL);
    menuRows = parseCSV(csv);
    localStorage.setItem(`menu_csv_${screen}`, csv);
    localStorage.setItem(`menu_last_${screen}`, nowUK());
    lastUpdated = localStorage.getItem(`menu_last_${screen}`) || "";
  } catch {
    offline = true;
    const cached = localStorage.getItem(`menu_csv_${screen}`) || "";
    if (cached) {
      menuRows = parseCSV(cached);
      lastUpdated = localStorage.getItem(`menu_last_${screen}`) || "";
    }
  }

  try {
    if (!ADVERTS_CSV_URL) throw new Error("ADVERTS_CSV_URL not set");
    const csv = await fetchCSV(ADVERTS_CSV_URL);
    adsRows = parseCSV(csv);
    localStorage.setItem(`ads_csv_${screen}`, csv);
  } catch {
    const cached = localStorage.getItem(`ads_csv_${screen}`) || "";
    if (cached) adsRows = parseCSV(cached);
  }

  return { menuRows, adsRows, offline, lastUpdated };
}

function getAdsForScreen(adsRows){
  return adsRows
    .filter(r => String(r.screen).trim() === String(screen))
    .filter(r => normalizeBool(r.enabled) !== false)
    .sort((a,b) => Number(a.sort_order ?? 999) - Number(b.sort_order ?? 999));
}

function setMenuBackground(){
  menuBg.src = `assets/screen${screen}_bg.mp4`;
  menuBg.load();
}

function showMenu(){ adLayer.classList.remove("show"); menuLayer.classList.add("show"); }
function showAd(){ menuLayer.classList.remove("show"); adLayer.classList.add("show"); }

function isAdWindow(nowMs){
  const cycleMs = (MENU_SECONDS + AD_SECONDS) * 1000;
  return (nowMs % cycleMs) >= MENU_SECONDS * 1000;
}
function adIndex(nowMs, adCount){
  const cycleMs = (MENU_SECONDS + AD_SECONDS) * 1000;
  const cycle = Math.floor(nowMs / cycleMs);
  return adCount ? (cycle % adCount) : 0;
}
function playAd(file){
  const lower = (file || "").toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) {
    adImg.style.display = "none";
    adVideo.style.display = "block";
    adVideo.src = `assets/${file}`;
    adVideo.currentTime = 0;
    adVideo.play().catch(()=>{});
  } else if (file) {
    adVideo.pause();
    adVideo.removeAttribute("src");
    adVideo.load();
    adVideo.style.display = "none";
    adImg.style.display = "block";
    adImg.src = `assets/${file}`;
  }
}

let adsEnabled = ENABLE_ADS_BY_DEFAULT;

async function main(){
  setMenuBackground();

  const { menuRows, adsRows, offline, lastUpdated } = await loadData();
  render(groupMenu(menuRows));

  const ads = getAdsForScreen(adsRows);
  if (ads.length) adsEnabled = true;

  setStatus(`Last updated: ${lastUpdated || "—"} • ${offline ? "Offline" : "Online"}`);

  let lastMode = null;
  setInterval(() => {
    const now = Date.now();
    const inAd = adsEnabled && ads.length && isAdWindow(now);
    const mode = inAd ? "ad" : "menu";
    if (mode !== lastMode) {
      if (mode === "ad") {
        const idx = adIndex(now, ads.length);
        playAd(ads[idx].file_name);
        showAd();
      } else showMenu();
      lastMode = mode;
    }
  }, 200);

  setInterval(async () => {
    const { menuRows: mr, offline: off, lastUpdated: lu } = await loadData();
    render(groupMenu(mr));
    setStatus(`Last updated: ${lu || "—"} • ${off ? "Offline" : "Online"}`);
  }, 60000);
}

main().catch(() => setStatus("Error: set MENU_CSV_URL in config.js"));
