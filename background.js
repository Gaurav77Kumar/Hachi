// Ads → Art service worker.
// 1. Relay/liveness for the popup.
// 2. Owns ALL stats + museum writes: content scripts report replacements via
//    messages, and this single process does the read-modify-write — so
//    concurrent tabs can never clobber each other's counts or discoveries.
importScripts("lib/museum.js");

const MUSEUM_MILESTONES_REF = typeof MUSEUM_MILESTONES !== "undefined" ? MUSEUM_MILESTONES : [];

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function handleAdReplaced({ n, art }) {
  const day = localDateKey();
  const { stats = {}, seen = {}, encounters = {}, milestones = {} } =
    await chrome.storage.local.get(["stats", "seen", "encounters", "milestones"]);

  // Stats counter, rolling over at midnight.
  let s = stats;
  if (s.day !== day) s = { day, replaced: 0, total: (s.total || 0) + (s.replaced || 0) };
  s.replaced = (s.replaced || 0) + (n || 1);
  s.total = (s.total || 0) + (n || 1);

  const updates = { stats: s };

  // Museum discovery (artwork cards only — quotes stay out).
  if (art && art.t) {
    seen[art.t] = seen[art.t] || day;
    encounters[art.t] = day;
    const seenCount = Object.keys(seen).length;
    for (const m of MUSEUM_MILESTONES_REF) {
      if (seenCount >= m.n && !milestones[m.n]) milestones[m.n] = day;
    }
    updates.seen = seen;
    updates.encounters = encounters;
    updates.milestones = milestones;
  }

  await chrome.storage.local.set(updates);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }
  if (msg && msg.type === "adReplaced" && sender.tab) {
    handleAdReplaced(msg); // fire-and-forget; SW stays alive during the write
  }
  return false;
});
