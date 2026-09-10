import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Globe2, Play, Plus, ListPlus, Loader2, Music2, Video, Users,
  Flame, Clock, TrendingUp, CheckSquare, Square, CheckCheck, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PublicTrack = {
  id: string;
  song: string;
  artist: string;
  album: string;
  genre: string | null;
  cover: string | null;
  storage_path: string | null;
  kind: string;
  duration: number | null;
  plays: number;
  created_at: string;
  uploader_id: string;
  uploader_name: string;
  added_count?: number | null;
};

const PAGE = 36;
const SHELF = 8;

const SORTS: { key: string; label: string }[] = [
  { key: "recent", label: "Newest" },
  { key: "trending", label: "Trending" },
  { key: "added", label: "Most added" },
  { key: "plays", label: "Most played" },
  { key: "title", label: "A–Z" },
  { key: "oldest", label: "Oldest" },
];

const KINDS: { key: string; label: string }[] = [
  { key: "all", label: "All media" },
  { key: "audio", label: "Songs" },
  { key: "video", label: "Music videos" },
];

const fmtDur = (s: number | null) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

type CardProps = {
  t: PublicTrack;
  saved: boolean;
  mine: boolean;
  busy: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  playlists: { id: string; name: string; trackIds: string[] }[];
  onPlay: () => void;
  onAddMine: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
  compact?: boolean;
  selectMode?: boolean;
  checked?: boolean;
  onToggleSelect?: () => void;
};

function PublicCard(p: CardProps) {
  const { t, saved, mine, busy, menuOpen, onToggleMenu, playlists, onPlay, onAddMine, onAddToPlaylist, onCreatePlaylist, compact, selectMode, checked, onToggleSelect } = p;
  return (
    <article
      data-public-card={t.id}
      onClick={selectMode ? (e) => { e.stopPropagation(); onToggleSelect?.(); } : undefined}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b from-card to-background transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-15px_rgba(168,85,247,0.35)] ${
        selectMode && checked ? "border-[var(--aurora-2)] ring-2 ring-[var(--aurora-2)]/40" : "border-border hover:border-[var(--aurora-2)]/30"
      } ${selectMode ? "cursor-pointer" : ""}`}>
      {selectMode && (
        <button
          data-public-check={t.id}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          aria-label={checked ? `Deselect ${t.song}` : `Select ${t.song}`}
          aria-pressed={!!checked}
          className="absolute right-3 top-3 z-30 rounded-lg bg-black/70 p-1.5 text-white backdrop-blur">
          {checked ? <CheckSquare className="h-4 w-4 text-[var(--aurora-2)]" /> : <Square className="h-4 w-4" />}
        </button>
      )}
      <div className="relative aspect-square overflow-hidden">
        <img src={t.cover ?? `https://picsum.photos/seed/${encodeURIComponent(t.song)}/600/600`} alt={t.song}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            {t.kind === "video" ? "Video" : "Song"}
          </span>
          {mine && <span className="rounded-full bg-[var(--aurora-2)]/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">Yours</span>}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <button onClick={onPlay} disabled={busy}
            className="bg-aurora flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground shadow-xl transition hover:brightness-110 disabled:opacity-50"
            title="Add to my songs and play">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className={compact ? "p-3" : "p-4"}>
        <div className="truncate text-sm font-bold">{t.song}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{t.artist}</div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">by {t.uploader_name}</span>
          <span className="shrink-0">{fmtDur(t.duration)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{t.genre || "Uncategorized"} · {t.album}</span>
          <span className="shrink-0">{t.plays} plays · {Number(t.added_count ?? 0)} added</span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={onAddMine} disabled={busy || saved}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition ${
              saved ? "border border-border bg-secondary/50 text-muted-foreground" : "bg-aurora text-primary-foreground hover:brightness-110"
            }`}>
            <Plus className="h-3.5 w-3.5" /> {saved ? "In my songs" : "Add to My Songs"}
          </button>
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
              className="rounded-full border border-border bg-secondary/60 p-2 transition hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]"
              title="Add to playlist">
              <ListPlus className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div onClick={(e) => e.stopPropagation()}
                className="absolute bottom-11 right-0 z-40 w-52 overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl backdrop-blur-xl">
                <div className="border-b border-border px-3 py-2 text-[10px] font-bold tracking-widest text-muted-foreground">ADD TO PLAYLIST</div>
                <div className="max-h-52 overflow-y-auto">
                  {playlists.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">No playlists yet.</div>}
                  {playlists.map((pl) => (
                    <button key={pl.id} onClick={() => onAddToPlaylist(pl.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary">
                      <span className="truncate">{pl.name}</span>
                      <span className="text-[10px] text-muted-foreground">{pl.trackIds.length}</span>
                    </button>
                  ))}
                </div>
                <button onClick={onCreatePlaylist}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-[var(--aurora-2)] hover:bg-secondary">
                  <Plus className="h-3 w-3" /> New playlist
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function PublicLibrary(props: {
  myId: string | null;
  savedSourceIds: Set<string>;
  playlists: { id: string; name: string; trackIds: string[] }[];
  onAdd: (pt: PublicTrack, opts?: { play?: boolean }) => Promise<void>;
  onAddToPlaylist: (playlistId: string, pt: PublicTrack) => Promise<void>;
  onCreatePlaylist: () => void;
  fixedKind?: "audio" | "video";
  title?: string;
  subtitle?: string;
}) {
  const { myId, savedSourceIds, playlists, onAdd, onAddToPlaylist, onCreatePlaylist, fixedKind, title, subtitle } = props;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("recent");
  const [kind, setKind] = useState<string>(fixedKind ?? "all");
  const [genre, setGenre] = useState("all");
  const [rows, setRows] = useState<PublicTrack[]>([]);
  const [shelves, setShelves] = useState<{ trending: PublicTrack[]; recent: PublicTrack[]; added: PublicTrack[] }>({
    trending: [], recent: [], added: [],
  });
  const [genres, setGenres] = useState<{ genre: string; track_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => { if (fixedKind) setKind(fixedKind); }, [fixedKind]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      const req = ++reqRef.current;
      if (offset === 0) setLoading(true);
      else setMore(true);
      const { data } = await supabase.rpc("browse_public_tracks_v2", {
        _search: debounced,
        _kind: kind,
        _genre: genre,
        _sort: sort,
        _limit: PAGE,
        _offset: offset,
      });
      if (req !== reqRef.current) return;
      const list = (data ?? []) as PublicTrack[];
      setRows((prev) => (offset === 0 ? list : [...prev, ...list]));
      setHasMore(list.length === PAGE);
      setLoading(false);
      setMore(false);
    },
    [debounced, kind, genre, sort],
  );

  useEffect(() => { void load(0); }, [load]);

  // Curated shelves (Trending / Recently Uploaded / Most Added)
  const loadShelves = useCallback(async () => {
    const one = (s: string) =>
      supabase.rpc("browse_public_tracks_v2", { _search: "", _kind: kind, _genre: "all", _sort: s, _limit: SHELF, _offset: 0 });
    const [tr, rc, ad] = await Promise.all([one("trending"), one("recent"), one("added")]);
    setShelves({
      trending: (tr.data ?? []) as PublicTrack[],
      recent: (rc.data ?? []) as PublicTrack[],
      added: ((ad.data ?? []) as PublicTrack[]).filter((t) => Number(t.added_count ?? 0) > 0),
    });
  }, [kind]);

  useEffect(() => { void loadShelves(); }, [loadShelves]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("public_track_genres");
      setGenres((data ?? []) as { genre: string; track_count: number }[]);
    })();
  }, []);

  const total = useMemo(() => genres.reduce((a, g) => a + Number(g.track_count), 0), [genres]);
  const browsing = debounced !== "" || genre !== "all" || sort !== "recent";

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); await loadShelves(); } finally { setBusy(null); }
  };

  const card = (t: PublicTrack, compact?: boolean) => (
    <PublicCard
      key={t.id}
      t={t}
      compact={compact}
      saved={savedSourceIds.has(t.id)}
      mine={myId === t.uploader_id}
      busy={busy === t.id}
      menuOpen={menu === t.id}
      onToggleMenu={() => setMenu(menu === t.id ? null : t.id)}
      playlists={playlists}
      onPlay={() => void act(t.id, () => onAdd(t, { play: true }))}
      onAddMine={() => void act(t.id, () => onAdd(t))}
      onAddToPlaylist={(pid) => { setMenu(null); void act(t.id, () => onAddToPlaylist(pid, t)); }}
      onCreatePlaylist={() => { setMenu(null); onCreatePlaylist(); }}
    />
  );

  const shelf = (label: string, hint: string, Icon: typeof Flame, list: PublicTrack[]) =>
    list.length === 0 ? null : (
      <section className="mb-8" key={label}>
        <div className="mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--aurora-1)]" />
          <h3 className="font-display text-xl">{label}</h3>
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          {list.slice(0, 4).map((t) => card(t, true))}
        </div>
      </section>
    );

  return (
    <div onClick={() => setMenu(null)}>
      <div className="mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-background p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-aurora shadow-aurora flex h-11 w-11 items-center justify-center rounded-xl">
            <Globe2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl leading-none md:text-3xl">{title ?? "Community Library"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {subtitle ?? `${total} public track${total !== 1 ? "s" : ""} shared by DoMusic listeners · add any of them to your own songs`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the community library…"
              aria-label="Search public library"
              className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-[var(--aurora-2)]/50 focus:outline-none focus:ring-4 focus:ring-[var(--aurora-2)]/10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!fixedKind && KINDS.map((k) => (
              <button key={k.key} onClick={() => setKind(k.key)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition ${
                  kind === k.key ? "border-[var(--aurora-2)] bg-[var(--aurora-2)]/10 text-[var(--aurora-2)]" : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                }`}>
                {k.key === "video" ? <Video className="h-3.5 w-3.5" /> : k.key === "audio" ? <Music2 className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {k.label}
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort public library"
              className="rounded-full border border-border bg-secondary/60 px-3.5 py-2 text-[11px] font-semibold focus:outline-none">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {genres.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setGenre("all")}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                genre === "all" ? "border-[var(--aurora-1)] bg-[var(--aurora-1)]/10 text-[var(--aurora-1)]" : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}>All categories</button>
            {genres.map((g) => (
              <button key={g.genre} onClick={() => setGenre(g.genre)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  genre === g.genre ? "border-[var(--aurora-1)] bg-[var(--aurora-1)]/10 text-[var(--aurora-1)]" : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}>
                {g.genre} <span className="text-[10px] opacity-60">{g.track_count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!browsing && (
        <>
          {shelf("Trending", "hot right now", Flame, shelves.trending)}
          {shelf("Recently Uploaded", "fresh from the community", Clock, shelves.recent)}
          {shelf("Most Added", "added to the most libraries", TrendingUp, shelves.added)}
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading community library…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {debounced ? `No public results for “${debounced}”.` : "Nothing public here yet. Upload something and mark it Public to start the community library."}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-[var(--aurora-2)]" />
            <h3 className="font-display text-xl">{debounced ? `Results for “${debounced}”` : "All public uploads"}</h3>
            <span className="text-[11px] text-muted-foreground">{rows.length} shown</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {rows.map((t) => card(t))}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button onClick={() => void load(rows.length)} disabled={more}
                className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-6 py-3 text-xs font-bold transition hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)] disabled:opacity-50">
                {more ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
