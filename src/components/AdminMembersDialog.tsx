import { useEffect, useState } from "react";
import { Loader2, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Member = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
  song_count: number;
  public_count: number;
  is_admin: boolean;
  is_uploader: boolean;
};

export function AdminMembersDialog({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("admin_list_members");
      if (error) { toast.error("Couldn't load members"); setMembers([]); return; }
      setMembers((data ?? []) as Member[]);
    })();
  }, []);

  const toggle = async (m: Member) => {
    setBusy(m.user_id);
    const on = !m.is_uploader;
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: m.user_id, role: "uploader" })
      : await supabase.from("user_roles").delete().eq("user_id", m.user_id).eq("role", "uploader");
    setBusy(null);
    if (error) { toast.error("Couldn't change that setting"); return; }
    setMembers((ms) => ms?.map((x) => (x.user_id === m.user_id ? { ...x, is_uploader: on } : x)) ?? null);
    toast.success(on ? `${m.display_name} can now share publicly` : `${m.display_name} can no longer share publicly`);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} data-testid="admin-dialog"
        className="glass w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--aurora-1)]" />
            <h2 className="font-display text-lg">Members</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="px-5 pt-3 text-xs text-muted-foreground">
          Everyone can upload private songs. Turn on "Approved uploader" to let someone share to Public Songs & Videos.
        </p>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {!members ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : members.map((m) => (
            <div key={m.user_id} data-member={m.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-secondary/40">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="bg-aurora flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">
                  {m.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{m.display_name}</div>
                <div className="text-[11px] text-muted-foreground">{m.song_count} songs · {m.public_count} public</div>
              </div>
              {m.is_admin ? (
                <span className="rounded-full bg-[var(--aurora-1)]/20 px-2.5 py-1 text-[10px] font-bold text-[var(--aurora-1)]">Owner</span>
              ) : (
                <button onClick={() => void toggle(m)} disabled={busy === m.user_id} role="switch" aria-checked={m.is_uploader}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground disabled:opacity-50">
                  Approved uploader
                  <span className={`relative h-5 w-9 rounded-full transition ${m.is_uploader ? "bg-aurora" : "bg-secondary"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition ${m.is_uploader ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
