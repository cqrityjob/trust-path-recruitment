-- Rollback for 20261107090000_scp_iv_report_basis_integrity.
--
-- Drops the two new reads and returns scp_iv_finalise_report to the
-- 20261020090000 contract: md5, and a snapshot that does not name the
-- recruitment or classify evidence.
--
-- WHAT THIS DOES NOT DO, AND MUST NOT: it does not drop
-- content_hash_algorithm and it does not touch a single finalised report.
-- Reports already finalised under this migration carry a real sha256 digest,
-- and the column is how a reader knows that. Dropping it would leave a sha256
-- hash that every reader would then interpret as md5 -- turning a correct
-- integrity claim into a false one. The column is additive and nullable, so
-- leaving it costs nothing and removing it destroys evidence.
--
-- Run inside the caller's transaction.

DROP FUNCTION IF EXISTS public.scp_iv_final_report(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_versions(uuid);

DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='scp_iv_final_report') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: scp_iv_final_report survived';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='scp_iv_report_versions') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: scp_iv_report_versions survived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='scp_interview_reports'
                    AND column_name='content_hash_algorithm') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the algorithm column was dropped, which would misread every sha256 report as md5';
  END IF;
  RAISE NOTICE 'SCP_IV_REPORT_BASIS_ROLLBACK ok';
END $rb$;
