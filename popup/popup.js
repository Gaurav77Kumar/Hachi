const DEFAULTS = { enabled: true, disabledSites: [], collection: "all" };

async function loadState() {
  const v = await chrome.storage.local.get([
    "enabled",
    "disabledSites",
    "stats",
    "collection",
    "seen",
    "milestones",
  ]);
  return { ...DEFAULTS, ...v };
}

function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return null;
  }
}

function matchesSite(site, entry) {
  return site === entry || site.endsWith("." + entry);
}

let currentSite = null;

async function render() {
  const { enabled, disabledSites, stats, collection, seen = {}, milestones = {} } = await loadState();
  document.getElementById("enabled").checked = enabled !== false;

  // Collection picker
  const select = document.getElementById("collection");
  select.innerHTML = "";
  for (const c of COLLECTIONS) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
  select.value = collection || "all";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentSite = tab && tab.url ? siteOf(tab.url) : null;

  const btn = document.getElementById("siteToggle");
  const isDisabled =
    currentSite && disabledSites.some((s) => matchesSite(currentSite, s));
  btn.classList.toggle("disabled-site", !!isDisabled);
  btn.textContent = isDisabled
    ? `Enable on ${currentSite || "this site"}`
    : `Disable on ${currentSite || "this site"}`;
  btn.disabled = !currentSite;
  btn.title = currentSite ? "" : "This page has no site to disable";

  const today = stats && stats.day === localDateKey() ? stats.replaced || 0 : 0;
  document.getElementById("todayCount").textContent = today;
  document.getElementById("totalCount").textContent =
    (stats && stats.total) || 0;

  renderMuseum(seen, milestones);
}

function renderMuseum(seen, milestones) {
  const { count, total, next, earned } = museumStats(seen);
  document.getElementById("seenCount").textContent = `${count}/${total}`;
  document.getElementById("museumBar").style.width = `${(count / total) * 100}%`;

  const el = document.getElementById("milestoneText");
  if (earned.length) {
    const last = earned[earned.length - 1];
    el.innerHTML = `${last.icon} <b>${last.name}</b> unlocked` + (next ? ` · next: ${next.name} at ${next.n}` : " · gallery complete! 🎉");
  } else if (next) {
    el.textContent = `Next title: ${next.name} — discover ${next.n - count} more artwork${next.n - count === 1 ? "" : "s"}`;
  } else {
    el.textContent = "Discover artworks to earn curator titles";
  }
}

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Gallery size is known at load; no storage round-trip needed.
if (typeof ARTWORKS !== "undefined") {
  document.getElementById("artCount").textContent = ARTWORKS.length;
}

render();

document.getElementById("enabled").addEventListener("change", async (e) => {
  const on = e.target.checked;
  await chrome.storage.local.set({ enabled: on });
});

document.getElementById("collection").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ collection: e.target.value });
});

document.getElementById("shareWeek").addEventListener("click", async () => {
  const btn = document.getElementById("shareWeek");
  btn.disabled = true;
  btn.textContent = "Painting…";
  try {
    const { encounters = {}, stats = {} } = await chrome.storage.local.get([
      "encounters",
      "stats",
    ]);
    const canvas = document.createElement("canvas");
    await drawWeekCard(canvas, {
      encounters,
      total: (stats && stats.total) || 0,
    });
    downloadWeekCard(canvas);
  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Weekly gallery card";
  }
});

document.getElementById("siteToggle").addEventListener("click", async () => {
  if (!currentSite) return;
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
  const isDisabled = disabledSites.some((s) => matchesSite(currentSite, s));
  const next = isDisabled
    ? disabledSites.filter((s) => !matchesSite(currentSite, s))
    : [...disabledSites, currentSite];
  await chrome.storage.local.set({ disabledSites: next });
  render();
});
