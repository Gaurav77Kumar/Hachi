importScripts("lib/artworks.js", "lib/museum.js");

const MUSEUM_MILESTONES_REF = typeof MUSEUM_MILESTONES !== "undefined" ? MUSEUM_MILESTONES : [];
const ARTWORK_TITLES = new Set(typeof ARTWORKS !== "undefined" ? ARTWORKS.map((artwork) => artwork.t) : []);
const HISTORY_LIMIT = 120;
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
  if (message && message.type === "openArtwork" && message.title && ARTWORK_TITLES.has(message.title)) {
    const url = `${chrome.runtime.getURL("popup/popup.html")}?art=${encodeURIComponent(message.title)}`;
    chrome.tabs.create({ url, active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  return false;
});
