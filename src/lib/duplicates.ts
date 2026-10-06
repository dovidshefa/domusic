/** Normalize a song title for duplicate matching (case, spacing, punctuation, "(official video)" tags). */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/[([](official|lyrics?|audio|video|hd|hq|4k|music video|visualizer)[^)\]]*[)\]]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function dupKey(song: string, artist?: string | null): string {
  const a = (artist ?? "").toLowerCase();
  const generic = !a || a === "your upload" || a === "unknown";
  return normalizeTitle(song) + "|" + (generic ? "" : normalizeTitle(a));
}

/** Groups items sharing the same title (and same artist when both are known). */
export function findDuplicateGroups<T extends { id: string; song: string; artist?: string | null }>(items: T[]): T[][] {
  const byTitle = new Map<string, T[]>();
  for (const t of items) {
    const k = normalizeTitle(t.song);
    if (!k) continue;
    byTitle.set(k, [...(byTitle.get(k) ?? []), t]);
  }
  const groups: T[][] = [];
  for (const list of byTitle.values()) {
    if (list.length < 2) continue;
    const byArtist = new Map<string, T[]>();
    const generic: T[] = [];
    for (const t of list) {
      const k = dupKey(t.song, t.artist).split("|")[1];
      if (!k) generic.push(t);
      else byArtist.set(k, [...(byArtist.get(k) ?? []), t]);
    }
    if (byArtist.size <= 1) groups.push(list);
    else for (const g of byArtist.values()) if (g.length + generic.length > 1) groups.push([...g, ...generic]);
  }
  return groups;
}
