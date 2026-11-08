import { useEffect, useMemo, useState } from "react";
import { Mic2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseLyrics, activeLineIndex, isSynced } from "@/lib/lyrics";

/** Shows the line being sung right now; tap to open full lyrics. */
export function LiveLyricLine({ trackId, time, reloadKey, onOpen }: { trackId: string; time: number; reloadKey: unknown; onOpen: () => void }) {
  const [raw, setRaw] = useState("");
  useEffect(() => {
    let cancel = false;
    setRaw("");
    supabase.from("track_lyrics").select("lyrics").eq("track_id", trackId).maybeSingle()
      .then(({ data }) => { if (!cancel) setRaw(data?.lyrics ?? ""); });
    return () => { cancel = true; };
  }, [trackId, reloadKey]);
  const lines = useMemo(() => parseLyrics(raw), [raw]);
  const synced = isSynced(lines);
  const idx = synced ? activeLineIndex(lines, time) : -1;
  const text = !lines.length ? null : synced ? (idx >= 0 ? lines[idx].text || "♪" : "♪ …") : lines[0].text;
  return (
    <button data-testid="live-lyric" onClick={onOpen} dir="auto"
      className="mt-2 flex max-w-full items-center gap-2 truncate rounded-full border border-border bg-secondary/40 px-3 py-1 text-left text-sm text-foreground/90 transition hover:border-[var(--aurora-2)]/50">
      <Mic2 className="h-3.5 w-3.5 shrink-0 text-[var(--aurora-2)]" />
      <span className="truncate">{text ?? "Show lyrics"}</span>
    </button>
  );
}
