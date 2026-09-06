# Ads → Art 🖼️

A Chrome extension that replaces ad slots with famous public-domain artworks
and a line of culture. Instead of an ad for shoes, you get a Vermeer with a
one-line fact about it.

Built as **viral-machine** — the smallest possible scope with the biggest
viral ceiling: every replaced ad is a screenshot people want to share.

## How it works

1. A content script runs on every page (MV3, `<all_urls>`).
2. It finds ad slots two ways:
   - **Strong signals** — `ins.adsbygoogle`, `doubleclick.net`/`googlesyndication`
     iframes, `[id^="div-gpt-ad"]`, taboola/outbrain containers, etc.
   - **Naming conventions** — id/class tokens like `ad`, `ad-slot`, `banner-ad`,
     `sponsored` (checked token-by-token so `address` or `advance` never match).
3. Validated candidates must be reasonably sized (≥120×64), not text-heavy
   (<300 chars — real content, not an ad shell), not inside nav/header/footer,
   and not contain forms.
4. Each slot gets a **Shadow DOM** card overlay: the page's CSS can't touch it,
   and the page can't read it. The original ad element is hidden, not removed,
   so layout stays intact.
5. A **MutationObserver** catches late-loading and SPA-navigated ads.

If the artwork image can't load (offline, site CSP), the card degrades to a
gradient "museum plaque" — title, artist, year, fact — never a broken page.

## Gallery

**Themes:** Everything · Classics · Renaissance · Impressionists ·
Van Gogh · Space (NASA) · Quotes (text-only, no images)

54 public-domain artworks (all artists died before 1935, or NASA imagery)
served from
Wikimedia Commons via `Special:FilePath` redirects. Every filename in
`lib/artworks.js` is verified with HTTP checks; each card has a curated
one-line fact. Cards never repeat until the pool is exhausted (shuffled queue).

## Features

- **Collections** — pick your gallery in the popup: Everything, Classics,
  Renaissance, Impressionists, Van Gogh, Space (NASA), or text-only Quotes.
- **Personal museum** — every artwork you discover is marked; earn curator
  titles (Gallery Visitor → Patron of the Arts → Collector → Curator).
- **Weekly gallery card** — one click exports a shareable collage of the
  artworks you encountered this week, with your "ads converted" count.
- Toggle on/off globally from the popup
- Per-site disable ("Disable on this site")
- Daily + all-time replacement counter
- Zero servers, zero analytics, no accounts — artwork loads direct from
  Wikimedia Commons


### Done ✅
- [x] Collections picker (Classics, Renaissance, Impressionists, Van Gogh, Space)
- [x] Quotes theme (text-only, no images)
- [x] Personal museum + curator milestones
- [x] Weekly gallery share card

### v1.3 — depth & delight
- [ ] **Artwork detail view** — click a card to open the full painting with its
      story and a link to the museum that holds it
- [ ] **Personal museum page** — a full-page grid of every artwork you've
      discovered, with gaps showing what's left to find
- [ ] **New collections** — Dutch Golden Age, American masters, vintage travel
      posters, botanical illustration
- [ ] **Image caching** — store viewed artworks locally after first load
      (offline-friendly, faster, kinder to Wikimedia)
- [ ] **"Found 100 ads" share prompt** — celebrate round numbers by surfacing
      the share card at 100 / 500 / 1000 conversions

### v1.4 — bigger swings
- [ ] **Theme scheduling** — space at night, impressionists on Sunday mornings;
      auto-switch themes by time of day or season
- [ ] **Custom gallery** — let users paste image URLs or drop their own photos
      into a personal theme
- [ ] **Sync settings across devices** — move on/off, themes, and museum
      progress to `chrome.storage.sync`
- [ ] **Community theme packs** — curated galleries submitted by users
      (needs a review process; build only if the audience asks)
- [ ] **Facts in multiple languages** — i18n for captions and facts
