// Dev harness — active only when popup.html is opened outside the extension.
if (typeof chrome === "undefined" || !chrome.storage) {
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            if (k === "enabled") out[k] = true;
            if (k === "disabledSites") out[k] = ["facebook.com"];
            if (k === "stats") out[k] = { day: "today", replaced: 12, total: 86 };
            if (k === "collection") out[k] = window.__adsArtCollection || "impression";
            if (k === "seen")
              out[k] = {
                "Impression, Sunrise": "2026-09-01",
                "Paris Street; Rainy Day": "2026-09-02",
                "Bal du moulin de la Galette": "2026-09-03",
                "Bridge over a Pond of Water Lilies": "2026-09-04",
                "The Card Players": "2026-09-05",
                "The Gleaners": "2026-09-06",
                "The Starry Night": "2026-08-15",
                "Sunflowers": "2026-08-20",
              };
            if (k === "encounters")
              out[k] = {
                "Impression, Sunrise": "2026-09-01",
                "Paris Street; Rainy Day": "2026-09-02",
                "Bal du moulin de la Galette": "2026-09-03",
                "Bridge over a Pond of Water Lilies": "2026-09-04",
                "The Card Players": "2026-09-05",
                "The Gleaners": "2026-09-06",
              };
            if (k === "milestones") out[k] = { 5: "2026-09-05" };
          }
          return out;
        },
        set: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
    tabs: { query: async () => [{ id: 1, url: "https://example.com/article" }] },
    runtime: { sendMessage: async () => {} },
  };
}
