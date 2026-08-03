-- Phase 2i — seed the published processing-purpose version.
--
-- ADDITIVE ONLY.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- scp_employer_assign refuses to assign anything without an ACTIVE, PUBLISHED
-- processing purpose:
--
--   SELECT pv.id INTO _purpose FROM scp_purpose_versions pv
--     JOIN scp_processing_purposes p ON p.code = pv.purpose_code
--    WHERE p.is_active AND pv.published_at IS NOT NULL ...
--   IF _purpose IS NULL THEN RAISE 'SCP_NO_ACTIVE_PURPOSE' ...
--
-- That refusal is correct and must stay: recording WHY a person's competence is
-- being processed, under which privacy notice and on which lawful basis, is not
-- optional under GDPR, and an assignment with no purpose is exactly the kind of
-- record nobody can later justify.
--
-- Phase 0 seeded the purpose VOCABULARY (scp_processing_purposes) but no
-- purpose VERSION. So on any real database the count was zero and NOTHING could
-- ever be assigned. The Assessment Center was, in effect, non-functional the
-- moment it left a test harness.
--
-- ── WHY THE TEST SUITE COULD NOT HAVE CAUGHT THIS ──────────────────────
--
-- Every SQL test creates its own scp_purpose_versions row as part of its
-- fixture, because each needs a purpose to attach an attempt to. So the suite
-- supplied the very thing production was missing, and 85 journey assertions
-- passed against a precondition that only existed inside the tests.
--
-- This is the failure mode fixtures always have: they make the system work.
-- It was found by driving the real UI against a clean database, which is the
-- only place it could have surfaced. The assertion added below closes it by
-- testing the SEEDED state rather than a fixture-built one.

INSERT INTO public.scp_purpose_versions
  (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
   jurisdiction_id, published_at)
SELECT
  'competence_development',
  1,
  'pn-2026-08-competence-development-v1',
  -- Legitimate interest: an employer developing the competence of its own
  -- staff. Deliberately NOT consent -- consent given to an employer is rarely
  -- freely given, and the imbalance is the reason Art.6(1)(f) is the honest
  -- basis here.
  'GDPR Art.6(1)(f) — legitimate interest in workforce competence development',
  (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.scp_purpose_versions
   WHERE purpose_code = 'competence_development' AND version_number = 1);

DO $$
DECLARE _n int;
BEGIN
  -- The property the product actually needs: at least one active, published
  -- purpose exists, so an assignment can name why it is processing anything.
  SELECT count(*) INTO _n
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE p.is_active AND pv.published_at IS NOT NULL;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_P2I_NO_ACTIVE_PURPOSE_SEEDED: assignment would still be impossible';
  END IF;

  -- Only the ACTIVE purpose gets a published version. A reserved purpose --
  -- selection_support above all -- must not become usable by accident.
  SELECT count(*) INTO _n
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE NOT p.is_active AND pv.published_at IS NOT NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION
      'SCP_P2I_INACTIVE_PURPOSE_PUBLISHED: % inactive purpose version(s) are published', _n;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2i-purpose-version', 'created',
  'Phase 2i: seeded the published competence_development purpose version. Phase 0 seeded the purpose vocabulary but no version, so scp_employer_assign correctly refused every assignment on any real database. Every SQL test built its own purpose version as a fixture, which is why 85 journey assertions passed against a precondition production did not have; found by driving the real UI on a clean database.',
  jsonb_build_object(
    'migration', '20260811090000_scp_phase2i_seed_processing_purpose_version',
    'purpose_code', 'competence_development',
    'lawful_basis', 'GDPR Art.6(1)(f)',
    'inactive_purposes_published', 0));
