INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'startup-evidence',
  'startup-evidence',
  TRUE,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "startup evidence bucket: owner insert" ON storage.objects;
CREATE POLICY "startup evidence bucket: owner insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'startup-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "startup evidence bucket: owner update" ON storage.objects;
CREATE POLICY "startup evidence bucket: owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'startup-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "startup evidence bucket: owner delete" ON storage.objects;
CREATE POLICY "startup evidence bucket: owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'startup-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );