DROP POLICY IF EXISTS "media public read" ON storage.objects;
CREATE POLICY "media users read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);