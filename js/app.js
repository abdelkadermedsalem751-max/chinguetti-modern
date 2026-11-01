/* ================= Site data — lives in <script id="site-data"> (edit with admin.html) ================= */
const DATA = JSON.parse(document.getElementById("site-data").textContent);
const CONFIG = DATA.config;
window.ROOMS = DATA.rooms;
window.GALLERY = DATA.gallery;
// text overrides from the admin panel win over the built-in translations
for (const lg in DATA.texts || {}) Object.assign(I18N[lg] || {}, DATA.texts[lg]);

const LANGS = ["ar", "fr", "en", "es", "it"];
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// fixed photos (hero, amenities, location) come from DATA.images
$$("img[data-img]").forEach(img => { const src = DATA.images[img.dataset.img]; if (src) img.src = src; });
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

let lang = CONFIG.defaultLang;
const t = (key, vars = {}) => {
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
};

/* ================= Images: graceful fallback ================= */
function guardImg(img) {
  img.addEventListener("error", () => {
    img.style.visibility = "hidden";
    img.parentElement.style.background = "linear-gradient(135deg,#E9DFD2,#D9C3A5)";
  }, { once: true });
}
$$("img[data-fallback]").forEach(guardImg);

/* ================= Language ================= */
function detectLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(q)) return q;
  try { const s = localStorage.getItem("lang"); if (LANGS.includes(s)) return s; } catch (e) {}
  const nav = (navigator.language || "").slice(0, 2);
  return LANGS.includes(nav) ? nav : CONFIG.defaultLang;
}

function splitWords(el) {
  el.classList.remove("play");
  el.innerHTML = el.textContent.trim().split(/\s+/)
    .map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(" ");
  if (document.body.classList.contains("ready")) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("play")));
}

function setLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$(".split").forEach(splitWords);
  $("#langCurrent").textContent = lang.toUpperCase();
  $$(".lang__menu button").forEach(b => b.classList.toggle("current", b.dataset.lang === lang));
  $("#hotelAddress").textContent = t("address");
  renderRooms();
  renderGallery();
  renderRoomSelect();
  if (typeof renderMarquee === "function") renderMarquee();
  try { localStorage.setItem("lang", lang); } catch (e) {}
  try { const url = new URL(location.href); url.searchParams.set("lang", lang); history.replaceState(null, "", url); } catch (e) {} // not allowed in previews
  requestAnimationFrame(movePill);
  if (map) { hotelMarker.setPopupContent(`<b>${t("brand")}</b><br>${t("address")}`); if (meMarker) meMarker.setPopupContent(t("loc.you")); }
}

const langBox = $("#lang");
$("#langBtn").addEventListener("click", e => {
  e.stopPropagation();
  const open = langBox.classList.toggle("open");
  $("#langBtn").setAttribute("aria-expanded", open);
});
$$(".lang__menu button").forEach(b => b.addEventListener("click", () => { setLang(b.dataset.lang); langBox.classList.remove("open"); }));
document.addEventListener("click", () => langBox.classList.remove("open"));

/* ================= Rooms ================= */
function renderRooms() {
  const grid = $("#roomsGrid");
  grid.innerHTML = ROOMS.map((r, i) => `
    <article class="room reveal tilt" style="--d:${i * 0.08}s">
      <div class="room__img"><img src="${r.img}" alt="${r.name[lang]}" loading="lazy"><span class="room__tag">${r.meta[lang][0]}</span></div>
      <div class="room__body">
        <h3>${r.name[lang]}</h3>
        <p>${r.desc[lang]}</p>
        <div class="room__meta">${r.meta[lang].slice(1).map(m => `<span>${m}</span>`).join("")}</div>
        <a href="#" class="btn btn--accent btn--sm js-wa" data-wa="room" data-room="${r.id}">${t("rooms.ask")}</a>
      </div>
    </article>`).join("");
  $$("img", grid).forEach(guardImg);
  observeReveals(grid);
  bindTilt(grid);
}

// Room picker inside the booking form (radio cards with thumbnails)
function renderRoomSelect() {
  const box = $("#roomPick"), checked = $("input[name=room]:checked", box);
  const prev = checked ? checked.value : "";
  const opt = (id, label, img) => `
    <label class="rpick">
      <input type="radio" name="room" value="${id}" ${id === prev ? "checked" : ""}>
      <span class="rpick__card">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : `<span class="rpick__any">✦</span>`}
        <span class="rpick__name">${label}</span>
        <svg class="rpick__tick" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </span>
    </label>`;
  box.innerHTML = opt("", t("form.anyRoom"), "") + ROOMS.map(r => opt(r.id, r.name[lang], r.img)).join("");
  if (typeof updateForm === "function") updateForm();
}

/* ================= Gallery + filter + lightbox ================= */
let currentFilter = "all";
function renderGallery() {
  const grid = $("#galleryGrid");
  grid.innerHTML = GALLERY.map((g, i) => `
    <figure class="gitem reveal" data-cat="${g.cat}" data-i="${i}" style="--d:${(i % 3) * 0.08}s">
      <img src="${g.img}" alt="${t("gallery." + g.cat)}" loading="lazy">
      <figcaption>${t("gallery." + g.cat)}</figcaption>
    </figure>`).join("");
  $$("img", grid).forEach(guardImg);
  observeReveals(grid);
  applyFilter(currentFilter, true);
}

function applyFilter(cat, instant) {
  currentFilter = cat;
  $$(".gitem").forEach(it => {
    const show = cat === "all" || it.dataset.cat === cat;
    if (instant) { it.classList.toggle("gone", !show); it.classList.toggle("hide", !show); return; }
    if (show) {
      it.classList.remove("gone");
      requestAnimationFrame(() => requestAnimationFrame(() => it.classList.remove("hide")));
    } else {
      it.classList.add("hide");
      setTimeout(() => it.classList.contains("hide") && it.classList.add("gone"), 420);
    }
  });
}

function movePill() {
  const active = $("#filters .active"), pill = $("#filterPill");
  if (!active) return;
  Object.assign(pill.style, { left: active.offsetLeft + "px", top: active.offsetTop + "px", width: active.offsetWidth + "px", height: active.offsetHeight + "px" });
}
$$("#filters button").forEach(b => b.addEventListener("click", () => {
  $$("#filters button").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  movePill();
  applyFilter(b.dataset.filter);
}));
addEventListener("resize", movePill);

const lb = $("#lightbox"), lbImg = $("#lbImg");
let lbList = [], lbPos = 0;
function openLb(i) {
  lbList = $$(".gitem:not(.gone)").map(el => +el.dataset.i);
  lbPos = Math.max(0, lbList.indexOf(i));
  showLb();
  lb.classList.add("open"); lb.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function showLb() {
  const g = GALLERY[lbList[lbPos]];
  lbImg.style.opacity = 0;
  setTimeout(() => { lbImg.src = g.img; $("#lbCap").textContent = t("gallery." + g.cat); }, 150);
  lbImg.onload = () => (lbImg.style.opacity = 1);
}
function closeLb() { lb.classList.remove("open"); lb.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
const stepLb = d => { lbPos = (lbPos + d + lbList.length) % lbList.length; showLb(); };
$("#galleryGrid").addEventListener("click", e => { const it = e.target.closest(".gitem"); if (it) openLb(+it.dataset.i); });
$("#lbClose").addEventListener("click", closeLb);
$("#lbPrev").addEventListener("click", () => stepLb(-1));
$("#lbNext").addEventListener("click", () => stepLb(1));
lb.addEventListener("click", e => { if (e.target === lb) closeLb(); });
addEventListener("keydown", e => {
  if (!lb.classList.contains("open")) return;
  if (e.key === "Escape") closeLb();
  if (e.key === "ArrowRight") stepLb(1);
  if (e.key === "ArrowLeft") stepLb(-1);
});
let touchX = null;
lb.addEventListener("touchstart", e => (touchX = e.touches[0].clientX), { passive: true });
lb.addEventListener("touchend", e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
  touchX = null;
});

/* ================= WhatsApp ================= */
const waUrl = text => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
document.addEventListener("click", e => {
  const a = e.target.closest(".js-wa");
  if (!a) return;
  e.preventDefault();
  const kind = a.dataset.wa;
  let text;
  if (kind === "room") {
    const r = ROOMS.find(x => x.id === a.dataset.room);
    text = t("wa.room", { room: r ? r.name[lang] : "" });
  } else {
    text = t("wa." + kind);
  }
  window.open(waUrl(text), "_blank", "noopener");
});

/* ================= Booking form ================= */
const form = $("#bookForm");
const today = new Date().toISOString().slice(0, 10);
form.checkin.min = today; form.checkout.min = today;

const fmtDate = v => v ? new Date(v + "T12:00:00").toLocaleDateString(lang === "ar" ? "ar-MR-u-nu-latn" : lang, { day: "numeric", month: "long", year: "numeric" }) : "…";
const nightsBetween = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 864e5) : 0;
function nightsLabel(n) {
  if (lang !== "ar") return t(n === 1 ? "form.nights.1" : n === 2 ? "form.nights.2" : "form.nights.few", { n });
  return t(n === 1 ? "form.nights.1" : n === 2 ? "form.nights.2" : n <= 10 ? "form.nights.few" : "form.nights.many", { n });
}
function formState() {
  const f = form.elements, picked = $("input[name=room]:checked", form);
  const r = picked && ROOMS.find(x => x.id === picked.value);
  return {
    name: f.name.value.trim(), checkin: f.checkin.value, checkout: f.checkout.value,
    adults: +f.adults.value, children: +f.children.value,
    room: r ? r.name[lang] : t("form.any"), notes: f.notes.value.trim(),
  };
}
const bookingText = (s, forPreview) => t("wa.booking", {
  name: s.name || (forPreview ? "…" : ""), in: fmtDate(s.checkin), out: fmtDate(s.checkout),
  adults: s.adults, children: s.children, room: s.room, notes: s.notes || "—",
});

let lastNights = 0;
function updateForm() {
  const s = formState();
  const n = nightsBetween(s.checkin, s.checkout);
  const ok = { name: s.name.length > 1, checkin: !!s.checkin, checkout: n > 0 };
  Object.entries(ok).forEach(([k, v]) => form.elements[k].closest(".ff").classList.toggle("valid", v));
  const done = Object.values(ok).filter(Boolean).length, pct = Math.round(done / 3 * 100);
  $("#formBar").style.transform = `scaleX(${pct / 100})`;
  const pctEl = $("#formPct");
  if (pctEl.textContent !== pct + "%") { pctEl.textContent = pct + "%"; pctEl.classList.remove("bump"); void pctEl.offsetWidth; pctEl.classList.add("bump"); }
  form.classList.toggle("complete", pct === 100);
  // steps on the left follow the progress
  $$("#steps li").forEach(li => {
    const st = +li.dataset.step;
    li.classList.toggle("active", (st === 1 && pct < 100) || (st === 2 && pct === 100));
    li.classList.toggle("done", st === 1 && pct === 100);
  });
  // nights badge
  const nb = $("#nights");
  nb.hidden = n <= 0;
  if (n > 0) { $("#nightsTxt").textContent = nightsLabel(n); if (n !== lastNights) { nb.classList.remove("pop"); void nb.offsetWidth; nb.classList.add("pop"); } }
  lastNights = n;
  // live preview bubble
  const bubble = $("#waBubble"), empty = !s.name && !s.checkin && !s.checkout && !s.notes;
  bubble.classList.toggle("is-empty", empty);
  bubble.innerHTML = empty ? t("form.empty")
    : bookingText(s, true).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") +
      `<time>${new Date().toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })} ✓✓</time>`;
  $("#notesCount").textContent = `${s.notes.length}/300`;
}

form.addEventListener("input", e => {
  if (e.target.name === "checkin") {
    form.checkout.min = form.checkin.value || today;
    if (form.checkout.value && form.checkout.value <= form.checkin.value) form.checkout.value = "";
  }
  e.target.closest(".ff")?.classList.remove("invalid");
  $("#formError").hidden = true;
  updateForm();
});
form.addEventListener("change", updateForm);

// +/- steppers with a little bump
$$("[data-step-for]", form).forEach(b => b.addEventListener("click", () => {
  const input = form.elements[b.dataset.stepFor];
  const v = Math.min(+input.dataset.max, Math.max(+input.dataset.min, +input.value + +b.dataset.delta));
  if (v === +input.value) { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); return; }
  input.value = v;
  const out = $("#" + b.dataset.stepFor + "Out");
  out.textContent = v;
  out.classList.remove("up", "down"); void out.offsetWidth; out.classList.add(+b.dataset.delta > 0 ? "up" : "down");
  updateForm();
}));

// Toast
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  $("#toastTxt").textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

form.addEventListener("submit", e => {
  e.preventDefault();
  const s = formState(), f = form.elements;
  const bad = [];
  if (s.name.length < 2) bad.push(f.name);
  if (!s.checkin) bad.push(f.checkin);
  if (nightsBetween(s.checkin, s.checkout) <= 0) bad.push(f.checkout);
  $$(".ff", form).forEach(x => x.classList.remove("invalid"));
  bad.forEach(x => { const ff = x.closest(".ff"); void ff.offsetWidth; ff.classList.add("invalid"); });
  $("#formError").hidden = !bad.length;
  if (bad.length) { bad[0].focus({ preventScroll: true }); bad[0].closest(".ff").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  // open synchronously (popup blockers), animate the button meanwhile
  window.open(waUrl(bookingText(s, false)), "_blank", "noopener");
  const btn = $("#sendBtn");
  btn.classList.add("loading");
  setTimeout(() => { btn.classList.remove("loading"); btn.classList.add("done"); burst(btn); toast(t("toast.wa")); }, 700);
  setTimeout(() => btn.classList.remove("done"), 3200);
});

// Small sand-coloured particle burst from an element
function burst(el) {
  if (reduceMotion) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i");
    p.className = "spark";
    const a = (Math.PI * 2 * i) / 18, d = 50 + Math.random() * 60;
    p.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 20}px;background:${["#E08A4F", "#F4B57E", "#4E3426", "#25D366"][i % 4]}`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

$("#waPreviewPhone").textContent = CONFIG.phone;

/* ================= Contact info ================= */
["#footPhone", "#bookPhone"].forEach(id => {
  $(id).textContent = CONFIG.phone;
  $(id).href = "tel:" + CONFIG.phone.replace(/\s/g, "");
});

// Social icons (footer + booking section)
const SOCIAL_ICONS = {
  whatsapp: '<svg viewBox="0 0 32 32"><use href="#wa"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M16.6 3c.4 2.2 1.8 3.6 4 3.9v3.2c-1.5 0-2.8-.5-4-1.2v6.3A6.2 6.2 0 1 1 10.4 9v3.3a2.9 2.9 0 1 0 2.9 2.9V3z"/></svg>',
  email: '<svg viewBox="0 0 24 24" class="stroke"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
};
function renderSocial() {
  const links = [
    ["whatsapp", "#", "WhatsApp", 'data-wa="general"'],
    ["facebook", CONFIG.facebook, "Facebook", 'target="_blank" rel="noopener"'],
    ["tiktok", CONFIG.tiktok, "TikTok", 'target="_blank" rel="noopener"'],
    ["email", CONFIG.email && "mailto:" + CONFIG.email, CONFIG.email, ""],
  ].filter(([, url]) => url);
  $$(".social").forEach(box => {
    box.innerHTML = links.map(([k, url, label, attrs]) =>
      `<a href="${url}" ${attrs} class="social__btn social__btn--${k}${k === "whatsapp" ? " js-wa" : ""}" aria-label="${label} — ${CONFIG.accountName}" title="${label} — ${CONFIG.accountName}">${SOCIAL_ICONS[k]}</a>`
    ).join("") + `<span class="social__name"><b>${CONFIG.accountName}</b><small dir="ltr">${CONFIG.accountHandle}</small></span>`;
  });
  const mail = $("#footMail");
  if (mail) { mail.textContent = CONFIG.email; mail.href = "mailto:" + CONFIG.email; mail.hidden = !CONFIG.email; }
}
renderSocial();

// "Discover" buttons that jump to a gallery category
$$("[data-filter-link]").forEach(a => a.addEventListener("click", () => {
  const b = $(`#filters button[data-filter="${a.dataset.filterLink}"]`);
  if (b) b.click();
}));
$("#year").textContent = new Date().getFullYear();

/* ================= Map + live location ================= */
let map = null, hotelMarker = null, meMarker = null, meCircle = null, routeLine = null, watchId = null;
const hotel = [CONFIG.lat, CONFIG.lng];
const dirUrl = from => `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from[0]},${from[1]}` : ""}&destination=${CONFIG.lat},${CONFIG.lng}&travelmode=driving`;
const pinUrl = CONFIG.mapsLink || `https://www.google.com/maps?q=${CONFIG.lat},${CONFIG.lng}`;
$("#gmapsBtn").href = dirUrl();
$("#wazeBtn").href = `https://waze.com/ul?ll=${CONFIG.lat},${CONFIG.lng}&navigate=yes`;
$("#pinBtn").href = pinUrl;
$("#coords").textContent = `${(+CONFIG.lat).toFixed(5)}, ${(+CONFIG.lng).toFixed(5)}`;

// If Leaflet or every tile server fails (offline CDN, blocked network…), fall back to a Google Maps embed
function mapFallback() {
  const box = $("#map");
  if (box.dataset.fallback) return;
  box.dataset.fallback = "1";
  if (map) { map.remove(); map = null; meMarker = meCircle = routeLine = null; }
  box.innerHTML = `<iframe title="map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen
    src="https://maps.google.com/maps?q=${CONFIG.lat},${CONFIG.lng}&z=${CONFIG.zoom}&output=embed"></iframe>`;
}

function initMap() {
  if (map || $("#map").dataset.fallback) return;
  if (typeof L === "undefined") { mapFallback(); return; }
  map = L.map("map", { scrollWheelZoom: false }).setView(hotel, CONFIG.zoom);
  const servers = [
    ["https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "&copy; OpenStreetMap"],
    ["https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", "&copy; OpenStreetMap &copy; CARTO"],
  ];
  let idx = 0;
  const addTiles = () => {
    let errors = 0, loaded = 0;
    const layer = L.tileLayer(servers[idx][0], { maxZoom: 19, attribution: servers[idx][1] }).addTo(map);
    layer.on("tileload", () => loaded++);
    layer.on("tileerror", () => {
      if (++errors < 4 || loaded > 0) return;
      map.removeLayer(layer);
      if (++idx < servers.length) addTiles(); else mapFallback();
    });
  };
  addTiles();
  hotelMarker = L.marker(hotel, {
    icon: L.divIcon({ className: "pin-hotel", html: "<div></div>", iconSize: [44, 44], iconAnchor: [22, 44], popupAnchor: [0, -40] }),
  }).addTo(map).bindPopup(`<b>${t("brand")}</b><br>${t("address")}<br><a href="${pinUrl}" target="_blank" rel="noopener">Google Maps ↗</a>`);
}

const haversine = (a, b) => {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtKm = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;

function locMsg(key, warn) {
  const m = $("#locMsg");
  m.textContent = key ? t(key) : "";
  m.classList.toggle("warn", !!warn);
}

let gotFix = false, fitted = false;
function showMe(pos) {
  gotFix = true;
  const me = [pos.coords.latitude, pos.coords.longitude], acc = Math.round(pos.coords.accuracy || 0);
  locMsg("");
  $("#locateBtn").classList.remove("loading");
  $("#locFallback").hidden = true;
  if (map) {
    if (!meMarker) {
      meMarker = L.marker(me, { icon: L.divIcon({ className: "pin-me", html: "<div></div>", iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map).bindPopup(t("loc.you"));
      meCircle = L.circle(me, { radius: acc, color: "#2f7de1", weight: 1, fillOpacity: .08 }).addTo(map);
      routeLine = L.polyline([me, hotel], { color: "#E08A4F", weight: 3, dashArray: "8 8" }).addTo(map);
    } else {
      meMarker.setLatLng(me); meCircle.setLatLng(me).setRadius(acc); routeLine.setLatLngs([me, hotel]);
    }
    if (!fitted) { map.fitBounds(L.latLngBounds([me, hotel]), { padding: [50, 50], maxZoom: 16 }); fitted = true; }
  }
  $("#distanceVal").textContent = fmtKm(haversine(me, hotel));
  $("#accuracyVal").textContent = acc ? `± ${fmtKm(acc / 1000)}` : "";
  $("#distanceBox").hidden = false;
  $("#gmapsBtn").href = dirUrl(me);
}

function geoError(err) {
  if (gotFix) return;
  $("#locateBtn").classList.remove("loading");
  const key = !window.isSecureContext ? "loc.insecure"
    : err && err.code === 1 ? "loc.denied"
    : err && err.code === 3 ? "loc.timeout" : "loc.unavailable";
  locMsg(key, true);
  $("#locFallback").hidden = false;   // "Directions" still works: the Maps app finds the visitor itself
}

$("#locateBtn").addEventListener("click", () => {
  initMap();
  if (!navigator.geolocation) { locMsg("loc.unsupported", true); $("#locFallback").hidden = false; return; }
  gotFix = false; fitted = false;
  $("#locateBtn").classList.add("loading");
  locMsg("loc.locating");
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  // 1) fast, coarse fix (cached / network) so something appears quickly
  navigator.geolocation.getCurrentPosition(showMe, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  // 2) precise GPS tracking that keeps the route updated while the visitor moves
  watchId = navigator.geolocation.watchPosition(showMe, geoError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
  // safety net: some phones never call back at all
  setTimeout(() => { if (!gotFix) geoError({ code: 3 }); }, 25000);
});

// Share / copy the hotel location
$("#shareBtn").addEventListener("click", async () => {
  const data = { title: t("brand"), text: `${t("brand")} — ${t("address")}`, url: pinUrl };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(pinUrl);
    toast(t("loc.copied"));
  } catch (e) {
    if (e && e.name === "AbortError") return;
    prompt(t("loc.copyManual"), pinUrl);
  }
});

/* ================= Animations ================= */
// Reveal on scroll
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add("in");
    io.unobserve(el);
    if (el.classList.contains("tilt")) setTimeout(() => el.classList.add("settled"), 1100 + (parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0) * 1000);
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
function observeReveals(root = document) { $$(".reveal:not(.in)", root).forEach(el => io.observe(el)); }

// Counters
const countIO = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    countIO.unobserve(en.target);
    const el = en.target, to = parseFloat(el.dataset.to), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
    const dur = reduceMotion ? 0 : 1800, start = performance.now();
    const fmt = v => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en")) + suf;
    const tick = now => {
      const p = dur ? Math.min(1, (now - start) / dur) : 1;
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}, { threshold: 0.6 });
$$(".count").forEach(el => countIO.observe(el));

// 3D tilt on cards
function bindTilt(root = document) {
  if (!finePointer || reduceMotion) return;
  $$(".tilt", root).forEach(card => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = 1;
    card.addEventListener("mousemove", e => {
      if (!card.classList.contains("settled")) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg) translateY(-6px)`;
    });
    card.addEventListener("mouseleave", () => (card.style.transform = ""));
  });
}

// Magnetic buttons
if (finePointer && !reduceMotion) {
  document.addEventListener("mousemove", e => {
    const b = e.target.closest(".magnetic");
    $$(".magnetic.pull").forEach(x => { if (x !== b) { x.classList.remove("pull"); x.style.transform = ""; } });
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.classList.add("pull");
    b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
  });
}

// Custom cursor
const cursor = $("#cursor");
if (finePointer && !reduceMotion) {
  let cx = 0, cy = 0, tx = 0, ty = 0;
  addEventListener("mousemove", e => {
    tx = e.clientX; ty = e.clientY;
    cursor.classList.add("on");
    cursor.classList.toggle("hover", !!e.target.closest("a, button, .gitem, input, select, textarea"));
  });
  document.addEventListener("mouseleave", () => cursor.classList.remove("on"));
  (function loop() {
    cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
    cursor.style.left = cx + "px"; cursor.style.top = cy + "px";
    requestAnimationFrame(loop);
  })();
}

// Hero mouse parallax + scroll effects
const heroMedia = $("#heroMedia"), woodBg = $("#woodBg"), nav = $("#nav"), progress = $("#scrollProgress");
let mx = 0, my = 0;
if (finePointer && !reduceMotion) {
  $(".hero").addEventListener("mousemove", e => {
    mx = (e.clientX / innerWidth - 0.5) * -24;
    my = (e.clientY / innerHeight - 0.5) * -16;
    requestAnimationFrame(onScroll);
  });
}
const sections = $$("main section[id]");
const toTop = $("#toTop"), topRing = $("#topRing");
toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
let lastY = scrollY, marqueeAnim = null;
function onScroll() {
  const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
  nav.classList.toggle("scrolled", y > 30);
  toTop.classList.toggle("show", y > 700);
  topRing.style.strokeDashoffset = 1 - (h > 0 ? y / h : 0);
  // marquee speeds up with scroll velocity
  if (!marqueeAnim) marqueeAnim = $("#marquee").getAnimations()[0] || null;
  if (marqueeAnim) marqueeAnim.playbackRate = 1 + Math.min(6, Math.abs(y - lastY) / 12);
  lastY = y;
  if (!reduceMotion) {
    heroMedia.style.transform = `translate3d(${mx}px, ${y * 0.3 + my}px, 0)`;
    const wr = woodBg.parentElement.getBoundingClientRect();
    if (wr.bottom > 0 && wr.top < innerHeight) woodBg.style.transform = `translate3d(0, ${(wr.top - innerHeight / 2) * -0.12}px, 0)`;
  }
  let current = "home";
  sections.forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = s.id; });
  if (current === "features" || current === "reviews") current = current === "features" ? "home" : "location";
  if (current === "book") current = "amenities";
  $$(".nav__links a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
}
addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });

// ease the marquee back to normal speed when scrolling stops
setInterval(() => { if (marqueeAnim && marqueeAnim.playbackRate > 1) marqueeAnim.playbackRate = Math.max(1, marqueeAnim.playbackRate * 0.85); }, 120);

// Numbered kickers above section titles (01, 02 …)
$$(".section__head").forEach((head, i) => head.insertAdjacentHTML("afterbegin", `<span class="kicker reveal">${String(i + 1).padStart(2, "0")}</span>`));

// Ripple on buttons
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn, .social__btn, .stepper__ctrl button, .filters button");
  if (!b || reduceMotion) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
  const rip = document.createElement("span");
  rip.className = "ripple";
  rip.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.appendChild(rip);
  setTimeout(() => rip.remove(), 650);
});

// Marquee text per language
function renderMarquee() {
  const words = t("marquee").split(" · ").map(w => `<span>${w}</span><i>✦</i>`).join("");
  $("#marquee").innerHTML = `<div>${words}</div><div>${words}</div>`;
  marqueeAnim = null;
}

// Mobile menu
$("#burger").addEventListener("click", () => nav.classList.toggle("menu-open"));
$$(".nav__links a").forEach(a => a.addEventListener("click", () => nav.classList.remove("menu-open")));

// Init map lazily when the section approaches
new IntersectionObserver((en, obs) => {
  if (en[0].isIntersecting) { initMap(); obs.disconnect(); }
}, { rootMargin: "300px" }).observe($("#map"));
addEventListener("load", () => setTimeout(initMap, 5000)); // in case the observer never fires

/* ================= Boot ================= */
document.body.classList.add("is-loading");
setLang(detectLang());
observeReveals();
bindTilt();
onScroll();

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  $("#preloader").classList.add("done");
  document.body.classList.remove("is-loading");
  document.body.classList.add("ready");
  $$(".split").forEach(el => el.classList.add("play"));
  movePill();
}
// Let the logo animation play (~2.4s), but never wait more than 4s for slow images
const MIN_INTRO = reduceMotion ? 0 : 2500, t0 = performance.now();
addEventListener("load", () => setTimeout(boot, Math.max(0, MIN_INTRO - (performance.now() - t0))));
setTimeout(boot, 4000);
