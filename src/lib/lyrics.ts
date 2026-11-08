export type LyricLine = { time: number | null; text: string };

const TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parse LRC ("[01:23.45] line") or plain text into lines. */
export function parseLyrics(raw: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const rawLine of raw.replace(/\r/g, "").split("\n")) {
    const times: number[] = [];
    TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG.exec(rawLine))) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
    }
    const text = rawLine.replace(TAG, "").trim();
    if (/^\[[a-z]+:.*\]$/i.test(rawLine.trim())) continue; // metadata tags like [ar:...]
    if (times.length) times.forEach((t) => out.push({ time: t, text }));
    else if (text) out.push({ time: null, text });
  }
  if (out.some((l) => l.time != null)) {
    return out.filter((l) => l.time != null).sort((a, b) => a.time! - b.time!);
  }
  return out;
}

export const isSynced = (lines: LyricLine[]) => lines.length > 0 && lines.every((l) => l.time != null);

/** Index of the line being sung at time t (−1 before first line). */
export function activeLineIndex(lines: LyricLine[], t: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time != null && lines[i].time! <= t + 0.15) idx = i;
    else if (lines[i].time != null) break;
  }
  return idx;
}

export function formatLrcTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function toLrc(lines: LyricLine[]): string {
  return lines.map((l) => (l.time != null ? `[${formatLrcTime(l.time)}] ${l.text}` : l.text)).join("\n");
}

export const hasHebrew = (s: string) => /[\u0590-\u05FF]/.test(s);

const JUNK = /\s*[([](?:[^)\]]*?(?:official|video|audio|lyric|720p|1080p|480p|4k|hd|prod\.?|live|clip|קליפ|רשמי)[^)\]]*?)[)\]]/gi;

/** Strip track numbers, "(Official Video)", "(720p)", "Artist - " prefixes, "ft." parts. */
export function cleanTitle(title: string, artist = ""): string {
  let s = title.replace(/\.(mp3|m4a|wav|mp4|webm|flac|ogg)$/i, "");
  s = s.replace(JUNK, "").replace(/\s*\(\d+\)\s*$/, "");
  s = s.replace(/^\d{1,3}[\s._-]+/, "");
  if (s.includes(" - ")) {
    const parts = s.split(" - ").map((p) => p.trim()).filter(Boolean);
    const a = artist.toLowerCase();
    const notArtist = parts.filter((p) => !a || !a.split(/[,&]/).some((x) => x.trim() && p.toLowerCase().includes(x.trim())));
    s = notArtist[notArtist.length - 1] ?? parts[parts.length - 1];
  }
  s = s.replace(/\b(official|music video|lyrics?)\b/gi, "").replace(/\s+(ft\.?|feat\.?)\s.*$/i, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/** Pick the main artist; ignore placeholders like "Your Upload". */
export function cleanArtist(artist: string): string {
  const first = artist.split(/[,&]/).map((x) => x.trim()).find((x) => x && !/^(your upload|unknown|music video)$/i.test(x));
  return first ?? "";
}

type LrcRow = { syncedLyrics?: string | null; plainLyrics?: string | null };
const pick = (r: LrcRow | null) =>
  r?.syncedLyrics ? { text: r.syncedLyrics, synced: true } : r?.plainLyrics ? { text: r.plainLyrics, synced: false } : null;

async function searchLrc(q: string) {
  if (!q.trim()) return null;
  try {
    const r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q })}`);
    if (!r.ok) return null;
    const list = (await r.json()) as LrcRow[];
    if (!Array.isArray(list) || !list.length) return null;
    return pick(list.find((x) => x.syncedLyrics) ?? list.find((x) => x.plainLyrics) ?? null);
  } catch { return null; }
}

/** Fetch lyrics from the free LRCLIB database, trying several cleaned-up searches. */
export async function fetchLrclib(title: string, artist: string, duration?: number | null): Promise<{ text: string; synced: boolean } | null> {
  const t = cleanTitle(title, artist);
  const a = cleanArtist(artist);
  try {
    const p = new URLSearchParams({ track_name: t, artist_name: a });
    if (duration) p.set("duration", String(Math.round(duration)));
    const r = await fetch(`https://lrclib.net/api/get?${p}`);
    if (r.ok) { const got = pick(await r.json()); if (got) return got; }
  } catch { /* fall through to search */ }
  const queries = Array.from(new Set([`${a} ${t}`.trim(), t, `${artist} ${title}`.trim()]));
  for (const q of queries) {
    const got = await searchLrc(q);
    if (got) return got;
  }
  return null;
}

/** Web search link for finding lyrics to paste in. */
export const lyricsSearchUrl = (title: string, artist: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${cleanArtist(artist)} ${cleanTitle(title, artist)} lyrics מילים`.trim())}`;
