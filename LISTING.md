# Store listing

## Name
Ads → Art: Replace Ads with Masterpieces

## Summary (132 chars max)
Turn ad slots into a free museum. Famous paintings + a line of culture, right where ads used to be. Private, local, beautiful.

## Description
The internet shows you thousands of ads a week. Ads → Art swaps them for
masterpieces instead.

🖼️ HOW IT WORKS
Open any article, news site, or blog. Where a banner ad would be, you now see
a Van Gogh, a Hokusai wave, or Vermeer's Girl with a Pearl Earring — with the
title, artist, and one surprising fact about the painting.

🏛️ A MUSEUM YOU DON'T HAVE TO VISIT
• 54 hand-picked public-domain artworks from Wikimedia Commons — paintings
  and NASA space photography
• A curated fact on every card ("The Mona Lisa has no eyebrows — likely
  scrubbed away by 16th-century cleaning")
• Cards never repeat until you've seen the whole gallery
• Choose your theme: Classics, Renaissance, Impressionists, Van Gogh,
  Space — or text-only Quotes for a lighter touch

🧠 SMART, NOT INVASIVE
• Detects real ad slots (ad-network frames, ad containers) — never touches
  real content
• Nothing is collected: no accounts, no analytics, no tracking. Settings and
  stats live only in your browser
• If an image can't load, you still get an elegant museum plaque

🎛️ YOU'RE IN CONTROL
• One tap to pause the gallery everywhere
• "Disable on this site" whenever a page needs to stay exactly as-is
• See how many ads became art today — and all time

🎨 WHY PEOPLE LOVE IT
Because the web got loud, and this makes it quiet and beautiful. Because your
screen time deserves better than shoe ads. And because you'll screenshot it
and send it to a friend — everyone does.

Ads → Art is free, open, and stays out of your way. Install it, browse
something you were going to read anyway, and meet 54 of the greatest works
ever painted.

---

## Permission justification (paste into the review/permissions section)

The extension's single purpose is replacing advertising slots on the pages the
user visits with public-domain artwork images. Host access to all sites is
required because ads appear across the web. The content script identifies ad
containers by known ad-network signatures and naming conventions, hides them,
and injects a local UI card. No page content, browsing data, or personal data
is collected, stored remotely, or transmitted. The only network requests are
image fetches from Wikimedia Commons (public-domain artwork files). `storage`
keeps on/off settings and a local replacement counter on the device.
`activeTab` lets the popup apply the per-site disable to the current site.

## Privacy tab answers
- Data usage: **Does not collect user data**
- Privacy policy URL: your GitHub-hosted PRIVACY.md link
- Host permission justification: as above — emphasize "modifies page appearance
  only, stores nothing about pages"

## Screenshots (5, at 1280×800)
1. A news site before/after split — ads vs. paintings (the hero shot)
2. Close-up of one card with caption + fact
3. The popup (toggle, counters)
4. A painting card inside a real-looking article layout
5. The gallery lineup — "every card is a different masterpiece"

## Important review expectations
Broad-host extensions (`<all_urls>`) usually get a **deeper, sometimes manual
review** — first approval can take 1–4 weeks instead of days, and you may be
asked for a demo video or additional explanation. This is normal for ad-
modifiers. Respond in the review thread promptly and keep the justification
above consistent everywhere. Plan your Reddit/X launch AFTER approval, not
before.
