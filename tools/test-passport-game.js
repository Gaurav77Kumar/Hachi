/* Verification harness for the Museum Passport and Daily Detail features.
   Run: node tools/test-passport-game.js

   Loads lib/artworks.js and newtab/newtab.js in a sandbox with DOM/chrome
   stubs, then checks the invariants that matter:
   - every museum-map key is an exact artwork title (catches apostrophe drift)
   - the daily puzzle is deterministic, has 4 unique options, contains the answer
   - stamps derive correctly from a synthetic `seen` map
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const callableStub = () => new Proxy(function () {}, {
  get: (target, prop) => {
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === "toString" || prop === "valueOf") return () => "";
    return callableStub;
  },
  set: () => true,
  apply: () => callableStub,
});

const listeners = { onChanged: [] };
const ctx = {
  console,
  setTimeout,
  clearTimeout,
  matchMedia: () => ({ addListener: () => {}, addEventListener: () => {}, matches: false }),
  navigator: {},
  document: new Proxy({}, {
    get: (target, prop) => {
      if (prop === "getElementById") return () => callableStub();
      if (prop === "createElement") return () => callableStub();
      if (prop === "addEventListener" || prop === "removeEventListener") return () => {};
      if (prop === "documentElement" || prop === "head" || prop === "body") return callableStub();
      return callableStub;
    },
  }),
  URL: class URL {},
  chrome: {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: { addListener: (fn) => listeners.onChanged.push(fn) },
    },
    runtime: {
      sendMessage: async () => undefined,
      getURL: (p) => "chrome-extension://test/" + p,
      onMessage: { addListener: () => {} },
    },
    tabs: { create: async () => ({}) },
    windows: { create: async () => ({}) },
  },
};
vm.createContext(ctx);

vm.runInContext(fs.readFileSync(path.join(ROOT, "lib", "artworks.js"), "utf8"), ctx, { filename: "artworks.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "newtab", "newtab.js"), "utf8"), ctx, { filename: "newtab.js" });

const { ARTWORKS, ARTWORK_MUSEUMS, artworkMuseum, dailyPuzzle } = ctx;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// A: every museum-map key is an exact artwork title
const titles = new Set(ARTWORKS.map((a) => a.t));
const orphans = Object.keys(ARTWORK_MUSEUMS).filter((key) => !titles.has(key));
check("museum keys all match artwork titles", orphans.length === 0, orphans.length ? `unmatched: ${orphans.join(" | ")}` : `${Object.keys(ARTWORK_MUSEUMS).length} keys`);

// A2: every artwork title that should have a museum has one (sample check)
const unmapped = ARTWORKS.filter((a) => a.t in ARTWORK_MUSEUMS === false);
console.log(`INFO  artworks without a museum stamp: ${unmapped.map((a) => a.t).join(", ")}`);

// B: unique museums
const uniqueMuseums = [...new Set(Object.values(ARTWORK_MUSEUMS))];
check("museum list is healthy", uniqueMuseums.length >= 30 && uniqueMuseums.every((m) => typeof m === "string" && m.length > 0), `${uniqueMuseums.length} distinct museums`);

// C: catalog size (docs claim 99 after the Whistler merge)
check("catalog has 99 artworks", ARTWORKS.length === 99, `found ${ARTWORKS.length}`);

// D: puzzle determinism and shape
const day = "2026-11-07";
const p1 = dailyPuzzle(day);
const p2 = dailyPuzzle(day);
check("puzzle is deterministic for a given day", JSON.stringify(p1) === JSON.stringify(p2));
check("puzzle has 4 unique title options", p1.options.length === 4 && new Set(p1.options.map((o) => o.t)).size === 4, p1.options.map((o) => o.t).join(" | "));
check("puzzle options include the mystery artwork", p1.options.some((o) => o.t === p1.artwork.t));
check("puzzle crop is inside 20-80%", p1.cropX >= 20 && p1.cropX <= 80 && p1.cropY >= 20 && p1.cropY <= 80);
const otherDay = dailyPuzzle("2026-11-08");
console.log(`INFO  next day puzzle: ${otherDay.artwork.t} (crop ${otherDay.cropX}/${otherDay.cropY})`);

// E: stamp derivation from a synthetic seen map (mirrors popup passportStamps core)
const seen = {
  "The Night Watch": "2026-11-01",
  "The Milkmaid": "2026-11-02",
  "The Starry Night": "2026-11-03",
  "Moscow": "2026-11-03",
};
const visited = new Set(Object.keys(seen).map((t) => artworkMuseum(t)).filter(Boolean));
check("stamps derive from seen titles", visited.has("Rijksmuseum, Amsterdam") && visited.has("MoMA, New York") && visited.size === 2, [...visited].join(" | "));

// F: artworkMuseum fallback
check("artworkMuseum returns null for unknown titles", artworkMuseum("Not A Real Painting") === null);

console.log(failures.length ? `\n${failures.length} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
