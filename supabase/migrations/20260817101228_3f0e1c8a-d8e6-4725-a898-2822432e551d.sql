ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS source_track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tracks_public_created_idx ON public.tracks (created_at DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS tracks_public_plays_idx ON public.tracks (plays DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS tracks_user_idx ON public.tracks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracks_storage_path_idx ON public.tracks (storage_path);

DROP POLICY IF EXISTS "public tracks readable" ON public.tracks;
CREATE POLICY "public tracks readable" ON public.tracks FOR SELECT TO authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "media read public tracks" ON storage.objects;
CREATE POLICY "media read public tracks" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'media'
    AND EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.storage_path = storage.objects.name AND t.is_public = true
    )
  );

CREATE OR REPLACE FUNCTION public.browse_public_tracks(
  _search text DEFAULT '',
  _kind text DEFAULT 'all',
  _genre text DEFAULT 'all',
  _sort text DEFAULT 'recent',
  _limit integer DEFAULT 48,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  song text,
  artist text,
  album text,
  genre text,
  cover text,
  storage_path text,
  kind text,
  duration numeric,
  plays integer,
  created_at timestamptz,
  uploader_id uuid,
  uploader_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.song, t.artist, t.album, t.genre, t.cover, t.storage_path, t.kind,
         t.duration, t.plays, t.created_at, t.user_id,
         COALESCE(NULLIF(p.display_name, ''), 'DoMusic user') AS uploader_name
  FROM public.tracks t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.is_public = true
    AND t.source_track_id IS NULL
    AND (_kind = 'all' OR t.kind = _kind)
    AND (_genre = 'all' OR COALESCE(t.genre, 'Uncategorized') = _genre)
    AND (
      COALESCE(_search, '') = ''
      OR t.song ILIKE '%' || _search || '%'
      OR t.artist ILIKE '%' || _search || '%'
      OR t.album ILIKE '%' || _search || '%'
    )
  ORDER BY
    CASE WHEN _sort = 'plays' THEN t.plays END DESC NULLS LAST,
    CASE WHEN _sort = 'title' THEN lower(t.song) END ASC NULLS LAST,
    CASE WHEN _sort = 'oldest' THEN t.created_at END ASC NULLS LAST,
    t.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 48), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.browse_public_tracks(text, text, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_track_genres()
RETURNS TABLE (genre text, track_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(t.genre, ''), 'Uncategorized') AS genre, count(*) AS track_count
  FROM public.tracks t
  WHERE t.is_public = true AND t.source_track_id IS NULL
  GROUP BY 1
  ORDER BY 2 DESC, 1 ASC;
$$;

GRANT EXECUTE ON FUNCTION public.public_track_genres() TO authenticated;