const DEFAULTS = {
  enabled: true,
  disabledSites: [],
  collection: "classic",
  customPhotos: [],
  favorites: [],
  collections: [],
  theme: "light",
  showQuotes: true,
  replaceMore: false,
  showDetails: true,
  dailyArtwork: true,
  stats: { day: "", replaced: 0, total: 0, seconds: 0, totalSeconds: 0, history: {} },
  seen: {},
  encounters: {},
  milestones: {},
};

const STORAGE_KEYS = Object.keys(DEFAULTS);
const STYLE_DEFINITIONS = [
  { id: "classic", label: "Classics", artwork: "The Starry Night", color: "#b66b2c" },
  { id: "modern", label: "Modern", artwork: "The Card Players", color: "#c87952" },
  { id: "nature", label: "Nature", artwork: "Bridge over a Pond of Water Lilies", color: "#e6a56f" },
  { id: "photography", label: "Photography", artwork: "The Blue Marble", color: "#5a7391" },
  { id: "architecture", label: "Architecture", artwork: "The Tower of Babel", color: "#56558a" },
];
const STYLE_COLORS = ["#d35c3e", "#d77b55", "#e5b579", "#647c9b", "#5a568a"];
const MAX_PHOTOS = 7;
const MAX_PHOTO_DATA_LENGTH = 900000;
const MAX_TOTAL_PHOTO_DATA_LENGTH = 4500000;
let appState = null;
let currentSite = null;
let galleryFilter = "all";
let selectedCollection = "";
let detailArtwork = null;
let collectionArtwork = null;
let handledInitialArtwork = false;
let popupReady = false;
let storageRefreshTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.length < 500))] : [];
}

function normalizePhotos(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  let totalLength = 0;
  return value.filter((photo) => {
    if (!photo || typeof photo.id !== "string" || typeof photo.name !== "string") return false;
    if (typeof photo.dataUrl !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(photo.dataUrl)) return false;
    if (photo.dataUrl.length > MAX_PHOTO_DATA_LENGTH || totalLength + photo.dataUrl.length > MAX_TOTAL_PHOTO_DATA_LENGTH || ids.has(photo.id)) return false;
    ids.add(photo.id);
    totalLength += photo.dataUrl.length;
    return true;
  }).slice(0, MAX_PHOTOS);
}

function normalizeCollections(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter((collection) => {
    return collection && typeof collection.id === "string" && typeof collection.name === "string" && collection.name.trim() && Array.isArray(collection.items);
  }).map((collection) => ({
    id: collection.id.slice(0, 80),
    name: collection.name.trim().slice(0, 40),
    items: normalizeStringArray(collection.items).slice(0, 100),
  })).filter((collection) => {
    if (ids.has(collection.id)) return false;
    ids.add(collection.id);
    return true;
  }).slice(0, 20);
}

function normalizeStats(value) {
  const source = value && typeof value === "object" ? value : {};
  const history = source.history && typeof source.history === "object" ? source.history : {};
  return {
    day: typeof source.day === "string" ? source.day : localDateKey(),
    replaced: safeNumber(source.replaced),
    total: safeNumber(source.total),
    seconds: safeNumber(source.seconds),
    totalSeconds: safeNumber(source.totalSeconds),
    history: Object.fromEntries(Object.entries(history).map(([day, item]) => [day, {
      ads: safeNumber(item && item.ads),
      seconds: safeNumber(item && item.seconds),
    }])),
  };
}

function safeNumber(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function loadState() {
  const values = await chrome.storage.local.get(STORAGE_KEYS);
  return {
    ...DEFAULTS,
    ...values,
    disabledSites: normalizeStringArray(values.disabledSites),
    favorites: normalizeStringArray(values.favorites),
    collections: normalizeCollections(values.collections),
    customPhotos: normalizePhotos(values.customPhotos),
    stats: normalizeStats(values.stats),
    seen: values.seen && typeof values.seen === "object" ? values.seen : {},
    encounters: values.encounters && typeof values.encounters === "object" ? values.encounters : {},
    milestones: values.milestones && typeof values.milestones === "object" ? values.milestones : {},
    collection: typeof values.collection === "string" ? values.collection : DEFAULTS.collection,
    theme: ["light", "dark", "system"].includes(values.theme) ? values.theme : "light",
  };
}

function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return null;
  }
}

function matchesSite(site, entry) {
  return site === entry || site.endsWith("." + entry);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateKeyOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function formatTime(seconds) {
  const minutes = Math.floor(safeNumber(seconds) / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function artworkKey(artwork) {
  return artwork.custom ? `custom:${artwork.id}` : artwork.t;
}

function artByKey(key) {
  if (key.startsWith("custom:")) {
    const photo = appState.customPhotos.find((item) => `custom:${item.id}` === key);
    return photo ? customArtwork(photo) : null;
  }
  return ARTWORKS.find((artwork) => artwork.t === key) || null;
}

function customArtwork(photo) {
  return {
    t: photo.name,
    a: "Your photo",
    y: "Personal collection",
    f: "A personal artwork stored privately on this device.",
    dataUrl: photo.dataUrl,
    id: photo.id,
    custom: true,
  };
}

function catalogArtworks() {
  return [...ARTWORKS, ...appState.customPhotos.map(customArtwork)];
}

function validArtworkKeys() {
  return new Set(catalogArtworks().map(artworkKey));
}

function allGalleryArtworks() {
  const savedKeys = new Set([
    ...Object.keys(appState.seen),
    ...appState.favorites,
    ...appState.collections.flatMap((collection) => collection.items),
    ...appState.customPhotos.map((photo) => `custom:${photo.id}`),
  ]);
  return catalogArtworks().filter((artwork) => savedKeys.has(artworkKey(artwork)));
}

function artImage(artwork, width = 600) {
  return artwork.custom ? artwork.dataUrl : artImageUrl(artwork.file, width);
}

function artSource(artwork) {
  return artwork.custom ? "" : `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(artwork.file)}`;
}

function artStyle(artwork) {
  if (artwork.custom) return "My Photos";
  if (artwork.cat === "space") return "Photography";
  if (artwork.cat === "vangogh") return "Modern";
  if (artwork.cat === "impression") return "Nature";
  if (artwork.cat === "renaissance") return "Architecture";
  return "Classics";
}

function artQuote(artwork) {
  const quotes = typeof QUOTES !== "undefined" && QUOTES.length ? QUOTES : [{ q: "Art washes away from the soul the dust of everyday life.", a: "Pablo Picasso" }];
  const hash = [...artwork.t].reduce((total, character) => total + character.charCodeAt(0), 0);
  const quote = quotes[hash % quotes.length];
  return `“${quote.q}” — ${quote.a}`;
}

function setSetting(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

function applyTheme(theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setView(view) {
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === view;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.getElementById("mainContent").scrollTop = 0;
}

function dailyArtwork() {
  const key = localDateKey();
  const seed = [...key].reduce((total, character) => total + character.charCodeAt(0), 0);
  return ARTWORKS[seed % ARTWORKS.length];
}

function featuredArtwork() {
  if (!appState.dailyArtwork) {
    const recentTitle = Object.entries(appState.encounters).sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0];
    return ARTWORKS.find((artwork) => artwork.t === recentTitle) || dailyArtwork();
  }
  return dailyArtwork();
}

function render() {
  applyTheme(appState.theme);
  const enabled = appState.enabled !== false;
  document.getElementById("enabled").checked = enabled;
  document.getElementById("settingsEnabled").checked = enabled;
  for (const [id, value] of Object.entries({
    showQuotes: appState.showQuotes,
    replaceMore: appState.replaceMore,
    showDetails: appState.showDetails,
    dailyArtwork: appState.dailyArtwork,
  })) document.getElementById(id).checked = Boolean(value);
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === appState.theme);
    const check = button.querySelector("b");
    if (check) check.hidden = button.dataset.theme !== appState.theme;
  });
  renderHome();
  renderGallery();
  renderStats();
  renderStyleChoices();
  renderPhotos();
  renderSiteControls();
  const initialArtwork = new URLSearchParams(location.search).get("art");
  if (initialArtwork && !handledInitialArtwork) {
    handledInitialArtwork = true;
    const artwork = artByKey(initialArtwork);
    if (artwork) openArtDialog(artwork);
  }
}

function renderHome() {
  const artwork = featuredArtwork();
  const today = appState.stats.day === localDateKey() ? appState.stats.replaced : 0;
  const seconds = appState.stats.day === localDateKey() ? appState.stats.seconds : 0;
  document.getElementById("featuredEyebrow").textContent = appState.dailyArtwork ? "Today’s Artwork" : "From Your Recent Discoveries";
  document.getElementById("featuredTitle").textContent = artwork.t;
  document.getElementById("featuredArtist").textContent = `${artwork.a}${artwork.y ? " · " + artwork.y : ""}`;
  document.getElementById("featuredQuote").textContent = appState.showQuotes ? artQuote(artwork) : artwork.f;
  const image = document.getElementById("featuredImage");
  image.src = artImage(artwork, 900);
  image.alt = artwork.t;
  image.onerror = () => { image.style.background = artGradient(artwork.t); image.removeAttribute("src"); };
  document.getElementById("featuredStory").textContent = artwork.f;
  document.getElementById("featuredStory").hidden = true;
  document.getElementById("readStory").innerHTML = "<span>◷</span> Read the story";
  document.getElementById("homeTodayCount").textContent = today.toLocaleString();
  document.getElementById("homeTimeCount").textContent = formatTime(seconds);
  document.getElementById("homeArtCount").textContent = Object.keys(appState.seen).length.toLocaleString();
  renderRecent();
}

function renderRecent() {
  const recent = Object.entries(appState.encounters)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([title]) => artByKey(title))
    .filter(Boolean)
    .slice(0, 4);
  const grid = document.getElementById("recentGrid");
  if (!recent.length) {
    grid.innerHTML = [ARTWORKS[2], ARTWORKS[28], ARTWORKS[0], ARTWORKS[6]].map((artwork) => artworkStrip(artwork)).join("");
  } else {
    grid.innerHTML = recent.map((artwork) => artworkStrip(artwork)).join("");
  }
  grid.querySelectorAll("[data-open-art]").forEach((button) => button.addEventListener("click", () => openArtDialog(artByKey(button.dataset.openArt))));
}

function artworkStrip(artwork) {
  return `<button class="recent-item" data-open-art="${escapeHtml(artworkKey(artwork))}" type="button"><img src="${escapeHtml(artImage(artwork, 360))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="${escapeHtml(artwork.t)}" /><strong>${escapeHtml(artwork.t)}</strong><span>${escapeHtml(artwork.a)}</span></button>`;
}

function renderStyleChoices() {
  const container = document.getElementById("settingsStyleGrid");
  container.innerHTML = STYLE_DEFINITIONS.map((style) => {
    const artwork = ARTWORKS.find((item) => item.t === style.artwork);
    return `<button class="settings-style ${appState.collection === style.id ? "active" : ""}" data-style="${style.id}" type="button"><span><img src="${escapeHtml(artImage(artwork, 260))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="" /></span><strong>${style.label}</strong>${appState.collection === style.id ? "<b>✓</b>" : ""}</button>`;
  }).join("");
  container.querySelectorAll("[data-style]").forEach((button) => button.addEventListener("click", () => chooseStyle(button.dataset.style)));
}

async function chooseStyle(style) {
  try {
    await setSetting("collection", style);
    appState = { ...appState, collection: style };
    renderHome();
    renderStyleChoices();
    showToast(`${STYLE_DEFINITIONS.find((item) => item.id === style)?.label || "Style"} artworks are now active`);
  } catch (error) {
    showToast("Could not change art style");
  }
}

function filteredArtworks() {
  if (galleryFilter === "collections" && !selectedCollection) return [];
  let artworks = allGalleryArtworks();
  if (galleryFilter === "favorites") artworks = artworks.filter((artwork) => appState.favorites.includes(artworkKey(artwork)));
  if (selectedCollection) {
    const collection = appState.collections.find((item) => item.id === selectedCollection);
    if (collection) artworks = artworks.filter((artwork) => collection.items.includes(artworkKey(artwork)));
  }
  return [...artworks].sort((a, b) => {
    const aDate = appState.seen[artworkKey(a)] || "";
    const bDate = appState.seen[artworkKey(b)] || "";
    return bDate.localeCompare(aDate) || a.t.localeCompare(b.t);
  });
}

function renderGallery() {
  const validKeys = validArtworkKeys();
  const favoriteCount = appState.favorites.filter((key) => validKeys.has(key)).length;
  const collectionCount = appState.collections.filter((collection) => collection.items.some((key) => validKeys.has(key))).length;
  document.getElementById("allCount").textContent = allGalleryArtworks().length;
  document.getElementById("favoriteCount").textContent = favoriteCount;
  document.getElementById("collectionCount").textContent = collectionCount;
  document.querySelectorAll(".gallery-tab").forEach((button) => button.classList.toggle("active", button.dataset.galleryFilter === galleryFilter));
  const collectionList = document.getElementById("collectionList");
  collectionList.hidden = galleryFilter !== "collections";
  renderCollectionList(collectionList);
  const artworks = filteredArtworks();
  const grid = document.getElementById("artGrid");
  const showGrid = galleryFilter !== "collections" || Boolean(selectedCollection);
  grid.hidden = !showGrid;
  grid.innerHTML = artworks.slice(0, 30).map((artwork) => artworkCard(artwork)).join("");
  const empty = document.getElementById("galleryEmpty");
  empty.hidden = artworks.length > 0 || (galleryFilter === "collections" && !selectedCollection);
  grid.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", () => toggleFavorite(artByKey(button.dataset.favorite))));
  grid.querySelectorAll("[data-open-art]").forEach((button) => button.addEventListener("click", () => openArtDialog(artByKey(button.dataset.openArt))));
  collectionList.querySelectorAll("[data-select-collection]").forEach((button) => button.addEventListener("click", () => {
    selectedCollection = button.dataset.selectCollection;
    galleryFilter = "collections";
    renderGallery();
  }));
}

function artworkCard(artwork) {
  const key = artworkKey(artwork);
  const favorite = appState.favorites.includes(key);
  return `<article class="art-card"><button class="art-image-button" data-open-art="${escapeHtml(key)}" type="button"><img src="${escapeHtml(artImage(artwork, 520))}" referrerpolicy="no-referrer" decoding="async" alt="${escapeHtml(artwork.t)}" loading="lazy" /></button><div class="art-card-copy"><div><strong>${escapeHtml(artwork.t)}</strong><span>${escapeHtml(artwork.a)}</span></div><div class="card-controls"><button class="heart-button ${favorite ? "active" : ""}" data-favorite="${escapeHtml(key)}" type="button" aria-label="${favorite ? "Remove from" : "Add to"} favorites">${favorite ? "♥" : "♡"}</button></div></div></article>`;
}

function renderCollectionList(container) {
  if (!appState.collections.length) {
    container.innerHTML = `<div class="collection-empty"><div>▱</div><strong>No collections yet</strong><span>Group artworks into a collection you love.</span></div>`;
    return;
  }
  container.innerHTML = appState.collections.map((collection) => {
    const items = collection.items.map(artByKey).filter(Boolean);
    const first = items[0] || ARTWORKS[0];
    const second = items[1] || first;
    return `<button class="collection-card ${selectedCollection === collection.id ? "active" : ""}" data-select-collection="${escapeHtml(collection.id)}" type="button"><div class="collection-stack"><img src="${escapeHtml(artImage(first, 260))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="" /><img src="${escapeHtml(artImage(second, 260))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="" /></div><strong>${escapeHtml(collection.name)}</strong><span>${items.length} artwork${items.length === 1 ? "" : "s"}</span></button>`;
  }).join("");
}

function renderStats() {
  const period = document.getElementById("statsPeriod").value;
  const periodDays = period === "week" ? 7 : period === "month" ? 30 : 3650;
  const today = appState.stats.day === localDateKey();
  const currentHistory = appState.stats.history[localDateKey()] || { ads: 0, seconds: 0 };
  const periodAds = period === "all" ? appState.stats.total : Object.entries(appState.stats.history).reduce((sum, [day, item]) => {
    return sum + (day >= dateKeyOffset(-periodDays + 1) ? item.ads : 0);
  }, 0) + (today ? Math.max(0, appState.stats.replaced - currentHistory.ads) : 0);
  const periodTime = period === "all" ? appState.stats.totalSeconds : Object.entries(appState.stats.history).reduce((sum, [day, item]) => {
    return sum + (day >= dateKeyOffset(-periodDays + 1) ? item.seconds : 0);
  }, 0) + (today ? Math.max(0, appState.stats.seconds - currentHistory.seconds) : 0);
  const effectiveAds = today ? Math.max(periodAds, appState.stats.replaced) : periodAds;
  const effectiveTime = today ? Math.max(periodTime, appState.stats.seconds) : periodTime;
  document.getElementById("statsTodayCount").textContent = effectiveAds.toLocaleString();
  document.getElementById("statsTimeCount").textContent = formatTime(effectiveTime);
  document.getElementById("statsArtCount").textContent = Object.keys(appState.seen).length.toLocaleString();
  renderChart(period);
  renderStyleStats();
  renderArtists();
}

function historyForDay(day) {
  const stored = appState.stats.history[day] || { ads: 0, seconds: 0 };
  if (day === localDateKey() && appState.stats.day === day) {
    return { ads: Math.max(stored.ads, appState.stats.replaced), seconds: Math.max(stored.seconds, appState.stats.seconds) };
  }
  return stored;
}

function renderChart(period) {
  const metric = document.querySelector("#activityMetric .active").dataset.metric;
  const valueFor = (record) => metric === "ads" ? record.ads : Math.round(record.seconds / 60);
  const data = [];
  if (period === "all") {
    data.push({ label: "All time", value: valueFor({ ads: appState.stats.total, seconds: appState.stats.totalSeconds }) });
  } else if (period === "month") {
    for (let bin = 0; bin < 6; bin++) {
      let value = 0;
      for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
        const date = new Date();
        date.setDate(date.getDate() - (29 - bin * 5 - dayOffset));
        value += valueFor(historyForDay(localDateKey(date)));
      }
      const labelDate = new Date();
      labelDate.setDate(labelDate.getDate() - (29 - bin * 5));
      data.push({ label: labelDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value });
    }
  } else {
    for (let index = 6; index >= 0; index--) {
      const date = new Date();
      date.setDate(date.getDate() - index);
      data.push({ label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3), value: valueFor(historyForDay(localDateKey(date))) });
    }
  }
  const maximum = Math.max(1, ...data.map((item) => item.value));
  const chart = document.getElementById("barChart");
  chart.style.gridTemplateColumns = `repeat(${data.length}, minmax(34px, 1fr))`;
  chart.innerHTML = data.map((item) => `<div class="bar-column"><span>${item.value}</span><div><i style="height:${item.value ? Math.max(4, item.value / maximum * 100) : 0}%"></i></div><small>${item.label}</small></div>`).join("");
  document.getElementById("activityTitle").textContent = period === "all" ? "Lifetime Activity" : period === "month" ? "Monthly Activity" : "Daily Activity";
}

function renderStyleStats() {
  const counts = new Map(STYLE_DEFINITIONS.map((style) => [style.label, 0]));
  for (const key of Object.keys(appState.seen)) {
    const artwork = artByKey(key);
    const label = artwork ? artStyle(artwork) : "Classics";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const entries = [...counts].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const total = Object.keys(appState.seen).length;
  let cursor = 0;
  const segments = entries.map(([label, count], index) => {
    const start = cursor;
    cursor += total ? count / total * 100 : 0;
    return `${STYLE_COLORS[index % STYLE_COLORS.length]} ${start}% ${cursor}%`;
  });
  document.getElementById("styleDonut").style.background = total ? `conic-gradient(${segments.join(",")})` : "conic-gradient(#ded7ca 0 100%)";
  document.getElementById("donutTotal").textContent = total;
  document.getElementById("styleLegend").innerHTML = entries.length ? entries.map(([label, count], index) => `<div><i style="background:${STYLE_COLORS[index % STYLE_COLORS.length]}"></i><span>${label}</span><strong>${count} (${Math.round(count / total * 100)}%)</strong></div>`).join("") : `<div class="legend-empty">Discover artworks to see your art styles.</div>`;
}

function renderArtists() {
  const counts = new Map();
  for (const key of Object.keys(appState.seen)) {
    const artwork = artByKey(key);
    if (!artwork) continue;
    counts.set(artwork.a, (counts.get(artwork.a) || 0) + 1);
  }
  const artists = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const row = document.getElementById("artistsRow");
  if (!artists.length) {
    row.innerHTML = ARTWORKS.slice(0, 5).map((artwork) => `<div class="artist-item"><img src="${escapeHtml(artImage(artwork, 180))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="" /><strong>${escapeHtml(artwork.a.split(" ").slice(-1)[0])}</strong><span>Discover</span></div>`).join("");
    return;
  }
  row.innerHTML = artists.map(([artist, count]) => {
    const artwork = catalogArtworks().find((item) => item.a === artist);
    if (!artwork) return "";
    return `<button class="artist-item" data-open-artwork="${escapeHtml(artworkKey(artwork))}" type="button"><img src="${escapeHtml(artImage(artwork, 180))}" referrerpolicy="no-referrer" decoding="async" loading="lazy" alt="" /><strong>${escapeHtml(artist)}</strong><span>${count} view${count === 1 ? "" : "s"}</span></button>`;
  }).join("");
  row.querySelectorAll("[data-open-artwork]").forEach((button) => button.addEventListener("click", () => openArtDialog(artByKey(button.dataset.openArtwork))));
}

function renderSiteControls() {
  const button = document.getElementById("siteToggle");
  const isDisabled = currentSite && appState.disabledSites.some((site) => matchesSite(currentSite, site));
  document.getElementById("currentSiteName").textContent = currentSite || "This page has no site setting";
  button.classList.toggle("disabled-site", Boolean(isDisabled));
  button.textContent = isDisabled ? `Enable on ${currentSite || "this site"}` : `Disable on ${currentSite || "this site"}`;
  button.disabled = !currentSite;
}

function setPhotoStatus(message, isError = false) {
  const status = document.getElementById("photoStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function renderPhotos() {
  const photos = appState.customPhotos;
  const list = document.getElementById("photoList");
  document.getElementById("photoCount").textContent = `${photos.length} / 7`;
  const upload = document.getElementById("uploadPhotos");
  upload.disabled = photos.length >= 7;
  upload.textContent = photos.length >= 7 ? "Photo limit reached" : "Upload 1–7 photos";
  list.innerHTML = photos.map((photo) => `<div class="photo-item"><img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}" /><button class="photo-remove" data-remove-photo="${escapeHtml(photo.id)}" type="button" aria-label="Remove ${escapeHtml(photo.name)}">×</button></div>`).join("");
  list.querySelectorAll("[data-remove-photo]").forEach((button) => button.addEventListener("click", async () => {
    const key = `custom:${button.dataset.removePhoto}`;
    const previous = appState;
    appState = {
      ...appState,
      customPhotos: appState.customPhotos.filter((photo) => photo.id !== button.dataset.removePhoto),
      favorites: appState.favorites.filter((item) => item !== key),
      collections: appState.collections.map((collection) => ({ ...collection, items: collection.items.filter((item) => item !== key) })),
    };
    try {
      await chrome.storage.local.set({ customPhotos: appState.customPhotos, favorites: appState.favorites, collections: appState.collections });
      render();
      showToast("Photo removed");
    } catch (error) {
      appState = previous;
      renderPhotos();
      showToast("Could not remove photo");
    }
  }));
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode photo"));
      image.onload = () => {
        if (image.width * image.height > 40000000) {
          reject(new Error("Image dimensions are too large"));
          return;
        }
        const attempts = [
          { size: 1400, quality: 0.78 },
          { size: 1100, quality: 0.64 },
          { size: 900, quality: 0.52 },
          { size: 700, quality: 0.4 },
        ];
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        for (const attempt of attempts) {
          const scale = Math.min(1, attempt.size / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Could not process photo"));
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);
          if (dataUrl.length <= MAX_PHOTO_DATA_LENGTH) {
            resolve({ id, name: file.name, dataUrl });
            return;
          }
        }
        reject(new Error("Photo could not be compressed small enough"));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addPhotos(files) {
  const available = Math.max(0, MAX_PHOTOS - appState.customPhotos.length);
  const selected = [...files].filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 15 * 1024 * 1024).slice(0, available);
  if (!selected.length) {
    setPhotoStatus(available ? "Choose a JPG, PNG, or WebP smaller than 15 MB." : "Photo limit reached.", true);
    return;
  }
  const results = [];
  let usedLength = appState.customPhotos.reduce((total, photo) => total + photo.dataUrl.length, 0);
  for (const file of selected) {
    try {
      const photo = await compressPhoto(file);
      if (usedLength + photo.dataUrl.length <= MAX_TOTAL_PHOTO_DATA_LENGTH && results.length < available) {
        results.push(photo);
        usedLength += photo.dataUrl.length;
      }
    } catch (error) {}
  }
  if (!results.length) {
    setPhotoStatus("No photos could be added within the storage limit.", true);
    return;
  }
  const nextPhotos = normalizePhotos([...appState.customPhotos, ...results]);
  const previous = appState.customPhotos;
  appState = { ...appState, customPhotos: nextPhotos };
  try {
    await setSetting("customPhotos", nextPhotos);
  } catch (error) {
    appState = { ...appState, customPhotos: previous };
    setPhotoStatus("Browser storage is full. Remove a photo and try again.", true);
    renderPhotos();
    return;
  }
  const skipped = selected.length - results.length;
  setPhotoStatus(skipped ? `Added ${results.length}; skipped ${skipped}.` : `Added ${results.length} photo${results.length === 1 ? "" : "s"}.`);
  render();
}

async function toggleFavorite(artwork) {
  if (!artwork) return;
  const key = artworkKey(artwork);
  const favorite = appState.favorites.includes(key);
  const next = favorite ? appState.favorites.filter((item) => item !== key) : [...appState.favorites, key];
  try {
    await setSetting("favorites", next);
    appState = { ...appState, favorites: next };
    render();
    if (detailArtwork && artworkKey(detailArtwork) === key) {
      const button = document.getElementById("dialogFavorite");
      button.textContent = favorite ? "♡ Favorite" : "♥ Favorited";
    }
    showToast(favorite ? "Removed from favorites" : "Saved to favorites");
  } catch (error) {
    showToast("Could not update favorites");
  }
}

function openArtDialog(artwork) {
  if (!artwork || !appState.showDetails) return;
  detailArtwork = artwork;
  document.getElementById("dialogImage").src = artImage(artwork, 900);
  document.getElementById("dialogImage").alt = artwork.t;
  document.getElementById("dialogEyebrow").textContent = artwork.custom ? "From My Photos" : `${artStyle(artwork)} · ${artwork.y || "Artwork"}`;
  document.getElementById("dialogTitle").textContent = artwork.t;
  document.getElementById("dialogArtist").textContent = artwork.a;
  const quote = document.getElementById("dialogQuote");
  quote.hidden = !appState.showQuotes;
  quote.textContent = artQuote(artwork);
  document.getElementById("dialogFact").textContent = artwork.f;
  const favorite = appState.favorites.includes(artworkKey(artwork));
  document.getElementById("dialogFavorite").textContent = favorite ? "♥ Favorited" : "♡ Favorite";
  document.getElementById("dialogSource").hidden = artwork.custom;
  document.getElementById("artDialog").showModal();
}

function openSource(artwork) {
  if (!artwork || artwork.custom) return;
  chrome.tabs.create({ url: artSource(artwork) });
}

function openSaveDialog() {
  if (!detailArtwork) return;
  collectionArtwork = detailArtwork;
  const key = artworkKey(detailArtwork);
  document.getElementById("saveList").innerHTML = appState.collections.length ? appState.collections.map((collection) => {
    const added = collection.items.includes(key);
    return `<button class="save-option ${added ? "added" : ""}" data-save-collection="${escapeHtml(collection.id)}" type="button"><span>${escapeHtml(collection.name)}</span><b>${added ? "✓ Added · remove" : "＋ Add"}</b></button>`;
  }).join("") : `<div class="save-empty">No collections yet. Create one below.</div>`;
  document.querySelectorAll("[data-save-collection]").forEach((button) => button.addEventListener("click", () => saveToCollection(button.dataset.saveCollection)));
  document.getElementById("saveDialog").showModal();
}

async function saveToCollection(id) {
  const collection = appState.collections.find((item) => item.id === id);
  if (!collection || !collectionArtwork) return;
  const key = artworkKey(collectionArtwork);
  const added = collection.items.includes(key);
  const nextCollections = appState.collections.map((item) => item.id === id
    ? { ...item, items: added ? item.items.filter((entry) => entry !== key) : [...item.items, key] }
    : item);
  try {
    await setSetting("collections", nextCollections);
    appState = { ...appState, collections: nextCollections };
    const button = document.querySelector(`[data-save-collection="${CSS.escape(id)}"]`);
    if (button) {
      button.classList.toggle("added", !added);
      button.querySelector("b").textContent = added ? "＋ Add" : "✓ Added · remove";
    }
    renderGallery();
    showToast(added ? `Removed from ${collection.name}` : `Saved to ${collection.name}`);
  } catch (error) {
    showToast("Could not update collection");
  }
}

async function createCollection(name, artwork = null) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const collection = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: trimmed, items: artwork ? [artworkKey(artwork)] : [] };
  const nextCollections = [...appState.collections, collection];
  try {
    await setSetting("collections", nextCollections);
    appState = { ...appState, collections: nextCollections };
    renderGallery();
    showToast(`Created ${trimmed}`);
    return true;
  } catch (error) {
    showToast("Could not create collection");
    return false;
  }
}

async function createWeeklyCard(button) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Creating…";
  try {
    const canvas = document.createElement("canvas");
    await drawWeekCard(canvas, { encounters: appState.encounters, total: appState.stats.total });
    downloadWeekCard(canvas);
  } catch (error) {
    showToast("Could not create the weekly card");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function bindEvents() {
  document.addEventListener("error", (event) => {
    if (!(event.target instanceof HTMLImageElement) || event.target.dataset.fallback) return;
    event.target.dataset.fallback = "true";
    event.target.style.background = artGradient(event.target.alt || "Hachi artwork");
    event.target.removeAttribute("src");
  }, true);
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.getElementById("recentViewAll").addEventListener("click", () => setView("gallery"));
  document.getElementById("styleStatsLink").addEventListener("click", () => setView("settings"));
  document.getElementById("closeButton").addEventListener("click", () => window.close());
  for (const id of ["enabled", "settingsEnabled"]) document.getElementById(id).addEventListener("change", async (event) => {
    try {
      await setSetting("enabled", event.target.checked);
      appState = { ...appState, enabled: event.target.checked };
      render();
      showToast(appState.enabled ? "Hachi enabled" : "Hachi paused");
    } catch (error) {
      event.target.checked = appState.enabled;
      showToast("Could not update Hachi");
    }
  });
  for (const id of ["showQuotes", "replaceMore", "showDetails", "dailyArtwork"]) document.getElementById(id).addEventListener("change", async (event) => {
    try {
      await setSetting(id, event.target.checked);
      appState = { ...appState, [id]: event.target.checked };
      render();
    } catch (error) {
      event.target.checked = appState[id];
      showToast("Could not save this setting");
    }
  });
  document.getElementById("appearanceOptions").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    try {
      await setSetting("theme", button.dataset.theme);
      appState = { ...appState, theme: button.dataset.theme };
      render();
    } catch (error) {
      showToast("Could not save appearance");
    }
  });
  document.querySelectorAll(".gallery-tab").forEach((button) => button.addEventListener("click", () => {
    galleryFilter = button.dataset.galleryFilter;
    selectedCollection = "";
    renderGallery();
  }));
  document.getElementById("createCollection").addEventListener("click", () => {
    document.getElementById("collectionName").value = "";
    document.getElementById("collectionDialog").showModal();
    document.getElementById("collectionName").focus();
  });
  document.getElementById("collectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("collectionName");
    input.setCustomValidity(input.value.trim() ? "" : "Enter a collection name");
    if (!input.reportValidity()) return;
    if (await createCollection(input.value)) document.getElementById("collectionDialog").close();
  });
  document.getElementById("quickCollectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("quickCollectionName");
    input.setCustomValidity(input.value.trim() ? "" : "Enter a collection name");
    if (!input.reportValidity()) return;
    if (await createCollection(input.value, collectionArtwork)) {
      input.value = "";
      document.getElementById("saveDialog").close();
      openSaveDialog();
    }
  });
  for (const id of ["collectionName", "quickCollectionName"]) document.getElementById(id).addEventListener("input", (event) => event.target.setCustomValidity(""));
  document.getElementById("readStory").addEventListener("click", () => {
    const story = document.getElementById("featuredStory");
    story.hidden = !story.hidden;
    document.getElementById("readStory").innerHTML = story.hidden ? "<span>◷</span> Read the story" : "<span>×</span> Close story";
  });
  document.getElementById("openSource").addEventListener("click", () => openSource(featuredArtwork()));
  document.getElementById("featuredCard").addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openArtDialog(featuredArtwork());
  });
  document.getElementById("featuredCard").addEventListener("keydown", (event) => {
    if (event.target.closest("button") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openArtDialog(featuredArtwork());
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog).close()));
  document.querySelectorAll(".art-dialog, .small-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  document.getElementById("dialogFavorite").addEventListener("click", () => toggleFavorite(detailArtwork));
  document.getElementById("dialogCollection").addEventListener("click", openSaveDialog);
  document.getElementById("dialogSource").addEventListener("click", () => openSource(detailArtwork));
  document.getElementById("weeklyCard").addEventListener("click", (event) => createWeeklyCard(event.currentTarget));
  document.getElementById("activityMetric").addEventListener("click", (event) => {
    const button = event.target.closest("[data-metric]");
    if (!button) return;
    document.querySelectorAll("#activityMetric button").forEach((item) => item.classList.toggle("active", item === button));
    renderChart(document.getElementById("statsPeriod").value);
  });
  document.getElementById("statsPeriod").addEventListener("change", renderStats);
  document.getElementById("uploadPhotos").addEventListener("click", () => document.getElementById("customPhotos").click());
  document.getElementById("usePhotoCollection").addEventListener("click", async () => {
    if (!appState.customPhotos.length) {
      showToast("Upload a photo first");
      document.getElementById("customPhotos").click();
      return;
    }
    try {
      await setSetting("collection", "custom");
      appState = { ...appState, collection: "custom" };
      renderHome();
      renderStyleChoices();
      showToast("My Photos are now active");
    } catch (error) {
      showToast("Could not activate My Photos");
    }
  });
  document.getElementById("customPhotos").addEventListener("change", async (event) => {
    try {
      await addPhotos(event.target.files);
    } catch (error) {
      setPhotoStatus("Could not save photos. Please try again.", true);
    } finally {
      event.target.value = "";
    }
  });
  document.getElementById("siteToggle").addEventListener("click", toggleCurrentSite);
}

async function toggleCurrentSite() {
  if (!currentSite) return;
  const disabled = appState.disabledSites.some((site) => matchesSite(currentSite, site));
  const next = disabled
    ? appState.disabledSites.filter((site) => !matchesSite(currentSite, site))
    : [...appState.disabledSites, currentSite];
  try {
    await setSetting("disabledSites", next);
    appState = { ...appState, disabledSites: next };
    renderSiteControls();
    showToast(disabled ? `Hachi enabled on ${currentSite}` : `Hachi disabled on ${currentSite}`);
  } catch (error) {
    showToast("Could not update this site");
  }
}

async function initialize() {
  appState = await loadState();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentSite = tab && tab.url ? siteOf(tab.url) : null;
  bindEvents();
  render();
  popupReady = true;
  const requestedView = new URLSearchParams(location.search).get("view");
  if (["home", "gallery", "stats", "settings"].includes(requestedView)) setView(requestedView);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (!popupReady || area !== "local") return;
  if (!STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) return;
  clearTimeout(storageRefreshTimer);
  storageRefreshTimer = setTimeout(async () => {
    appState = await loadState();
    render();
  }, 80);
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (appState?.theme === "system") applyTheme("system");
});

initialize();
