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

/** Fetch lyrics from the free LRCLIB database. */
export async function fetchLrclib(title: string, artist: string, duration?: number | null): Promise<{ text: string; synced: boolean } | null> {
  const pick = (r: { syncedLyrics?: string | null; plainLyrics?: string | null } | null) =>
    r?.syncedLyrics ? { text: r.syncedLyrics, synced: true } : r?.plainLyrics ? { text: r.plainLyrics, synced: false } : null;
  try {
    const p = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration) p.set("duration", String(Math.round(duration)));
    const r = await fetch(`https://lrclib.net/api/get?${p}`);
    if (r.ok) { const got = pick(await r.json()); if (got) return got; }
  } catch { /* fall through to search */ }
  try {
    const r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}`.trim() })}`);
    if (!r.ok) return null;
    const list = (await r.json()) as Array<{ syncedLyrics?: string | null; plainLyrics?: string | null }>;
    if (!Array.isArray(list)) return null;
    return pick(list.find((x) => x.syncedLyrics) ?? list[0] ?? null);
  } catch { return null; }
}
