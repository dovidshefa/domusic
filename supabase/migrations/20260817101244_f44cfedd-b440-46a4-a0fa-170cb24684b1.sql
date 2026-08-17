REVOKE EXECUTE ON FUNCTION public.browse_public_tracks(text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.public_track_genres() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.browse_public_tracks(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_track_genres() TO authenticated;