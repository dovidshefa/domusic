import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Heart, ListMusic, Zap, Flame, Upload, Search, SkipBack, Play, Pause, SkipForward } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DOVID MUSIC ULTRA" },
      { name: "description", content: "A premium dark music library player with gold accents." },
      { property: "og:title", content: "DOVID MUSIC ULTRA" },
      { property: "og:description", content: "A premium dark music library player with gold accents." },
    ],
  }),
  component: Index,
});

type Track = {
  id: string;
  song: string;
  artist: string;
  cover: string;
  src?: string;
};

const initialTracks: Track[] = [
  { id: "1", song: "Night Drive", artist: "Synthwave", cover: "https://picsum.photos/seed/nightdrive/500/500" },
  { id: "2", song: "Golden Lights", artist: "Electronic", cover: "https://picsum.photos/seed/golden/500/500" },
  { id: "3", song: "Dream Horizon", artist: "Ambient", cover: "https://picsum.photos/seed/dream/500/500" },
  { id: "4", song: "Future Bass", artist: "EDM", cover: "https://picsum.photos/seed/futurebass/500/500" },
  { id: "5", song: "Midnight Pulse", artist: "House", cover: "https://picsum.photos/seed/midnight/500/500" },
  { id: "6", song: "Solar Flare", artist: "Trance", cover: "https://picsum.photos/seed/solar/500/500" },
];

function Index() {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [currentId, setCurrentId] = useState<string>(initialTracks[0].id);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState(0.35);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = tracks.find((t) => t.id === currentId) ?? tracks[0];
  const filtered = tracks.filter(
    (t) =>
      t.song.toLowerCase().includes(query.toLowerCase()) ||
      t.artist.toLowerCase().includes(query.toLowerCase()),
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const added: Track[] = files.map((f, i) => ({
      id: `u-${Date.now()}-${i}`,
      song: f.name.replace(/\.[^.]+$/, ""),
      artist: "Uploaded",
      cover: `https://picsum.photos/seed/${encodeURIComponent(f.name)}/500/500`,
      src: URL.createObjectURL(f),
    }));
    setTracks((prev) => [...added, ...prev]);
  };

  const playIndex = (offset: number) => {
    const idx = tracks.findIndex((t) => t.id === currentId);
    const next = tracks[(idx + offset + tracks.length) % tracks.length];
    setCurrentId(next.id);
    setPlaying(true);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-border bg-panel/95 p-5">
        <h1 className="text-gold-gradient mb-6 text-center text-4xl font-black tracking-tight">
          DOVID MUSIC
        </h1>

        <label className="bg-gold-gradient mb-4 block cursor-pointer rounded-2xl p-4 text-center font-bold text-primary-foreground shadow-lg transition hover:brightness-110">
          <Upload className="mr-2 inline h-5 w-5" />
          UPLOAD MUSIC
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="audio/*"
            className="hidden"
            onChange={handleUpload}
          />
        </label>

        <nav className="flex flex-col gap-3">
          {[
            { icon: Heart, label: "FAVORITES" },
            { icon: ListMusic, label: "PLAYLISTS" },
            { icon: Zap, label: "RECENTLY PLAYED" },
            { icon: Flame, label: "TRENDING" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:bg-muted hover:text-[var(--gold)]"
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-[90px] items-center gap-5 border-b border-border bg-panel/80 px-6">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your music..."
              className="w-full rounded-2xl bg-input py-4 pl-14 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            />
          </div>
        </header>

        {/* Content */}
        <section className="flex-1 overflow-y-auto p-8">
          <h2 className="mb-7 text-4xl font-black tracking-tight">YOUR LIBRARY</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setCurrentId(t.id);
                  setPlaying(true);
                }}
                className="group overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card to-background text-left transition duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:border-[var(--gold)]/40 hover:shadow-[0_0_40px_-5px_rgba(255,215,0,0.35)]"
              >
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={t.cover}
                    alt={t.song}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition group-hover:opacity-100" />
                </div>
                <div className="p-5">
                  <div className="mb-1.5 text-xl font-bold">{t.song}</div>
                  <div className="text-sm text-muted-foreground">{t.artist}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Player */}
        <footer className="flex h-[130px] items-center gap-5 border-t border-border bg-panel/95 px-6">
          <img
            src={current.cover}
            alt={current.song}
            className="h-[90px] w-[90px] rounded-2xl object-cover shadow-lg"
          />
          <div className="min-w-[180px]">
            <div className="text-2xl font-bold">{current.song}</div>
            <div className="mt-1 text-sm text-muted-foreground">{current.artist}</div>
          </div>

          <div className="ml-4 flex gap-3">
            <button
              onClick={() => playIndex(-1)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary transition hover:bg-gold-gradient hover:text-primary-foreground"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="bg-gold-gradient flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-[0_0_24px_-4px_rgba(255,215,0,0.6)] transition hover:brightness-110"
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </button>
            <button
              onClick={() => playIndex(1)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary transition hover:bg-gold-gradient hover:text-primary-foreground"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          <div
            className="ml-4 h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-secondary"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setProgress((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className="bg-gold-gradient h-full transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </footer>
      </main>
    </div>
  );
}
