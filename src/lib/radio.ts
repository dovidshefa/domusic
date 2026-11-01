// Infinite Radio — zero-credit local "what plays next" matcher.
export type RadioTrack = {
  id: string;
  artist: string;
  genre: string | null;
  kind: string;
  liked: boolean;
  plays: number;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function scoreRadioCandidate(seed: RadioTrack, c: RadioTrack): number {
  let s = 0;
  if (norm(seed.artist) && norm(seed.artist) === norm(c.artist)) s += 5;
  if (norm(seed.genre) && norm(seed.genre) === norm(c.genre)) s += 4;
  if (seed.kind === c.kind) s += 1;
  if (c.liked) s += 2;
  s += Math.min(2, Math.log10((c.plays ?? 0) + 1));
  return s;
}

/** Pick the next radio track; skips the seed and recently played ids. */
export function pickRadioTrack<T extends RadioTrack>(
  seed: T,
  all: T[],
  recent: string[],
  rand: () => number = Math.random,
): T | null {
  const avoid = new Set([seed.id, ...recent]);
  let pool = all.filter((t) => !avoid.has(t.id));
  if (pool.length === 0) pool = all.filter((t) => t.id !== seed.id);
  if (pool.length === 0) return null;
  const scored = pool
    .map((t) => ({ t, s: scoreRadioCandidate(seed, t) + rand() * 1.5 }))
    .sort((a, b) => b.s - a.s);
  return scored[0].t;
}
