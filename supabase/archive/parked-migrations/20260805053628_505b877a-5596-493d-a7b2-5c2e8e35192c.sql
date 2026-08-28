-- Phase 2a — employer read models (pseudonymous) and the scoped identity RPC.
-- ADDITIVE ONLY.

-- =========================================================================
-- SECTION 1 — Employer read models, pseudonymous only
-- =========================================================================

CREATE OR REPLACE VIEW public.scp_rm_employer_assignments
WITH (security_invoker = true) AS
SELECT
  a.id                          AS assignment_id,
  a.employer_id,
  a.scp_assessment_version_id,
  a.status,
  a.expires_at,
  a.created_at,
  at.id                         AS attempt_id,
  at.subject_id,                -- pseudonymous. Never a person.
  at.status                     AS attempt_status,
  at.submitted_at,
  at.scored_at,
  at.released_at
FROM public.assessment_assignments a
LEFT JOIN public.scp_attempts at ON at.assignment_id = a.id
WHERE a.scp_assessment_version_id IS NOT NULL;

COMMENT ON VIEW public.scp_rm_employer_assignments IS
  'Contract v1. Academy assignments and their attempt state for an employer. '
  'Carries a PSEUDONYMOUS subject_id only -- resolving it to a person requires '
  'scp_resolve_participant_identity(), which verifies membership, role, scope, '
  'purpose and release state.';

CREATE OR REPLACE VIEW public.scp_rm_review_queue
WITH (security_invoker = true) AS
SELECT
  hr.id                AS review_id,
  hr.trigger_reason,
  hr.review_status,
  hr.opened_at,
  at.issuer_organization_id,
  at.subject_id,       -- pseudonymous
  r.item_version_id,
  r.response_text,     -- untrusted candidate input, shown to the reviewer only
  asr.id               AS scoring_run_id,
  asr.run_status,
  asr.min_confidence
FROM public.scp_human_reviews hr
JOIN public.scp_candidate_responses r ON r.id = hr.response_id
JOIN public.scp_attempts at ON at.id = r.attempt_id
LEFT JOIN public.scp_ai_scoring_runs asr ON asr.id = hr.scoring_run_id;

COMMENT ON VIEW public.scp_rm_review_queue IS
  'Contract v1. The human-review queue. Deliberately carries NO rubric level, '
  'NO anchor response and NO prompt -- a reviewer reads those through the '
  'authoring surface, not through this projection.';

INSERT INTO public.scp_contract_versions
  (contract_version, read_model, status, intended_consumer, scope_note)
VALUES
  ('v1', 'scp_rm_employer_assignments', 'available', 'Assessment Center (employer)',
   'Academy assignments and attempt state. PSEUDONYMOUS subject reference only; identity resolution is a separate authorised operation.'),
  ('v1', 'scp_rm_review_queue', 'available', 'Assessment Center (reviewer)',
   'Human-review queue. Response text and AI confidence only -- never rubric levels, anchors or prompts.')
ON CONFLICT (contract_version, read_model) DO NOTHING;

GRANT SELECT ON public.scp_rm_employer_assignments TO authenticated;
GRANT SELECT ON public.scp_rm_review_queue         TO authenticated;
REVOKE ALL ON public.scp_rm_employer_assignments FROM anon;
REVOKE ALL ON public.scp_rm_review_queue         FROM anon;

-- =========================================================================
-- SECTION 2 — The scoped identity RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_resolve_participant_identity(
  _employer_id uuid,
  _subject_id  uuid
)
RETURNS TABLE (
  subject_id    uuid,
  display_email text,
  released      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _role text;
  _in_scope boolean;
  _purpose_ok boolean;
  _released boolean;
BEGIN
  -- 1. Active organisation membership.
  SELECT m.role INTO _role
    FROM public.employer_memberships m
   WHERE m.user_id = auth.uid()
     AND m.employer_id = _employer_id
     AND m.status = 'active';
  IF _role IS NULL THEN RETURN; END IF;

  -- 2. Role and permission.
  IF _role NOT IN ('owner', 'admin') THEN RETURN; END IF;

  -- 3. The subject must be in THIS organisation's scope.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id)
    INTO _in_scope;
  IF NOT _in_scope THEN RETURN; END IF;

  -- 4. Permitted processing purpose.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
      JOIN public.scp_purpose_versions pv ON pv.id = a.purpose_version_id
      JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id
       AND p.is_active)
    INTO _purpose_ok;
  IF NOT _purpose_ok THEN RETURN; END IF;

  -- 5. Disclosure and report-release state.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id
       AND a.released_at IS NOT NULL)
    INTO _released;
  IF NOT _released THEN RETURN; END IF;

  -- 6. Minimum fields only.
  RETURN QUERY
  SELECT i.subject_id, u.email::text, true
    FROM public.scp_subject_identities i
    JOIN auth.users u ON u.id = i.user_id
   WHERE i.subject_id = _subject_id;
END; $$;

COMMENT ON FUNCTION public.scp_resolve_participant_identity(uuid, uuid) IS
  'The ONLY employer path from a pseudonymous subject to a person. Verifies '
  'active membership, owner/admin role, that the subject is in this employer''s '
  'scope through an attempt it commissioned, an active processing purpose, and '
  'that the result has been released. Returns zero rows on any failure so it '
  'cannot be used to enumerate or probe subjects. Deliberately not a view and '
  'not a list.';

REVOKE ALL     ON FUNCTION public.scp_resolve_participant_identity(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_resolve_participant_identity(uuid, uuid) TO authenticated;

-- =========================================================================
-- SECTION 3 — Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind = 'v'
    JOIN pg_class t ON t.oid = d.refobjid
   WHERE t.relname = 'scp_subject_identities' AND v.relname LIKE 'scp_rm_%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2_IDENTITY_IN_READ_MODEL: % read models reach scp_subject_identities', _n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname = 'scp_resolve_participant_identity' AND prosecdef) THEN
    RAISE EXCEPTION 'SCP_P2_IDENTITY_RPC_NOT_DEFINER';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'scp_subject_identities'
     AND (coalesce(qual,'') IN ('true','(true)') OR qual ILIKE '%employer%');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2_IDENTITY_POLICY_WIDENED';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_contract_versions cv
   WHERE cv.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM information_schema.views v
                      WHERE v.table_schema='public' AND v.table_name = cv.read_model);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2_CONTRACT_CLAIMS_MISSING_VIEW: % available rows have no view', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_assessment_versions WHERE content_status = 'published')
     OR EXISTS (SELECT 1 FROM public.assessments WHERE employer_visible)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers WHERE is_enabled AND code <> 'null_provider')
  THEN RAISE EXCEPTION 'SCP_P2_BOUNDARY_BREACHED'; END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2a-read-models', 'created',
  'Phase 2a: employer read models carrying pseudonymous subject references only, and scp_resolve_participant_identity() as the single scoped path from subject to person — verifying membership, owner/admin role, organisational scope through a commissioned attempt, active processing purpose and released state, returning zero rows on any failure so it cannot enumerate.',
  jsonb_build_object(
    'migration', '20260807090000_scp_phase2_read_models_and_identity_rpc',
    'read_models_added', 2,
    'identity_resolution', 'scoped SECURITY DEFINER RPC, never a view',
    'published', false));