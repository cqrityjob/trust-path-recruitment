-- PREPARED, NOT APPLIED. Activation of the TRUST strategic level, for the
-- owner's decision after the combined content approval recorded in
-- docs/release/2026-09-26-strategic-level-content-approval.md.
--
-- Move this file to supabase/migrations/ (keeping the canonical version slot
-- or the next free one), add the rollback below to supabase/rollback/, record
-- it in supabase/release-state.json as pending, and apply it through the
-- tracked release mechanism in the documented order. Until then it is
-- documentation, and nothing in the repository or the hosted project reads it.
--
-- Two switches, in one migration, because a test that can be sent while its
-- interview guide cannot be started would leave every completed strategic
-- test with no interview preparation. Both are the same acts 20260905090000
-- and 20260925090000 performed for the operational content.

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
    'Ägarbeslut <datum>: samlat innehållsgodkännande av den strategiska nivån; öppen pilot. Paketet förblir en pilothypotes.',
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

-- ROLLBACK (supabase/rollback/20261217090000_..._rollback.sql): the two acts
-- reversed. Withdrawing the pilot is the governed 'pilot_withdrawn' event;
-- cases already pinned to the version keep continuity read access.
--
--   UPDATE public.scp_assessment_definitions SET standard_for_recruitment = false
--    WHERE slug = 'security-manager-recruitment';
--   UPDATE public.scp_interview_pack_versions v SET pilot_availability = 'restricted', updated_at = now()
--     FROM public.scp_interview_packs p WHERE p.id = v.pack_id AND p.slug = 'security-manager-se';
--   -- plus scp_interview_record_event(..., 'pilot_withdrawn', ...) with the reason.
