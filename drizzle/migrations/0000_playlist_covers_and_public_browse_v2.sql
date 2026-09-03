-- Additive: playlist cover image (storage path in the media bucket)
ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- New browse function (v2) adding added_count + "added"/"trending" sorts.
-- The original browse_public_tracks stays untouched so nothing already deployed breaks.
CREATE OR REPLACE FUNCTION public.browse_public_tracks_v2(
  _search text DEFAULT ''::text,
  _kind text DEFAULT 'all'::text,
  _genre text DEFAULT 'all'::text,
  _sort text DEFAULT 'recent'::text,
  _limit integer DEFAULT 48,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, song text, artist text, album text, genre text, cover text,
  storage_path text, kind text, duration numeric, plays integer,
  created_at timestamp with time zone, uploader_id uuid, uploader_name text,
  added_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH adds AS (
    SELECT source_track_id AS sid, count(DISTINCT user_id) AS c
    FROM public.tracks
    WHERE source_track_id IS NOT NULL
    GROUP BY 1
  )
  SELECT t.id, t.song, t.artist, t.album, t.genre, t.cover, t.storage_path, t.kind,
         t.duration, t.plays, t.created_at, t.user_id,
         COALESCE(NULLIF(p.display_name, ''), 'DoMusic user') AS uploader_name,
         COALESCE(a.c, 0)::bigint AS added_count
  FROM public.tracks t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN adds a ON a.sid = t.id
  WHERE t.is_public = true
    AND t.source_track_id IS NULL
    AND (_kind = 'all' OR t.kind = _kind)
    AND (_genre = 'all' OR COALESCE(NULLIF(t.genre, ''), 'Uncategorized') = _genre)
    AND (
      COALESCE(_search, '') = ''
      OR t.song ILIKE '%' || _search || '%'
      OR t.artist ILIKE '%' || _search || '%'
      OR t.album ILIKE '%' || _search || '%'
    )
  ORDER BY
    CASE WHEN _sort = 'trending' THEN
      (t.plays + 3 * COALESCE(a.c, 0))::numeric
      / (1 + (EXTRACT(EPOCH FROM (now() - t.created_at)) / 86400.0))
    END DESC NULLS LAST,
    CASE WHEN _sort = 'added' THEN COALESCE(a.c, 0) END DESC NULLS LAST,
    CASE WHEN _sort = 'plays' THEN t.plays END DESC NULLS LAST,
    CASE WHEN _sort = 'title' THEN lower(t.song) END ASC NULLS LAST,
    CASE WHEN _sort = 'oldest' THEN t.created_at END ASC NULLS LAST,
    t.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 48), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.browse_public_tracks_v2(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.browse_public_tracks_v2(text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.browse_public_tracks_v2(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_public_tracks_v2(text, text, text, text, integer, integer) TO service_role;
