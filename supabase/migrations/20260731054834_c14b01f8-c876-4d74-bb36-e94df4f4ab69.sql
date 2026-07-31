-- 1. Remove inherited-default anon privileges on Career Discovery objects.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname LIKE 'cd\_%'
       AND c.relkind IN ('r','v','m','p')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', r.relname);
    IF r.relname NOT IN ('cd_definition_versions', 'cd_definition_items') THEN
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.relname);
    END IF;
  END LOOP;
END $$;

-- 2. Admission depends on lifecycle status, not on governance metadata.
CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _status      text;
  _internal_ok boolean;
BEGIN
  SELECT lifecycle_status INTO _status
    FROM public.cd_definition_versions
   WHERE id = NEW.definition_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_DEFINITION_VERSION_MISSING: %', NEW.definition_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _status = 'design' THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is design; no session may be created against it'
      USING ERRCODE = 'check_violation';
  END IF;

  _internal_ok := COALESCE(current_setting('cqj.cd_internal_test', true), '') = 'on';

  IF _status = 'internal_test' THEN
    IF NOT _internal_ok THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION: an internal_test version is reachable only through cd_begin_internal_test_session()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT NEW.is_internal_test THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_MUST_BE_MARKED: a session against an internal_test version must record is_internal_test'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a candidate session may be created',
      _status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.is_internal_test THEN
    RAISE EXCEPTION
      'CD_INTERNAL_TEST_FLAG_ON_CANDIDATE_SESSION: is_internal_test is reserved for internal_test versions'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- 3. Outstanding reviews stay visible.
DROP VIEW IF EXISTS public.cd_outstanding_reviews;
CREATE VIEW public.cd_outstanding_reviews
WITH (security_invoker = true) AS
SELECT
  dv.definition_version,
  dv.lifecycle_status,
  g.key   AS review_gate,
  (g.value = 'true'::jsonb) AS cleared
FROM public.cd_definition_versions dv
CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
WHERE g.value <> 'true'::jsonb;

COMMENT ON VIEW public.cd_outstanding_reviews IS
  'Reviews not yet cleared, per definition version. Gates no longer block admission; this is how their real state stays visible.';

REVOKE ALL ON public.cd_outstanding_reviews FROM anon;
GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;

-- 4. Launch v3.1.
UPDATE public.cd_definition_versions
   SET lifecycle_status = 'active',
       updated_at = now()
 WHERE definition_version = '2026-scd-v3.1.0'
   AND lifecycle_status <> 'active';

-- 5. Self-verification.
DO $$
DECLARE _status text; _outstanding integer; _bad text;
BEGIN
  SELECT lifecycle_status INTO _status
    FROM public.cd_definition_versions
   WHERE definition_version = '2026-scd-v3.1.0';

  IF _status IS NULL THEN
    RAISE EXCEPTION 'v3.1 definition version is missing — nothing was launched';
  END IF;
  IF _status <> 'active' THEN
    RAISE EXCEPTION 'v3.1 did not reach active (status is %)', _status;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO _bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'cd\_%'
     AND c.relkind IN ('r','v','m','p')
     AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon still holds a write grant on: %', _bad;
  END IF;

  SELECT count(*) INTO _outstanding
    FROM public.cd_outstanding_reviews
   WHERE definition_version = '2026-scd-v3.1.0';

  RAISE NOTICE 'Career Discovery v3.1 is ACTIVE. % review(s) still open.', _outstanding;
END $$;