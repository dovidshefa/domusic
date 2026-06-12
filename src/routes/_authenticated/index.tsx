import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Heart, ListMusic, Flame, Upload, Search, SkipBack, Play, Pause, SkipForward,
  Shuffle, Repeat, Volume2, VolumeX, Music2, Clock, Disc3, X,
  Trash2, Plus, ListPlus, LogOut, Maximize2, Minimize2, Download, Sliders,
  Rewind, FastForward, Pencil, User as UserIcon, MoreVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "DOVID MUSIC ULTRA — Your Library" },
      { name: "description", content: "Your personal music & music-video library, synced across devices." },
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
  src: string;
  storage_path: string | null;
  kind: "audio" | "video";
  liked: boolean;
  duration: number | null;
  plays: number;
};

type Playlist = { id: string; name: string; trackIds: string[] };
type View =
  | { type: "library" | "favorites" | "recent" | "trending" | "artists" }
  | { type: "playlist"; id: string }
  | { type: "artist"; name: string };
type EditingTrack = { id: string; song: string; artist: string; album: string } | null;

const RECENT_KEY = "dovid-recent-v1";
const EQ_KEY = "dovid-eq-v1";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

function Index() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; name: string; avatar: string | null; email: string } | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ type: "library" });
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [addToMenu, setAddToMenu] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEq, setShowEq] = useState(false);
  const EQ_BANDS = [60, 230, 910, 3600, 14000];
  const EQ_LABELS = ["60Hz", "230Hz", "910Hz", "3.6k", "14k"];
  const EQ_PRESETS: Record<string, number[]> = {
    Flat: [0, 0, 0, 0, 0],
    "Bass Boost": [8, 5, 1, 0, 0],
    Vocal: [-2, -1, 4, 5, 2],
    Treble: [0, 0, 1, 5, 8],
    Electronic: [6, 2, -2, 3, 6],
    Acoustic: [4, 3, 1, 2, 3],
  };
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0]);
  const [editing, setEditing] = useState<EditingTrack>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerStageRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const sourcesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map());

  // Load user + library
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const meta = u.user.user_metadata ?? {};
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", u.user.id)
        .maybeSingle();
      setUser({
        id: u.user.id,
        email: u.user.email ?? "",
        name: profile?.display_name ?? meta.full_name ?? meta.name ?? u.user.email?.split("@")[0] ?? "You",
        avatar: profile?.avatar_url ?? meta.avatar_url ?? null,
      });

      const [{ data: tRows }, { data: pRows }, { data: ptRows }] = await Promise.all([
        supabase.from("tracks").select("*").order("created_at", { ascending: false }),
        supabase.from("playlists").select("*").order("created_at", { ascending: true }),
        supabase.from("playlist_tracks").select("playlist_id, track_id, position").order("position", { ascending: true }),
      ]);

      // resign URLs for any private storage tracks
      const refreshed = await Promise.all(
        (tRows ?? []).map(async (t: any) => {
          let src = t.src as string;
          if (t.storage_path) {
            const { data } = await supabase.storage.from("media").createSignedUrl(t.storage_path, SIGNED_URL_TTL);
            if (data?.signedUrl) src = data.signedUrl;
          }
          return {
            id: t.id, song: t.song, artist: t.artist, album: t.album,
            cover: t.cover ?? `https://picsum.photos/seed/${encodeURIComponent(t.song)}/600/600`,
            src, storage_path: t.storage_path, kind: t.kind, liked: t.liked,
            duration: t.duration, plays: t.plays,
          } as Track;
        })
      );
      setTracks(refreshed);

      const ptByPlaylist = new Map<string, string[]>();
      (ptRows ?? []).forEach((r: any) => {
        const arr = ptByPlaylist.get(r.playlist_id) ?? [];
        arr.push(r.track_id);
        ptByPlaylist.set(r.playlist_id, arr);
      });
      setPlaylists((pRows ?? []).map((p: any) => ({ id: p.id, name: p.name, trackIds: ptByPlaylist.get(p.id) ?? [] })));

      try {
        const r = localStorage.getItem(RECENT_KEY);
        if (r) setRecent(JSON.parse(r));
        const e = localStorage.getItem(EQ_KEY);
        if (e) {
          const parsed = JSON.parse(e);
          if (Array.isArray(parsed.gains) && parsed.gains.length === 5) setEqGains(parsed.gains);
          if (typeof parsed.enabled === "boolean") setEqEnabled(parsed.enabled);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
  }, [recent]);

  useEffect(() => {
    try { localStorage.setItem(EQ_KEY, JSON.stringify({ gains: eqGains, enabled: eqEnabled })); } catch {}
  }, [eqGains, eqEnabled]);

  const current = tracks.find((t) => t.id === currentId) ?? null;
  const display = current ?? {
    id: "_empty", song: "Nothing playing", artist: "Upload a song or music video to start",
    album: "", cover: "", src: "", storage_path: null, kind: "audio" as const, liked: false,
    duration: null, plays: 0,
  };
  const isVideo = current?.kind === "video";
  const activePlaylist = view.type === "playlist" ? playlists.find((p) => p.id === view.id) : null;

  const artistGroups = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t) => map.set(t.artist || "Unknown", (map.get(t.artist || "Unknown") ?? 0) + 1));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks]);

  const filtered = useMemo(() => {
    let list = tracks;
    if (view.type === "favorites") list = list.filter((t) => t.liked);
    else if (view.type === "recent") list = recent.map((id) => tracks.find((t) => t.id === id)!).filter(Boolean);
    else if (view.type === "trending") list = [...list].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
    else if (view.type === "playlist" && activePlaylist) {
      list = activePlaylist.trackIds.map((id) => tracks.find((t) => t.id === id)!).filter(Boolean);
    } else if (view.type === "artist") {
      list = list.filter((t) => (t.artist || "Unknown") === view.name);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.song.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q));
    }
    return list;
  }, [tracks, view, recent, query, activePlaylist]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    if (videoRef.current) videoRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (playing) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, currentId, isVideo]);

  const playTrack = useCallback((id: string) => {
    setCurrentId(id);
    setPlaying(true);
    setProgress(0);
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 12));
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, plays: (t.plays ?? 0) + 1 } : t)));
    supabase.rpc; // placeholder noop
    supabase.from("tracks").update({ plays: (tracks.find(t => t.id === id)?.plays ?? 0) + 1 }).eq("id", id).then(() => {});
  }, [tracks]);

  const handleNext = () => {
    if (tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentId);
    const nextId = shuffle && tracks.length > 1
      ? tracks.filter((t) => t.id !== currentId)[Math.floor(Math.random() * (tracks.length - 1))].id
      : tracks[(idx + 1) % tracks.length].id;
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);

    const added: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const kind: "audio" | "video" = f.type.startsWith("video") ? "video" : "audio";
      const ext = f.name.split(".").pop()?.toLowerCase() ?? (kind === "video" ? "mp4" : "mp3");
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("media").upload(path, f, {
        cacheControl: "3600", upsert: false, contentType: f.type || undefined,
      });
      if (upErr) {
        console.error("upload failed", upErr);
        continue;
      }
      const { data: signed } = await supabase.storage.from("media").createSignedUrl(path, SIGNED_URL_TTL);
      const src = signed?.signedUrl ?? "";

      const cover = `https://picsum.photos/seed/${encodeURIComponent(f.name)}/600/600`;
      const song = f.name.replace(/\.[^.]+$/, "");
      const { data: row, error: insErr } = await supabase
        .from("tracks")
        .insert({
          user_id: user.id,
          song,
          artist: kind === "video" ? "Music Video" : "Your Upload",
          album: "Local Files",
          cover,
          src,
          storage_path: path,
          kind,
        })
        .select()
        .single();
      if (insErr || !row) {
        console.error("insert failed", insErr);
        continue;
      }
      added.push({
        id: row.id, song: row.song, artist: row.artist, album: row.album,
        cover: row.cover ?? cover, src, storage_path: row.storage_path,
        kind: row.kind as "audio" | "video", liked: row.liked, duration: row.duration, plays: row.plays,
      });
    }
    setTracks((prev) => [...added, ...prev]);
    if (added[0]) playTrack(added[0].id);
    setUploading(false);
    e.target.value = "";
  };

  const toggleLike = async (id: string) => {
    const t = tracks.find((x) => x.id === id);
    if (!t) return;
    const nv = !t.liked;
    setTracks((ts) => ts.map((x) => (x.id === id ? { ...x, liked: nv } : x)));
    await supabase.from("tracks").update({ liked: nv }).eq("id", id);
  };

  const deleteTrack = async (id: string) => {
    if (!confirm("Delete this track from your library?")) return;
    const t = tracks.find((x) => x.id === id);
    setTracks((ts) => ts.filter((x) => x.id !== id));
    setPlaylists((pls) => pls.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })));
    setRecent((r) => r.filter((x) => x !== id));
    if (currentId === id) { setCurrentId(null); setPlaying(false); }
    await supabase.from("tracks").delete().eq("id", id);
    if (t?.storage_path) await supabase.storage.from("media").remove([t.storage_path]);
  };

  const saveTrackEdits = async () => {
    if (!editing) return;
    const { id, song, artist, album } = editing;
    const cleanSong = song.trim() || "Untitled";
    const cleanArtist = artist.trim() || "Unknown";
    const cleanAlbum = album.trim() || "Local Files";
    setTracks((ts) => ts.map((x) => (x.id === id ? { ...x, song: cleanSong, artist: cleanArtist, album: cleanAlbum } : x)));
    setEditing(null);
    await supabase.from("tracks").update({ song: cleanSong, artist: cleanArtist, album: cleanAlbum }).eq("id", id);
  };

  const assignTracksToArtist = async (trackIds: string[], artistName: string) => {
    const name = artistName.trim() || "Unknown";
    setTracks((ts) => ts.map((x) => (trackIds.includes(x.id) ? { ...x, artist: name } : x)));
    await supabase.from("tracks").update({ artist: name }).in("id", trackIds);
  };

  const createPlaylist = async () => {
    if (!user) return;
    const name = prompt("Name your playlist");
    if (!name?.trim()) return;
    const { data, error } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single();
    if (error || !data) return;
    const pl: Playlist = { id: data.id, name: data.name, trackIds: [] };
    setPlaylists((p) => [...p, pl]);
    setView({ type: "playlist", id: pl.id });
  };

  const deletePlaylist = async (id: string) => {
    if (!confirm("Delete this playlist?")) return;
    setPlaylists((p) => p.filter((x) => x.id !== id));
    if (view.type === "playlist" && view.id === id) setView({ type: "library" });
    await supabase.from("playlists").delete().eq("id", id);
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl || pl.trackIds.includes(trackId)) { setAddToMenu(null); return; }
    setPlaylists((pls) => pls.map((p) => (p.id === playlistId ? { ...p, trackIds: [...p.trackIds, trackId] } : p)));
    setAddToMenu(null);
    await supabase.from("playlist_tracks").insert({ playlist_id: playlistId, track_id: trackId, position: pl.trackIds.length });
  };

  const removeFromPlaylist = async (playlistId: string, trackId: string) => {
    setPlaylists((pls) => pls.map((p) => (p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p)));
    await supabase.from("playlist_tracks").delete().eq("playlist_id", playlistId).eq("track_id", trackId);
  };

  const seekToClientX = (clientX: number, rect: DOMRect) => {
    if (!current) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * (duration || 200);
    setProgress(t);
    if (audioRef.current) audioRef.current.currentTime = t;
    if (videoRef.current) videoRef.current.currentTime = t;
  };
  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    seekToClientX(e.clientX, rect);
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX, rect);
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // Touch swipe on hero: left/right = prev/next, double-tap left/right = ±10s
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onHeroTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onHeroTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current; if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    touchRef.current = null;
    if (dt > 700) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) handleNext(); else handlePrev();
    } else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) skipBy(10); else skipBy(-10);
    }
  };


  const skipBy = (sec: number) => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    const t = Math.max(0, Math.min((duration || el.duration || 0), el.currentTime + sec));
    el.currentTime = t;
    setProgress(t);
  };

  const toggleFullscreen = async () => {
    const el = playerStageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) { console.error(err); }
  };
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const downloadCurrent = async () => {
    if (!current) return;
    try {
      let url = current.src;
      let filename = `${current.song}.${current.kind === "video" ? "mp4" : "mp3"}`;
      if (current.storage_path) {
        const { data } = await supabase.storage.from("media").createSignedUrl(
          current.storage_path, 60 * 10, { download: filename }
        );
        if (data?.signedUrl) url = data.signedUrl;
      }
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.error(e); }
  };

  // ---- Web Audio Equalizer (works for any output device incl. Bluetooth) ----
  const ensureEqGraph = useCallback((el: HTMLMediaElement | null) => {
    if (!el) return;
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
        filtersRef.current = EQ_BANDS.map((f, i) => {
          const filter = audioCtxRef.current!.createBiquadFilter();
          filter.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
          filter.frequency.value = f;
          filter.Q.value = 1.0;
          filter.gain.value = eqGains[i] ?? 0;
          return filter;
        });
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === "suspended") ctx.resume();
      if (!sourcesRef.current.has(el)) {
        const src = ctx.createMediaElementSource(el);
        sourcesRef.current.set(el, src);
        // chain: src -> f0 -> f1 ... -> destination
        let node: AudioNode = src;
        filtersRef.current.forEach((f) => { node.connect(f); node = f; });
        node.connect(ctx.destination);
      }
    } catch (err) {
      console.warn("EQ setup failed", err);
    }
  }, [eqGains]);

  useEffect(() => {
    if (!eqEnabled) return;
    ensureEqGraph(audioRef.current);
    if (isVideo) ensureEqGraph(videoRef.current);
  }, [eqEnabled, currentId, isVideo, ensureEqGraph]);

  useEffect(() => {
    filtersRef.current.forEach((f, i) => {
      if (f) f.gain.value = eqEnabled ? (eqGains[i] ?? 0) : 0;
    });
  }, [eqGains, eqEnabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.code === "ArrowRight" && e.shiftKey) handleNext();
      else if (e.code === "ArrowLeft" && e.shiftKey) handlePrev();
      else if (e.code === "ArrowRight") skipBy(10);
      else if (e.code === "ArrowLeft") skipBy(-10);
      else if (e.key === "m") setMuted((m) => !m);
      else if (e.key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, tracks, shuffle, progress, isVideo, duration]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const navItems: { key: "library" | "favorites" | "recent" | "trending" | "artists"; icon: typeof Heart; label: string; count?: number }[] = [
    { key: "library", icon: Music2, label: "Library", count: tracks.length },
    { key: "favorites", icon: Heart, label: "Favorites", count: tracks.filter((t) => t.liked).length },
    { key: "recent", icon: Clock, label: "Recently Played", count: recent.length },
    { key: "trending", icon: Flame, label: "Trending", count: tracks.length },
    { key: "artists", icon: UserIcon, label: "Artists", count: artistGroups.length },
  ];

  const progressPct = duration ? (progress / duration) * 100 : 0;
  const headerTitle =
    view.type === "library" ? "Your Library" :
    view.type === "favorites" ? "Favorites" :
    view.type === "recent" ? "Recently Played" :
    view.type === "trending" ? "Trending Now" :
    view.type === "artists" ? "Artists" :
    view.type === "artist" ? view.name :
    activePlaylist?.name ?? "Playlist";

  return (
    <div className="relative flex h-screen w-full overflow-hidden" onClick={() => setAddToMenu(null)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 transition-all duration-1000"
        style={{ backgroundImage: `url(${display.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(120px) saturate(1.4)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/70" />

      {/* Sidebar */}
      <aside className="relative z-10 hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel/60 p-5 backdrop-blur-xl md:flex">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-aurora shadow-aurora relative flex h-11 w-11 items-center justify-center rounded-xl">
            <Disc3 className="h-6 w-6 text-primary-foreground" />
            <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-xl bg-[var(--aurora-2)]/40" />
          </div>
          <div>
            <div className="font-display text-aurora text-2xl leading-none">DOVID</div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">MUSIC · ULTRA</div>
          </div>
        </div>

        {user && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--aurora-2)]/30" referrerPolicy="no-referrer" />
            ) : (
              <div className="bg-aurora flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{user.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-[var(--aurora-1)]">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <label className={`bg-aurora shadow-aurora group mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-2xl p-4 font-bold text-primary-foreground transition hover:brightness-110 ${uploading ? "opacity-60" : ""}`}>
          <Upload className="h-4 w-4 transition group-hover:-translate-y-0.5" />
          <span className="text-sm tracking-wide">{uploading ? "UPLOADING…" : "UPLOAD MUSIC / VIDEO"}</span>
          <input ref={fileRef} type="file" multiple accept="audio/*,video/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        <div className="mb-2 px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground">BROWSE</div>
        <nav className="flex flex-col gap-1.5">
          {navItems.map(({ key, icon: Icon, label, count }) => {
            const active = view.type === key;
            return (
              <button key={key} onClick={() => setView({ type: key } as View)}
                className={["group flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all",
                  active ? "bg-gradient-to-r from-[var(--aurora-2)]/15 to-transparent text-[var(--aurora-2)] shadow-[inset_2px_0_0_var(--aurora-2)]"
                         : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"].join(" ")}>
                <Icon className={`h-4 w-4 ${active ? "" : "group-hover:text-[var(--aurora-2)]"}`} />
                <span className="flex-1">{label}</span>
                {count != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mb-2 mt-8 flex items-center justify-between px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground">
          <span>PLAYLISTS</span>
          <button onClick={createPlaylist} className="rounded-full p-1 text-foreground hover:bg-secondary" title="New playlist">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {playlists.length === 0 && (
            <button onClick={createPlaylist} className="rounded-xl border border-dashed border-border px-4 py-3 text-left text-xs text-muted-foreground hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]">
              + Create your first playlist
            </button>
          )}
          {playlists.map((p) => {
            const active = view.type === "playlist" && view.id === p.id;
            return (
              <div key={p.id} className="group flex items-center gap-1">
                <button onClick={() => setView({ type: "playlist", id: p.id })}
                  className={["flex flex-1 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-all",
                    active ? "bg-gradient-to-r from-[var(--aurora-2)]/15 to-transparent text-[var(--aurora-2)]"
                           : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"].join(" ")}>
                  <ListMusic className="h-4 w-4" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{p.trackIds.length}</span>
                </button>
                <button onClick={() => deletePlaylist(p.id)} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-[var(--aurora-1)] group-hover:opacity-100" title="Delete playlist">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {artistGroups.length > 0 && (
          <>
            <div className="mb-2 mt-8 px-2 text-[10px] font-semibold tracking-[0.25em] text-muted-foreground">ARTISTS</div>
            <div className="flex flex-col gap-1">
              {artistGroups.map(([name, count]) => {
                const active = view.type === "artist" && view.name === name;
                return (
                  <button key={name} onClick={() => setView({ type: "artist", name })}
                    className={["flex items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-semibold transition-all",
                      active ? "bg-gradient-to-r from-[var(--aurora-1)]/15 to-transparent text-[var(--aurora-1)]"
                             : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"].join(" ")}>
                    <UserIcon className="h-4 w-4" />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-[10px] text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

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
        <header className="flex h-20 shrink-0 items-center gap-3 border-b border-border bg-panel/40 px-5 backdrop-blur-xl md:gap-5 md:px-8">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, albums…"
              className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-[var(--aurora-2)]/50 focus:bg-secondary focus:outline-none focus:ring-4 focus:ring-[var(--aurora-2)]/10" />
          </div>
          <button onClick={() => setShowQueue((s) => !s)} className="hidden items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2.5 text-xs font-semibold transition hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)] md:flex">
            <ListMusic className="h-4 w-4" /> Queue
          </button>
          {user && (
            <button onClick={signOut} className="md:hidden rounded-full border border-border bg-secondary/60 p-2.5" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </header>

        <section className="flex-1 overflow-y-auto px-5 pb-8 pt-6 md:px-8">
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-background p-6 md:p-8">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `url(${display.cover})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) saturate(1.5)" }} aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" aria-hidden />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div ref={playerStageRef} onTouchStart={onHeroTouchStart} onTouchEnd={onHeroTouchEnd}
                className={`relative select-none ${isFullscreen ? "flex h-screen w-screen items-center justify-center bg-black" : ""}`}>
                {isVideo && current?.src ? (
                  <video ref={videoRef} src={current.src} playsInline crossOrigin="anonymous"
                    onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onEnded={() => (repeat ? (videoRef.current && (videoRef.current.currentTime = 0, videoRef.current.play())) : handleNext())}
                    className={isFullscreen
                      ? "h-full w-full object-contain"
                      : "aspect-video w-[280px] rounded-2xl object-cover shadow-2xl ring-1 ring-[var(--aurora-2)]/30 md:w-[420px]"} />
                ) : (
                  <img src={display.cover || "https://picsum.photos/seed/empty/600/600"} alt={display.song}
                    className={isFullscreen
                      ? "max-h-full max-w-full object-contain"
                      : `h-32 w-32 rounded-2xl object-cover shadow-2xl ring-1 ring-[var(--aurora-2)]/30 md:h-40 md:w-40 ${playing ? "animate-float-cover" : ""}`} />
                )}
                {playing && !isFullscreen && <div className="absolute -inset-2 -z-10 rounded-3xl bg-[var(--aurora-2)]/30 blur-2xl" aria-hidden />}
                {current && (
                  <button onClick={toggleFullscreen}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white backdrop-blur transition hover:bg-black/80"
                    title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                )}
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
                  <button onClick={() => setPlaying((p) => !p)} className="bg-aurora shadow-aurora flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110">
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {playing ? "Pause" : "Play"}
                  </button>
                  {current && (
                    <>
                      <button onClick={() => toggleLike(current.id)} className="rounded-full border border-border bg-secondary/60 p-2.5 transition hover:border-[var(--aurora-2)]/40" title="Favorite">
                        <Heart className={`h-4 w-4 ${display.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : ""}`} />
                      </button>
                      <button onClick={downloadCurrent} className="rounded-full border border-border bg-secondary/60 p-2.5 transition hover:border-[var(--aurora-2)]/40" title="Download">
                        <Download className="h-4 w-4" />
                      </button>
                      <button onClick={() => setShowEq((s) => !s)} className={`rounded-full border bg-secondary/60 p-2.5 transition ${showEq ? "border-[var(--aurora-2)] text-[var(--aurora-2)]" : "border-border hover:border-[var(--aurora-2)]/40"}`} title="Equalizer">
                        <Sliders className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="hidden h-24 items-end gap-1 md:flex">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span key={i} className="bg-aurora w-1.5 rounded-full"
                    style={{
                      height: playing ? `${20 + Math.abs(Math.sin((i + 1) * 1.7) * 60) + Math.random() * 20}%` : "12%",
                      animation: playing ? `eq-${i % 4} ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate` : "none",
                    }} />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl md:text-4xl">{headerTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{filtered.length} tracks</p>
            </div>
            {view.type === "library" && (
              <button onClick={createPlaylist} className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2 text-xs font-semibold hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]">
                <Plus className="h-3.5 w-3.5" /> New Playlist
              </button>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">Loading your library…</div>
          ) : view.type === "artists" ? (
            artistGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                No artists yet. Upload tracks or assign artists by editing a track.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
                {artistGroups.map(([name, count]) => {
                  const sample = tracks.find((t) => (t.artist || "Unknown") === name);
                  return (
                    <button key={name} onClick={() => setView({ type: "artist", name })}
                      className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background text-left transition hover:-translate-y-1.5 hover:border-[var(--aurora-1)]/40 hover:shadow-[0_20px_50px_-15px_rgba(244,114,182,0.35)]">
                      <div className="relative aspect-square overflow-hidden">
                        <img src={sample?.cover || "https://picsum.photos/seed/artist/600/600"} alt={name}
                          className="h-full w-full scale-110 object-cover blur-[1px] brightness-75 transition duration-700 group-hover:scale-125" />
                        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-4">
                          <div className="bg-aurora -ml-1 mb-1 flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground shadow-xl">
                            <UserIcon className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="truncate text-base font-bold">{name}</div>
                        <div className="text-xs text-muted-foreground">{count} track{count !== 1 ? "s" : ""}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No tracks here yet. Click "Upload Music / Video" to add some.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
              {filtered.map((t) => {
                const active = t.id === currentId;
                return (
                  <article key={t.id} onClick={() => playTrack(t.id)}
                    className={["group relative cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-b from-card to-background transition duration-300",
                      "hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-15px_rgba(168,85,247,0.35)]",
                      active ? "border-[var(--aurora-2)]/50 shadow-[0_0_30px_-5px_rgba(168,85,247,0.4)]" : "border-border hover:border-[var(--aurora-2)]/30"].join(" ")}>
                    <div className="relative aspect-square overflow-hidden">
                      <img src={t.cover} alt={t.song} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent" />
                      <div className="absolute right-3 top-3 flex gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }} className="rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110" title="Favorite">
                          <Heart className={`h-3.5 w-3.5 ${t.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : "text-white"}`} />
                        </button>
                        <div className="relative">
                          <button onClick={(e) => { e.stopPropagation(); setAddToMenu(addToMenu === t.id ? null : t.id); }} className="rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110" title="Add to playlist">
                            <ListPlus className="h-3.5 w-3.5 text-white" />
                          </button>
                          {addToMenu === t.id && (
                            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-10 z-40 w-52 overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl backdrop-blur-xl">
                              <div className="border-b border-border px-3 py-2 text-[10px] font-bold tracking-widest text-muted-foreground">ADD TO PLAYLIST</div>
                              {playlists.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">No playlists yet.</div>}
                              {playlists.map((p) => (
                                <button key={p.id} onClick={() => addTrackToPlaylist(p.id, t.id)}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary" disabled={p.trackIds.includes(t.id)}>
                                  <span className="truncate">{p.name}</span>
                                  {p.trackIds.includes(t.id) && <span className="text-[10px] text-[var(--aurora-2)]">✓</span>}
                                </button>
                              ))}
                              <button onClick={() => { setAddToMenu(null); createPlaylist(); }} className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-[var(--aurora-2)] hover:bg-secondary">
                                <Plus className="h-3 w-3" /> New playlist
                              </button>
                            </div>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setEditing({ id: t.id, song: t.song, artist: t.artist, album: t.album }); }}
                          className="rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110 hover:bg-[var(--aurora-2)]/80"
                          title="Edit info / assign artist">
                          <Pencil className="h-3.5 w-3.5 text-white" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); if (view.type === "playlist") removeFromPlaylist(view.id, t.id); else deleteTrack(t.id); }}
                          className="rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110 hover:bg-[var(--aurora-1)]/80"
                          title={view.type === "playlist" ? "Remove from playlist" : "Delete track"}>
                          <Trash2 className="h-3.5 w-3.5 text-white" />
                        </button>
                      </div>
                      <div className="absolute bottom-3 right-3 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-aurora text-primary-foreground opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                        {active && playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                      </div>
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
          <div className="flex items-center gap-3 overflow-hidden">
            <img src={display.cover || "https://picsum.photos/seed/empty/200/200"} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-border md:h-16 md:w-16" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-sm font-bold md:text-base">{display.song}</div>
              <div className="truncate text-xs text-muted-foreground">{display.artist}</div>
            </div>
            {current && (
              <button onClick={() => toggleLike(current.id)} className="hidden p-2 md:block">
                <Heart className={`h-4 w-4 transition ${display.liked ? "fill-[var(--aurora-1)] text-[var(--aurora-1)]" : "text-muted-foreground hover:text-foreground"}`} />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 md:gap-2">
              <button onClick={() => setShuffle((s) => !s)} className={`hidden p-2 transition md:block ${shuffle ? "text-[var(--aurora-2)]" : "text-muted-foreground hover:text-foreground"}`}>
                <Shuffle className="h-4 w-4" />
              </button>
              <button onClick={handlePrev} className="rounded-full p-2 text-foreground transition hover:scale-110" title="Previous (Shift+←)">
                <SkipBack className="h-5 w-5" />
              </button>
              <button onClick={() => skipBy(-10)} className="relative rounded-full p-2 text-foreground transition hover:scale-110 hover:text-[var(--aurora-2)]" title="Back 10s (←)">
                <Rewind className="h-5 w-5" />
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold">10</span>
              </button>
              <button onClick={() => setPlaying((p) => !p)} className="bg-aurora shadow-aurora flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground transition hover:scale-105 hover:brightness-110 md:h-14 md:w-14">
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button onClick={() => skipBy(10)} className="relative rounded-full p-2 text-foreground transition hover:scale-110 hover:text-[var(--aurora-2)]" title="Forward 10s (→)">
                <FastForward className="h-5 w-5" />
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold">10</span>
              </button>
              <button onClick={handleNext} className="rounded-full p-2 text-foreground transition hover:scale-110" title="Next (Shift+→)">
                <SkipForward className="h-5 w-5" />
              </button>
              <button onClick={() => setRepeat((r) => !r)} className={`hidden p-2 transition md:block ${repeat ? "text-[var(--aurora-2)]" : "text-muted-foreground hover:text-foreground"}`}>
                <Repeat className="h-4 w-4" />
              </button>
            </div>
            <div className="hidden w-full max-w-md items-center gap-3 md:flex">
              <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{fmt(progress)}</span>
              <div onPointerDown={onSeekPointerDown} className="group relative h-2 flex-1 cursor-pointer touch-none rounded-full bg-secondary">
                <div className="bg-aurora pointer-events-none absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: `${progressPct}%` }} />
                <div className="pointer-events-none absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-lg transition group-hover:opacity-100" style={{ left: `${progressPct}%` }} />
              </div>
              <span className="w-10 text-[10px] tabular-nums text-muted-foreground">{fmt(duration || 0)}</span>
            </div>
          </div>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <button onClick={() => setShowEq((s) => !s)} className={`transition ${showEq ? "text-[var(--aurora-2)]" : "text-muted-foreground hover:text-foreground"}`} title="Equalizer">
              <Sliders className="h-4 w-4" />
            </button>
            {current && (
              <button onClick={downloadCurrent} className="text-muted-foreground hover:text-foreground" title="Download">
                <Download className="h-4 w-4" />
              </button>
            )}
            <button onClick={toggleFullscreen} className="text-muted-foreground hover:text-foreground" title="Fullscreen (F)">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => setMuted((m) => !m)} className="text-muted-foreground hover:text-foreground">
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
              onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
              className="fader w-28" style={{ ["--val" as string]: `${(muted ? 0 : volume) * 100}%` }} />
          </div>

          <div onPointerDown={onSeekPointerDown} className="absolute inset-x-0 bottom-0 h-1.5 cursor-pointer touch-none bg-secondary md:hidden">
            <div className="bg-aurora pointer-events-none h-full" style={{ width: `${progressPct}%` }} />
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
              <div key={t.id} className={`group flex w-full items-center gap-3 rounded-xl p-2 transition hover:bg-secondary ${t.id === currentId ? "bg-secondary/70" : ""}`}>
                <button onClick={() => playTrack(t.id)} className="flex flex-1 items-center gap-3 text-left">
                  <img src={t.cover} alt="" className="h-11 w-11 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${t.id === currentId ? "text-[var(--aurora-2)]" : ""}`}>{t.song}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
                  </div>
                </button>
                <button onClick={() => deleteTrack(t.id)} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:text-[var(--aurora-1)] group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      <audio ref={audioRef} src={!isVideo ? current?.src : undefined} crossOrigin="anonymous"
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => (repeat ? (audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play())) : handleNext())} />

      {/* Equalizer panel */}
      {showEq && (
        <div className="absolute bottom-28 right-4 z-40 w-[340px] rounded-2xl border border-border bg-panel/95 p-5 shadow-2xl backdrop-blur-xl md:bottom-32 md:right-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-display text-lg">Equalizer</div>
              <div className="text-[10px] text-muted-foreground">Applies to all output — speakers, headphones, Bluetooth</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                <input type="checkbox" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--aurora-2)]" />
                On
              </label>
              <button onClick={() => setShowEq(false)} className="rounded-full p-1 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Object.keys(EQ_PRESETS).map((name) => (
              <button key={name} onClick={() => { setEqGains(EQ_PRESETS[name]); setEqEnabled(true); }}
                className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-semibold hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]">
                {name}
              </button>
            ))}
          </div>
          <div className="flex items-end justify-between gap-2">
            {EQ_BANDS.map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] tabular-nums text-muted-foreground">{eqGains[i] > 0 ? "+" : ""}{eqGains[i]}dB</span>
                <input type="range" min={-12} max={12} step={1} value={eqGains[i]}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setEqGains((g) => g.map((x, idx) => (idx === i ? v : x)));
                    setEqEnabled(true);
                  }}
                  className="eq-slider" />
                <span className="text-[9px] font-bold text-muted-foreground">{EQ_LABELS[i]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
            Tip: Bluetooth & wireless headphones use the OS audio output, so this EQ shapes their sound too. Pair your device from system settings.
          </p>
        </div>
      )}

      <style>{`
        @keyframes eq-0 { from { height: 20%; } to { height: 90%; } }
        @keyframes eq-1 { from { height: 60%; } to { height: 25%; } }
        @keyframes eq-2 { from { height: 35%; } to { height: 85%; } }
        @keyframes eq-3 { from { height: 75%; } to { height: 30%; } }
        .eq-slider {
          writing-mode: vertical-lr;
          -webkit-appearance: slider-vertical;
          appearance: slider-vertical;
          width: 18px;
          height: 120px;
          accent-color: var(--aurora-2);
        }
      `}</style>
    </div>
  );
}
