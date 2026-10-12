import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Loader2, Zap } from "lucide-react";
import { generateMoodPlaylist, getAiMixQuota } from "@/lib/mood-playlist.functions";
import { buildSmartPlaylist, type SmartTrack } from "@/lib/smart-playlist";

const IDEAS = ["Late-night drive", "Gym hype", "Rainy Sunday chill", "Focus / deep work", "Shabbat dinner", "Feel-good party"];

export function MoodPlaylistDialog({
  open, onClose, onCreate, tracks,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, trackIds: string[]) => Promise<void>;
  tracks: SmartTrack[];
}) {
  const gen = useServerFn(generateMoodPlaylist);
  const quotaFn = useServerFn(getAiMixQuota);
  const [mode, setMode] = useState<"free" | "ai">("free");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [offerFree, setOfferFree] = useState(false);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    quotaFn().then((q) => setQuota(q)).catch(() => {});
  }, [open, quotaFn]);

  if (!open) return null;

  const runFree = async () => {
    if (tracks.length === 0) { setErr("Your library is empty — upload some songs first."); return; }
    setBusy(true); setErr(null); setOfferFree(false);
    try {
      const r = buildSmartPlaylist(prompt, tracks, count);
      await onCreate(r.name, r.trackIds);
      setPrompt(""); onClose();
    } catch { setErr("Couldn't create the playlist."); } finally { setBusy(false); }
  };

  const run = async () => {
    if (prompt.trim().length < 2 || busy) return;
    if (mode === "free") return runFree();
    setBusy(true); setErr(null); setOfferFree(false);
    try {
      const r = await gen({ data: { prompt: prompt.trim(), count } });
      if (!r.ok) {
        setErr(r.error); setOfferFree(true);
        if (r.remaining !== undefined && quota) setQuota({ ...quota, remaining: r.remaining });
        return;
      }
      if (quota) setQuota({ ...quota, remaining: r.remaining });
      await onCreate(r.name, r.trackIds);
      setPrompt(""); onClose();
    } catch {
      setErr("Couldn't create the playlist right now."); setOfferFree(true);
    } finally { setBusy(false); }
  };

  const aiOut = quota?.remaining === 0;
  const tab = (m: "free" | "ai", active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition ${active ? "bg-aurora text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div data-testid="mood-dialog" onClick={(e) => e.stopPropagation()} className="glass w-full max-w-lg rounded-3xl border border-border p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-2xl"><Sparkles className="h-5 w-5 text-[var(--aurora-2)]" /> Mood Mix</h3>
            <p className="mt-1 text-xs text-muted-foreground">Describe a mood or activity — get a playlist from your songs.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-4 flex gap-1 rounded-full border border-border bg-secondary/40 p-1">
          <button data-testid="mood-mode-free" onClick={() => { setMode("free"); setErr(null); }} className={tab("free", mode === "free")}>
            <Zap className="h-3.5 w-3.5" /> Free · Unlimited
          </button>
          <button data-testid="mood-mode-ai" onClick={() => { setMode("ai"); setErr(null); }} className={tab("ai", mode === "ai")}>
            <Sparkles className="h-3.5 w-3.5" /> AI {quota ? `· ${quota.remaining}/${quota.limit} left` : ""}
          </button>
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
        {mode === "ai" && aiOut && !err && (
          <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">You've used your AI mixes this month. They come back on the 1st — Free mode is always unlimited.</p>
        )}
        {err && (
          <div data-testid="mood-error" className="mt-3 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">
            {err}
            {offerFree && prompt.trim().length >= 2 && (
              <button data-testid="mood-try-free" onClick={() => { setMode("free"); runFree(); }} className="ml-2 font-semibold underline">Make it with Free mode instead</button>
            )}
          </div>
        )}
        <button data-testid="mood-generate" onClick={run} disabled={busy || prompt.trim().length < 2 || (mode === "ai" && aiOut)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-aurora px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Curating your mix…</>
            : mode === "free" ? <><Zap className="h-4 w-4" /> Create free mix</>
            : <><Sparkles className="h-4 w-4" /> Create AI mix</>}
        </button>
      </div>
    </div>
  );
}
