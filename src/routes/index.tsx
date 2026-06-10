import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, ListMusic, Zap, Flame, Upload, Search, SkipBack, Play, Pause, SkipForward,
  Shuffle, Repeat, Volume2, VolumeX, Music2, Sparkles, Radio, Clock, Disc3, X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DOVID MUSIC ULTRA — Premium Audio Experience" },
      { name: "description", content: "A cinematic dark music player with live visualizer, gold accents, and full library control." },
      { property: "og:title", content: "DOVID MUSIC ULTRA" },
      { property: "og:description", content: "A cinematic dark music player with live visualizer." },
    ],
  }),
  component: Index,
});

type Track = {
  id: string;
  song: string;
  artist: string;
  album: string;
  cover: string;
  src?: string;
  kind: "audio" | "video";
  liked?: boolean;
  duration?: number;
  plays?: number;
};

const initialTracks: Track[] = [];

type View = "library" | "favorites" | "recent" | "trending";

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

function Index() {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("library");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [showQueue, setShowQueue] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = tracks.find((t) => t.id === currentId) ?? null;
  const display: Track = current ?? {
    id: "_empty",
    song: "Nothing playing",
    artist: "Upload a song or music video to start",
    album: "",
    cover: "",
    kind: "audio",
  };
  const isVideo = current?.kind === "video";



  const filtered = useMemo(() => {
    let list = tracks;
    if (view === "favorites") list = list.filter((t) => t.liked);
    else if (view === "recent") list = recent.map((id) => tracks.find((t) => t.id === id)!).filter(Boolean);
    else if (view === "trending") list = [...list].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.song.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q));
    }
    return list;
  }, [tracks, view, recent, query]);

  // Media element sync
  useEffect(() => {

    const a = audioRef.current;
    const v = videoRef.current;
    if (a) a.volume = muted ? 0 : volume;
    if (v) v.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (playing) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, currentId, isVideo]);

  // Synthetic progress when no src
  useEffect(() => {
    if (!playing || !current || current.src) return;
    const dur = display.duration ?? 200;
    setDuration(dur);
    const interval = window.setInterval(() => {
      setProgress((p) => {
        const n = p + 1;
        if (n >= dur) { handleNext(); return 0; }
        return n;
      });
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentId]);

  const playTrack = (id: string) => {
    setCurrentId(id);
    setPlaying(true);
    setProgress(0);
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 12));
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, plays: (t.plays ?? 0) + 1 } : t)));
  };


  const handleNext = () => {
    if (tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentId);
    let nextId: string;
    if (shuffle && tracks.length > 1) {
      const pool = tracks.filter((t) => t.id !== currentId);
      nextId = pool[Math.floor(Math.random() * pool.length)].id;
    } else {
      nextId = tracks[(idx + 1) % tracks.length].id;
    }
    playTrack(nextId);
  };
  const handlePrev = () => {
    if (tracks.length === 0) return;
    if (progress > 3) {
      setProgress(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      if (videoRef.current) videoRef.current.currentTime = 0;
      return;
    }
    const idx = tracks.findIndex((t) => t.id === currentId);
    playTrack(tracks[(idx - 1 + tracks.length) % tracks.length].id);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const added: Track[] = files.map((f, i) => {
      const kind: "audio" | "video" = f.type.startsWith("video") ? "video" : "audio";
      return {
        id: `u-${Date.now()}-${i}`,
        song: f.name.replace(/\.[^.]+$/, ""),
        artist: kind === "video" ? "Music Video" : "Your Upload",
        album: "Local Files",
        cover: `https://picsum.photos/seed/${encodeURIComponent(f.name)}/600/600`,
        src: URL.createObjectURL(f),
        kind,
        plays: 0,
      };
    });
    setTracks((prev) => [...added, ...prev]);
    if (added[0]) playTrack(added[0].id);
    e.target.value = "";
  };

  const toggleLike = (id: string) =>
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t)));

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = ratio * (duration || display.duration || 200);
    setProgress(t);
    if (audioRef.current) audioRef.current.currentTime = t;
    if (videoRef.current) videoRef.current.currentTime = t;
  };


  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.code === "ArrowRight") handleNext();
      else if (e.code === "ArrowLeft") handlePrev();
      else if (e.key === "m") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, tracks, shuffle, progress]);

  const navItems: { key: View; icon: typeof Heart; label: string; count?: number }[] = [
    { key: "library", icon: Music2, label: "Library", count: tracks.length },
    { key: "favorites", icon: Heart, label: "Favorites", count: tracks.filter((t) => t.liked).length },
    { key: "recent", icon: Clock, label: "Recently Played", count: recent.length },
    { key: "trending", icon: Flame, label: "Trending", count: tracks.length },
  ];

  const progressPct = duration ? (progress / duration) * 100 : (progress / (display.duration || 200)) * 100;

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      {/* Ambient backdrop driven by current cover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 transition-all duration-1000"
        style={{
          backgroundImage: `url(${display.cover})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(120px) saturate(1.4)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/70" />

      {/* Sidebar */}
      <aside className="relative z-10 hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel/60 p-5 backdrop-blur-xl md:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="bg-aurora shadow-aurora relative flex h-11 w-11 items-center justify-center rounded-xl">
            <Disc3 className="h-6 w-6 text-primary-foreground" />
            <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-xl bg-[var(--aurora-2)]/40" />
          </div>
          <div>
            <div className="font-display text-aurora text-2xl leading-none">DOVID</div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">MUSIC · ULTRA</div>
          </div>
        </div>

        <label className="bg-aurora shadow-aurora group mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-2xl p-4 font-bold text-primary-foreground transition hover:brightness-110">
          <Upload className="h-4 w-4 transition group-hover:-translate-y-0.5" />
          <span className="text-sm tracking-wide">UPLOAD MUSIC / VIDEO</span>
          <input ref={fileRef} type="file" multiple accept="audio/*,video/*" className="hidden" onChange={handleUpload} />

        </label>

        <div className="mb-2 px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground">BROWSE</div>
        <nav className="flex flex-col gap-1.5">
          {navItems.map(({ key, icon: Icon, label, count }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                className={[
                  "group flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all",
                  active
                    ? "bg-gradient-to-r from-[var(--aurora-2)]/15 to-transparent text-[var(--aurora-2)] shadow-[inset_2px_0_0_var(--aurora-2)]"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className={`h-4 w-4 ${active ? "" : "group-hover:text-[var(--aurora-2)]"}`} />
                <span className="flex-1">{label}</span>
                {count != null && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mb-2 mt-8 px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground">MOOD</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Focus", icon: Sparkles, from: "#1a3c2a", to: "#5a8a5c" },
            { label: "Chill", icon: Radio, from: "#0c2340", to: "#5cbdb9" },
            { label: "Hype", icon: Zap, from: "#6b3a2a", to: "#ff8c00" },
            { label: "Sleep", icon: ListMusic, from: "#1a1a2e", to: "#4f46e5" },
          ].map((m) => (
            <button
              key={m.label}
              className="group relative overflow-hidden rounded-xl border border-border p-3 text-left text-xs font-semibold transition hover:-translate-y-0.5 hover:border-[var(--aurora-2)]/40"
              style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}
            >
              <m.icon className="mb-2 h-4 w-4" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 text-[10px] leading-relaxed text-muted-foreground">
          <div className="font-semibold tracking-widest text-foreground/70">SHORTCUTS</div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <span>Space</span><span className="text-right">Play</span>
            <span>← →</span><span className="text-right">Skip</span>
            <span>M</span><span className="text-right">Mute</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-20 shrink-0 items-center gap-3 border-b border-border bg-panel/40 px-5 backdrop-blur-xl md:gap-5 md:px-8">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, artists, albums…"
              className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-[var(--aurora-2)]/50 focus:bg-secondary focus:outline-none focus:ring-4 focus:ring-[var(--aurora-2)]/10"
            />
          </div>
          <button
            onClick={() => setShowQueue((s) => !s)}
            className="hidden items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2.5 text-xs font-semibold transition hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)] md:flex"
          >
            <ListMusic className="h-4 w-4" /> Queue
          </button>
        </header>

        {/* Content */}
        <section className="flex-1 overflow-y-auto px-5 pb-8 pt-6 md:px-8">
          {/* Hero now-playing strip */}
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-background p-6 md:p-8">
            <div
              className="absolute inset-0 opacity-30"
              style={{ backgroundImage: `url(${display.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) saturate(1.5)" }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" aria-hidden />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div className="relative">
                {isVideo && current?.src ? (
                  <video
                    ref={videoRef}
                    src={current.src}
                    playsInline
                    onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onEnded={() => (repeat ? (videoRef.current && (videoRef.current.currentTime = 0, videoRef.current.play())) : handleNext())}
                    className="aspect-video w-[280px] rounded-2xl object-cover shadow-2xl ring-1 ring-[var(--aurora-2)]/30 md:w-[420px]"
                  />
                ) : (
                  <img src={display.cover || "https://picsum.photos/seed/empty/600/600"} alt={display.song} className={`h-32 w-32 rounded-2xl object-cover shadow-2xl ring-1 ring-[var(--aurora-2)]/30 md:h-40 md:w-40 ${playing ? "animate-float-cover" : ""}`} />
                )}
                {playing && <div className="absolute -inset-2 -z-10 rounded-3xl bg-[var(--aurora-2)]/30 blur-2xl" aria-hidden />}
              </div>

              <div className="flex-1">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--aurora-2)]/10 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-[var(--aurora-2)]">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full bg-[var(--aurora-2)] ${playing ? "animate-pulse" : ""}`} />
                  NOW PLAYING
                </div>
                <h1 className="font-display text-4xl leading-none md:text-6xl">{display.song}</h1>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  {display.artist} <span className="text-foreground/30">·</span> {display.album}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="bg-aurora shadow-aurora flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110"
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {playing ? "Pause" : "Play"}
                  </button>
                  <button
                    onClick={() => toggleLike((current?.id ?? ""))}
                    className="rounded-full border border-border bg-secondary/60 p-2.5 transition hover:border-[var(--aurora-2)]/40"
                  >
                    <Heart className={`h-4 w-4 ${display.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : ""}`} />
                  </button>
                </div>
              </div>
              {/* Live equalizer */}
              <div className="hidden h-24 items-end gap-1 md:flex">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    className="bg-aurora w-1.5 rounded-full"
                    style={{
                      height: playing ? `${20 + Math.abs(Math.sin((i + 1) * 1.7) * 60) + Math.random() * 20}%` : "12%",
                      animation: playing ? `eq-${i % 4} ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl md:text-4xl">
                {view === "library" && "Your Library"}
                {view === "favorites" && "Favorites"}
                {view === "recent" && "Recently Played"}
                {view === "trending" && "Trending Now"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{filtered.length} tracks</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No tracks here yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
              {filtered.map((t) => {
                const active = t.id === currentId;
                return (
                  <article
                    key={t.id}
                    onClick={() => playTrack(t.id)}
                    className={[
                      "group relative cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-b from-card to-background transition duration-300",
                      "hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-15px_rgba(255,140,0,0.35)]",
                      active ? "border-[var(--aurora-2)]/50 shadow-[0_0_30px_-5px_rgba(255,215,0,0.4)]" : "border-border hover:border-[var(--aurora-2)]/30",
                    ].join(" ")}
                  >
                    <div className="relative aspect-square overflow-hidden">
                      <img src={t.cover} alt={t.song} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent" />
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}
                        className="absolute right-3 top-3 rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110"
                      >
                        <Heart className={`h-3.5 w-3.5 ${t.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : "text-white"}`} />
                      </button>
                      <div className="absolute bottom-3 right-3 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-aurora text-primary-foreground opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                        {active && playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                      </div>
                      {active && playing && (
                        <div className="absolute bottom-3 left-3 flex h-5 items-end gap-0.5">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="w-0.5 rounded-full bg-[var(--aurora-2)]" style={{ height: `${30 + (i % 2) * 40}%`, animation: `eq-${i} ${0.5 + i * 0.1}s ease-in-out infinite alternate` }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className={`truncate text-sm font-bold ${active ? "text-[var(--aurora-2)]" : ""}`}>{t.song}</div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{t.artist}</span>
                        <span className="shrink-0">{fmt(t.duration ?? 0)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Player */}
        <footer className="relative z-20 grid h-24 shrink-0 grid-cols-[1fr_auto] items-center gap-4 border-t border-border bg-panel/90 px-4 backdrop-blur-xl md:h-28 md:grid-cols-[1fr_auto_1fr] md:px-6">
          {/* Now playing */}
          <div className="flex items-center gap-3 overflow-hidden">
            <img src={display.cover} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-border md:h-16 md:w-16" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-sm font-bold md:text-base">{display.song}</div>
              <div className="truncate text-xs text-muted-foreground">{display.artist}</div>
            </div>
            <button onClick={() => toggleLike((current?.id ?? ""))} className="hidden p-2 md:block">
              <Heart className={`h-4 w-4 transition ${display.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : "text-muted-foreground hover:text-foreground"}`} />
            </button>
          </div>

          {/* Center controls */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 md:gap-2">
              <button onClick={() => setShuffle((s) => !s)} className={`hidden p-2 transition md:block ${shuffle ? "text-[var(--aurora-2)]" : "text-muted-foreground hover:text-foreground"}`}>
                <Shuffle className="h-4 w-4" />
              </button>
              <button onClick={handlePrev} className="rounded-full p-2 text-foreground transition hover:scale-110">
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="bg-aurora shadow-aurora flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground transition hover:scale-105 hover:brightness-110 md:h-14 md:w-14"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button onClick={handleNext} className="rounded-full p-2 text-foreground transition hover:scale-110">
                <SkipForward className="h-5 w-5" />
              </button>
              <button onClick={() => setRepeat((r) => !r)} className={`hidden p-2 transition md:block ${repeat ? "text-[var(--aurora-2)]" : "text-muted-foreground hover:text-foreground"}`}>
                <Repeat className="h-4 w-4" />
              </button>
            </div>
            <div className="hidden w-full max-w-md items-center gap-3 md:flex">
              <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{fmt(progress)}</span>
              <div onClick={onSeek} className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-secondary">
                <div className="bg-aurora absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: `${progressPct}%` }} />
                <div className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-lg transition group-hover:opacity-100" style={{ left: `${progressPct}%` }} />
              </div>
              <span className="w-10 text-[10px] tabular-nums text-muted-foreground">{fmt(duration || display.duration || 0)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="hidden items-center justify-end gap-3 md:flex">
            <button onClick={() => setMuted((m) => !m)} className="text-muted-foreground hover:text-foreground">
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
              className="fader w-28"
              style={{ ["--val" as string]: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>

          {/* Mobile progress under bar */}
          <div onClick={onSeek} className="absolute inset-x-0 bottom-0 h-1 cursor-pointer bg-secondary md:hidden">
            <div className="bg-aurora h-full" style={{ width: `${progressPct}%` }} />
          </div>
        </footer>
      </main>

      {/* Queue drawer */}
      {showQueue && (
        <aside className="absolute right-0 top-0 z-30 flex h-full w-[340px] flex-col border-l border-border bg-panel/95 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <div className="font-display text-2xl">Up Next</div>
              <div className="text-xs text-muted-foreground">{tracks.length} in queue</div>
            </div>
            <button onClick={() => setShowQueue(false)} className="rounded-full p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tracks.map((t) => (
              <button key={t.id} onClick={() => playTrack(t.id)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-secondary ${t.id === currentId ? "bg-secondary/70" : ""}`}>
                <img src={t.cover} alt="" className="h-11 w-11 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${t.id === currentId ? "text-[var(--aurora-2)]" : ""}`}>{t.song}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{fmt(t.duration ?? 0)}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Audio element (video element lives in the hero when applicable) */}
      <audio
        ref={audioRef}
        src={!isVideo ? current?.src : undefined}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => (repeat ? (audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play())) : handleNext())}
      />

      <style>{`
        @keyframes eq-0 { from { height: 20%; } to { height: 90%; } }
        @keyframes eq-1 { from { height: 60%; } to { height: 25%; } }
        @keyframes eq-2 { from { height: 35%; } to { height: 85%; } }
        @keyframes eq-3 { from { height: 75%; } to { height: 30%; } }
      `}</style>
    </div>
  );
}
