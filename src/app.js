/* MedGURU — offline study. Made by Dr Sarwar Alam. */
const VERSION = "1.0.0";
const T = window.__TAURI__ || null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = n => Number(n || 0).toLocaleString();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ---------- backend bridge ---------- */
let backend;
async function initBackend() {
  if (T) {
    backend = {
      isDemo: false,
      cmd: (name, args = {}) => T.core.invoke(name, args),
      fileSrc: p => T.core.convertFileSrc(p),
      onImport: cb => { try { return T.event.listen("import-progress", e => cb(e.payload)); } catch { return null; } }
    };
  } else {
    const m = await import("./demo-backend.js");
    backend = await m.create();
  }
}
const cmd = (n, a) => backend.cmd(n, a);

/* ---------- settings ---------- */
const SETTINGS_KEY = "mg-settings";
const defaults = { theme: "night", text: "m", serif: false, sound: false, haptics: true, motion: "auto", readerFs: 17 };
let settings = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); applySettings(); }
function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme; r.dataset.text = settings.text;
  r.dataset.motion = settings.motion === "off" ? "off" : (settings.motion === "auto" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on");
  document.body.classList.toggle("serif-reader", settings.serif);
}
const reduced = () => document.documentElement.dataset.motion === "off";
function buzz(ms = 8) { if (settings.haptics) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} } }

/* ---------- sound (off by default; study app) ---------- */
let actx;
function tone(f, d, type = "sine", g = 0.05, when = 0) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), v = actx.createGain();
    o.type = type; o.frequency.value = f; o.connect(v); v.connect(actx.destination);
    const t = actx.currentTime + when;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.start(t); o.stop(t + d);
  } catch {}
}
const sfx = {
  tap: () => tone(900, .04, "sine", .03),
  flip: () => tone(1200, .05, "triangle", .04),
  ok: () => { tone(660, .12); tone(880, .16, "sine", .05, .1); },
  bad: () => tone(180, .18, "square", .04),
  done: () => { tone(523, .12); tone(659, .12, "sine", .05, .12); tone(784, .2, "sine", .05, .24); }
};

/* ---------- icons ---------- */
const ICONS = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9h5v-5h3v5h5v-9",
  packs: "M3 8l9-4.5L21 8v8l-9 4.5L3 16zM3 8l9 4.5M12 12.5L21 8M12 12.5V21",
  settings: "M4 7h10M18 7h2M4 12h4M12 12h8M4 17h13M20 17h0M14 5v4M8 10v4M17 15v4",
  qbank: "M5 4h14v16H5zM8.5 8.5l1.5 1.5 2.5-2.5M8.5 14l1.5 1.5 2.5-2.5M14.5 9h2M14.5 15h2",
  cards: "M7 8h12v11H7zM4.5 5.5H16M4.5 5.5V16",
  library: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13M9 7h6",
  import: "M12 3v10m0 0 4-4m-4 4-4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 21 21",
  flag: "M6 21V4m0 1h11l-2.5 3.5L17 12H6",
  bookmark: "M7 3h10v18l-5-4-5 4z",
  chev: "M9 5l7 7-7 7",
  back: "M15 5l-7 7 7 7",
  check: "M4.5 12.5l5 5L19.5 7",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  timer: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 2h6",
  shuffle: "M3 6h4l10 12h4m0 0-2.5-2.5M21 18l-2.5 2.5M3 18h4l2.5-3M14.5 9 17 6h4m0 0-2.5-2.5M21 6l-2.5 2.5",
  zoomin: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 21 21M10.5 8v5M8 10.5h5",
  zoomout: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 21 21M8 10.5h5",
  more: "M12 6.5h.01M12 12h.01M12 17.5h.01",
  vol: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  volx: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  aa: "M4 18 8.5 6 13 18M5.5 14h6M15 18l2.8-8 2.7 8M16 15.4h4",
  undo: "M8 5 4 9l4 4M4 9h10a6 6 0 0 1 0 12h-3",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6z",
  reset: "M4 10a8 8 0 1 1 2 6M4 10V4m0 6h6"
};
function sprite() {
  const syms = Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`).join("");
  const div = document.createElement("div");
  div.innerHTML = `<svg width="0" height="0" style="position:absolute"><defs>
    <linearGradient id="pulseGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#35E0C4"/><stop offset=".6" stop-color="#57A9FF"/><stop offset="1" stop-color="#B78CFF"/></linearGradient>
    ${syms}</defs></svg>`;
  document.body.prepend(div.firstChild);
}
const ic = (n, cls = "") => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const LOGO = `<svg viewBox="0 0 1024 1024" class="logo"><rect width="1024" height="1024" rx="228" fill="#12747A"/><path d="M120 560 H300 L360 560 400 430 470 700 540 300 610 620 650 560 H760" fill="none" stroke="#7CF5D8" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/><circle cx="836" cy="560" r="40" fill="#FFB224"/></svg>`;

/* ---------- sanitizer + content mounting ---------- */
const OK = new Set("p br b strong i em u s sub sup span div section article header h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr td th caption img a blockquote pre code hr figure figcaption small mark dl dt dd".split(" "));
const DROP = new Set("script style iframe object embed svg math link meta base form input textarea select button video audio source canvas template noscript".split(" "));
const ATTRS = { a: ["href"], img: ["src", "alt", "title", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"], ol: ["start"] };
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  (function walk(node) {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) { el.remove(); continue; }
      walk(el);
      if (!OK.has(tag)) { el.replaceWith(...el.childNodes); continue; }
      const keep = ATTRS[tag] || [];
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (!keep.includes(n)) { el.removeAttribute(a.name); continue; }
        const v = a.value.trim();
        if (n === "href" && !/^(https?:|#)/i.test(v)) el.removeAttribute(a.name);
        if (n === "src" && !/^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(v) && /^([a-z]+:|\/\/)/i.test(v)) el.removeAttribute(a.name);
      }
    }
  })(doc.body);
  return doc.body.innerHTML;
}
function mountContent(container, html, mediaDir) {
  container.innerHTML = sanitize(html);
  $$("img", container).forEach(img => {
    const src = img.getAttribute("src") || "";
    if (src && !/^(https?:|data:)/i.test(src)) {
      const file = src.split("/").pop();
      const url = mediaDir && backend.fileSrc ? backend.fileSrc(mediaDir + "/" + file) : null;
      if (url) img.src = url;
      else { const s = document.createElement("span"); s.className = "img-missing"; s.textContent = "🖼 " + (img.alt || file); img.replaceWith(s); return; }
    }
    img.addEventListener("click", () => lightbox(img.src, img.alt || ""));
    img.addEventListener("error", () => { const s = document.createElement("span"); s.className = "img-missing"; s.textContent = "🖼 image unavailable"; img.replaceWith(s); }, { once: true });
  });
  $$("table", container).forEach(t => { const w = document.createElement("div"); w.className = "tbl"; t.replaceWith(w); w.appendChild(t); });
  container.addEventListener("click", e => {
    const a = e.target.closest("a"); if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) { const t = container.querySelector(`[id="${CSS.escape(href.slice(1))}"]`); t && t.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }); }
    else toast("Links are disabled — MedGURU is fully offline.");
  });
}

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg, action) {
  $(".toast")?.remove(); clearTimeout(toastTimer);
  const t = document.createElement("div"); t.className = "toast";
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : "");
  if (action) $("button", t).onclick = () => { t.remove(); action.fn(); };
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), action ? 6000 : 3200);
}
function overlay(html) {
  closeOverlays();
  const s = document.createElement("div"); s.className = "scrim";
  s.innerHTML = `<div class="modal">${html}</div>`;
  s.addEventListener("pointerdown", e => { if (e.target === s) closeOverlays(); });
  document.body.appendChild(s);
  return $(".modal", s);
}
function closeOverlays() { $$(".scrim,.lightbox,.menu,.aa").forEach(x => x.remove()); }
function confirmDlg({ title, body, ok = "Confirm", danger = false }) {
  return new Promise(res => {
    const m = overlay(`<h2>${esc(title)}</h2><p class="muted">${esc(body)}</p>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(ok)}</button></div>`);
    $("[data-no]", m).onclick = () => { closeOverlays(); res(false); };
    $("[data-yes]", m).onclick = () => { closeOverlays(); res(true); };
    $("[data-yes]", m).focus();
  });
}
function lightbox(src, alt) {
  closeOverlays();
  const lb = document.createElement("div"); lb.className = "lightbox";
  lb.innerHTML = `<div class="lb-stage"><img src="${esc(src)}" alt="${esc(alt)}"></div>
    <div class="lb-bar">
      <button class="iconbtn" data-zo>${ic("zoomout")}</button>
      <button class="iconbtn" data-zr>${ic("reset")}</button>
      <button class="iconbtn" data-zi>${ic("zoomin")}</button>
      <button class="iconbtn" data-x>${ic("x")}</button></div>`;
  document.body.appendChild(lb);
  const img = $("img", lb); let z = 1, px = 0, py = 0, drag = null;
  const apply = () => img.style.transform = `translate(${px}px,${py}px) scale(${z})`;
  const setZ = v => { z = clamp(v, 1, 5); if (z === 1) { px = py = 0; } apply(); };
  $("[data-zi]", lb).onclick = () => setZ(z + .5);
  $("[data-zo]", lb).onclick = () => setZ(z - .5);
  $("[data-zr]", lb).onclick = () => setZ(1);
  $("[data-x]", lb).onclick = () => lb.remove();
  $(".lb-stage", lb).addEventListener("pointerdown", e => { if (z > 1) { drag = { x: e.clientX - px, y: e.clientY - py }; img.setPointerCapture(e.pointerId); } });
  img.addEventListener("pointermove", e => { if (drag) { px = e.clientX - drag.x; py = e.clientY - drag.y; apply(); } });
  img.addEventListener("pointerup", () => drag = null);
  img.addEventListener("dblclick", () => setZ(z > 1 ? 1 : 2.5));
  lb.addEventListener("wheel", e => { e.preventDefault(); setZ(z + (e.deltaY < 0 ? .3 : -.3)); }, { passive: false });
}
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn,.opt,.chip,.iconbtn,.tocrow"); if (!b || reduced()) return;
  const r = b.getBoundingClientRect(), s = document.createElement("span");
  s.className = "ripple"; const d = Math.max(r.width, r.height);
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s); s.addEventListener("animationend", () => s.remove());
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeOverlays(); });
function countUp(el, to) {
  if (reduced()) { el.textContent = fmtN(to); return; }
  const t0 = performance.now(), dur = 650;
  (function f(t) { const p = clamp((t - t0) / dur, 0, 1); el.textContent = fmtN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); })(t0);
}
function ringSVG(pct, size, stroke, color, label) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle class="tr" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="vl" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${color}"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - clamp(pct, 0, 1))}"/>
    ${label != null ? `<text x="50%" y="50%" transform="rotate(90 ${size / 2} ${size / 2})" text-anchor="middle" dominant-baseline="central" fill="var(--text)" style="font:700 ${size / 4.2}px var(--font-m)">${label}</text>` : ""}</svg>`;
}
function animRings(root) { requestAnimationFrame(() => requestAnimationFrame(() => $$(".ring .vl", root).forEach(v => v.style.strokeDashoffset = v.dataset.off))); }
function confetti() {
  if (reduced()) return;
  const cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;z-index:96;pointer-events:none";
  cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
  const ctx = cv.getContext("2d"), colors = ["#35E0C4", "#57A9FF", "#FFB224", "#F472B6", "#3ADE7C", "#B78CFF"];
  const ps = Array.from({ length: 70 }, () => ({ x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, s: Math.random() * 6 + 4, c: colors[Math.random() * colors.length | 0], r: Math.random() * Math.PI }));
  const t0 = performance.now();
  (function f(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .28; p.r += .1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
    if (t - t0 < 1500) requestAnimationFrame(f); else cv.remove();
  })(t0);
}

/* ---------- app state + session persistence ---------- */
const S = { resources: [], stats: null };
const sessKey = f => "mg-session-" + f;
const loadSession = f => { try { return JSON.parse(localStorage.getItem(sessKey(f)) || "null"); } catch { return null; } };
const saveSession = s => localStorage.setItem(sessKey(s.folder), JSON.stringify(s));
const clearSession = f => localStorage.removeItem(sessKey(f));
function latestSession() {
  let best = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("mg-session-")) { const s = loadSession(k.slice(11)); if (s && (!best || s.ts > best.ts)) best = s; }
  }
  return best;
}
const tocKey = f => "mg-toc-" + f;
const loadToc = f => { try { return JSON.parse(localStorage.getItem(tocKey(f)) || "null") || [{ id: 0, name: "" }]; } catch { return [{ id: 0, name: "" }]; } };
const saveToc = (f, stack) => localStorage.setItem(tocKey(f), JSON.stringify(stack));
const resByFolder = f => S.resources.find(r => r.folder === f);
function packIcon(r, size = 52) {
  if (r.icon && backend.fileSrc) return `<img class="picon" style="width:${size}px;height:${size}px" src="${esc(backend.fileSrc(r.icon))}" alt="">`;
  const g = r.rtype === "qbank" ? "linear-gradient(135deg,#2E5FCC,#57A9FF)" : r.rtype === "flashcard" ? "linear-gradient(135deg,#C2418F,#F472B6)" : "linear-gradient(135deg,#7C4FD0,#B78CFF)";
  return `<span class="picon" style="width:${size}px;height:${size}px;background:${g}">${esc((r.name || "?").trim()[0].toUpperCase())}</span>`;
}
const doneLabel = r => r.rtype === "qbank" ? `${fmtN(r.done)}/${fmtN(r.total)} answered` : r.rtype === "flashcard" ? `${fmtN(r.done)}/${fmtN(r.total)} known` : `${fmtN(r.done)}/${fmtN(r.total)} read`;

/* ---------- shell + router ---------- */
function shell() {
  $("#app").innerHTML = `
    <header class="head">
      ${LOGO}<span class="brand">Med<b>GURU</b></span><span class="sp"></span>
      <button class="iconbtn" id="sndBtn" title="Sound"></button>
      <button class="iconbtn" id="thBtn" title="Theme"></button>
    </header>
    <main class="view" id="view"></main>
    <nav class="nav">
      <button data-nav="home">${ic("home")}<span>Study</span></button>
      <button data-nav="packs">${ic("packs")}<span>Packs</span></button>
      <button data-nav="settings">${ic("settings")}<span>Settings</span></button>
    </nav>`;
  $$(".nav button").forEach(b => b.onclick = () => { sfx.tap(); nav("#/" + b.dataset.nav); });
  $("#sndBtn").onclick = () => { settings.sound = !settings.sound; saveSettings(); paintHead(); toast(settings.sound ? "Sound on" : "Sound off"); if (settings.sound) sfx.ok(); };
  $("#thBtn").onclick = () => { settings.theme = settings.theme === "paper" ? "night" : "paper"; saveSettings(); paintHead(); };
  paintHead();
}
function paintHead() {
  $("#sndBtn").innerHTML = ic(settings.sound ? "vol" : "volx");
  $("#sndBtn").classList.toggle("on", settings.sound);
  $("#thBtn").innerHTML = ic(settings.theme === "paper" ? "moon" : "sun");
}
const nav = h => { if (location.hash === h) render(); else location.hash = h; };
let timerHandle = null;
async function render() {
  closeOverlays(); clearInterval(timerHandle);
  const h = (location.hash || "#/home").slice(2);
  const seg = h.split("/").map(decodeURIComponent);
  const focus = ["session", "results", "deck", "reader"].includes(seg[0]);
  document.body.dataset.focus = focus ? "1" : "0";
  const tab = ["home"].includes(seg[0]) ? "home" : seg[0] === "settings" ? "settings" : "packs";
  $$(".nav button").forEach(b => b.classList.toggle("on", b.dataset.nav === tab));
  const v = $("#view"); v.innerHTML = `<div class="stack"><div class="skel" style="height:120px"></div><div class="skel" style="height:80px"></div><div class="skel" style="height:80px"></div></div>`;
  window.scrollTo(0, 0);
  try {
    switch (seg[0]) {
      case "home": return await viewHome(v);
      case "packs": return await viewPacks(v);
      case "settings": return await viewSettings(v);
      case "pack": return await viewPack(v, seg[1]);
      case "toc": return await viewToc(v, seg[1], +seg[2] || 0);
      case "bookmarks": return await viewBookmarks(v, seg[1]);
      case "reader": return await viewReader(v, seg[1], +seg[2]);
      case "session": return await viewSession(v, seg[1]);
      case "results": return await viewResults(v, seg[1]);
      case "deck": return await viewDeck(v, seg[1], +seg[2]);
      default: return await viewHome(v);
    }
  } catch (err) {
    v.innerHTML = `<div class="card pad empty"><h2>Something went wrong</h2><p class="muted">${esc(err.message || err)}</p>
      <button class="btn primary" onclick="location.hash='#/home'">Back to Study</button></div>`;
  }
}

/* ---------- HOME ---------- */
async function viewHome(v) {
  const [stats, resources] = await Promise.all([cmd("stats", { tzOffset: new Date().getTimezoneOffset() }), cmd("list_resources")]);
  S.resources = resources; S.stats = stats;
  const acc = stats.answered ? Math.round(stats.correct / stats.answered * 100) : 0;
  const max = Math.max(1, ...stats.week);
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return "SMTWTFS"[d.getDay()]; });
  const recent = latestSession(); const recentRes = recent && resByFolder(recent.folder);
  const qbanks = resources.filter(r => r.rtype === "qbank");
  v.innerHTML = `<div class="stack">
    ${backend.isDemo ? `<div class="demo-banner enter">${ic("bolt", "sm")} Preview mode — install the Android app to import your own packs.</div>` : ""}
    <section class="card hero enter" style="--i:0">
      <div class="muted" style="font-size:.8em;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      <h1>Med<b>GURU</b></h1>
      <svg class="pulse" viewBox="0 0 340 36" preserveAspectRatio="none"><path d="M2 18 H70 L82 18 90 6 102 30 114 2 126 26 134 18 H200 L210 18 216 10 226 26 234 18 H338"/></svg>
      <div class="muted" style="font-size:.85em">Offline. Yours. Just study. <span class="faint">· by Dr Sarwar Alam</span></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn primary" id="quick10">${ic("bolt")} Quick 10</button>
        <button class="btn ghost" id="goImport">${ic("import")} Import pack</button>
      </div>
    </section>
    <section class="stats">
      ${[["Questions answered", stats.answered, "var(--teal)"], ["Accuracy", acc + "%", "var(--green)"], ["Cards known", stats.cards_known, "var(--magenta)"], ["Articles read", stats.articles_read, "var(--violet)"]]
      .map(([l, n, c], i) => `<div class="card stat enter" style="--i:${i + 1};--c:${c}"><div class="n" data-n="${typeof n === "number" ? n : ""}">${typeof n === "number" ? "0" : n}</div><div class="l">${l}</div></div>`).join("")}
    </section>
    <section class="card pad enter" style="--i:5">
      <div class="row"><h3 class="grow" style="font-size:1.05em">Your week</h3><span class="mono muted" style="font-size:.85em">${fmtN(stats.today)} today</span></div>
      <div class="week">${stats.week.map((n, i) => `<div class="d ${i === 6 ? "today" : ""}"><div class="b" data-h="${Math.round(n / max * 100)}" style="height:4px"></div><span>${days[i]}</span></div>`).join("")}</div>
      ${stats.answered === 0 ? `<p class="faint" style="font-size:.85em;margin:4px 0 0">Your week starts with one question. Tap <b>Quick 10</b>.</p>` : ""}
    </section>
    ${recentRes ? `<section class="card continue enter" style="--i:6">
      ${packIcon(recentRes, 46)}
      <div class="grow"><div style="font-weight:700">${esc(recentRes.name)}</div>
      <div class="muted" style="font-size:.82em">Resume session · ${recent.i + 1}/${recent.ids.length}</div></div>
      <button class="btn sm primary" id="resumeBtn">Resume</button></section>` : ""}
    <section class="enter" style="--i:7">
      <div class="row" style="margin-bottom:10px"><h3 class="grow" style="font-size:1.05em">Your packs</h3>
      <button class="btn sm ghost" onclick="location.hash='#/packs'">All packs ${ic("chev", "sm")}</button></div>
      <div class="stack">${resources.slice(0, 4).map((r, i) => packRow(r, i)).join("") || emptyPacks()}</div>
    </section>
  </div>`;
  $$(".stat .n[data-n]", v).forEach(el => { if (el.dataset.n !== "") countUp(el, +el.dataset.n); });
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".week .b", v).forEach(b => b.style.height = Math.max(6, +b.dataset.h) + "%")));
  bindPackRows(v);
  $("#quick10", v).onclick = async () => {
    if (!qbanks.length) return toast("Import a qbank pack first.");
    const r = qbanks[0];
    const ids = await cmd("build_session", { folder: r.folder, subject: null, system: null, count: 10, status: "unseen", order: "random" });
    const ids2 = ids.length ? ids : await cmd("build_session", { folder: r.folder, subject: null, system: null, count: 10, status: "any", order: "random" });
    if (!ids2.length) return toast("No questions in this pack.");
    startSession(r.folder, ids2, { quick: true });
  };
  $("#goImport", v).onclick = importFlow;
  const rb = $("#resumeBtn", v); if (rb) rb.onclick = () => nav("#/session/" + encodeURIComponent(recent.folder));
}
function emptyPacks() {
  return `<div class="card empty">
    <svg viewBox="0 0 120 90" fill="none"><rect x="20" y="30" width="80" height="46" rx="8" stroke="var(--line2)" stroke-width="2.5"/><path d="M20 42h80M45 30l6-14h18l6 14" stroke="var(--line2)" stroke-width="2.5"/><path d="M36 60h14l5-9 7 16 6-11 4 4h12" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h3>No packs yet</h3><p class="muted" style="font-size:.9em">Import a ZIP containing one folder with a SQLite database.<br>Qbanks, flashcards and article libraries all work.</p>
    <button class="btn primary" data-import>${ic("import")} Import your first pack</button></div>`;
}
function packRow(r, i) {
  const pct = r.total ? r.done / r.total : 0;
  return `<div class="card pack enter" style="--i:${i}" data-folder="${esc(r.folder)}" role="button" tabindex="0">
    ${packIcon(r)}
    <div class="grow"><div class="row"><h3 class="grow">${esc(r.name)}</h3><span class="badge ${r.rtype}">${r.rtype}</span></div>
      <div class="meta">${esc(r.publisher || "Local pack")} · ${doneLabel(r)}</div>
      <div class="pbar"><i data-w="${Math.round(pct * 100)}" style="width:0"></i></div></div>
    ${ic("chev", "sm")}</div>`;
}
function bindPackRows(v) {
  $$(".pack[data-folder]", v).forEach(p => {
    const go = () => nav("#/pack/" + encodeURIComponent(p.dataset.folder));
    p.onclick = go; p.onkeydown = e => { if (e.key === "Enter") go(); };
  });
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".pbar i", v).forEach(b => b.style.width = b.dataset.w + "%")));
  $$("[data-import]", v).forEach(b => b.onclick = importFlow);
}

/* ---------- PACKS ---------- */
async function viewPacks(v) {
  S.resources = await cmd("list_resources");
  let filter = "all", query = "", sort = "name";
  v.innerHTML = `<div class="stack">
    <div class="row enter" style="--i:0"><h2 class="grow">Packs</h2><button class="btn primary sm" id="impBtn">${ic("import", "sm")} Import ZIP</button></div>
    <div class="enter" style="--i:1;position:relative"><input type="search" id="pq" placeholder="Search packs…" style="padding-left:38px">
      <svg class="ic sm" style="position:absolute;left:12px;top:13px;color:var(--faint)"><use href="#i-search"/></svg></div>
    <div class="row enter" style="--i:2;flex-wrap:wrap" id="chips">
      ${[["all", "All"], ["qbank", "Qbanks"], ["flashcard", "Cards"], ["library", "Libraries"]].map(([k, l]) => `<button class="chip ${k === "all" ? "on" : ""}" data-f="${k}">${l} <span class="mono" data-c="${k}"></span></button>`).join("")}
      <span class="grow"></span>
      <select id="psort" style="width:auto;padding:8px 34px 8px 12px"><option value="name">Name</option><option value="progress">Progress</option><option value="size">Size</option></select>
    </div>
    <div class="stack" id="plist"></div></div>`;
  const list = $("#plist", v);
  function paint() {
    let rs = S.resources.filter(r => (filter === "all" || r.rtype === filter) && (r.name + " " + (r.publisher || "")).toLowerCase().includes(query.toLowerCase()));
    rs.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "progress" ? (b.done / (b.total || 1)) - (a.done / (a.total || 1)) : b.total - a.total);
    $$("[data-c]", v).forEach(c => { const k = c.dataset.c; c.textContent = k === "all" ? S.resources.length : S.resources.filter(r => r.rtype === k).length; });
    list.innerHTML = rs.map((r, i) => `<div style="position:relative" class="enter" data-wrap="${esc(r.folder)}">
      ${packRow(r, i)}
      <button class="iconbtn" data-menu="${esc(r.folder)}" style="position:absolute;right:44px;top:8px;width:34px;height:34px">${ic("more", "sm")}</button></div>`).join("") || (S.resources.length ? `<div class="card pad empty"><p class="muted">No packs match.</p></div>` : emptyPacks());
    bindPackRows(list);
    $$("[data-menu]", list).forEach(b => b.onclick = e => {
      e.stopPropagation(); closeOverlays();
      const r = resByFolder(b.dataset.menu);
      const m = document.createElement("div"); m.className = "menu";
      m.innerHTML = `<button data-open>${ic("chev", "sm")} Open</button><button class="red" data-del>${ic("trash", "sm")} Delete pack</button>`;
      b.parentElement.appendChild(m);
      $("[data-open]", m).onclick = () => { closeOverlays(); nav("#/pack/" + encodeURIComponent(r.folder)); };
      $("[data-del]", m).onclick = async () => {
        closeOverlays();
        if (!await confirmDlg({ title: "Delete “" + r.name + "”?", body: "The pack files are removed. Your progress is kept — re-importing the same pack restores it.", ok: "Delete", danger: true })) return;
        const trash = await cmd("delete_resource", { folder: r.folder });
        S.resources = await cmd("list_resources"); paint();
        toast("Pack deleted", { label: "Undo", fn: async () => { await cmd("restore_resource", { trash }); S.resources = await cmd("list_resources"); paint(); toast("Pack restored"); } });
      };
    });
  }
  paint();
  $("#impBtn", v).onclick = importFlow;
  $("#pq", v).oninput = e => { query = e.target.value; paint(); };
  $("#psort", v).onchange = e => { sort = e.target.value; paint(); };
  $$("#chips .chip", v).forEach(c => c.onclick = () => { filter = c.dataset.f; $$("#chips .chip", v).forEach(x => x.classList.toggle("on", x === c)); paint(); });
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".menu,[data-menu]")) $$(".menu").forEach(m => m.remove()); });
}

/* ---------- IMPORT ---------- */
async function importFlow() {
  if (backend.isDemo) {
    overlay(`<h2>Import works in the Android app</h2>
      <p class="muted">This browser preview uses the built-in sample packs. Install the MedGURU APK (GitHub → Actions → <b>MedGURU-APK</b> artifact) to import your own ZIP packs — qbanks, flashcards and libraries.</p>
      <button class="btn primary block" style="margin-top:14px" onclick="document.querySelector('.scrim').remove()">Got it</button>`);
    return;
  }
  let picked;
  try {
    picked = await T.core.invoke("plugin:dialog|open", { options: { multiple: false, filters: [{ name: "Study pack", extensions: ["zip"] }] } });
  } catch (e) { return toast("Could not open the file picker."); }
  if (!picked) return;
  const m = overlay(`<h2>Importing pack</h2>
    <svg class="ecgload" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="M2 22 H60 L70 22 78 8 90 36 102 4 114 30 122 22 H180 L188 22 194 14 204 30 212 22 H298"/></svg>
    <div class="row"><span class="grow muted" id="impStage">Copying file…</span><span class="mono" id="impPct">0%</span></div>
    <div class="prog" style="margin-top:8px"><i id="impBar" style="width:2%"></i></div>`);
  const setP = (pct, stage) => { const b = $("#impBar", m), s = $("#impStage", m), p = $("#impPct", m); if (b) b.style.width = pct + "%"; if (s && stage) s.textContent = stage; if (p) p.textContent = Math.round(pct) + "%"; };
  let unlisten = null;
  try {
    unlisten = await backend.onImport(pl => { if (pl.stage === "extract") setP(10 + pl.pct * .8, "Extracting…"); else if (pl.stage === "validate") setP(92, "Validating database…"); });
    const dir = await cmd("app_data_dir");
    await T.core.invoke("plugin:fs|copy_file", { fromPath: picked, toPath: dir + "/incoming.zip" });
    setP(10, "Extracting…");
    const res = await cmd("import_zip", { zipName: "incoming.zip" });
    setP(100, "Done");
    sfx.done(); buzz(20);
    m.innerHTML = `<div class="row">${packIcon(res, 56)}<div class="grow"><h2 style="margin:0">${esc(res.name)}</h2>
      <div class="muted" style="font-size:.85em">${res.rtype} · ${fmtN(res.total)} ${res.rtype === "library" ? "articles" : res.rtype === "flashcard" ? "cards" : "questions"}</div></div></div>
      <div class="verdict ok" style="margin-top:14px">${ic("check")} Imported successfully</div>
      <div class="row" style="margin-top:14px"><button class="btn ghost grow" data-close>Close</button>
      <button class="btn primary grow" data-open>Open pack</button></div>`;
    $("[data-close]", m).onclick = () => { closeOverlays(); render(); };
    $("[data-open]", m).onclick = () => { closeOverlays(); nav("#/pack/" + encodeURIComponent(res.folder)); };
    S.resources = await cmd("list_resources");
  } catch (err) {
    sfx.bad();
    m.innerHTML = `<h2>Import failed</h2><div class="verdict bad">${ic("x")} ${esc(err.message || err)}</div>
      <p class="muted" style="font-size:.88em;margin-top:10px">The ZIP must contain exactly one top-level folder with a SQLite database (.db / .sqlite / .sqlite3 / .bin). Lexi-Drugs, VisualDX and Access-Medicine packs are not supported yet.</p>
      <button class="btn primary block" data-close>Close</button>`;
    $("[data-close]", m).onclick = closeOverlays;
  } finally { if (unlisten) { try { unlisten(); } catch {} } }
}

/* ---------- PACK LANDING ---------- */
async function viewPack(v, folder) {
  const r = resByFolder(folder) || (await cmd("list_resources")).find(x => x.folder === folder);
  if (!r) throw new Error("Pack not found. It may have been deleted.");
  S.resources = await cmd("list_resources");
  if (r.rtype === "qbank") return viewQSetup(v, r);
  if (r.rtype === "flashcard") return viewDecks(v, r);
  return viewToc(v, folder, 0);
}

/* ---------- QBANK SETUP ---------- */
async function viewQSetup(v, r) {
  const meta = await cmd("qbank_meta", { folder: r.folder });
  const saved = loadSession(r.folder);
  let subject = null, system = null, count = 20, status = "any", order = "random";
  v.innerHTML = `<div class="stack" style="max-width:640px;margin:0 auto">
    <div class="row enter" style="--i:0"><button class="iconbtn" onclick="location.hash='#/packs'">${ic("back")}</button>
      ${packIcon(r, 44)}<div class="grow"><h2 style="font-size:1.2em">${esc(r.name)}</h2><div class="muted" style="font-size:.8em">${fmtN(meta.total)} questions · ${esc(r.publisher || "")}</div></div></div>
    ${saved ? `<div class="card continue enter" style="--i:1"><div class="grow"><b>Resume session</b><div class="muted" style="font-size:.82em">${saved.i + 1}/${saved.ids.length} · ${saved.score} correct so far</div></div>
      <button class="btn sm primary" id="resumeS">Resume</button><button class="btn sm ghost" id="dropS">Discard</button></div>` : ""}
    <div class="card pad stack enter" style="--i:2">
      <div class="field"><label>Subject</label><select id="fSub"><option value="">All subjects</option>${meta.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label>System</label><select id="fSys"><option value="">All systems</option>${meta.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Questions</label>
        <div class="row"><button class="btn sm ghost" id="cMinus">${ic("minus", "sm")}</button>
        <span class="mono grow" style="text-align:center;font-size:1.4em;font-weight:700" id="cVal">20</span>
        <button class="btn sm ghost" id="cPlus">${ic("plus", "sm")}</button></div>
        <div class="row" style="justify-content:center">${[10, 20, 40, 100].map(n => `<button class="chip" data-n="${n}">${n}</button>`).join("")}</div></div>
      <div class="field"><label>Status</label><div class="seg" id="fStatus">
        ${[["any", "All"], ["unseen", "Unseen"], ["incorrect", "Missed"], ["marked", "Flagged"]].map(([k, l], i) => `<button data-k="${k}" class="${i === 0 ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="field"><label>Order</label><div class="seg" id="fOrder">
        <button data-k="random" class="on">Random</button><button data-k="qid">By QID</button></div></div>
    </div>
    <button class="btn primary block enter" style="--i:3" id="startBtn">${ic("bolt")} Start · <span id="avail">…</span> available</button>
  </div>`;
  const avail = $("#avail", v);
  async function refresh() {
    const n = await cmd("pool_count", { folder: r.folder, subject, system, status });
    avail.textContent = fmtN(n);
    $("#startBtn", v).toggleAttribute("disabled", n === 0);
  }
  $("#fSub", v).onchange = e => { subject = e.target.value ? +e.target.value : null; refresh(); };
  $("#fSys", v).onchange = e => { system = e.target.value ? +e.target.value : null; refresh(); };
  const setC = n => { count = clamp(n, 1, 200); $("#cVal", v).textContent = count; };
  $("#cMinus", v).onclick = () => setC(count - 5);
  $("#cPlus", v).onclick = () => setC(count + 5);
  $$("[data-n]", v).forEach(b => b.onclick = () => setC(+b.dataset.n));
  $$("#fStatus button", v).forEach(b => b.onclick = () => { status = b.dataset.k; $$("#fStatus button", v).forEach(x => x.classList.toggle("on", x === b)); refresh(); });
  $$("#fOrder button", v).forEach(b => b.onclick = () => { order = b.dataset.k; $$("#fOrder button", v).forEach(x => x.classList.toggle("on", x === b)); });
  $("#startBtn", v).onclick = async () => {
    const ids = await cmd("build_session", { folder: r.folder, subject, system, count, status, order });
    if (!ids.length) return toast("No questions match these filters.");
    startSession(r.folder, ids, { subject, system, status, order });
  };
  const rs = $("#resumeS", v); if (rs) rs.onclick = () => nav("#/session/" + encodeURIComponent(r.folder));
  const ds = $("#dropS", v); if (ds) ds.onclick = () => { clearSession(r.folder); render(); };
  refresh();
}
function startSession(folder, ids, filters) {
  saveSession({ folder, ids, i: 0, answers: {}, score: 0, elapsed: 0, startTs: Date.now(), ts: Date.now(), filters });
  nav("#/session/" + encodeURIComponent(folder));
}

/* ---------- SESSION ---------- */
async function viewSession(v, folder) {
  const s = loadSession(folder);
  if (!s) return nav("#/pack/" + encodeURIComponent(folder));
  const r = resByFolder(folder);
  let submitted = false, chosen = new Set(), q = null;
  const total = s.ids.length;
  v.innerHTML = `<div class="sess">
    <div class="topbar">
      <button class="iconbtn" id="quit">${ic("back")}</button>
      <div class="grow"><div class="title">${esc(r?.name || folder)}</div>
        <div class="prog" style="margin-top:5px"><i id="sprog"></i></div></div>
      <span class="mono muted" id="scount" style="font-size:.85em"></span>
      <span class="mono muted" id="stime" style="font-size:.85em">${ic("timer", "sm")}</span>
      <button class="iconbtn" id="markBtn" title="Flag question">${ic("flag")}</button>
    </div>
    <div id="qbody" class="stack"></div>
    <div class="sessfoot" id="qfoot"></div></div>`;
  const body = $("#qbody", v), foot = $("#qfoot", v);
  const t0 = Date.now();
  timerHandle = setInterval(() => {
    const el = $("#stime", v); if (!el) return clearInterval(timerHandle);
    const secs = s.elapsed + Math.floor((Date.now() - t0) / 1000);
    el.innerHTML = `${ic("timer", "sm")} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }, 1000);
  $("#quit", v).onclick = () => { s.elapsed += Math.floor((Date.now() - t0) / 1000); s.ts = Date.now(); saveSession(s); toast("Session saved — resume anytime."); nav("#/pack/" + encodeURIComponent(folder)); };
  async function loadQ() {
    submitted = false; chosen = new Set();
    $("#scount", v).textContent = `${s.i + 1}/${total}`;
    $("#sprog", v).style.width = (s.i / total * 100) + "%";
    body.innerHTML = `<div class="skel" style="height:140px"></div><div class="skel" style="height:56px"></div><div class="skel" style="height:56px"></div>`;
    q = await cmd("get_question", { folder, id: s.ids[s.i] });
    $("#markBtn", v).classList.toggle("on", !!q.marked);
    const multi = corrLetters(q.corr_ans).length > 1;
    body.innerHTML = `
      ${q.media.length ? `<div class="card pad">${q.media.map(m => mediaImg(m, r)).join("")}</div>` : ""}
      <div class="card qstem content" id="stem"></div>
      ${multi ? `<div><span class="chip on">${ic("check", "sm")} Select all that apply</span></div>` : ""}
      <div class="stack" id="opts" style="gap:10px"></div>
      <div id="after"></div>`;
    mountContent($("#stem", body), q.question, r?.media_dir);
    bindLb(body);
    const opts = $("#opts", body);
    opts.innerHTML = q.answers.map(a => `<button class="opt" data-l="${a.letter}">
      <span class="let">${a.letter}</span><span class="grow"><span class="content" data-t></span>
      <span class="pctbar" hidden><i data-p="${a.pct}"></i></span></span></button>`).join("");
    $$(".opt", opts).forEach((b, i) => {
      mountContent($("[data-t]", b), q.answers[i].text, r?.media_dir);
      b.onclick = () => {
        if (submitted) return;
        sfx.tap(); buzz();
        const L = b.dataset.l;
        if (multi) { chosen.has(L) ? chosen.delete(L) : chosen.add(L); }
        else { chosen = new Set([L]); }
        $$(".opt", opts).forEach(x => x.classList.toggle("picked", chosen.has(x.dataset.l)));
        paintFoot();
      };
    });
    paintFoot();
    window.scrollTo(0, 0);
  }
  function paintFoot() {
    if (submitted) {
      foot.innerHTML = `<button class="btn primary block" id="nextBtn">${s.i + 1 >= total ? "Finish session" : "Next question"} ${ic("chev", "sm")}</button>`;
      $("#nextBtn", foot).onclick = () => {
        s.elapsed += Math.floor((Date.now() - t0) / 1000);
        if (s.i + 1 >= total) { s.ts = Date.now(); saveSession(s); nav("#/results/" + encodeURIComponent(folder)); }
        else { s.i++; s.ts = Date.now(); saveSession(s); loadQ(); }
      };
    } else {
      foot.innerHTML = `<button class="btn primary block" id="subBtn" ${chosen.size ? "" : "disabled"}>Submit answer</button>`;
      $("#subBtn", foot).onclick = submit;
    }
  }
  async function submit() {
    if (!chosen.size || submitted) return;
    submitted = true;
    const correct = corrLetters(q.corr_ans);
    const mine = [...chosen].sort();
    const ok = mine.join(",") === correct.slice().sort().join(",");
    s.answers[q.id] = { chosen: mine, correct: ok };
    if (ok) s.score++;
    s.ts = Date.now(); saveSession(s);
    await cmd("save_answer", { folder, qid: q.id, chosen: mine.join(","), correct: ok });
    ok ? sfx.ok() : sfx.bad(); buzz(ok ? 12 : [30, 40, 30]);
    const cset = new Set(correct);
    $$(".opt", body).forEach(b => {
      const L = b.dataset.l; b.disabled = true;
      b.classList.remove("picked");
      if (cset.has(L)) b.classList.add("is-correct");
      else if (chosen.has(L)) b.classList.add("is-wrong");
      else b.classList.add("is-dim");
      const bar = $(".pctbar", b); bar.hidden = false;
      requestAnimationFrame(() => $("i", bar).style.width = clamp(+$("i", bar).dataset.p, 0, 100) + "%");
    });
    const after = $("#after", body);
    after.innerHTML = `
      <div class="verdict ${ok ? "ok" : "bad"}">${ic(ok ? "check" : "x")} ${ok ? "Correct!" : "Not quite — correct: " + correct.join(", ")}</div>
      <div class="card expl" style="margin-top:12px"><h3>Explanation</h3><div class="content" id="expl"></div>
      ${q.refs.length ? `<div class="refs">${q.refs.map(x => `<span>📖 ${esc(x.title)}</span>`).join("")}</div>` : ""}</div>`;
    mountContent($("#expl", after), q.explanation, r?.media_dir);
    paintFoot();
    after.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
  }
  $("#markBtn", v).onclick = async () => {
    if (!q) return;
    const on = await cmd("toggle_mark", { folder, qid: q.id });
    q.marked = on; $("#markBtn", v).classList.toggle("on", on);
    toast(on ? "Flagged for review" : "Flag removed");
  };
  loadQ();
}
function corrLetters(c) {
  c = String(c || "").trim();
  if (!c) return [];
  return (c.includes(",") ? c.split(",") : c.split("")).map(x => x.trim().toUpperCase()).filter(Boolean);
}
function mediaImg(name, r) {
  const url = r?.media_dir && backend.fileSrc ? backend.fileSrc(r.media_dir + "/" + name) : null;
  return url ? `<img data-lb src="${esc(url)}" alt="" style="max-width:100%;border-radius:12px;cursor:zoom-in">`
    : `<span class="img-missing">🖼 ${esc(name)}</span>`;
}
function bindLb(root) { $$("img[data-lb]", root).forEach(im => im.onclick = () => lightbox(im.src, im.alt || "")); }

/* ---------- RESULTS ---------- */
async function viewResults(v, folder) {
  const s = loadSession(folder);
  if (!s) return nav("#/pack/" + encodeURIComponent(folder));
  const r = resByFolder(folder);
  const total = s.ids.length, acc = total ? s.score / total : 0;
  const wrong = s.ids.filter(id => s.answers[id] && !s.answers[id].correct);
  const secs = s.elapsed;
  v.innerHTML = `<div class="results">
    <div class="muted enter" style="--i:0;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:.78em">Session complete</div>
    <h1 class="enter" style="--i:1;font-size:1.6em">${esc(r?.name || folder)}</h1>
    <div class="enter" style="--i:2">${ringSVG(acc, 170, 13, acc >= .8 ? "var(--green)" : acc >= .5 ? "var(--amber)" : "var(--red)", Math.round(acc * 100) + "%")}</div>
    <div class="enter" style="--i:3"><span class="big">${s.score}</span><span class="muted" style="font-size:1.3em"> / ${total}</span></div>
    <div class="row enter" style="--i:4;gap:20px">
      <span class="mono muted">${ic("timer", "sm")} ${Math.floor(secs / 60)}m ${secs % 60}s</span>
      <span class="mono" style="color:var(--green)">${s.score} correct</span>
      <span class="mono" style="color:var(--red)">${total - s.score} missed</span></div>
    <div class="row enter" style="--i:5;flex-wrap:wrap;justify-content:center">
      ${wrong.length ? `<button class="btn primary" id="retryWrong">${ic("reset")} Retry ${wrong.length} missed</button>` : ""}
      <button class="btn ghost" id="newSess">New session</button>
      <button class="btn ghost" id="homeBtn">Home</button></div>
    <div class="stack enter" style="--i:6;width:100%;margin-top:8px">
      <h3 style="font-size:1em;text-align:left">Review answers</h3>
      ${s.ids.map((id, i) => { const a = s.answers[id]; return `<button class="review-item" data-rev="${i}">
        <span class="dot" style="background:${a ? (a.correct ? "var(--green)" : "var(--red)") : "var(--faint)"}"></span>
        <span class="mono muted" style="width:34px">${i + 1}</span>
        <span class="grow muted" style="font-size:.88em">${a ? (a.correct ? "Correct" : "You chose " + a.chosen.join(", ")) : "Skipped"}</span>${ic("chev", "sm")}</button>`; }).join("")}
    </div></div>`;
  animRings(v);
  if (acc >= .8) { confetti(); sfx.done(); }
  $("#homeBtn", v).onclick = () => { clearSession(folder); nav("#/home"); };
  $("#newSess", v).onclick = () => { clearSession(folder); nav("#/pack/" + encodeURIComponent(folder)); };
  const rw = $("#retryWrong", v); if (rw) rw.onclick = () => { clearSession(folder); startSession(folder, wrong, { retry: true }); };
  $$("[data-rev]", v).forEach(b => b.onclick = () => reviewQuestion(folder, +b.dataset.rev));
}
async function reviewQuestion(folder, idx) {
  const s = loadSession(folder); const r = resByFolder(folder);
  const q = await cmd("get_question", { folder, id: s.ids[idx] });
  const a = s.answers[q.id]; const cset = new Set(corrLetters(q.corr_ans));
  const m = overlay(`<div class="row"><span class="mono muted">Q${idx + 1}/${s.ids.length}</span><span class="grow"></span>
    <button class="iconbtn" data-x>${ic("x")}</button></div>
    <div class="content" id="rvStem" style="margin-top:8px"></div>
    <div class="stack" style="gap:8px;margin-top:12px" id="rvOpts"></div>
    <div class="verdict ${a?.correct ? "ok" : "bad"}" style="margin-top:12px">${a ? (a.correct ? "You got this right" : "You chose " + a.chosen.join(", ") + " · correct: " + [...cset].join(", ")) : "Skipped"}</div>
    <div class="content" id="rvExpl" style="margin-top:12px"></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost grow" data-prev ${idx === 0 ? "disabled" : ""}>${ic("back", "sm")} Prev</button>
    <button class="btn ghost grow" data-next ${idx >= s.ids.length - 1 ? "disabled" : ""}>Next ${ic("chev", "sm")}</button></div>`);
  m.style.maxWidth = "640px";
  mountContent($("#rvStem", m), q.question, r?.media_dir);
  $("#rvOpts", m).innerHTML = q.answers.map(x => `<div class="opt ${cset.has(x.letter) ? "is-correct" : a?.chosen.includes(x.letter) ? "is-wrong" : "is-dim"}">
    <span class="let">${x.letter}</span><span class="content grow" data-t></span></div>`).join("");
  $$("#rvOpts [data-t]", m).forEach((el, i) => mountContent(el, q.answers[i].text, r?.media_dir));
  mountContent($("#rvExpl", m), q.explanation, r?.media_dir);
  $("[data-x]", m).onclick = closeOverlays;
  $("[data-prev]", m).onclick = () => reviewQuestion(folder, idx - 1);
  $("[data-next]", m).onclick = () => reviewQuestion(folder, idx + 1);
}

/* ---------- FLASHCARDS ---------- */
async function viewDecks(v, r) {
  const decks = await cmd("flash_decks", { folder: r.folder });
  v.innerHTML = `<div class="stack" style="max-width:640px;margin:0 auto">
    <div class="row enter" style="--i:0"><button class="iconbtn" onclick="location.hash='#/packs'">${ic("back")}</button>
      ${packIcon(r, 44)}<div class="grow"><h2 style="font-size:1.2em">${esc(r.name)}</h2>
      <div class="muted" style="font-size:.8em">${decks.length} decks · ${fmtN(r.total)} cards</div></div></div>
    ${decks.map((d, i) => `<button class="card pack enter" style="--i:${i + 1};text-align:left" data-deck="${d.id}">
      ${ringSVG(d.count ? d.known / d.count : 0, 46, 5, "var(--magenta)")}
      <div class="grow"><h3>${esc(d.name)}</h3><div class="meta">${fmtN(d.known)}/${fmtN(d.count)} known</div></div>
      ${ic("chev", "sm")}</button>`).join("") || `<div class="card pad empty"><p class="muted">No decks found in this pack.</p></div>`}
  </div>`;
  animRings(v);
  $$("[data-deck]", v).forEach(b => b.onclick = () => nav("#/deck/" + encodeURIComponent(r.folder) + "/" + b.dataset.deck));
}
async function viewDeck(v, folder, deckId) {
  const r = resByFolder(folder);
  const cards = await cmd("flash_cards", { folder, deck: deckId });
  if (!cards.length) throw new Error("This deck is empty.");
  let queue = cards.map(c => c.id), i = 0, flipped = false, againCount = 0, knownRun = 0, done = false;
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  v.innerHTML = `<div class="sess" style="max-width:640px">
    <div class="topbar"><button class="iconbtn" id="dQuit">${ic("back")}</button>
      <div class="grow"><div class="title" id="dTitle"></div><div class="prog" style="margin-top:5px"><i id="dProg"></i></div></div>
      <span class="mono muted" id="dCount" style="font-size:.85em"></span>
      <button class="iconbtn" id="dShuf" title="Shuffle">${ic("shuffle")}</button></div>
    <div id="dBody" class="stack grow"></div></div>`;
  $("#dQuit", v).onclick = () => nav("#/pack/" + encodeURIComponent(folder));
  $("#dShuf", v).onclick = () => { queue.sort(() => Math.random() - .5); i = 0; flipped = false; toast("Deck shuffled"); paint(); };
  function paint() {
    const body = $("#dBody", v);
    if (done || i >= queue.length) {
      done = true;
      const knownTotal = cards.filter(c => c.known).length;
      body.innerHTML = `<div class="results" style="padding:20px 0">
        <div class="enter" style="--i:0">${ringSVG(cards.length ? knownTotal / cards.length : 0, 150, 12, "var(--magenta)", Math.round(knownTotal / cards.length * 100) + "%")}</div>
        <h2 class="enter" style="--i:1">Deck complete</h2>
        <p class="muted enter" style="--i:2">${knownRun} marked known this run · ${againCount} sent back for another look</p>
        <div class="row enter" style="--i:3"><button class="btn primary" id="dAgain">${ic("reset")} Study again</button>
        <button class="btn ghost" id="dBack">All decks</button></div></div>`;
      animRings(body); sfx.done();
      $("#dAgain", body).onclick = () => { queue = cards.filter(c => !c.known).map(c => c.id).concat(cards.filter(c => c.known).map(c => c.id)); if (!queue.length) queue = cards.map(c => c.id); i = 0; flipped = false; againCount = 0; knownRun = 0; done = false; paint(); };
      $("#dBack", body).onclick = () => nav("#/pack/" + encodeURIComponent(folder));
      $("#dCount", v).textContent = ""; $("#dProg", v).style.width = "100%";
      return;
    }
    const c = byId[queue[i]];
    $("#dTitle", v).textContent = c.title || "Card";
    $("#dCount", v).textContent = `${i + 1}/${queue.length}`;
    $("#dProg", v).style.width = (i / queue.length * 100) + "%";
    body.innerHTML = `
      <div class="deckcard ${flipped ? "flipped" : ""}" id="dCard">
        <div class="deckinner">
          <div class="face front"><span class="tag">Front · tap to reveal</span><div class="content grow" id="cFront"></div>
            ${c.media.map(m => mediaImg(m, r)).join("")}</div>
          <div class="face back"><span class="tag">Back</span><div class="content grow" id="cBack"></div></div>
        </div></div>
      <div class="gradebtns" id="gradeRow" ${flipped ? "" : "hidden"}>
        <button class="btn again" id="gAgain">${ic("reset")} Again</button>
        <button class="btn gotit" id="gGot">${ic("check")} Got it</button></div>
      ${flipped ? "" : `<p class="faint" style="text-align:center;font-size:.85em">Tap the card to flip · swipe after revealing to grade</p>`}`;
    mountContent($("#cFront", body), c.front, r?.media_dir);
    mountContent($("#cBack", body), c.back, r?.media_dir);
    bindLb(body);
    const card = $("#dCard", body);
    let downX = null, moved = false;
    card.addEventListener("pointerdown", e => { downX = e.clientX; moved = false; });
    card.addEventListener("pointermove", e => { if (downX != null && Math.abs(e.clientX - downX) > 12) moved = true; });
    card.addEventListener("pointerup", e => {
      const dx = downX == null ? 0 : e.clientX - downX; downX = null;
      if (flipped && Math.abs(dx) > 60) { dx > 0 ? grade(true) : grade(false); return; }
      if (!moved) { flipped = !flipped; sfx.flip(); buzz(); paint(); }
    });
    const ga = $("#gAgain", body), gg = $("#gGot", body);
    if (ga) ga.onclick = () => grade(false);
    if (gg) gg.onclick = () => grade(true);
  }
  async function grade(known) {
    const c = byId[queue[i]];
    if (known) { c.known = true; knownRun++; sfx.ok(); buzz(12); await cmd("set_card_known", { folder, cardId: c.id, known: true }); }
    else { againCount++; sfx.bad(); buzz([20, 30, 20]); queue.push(c.id); }
    i++; flipped = false; paint();
  }
  paint();
}

/* ---------- LIBRARY ---------- */
async function viewToc(v, folder, parent) {
  const r = resByFolder(folder);
  let stack = loadToc(folder);
  const idx = stack.findIndex(x => x.id === parent);
  if (idx >= 0) stack = stack.slice(0, idx + 1); else stack = [{ id: 0, name: r?.name || "Library" }];
  let entries = [], query = "", hits = null;
  v.innerHTML = `<div class="stack" style="max-width:760px;margin:0 auto">
    <div class="row enter" style="--i:0">
      <button class="iconbtn" id="tBack">${ic("back")}</button>
      <div class="grow"><h2 style="font-size:1.15em" id="tTitle">${esc(stack[stack.length - 1].name || r?.name || "Library")}</h2>
      <div class="muted" style="font-size:.78em">${esc(r?.name || "")} · ${fmtN(r?.total || 0)} articles</div></div>
      <button class="iconbtn" id="tBm" title="Bookmarks">${ic("bookmark")}</button></div>
    <div class="enter" style="--i:1;position:relative"><input type="search" id="tq" placeholder="Search this library…" style="padding-left:38px">
      <svg class="ic sm" style="position:absolute;left:12px;top:13px;color:var(--faint)"><use href="#i-search"/></svg></div>
    <div class="stack" id="tlist" style="gap:8px"></div>
    <button class="btn ghost block" id="tMore" hidden>Load more</button></div>`;
  const list = $("#tlist", v);
  async function load(cursor = 0, append = false) {
    const rows = await cmd("lib_toc", { folder, parent, cursor });
    entries = append ? entries.concat(rows) : rows;
    paintRows();
    $("#tMore", v).hidden = rows.length < 300;
  }
  function paintRows() {
    if (hits) {
      list.innerHTML = hits.map((h, i) => `<button class="tocrow art enter" style="--i:${Math.min(i, 8)}" data-doc="${h.doc_id}">
        ${ic("doc", "sm")}<span class="grow"><span>${highlight(h.title, query)}</span>
        ${h.snippet ? `<span class="muted" style="display:block;font-size:.78em;font-weight:400">${highlight(h.snippet, query)}</span>` : ""}</span></button>`).join("")
        || `<div class="card pad empty"><p class="muted">No matches for “${esc(query)}”.</p></div>`;
    } else {
      list.innerHTML = entries.map((e, i) => `<button class="tocrow ${e.is_cat ? "" : "art"} enter" style="--i:${Math.min(i, 8)}" data-id="${e.id}" data-doc="${e.doc_id}" data-cat="${e.is_cat ? 1 : 0}" data-name="${esc(e.name)}">
        ${ic(e.is_cat ? "folder" : "doc", "sm")}<span class="grow">${esc(e.name)}</span>${e.is_cat ? ic("chev", "sm") : ""}</button>`).join("")
        || `<div class="card pad empty"><p class="muted">Nothing here.</p></div>`;
    }
    $$("[data-doc]", list).forEach(b => {
      if (hits || b.dataset.cat === "0") b.onclick = () => nav("#/reader/" + encodeURIComponent(folder) + "/" + b.dataset.doc);
      else b.onclick = () => { const st = loadToc(folder); st.push({ id: +b.dataset.id, name: b.dataset.name }); saveToc(folder, st); nav("#/toc/" + encodeURIComponent(folder) + "/" + b.dataset.id); };
    });
  }
  function highlight(text, q) {
    const safe = esc(text || ""); if (!q) return safe;
    try { return safe.replace(new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); } catch { return safe; }
  }
  let deb;
  $("#tq", v).oninput = e => {
    query = e.target.value.trim(); clearTimeout(deb);
    deb = setTimeout(async () => {
      if (!query) { hits = null; paintRows(); $("#tMore", v).hidden = entries.length < 300; return; }
      hits = await cmd("lib_search", { folder, query });
      $("#tMore", v).hidden = true; paintRows();
    }, 250);
  };
  $("#tMore", v).onclick = () => load(entries[entries.length - 1].id, true);
  $("#tBack", v).onclick = () => {
    if (stack.length > 1) { stack.pop(); saveToc(folder, stack); nav("#/toc/" + encodeURIComponent(folder) + "/" + stack[stack.length - 1].id); }
    else nav("#/packs");
  };
  $("#tBm", v).onclick = () => nav("#/bookmarks/" + encodeURIComponent(folder));
  saveToc(folder, stack);
  load();
}
async function viewBookmarks(v, folder) {
  const bms = await cmd("list_bookmarks", { folder });
  v.innerHTML = `<div class="stack" style="max-width:760px;margin:0 auto">
    <div class="row enter"><button class="iconbtn" onclick="history.back()">${ic("back")}</button>
      <h2 class="grow" style="font-size:1.15em">Bookmarks</h2><span class="badge library">${bms.length}</span></div>
    ${bms.map((b, i) => `<div class="row enter" style="--i:${i}"><button class="tocrow art grow" data-doc="${b.doc_id}">${ic("bookmark", "sm")}<span class="grow">${esc(b.title)}</span></button>
      <button class="iconbtn" data-rm="${b.doc_id}" title="Remove">${ic("x", "sm")}</button></div>`).join("")
      || `<div class="card pad empty">${ic("bookmark")}<p class="muted">No bookmarks yet. Tap the bookmark icon while reading.</p></div>`}
  </div>`;
  $$("[data-doc]", v).forEach(b => b.onclick = () => nav("#/reader/" + encodeURIComponent(folder) + "/" + b.dataset.doc));
  $$("[data-rm]", v).forEach(b => b.onclick = async () => { await cmd("toggle_bookmark", { folder, docId: +b.dataset.rm, title: "" }); render(); });
}
async function viewReader(v, folder, docId) {
  const r = resByFolder(folder);
  const [doc, sib] = await Promise.all([cmd("lib_doc", { folder, id: docId }), cmd("lib_siblings", { folder, docId })]);
  const bms = await cmd("list_bookmarks", { folder });
  let marked = bms.some(b => b.doc_id === docId);
  let fs = settings.readerFs;
  v.innerHTML = `<div class="reader">
    <div class="readbar">
      <button class="iconbtn" onclick="history.back()">${ic("back")}</button>
      <span class="grow title" style="font-weight:700;font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(doc.title)}</span>
      <button class="iconbtn ${marked ? "on" : ""}" id="rBm">${ic("bookmark")}</button>
      <button class="iconbtn" id="rAa">${ic("aa")}</button>
      <div class="readprog" id="rProg"></div></div>
    <div class="paper"><h1>${esc(doc.title)}</h1><div class="content" id="rBody" style="font-size:${fs}px;${settings.serif ? "font-family:var(--font-d)" : ""}"></div>
      <div class="row" style="margin-top:26px">
        ${sib.prev ? `<button class="btn ghost sm grow" data-prev>${ic("back", "sm")} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sib.prev.title)}</span></button>` : "<span class='grow'></span>"}
        ${sib.next ? `<button class="btn ghost sm grow" data-next><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sib.next.title)}</span> ${ic("chev", "sm")}</button>` : "<span class='grow'></span>"}
      </div></div></div>`;
  mountContent($("#rBody", v), doc.html, r?.media_dir);
  const onScroll = () => { const p = document.documentElement; const max = p.scrollHeight - innerHeight; $("#rProg") && ($("#rProg").style.width = (max > 0 ? scrollY / max * 100 : 0) + "%"); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", () => window.removeEventListener("scroll", onScroll), { once: true });
  $("#rBm", v).onclick = async () => { marked = await cmd("toggle_bookmark", { folder, docId, title: doc.title }); $("#rBm", v).classList.toggle("on", marked); toast(marked ? "Bookmarked" : "Bookmark removed"); buzz(); };
  $("#rAa", v).onclick = e => {
    e.stopPropagation();
    if ($(".aa")) return closeOverlays();
    const p = document.createElement("div"); p.className = "aa card";
    p.innerHTML = `<div class="field"><label>Text size · <span id="aaVal">${fs}px</span></label>
      <input type="range" min="14" max="24" step="1" value="${fs}" id="aaRange"></div>
      <div class="row"><span class="grow" style="font-weight:600;font-size:.9em">Serif reading</span><button class="switch ${settings.serif ? "on" : ""}" id="aaSerif"></button></div>
      <div class="seg" id="aaTheme">${[["night", "Night"], ["paper", "Paper"], ["oled", "OLED"]].map(([k, l]) => `<button data-k="${k}" class="${settings.theme === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
    $(".readbar", v).appendChild(p);
    $("#aaRange", p).oninput = ev => { fs = +ev.target.value; $("#rBody", v).style.fontSize = fs + "px"; $("#aaVal", p).textContent = fs + "px"; settings.readerFs = fs; saveSettings(); };
    $("#aaSerif", p).onclick = () => { settings.serif = !settings.serif; saveSettings(); $("#aaSerif", p).classList.toggle("on", settings.serif); $("#rBody", v).style.fontFamily = settings.serif ? "var(--font-d)" : ""; };
    $$("#aaTheme button", p).forEach(b => b.onclick = () => { settings.theme = b.dataset.k; saveSettings(); paintHead(); $$("#aaTheme button", p).forEach(x => x.classList.toggle("on", x === b)); });
    setTimeout(() => document.addEventListener("pointerdown", ev => { if (!ev.target.closest(".aa,#rAa")) $$(".aa").forEach(x => x.remove()); }, { once: true }), 0);
  };
  const pv = $("[data-prev]", v), nx = $("[data-next]", v);
  if (pv) pv.onclick = () => nav("#/reader/" + encodeURIComponent(folder) + "/" + sib.prev.doc_id);
  if (nx) nx.onclick = () => nav("#/reader/" + encodeURIComponent(folder) + "/" + sib.next.doc_id);
}

/* ---------- SETTINGS ---------- */
async function viewSettings(v) {
  const usage = await cmd("storage_usage");
  const fmtB = b => b > 1e9 ? (b / 1e9).toFixed(2) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB";
  v.innerHTML = `<div class="stack" style="max-width:640px;margin:0 auto">
    <h2 class="enter" style="--i:0">Settings</h2>
    <div class="card pad stack enter" style="--i:1">
      <h3 style="font-size:1em">Appearance</h3>
      <div class="field"><label>Theme</label><div class="seg" id="setTheme">
        ${[["night", "🌙 Night"], ["paper", "📜 Paper"], ["oled", "⚫ OLED"]].map(([k, l]) => `<button data-k="${k}" class="${settings.theme === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="field"><label>Text size</label><div class="seg" id="setText">
        ${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([k, l]) => `<button data-k="${k}" class="${settings.text === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      ${[["serif", "Serif reading font", "Book-style serif for articles"], ["sound", "Sound effects", "Soft tones for answers and flips (off by default)"], ["haptics", "Haptic feedback", "Gentle vibration on actions"]].map(([k, l, d]) => `
      <div class="row"><div class="grow"><div style="font-weight:600">${l}</div><div class="muted" style="font-size:.8em">${d}</div></div>
      <button class="switch ${settings[k] ? "on" : ""}" data-sw="${k}"></button></div>`).join("")}
      <div class="field"><label>Motion</label><div class="seg" id="setMotion">
        ${[["auto", "System"], ["on", "Full"], ["off", "Reduced"]].map(([k, l]) => `<button data-k="${k}" class="${settings.motion === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    </div>
    <div class="card pad stack enter" style="--i:2">
      <h3 style="font-size:1em">Data</h3>
      <div class="row"><div class="grow"><div style="font-weight:600">Storage used</div><div class="muted" style="font-size:.8em">Packs + progress, on this device only</div></div><span class="mono">${fmtB(usage)}</span></div>
      <hr class="sep">
      <div class="field"><label>Reset progress</label>
        <select id="resetSel"><option value="">All packs…</option>${S.resources.map(r => `<option value="${esc(r.folder)}">${esc(r.name)}</option>`).join("")}</select></div>
      <button class="btn danger block" id="resetBtn">${ic("trash")} Reset selected progress</button>
    </div>
    <div class="card pad enter" style="--i:3;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px">
      <svg class="about-logo" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="228" fill="#12747A"/><path d="M120 560 H300 L360 560 400 430 470 700 540 300 610 620 650 560 H760" fill="none" stroke="#7CF5D8" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/><circle cx="836" cy="560" r="40" fill="#FFB224"/></svg>
      <h2>Med<b style="color:var(--teal)">GURU</b> <span class="mono muted" style="font-size:.55em">v${VERSION}</span></h2>
      <div style="font-weight:700">Made by Dr Sarwar Alam</div>
      <p class="muted" style="font-size:.85em;max-width:380px">Offline forever. No accounts, no tracking, no internet permission. Your packs and progress never leave this device.</p>
      <div class="row" style="flex-wrap:wrap;justify-content:center">
        <span class="chip">${ic("qbank", "sm")} Qbanks</span><span class="chip">${ic("cards", "sm")} Flashcards</span><span class="chip">${ic("library", "sm")} Libraries</span></div>
    </div></div>`;
  const segBind = (id, key, after) => $$("#" + id + " button", v).forEach(b => b.onclick = () => { settings[key] = b.dataset.k; saveSettings(); $$("#" + id + " button", v).forEach(x => x.classList.toggle("on", x === b)); after && after(); });
  segBind("setTheme", "theme", paintHead); segBind("setText", "text"); segBind("setMotion", "motion");
  $$("[data-sw]", v).forEach(b => b.onclick = () => { const k = b.dataset.sw; settings[k] = !settings[k]; saveSettings(); b.classList.toggle("on", settings[k]); paintHead(); if (k === "sound" && settings.sound) sfx.ok(); });
  $("#resetBtn", v).onclick = async () => {
    const f = $("#resetSel", v).value || null;
    const name = f ? resByFolder(f)?.name : "ALL packs";
    if (!await confirmDlg({ title: "Reset progress?", body: `Answers, flags, known cards, bookmarks and reading history for ${name} will be erased. Pack files are not touched.`, ok: "Reset", danger: true })) return;
    await cmd("reset_progress", { folder: f });
    toast("Progress reset"); render();
  };
}

/* ---------- boot ---------- */
(async function boot() {
  sprite(); applySettings(); shell();
  try { await initBackend(); }
  catch (e) {
    $("#view").innerHTML = `<div class="card pad empty"><h2>Could not start</h2><p class="muted">${esc(e.message || e)}</p></div>`;
    document.body.classList.add("ready"); return;
  }
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/home";
  await render();
  document.body.classList.add("ready");
  setTimeout(() => $("#splash")?.remove(), 600);
})();
