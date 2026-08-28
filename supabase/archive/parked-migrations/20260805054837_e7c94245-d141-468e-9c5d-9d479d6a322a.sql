-- Phase 2i — seed the published processing-purpose version. ADDITIVE ONLY.

INSERT INTO public.scp_purpose_versions
  (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
   jurisdiction_id, published_at)
SELECT
  'competence_development',
  1,
  'pn-2026-08-competence-development-v1',
  'GDPR Art.6(1)(f) — legitimate interest in workforce competence development',
  (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.scp_purpose_versions
   WHERE purpose_code = 'competence_development' AND version_number = 1);

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE p.is_active AND pv.published_at IS NOT NULL;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_P2I_NO_ACTIVE_PURPOSE_SEEDED: assignment would still be impossible';
  END IF;

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