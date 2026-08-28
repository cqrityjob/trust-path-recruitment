-- Migration-ledger reconciliation for the 18 historical canonical/Lovable
-- content-duplicate pairs recorded in migrations-policy.json.
--
-- Twelve legacy pairs each seed one append-only scp_content_events row. The
-- generated copies must remain in the active path for now because later early-
-- August generated migrations depend on their historical execution order.
-- A clean replay therefore sees the same seed event more than once even though
-- the canonical hosted database, where only the generated version ran, does
-- not. This terminal migration makes the replay result deterministic without
-- editing historical SQL or deleting any hosted event.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.scp_content_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_LEDGER_RECONCILIATION: scp_content_events is missing';
  END IF;
END $$;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY metadata->>'migration', subject_type,
                        COALESCE(subject_ref, ''), action
           ORDER BY at, id
         ) AS occurrence
    FROM public.scp_content_events
   WHERE metadata->>'migration' IN (
     '20260801100000_scp_restore_scoring_lineage_readability',
     '20260803120000_scp_phase1d_security_guard_draft_content',
     '20260804110000_scp_phase1f_bestworst_cr_rubrics',
     '20260805100000_scp_phase1g_learning_and_anchors',
     '20260807090000_scp_phase2_read_models_and_identity_rpc',
     '20260808100000_scp_phase2c_test_fixture_programme',
     '20260809090000_scp_phase2e_employer_learning_progress',
     '20260809100000_scp_phase2f_learning_fixture',
     '20260811090000_scp_phase2i_seed_processing_purpose_version',
     '20260811100000_scp_phase2j_assign_token_without_pgcrypto',
     '20260812100000_scp_phase2l_submit_requires_every_item',
     '20260813090000_scp_phase2m_fixture_internal_only'
   )
)
DELETE FROM public.scp_content_events e
 USING ranked r
 WHERE e.id = r.id
   AND r.occurrence > 1;

CREATE UNIQUE INDEX IF NOT EXISTS scp_content_events_legacy_migration_seed_once_idx
  ON public.scp_content_events (
    (metadata->>'migration'), subject_type, COALESCE(subject_ref, ''), action
  )
  WHERE metadata->>'migration' IN (
    '20260801100000_scp_restore_scoring_lineage_readability',
    '20260803120000_scp_phase1d_security_guard_draft_content',
    '20260804110000_scp_phase1f_bestworst_cr_rubrics',
    '20260805100000_scp_phase1g_learning_and_anchors',
    '20260807090000_scp_phase2_read_models_and_identity_rpc',
    '20260808100000_scp_phase2c_test_fixture_programme',
    '20260809090000_scp_phase2e_employer_learning_progress',
    '20260809100000_scp_phase2f_learning_fixture',
    '20260811090000_scp_phase2i_seed_processing_purpose_version',
    '20260811100000_scp_phase2j_assign_token_without_pgcrypto',
    '20260812100000_scp_phase2l_submit_requires_every_item',
    '20260813090000_scp_phase2m_fixture_internal_only'
  );

COMMENT ON INDEX public.scp_content_events_legacy_migration_seed_once_idx IS
  'Legacy ledger reconciliation only. Prevents the 12 known canonical/Lovable '
  'migration pairs from manufacturing duplicate seed audit events. New active '
  'content-duplicate migrations are prohibited by migration-duplicate-check.';

DO $$
DECLARE _duplicates integer;
BEGIN
  SELECT count(*) INTO _duplicates
    FROM (
      SELECT 1
        FROM public.scp_content_events
       WHERE metadata->>'migration' IN (
         '20260801100000_scp_restore_scoring_lineage_readability',
         '20260803120000_scp_phase1d_security_guard_draft_content',
         '20260804110000_scp_phase1f_bestworst_cr_rubrics',
         '20260805100000_scp_phase1g_learning_and_anchors',
         '20260807090000_scp_phase2_read_models_and_identity_rpc',
         '20260808100000_scp_phase2c_test_fixture_programme',
         '20260809090000_scp_phase2e_employer_learning_progress',
         '20260809100000_scp_phase2f_learning_fixture',
         '20260811090000_scp_phase2i_seed_processing_purpose_version',
         '20260811100000_scp_phase2j_assign_token_without_pgcrypto',
         '20260812100000_scp_phase2l_submit_requires_every_item',
         '20260813090000_scp_phase2m_fixture_internal_only'
       )
       GROUP BY metadata->>'migration', subject_type,
                COALESCE(subject_ref, ''), action
      HAVING count(*) > 1
    ) d;

  IF _duplicates <> 0 THEN
    RAISE EXCEPTION
      'MIGRATION_LEDGER_RECONCILIATION: % duplicate seed-event groups remain',
      _duplicates;
  END IF;
END $$;

COMMIT;
