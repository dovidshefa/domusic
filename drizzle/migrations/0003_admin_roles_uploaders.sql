CREATE TYPE public.app_role AS ENUM ('admin', 'uploader');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "read own roles or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin grant uploader" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND role = 'uploader');
CREATE POLICY "admin revoke uploader" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND role = 'uploader');

-- Only approved uploaders or admins may make a track public
CREATE OR REPLACE FUNCTION public.enforce_public_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_public = true
     AND (TG_OP = 'INSERT' OR OLD.is_public IS DISTINCT FROM true)
     AND NOT (public.has_role(NEW.user_id, 'admin') OR public.has_role(NEW.user_id, 'uploader')) THEN
    RAISE EXCEPTION 'Only approved uploaders can share songs publicly' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_public_publish() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tracks_enforce_public BEFORE INSERT OR UPDATE OF is_public ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_public_publish();

-- Admins can delete any public track and its file
CREATE POLICY "admin delete public tracks" ON public.tracks FOR DELETE TO authenticated
  USING (is_public = true AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete public media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.tracks t WHERE t.storage_path = storage.objects.name AND t.is_public = true));

-- Admin member list
CREATE OR REPLACE FUNCTION public.admin_list_members()
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, joined_at timestamptz, song_count bigint, public_count bigint, is_admin boolean, is_uploader boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, COALESCE(NULLIF(p.display_name, ''), 'DoMusic user'), p.avatar_url, p.created_at,
    (SELECT count(*) FROM public.tracks t WHERE t.user_id = p.id),
    (SELECT count(*) FROM public.tracks t WHERE t.user_id = p.id AND t.is_public),
    public.has_role(p.id, 'admin'), public.has_role(p.id, 'uploader')
  FROM public.profiles p ORDER BY p.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;

-- Bootstrap: owner is admin; users already sharing publicly stay approved
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'dovidshefa@gmail.com'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'uploader'::public.app_role FROM public.tracks WHERE is_public = true
ON CONFLICT DO NOTHING;