REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.browse_public_tracks(text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.browse_public_tracks(text, text, text, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.public_track_genres() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_track_genres() TO authenticated;