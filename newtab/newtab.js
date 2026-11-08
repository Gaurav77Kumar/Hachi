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
  heroFile: "",
  gameFile: "",
};

const detailGame = { lastDay: "", streak: 0, best: 0, solvedToday: false, todayCorrect: false };

/* --- The Daily Detail -------------------------------------------------
   A deterministic daily puzzle: the date seeds the mystery artwork, the
   crop position, and the three distractors, so every new tab shows the
   same fragment without a server. Answering records the encounter (which
   stamps the Museum Passport) but never touches ad statistics. */
let detailPuzzle = null;

function hashString(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = ((hash * 31 + text.charCodeAt(index)) >>> 0);
  return hash >>> 0;
}

function dailyPuzzle(day) {
  const artwork = ARTWORKS[hashString(day) % ARTWORKS.length];
  let rng = hashString(day + artwork.t) || 1;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) >>> 0;
    return rng / 4294967296;
  };
  const pool = ARTWORKS.filter((candidate) => candidate.t !== artwork.t);
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(rand() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const distractors = pool.filter((candidate) => candidate.cat === artwork.cat).slice(0, 3);
  for (const candidate of pool) {
    if (distractors.length >= 3) break;
    if (!distractors.includes(candidate)) distractors.push(candidate);
  }
  const options = [artwork, ...distractors];
  for (let index = options.length - 1; index > 0; index--) {
    const swap = Math.floor(rand() * (index + 1));
    [options[index], options[swap]] = [options[swap], options[index]];
  }
  const cropX = 20 + Math.floor(rand() * 60);
  const cropY = 20 + Math.floor(rand() * 60);
  return { artwork, options, cropX, cropY };
}

function loadGameImage(puzzle, position) {
  const img = document.getElementById("gameImage");
  newtabState.gameFile = puzzle.artwork.file;
  img.classList.remove("show");
  img.style.objectPosition = position;
  img.removeAttribute("src");
  (async () => {
    let source = null;
    try {
      const response = await chrome.runtime.sendMessage({ type: "artImage", file: puzzle.artwork.file });
      if (response && response.ok && typeof response.dataUrl === "string" && response.dataUrl.startsWith("data:image/")) {
        source = response.dataUrl;
      }
    } catch (error) {}
    if (newtabState.gameFile !== puzzle.artwork.file) return;
    img.src = source || artImageUrl(puzzle.artwork.file, 900);
  })();
  img.onload = () => img.classList.add("show");
  img.onerror = () => img.removeAttribute("src");
}

function renderGame() {
  if (!detailPuzzle) return;
  const today = localDateKey();
  const solved = detailGame.solvedToday && detailGame.lastDay === today;
  document.getElementById("gameStreak").textContent = `🔥 ${detailGame.streak}`;
  const optionsBox = document.getElementById("gameOptions");
  const reveal = document.getElementById("gameReveal");
  if (solved) {
    document.getElementById("gameTitle").textContent = detailGame.todayCorrect ? "Nice eye — come back tomorrow" : "Now you know — come back tomorrow";
    optionsBox.hidden = true;
    reveal.hidden = false;
    document.getElementById("gameRevealTitle").textContent = puzzle.artwork.t;
    document.getElementById("gameRevealArtist").textContent = `${puzzle.artwork.a}${puzzle.artwork.y ? " · " + puzzle.artwork.y : ""}`;
    document.getElementById("gameRevealLine").textContent = puzzle.artwork.f;
    loadGameImage(puzzle, "center");
    return;
  }
  document.getElementById("gameTitle").textContent = "Guess today’s mystery artwork";
  reveal.hidden = true;
  optionsBox.hidden = false;
  optionsBox.textContent = "";
  for (const option of puzzle.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-option";
    button.textContent = option.t;
    button.addEventListener("click", () => answerDailyDetail(option.t === puzzle.artwork.t));
    optionsBox.appendChild(button);
  }
  loadGameImage(puzzle, `${puzzle.cropX}% ${puzzle.cropY}%`);
}

async function answerDailyDetail(correct) {
  const day = localDateKey();
  if (detailGame.solvedToday && detailGame.lastDay === day) return;
  detailGame.lastDay = day;
  detailGame.solvedToday = true;
  detailGame.todayCorrect = correct;
  detailGame.streak = correct ? detailGame.streak + 1 : 0;
  detailGame.best = Math.max(detailGame.best, detailGame.streak);
  try {
    await setNewtabSetting("detailGame", detailGame);
  } catch (error) {}
  try {
    const pending = chrome.runtime.sendMessage({ type: "artEncountered", title: detailPuzzle.artwork.t });
    if (pending && pending.catch) pending.catch(() => {});
  } catch (error) {}
  renderGame();
}

async function shareDailyDetail() {
  const button = document.getElementById("gameShare");
  const text = `Hachi Daily Detail ${detailGame.todayCorrect ? "🟩" : "🟥"} · 🔥 ${detailGame.streak}-day streak — guess the masterpiece from one fragment.`;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied ✓";
  } catch (error) {
    button.textContent = "Clipboard blocked";
  }
  setTimeout(() => {
    button.textContent = "Copy result";
  }, 1600);
}

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
  const museums = new Set();
  for (const title of Object.keys(newtabState.seen)) {
    const museum = typeof artworkMuseum === "function" ? artworkMuseum(title) : null;
    if (museum) museums.add(museum);
  }
  document.getElementById("statMuseums").textContent = String(museums.size);
  renderChips();
  loadHeroImage(artwork);
  renderGame();
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
  document.getElementById("gameShare").addEventListener("click", shareDailyDetail);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (newtabState.theme === "system") applyNewtabTheme();
  });
}

let newtabBound = false;

async function initNewtab() {
  const values = await chrome.storage.local.get(["collection", "showQuotes", "dailyArtwork", "theme", "stats", "seen", "encounters", "detailGame"]);
  if (typeof values.collection === "string") newtabState.collection = values.collection;
  if (values.showQuotes === false) newtabState.showQuotes = false;
  if (values.dailyArtwork === false) newtabState.dailyArtwork = false;
  if (["light", "dark", "system"].includes(values.theme)) newtabState.theme = values.theme;
  if (values.stats && typeof values.stats === "object") newtabState.stats = values.stats;
  if (values.seen && typeof values.seen === "object") newtabState.seen = values.seen;
  if (values.encounters && typeof values.encounters === "object") newtabState.encounters = values.encounters;
  if (values.detailGame && typeof values.detailGame === "object") {
    detailGame.lastDay = typeof values.detailGame.lastDay === "string" ? values.detailGame.lastDay : "";
    detailGame.streak = Number.isSafeInteger(values.detailGame.streak) && values.detailGame.streak >= 0 ? values.detailGame.streak : 0;
    detailGame.best = Number.isSafeInteger(values.detailGame.best) && values.detailGame.best >= 0 ? values.detailGame.best : 0;
    detailGame.solvedToday = values.detailGame.solvedToday === true;
    detailGame.todayCorrect = values.detailGame.todayCorrect === true;
  }
  if (newtabState.gameFile === "") detailPuzzle = dailyPuzzle(localDateKey());
  if (!newtabBound) {
    newtabBound = true;
    bindNewtab();
  }
  render();
}

let newtabRefreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!(changes.stats || changes.seen || changes.collection || changes.showQuotes || changes.dailyArtwork || changes.theme || changes.detailGame)) return;
  clearTimeout(newtabRefreshTimer);
  newtabRefreshTimer = setTimeout(initNewtab, 200);
});

initNewtab();
