/* Weekly gallery share card: a 1200x630 canvas collage of artworks the user
 encountered recently, with their "ads → art" count and a store CTA.
 drawWeekCard is async (it may load artwork images); images that fail (CORS,
 offline) fall back to gradient plaques, so export always succeeds.
 */

function weekCardData(encounters, withinDays = 7) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const recent = Object.entries(encounters || {})
    .map(([title, day]) => ({ title, day, ts: new Date(day + "T12:00:00").getTime() }))
    .filter((e) => now - e.ts <= withinDays * dayMs)
    .sort((a, b) => b.ts - a.ts);
  return recent;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* For canvas export we need CORS-clean image URLs. The Special:FilePath
 redirect hop doesn't send CORS headers, so resolve the direct
 upload.wikimedia.org thumbnail via the Commons API (origin=* enables CORS).
 */
const thumbUrlCache = {};
async function commonsThumbUrl(file, width = 400) {
  const key = `${file}|${width}`;
  if (thumbUrlCache[key]) return thumbUrlCache[key];
  const api =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=${width}` +
    `&titles=${encodeURIComponent("File:" + file)}`;
  const res = await fetch(api);
  const data = await res.json();
  const page = data && data.query ? Object.values(data.query.pages)[0] : null;
  const info = page && page.imageinfo && page.imageinfo[0];
  const url = (info && (info.thumburl || info.url)) || null;
  if (url) thumbUrlCache[key] = url;
  return url;
}

async function loadArtImage(art) {
  try {
    const url = await commonsThumbUrl(art.file, 400);
    if (!url) return { img: null, ok: false };
    return await loadImage(url);
  } catch (e) {
    return { img: null, ok: false };
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, ok: true });
    img.onerror = () => resolve({ img: null, ok: false });
    img.src = url;
  });
}

async function drawWeekCard(canvas, { encounters, total, today }) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const C = { bg0: "#0d1117", bg1: "#14101e", border: "#30363d", text: "#e6edf3", muted: "#9aa4af", gold: "#d4af37" };
  const sans = `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const serif = `Georgia, "Palatino Linotype", serif`;

  const recent = weekCardData(encounters);
  const slots = (recent.length ? recent : Object.entries(encounters || {}).map(([t, d]) => ({ title: t, day: d }))).slice(0, 6);
  const isWeekly = recent.length > 0;
  const artworksByTitle = {};
  if (typeof ARTWORKS !== "undefined") for (const a of ARTWORKS) artworksByTitle[a.t] = a;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(1, C.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Header
  ctx.fillStyle = C.gold;
  ctx.font = `800 40px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText(isWeekly ? "MY WEEK IN ADS → ART" : "MY GALLERY", 80, 108);
  ctx.fillStyle = C.text;
  ctx.font = `600 26px ${sans}`;
  const replaced = (total || 0).toLocaleString();
  ctx.fillText(
    `${replaced} ad${total === 1 ? "" : "s"} became art${isWeekly ? " this week" : ""}`,
    80,
    156
  );

  // Tiles: 3 x 2 grid
  const gx = 80;
  const gy = 196;
  const tw = (W - 160 - 2 * 24) / 3;
  const th = 162;
  const chosen = slots.map((s) => ({ ...s, art: artworksByTitle[s.title] || null }));

  const loaded = await Promise.all(
    chosen.map((c) => (c.art ? loadArtImage(c.art) : Promise.resolve({ img: null, ok: false })))
  );

  chosen.forEach((c, i) => {
    const x = gx + (i % 3) * (tw + 24);
    const y = gy + Math.floor(i / 3) * (th + 24);
    const { img, ok } = loaded[i];

    ctx.save();
    roundRectPath(ctx, x, y, tw, th, 10);
    ctx.clip();
    if (ok && img) {
      // cover-fit the image into the tile
      const scale = Math.max(tw / img.width, th / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, x + (tw - iw) / 2, y + (th - ih) / 2, iw, ih);
      const shade = ctx.createLinearGradient(0, y + th * 0.4, 0, y + th);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, tw, th);
    } else {
      ctx.fillStyle = artGradient(c.title);
      ctx.fillRect(x, y, tw, th);
    }
    ctx.fillStyle = C.text;
    ctx.font = `italic 700 19px ${serif}`;
    ctx.fillText(c.title, x + 14, y + th - 40);
    ctx.fillStyle = "rgba(230,237,243,0.75)";
    ctx.font = `500 13px ${sans}`;
    const meta = c.art ? `${c.art.a}${c.art.y ? " · " + c.art.y : ""}` : "";
    ctx.fillText(meta, x + 14, y + th - 18);
    ctx.restore();

    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x, y, tw, th, 10);
    ctx.stroke();
  });

  // Empty state, if the user has seen nothing yet
  if (chosen.length === 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 24px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText("Browse the web — your gallery fills itself.", W / 2, 380);
    ctx.textAlign = "left";
  }

  // Footer CTA
  ctx.fillStyle = C.muted;
  ctx.font = `600 22px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText("Ads → Art — turn ads into masterpieces · free on the Chrome Web Store", W / 2, H - 36);
  ctx.textAlign = "left";
}

function downloadWeekCard(canvas) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ads-to-art-${localDateKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
