import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Disc3, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — LUMEN" },
      { name: "description", content: "Sign in with Google to save your music library across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const signInGoogle = async () => {
    setLoading(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,91,138,0.25), transparent 60%), radial-gradient(circle at 80% 70%, rgba(56,189,248,0.25), transparent 55%), radial-gradient(circle at 50% 100%, rgba(168,85,247,0.35), transparent 60%)" }}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-panel/70 p-8 backdrop-blur-xl shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-aurora shadow-aurora flex h-12 w-12 items-center justify-center rounded-xl">
            <Disc3 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-aurora text-2xl leading-none">LUMEN</div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">PLAY IN LIGHT</div>
          </div>
        </div>

        <h1 className="font-display text-3xl leading-tight">Your music, everywhere.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Google to keep your uploads and playlists synced across every device.
        </p>

        <button
          onClick={signInGoogle}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-white px-5 py-3.5 text-sm font-semibold text-gray-800 transition hover:brightness-105 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Opening Google…" : "Continue with Google"}
        </button>

        {error && (
          <div className="mt-4 rounded-xl border border-[var(--aurora-1)]/30 bg-[var(--aurora-1)]/10 p-3 text-xs text-[var(--aurora-1)]">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Music2 className="h-3.5 w-3.5" />
          Your library is private and tied to your Google account.
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
