/* Personal-museum logic: which artworks the user has "discovered" and the
 milestones for collecting them. Shared by content script (recording) and
 popup (display).
*/

const MUSEUM_MILESTONES = [
  { n: 5, name: "Gallery Visitor", icon: "🎫" },
  { n: 10, name: "Patron of the Arts", icon: "🎩" },
  { n: 25, name: "Collector", icon: "🖼️" },
  { n: 54, name: "Curator", icon: "🏛️" },
];

// seen: { "Mona Lisa": firstDateKey, ... }
function museumStats(seen) {
  const count = Object.keys(seen || {}).length;
  const earned = MUSEUM_MILESTONES.filter((m) => count >= m.n);
  const next = MUSEUM_MILESTONES.find((m) => count < m.n) || null;
  const total = typeof ARTWORKS !== "undefined" ? ARTWORKS.length : 32;
  return { count, total, earned, next };
}
