CREATE TABLE public.track_lyrics (
  track_id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  lyrics text NOT NULL DEFAULT '',
  synced boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_lyrics TO authenticated;
GRANT ALL ON public.track_lyrics TO service_role;
ALTER TABLE public.track_lyrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lyrics select" ON public.track_lyrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own lyrics insert" ON public.track_lyrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own lyrics update" ON public.track_lyrics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own lyrics delete" ON public.track_lyrics FOR DELETE TO authenticated USING (auth.uid() = user_id);