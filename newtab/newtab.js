/* New Tab Museum. Renders today's featured artwork, quiet statistics, and
   the style switcher on every new tab. Shares the catalog and the offline
   cache with the rest of the extension: the hero loads through the
   background worker's artImage path, so viewed artworks work offline. */

const NEWTAB_COLLECTIONS = [
  { id: "classic", label: "Classics" },
  { id: "modern", label: "Modern" },
  { id: "nature", label: "Nature" },
  { id: "photography", label: "Photography" },
  { id: "architecture", label: "Architecture" },
  { id: "dutch", label: "Dutch" },
  { id: "american", label: "American" },
  { id: "poster", label: "Posters" },
];

const newtabState = {
  collection: "classic",
  showQuotes: true,
  dailyArtwork: true,
  theme: "light",
  stats: {},
  seen: {},
  encounters: {},
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setNewtabSetting(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

function applyNewtabTheme() {
  const dark = newtabState.theme === "dark" || (newtabState.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function dailyArtwork() {
  const seed = [...localDateKey()].reduce((total, character) => total + character.charCodeAt(0), 0);
  return ARTWORKS[seed % ARTWORKS.length];
}

function featuredArtwork() {
  if (!newtabState.dailyArtwork) {
    const recentTitle = Object.entries(newtabState.encounters).sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0];
    return ARTWORKS.find((artwork) => artwork.t === recentTitle) || dailyArtwork();
  }
  return dailyArtwork();
}

function artQuote(artwork) {
  const quotes = typeof QUOTES !== "undefined" && QUOTES.length ? QUOTES : [{ q: "Art washes away from the soul the dust of everyday life.", a: "Pablo Picasso" }];
  const hash = [...artwork.t].reduce((total, character) => total + character.charCodeAt(0), 0);
  const quote = quotes[hash % quotes.length];
  return `“${quote.q}” — ${quote.a}`;
}

function commonsPage(artwork) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(artwork.file)}`;
}

function openArtworkWindow(title) {
  const url = chrome.runtime.getURL("popup/popup.html") + (title ? `?art=${encodeURIComponent(title)}` : "?view=home");
  if (chrome.windows && chrome.windows.create) {
    chrome.windows.create({ url, type: "popup", width: 520, height: 760, focused: true });
  } else {
    window.open(url, "_blank");
  }
}

function loadHeroImage(artwork) {
  const hero = document.getElementById("hero");
  const img = document.getElementById("heroImage");
  hero.style.background = artGradient(artwork.t);
  img.classList.remove("show");
  img.removeAttribute("src");
  (async () => {
    let source = null;
    try {
      const response = await chrome.runtime.sendMessage({ type: "artImage", file: artwork.file });
      if (response && response.ok && typeof response.dataUrl === "string" && response.dataUrl.startsWith("data:image/")) {
        source = response.dataUrl;
      }
    } catch (error) {}
    if (newtabState.heroFile !== artwork.file) return;
    img.src = source || artImageUrl(artwork.file, 1600);
  })();
  img.onload = () => img.classList.add("show");
  img.onerror = () => {
    img.classList.remove("show");
    img.removeAttribute("src");
  };
}

function renderChips() {
  const container = document.getElementById("collectionChips");
  container.textContent = "";
  for (const collection of NEWTAB_COLLECTIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (newtabState.collection === collection.id ? " active" : "");
    chip.textContent = collection.label;
    chip.addEventListener("click", async () => {
      try {
        await setNewtabSetting("collection", collection.id);
        newtabState.collection = collection.id;
        renderChips();
      } catch (error) {}
    });
    container.appendChild(chip);
  }
}

function render() {
  applyNewtabTheme();
  const artwork = featuredArtwork();
  newtabState.heroFile = artwork.file;
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  document.getElementById("heroEyebrow").textContent = newtabState.dailyArtwork ? "Today’s artwork" : "From your recent discoveries";
  document.getElementById("heroTitle").textContent = artwork.t;
  document.getElementById("heroArtist").textContent = `${artwork.a}${artwork.y ? " · " + artwork.y : ""}`;
  document.getElementById("heroLine").textContent = newtabState.showQuotes ? artQuote(artwork) : artwork.f;
  const today = localDateKey();
  const history = newtabState.stats.history && typeof newtabState.stats.history === "object" ? newtabState.stats.history : {};
  const todayEntry = history[today] && typeof history[today] === "object" ? history[today] : {};
  const stats = newtabState.stats;
  document.getElementById("statAds").textContent = String(todayEntry.ads || (stats.day === today ? stats.replaced || 0 : 0));
  document.getElementById("statTime").textContent = `${Math.floor((todayEntry.seconds || (stats.day === today ? stats.seconds || 0 : 0)) / 60)}m`;
  document.getElementById("statSeen").textContent = String(Object.keys(newtabState.seen).length);
  renderChips();
  loadHeroImage(artwork);
}

function bindNewtab() {
  document.getElementById("heroSource").addEventListener("click", () => {
    const artwork = featuredArtwork();
    const url = commonsPage(artwork);
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
    else window.open(url, "_blank");
  });
  document.getElementById("heroDetails").addEventListener("click", () => {
    openArtworkWindow(featuredArtwork().t);
  });
  document.getElementById("openHachi").addEventListener("click", () => {
    openArtworkWindow(null);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (newtabState.theme === "system") applyNewtabTheme();
  });
}

let newtabBound = false;

async function initNewtab() {
  const values = await chrome.storage.local.get(["collection", "showQuotes", "dailyArtwork", "theme", "stats", "seen", "encounters"]);
  if (typeof values.collection === "string") newtabState.collection = values.collection;
  if (values.showQuotes === false) newtabState.showQuotes = false;
  if (values.dailyArtwork === false) newtabState.dailyArtwork = false;
  if (["light", "dark", "system"].includes(values.theme)) newtabState.theme = values.theme;
  if (values.stats && typeof values.stats === "object") newtabState.stats = values.stats;
  if (values.seen && typeof values.seen === "object") newtabState.seen = values.seen;
  if (values.encounters && typeof values.encounters === "object") newtabState.encounters = values.encounters;
  if (!newtabBound) {
    newtabBound = true;
    bindNewtab();
  }
  render();
}

let newtabRefreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!(changes.stats || changes.seen || changes.collection || changes.showQuotes || changes.dailyArtwork || changes.theme)) return;
  clearTimeout(newtabRefreshTimer);
  newtabRefreshTimer = setTimeout(initNewtab, 200);
});

initNewtab();
