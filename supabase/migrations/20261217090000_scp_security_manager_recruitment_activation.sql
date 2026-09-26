-- ═══════════════════════════════════════════════════════════════════════════
-- 20261217090000 · TRUST strategic level (Säkerhetschef): activation at
-- parity with the operational level
--
-- Owner update 2026-09-26: both assessment levels must be usable at launch;
-- a visible but unsendable strategic option does not meet the requirement.
--
-- This migration performs for the strategic content the SAME two acts that
-- 20260905090000 and 20260925090000 performed for the operational Väktare
-- content, and nothing more:
--
--   1. the assessment `security-manager-recruitment` is designated
--      standard recruitment content (standard_for_recruitment = true): an
--      ACTIVE employer may send it without a per-employer grant. It stays
--      draft/design, every review gate stays outstanding, it runs and reports
--      as a CLOSED TEST ("Pilotversion") and confers no 'recruitment'
--      governance mode -- exactly the status the Väktare test has today;
--   2. the guide `security-manager-se` v1 opens for pilot
--      (pilot_availability = 'open'): startable by every active employer,
--      content frozen while open. It stays a draft pilot hypothesis at the
--      bottom of the review ladder -- exactly the status the Väktare guide
--      has today.
--
-- Both in one migration, because a test that can be sent while its guide
-- cannot be started would leave every completed strategic test without an
-- interview preparation.
--
-- What this is NOT: a content approval, a review, a validation or a
-- publication. The combined content approval requested in
-- docs/release/2026-09-26-strategic-level-content-approval.md is still
-- requested; the product says "pilotversion / utkast" on every surface that
-- shows the test, and nothing here changes that wording.
--
-- Rollback: supabase/rollback/20261217090000_scp_security_manager_recruitment_activation_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The test becomes standard recruitment content: an ACTIVE employer may
--    assign it without a per-employer grant. It stays draft/design, runs and
--    reports as closed test, and confers no 'recruitment' governance mode.
UPDATE public.scp_assessment_definitions
   SET standard_for_recruitment = true
 WHERE slug = 'security-manager-recruitment';

-- 2. The guide opens for pilot: usable by every ACTIVE employer, content
--    frozen while open (edit requires withdrawing first). It stays a draft
--    pilot hypothesis; nothing here reviews or publishes it.
DO $$
DECLARE _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  SELECT ver.* INTO _v
    FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'security-manager-se' AND ver.version_number = 1
     AND ver.content_status IN ('draft', 'expert_review', 'legal_review', 'cognitive_review')
     AND ver.pilot_availability = 'restricted'
     AND ver.content_hash IS NOT NULL;
  IF _v.id IS NULL THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATION: no eligible security-manager-se v1 to open.';
  END IF;
  UPDATE public.scp_interview_pack_versions
     SET pilot_availability = 'open', updated_at = now()
   WHERE id = _v.id;
  PERFORM public.scp_interview_record_event(
    _v.pack_id, _v.id, 'pilot_opened', _v.content_status, _v.content_status,
    'Ägaruppdatering 2026-09-26: båda testnivåerna ska kunna användas vid lansering. Öppen pilot på samma villkor som Väktare-guiden (20260925090000). Paketet förblir en pilothypotes i utkast; det samlade innehållsgodkännandet är begärt, inte givet.',
    _v.content_hash, '{}'::jsonb);
END $$;

-- Proof: designated, open, and still a draft closed test with no operational basis.
DO $$
DECLARE _def uuid; _mode public.scp_governance_mode;
BEGIN
  SELECT id INTO _def FROM public.scp_assessment_definitions WHERE slug = 'security-manager-recruitment';
  IF NOT EXISTS (SELECT 1 FROM public.scp_assessment_definitions WHERE id = _def AND standard_for_recruitment) THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATION: designation did not take';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
                  WHERE p.slug = 'security-manager-se' AND v.pilot_availability = 'open' AND v.content_status = 'draft') THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATION: the guide is not an open draft pilot';
  END IF;
  INSERT INTO public.employers (id, name, slug, status)
  VALUES ('00000000-57d1-0000-0000-000000000001', 'SM activation probe', 'sm-activation-probe', 'active')
  ON CONFLICT (id) DO NOTHING;
  _mode := public.scp_grant_permits_assignment('00000000-57d1-0000-0000-000000000001', _def, 'draft', 'design', false);
  DELETE FROM public.employers WHERE id = '00000000-57d1-0000-0000-000000000001';
  IF _mode IS DISTINCT FROM 'closed_test' THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATION: an active employer must be admitted as closed_test, got %', _mode;
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_purpose_versions WHERE purpose_code = 'selection_support'
              AND published_at IS NOT NULL AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'SCP_SM_ACTIVATION: selection_support became published';
  END IF;
END $$;
