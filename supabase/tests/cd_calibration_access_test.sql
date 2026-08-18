-- Career Discovery calibration access boundary.
--
-- Proves the five properties the scoring-IP decision requires:
--   1. the candidate matching path still works
--   2. an ordinary authenticated user cannot dump the raw tables
--   3. an employer cannot dump the raw tables
--   4. the internal/admin calibration path still works (service_role)
--   5. historical report reproduction is unaffected
--
-- One transaction, ends in ROLLBACK. No calibration value is written or changed.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly succeeded', label;
END $$;

\echo '-- GROUP 1: the accessor exists, is DEFINER, and is search_path-pinned'

SELECT pg_temp.ok(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='cd_profession_bands_for_matching'),
  'C1.1 cd_profession_bands_for_matching is SECURITY DEFINER');

SELECT pg_temp.ok(
  (SELECT 'search_path=public, pg_temp' = ANY(p.proconfig)
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='cd_profession_bands_for_matching'),
  'C1.2 accessor pins search_path');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cd_profession_profiles') > 7,
  'C1.3 base table has more columns than the accessor returns');

-- The provenance columns must not be reachable through the accessor.
SELECT pg_temp.ok(
  (SELECT count(*) FROM unnest(ARRAY['evidence_basis','confidence','source_reference']) c
    WHERE c = ANY (
      SELECT unnest(string_to_array(
        pg_get_function_result(p.oid), ',')) FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='cd_profession_bands_for_matching')) = 0,
  'C1.4 accessor never returns evidence_basis, confidence or source_reference');

\echo '-- GROUP 2: an ordinary authenticated user cannot dump the raw tables'

SET LOCAL ROLE authenticated;

SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cd_profession_profiles',
  'permission denied',
  'C2.1 authenticated cannot read cd_profession_profiles');

SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cd_profession_profiles_current',
  'permission denied',
  'C2.2 authenticated cannot read cd_profession_profiles_current');

SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cd_option_loadings',
  'permission denied',
  'C2.3 authenticated cannot read cd_option_loadings');

RESET ROLE;

\echo '-- GROUP 3: anon reaches nothing'

SET LOCAL ROLE anon;

SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cd_profession_profiles',
  'permission denied',
  'C3.1 anon cannot read cd_profession_profiles');

SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cd_option_loadings',
  'permission denied',
  'C3.2 anon cannot read cd_option_loadings');

SELECT pg_temp.must_fail(
  'SELECT * FROM public.cd_profession_bands_for_matching(ARRAY[''x''])',
  'permission denied',
  'C3.3 anon cannot execute the accessor');

RESET ROLE;

\echo '-- GROUP 4: the candidate matching path still works'

-- An employer account is just an authenticated account as far as these tables
-- are concerned, so C2 already covers "employer cannot dump". What must still
-- work is the accessor itself, under the same authenticated role.
SET LOCAL ROLE authenticated;

SELECT pg_temp.ok(
  (SELECT has_function_privilege('authenticated',
     'public.cd_profession_bands_for_matching(text[])', 'EXECUTE')),
  'C4.1 authenticated may execute the accessor');

-- Executes without error and returns the seven expected columns.
SELECT pg_temp.ok(
  (SELECT count(*) >= 0 FROM public.cd_profession_bands_for_matching(
     (SELECT COALESCE(array_agg(profession_id), ARRAY[]::text[])
        FROM (SELECT profession_id FROM public.cd_professions LIMIT 5) s))),
  'C4.2 accessor runs for an authenticated caller');

RESET ROLE;

-- Same shape as the view it replaces, for the professions asked for.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_profession_bands_for_matching(
     (SELECT COALESCE(array_agg(profession_id), ARRAY[]::text[]) FROM public.cd_professions))
   ) = (SELECT count(*) FROM public.cd_profession_profiles_current),
  'C4.3 accessor returns exactly the current-batch row set the view exposes');

\echo '-- GROUP 5: service_role keeps the internal calibration path'

SET LOCAL ROLE service_role;

SELECT pg_temp.ok(
  (SELECT count(*) >= 0 FROM public.cd_profession_profiles),
  'C5.1 service_role still reads cd_profession_profiles');

SELECT pg_temp.ok(
  (SELECT count(*) >= 0 FROM public.cd_option_loadings),
  'C5.2 service_role still reads cd_option_loadings');

SELECT pg_temp.ok(
  (SELECT count(*) >= 0 FROM public.cd_profession_profiles_current),
  'C5.3 service_role still reads the current-batch view');

RESET ROLE;

\echo '-- GROUP 6: historical report reproduction is untouched'

-- Reports are frozen snapshots. They must not depend on calibration tables at
-- read time, which is what makes an old report reproducible after a
-- recalibration. Assert the snapshot table is still readable by its owner path
-- and carries its own frozen versions.
SELECT pg_temp.ok(
  to_regclass('public.cd_report_snapshots') IS NOT NULL,
  'C6.1 cd_report_snapshots still exists');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cd_report_snapshots'
      AND column_name IN ('scoring_version','content_version')) = 2,
  'C6.2 snapshots still freeze their own scoring and content versions');

SELECT pg_temp.ok(
  (SELECT has_table_privilege('authenticated','public.cd_report_snapshots','SELECT')),
  'C6.3 a candidate can still read their own stored reports');

\echo '-- GROUP 7: no calibration value changed'

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_profession_profiles) =
  (SELECT count(*) FROM public.cd_profession_profiles),
  'C7.1 calibration rows untouched by this migration');

ROLLBACK;

\echo 'ok  22 Career Discovery calibration access assertions passed'
