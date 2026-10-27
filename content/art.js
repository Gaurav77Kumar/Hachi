/* Hachi — content script.
Finds ad slots on any page and overlays a museum card (Shadow DOM, so page
CSS can't touch it). Falls back to a gradient plaque when the artwork image
can't load. State lives in chrome.storage so the popup can control it live.
*/

(() => {
  if (window.__adsArtLoaded) return;
  window.__adsArtLoaded = true;

  const WATERMARK = "Hachi";
  const PROCESSED_ATTR = "data-hachi-processed";
  const HOST_ATTR = "data-hachi-host";
  const MIN_W = 120;
  const MIN_H = 64;
  const MAX_TEXT = 300;
  /* Confidence policy: when the page does not give unmistakable evidence
     that an element is an ad slot, leave it alone. Big regions are only
     carded with ad-network proof, and content people read or interact with
     is never carded no matter what it is named. */
  const MAX_VIEWPORT_SHARE = 0.9;
  const TALL_SLOT_SHARE = 0.5;
  const NON_AD_CONTENT_SELECTOR =
    "video, audio, canvas, button, input, select, textarea, dialog, details, h1, main, article, [role='main'], [contenteditable]";
  const CONSENT_TEXT_RE = /\b(?:cookies?|consent|gdpr|privacy policy)\b/i;
  const SCAN_DEBOUNCE_MS = 400;
  const MAX_PENDING_ROOTS = 50;
  const MAX_CUSTOM_PHOTOS = 7;
  const MAX_CUSTOM_PHOTO_LENGTH = 900000;
  const MAX_CUSTOM_PHOTO_TOTAL_LENGTH = 4500000;

  window.__adsArtDebug = { replaced: 0, imgsLoaded: 0, imgsFailed: 0 };

  //  state 
  const state = {
    enabled: true,
    disabledSites: [],
    collection: "classic",
    customPhotos: [],
    showQuotes: true,
    replaceMore: false,
    showDetails: true,
  };
  const replacements = new Map();
  const countedElements = new WeakSet();
  const changedSettings = new Set();
  let started = false;
  let currentSite = location.hostname.replace(/^www\./, "");

  function siteDisabled() {
    return state.disabledSites.some(
      (s) => currentSite === s || currentSite.endsWith("." + s)
    );
  }

  function refreshState() {
    const active = state.enabled && !siteDisabled();
    if (active && started) scheduleScan();
    else if (!active) revertAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    /* namespace is "local" | "sync" | "session"`
      Only settings changes need action. Data writes (stats/seen/encounters)
      fire this listener in every tab — reacting to them would cause a
      full-page rescan per write.
    */
    const settingsChanged = changes.enabled || changes.disabledSites || changes.collection || changes.customPhotos || changes.showQuotes || changes.replaceMore || changes.showDetails;

    if (!settingsChanged) return;

    if (changes.enabled) {
      changedSettings.add("enabled");
      state.enabled = changes.enabled.newValue !== false;
    }
    if (changes.disabledSites) {
      changedSettings.add("disabledSites");
      state.disabledSites = Array.isArray(changes.disabledSites.newValue) ? changes.disabledSites.newValue : [];
    }
    if (changes.showQuotes) {
      changedSettings.add("showQuotes");
      state.showQuotes = changes.showQuotes.newValue !== false;
    }
    if (changes.replaceMore) {
      changedSettings.add("replaceMore");
      state.replaceMore = changes.replaceMore.newValue === true;
    }
    if (changes.showDetails) {
      changedSettings.add("showDetails");
      state.showDetails = changes.showDetails.newValue !== false;
    }
    if (changes.customPhotos) {
      changedSettings.add("customPhotos");
      state.customPhotos = normalizeCustomPhotos(changes.customPhotos.newValue);
      queueCollection = null;
      revertAll();
    }
    if (changes.collection) {
      changedSettings.add("collection");
      state.collection = typeof changes.collection.newValue === "string" ? changes.collection.newValue : "classic";
      queueCollection = null;
      quoteCounter = 0;
      revertAll();
    }
    if (changes.showQuotes) {
      quoteCounter = 0;
      revertAll();
    }
    if (changes.replaceMore) revertAll();
    refreshState();
  });

  const stateReady = chrome.storage.local
    .get(["enabled", "disabledSites", "collection", "customPhotos", "showQuotes", "replaceMore", "showDetails"])
    .then((v) => {
      if (!changedSettings.has("enabled") && v.enabled === false) state.enabled = false;
      if (!changedSettings.has("disabledSites") && Array.isArray(v.disabledSites)) state.disabledSites = v.disabledSites;
      if (!changedSettings.has("collection") && typeof v.collection === "string") state.collection = v.collection;
      if (!changedSettings.has("customPhotos")) state.customPhotos = normalizeCustomPhotos(v.customPhotos);
      if (!changedSettings.has("showQuotes") && v.showQuotes === false) state.showQuotes = false;
      if (!changedSettings.has("replaceMore") && v.replaceMore === true) state.replaceMore = true;
      if (!changedSettings.has("showDetails") && v.showDetails === false) state.showDetails = false;
      refreshState();
    })
    .catch(() => refreshState());

  //  detection 
  // Tier 1: unmistakable ad-network artifacts.
  const STRONG_SELECTORS = [
    "ins.adsbygoogle",
    "amp-ad",
    "[id^='google_ads']",
    "[id*='google_ads_']",
    "[class*='google-ad']",
    "[id^='div-gpt-ad']",
    "[id^='aswift']",
    "[id^='taboola-']",
    "[class^='taboola-']",
    "ins[data-ad-format]",
    "[data-ad-slot]",
    "[data-ad-client]",
  ].join(", ");
  const AD_IFRAME_DOMAINS = [
    "doubleclick.net",
    "googlesyndication.com",
    "amazon-adsystem.com",
    "adnxs.com",
    "adsafeprotected.com",
    "2mdn.net",
    "googleadservices.com",
    "adservice.google",
  ];

  // Tier 2: naming conventions (checked token-by-token to avoid false
  // positives like "address" or "advance"). Generic layout words that sites
  // attach to non-ads — "banner" (site header, cookie banner),
  // "leaderboard" (game scoreboard), "billboard", "sidebar" — are never
  // matched standalone, as a prefix, or as a suffix. A real banner ad still
  // matches through its ad wording: "banner-ad" (-ad suffix), "ad-banner"
  // (ad- prefix), "div-gpt-ad-…" (Tier 1).
  const EXACT_TOKENS = new Set([
    "ad", "ads", "adv", "advert", "adverts", "advertisement", "advertisements",
    "adbox", "adslot", "adslots", "adframe", "adunit", "adspace", "adsense",
    "adcontainer", "adwrapper", "advertising", "sidebarad", "bannerad",
    "sponsorbox", "sponsoredwidget", "sponsor", "sponsored",
    "dfp", "gpt",
  ]);
  const CONSERVATIVE_TOKENS = new Set([
    "ad", "ads", "adv", "advert", "adverts", "advertisement", "advertisements",
    "adbox", "adslot", "adslots", "adframe", "adunit", "adspace", "adsense",
    "adcontainer", "adwrapper", "advertising", "sidebarad", "bannerad",
    "sponsorbox", "sponsoredwidget", "dfp", "gpt",
  ]);
  const PREFIX_RE = /^(ad|ads|adv|advert|advertisement|adbox|adslot|adunit|adspace|adcontainer|adwrapper|dfp|gpt|sponsor|sponsored)[-_]/;
  const CONSERVATIVE_PREFIX_RE = /^(ad|ads|adv|advert|advertisement|adbox|adslot|adunit|adspace|adcontainer|adwrapper|dfp|gpt)[-_]/;
  const SUFFIX_RE = /[-_](ad|ads|advert|advertisement|adslot|adunit)$/;
  const CONSERVATIVE_SUFFIX_RE = /[-_](ad|ads|advert|advertisement|adslot|adunit)$/;

  function isAdIframe(el) {
    if (el.tagName !== "IFRAME" || !el.getAttribute("src")) return false;
    try {
      const host = new URL(el.getAttribute("src"), location.href).hostname.toLowerCase();
      return AD_IFRAME_DOMAINS.some((domain) => host === domain || host.endsWith("." + domain));
    } catch (error) {
      return false;
    }
  }

  function isStrongCandidate(el) {
    return el.matches(STRONG_SELECTORS) || isAdIframe(el);
  }

  function adByName(el) {
    const tokens = state.replaceMore ? EXACT_TOKENS : CONSERVATIVE_TOKENS;
    const prefix = state.replaceMore ? PREFIX_RE : CONSERVATIVE_PREFIX_RE;
    const suffix = state.replaceMore ? SUFFIX_RE : CONSERVATIVE_SUFFIX_RE;
    for (const c of el.classList) {
      const t = c.toLowerCase();
      if (tokens.has(t) || prefix.test(t) || suffix.test(t)) return true;
    }
    const id = (el.id || "").toLowerCase();
    return tokens.has(id) || prefix.test(id) || suffix.test(id);
  }

  function isValidCandidate(el) {
    if (el.closest(`[${HOST_ATTR}]`)) return false;
    if (el.hasAttribute(PROCESSED_ATTR)) return false;
    // A container whose children were already carded is a handled region.
    if (el.querySelector(`[${HOST_ATTR}], [${PROCESSED_ATTR}]`)) return false;
    if (el.closest("nav, header, footer")) return false;
    // Regions people read or interact with — content wrappers, media
    // players, modals, consent overlays — are never carded, however named.
    if (el.closest("dialog, [role='dialog'], [aria-modal='true']")) return false;
    if (el.closest("video, audio, [class*='player' i], [id*='player' i]")) return false;
    if (el.querySelector(NON_AD_CONTENT_SELECTOR)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (style.position === "fixed" || style.position === "sticky") return false;
    if (Number.parseFloat(style.opacity) === 0 || style.contentVisibility === "hidden") return false;
    const text = (el.textContent || "").trim();
    if (text.length > (state.replaceMore ? 500 : MAX_TEXT)) return false;
    const strong = isStrongCandidate(el);
    if (!strong && CONSENT_TEXT_RE.test(text.slice(0, 600))) return false;
    const r = el.getBoundingClientRect();
    const minimumWidth = state.replaceMore ? 90 : MIN_W;
    const minimumHeight = state.replaceMore ? 45 : MIN_H;
    if (r.width < minimumWidth || r.height < minimumHeight) return false;
    // A slot taller than half the viewport must carry an ad-network
    // signature (Tier 1) — a name alone is not enough, since players and
    // layout regions borrow ad-like class names. Nothing near full-screen
    // is ever carded.
    if (r.height > window.innerHeight * MAX_VIEWPORT_SHARE) return false;
    if (r.height > window.innerHeight * TALL_SLOT_SHARE && !strong) return false;
    return true;
  }

  function scan(root) {
    if (!state.enabled || siteDisabled()) return;
    const candidates = new Set();

    try {
      if (root !== document && root.nodeType === Node.ELEMENT_NODE) {
        if (isStrongCandidate(root)) candidates.add(root);
        else if (adByName(root)) candidates.add(root);
      }
      root.querySelectorAll(STRONG_SELECTORS).forEach((el) => candidates.add(el));
      root.querySelectorAll("iframe").forEach((el) => {
        if (isAdIframe(el)) candidates.add(el);
      });
      root.querySelectorAll("[id],[class]").forEach((el) => {
        if (isStrongCandidate(el)) candidates.add(el);
        else if (adByName(el)) candidates.add(el);
      });
    } catch (e) {
      return;
    }

    /* Validate first (size/text filters), THEN resolve nesting among the
       valid set: a container (e.g. "row-of-ads") yields to its valid child
       slots, but wins when its only matches are tiny caption labels that
       failed validation ("ad-label" etc.).
    */
    const valid = [...candidates].filter((el) => el.isConnected && isValidCandidate(el));
    const chosen = valid.filter((el) => {
      for (const other of valid) {
        if (other !== el && el.contains(other)) return false;
      }
      return true;
    });

    for (const el of chosen) {
      replaceAd(el);
    }
  }

  //  replacement 
  function replaceAd(el) {
    const art = pick();
    if (!art) return false;
    el.setAttribute(PROCESSED_ATTR, "true");
    const originalDisplay = {
      value: el.style.getPropertyValue("display"),
      priority: el.style.getPropertyPriority("display"),
    };
    const rect = el.getBoundingClientRect();
    const height = Math.max(Math.round(rect.height), MIN_H);
    const shouldCount = !countedElements.has(el);

    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "true");
    host.style.cssText =
      "width:100%;height:" + height + "px;display:block;margin:0;padding:0;border:0;";

    const shadow = host.attachShadow({ mode: "closed" });
    let html;
    try {
      html = cardHtml(art);
    } catch (error) {
      el.removeAttribute(PROCESSED_ATTR);
      return false;
    }
    shadow.innerHTML = html;

    el.parentNode.insertBefore(host, el);
    const replacement = { host, originalElement: el, originalDisplay, resizeObserver: null, syncing: false };
    replacements.set(el, replacement);
    if (typeof ResizeObserver === "function" && el.parentElement) {
      replacement.resizeObserver = new ResizeObserver(() => syncReplacementHeight(replacement));
      replacement.resizeObserver.observe(el.parentElement);
    }
    el.style.setProperty("display", "none", "important");
    if (shouldCount) countedElements.add(el);
    window.__adsArtDebug.replaced++;
    startArtTime();
    if (shouldCount) {
      try {
        const p = chrome.runtime.sendMessage({
          type: "adReplaced",
          n: 1,
          art: art.t && !art.custom ? { t: art.t } : null,
        });
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
      }
    }

    const card = shadow.querySelector(".card");
    if (state.showDetails && !art.custom && art.t) {
      card.style.cursor = "pointer";
      card.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        try {
          chrome.runtime.sendMessage({ type: "openArtwork", title: art.t }, () => void chrome.runtime.lastError);
        } catch (error) {}
      });
    }
    const img = shadow.querySelector("img");
    if (img) {
      img.addEventListener("load", () => {
        window.__adsArtDebug.imgsLoaded++;
        img.classList.add("show");
      });
      img.addEventListener("error", () => {
        window.__adsArtDebug.imgsFailed++;
        img.remove();
        shadow.querySelector(".card").classList.add("plaque");
      });
      if (!art.custom && art.file) loadCardImage(img, art.file);
    }
    return true;
  }

  /* One shuffled queue so a page shows different artworks and never repeats
     until the pool is exhausted. The pool respects the selected collection;
     quotes swaps the whole deck for text-only quote cards. The deck is
     rebuilt lazily in pick() so the saved collection is honored whenever it
     becomes known (initial load, settings change, etc.).
  */
  let queue = [];
  let queueCollection = null;
  let quoteCounter = 0;
  function pool() {
    if (state.collection === "quotes") return [];
    if (state.collection === "custom") {
      return state.customPhotos.filter((photo) => safeCustomDataUrl(photo.dataUrl)).map((photo) => ({
        t: photo.name,
        a: "Your photo",
        f: "A personal artwork from your Hachi collection.",
        dataUrl: photo.dataUrl,
        custom: true,
      }));
    }
    const categories = {
      classic: ["classic", "renaissance"],
      modern: ["impression", "vangogh"],
      nature: ["impression", "space"],
      photography: ["space"],
      architecture: ["renaissance", "classic"],
      dutch: ["dutch"],
      american: ["american"],
      poster: ["poster"],
    };
    if (state.collection === "all" || typeof COLLECTIONS === "undefined") return ARTWORKS;
    const selected = categories[state.collection] || [state.collection];
    const filtered = ARTWORKS.filter((artwork) => selected.includes(artwork.cat));
    return filtered.length ? filtered : ARTWORKS;
  }
  function pick() {
    if (state.collection === "custom" && state.customPhotos.length === 0) return null;
    if (state.collection !== "custom" && (state.collection === "quotes" || (state.showQuotes && quoteCounter++ % 5 === 4))) {
      if (quoteQueue.length === 0) quoteQueue = shuffle([...QUOTES]);
      return quoteQueue.pop();
    }
    if (queueCollection !== state.collection || queue.length === 0) {
      queue = shuffle([...pool()]);
      queueCollection = state.collection;
    }
    return queue.pop() || (state.collection === "custom" ? null : (ARTWORKS[0] || null));
  }

  let quoteQueue = shuffle([...(typeof QUOTES !== "undefined" ? QUOTES : [])]);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function cardHtml(art) {
    if (art.q) return quoteCardHtml(art);
    const title = escapeHtml(art.t);
    const artist = escapeHtml(art.a);
    const fact = escapeHtml(art.f);
    const source = art.custom ? safeCustomDataUrl(art.dataUrl) : "";
    if (art.custom && !source) throw new Error("Invalid custom image");
    const escapedSource = escapeHtml(source);
    const bg = artGradient(art.t);
    return `
      <style>
        :host { all: initial; display: block; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card {
          position: relative; width: 100%; height: 100%;
          min-height: 64px; border-radius: 10px; overflow: hidden;
          background: ${bg};
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
          display: flex; align-items: flex-end;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        img.art {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; opacity: 0; transition: opacity 0.6s ease;
        }
        img.art.show { opacity: 1; }
        .shade {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%);
        }
        .card.plaque .shade { background: linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.5) 100%); }
        .caption {
          position: relative; padding: 10px 12px 9px; color: #f3f0e8;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8); max-height: 100%; overflow: hidden;
        }
        .title { font-size: 13px; font-style: italic; font-weight: 700; line-height: 1.25; }
        .artist { font-size: 10.5px; opacity: 0.85; margin-top: 1px; }
        .fact {
          font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 10px; line-height: 1.35; opacity: 0.78; margin-top: 4px;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .mark {
          position: absolute; top: 6px; right: 8px;
          font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 9px; letter-spacing: 0.4px; color: rgba(255,255,255,0.55);
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
      </style>
      <div class="card">
        <img class="art" loading="lazy" decoding="async" ${escapedSource ? `src="${escapedSource}" referrerpolicy="no-referrer"` : ""} alt="${title}">
        <div class="shade"></div>
        <span class="mark">${WATERMARK}</span>
        <div class="caption">
          <div class="title">${title}</div>
          <div class="artist">${artist}${art.y ? " · " + escapeHtml(String(art.y)) : ""}</div>
          <div class="fact">${fact}</div>
        </div>
      </div>`;
  }

  /* Artwork images load through the background worker so every successfully
     viewed artwork lands in the offline cache. If the worker is unreachable
     the card falls back to the direct URL, whose failure yields the plaque. */
  function loadCardImage(img, file) {
    (async () => {
      let source = null;
      try {
        const response = await chrome.runtime.sendMessage({ type: "artImage", file });
        if (response && response.ok && typeof response.dataUrl === "string" && response.dataUrl.startsWith("data:image/")) {
          source = response.dataUrl;
        }
      } catch (error) {}
      if (!img.isConnected) return;
      img.src = source || artImageUrl(file);
    })();
  }

  function quoteCardHtml(quote) {
    const q = escapeHtml(quote.q);
    const a = escapeHtml(quote.a);
    return `
      <style>
        :host { all: initial; display: block; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card {
          position: relative; width: 100%; height: 100%;
          min-height: 64px; border-radius: 10px; overflow: hidden;
          background: linear-gradient(150deg, #232946, #0f131c);
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
          display: flex; flex-direction: column; justify-content: center;
          padding: 12px 16px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        .q {
          color: #f3f0e8; font-style: italic; font-size: 15px; line-height: 1.4;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .a {
          color: #d4af37; font-size: 10.5px; margin-top: 7px; letter-spacing: 0.4px;
          font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .mark {
          position: absolute; top: 6px; right: 8px;
          font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 9px; letter-spacing: 0.4px; color: rgba(255,255,255,0.45);
        }
      </style>
      <div class="card">
        <span class="mark">${WATERMARK}</span>
        <div class="q">“${q}”</div>
        <div class="a">— ${a}</div>
      </div>`;
  }

  function safeCustomDataUrl(value) {
    return typeof value === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
      ? value
      : null;
  }

  function normalizeCustomPhotos(value) {
    if (!Array.isArray(value)) return [];
    let totalLength = 0;
    return value
      .filter((photo) => {
        const dataUrl = photo && typeof photo === "object" ? safeCustomDataUrl(photo.dataUrl) : null;
        if (!dataUrl || dataUrl.length > MAX_CUSTOM_PHOTO_LENGTH || totalLength + dataUrl.length > MAX_CUSTOM_PHOTO_TOTAL_LENGTH) return false;
        totalLength += dataUrl.length;
        return true;
      })
      .slice(0, MAX_CUSTOM_PHOTOS)
      .map((photo) => ({ name: typeof photo.name === "string" ? photo.name.slice(0, 200) : "Your photo", dataUrl: photo.dataUrl }));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncReplacementHeight(replacement) {
    const el = replacement.originalElement;
    if (!el || !el.isConnected || replacement.syncing) return;
    replacement.syncing = true;
    if (replacement.originalDisplay.value) {
      el.style.setProperty("display", replacement.originalDisplay.value, replacement.originalDisplay.priority);
    } else {
      el.style.removeProperty("display");
    }
    const height = Math.round(el.getBoundingClientRect().height);
    el.style.setProperty("display", "none", "important");
    replacement.syncing = false;
    if (height >= MIN_H && height <= window.innerHeight * MAX_VIEWPORT_SHARE && replacement.host.style.height !== height + "px") replacement.host.style.height = height + "px";
  }

  let pendingArtSeconds = 0;
  let visibleArtSince = 0;
  let artTimeFlushPromise = null;
  let artTimeFlushAgain = false;

  function hasActiveReplacement() {
    for (const [el, replacement] of replacements) {
      if (el.isConnected && replacement.host.isConnected) return true;
    }
    return false;
  }

  function captureArtTime() {
    if (!visibleArtSince || document.hidden) return;
    const now = Date.now();
    pendingArtSeconds += (now - visibleArtSince) / 1000;
    visibleArtSince = now;
  }

  function startArtTime() {
    if (!document.hidden && hasActiveReplacement() && !visibleArtSince) visibleArtSince = Date.now();
  }

  function stopArtTime() {
    captureArtTime();
    visibleArtSince = 0;
  }

  function flushArtTime(allowInactive = false) {
    captureArtTime();
    if (!allowInactive && !hasActiveReplacement()) {
      visibleArtSince = 0;
      pendingArtSeconds = 0;
      return Promise.resolve();
    }
    const seconds = Math.min(120, Math.floor(pendingArtSeconds));
    if (seconds < 1) return Promise.resolve();
    if (artTimeFlushPromise) {
      artTimeFlushAgain = true;
      return artTimeFlushPromise;
    }
    artTimeFlushPromise = Promise.resolve()
      .then(() => chrome.runtime.sendMessage({ type: "artTime", seconds }))
      .then((response) => {
        if (response && response.ok === false) throw new Error("Time update failed");
        pendingArtSeconds = Math.max(0, pendingArtSeconds - seconds);
      })
      .catch(() => {})
      .finally(() => {
        artTimeFlushPromise = null;
        if (artTimeFlushAgain) {
          artTimeFlushAgain = false;
          flushArtTime(allowInactive);
        } else if (allowInactive) {
          pendingArtSeconds = 0;
        }
      });
    return artTimeFlushPromise;
  }

  function handleArtVisibilityChange() {
    if (document.hidden) {
      stopArtTime();
      flushArtTime(true);
    } else {
      startArtTime();
    }
  }

  // restore 
  function revertAll() {
    stopArtTime();
    for (const [el, replacement] of replacements) {
      if (replacement.resizeObserver) replacement.resizeObserver.disconnect();
      if (replacement.host.isConnected) replacement.host.remove();
      if (replacement.originalDisplay.value) {
        el.style.setProperty("display", replacement.originalDisplay.value, replacement.originalDisplay.priority);
      } else {
        el.style.removeProperty("display");
      }
      el.removeAttribute(PROCESSED_ATTR);
    }
    replacements.clear();
    flushArtTime(true);
  }

  //  scanning loop 
  let scanTimer = null;
  const pendingRoots = new Set();

  function scheduleScan(root) {
    if (root) {
      if (pendingRoots.has(document)) return;
      pendingRoots.add(root);
      if (pendingRoots.size > MAX_PENDING_ROOTS) {
        pendingRoots.clear();
        pendingRoots.add(document);
      }
    }
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      // First scan is whole-document; afterwards only the subtrees that
      // actually changed — the [id],[class] sweep is too expensive to repeat
      // over the entire DOM on every mutation.
      if (pendingRoots.size === 0 || pendingRoots.has(document)) {
        scan(document);
      } else {
        for (const root of pendingRoots) {
          if (root.isConnected) scan(root);
        }
      }
      pendingRoots.clear();
    }, SCAN_DEBOUNCE_MS);
  }

  const observer = new MutationObserver((mutations) => {
    if (!state.enabled || siteDisabled()) return;
    for (const m of mutations) {
      if (m.type === "attributes") {
        const target = m.target;
        if (target.nodeType !== Node.ELEMENT_NODE) continue;
        if (target.closest(`[${HOST_ATTR}]`) || target.hasAttribute(PROCESSED_ATTR)) continue;
        if (isStrongCandidate(target) || adByName(target)) scheduleScan(target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute(HOST_ATTR)) continue;
        scheduleScan(node);
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.hasAttribute(HOST_ATTR) || node.querySelector(`[${HOST_ATTR}]`)) {
          for (const [element, replacement] of replacements) {
            if (!element.isConnected || !replacement.host.isConnected) {
              if (replacement.resizeObserver) replacement.resizeObserver.disconnect();
              replacements.delete(element);
            }
          }
          stopArtTime();
          flushArtTime(true);
        }
      }
    }
  });

  function start() {
    started = true;
    scan(document);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id", "style", "src", "data-ad-slot", "data-ad-client", "data-ad-format"],
    });
    [1200, 3000, 6000].forEach((ms) => setTimeout(() => scheduleScan(document), ms));
    setInterval(() => {
      if (document.hidden) return;
      if (!state.enabled || siteDisabled() || !hasActiveReplacement()) {
        if (visibleArtSince) {
          stopArtTime();
          flushArtTime(true);
        }
        return;
      }
      startArtTime();
      flushArtTime();
    }, 60000);
    document.addEventListener("visibilitychange", handleArtVisibilityChange);
    document.addEventListener("pagehide", () => {
      stopArtTime();
      flushArtTime(true);
    });
    document.addEventListener("pageshow", startArtTime);
  }

  //  restore 
  // Never scan before settings are known — otherwise the first slots get
  // carded with the wrong collection.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => stateReady.then(start));
  } else {
    stateReady.then(start);
  }
})();
