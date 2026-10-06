import { useMemo, useState } from "react";
import { Copy, Film, Music2, X, Trash2 } from "lucide-react";
import { findDuplicateGroups } from "@/lib/duplicates";

type T = { id: string; song: string; artist: string; album?: string; kind?: string; created_at?: string; duration?: number | null };

export function DuplicatesDialog({ tracks, onClose, onDelete }: { tracks: T[]; onClose: () => void; onDelete: (ids: string[]) => Promise<void> }) {
  const groups = useMemo(() => findDuplicateGroups(tracks), [tracks]);
  // keep[groupIndex] = id to keep; default first (oldest listed)
  const [keep, setKeep] = useState<Record<number, string>>({});
  const toDelete = groups.flatMap((g, i) => g.filter((t) => t.id !== (keep[i] ?? g[0].id)).map((t) => t.id));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div data-testid="dupes-dialog" onClick={(e) => e.stopPropagation()} className="glass flex max-h-[85vh] w-full max-w-xl flex-col rounded-3xl border border-border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-xl"><Copy className="h-5 w-5" /> Duplicate songs</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No duplicates found — your library is clean.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">Found {groups.length} song{groups.length !== 1 ? "s" : ""} with more than one copy. Pick the copy to keep in each group.</p>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {groups.map((g, i) => (
                <div key={i} className="rounded-2xl border border-border bg-secondary/30 p-3">
                  <div className="mb-2 text-xs font-semibold">{g.length} copies of “{g[0].song}”</div>
                  {g.map((t) => {
                    const kept = (keep[i] ?? g[0].id) === t.id;
                    return (
                      <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary/60">
                        <input type="radio" name={`g${i}`} checked={kept} onChange={() => setKeep((k) => ({ ...k, [i]: t.id }))} />
                        {t.kind === "video" ? <Film className="h-4 w-4 text-muted-foreground" /> : <Music2 className="h-4 w-4 text-muted-foreground" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{t.song}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{t.artist}{t.created_at ? ` · added ${new Date(t.created_at).toLocaleDateString()}` : ""}</div>
                        </div>
                        <span className={`text-[10px] font-bold ${kept ? "text-[var(--aurora-3)]" : "text-muted-foreground"}`}>{kept ? "Keep" : "Remove"}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-full bg-secondary px-4 py-2 text-xs font-semibold">Not now</button>
              <button data-testid="dupes-remove" onClick={async () => { await onDelete(toDelete); onClose(); }}
                className="flex items-center gap-1.5 rounded-full bg-aurora px-4 py-2 text-xs font-bold text-primary-foreground">
                <Trash2 className="h-3.5 w-3.5" /> Remove {toDelete.length} extra cop{toDelete.length !== 1 ? "ies" : "y"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
