## 0. Before you start

- [ ] Use the unpacked extension on **real websites for a few days** — news
      sites (CNN, BBC, blogs with banner ads). Watch for false positives
      (non-ad elements turning into paintings). If you find one, note the
      page + element class; fix in `content/art.js` before publishing.
- [ ] Confirm `LICENSE` has your name, and PRIVACY.md/LISTING.md match.
- [ ] This extension uses `<all_urls>` — expect a **deeper review** (up to a
      few weeks). Set expectations accordingly and launch marketing only
      after approval.

## 1. Package & upload (~10 min, $5 fee)

- [ ] `chrome://extensions` → remove the unpacked copy (avoid version confusion).
- [ ] Build the zip (same script pattern as MediumStreak):
      ```
      cd viral-machine
      # zip manifest.json, background.js, content/, popup/, lib/ (minus mock.js), icons/
      ```
      (Exclude `tools/` and `lib/mock.js` — dev-only.)
- [ ] Developer console → New item → upload the zip.
- [ ] Copy the item's store URL (no config.js in this project — nothing to wire back).

## 2. Fill the listing (~15 min)

Copy-paste from `LISTING.md`:
- [ ] Name, summary, description
- [ ] Category: **Accessibility** or **Productivity** (try Accessibility first —
      less crowded; the "calmer web" angle fits)
- [ ] 5 screenshots at 1280×800 (before/after hero shot first)
- [ ] Privacy policy URL (hosted PRIVACY.md — step 3)

## 3. Host the privacy policy (5 min)

- [ ] Push the repo to GitHub (it can live in the same repo as MediumStreak or
      its own) → open PRIVACY.md on github.com → copy that URL.

## 4. Privacy tab + justifications (5 min)

- [ ] Privacy practices → **"Does not collect user data"**.
- [ ] Paste the host-permission justification from LISTING.md. This is the
      critical step for a `<all_urls>` extension — make it detailed and honest.

## 5. Submit & wait

- [ ] Submit for review. Broad-host content scripts often trigger **manual
      review (1–4 weeks)**. Don't panic; don't resubmit while waiting.
- [ ] While waiting: prepare launch posts (below) but **don't publish** until
      approved — posting an uninstallable link kills momentum.

## 6. Launch (after approval)

Same playbook as MediumStreak, ad-focused communities added:
- [ ] Reddit: r/productivity, r/chrome_extensions, r/SideProject, r/InternetIsBeautiful (perfect fit — visual demo), r/degoogle, r/Adblock
- [ ] X: post a before/after GIF (2s loop: ad appears → becomes a painting). GIFs outperform screenshots here.
- [ ] Hacker News "Show HN": "Show HN: I replaced web ads with public-domain art"
- [ ] Reply to every comment; pin the store link as first comment everywhere.

## 7. After launch

- [ ] Watch reviews daily for the first 2 weeks — false-positive reports are
      your #1 risk ("it turned my [X] into a painting"). Fix fast, bump version,
      re-upload.
- [ ] Track installs; if a screenshot goes viral on X/Reddit, pin a reply with
      the store link.
