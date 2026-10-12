// Zero-credit, on-device Mood Mix generator.
export type SmartTrack = {
  id: string; song: string; artist: string; album: string;
  genre: string | null; kind: "audio" | "video"; liked: boolean; plays: number;
};

type Mood = { key: string; words: string[]; genres: string[]; energy: number; name: string };

const MOODS: Mood[] = [
  { key: "hype", words: ["gym", "workout", "hype", "run", "running", "pump", "energy", "lift", "cardio", "beast"], genres: ["hip hop", "rap", "edm", "electronic", "dance", "rock", "metal", "trap", "drill", "house"], energy: 0.9, name: "Gym Hype" },
  { key: "party", words: ["party", "dance", "club", "upbeat", "happy", "feel-good", "feel good", "celebrate", "wedding", "simcha"], genres: ["pop", "dance", "edm", "house", "disco", "funk", "reggaeton", "latin", "hip hop"], energy: 0.85, name: "Party Mode" },
  { key: "chill", words: ["chill", "relax", "calm", "rain", "rainy", "sunday", "lazy", "sleep", "soft", "slow", "peaceful"], genres: ["lofi", "lo-fi", "acoustic", "ambient", "jazz", "soul", "r&b", "indie", "folk", "chill"], energy: 0.3, name: "Chill Vibes" },
  { key: "focus", words: ["focus", "study", "work", "deep", "concentrate", "coding", "read", "homework"], genres: ["lofi", "lo-fi", "ambient", "classical", "instrumental", "piano", "electronic"], energy: 0.4, name: "Deep Focus" },
  { key: "drive", words: ["drive", "driving", "night", "late", "road", "car", "cruise", "midnight"], genres: ["synthwave", "r&b", "hip hop", "electronic", "pop", "rock", "indie"], energy: 0.6, name: "Late-Night Drive" },
  { key: "shabbat", words: ["shabbat", "shabbos", "jewish", "nigun", "niggun", "kumzitz", "chassidic", "hebrew", "dinner"], genres: ["jewish", "chassidic", "hasidic", "acapella", "a cappella", "acoustic", "folk"], energy: 0.45, name: "Shabbat Table" },
  { key: "sad", words: ["sad", "heartbreak", "cry", "lonely", "miss", "emotional", "breakup"], genres: ["ballad", "acoustic", "soul", "r&b", "indie", "piano"], energy: 0.25, name: "In My Feelings" },
  { key: "fav", words: ["favorite", "favourite", "favorites", "best", "top", "liked", "love"], genres: [], energy: 0.6, name: "My Favorites" },
];

const HIGH = ["remix", "edit", "bass", "boost", "fire", "lit", "turn up", "hype", "power", "party", "dance", "club", "drop", "wild", "up"];
const LOW = ["acoustic", "piano", "slow", "unplugged", "lullaby", "soft", "calm", "chill", "lofi", "lo-fi", "sleep", "intro", "interlude"];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

function energyOf(t: SmartTrack) {
  const text = norm(`${t.song} ${t.album} ${t.genre ?? ""}`);
  let e = 0.5;
  for (const w of HIGH) if (text.includes(w)) e += 0.12;
  for (const w of LOW) if (text.includes(w)) e -= 0.12;
  return Math.max(0, Math.min(1, e));
}

// Seeded random so the same prompt is varied each click but stable within a run.
function rng(seed: number) { return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); }

export function buildSmartPlaylist(prompt: string, library: SmartTrack[], count: number) {
  const p = norm(prompt);
  const tokens = p.split(/[^a-z0-9&\u0590-\u05ff]+/).filter((w) => w.length > 2);
  const moods = MOODS.filter((m) => m.words.some((w) => p.includes(w)));
  const target = moods.length ? moods.reduce((a, m) => a + m.energy, 0) / moods.length : 0.6;
  const wantFav = moods.some((m) => m.key === "fav");
  const genres = moods.flatMap((m) => m.genres);
  const rand = rng(Date.now() % 233280);
  const maxPlays = Math.max(1, ...library.map((t) => t.plays));

  const scored = library.map((t) => {
    const g = norm(t.genre ?? "");
    const hay = norm(`${t.song} ${t.artist} ${t.album} ${t.genre ?? ""}`);
    const e = energyOf(t);
    let s = 0;
    for (const k of tokens) if (hay.includes(k)) s += norm(t.artist).includes(k) ? 6 : 4;
    if (g && genres.some((x) => g.includes(x) || x.includes(g))) s += 5;
    s += (1 - Math.abs(e - target)) * 3;
    if (t.liked) s += wantFav ? 6 : 1.5;
    s += (t.plays / maxPlays) * 1.5;
    if (p.includes("video") && t.kind === "video") s += 4;
    s += rand() * 2; // freshness
    return { t, s, e };
  });

  scored.sort((a, b) => b.s - a.s);
  const picked = scored.slice(0, Math.min(count, library.length));

  // Energy arc: warm-up → peak → cool-down.
  const byEnergy = [...picked].sort((a, b) => a.e - b.e);
  const up: typeof picked = [], down: typeof picked = [];
  byEnergy.forEach((x, i) => (i % 2 === 0 ? up : down).push(x));
  const ordered = [...up, ...down.reverse()];

  const label = moods[0]?.name ?? prompt.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 34);
  return {
    name: `${label} Mix`,
    description: `A free instant mix for “${prompt.trim()}”, shaped with a warm-up, peak and cool-down.`,
    trackIds: ordered.map((x) => x.t.id),
  };
}
