/* Museum Passport share card: a 1200x630 summary of the museums stamped
   by artworks met while browsing. Text-only by design — no image loading,
   so the export always succeeds offline. */

function passportDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function drawPassportCard(canvas, data) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const serif = 'Georgia, "Times New Roman", serif';
  const sans = '-apple-system, "Segoe UI", Roboto, sans-serif';
  const C = {
    bg: "#141a1b",
    gold: "#e8c896",
    text: "#f3f0e8",
    muted: "rgba(230, 237, 243, 0.65)",
    border: "rgba(230, 237, 243, 0.22)",
  };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = C.gold;
  ctx.font = `700 40px ${serif}`;
  ctx.fillText("MY MUSEUM PASSPORT", 80, 104);
  ctx.fillStyle = C.text;
  ctx.font = `600 26px ${sans}`;
  ctx.fillText(
    `${(data.visited || 0).toLocaleString()} of ${(data.total || 0).toLocaleString()} museums · ${(data.works || 0).toLocaleString()} artworks met`,
    80,
    150
  );

  const names = (data.names || []).slice(0, 24);
  const cols = 4;
  const sx = 80;
  const sy = 204;
  const sw = (W - 160 - (cols - 1) * 22) / cols;
  const sh = 84;
  names.forEach((name, index) => {
    const x = sx + (index % cols) * (sw + 22);
    const y = sy + Math.floor(index / cols) * (sh + 18);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, x, y, sw, sh, 10);
    ctx.stroke();
    const label = name.split(",")[0];
    ctx.fillStyle = C.text;
    ctx.font = `700 17px ${serif}`;
    ctx.fillText(label.length > 22 ? label.slice(0, 21) + "…" : label, x + 14, y + 36);
    ctx.fillStyle = C.muted;
    ctx.font = `600 11px ${sans}`;
    ctx.fillText("S T A M P E D", x + 14, y + 62);
  });

  const hidden = (data.names || []).length - names.length;
  if (hidden > 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 18px ${sans}`;
    ctx.fillText(`+ ${hidden} more museum${hidden === 1 ? "" : "s"} waiting`, 80, sy + Math.ceil(names.length / cols) * (sh + 18) + 12);
  }

  if (!names.length) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 24px ${sans}`;
    ctx.fillText("Browse the web — every artwork met stamps its museum here.", W / 2, 380);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.font = `600 22px ${sans}`;
  ctx.fillText("Hachi — turn ads into masterpieces · free on the Chrome Web Store", W / 2, H - 36);
  ctx.textAlign = "left";
}

function downloadPassportCard(canvas) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hachi-passport-${passportDateKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
