import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Loader2 } from "lucide-react";
import { generateMoodPlaylist } from "@/lib/mood-playlist.functions";

const IDEAS = ["Late-night drive", "Gym hype", "Rainy Sunday chill", "Focus / deep work", "Shabbat dinner", "Feel-good party"];

export function MoodPlaylistDialog({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, trackIds: string[]) => Promise<void>;
}) {
  const gen = useServerFn(generateMoodPlaylist);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return null;

  const run = async () => {
    if (prompt.trim().length < 2 || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await gen({ data: { prompt: prompt.trim(), count } });
      if (!r.ok) { setErr(r.error); return; }
      await onCreate(r.name, r.trackIds);
      setPrompt(""); onClose();
    } catch {
      setErr("Couldn't create the playlist right now.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div data-testid="mood-dialog" onClick={(e) => e.stopPropagation()} className="glass w-full max-w-lg rounded-3xl border border-border p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-2xl"><Sparkles className="h-5 w-5 text-[var(--aurora-2)]" /> Mood Mix</h3>
            <p className="mt-1 text-xs text-muted-foreground">Describe a mood or activity — AI builds a playlist from your songs.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <textarea
          data-testid="mood-input" autoFocus value={prompt} maxLength={300} rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder="e.g. upbeat songs for a morning run"
          className="w-full resize-none rounded-2xl border border-border bg-secondary/60 p-3 text-sm outline-none focus:border-[var(--aurora-2)]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {IDEAS.map((i) => (
            <button key={i} onClick={() => setPrompt(i)} className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] hover:border-[var(--aurora-2)]/50 hover:text-[var(--aurora-2)]">{i}</button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          Songs: <span className="w-6 font-semibold text-foreground">{count}</span>
          <input type="range" min={5} max={50} value={count} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-[var(--aurora-2)]" />
        </label>
        {err && <p data-testid="mood-error" className="mt-3 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">{err}</p>}
        <button data-testid="mood-generate" onClick={run} disabled={busy || prompt.trim().length < 2}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-aurora px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Curating your mix…</> : <><Sparkles className="h-4 w-4" /> Create playlist</>}
        </button>
      </div>
    </div>
  );
}
