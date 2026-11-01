import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Pencil, Timer, Save, Loader2, Undo2, Music2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseLyrics, activeLineIndex, toLrc, fetchLrclib, isSynced, type LyricLine } from "@/lib/lyrics";

type Props = {
  track: { id: string; song: string; artist: string; duration: number | null };
  time: number;
  onSeek: (t: number) => void;
  onClose: () => void;
};

export function LyricsPanel({ track, time, onSeek, onClose }: Props) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "edit" | "sync">("view");
  const [draft, setDraft] = useState("");
  const [syncLines, setSyncLines] = useState<LyricLine[]>([]);
  const [syncIdx, setSyncIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;

  const lines = useMemo(() => parseLyrics(raw), [raw]);
  const synced = isSynced(lines);
  const active = synced ? activeLineIndex(lines, time) : -1;

  const save = async (text: string, isSync: boolean) => {
    setRaw(text);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("track_lyrics").upsert({ track_id: track.id, user_id: u.user.id, lyrics: text, synced: isSync, updated_at: new Date().toISOString() });
    if (error) toast.error("Couldn't save lyrics"); else toast.success("Lyrics saved");
  };

  const search = async (persist: boolean) => {
    setLoading(true);
    const got = await fetchLrclib(track.song, track.artist, track.duration);
    setLoading(false);
    if (!got) { if (persist) toast("No lyrics found — paste them in with Edit"); return false; }
    if (persist) await save(got.text, got.synced); else setRaw(got.text);
    return true;
  };

  useEffect(() => {
    let cancel = false;
    setMode("view"); setRaw(""); setLoading(true);
    (async () => {
      const { data } = await supabase.from("track_lyrics").select("lyrics").eq("track_id", track.id).maybeSingle();
      if (cancel) return;
      if (data?.lyrics) { setRaw(data.lyrics); setLoading(false); return; }
      const got = await fetchLrclib(track.song, track.artist, track.duration);
      if (cancel) return;
      setLoading(false);
      if (got) await save(got.text, got.synced);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  // Keep the active line centered
  useEffect(() => {
    if (active < 0 || mode !== "view") return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, mode]);

  // Tap-to-sync
  const startSync = () => {
    const src = (mode === "edit" ? draft : raw) || "";
    const plain = parseLyrics(src).map((l) => ({ time: null, text: l.text })).filter((l) => l.text);
    if (!plain.length) { toast("Add lyrics first"); return; }
    setSyncLines(plain); setSyncIdx(0); setMode("sync");
    onSeek(0);
  };
  const tap = () => {
    setSyncLines((ls) => {
      if (syncIdx >= ls.length) return ls;
      const n = [...ls]; n[syncIdx] = { ...n[syncIdx], time: timeRef.current }; return n;
    });
    setSyncIdx((i) => i + 1);
  };
  const undoTap = () => {
    if (syncIdx === 0) return;
    const prev = syncLines[syncIdx - 1];
    setSyncLines((ls) => { const n = [...ls]; n[syncIdx - 1] = { ...n[syncIdx - 1], time: null }; return n; });
    setSyncIdx((i) => i - 1);
    if (prev.time != null) onSeek(Math.max(0, prev.time - 2));
  };
  useEffect(() => {
    if (mode !== "sync") return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); tap(); }
      if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); undoTap(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });
  useEffect(() => {
    if (mode !== "sync") return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${syncIdx}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [syncIdx, mode]);
  const finishSync = async () => {
    await save(toLrc(syncLines.filter((l) => l.time != null)), true);
    setMode("view");
  };

  return (
    <div data-testid="lyrics-panel" className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-2xl">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Music2 className="h-5 w-5 text-[var(--aurora-2)]" />
        <div className="min-w-0 flex-1">
          <div dir="auto" className="truncate font-semibold">{track.song}</div>
          <div dir="auto" className="truncate text-xs text-muted-foreground">{track.artist}{synced ? " · synced" : raw ? " · not synced" : ""}</div>
        </div>
        {mode === "view" && <>
          <button onClick={() => search(true)} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:text-foreground text-muted-foreground"><Search className="h-3.5 w-3.5" /> Find</button>
          <button data-testid="lyrics-edit" onClick={() => { setDraft(synced ? toLrc(lines) : raw); setMode("edit"); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /> Edit</button>
          <button onClick={startSync} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"><Timer className="h-3.5 w-3.5" /> Sync</button>
        </>}
        <button data-testid="lyrics-close" onClick={onClose} className="rounded-full p-2 hover:bg-secondary" aria-label="Close lyrics"><X className="h-5 w-5" /></button>
      </div>

      {mode === "edit" ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 p-5">
          <p className="text-xs text-muted-foreground">Paste lyrics in Hebrew, English or both — one line per row. Then tap “Sync” to time them to the music.</p>
          <textarea data-testid="lyrics-textarea" dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)}
            className="flex-1 resize-none rounded-2xl border border-border bg-secondary/40 p-4 text-base leading-relaxed outline-none focus:border-[var(--aurora-2)]" placeholder="שורה ראשונה&#10;First line…" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setMode("view")} className="rounded-full border border-border px-4 py-2 text-sm">Cancel</button>
            <button onClick={startSync} className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><Timer className="h-4 w-4" /> Sync</button>
            <button data-testid="lyrics-save" onClick={async () => { await save(draft, isSynced(parseLyrics(draft))); setMode("view"); }} className="bg-aurora flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" /> Save</button>
          </div>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-[35vh] text-center">
          {mode === "sync" ? (
            syncLines.map((l, i) => (
              <p key={i} data-line={i} dir="auto"
                className={`mx-auto my-4 max-w-3xl text-2xl font-bold transition-all duration-300 md:text-4xl ${i === syncIdx ? "scale-105 text-foreground" : l.time != null ? "text-[var(--aurora-2)]/70" : "text-muted-foreground/40"}`}>{l.text}</p>
            ))
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Looking for lyrics…</div>
          ) : !lines.length ? (
            <div className="space-y-3 text-muted-foreground">
              <p>No lyrics found for this song.</p>
              <button onClick={() => { setDraft(""); setMode("edit"); }} className="bg-aurora rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground">Add lyrics</button>
            </div>
          ) : (
            lines.map((l, i) => (
              <p key={i} data-line={i} dir="auto" onClick={() => l.time != null && onSeek(l.time)}
                className={`mx-auto my-4 max-w-3xl font-bold transition-all duration-500 ${synced ? "cursor-pointer text-2xl md:text-4xl" : "text-xl md:text-2xl text-foreground/80"} ${synced ? (i === active ? "scale-105 text-foreground drop-shadow-[0_0_18px_var(--aurora-2)]" : i < active ? "text-muted-foreground/50" : "text-muted-foreground/35 blur-[0.5px] hover:text-muted-foreground") : ""}`}>
                {l.text || "♪"}
              </p>
            ))
          )}
        </div>
      )}

      {mode === "sync" && (
        <div className="flex items-center justify-center gap-3 border-t border-border p-4">
          <button onClick={undoTap} className="flex items-center gap-1 rounded-full border border-border px-4 py-3 text-sm"><Undo2 className="h-4 w-4" /> Undo</button>
          <button data-testid="lyrics-tap" onClick={tap} disabled={syncIdx >= syncLines.length}
            className="bg-aurora min-w-48 rounded-full px-8 py-4 text-lg font-bold text-primary-foreground disabled:opacity-40">
            {syncIdx >= syncLines.length ? "All lines timed" : "TAP (Space)"}
          </button>
          <button onClick={finishSync} className="flex items-center gap-1 rounded-full border border-border px-4 py-3 text-sm"><Save className="h-4 w-4" /> Done</button>
          <button onClick={() => setMode("view")} className="rounded-full px-3 py-3 text-sm text-muted-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}
