import { X, CheckCircle2, AlertTriangle, Loader2, Copy, Film, Music2 } from "lucide-react";
import type { UploadItem } from "@/lib/upload-manager";

const sizeLabel = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function UploadPanel({
  items,
  onCancel,
  onCancelAll,
  onResolveDuplicate,
  onClearFinished,
}: {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onCancelAll: () => void;
  onResolveDuplicate: (id: string, action: "replace" | "keep" | "skip") => void;
  onClearFinished: () => void;
}) {
  if (items.length === 0) return null;
  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const dupes = items.filter((i) => i.status === "duplicate").length;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="text-xs font-bold tracking-[0.2em] text-muted-foreground">TRANSFERS</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {active > 0 && <span className="rounded-full bg-[var(--aurora-2)]/15 px-2 py-0.5 text-[var(--aurora-2)]">{active} uploading</span>}
          {dupes > 0 && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300">{dupes} duplicate</span>}
          {done > 0 && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">{done} complete</span>}
          {failed > 0 && <span className="rounded-full bg-[var(--aurora-1)]/15 px-2 py-0.5 text-[var(--aurora-1)]">{failed} failed</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(active > 0 || dupes > 0) && (
            <button onClick={onCancelAll} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-[var(--aurora-1)]/50 hover:text-[var(--aurora-1)]">
              Cancel all
            </button>
          )}
          <button onClick={onClearFinished} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground">
            Clear finished
          </button>
        </div>
      </div>

      <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground">
              {i.kind === "video" ? <Film className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-semibold">{i.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{sizeLabel(i.size)}</span>
              </div>
              {i.status === "duplicate" ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-amber-300"><Copy className="h-3 w-3" /> Already in your library</span>
                  <button onClick={() => onResolveDuplicate(i.id, "replace")} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold hover:bg-secondary/70">Replace</button>
                  <button onClick={() => onResolveDuplicate(i.id, "keep")} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold hover:bg-secondary/70">Keep both</button>
                  <button onClick={() => onResolveDuplicate(i.id, "skip")} className="rounded-full px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">Skip</button>
                </div>
              ) : (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ${
                        i.status === "error" ? "bg-[var(--aurora-1)]" : i.status === "canceled" ? "bg-muted" : "bg-aurora"
                      }`}
                      style={{ width: `${i.status === "done" ? 100 : i.progress}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {i.status === "queued" && "Waiting…"}
                    {i.status === "uploading" && `${i.progress}%`}
                    {i.status === "done" && "Complete"}
                    {i.status === "canceled" && "Canceled"}
                    {i.status === "error" && (i.error ?? "Failed")}
                  </div>
                </>
              )}
            </div>
            <div className="shrink-0">
              {i.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-[var(--aurora-2)]" />}
              {i.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {i.status === "error" && <AlertTriangle className="h-4 w-4 text-[var(--aurora-1)]" />}
            </div>
            {(i.status === "uploading" || i.status === "queued") && (
              <button onClick={() => onCancel(i.id)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-[var(--aurora-1)]" title="Cancel">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
