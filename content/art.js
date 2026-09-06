/* Ads → Art — content script.
Finds ad slots on any page and overlays a museum card (Shadow DOM, so page
CSS can't touch it). Falls back to a gradient plaque when the artwork image
can't load. State lives in chrome.storage so the popup can control it live.
*/
(() => {
  if (window.__adsArtLoaded) return;
  window.__adsArtLoaded = true;

  const WATERMARK = "ads→art";
  const MIN_W = 120;
  const MIN_H = 64;
  const MAX_TEXT = 300; 
  const SCAN_DEBOUNCE_MS = 400;

  window.__adsArtDebug = { replaced: 0, imgsLoaded: 0, imgsFailed: 0 };

  // -- state --
  const state = { enabled: true, disabledSites: [], collection: "all" };
  let currentSite = location.hostname.replace(/^www\./, "");

  function siteDisabled() {
    return state.disabledSites.some(
      (s) => currentSite === s || currentSite.endsWith("." + s)
    );
  }

  function refreshState() {
    const active = state.enabled && !siteDisabled();
    if (active) scheduleScan();
    else revertAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    /* namespace is "local" | "sync" | "session"`
      Only settings changes need action. Data writes (stats/seen/encounters)
      fire this listener in every tab — reacting to them would cause a
      full-page rescan per write.
    */
    const settingsChanged = changes.enabled || changes.disabledSites || changes.collection;
    if (!settingsChanged) return;
    if (changes.enabled) state.enabled = changes.enabled.newValue !== false;
    if (changes.disabledSites) state.disabledSites = changes.disabledSites.newValue || [];
    if (changes.collection) {
      state.collection = changes.collection.newValue || "all";
      queueCollection = null; // deck rebuilds lazily for the new gallery
    }
    refreshState();
  });

  const stateReady = chrome.storage.local
    .get(["enabled", "disabledSites", "collection"])
    .then((v) => {
      if (v.enabled === false) state.enabled = false;
      if (Array.isArray(v.disabledSites)) state.disabledSites = v.disabledSites;
      if (v.collection) state.collection = v.collection;
      refreshState();
    })
    .catch(() => {});

  // -- detection --
  // Tier 1: unmistakable ad-network artifacts.
  const STRONG_SELECTORS = [
    "ins.adsbygoogle",
    "amp-ad",
    "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
    "iframe[src*='amazon-adsystem.com']",
    "iframe[src*='adnxs.com']",
    "iframe[src*='adsafeprotected.com']",
    "iframe[src*='2mdn.net']",
    "[id^='google_ads']",
    "[id^='div-gpt-ad']",
    "[id^='aswift']",
    "[id^='taboola-']",
    "[class^='taboola-']",
    "[data-ad-slot]",
    "[data-ad-client]",
  ].join(", ");

  // Tier 2: naming conventions (checked token-by-token to avoid false
  // positives like "address" or "advance").
  const EXACT_TOKENS = new Set([
    "ad", "ads", "adv", "advert", "adverts", "advertisement", "advertisements",
    "adbox", "adslot", "adslots", "adframe", "adunit", "adspace", "adsense",
    "dfp", "gpt", "banner", "banners", "sponsor", "sponsored",
  ]);
  const PREFIX_RE = /^(ad|ads|adv|advert|advertisement|adbox|adslot|adunit|adspace|banner|dfp|gpt|sponsor)[-_]/;
  const SUFFIX_RE = /[-_](ad|ads|advert|advertisement|adslot|adunit|banner)$/;

  function adByName(el) {
    for (const c of el.classList) {
      const t = c.toLowerCase();
      if (EXACT_TOKENS.has(t) || PREFIX_RE.test(t) || SUFFIX_RE.test(t)) return true;
    }
    const id = (el.id || "").toLowerCase();
    return EXACT_TOKENS.has(id) || PREFIX_RE.test(id) || SUFFIX_RE.test(id);
  }

  function isValidCandidate(el) {
    if (el.closest("[data-adsart-host]")) return false;
    if (el.dataset.adsartDone) return false;
    // A container whose children were already carded is a handled region.
    if (el.querySelector("[data-adsart-host], [data-adsart-done]")) return false;
    if (el.closest("nav, header, footer")) return false;
    if (el.querySelector("form, nav, header")) return false;
    if ((el.textContent || "").trim().length > MAX_TEXT) return false;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    if (r.height > window.innerHeight * 1.5) return false;
    return true;
  }

  function scan(root) {
    if (!state.enabled || siteDisabled()) return;
    const candidates = new Set();

    try {
      if (root !== document && root.nodeType === Node.ELEMENT_NODE && adByName(root)) {
        candidates.add(root); // the injected subtree's own container may be the ad
      }
      root.querySelectorAll(STRONG_SELECTORS).forEach((el) => candidates.add(el));
      root.querySelectorAll("[id],[class]").forEach((el) => {
        if (adByName(el)) candidates.add(el);
      });
    } catch (e) {
      return;
    }

    // Validate first (size/text filters), THEN resolve nesting among the
    // valid set: a container (e.g. "row-of-ads") yields to its valid child
    // slots, but wins when its only matches are tiny caption labels that
    // failed validation ("ad-label" etc.).
    const valid = [...candidates].filter((el) => el.isConnected && isValidCandidate(el));
    const chosen = valid.filter((el) => {
      for (const other of valid) {
        if (other !== el && el.contains(other)) return false;
      }
      return true;
    });

    let replaced = 0;
    for (const el of chosen) {
      replaceAd(el);
      replaced++;
    }
  }

  // -- replacement --
  function replaceAd(el) {
    el.dataset.adsartDone = "1";
    const rect = el.getBoundingClientRect();
    const height = Math.max(Math.round(rect.height), MIN_H);

    const host = document.createElement("div");
    host.dataset.adsartHost = "1";
    host.style.cssText =
      "width:100%;height:" + height + "px;display:block;margin:0;padding:0;border:0;";

    const shadow = host.attachShadow({ mode: "closed" });
    const art = pick();
    shadow.innerHTML = cardHtml(art);
    // Counter + museum writes go through the service worker so concurrent
    // tabs can't clobber each other's read-modify-write cycles.
    try {
      const p = chrome.runtime.sendMessage({
        type: "adReplaced",
        n: 1,
        art: art.t ? { t: art.t } : null, // quotes don't enter the museum
      });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* extension reloaded mid-page — drop the stat */
    }

    el.parentNode.insertBefore(host, el);
    el.style.display = "none";
    window.__adsArtDebug.replaced++;

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
    }
  }

  // One shuffled queue so a page shows different artworks and never repeats
  // until the pool is exhausted. The pool respects the selected collection;
  // "quotes" swaps the whole deck for text-only quote cards. The deck is
  // rebuilt lazily in pick() so the saved collection is honored whenever it
  // becomes known (initial load, settings change, etc.).
  let queue = [];
  let queueCollection = null;
  function pool() {
    if (state.collection === "quotes") return [];
    if (state.collection === "all" || typeof COLLECTIONS === "undefined") return ARTWORKS;
    const filtered = ARTWORKS.filter((a) => a.cat === state.collection);
    return filtered.length ? filtered : ARTWORKS;
  }
  function pick() {
    if (state.collection === "quotes") {
      if (quoteQueue.length === 0) quoteQueue = shuffle([...QUOTES]);
      return quoteQueue.pop();
    }
    if (queueCollection !== state.collection || queue.length === 0) {
      queue = shuffle([...pool()]);
      queueCollection = state.collection;
    }
    return queue.pop();
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
        <img class="art" loading="lazy" src="${artImageUrl(art.file)}" alt="${title}">
        <div class="shade"></div>
        <span class="mark">${WATERMARK}</span>
        <div class="caption">
          <div class="title">${title}</div>
          <div class="artist">${artist}${art.y ? " · " + escapeHtml(String(art.y)) : ""}</div>
          <div class="fact">${fact}</div>
        </div>
      </div>`;
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // -- restore --
  function revertAll() {
    document
      .querySelectorAll("[data-adsart-host]")
      .forEach((h) => h.remove());
    document.querySelectorAll("[data-adsart-done]").forEach((el) => {
      el.style.display = "";
      delete el.dataset.adsartDone;
    });
  }

  // -- scanning loop --
  let scanTimer = null;
  const pendingRoots = new Set();

  function scheduleScan(root) {
    if (root) pendingRoots.add(root);
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
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        scheduleScan(node);
      }
    }
  });

  function start() {
    scan(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Late-loading ads often resize after load; rescan a few times early on.
    [1200, 3000, 6000].forEach((ms) => setTimeout(() => scheduleScan(document), ms));
  }

  // -- restore --
  // Never scan before settings are known — otherwise the first slots get
  // carded with the wrong collection.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => stateReady.then(start));
  } else {
    stateReady.then(start);
  }
})();
