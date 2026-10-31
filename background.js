importScripts("lib/artworks.js", "lib/museum.js");

const MUSEUM_MILESTONES_REF = typeof MUSEUM_MILESTONES !== "undefined" ? MUSEUM_MILESTONES : [];
const ARTWORK_TITLES = new Set(typeof ARTWORKS !== "undefined" ? ARTWORKS.map((artwork) => artwork.t) : []);
const HISTORY_LIMIT = 120;
/* Offline artwork cache: the first successful load of an artwork is stored
   (as a data URL) in the extension-origin Cache API, so cards keep working
   offline afterwards. Keys are synthetic and only ever matched, never
   fetched; the index in storage.local caps the cache at ART_CACHE_LIMIT
   entries by evicting the least recently added. */
const ART_CACHE_NAME = "hachi-art-v1";
const ART_CACHE_INDEX_KEY = "artCacheIndex";
const ART_CACHE_LIMIT = 120;
const ART_CACHE_MAX_BYTES = 3 * 1024 * 1024;
const ART_FILE_SET = new Set(typeof ARTWORKS !== "undefined" ? ARTWORKS.map((artwork) => artwork.file) : []);
const artImageTasks = new Map();
let stateQueue = Promise.resolve();

function enqueueStateUpdate(task) {
  const next = stateQueue.then(task, task);
  stateQueue = next.catch(() => {});
  return next;
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeStats(value, day) {
  const source = value && typeof value === "object" ? value : {};
  const history = source.history && typeof source.history === "object" ? source.history : {};
  return {
    day: typeof source.day === "string" ? source.day : day,
    replaced: count(source.replaced),
    total: count(source.total),
    seconds: count(source.seconds),
    totalSeconds: count(source.totalSeconds),
    history,
  };
}

function currentStats(value, day) {
  const stats = normalizeStats(value, day);
  if (stats.day !== day) {
    stats.history[stats.day] = {
      ads: count(stats.history[stats.day]?.ads) || stats.replaced,
      seconds: count(stats.history[stats.day]?.seconds) || stats.seconds,
    };
    stats.day = day;
    stats.replaced = 0;
    stats.seconds = 0;
  }
  stats.history[day] = {
    ads: count(stats.history[day]?.ads) || stats.replaced,
    seconds: count(stats.history[day]?.seconds) || stats.seconds,
  };
  const history = Object.fromEntries(Object.entries(stats.history)
    .filter(([key, item]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && item && typeof item === "object")
    .map(([key, item]) => [key, { ads: count(item.ads), seconds: count(item.seconds) }])
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, HISTORY_LIMIT));
  return { ...stats, history };
}

function pruneHistory(history) {
  return Object.fromEntries(Object.entries(history)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, HISTORY_LIMIT));
}

function artCacheKey(file) {
  return `https://hachi-art-cache.local/art/${encodeURIComponent(file)}?w=960`;
}

async function resolveThumbUrl(file, width) {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&prop=imageinfo&iiprop=url&iiurlwidth=" + width +
    "&titles=" + encodeURIComponent("File:" + file);
  const response = await fetch(api);
  if (!response.ok) throw new Error(`Commons API failed: ${response.status}`);
  const data = await response.json();
  const page = data && data.query && data.query.pages ? Object.values(data.query.pages)[0] : null;
  const thumbUrl = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0].thumburl : null;
  if (!thumbUrl) throw new Error("no thumbnail available");
  return thumbUrl;
}

function blobToDataUrl(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
  });
}

async function rememberArtCacheKey(cache, key) {
  const stored = await chrome.storage.local.get(ART_CACHE_INDEX_KEY);
  const index = Array.isArray(stored[ART_CACHE_INDEX_KEY]) ? stored[ART_CACHE_INDEX_KEY].filter((entry) => entry !== key) : [];
  index.push(key);
  const evicted = index.length > ART_CACHE_LIMIT ? index.splice(0, index.length - ART_CACHE_LIMIT) : [];
  await chrome.storage.local.set({ [ART_CACHE_INDEX_KEY]: index });
  await Promise.all(evicted.map((entry) => cache.delete(entry).catch(() => {})));
}

async function fetchAndCacheArtwork(file, key) {
  try {
    const thumbUrl = await resolveThumbUrl(file, 960);
    const response = await fetch(thumbUrl);
    if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size < 64 || blob.size > ART_CACHE_MAX_BYTES) {
      throw new Error("unexpected image payload");
    }
    const dataUrl = await blobToDataUrl(blob);
    const cache = await caches.open(ART_CACHE_NAME);
    await cache.put(key, new Response(dataUrl));
    await rememberArtCacheKey(cache, key);
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function handleArtImage(file) {
  if (typeof file !== "string" || !ART_FILE_SET.has(file) || file.length > 300) return { ok: false };
  const key = artCacheKey(file);
  try {
    const cache = await caches.open(ART_CACHE_NAME);
    const hit = await cache.match(key);
    if (hit) {
      const dataUrl = await hit.text();
      if (dataUrl.startsWith("data:image/")) return { ok: true, dataUrl };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  }
  let task = artImageTasks.get(file);
  if (!task) {
    task = fetchAndCacheArtwork(file, key);
    artImageTasks.set(file, task);
  }
  try {
    return await task;
  } finally {
    if (artImageTasks.get(file) === task) artImageTasks.delete(file);
  }
}

async function handleAdReplaced({ n, art }) {
  const added = Number.isSafeInteger(n) && n > 0 ? n : 1;
  const title = art && typeof art.t === "string" && ARTWORK_TITLES.has(art.t) ? art.t : null;
  return enqueueStateUpdate(async () => {
    const day = localDateKey();
    const stored = await chrome.storage.local.get(["stats", "seen", "encounters", "milestones"]);
    const seen = stored.seen && typeof stored.seen === "object" ? stored.seen : {};
    const encounters = stored.encounters && typeof stored.encounters === "object" ? stored.encounters : {};
    const milestones = stored.milestones && typeof stored.milestones === "object" ? stored.milestones : {};
    const stats = currentStats(stored.stats, day);
    stats.replaced += added;
    stats.total += added;
    stats.history[day].ads += added;
    stats.history = pruneHistory(stats.history);
    const updates = { stats };
    if (title) {
      seen[title] = seen[title] || day;
      encounters[title] = day;
      const seenCount = Object.keys(seen).length;
      for (const milestone of MUSEUM_MILESTONES_REF) {
        if (seenCount >= milestone.n && !milestones[milestone.n]) milestones[milestone.n] = day;
      }
      updates.seen = seen;
      updates.encounters = encounters;
      updates.milestones = milestones;
    }
    await chrome.storage.local.set(updates);
  });
}

async function handleArtTime({ seconds }) {
  const added = Number.isSafeInteger(seconds) && seconds > 0 ? Math.min(seconds, 120) : 0;
  if (!added) return;
  return enqueueStateUpdate(async () => {
    const day = localDateKey();
    const { stats: stored } = await chrome.storage.local.get("stats");
    const stats = currentStats(stored, day);
    stats.seconds += added;
    stats.totalSeconds += added;
    stats.history[day].seconds += added;
    stats.history = pruneHistory(stats.history);
    await chrome.storage.local.set({ stats });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === "adReplaced" && sender.tab) {
    handleAdReplaced(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message && message.type === "artTime" && sender.tab) {
    handleArtTime(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message && message.type === "artImage" && typeof message.file === "string") {
    handleArtImage(message.file)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message && message.type === "openArtwork" && message.title && ARTWORK_TITLES.has(message.title)) {
    const url = `${chrome.runtime.getURL("popup/popup.html")}?art=${encodeURIComponent(message.title)}`;
    /* A small popup window shows the artwork dialog at its designed size; a
       full browser tab stretches the 400px popup layout across the screen. */
    chrome.windows.create({ url, type: "popup", width: 520, height: 760, focused: true })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  return false;
});
