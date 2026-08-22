-- Give the live private CV bucket a canonical home in the active migration
-- path. The bucket existed in hosted production, while only its RLS policies
-- were represented in repository migrations.
--
-- No objects are copied by this migration. Historical uploaded CVs in the
-- source environment are test data and intentionally remain there.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'job-application-cvs',
  'job-application-cvs',
  false,
  NULL,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
