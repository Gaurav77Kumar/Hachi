if (typeof chrome === "undefined" || !chrome.storage) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  /* A tiny stand-in artwork so the dev page exercises the same data-URL
     image path the real background worker serves from its offline cache. */
  const DEMO_IMAGE =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#31567d"/><stop offset="1" stop-color="#101722"/>' +
      "</linearGradient></defs>" +
      '<rect width="320" height="200" fill="url(#g)"/>' +
      '<circle cx="250" cy="52" r="26" fill="#e5b579" opacity="0.9"/>' +
      '<path d="M0 150 Q80 120 160 148 T320 140 V200 H0 Z" fill="#0d1420" opacity="0.85"/>' +
      "</svg>"
    );
  const params = new URLSearchParams(location.search);
  const collection = params.get("collection") || "classic";
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          const values = {
            enabled: true,
            disabledSites: ["facebook.com"],
            stats: {
              day: today,
              replaced: 12,
              total: 86,
              seconds: 8640,
              totalSeconds: 41280,
              history: {
                [today]: { ads: 12, seconds: 8640 },
                "2026-09-24": { ads: 9, seconds: 4200 },
                "2026-09-23": { ads: 7, seconds: 5100 },
                "2026-09-22": { ads: 10, seconds: 3600 },
              },
            },
            collection,
            favorites: ["The Starry Night", "Mona Lisa"],
            collections: [{ id: "demo", name: "Evening Calm", items: ["The Starry Night", "Bridge over a Pond of Water Lilies"] }],
            theme: "light",
            showQuotes: true,
            replaceMore: false,
            showDetails: true,
            dailyArtwork: true,
            customPhotos: [],
            seen: {
              "Impression, Sunrise": "2026-09-01",
              "Paris Street; Rainy Day": "2026-09-02",
              "Bal du moulin de la Galette": "2026-09-03",
              "Bridge over a Pond of Water Lilies": "2026-09-04",
              "The Card Players": "2026-09-05",
              "The Gleaners": "2026-09-06",
              "The Starry Night": "2026-08-15",
              "Sunflowers": "2026-08-20",
            },
            encounters: {
              "Impression, Sunrise": "2026-09-01",
              "Paris Street; Rainy Day": "2026-09-02",
              "Bal du moulin de la Galette": "2026-09-03",
              "Bridge over a Pond of Water Lilies": "2026-09-04",
              "The Card Players": "2026-09-05",
              "The Gleaners": "2026-09-06",
              "The Starry Night": today,
            },
            milestones: { 5: "2026-09-05" },
          };
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (key in values) out[key] = values[key];
          }
          return out;
        },
        set: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: async () => [{ id: 1, url: "https://example.com/article" }],
      create: async () => {},
    },
    runtime: {
      sendMessage: async (message) => {
        if (message && message.type === "artImage") return { ok: true, dataUrl: DEMO_IMAGE };
        return undefined;
      },
      getURL: (path) => `popup/${path}`,
      lastError: null,
    },
  };
}
