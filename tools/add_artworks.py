# One-shot: appends the verified new artworks + extends COLLECTIONS.
import io
import re
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "lib" / "artworks.js"
src = P.read_text(encoding="utf-8")

NEW = """
  {
    t: "Wheatfield with Crows",
    a: "Vincent van Gogh",
    cat: "vangogh",
    y: "1890",
    f: "Often (wrongly) called Van Gogh's last painting — he made several works after it, but this one carries his darkest sky.",
    file: "Vincent van Gogh - Wheatfield with crows - Google Art Project.jpg",
  },
  {
    t: "Almond Blossom",
    a: "Vincent van Gogh",
    cat: "vangogh",
    y: "1890",
    f: "Van Gogh painted it as a gift for his newborn nephew — blossoming branches meant new life.",
    file: "Vincent van Gogh - Almond blossom - Google Art Project.jpg",
  },
  {
    t: "Irises",
    a: "Vincent van Gogh",
    cat: "vangogh",
    y: "1889",
    f: "Painted in the asylum's garden the year after he cut his ear — one flower stands apart, a different violet.",
    file: "Vincent van Gogh - Irises (1889).jpg",
  },
  {
    t: "Self-Portrait",
    a: "Vincent van Gogh",
    cat: "vangogh",
    y: "1889",
    f: "He painted 35+ self-portraits in a decade — mirrors were cheaper than models.",
    file: "Vincent van Gogh - Self-Portrait - Google Art Project.jpg",
  },
  {
    t: "Starry Night Over the Rhône",
    a: "Vincent van Gogh",
    cat: "vangogh",
    y: "1888",
    f: "The 'stars' on the water are actually gas lamps from the city of Arles, doubled by the river.",
    file: "Starry Night Over the Rhone by Vincent van Gogh, 'lightballs'.jpg",
  },
  {
    t: "Luncheon of the Boating Party",
    a: "Pierre-Auguste Renoir",
    cat: "impression",
    y: "1881",
    f: "Every person in the painting is a real friend — including the woman with the small dog, Renoir's future wife.",
    file: "Pierre-Auguste Renoir - Luncheon of the Boating Party - Google Art Project.jpg",
  },
  {
    t: "Woman with a Parasol",
    a: "Claude Monet",
    cat: "impression",
    y: "1875",
    f: "Monet painted it outdoors in a single session — his wife Camille and son Jean stood in the wind for hours.",
    file: "Claude Monet - Woman with a Parasol - Madame Monet and Her Son - Google Art Project.jpg",
  },
  {
    t: "Olympia",
    a: "Édouard Manet",
    cat: "impression",
    y: "1863",
    f: "Her direct gaze scandalized Paris — critics called it vulgar while artists defended it as history's boldest nude.",
    file: "Edouard Manet - Olympia - Google Art Project 3.jpg",
  },
  {
    t: "The Dance Class",
    a: "Edgar Degas",
    cat: "impression",
    y: "1874",
    f: "Degas is famous for dancers, but he attended performances only — he preferred the exhausted rehearsal room.",
    file: "Edgar Germain Hilaire Degas 021.jpg",
  },
  {
    t: "The Sistine Madonna",
    a: "Raphael",
    cat: "renaissance",
    y: "1512",
    f: "The two wistful cherubs at the bottom became so famous they were printed on everything from stamps to umbrellas.",
    file: "Raphael - The Sistine Madonna - Google Arts & Culture.jpg",
  },
  {
    t: "Venus of Urbino",
    a: "Titian",
    cat: "renaissance",
    y: "1538",
    f: "Mark Twain joked he'd rather see it destroyed than have it explain itself — the most scandalous nude of its century.",
    file: "Tiziano - Venere di Urbino - Google Art Project.jpg",
  },
  {
    t: "The Last Supper",
    a: "Leonardo da Vinci",
    cat: "renaissance",
    y: "1498",
    f: "Leonardo experimented with dry plaster instead of true fresco — it began flaking within 20 years of completion.",
    file: "Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg",
  },
  {
    t: "Primavera",
    a: "Sandro Botticelli",
    cat: "renaissance",
    y: "1482",
    f: "Nine characters from myth share one garden, and scholars still argue about the exact story it tells.",
    file: "Botticelli-primavera.jpg",
  },
  {
    t: "The Ambassadors",
    a: "Hans Holbein the Younger",
    cat: "renaissance",
    y: "1533",
    f: "The strange blur across the top is a hidden skull — visible only when you view the painting at an angle.",
    file: "Hans Holbein the Younger - The Ambassadors - Google Art Project.jpg",
  },
  {
    t: "Las Meninas",
    a: "Diego Velázquez",
    cat: "classic",
    y: "1656",
    f: "The painter included himself painting you — the mirror behind hints the king and queen stand where you stand.",
    file: "Las Meninas, by Diego Velázquez, from Prado in Google Earth.jpg",
  },
  {
    t: "An Experiment on a Bird in the Air Pump",
    a: "Joseph Wright of Derby",
    cat: "classic",
    y: "1768",
    f: "A scientific demonstration or a cruelty? Each family member reacts differently — science as theatre.",
    file: "An Experiment on a Bird in an Air Pump by Joseph Wright of Derby, 1768.jpg",
  },
  {
    t: "The Third of May 1808",
    a: "Francisco de Goya",
    cat: "classic",
    y: "1814",
    f: "The first great anti-war painting — no heroes, no glory, just a man in a white shirt facing a firing squad.",
    file: "El Tres de Mayo, by Francisco de Goya, from Prado thin black margin.jpg",
  },
  {
    t: "The Blue Marble",
    a: "Apollo 17 crew, NASA",
    cat: "space",
    y: "1972",
    f: "One of the most reproduced images in history — the only fully lit photo of the whole Earth ever taken by human hands.",
    file: "The Earth seen from Apollo 17.jpg",
  },
  {
    t: "Earthrise",
    a: "William Anders, NASA",
    cat: "space",
    y: "1968",
    f: "Taken 'for all mankind' — it's credited with launching the modern environmental movement.",
    file: "NASA-Apollo8-Dec24-Earthrise.jpg",
  },
  {
    t: "Pillars of Creation",
    a: "NASA / Hubble",
    cat: "space",
    y: "1995",
    f: "These pillars are light-years tall — a star nursery where new suns are being born right now.",
    file: "Pillars of creation 2014 HST WFC3-UVIS full-res denoised.jpg",
  },
  {
    t: "Saturn at Equinox",
    a: "NASA / Cassini",
    cat: "space",
    y: "2009",
    f: "Taken from Saturn's shadow: the rings, lit only by starlight, glow faintly blue.",
    file: "Saturn during Equinox.jpg",
  },
  {
    t: "Neptune, Full Disk",
    a: "NASA / Voyager 2",
    cat: "space",
    y: "1989",
    f: "The only spacecraft to ever visit Neptune — the winds here blow at 2,100 km/h.",
    file: "Neptune Full.jpg",
  },
"""

assert "Wheatfield with Crows" not in src, "already added"

marker = "\n];\n\n// Derives a deterministic"
assert marker in src, "marker not found"
src = src.replace(marker, "\n" + NEW + "];\n\n// Derives a deterministic", 1)

bad = 'file: "Raphael - The Sistine Madonna - Google Arts & Culture.jpg",\n  },\n  {\n    t: "The Sistine Madonna"'
if bad in src:
    # The first occurrence belongs to School of Athens (order: it precedes Sistine Madonna)
    src = src.replace(
        'file: "Raphael - The Sistine Madonna - Google Arts & Culture.jpg",',
        'file: "\\"The School of Athens\\" by Raffaello Sanzio da Urbino.jpg",',
        1,
    )

# Extend COLLECTIONS.
old_coll = '{ id: "vangogh", name: "Van Gogh" },\n];'
new_coll = '{ id: "vangogh", name: "Van Gogh" },\n  { id: "space", name: "Space (NASA)" },\n  { id: "quotes", name: "Quotes (no images)" },\n];'
assert old_coll in src, "collections anchor not found"
src = src.replace(old_coll, new_coll, 1)

P.write_text(src, encoding="utf-8")
print("added", src.count("cat: "), "artworks total with categories")
