-- Rollback for 20261107090000_scp_iv_report_basis_integrity.
--
-- Drops what the migration ADDED -- the previewed finalisation
-- scp_iv_finalise_previewed_report(uuid, text, uuid), the builder, the
-- preview, the three readbacks, the two hash rules and the assessment-domain
-- identity projection -- and restores the immutability guard as
-- 20260920090000 defined it.
--
-- It does NOT touch scp_iv_finalise_report(uuid, uuid). The migration never
-- dropped or redefined that function (EXPAND: both contracts live side by
-- side until the separate CONTRACT migration), so there is nothing to
-- restore; the proof below asserts it is still there, unaltered, for the
-- deployed application.
--
-- It leaves the origin-guard fix (§2b) in place: a defect fix, not a
-- feature, and reverting it would return scp_interview_findings to a table
-- nothing can write to.
--
-- WHAT THIS DOES NOT DO, AND MUST NOT: it does not drop content_hash_algorithm
-- or basis_hash and it does not touch a single finalised report. Reports
-- finalised under this migration carry a real sha256 digest, and the column is
-- how a reader knows that. Dropping it would leave a sha256 hash that every
-- reader would then interpret as md5 -- turning a correct integrity claim into
-- a false one. Both columns are additive and nullable, so leaving them costs
-- nothing and removing them destroys evidence.
--
-- Run inside the caller's transaction.

DROP FUNCTION IF EXISTS public.scp_iv_finalise_previewed_report(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_preview_report(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_build_report_basis(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_final_report(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_version(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_versions(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_content_hash(jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_basis_hash(jsonb);
DROP FUNCTION IF EXISTS public.scp_employer_report_identity(uuid);


-- ── scp_iv_guard_report_immutable, exactly as 20260920090000 defined it ───
CREATE OR REPLACE FUNCTION public.scp_iv_guard_report_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'final' THEN RETURN NEW; END IF;
  -- A final report may only be superseded by a later version.
  IF NEW.status = 'superseded' AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'SCP_IV_REPORT_IMMUTABLE: a finalised report is never edited. Create a new report version instead.'
    USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_report_immutable() FROM PUBLIC, anon, authenticated;

DO $rb$
DECLARE _fn text; _src text;
BEGIN
  FOR _fn IN SELECT unnest(ARRAY['scp_iv_preview_report','scp_iv_build_report_basis',
      'scp_iv_final_report','scp_iv_report_version','scp_iv_report_versions',
      'scp_iv_content_hash','scp_iv_basis_hash','scp_employer_report_identity']) LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname=_fn) THEN
      RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: % survived', _fn;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='scp_iv_finalise_previewed_report') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the previewed finalisation survived';
  END IF;
  -- The legacy contract was never touched, so it must still be exactly the
  -- 20261020090000 function: two arguments, md5, status_at_report
  -- idempotency, no preview requirement, executable by the deployed client.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report') <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: scp_iv_finalise_report is not exactly one function';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report' AND p.pronargs = 2;
  IF _src IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the legacy two-argument finalisation is missing';
  END IF;
  IF position('md5(_payload::text)' in _src) = 0 OR position('status_at_report' in _src) = 0
     OR position('SCP_IV_STALE_PREVIEW' in _src) > 0 OR position('scp_iv_build_report_basis' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the legacy finalisation is not the 20261020090000 contract';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.scp_iv_finalise_report(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the deployed application cannot execute the legacy finalisation';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_guard_report_immutable';
  IF _src ~ 'OLD\.status = ''superseded''' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the guard was not restored to its 20260920090000 body';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='scp_interview_reports'
                    AND column_name='content_hash_algorithm') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the algorithm column was dropped, which would misread every sha256 report as md5';
  END IF;
  RAISE NOTICE 'SCP_IV_REPORT_BASIS_ROLLBACK ok';
END $rb$;
