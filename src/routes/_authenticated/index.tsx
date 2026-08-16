import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Heart, ListMusic, Flame, Upload, Search, SkipBack, Play, Pause, SkipForward,
  Shuffle, Repeat, Volume2, VolumeX, Music2, Clock, Disc3, X,
  Trash2, Plus, ListPlus, LogOut, Maximize2, Minimize2, Download, Sliders,
  Rewind, FastForward, Pencil, User as UserIcon, MoreVertical,
  CheckSquare, Square, CheckCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UploadPanel } from "@/components/UploadPanel";
import { useUploadManager } from "@/lib/upload-manager";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "LUMEN — Your Library" },
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
const SELECTION_KEY = "dovid-selection-v1";
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMenu, setBulkMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(120);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEq, setShowEq] = useState(false);
  const EQ_BANDS = [60, 230, 910, 3600, 14000];
  const EQ_LABELS = ["60Hz", "230Hz", "910Hz", "3.6k", "14k"];
  const EQ_MIN = -24;
  const EQ_MAX = 24;
  const EQ_PRESETS: Record<string, number[]> = {
    Flat: [0, 0, 0, 0, 0],
    "Bass Boost": [8, 5, 1, 0, 0],
    "Bass MAX 💥": [24, 18, 4, 0, 0],
    Vocal: [-2, -1, 4, 5, 2],
    Treble: [0, 0, 1, 5, 8],
    Electronic: [6, 2, -2, 3, 6],
    Acoustic: [4, 3, 1, 2, 3],
  };
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0]);
  const [editing, setEditing] = useState<EditingTrack>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [artistAvatars, setArtistAvatars] = useState<Record<string, string>>({});
  const artistAvatarFileRef = useRef<HTMLInputElement>(null);
  const [editingArtistAvatar, setEditingArtistAvatar] = useState<string | null>(null);

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

      const [{ data: tRows }, { data: pRows }, { data: ptRows }, { data: aRows }] = await Promise.all([
        supabase.from("tracks").select("*").order("created_at", { ascending: false }),
        supabase.from("playlists").select("*").order("created_at", { ascending: true }),
        supabase.from("playlist_tracks").select("playlist_id, track_id, position").order("position", { ascending: true }),
        supabase.from("artist_profiles").select("name, avatar_url"),
      ]);

      const avMap: Record<string, string> = {};
      await Promise.all((aRows ?? []).map(async (r: any) => {
        if (!r.avatar_url) return;
        // avatar_url is a storage path under media bucket
        const { data } = await supabase.storage.from("media").createSignedUrl(r.avatar_url, SIGNED_URL_TTL);
        if (data?.signedUrl) avMap[r.name] = data.signedUrl;
      }));
      setArtistAvatars(avMap);

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

  const tracksRef = useRef<Track[]>([]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p.ids)) setSelected(p.ids); if (p.mode) setSelectMode(true); }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify({ ids: selected, mode: selectMode })); } catch {}
  }, [selected, selectMode]);

  const current = tracks.find((t) => t.id === currentId) ?? null;
  const display = current ?? {
    id: "_empty", song: "Nothing playing", artist: "Upload a song or music video to start",
    album: "", cover: "", src: "", storage_path: null, kind: "audio" as const, liked: false,
    duration: null, plays: 0,
  };
  const isVideo = current?.kind === "video";
  const activePlaylist = view.type === "playlist" ? playlists.find((p) => p.id === view.id) : null;

  const splitArtists = (s: string): string[] => {
    const parts = (s || "Unknown").split(/\s*(?:,|;|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*/i)
      .map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : ["Unknown"];
  };

  const artistGroups = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t) => splitArtists(t.artist).forEach((n) => map.set(n, (map.get(n) ?? 0) + 1)));
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
      list = list.filter((t) => splitArtists(t.artist).includes(view.name));
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

  const upload = useUploadManager({
    userId: user?.id ?? null,
    getExisting: useCallback(() => tracksRef.current.map((t) => ({ id: t.id, song: t.song, storage_path: t.storage_path })), []),
    onAdded: useCallback((t: any) => {
      setTracks((prev) => [t as Track, ...prev]);
    }, []),
    onReplaced: useCallback((trackId: string, src: string, storagePath: string) => {
      setTracks((prev) => prev.map((x) => (x.id === trackId ? { ...x, src, storage_path: storagePath } : x)));
    }, []),
  });
  const uploading = upload.items.some((i) => i.status === "uploading" || i.status === "queued");

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    upload.addFiles(files);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addManyToPlaylist = async (playlistId: string, trackIds: string[]) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const fresh = trackIds.filter((id) => !pl.trackIds.includes(id));
    if (fresh.length === 0) { setBulkMenu(false); return; }
    setPlaylists((pls) => pls.map((p) => (p.id === playlistId ? { ...p, trackIds: [...p.trackIds, ...fresh] } : p)));
    setBulkMenu(false);
    await supabase.from("playlist_tracks").insert(
      fresh.map((track_id, i) => ({ playlist_id: playlistId, track_id, position: pl.trackIds.length + i })),
    );
  };

  const downloadTracks = async (ids: string[]) => {
    for (const id of ids) {
      const t = tracks.find((x) => x.id === id);
      if (!t) continue;
      await downloadTrack(t);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const deleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} track${ids.length !== 1 ? "s" : ""} from your library?`)) return;
    const paths = tracks.filter((t) => ids.includes(t.id) && t.storage_path).map((t) => t.storage_path!);
    setTracks((ts) => ts.filter((x) => !ids.includes(x.id)));
    setPlaylists((pls) => pls.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => !ids.includes(x)) })));
    setSelected([]);
    if (currentId && ids.includes(currentId)) { setCurrentId(null); setPlaying(false); }
    await supabase.from("tracks").delete().in("id", ids);
    if (paths.length) await supabase.storage.from("media").remove(paths);
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

  const removeTrackFromArtist = async (trackId: string, artistName: string) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    const remaining = splitArtists(t.artist).filter((a) => a !== artistName);
    const next = remaining.length ? remaining.join(", ") : "Unknown";
    setTracks((ts) => ts.map((x) => (x.id === trackId ? { ...x, artist: next } : x)));
    await supabase.from("tracks").update({ artist: next }).eq("id", trackId);
  };

  const renameArtist = async (oldName: string) => {
    if (!user) return;
    const newName = prompt(`Rename "${oldName}" to:`, oldName)?.trim();
    if (!newName || newName === oldName) return;
    const affected = tracks.filter((t) => splitArtists(t.artist).includes(oldName));
    const updates = affected.map((t) => {
      const parts = splitArtists(t.artist).map((a) => (a === oldName ? newName : a));
      const dedup = [...new Set(parts)];
      return { id: t.id, artist: dedup.join(", ") };
    });
    setTracks((ts) => ts.map((x) => {
      const u = updates.find((y) => y.id === x.id);
      return u ? { ...x, artist: u.artist } : x;
    }));
    await Promise.all(updates.map((u) => supabase.from("tracks").update({ artist: u.artist }).eq("id", u.id)));
    // move avatar mapping locally
    setArtistAvatars((m) => {
      if (!m[oldName]) return m;
      const { [oldName]: av, ...rest } = m;
      return { ...rest, [newName]: av };
    });
    await supabase.from("artist_profiles").update({ name: newName, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("name", oldName);
    if (view.type === "artist" && view.name === oldName) setView({ type: "artist", name: newName });
  };

  const triggerArtistAvatarUpload = (artistName: string) => {
    setEditingArtistAvatar(artistName);
    artistAvatarFileRef.current?.click();
  };

  const handleArtistAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const name = editingArtistAvatar;
    e.target.value = "";
    if (!file || !name || !user) return;
    if (!file.type.startsWith("image/")) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safe = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "artist";
    const path = `${user.id}/artists/${safe}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return;
    await supabase.from("artist_profiles").upsert(
      { user_id: user.id, name, avatar_url: path, updated_at: new Date().toISOString() },
      { onConflict: "user_id,name" },
    );
    const { data: signed } = await supabase.storage.from("media").createSignedUrl(path, SIGNED_URL_TTL);
    if (signed?.signedUrl) setArtistAvatars((m) => ({ ...m, [name]: signed.signedUrl }));
    setEditingArtistAvatar(null);
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

  const downloadTrack = async (t: Track) => {
    try {
      let url = t.src;
      const filename = `${t.song}.${t.kind === "video" ? "mp4" : "mp3"}`;
      if (t.storage_path) {
        const { data } = await supabase.storage.from("media").createSignedUrl(
          t.storage_path, 60 * 10, { download: filename }
        );
        if (data?.signedUrl) url = data.signedUrl;
      }
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.error(e); }
  };

  const downloadCurrent = async () => {
    if (current) await downloadTrack(current);
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
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (editing) return;
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
  }, [currentId, tracks, shuffle, progress, isVideo, duration, editing]);

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
            <div className="font-display text-aurora text-2xl leading-none">LUMEN</div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">PLAY IN LIGHT</div>
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
                  <div className={isFullscreen
                      ? "group/vid relative h-full w-full"
                      : "group/vid relative aspect-video w-[min(92vw,720px)] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[var(--aurora-2)]/30 md:w-[640px] lg:w-[760px]"}
                    onClick={(e) => { if ((e.target as HTMLElement).tagName === "VIDEO") setPlaying((p) => !p); }}>
                    <video ref={videoRef} src={current.src} playsInline crossOrigin="anonymous"
                      onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                      onEnded={() => (repeat ? (videoRef.current && (videoRef.current.currentTime = 0, videoRef.current.play())) : handleNext())}
                      className={isFullscreen ? "h-full w-full object-contain" : "h-full w-full object-cover"} />
                    {/* YouTube-style hover overlay */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 transition-opacity duration-300 group-hover/vid:opacity-100" />
                    <button onClick={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}
                      className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-black/80 group-hover/vid:opacity-100 md:h-20 md:w-20"
                      title={playing ? "Pause" : "Play"}>
                      {playing ? <Pause className="h-7 w-7 md:h-9 md:w-9" /> : <Play className="ml-1 h-7 w-7 md:ml-1.5 md:h-9 md:w-9" />}
                    </button>
                    <div className="absolute inset-x-0 bottom-0 px-3 pb-3 opacity-0 transition-opacity duration-300 group-hover/vid:opacity-100">
                      <div className="mb-1 flex items-center justify-between text-[11px] tabular-nums text-white/90">
                        <span>{fmt(progress)}</span>
                        <span>{fmt(duration || 0)}</span>
                      </div>
                      <div onPointerDown={onSeekPointerDown} onClick={(e) => e.stopPropagation()}
                        className="group/bar relative h-1 cursor-pointer touch-none rounded-full bg-white/25 transition-[height] hover:h-1.5">
                        <div className="bg-aurora pointer-events-none absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%` }} />
                        <div className="pointer-events-none absolute -top-1.5 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-lg opacity-0 transition group-hover/bar:opacity-100" style={{ left: `${progressPct}%` }} />
                      </div>
                    </div>
                  </div>
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

          <UploadPanel
            items={upload.items}
            onCancel={upload.cancel}
            onCancelAll={upload.cancelAll}
            onResolveDuplicate={upload.resolveDuplicate}
            onClearFinished={upload.clearFinished}
          />

          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl md:text-4xl">{headerTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{filtered.length} tracks</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view.type !== "artists" && (
                <button
                  onClick={() => { setSelectMode((s) => !s); setSelected([]); setBulkMenu(false); }}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    selectMode ? "border-[var(--aurora-2)] bg-[var(--aurora-2)]/10 text-[var(--aurora-2)]" : "border-border bg-secondary/60 hover:border-[var(--aurora-2)]/40"
                  }`}>
                  <CheckSquare className="h-3.5 w-3.5" /> {selectMode ? "Done" : "Select"}
                </button>
              )}
              {view.type === "library" && (
                <button onClick={createPlaylist} className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2 text-xs font-semibold hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]">
                  <Plus className="h-3.5 w-3.5" /> New Playlist
                </button>
              )}
            </div>
          </div>

          {selectMode && view.type !== "artists" && (
            <div className="sticky top-0 z-30 mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--aurora-2)]/30 bg-panel/90 px-4 py-3 backdrop-blur-xl">
              <span className="text-xs font-bold">{selected.length} selected</span>
              <button onClick={() => setSelected(filtered.map((t) => t.id))} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:text-[var(--aurora-2)]">
                <CheckCheck className="h-3.5 w-3.5" /> Select all
              </button>
              <button onClick={() => setSelected([])} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                Clear
              </button>
              <div className="relative">
                <button onClick={() => setBulkMenu((b) => !b)} disabled={selected.length === 0}
                  className="bg-aurora flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-40">
                  <ListPlus className="h-3.5 w-3.5" /> Add to playlist
                </button>
                {bulkMenu && (
                  <div className="absolute left-0 top-10 z-40 w-56 overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl backdrop-blur-xl">
                    <div className="border-b border-border px-3 py-2 text-[10px] font-bold tracking-widest text-muted-foreground">
                      ADD {selected.length} TRACK{selected.length !== 1 ? "S" : ""} TO
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {playlists.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">No playlists yet.</div>}
                      {playlists.map((p) => (
                        <button key={p.id} onClick={() => addManyToPlaylist(p.id, selected)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary">
                          <span className="truncate">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground">{p.trackIds.length}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setBulkMenu(false); createPlaylist(); }} className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-[var(--aurora-2)] hover:bg-secondary">
                      <Plus className="h-3 w-3" /> New playlist
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => downloadTracks(selected)} disabled={selected.length === 0}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:text-[var(--aurora-2)] disabled:opacity-40">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              {view.type === "playlist" ? (
                <button onClick={() => { selected.forEach((id) => removeFromPlaylist((view as any).id, id)); setSelected([]); }} disabled={selected.length === 0}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:text-[var(--aurora-1)] disabled:opacity-40">
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              ) : (
                <button onClick={() => deleteMany(selected)} disabled={selected.length === 0}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:text-[var(--aurora-1)] disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          )}


          <input ref={artistAvatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleArtistAvatarFile} />

          {view.type === "artist" && (
            <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
              <div className="relative">
                {artistAvatars[view.name] ? (
                  <img src={artistAvatars[view.name]} alt={view.name} className="h-20 w-20 rounded-full object-cover ring-2 ring-[var(--aurora-2)]/40" />
                ) : (
                  <div className="bg-aurora flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-primary-foreground">
                    {view.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <button onClick={() => triggerArtistAvatarUpload(view.name)}
                  className="absolute -bottom-1 -right-1 rounded-full bg-[var(--aurora-2)] p-1.5 text-primary-foreground shadow-lg transition hover:scale-110"
                  title="Change artist avatar">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold tracking-[0.25em] text-muted-foreground">ARTIST</div>
                <div className="flex items-center gap-2">
                  <div className="truncate font-display text-3xl">{view.name}</div>
                  <button onClick={() => renameArtist(view.name)}
                    className="rounded-full border border-border bg-secondary/60 p-1.5 text-muted-foreground transition hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]"
                    title="Rename artist">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">{filtered.length} track{filtered.length !== 1 ? "s" : ""} · separate multiple artists with commas when editing a song</div>
              </div>
            </div>
          )}

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
                  const sample = tracks.find((t) => splitArtists(t.artist).includes(name));
                  const avatar = artistAvatars[name];
                  return (
                    <div key={name} className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background text-left transition hover:-translate-y-1.5 hover:border-[var(--aurora-1)]/40 hover:shadow-[0_20px_50px_-15px_rgba(244,114,182,0.35)]">
                      <button onClick={() => setView({ type: "artist", name })} className="block w-full text-left">
                        <div className="relative aspect-square overflow-hidden">
                          <img src={avatar || sample?.cover || "https://picsum.photos/seed/artist/600/600"} alt={name}
                            className={`h-full w-full object-cover transition duration-700 group-hover:scale-110 ${avatar ? "" : "scale-110 blur-[1px] brightness-75 group-hover:scale-125"}`} />
                          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4">
                            {!avatar && (
                              <div className="bg-aurora -ml-1 mb-1 flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground shadow-xl">
                                <UserIcon className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="truncate text-base font-bold">{name}</div>
                          <div className="text-xs text-muted-foreground">{count} track{count !== 1 ? "s" : ""}</div>
                        </div>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); triggerArtistAvatarUpload(name); }}
                        className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white opacity-0 backdrop-blur transition hover:bg-[var(--aurora-2)]/80 group-hover:opacity-100"
                        title="Set artist avatar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
                        {view.type === "artist" && (
                          <button onClick={(e) => { e.stopPropagation(); removeTrackFromArtist(t.id, view.name); }}
                            className="rounded-full bg-black/60 p-2 backdrop-blur transition hover:scale-110 hover:bg-[var(--aurora-2)]/80"
                            title="Remove from this artist">
                            <UserIcon className="h-3.5 w-3.5 text-white" />
                          </button>
                        )}
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

      {/* Edit track dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm md:items-center" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-panel/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="font-display text-xl">Edit track</div>
              <button onClick={() => setEditing(null)} className="rounded-full p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <div className="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground">SONG NAME</div>
                <input value={editing.song} onChange={(e) => setEditing({ ...editing, song: e.target.value })}
                  className="w-full rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm focus:border-[var(--aurora-2)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--aurora-2)]/20" />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-widest text-muted-foreground">
                  <span>ARTIST</span>
                  {artistGroups.length > 0 && <span className="text-[9px] font-normal normal-case tracking-normal text-muted-foreground">Separate with commas · tap chip to add</span>}
                </div>
                <input value={editing.artist} onChange={(e) => setEditing({ ...editing, artist: e.target.value })} list="artist-list"
                  className="w-full rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm focus:border-[var(--aurora-2)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--aurora-2)]/20" />
                <datalist id="artist-list">
                  {artistGroups.map(([name]) => <option key={name} value={name} />)}
                </datalist>
                {artistGroups.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {artistGroups.slice(0, 12).map(([name]) => (
                      <button key={name} type="button" onClick={() => {
                        const existing = editing.artist.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
                        if (existing.includes(name)) return;
                        const next = [...existing, name].join(", ");
                        setEditing({ ...editing, artist: next });
                      }}
                        className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-semibold hover:border-[var(--aurora-1)]/40 hover:text-[var(--aurora-1)]">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="block">
                <div className="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground">ALBUM</div>
                <input value={editing.album} onChange={(e) => setEditing({ ...editing, album: e.target.value })}
                  className="w-full rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm focus:border-[var(--aurora-2)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--aurora-2)]/20" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 p-4">
              <button onClick={() => setEditing(null)} className="rounded-full border border-border bg-secondary/60 px-4 py-2 text-xs font-semibold hover:bg-secondary">Cancel</button>
              <button onClick={saveTrackEdits} className="bg-aurora shadow-aurora rounded-full px-5 py-2 text-xs font-bold text-primary-foreground hover:brightness-110">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile control sheet (touch-first controls for shuffle/repeat/EQ/fullscreen/download) */}
      <button onClick={() => setShowMobileMenu(true)} className="absolute bottom-28 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-panel/90 shadow-xl backdrop-blur-xl md:hidden" title="More">
        <MoreVertical className="h-5 w-5" />
      </button>
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setShowMobileMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl border-t border-border bg-panel/95 p-5 pb-8 shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            <div className="grid grid-cols-4 gap-3">
              <button onClick={() => { setShuffle((s) => !s); }} className={`flex flex-col items-center gap-1 rounded-2xl border border-border p-3 ${shuffle ? "border-[var(--aurora-2)]/50 text-[var(--aurora-2)]" : ""}`}>
                <Shuffle className="h-5 w-5" /><span className="text-[10px] font-semibold">Shuffle</span>
              </button>
              <button onClick={() => { setRepeat((r) => !r); }} className={`flex flex-col items-center gap-1 rounded-2xl border border-border p-3 ${repeat ? "border-[var(--aurora-2)]/50 text-[var(--aurora-2)]" : ""}`}>
                <Repeat className="h-5 w-5" /><span className="text-[10px] font-semibold">Repeat</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); setShowEq(true); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3">
                <Sliders className="h-5 w-5" /><span className="text-[10px] font-semibold">EQ</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); toggleFullscreen(); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3">
                <Maximize2 className="h-5 w-5" /><span className="text-[10px] font-semibold">Full</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); if (current) downloadCurrent(); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3" disabled={!current}>
                <Download className="h-5 w-5" /><span className="text-[10px] font-semibold">Download</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); setShowQueue(true); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3">
                <ListMusic className="h-5 w-5" /><span className="text-[10px] font-semibold">Queue</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); if (current) setEditing({ id: current.id, song: current.song, artist: current.artist, album: current.album }); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3" disabled={!current}>
                <Pencil className="h-5 w-5" /><span className="text-[10px] font-semibold">Edit</span>
              </button>
              <button onClick={() => { setShowMobileMenu(false); setMuted((m) => !m); }} className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3">
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}<span className="text-[10px] font-semibold">{muted ? "Unmute" : "Mute"}</span>
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 px-1">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
                className="flex-1 accent-[var(--aurora-2)]" />
            </div>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">Swipe ← → on the cover to skip tracks · ↑↓ to skip 10s</p>
          </div>
        </div>
      )}

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
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.keys(EQ_PRESETS).map((name) => (
              <button key={name} onClick={() => { setEqGains(EQ_PRESETS[name]); setEqEnabled(true); }}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${name === "Bass MAX 💥" ? "border-[var(--aurora-1)]/50 bg-[var(--aurora-1)]/10 text-[var(--aurora-1)] hover:bg-[var(--aurora-1)]/20" : "border-border bg-secondary/60 hover:border-[var(--aurora-2)]/40 hover:text-[var(--aurora-2)]"}`}>
                {name}
              </button>
            ))}
          </div>
          <div className="mb-3 rounded-xl border border-[var(--aurora-1)]/20 bg-[var(--aurora-1)]/5 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[var(--aurora-1)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--aurora-1)]" />
              BASS MAX PRESET VALUES
            </div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {EQ_PRESETS["Bass MAX 💥"].map((db, i) => (
                <div key={i}>
                  <div className="text-[10px] font-bold tabular-nums text-foreground">{db > 0 ? "+" : ""}{db}dB</div>
                  <div className="text-[9px] text-muted-foreground">{EQ_LABELS[i]}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            {EQ_BANDS.map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] tabular-nums text-muted-foreground">{eqGains[i] > 0 ? "+" : ""}{eqGains[i]}dB</span>
                <input type="range" min={EQ_MIN} max={EQ_MAX} step={1} value={eqGains[i]}
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
