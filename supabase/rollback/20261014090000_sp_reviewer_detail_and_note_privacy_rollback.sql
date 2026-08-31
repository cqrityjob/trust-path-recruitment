-- Rollback for 20261014090000_sp_reviewer_detail_and_note_privacy.sql.
--
-- Gives back table-level SELECT and INSERT on the two verification tables,
-- which restores the holder's ability to read the reviewer's internal
-- `decision_note` over PostgREST and to plant one on their own request, and
-- restores the review detail payload that omitted the credential reference,
-- the sub-jurisdiction, the authorisation scope and an employment period's
-- prior versions.
--
-- Both are the defect, not a feature. This file exists so the forward
-- migration is reversible, not because reversing it is ever the right thing
-- to do.
--
-- ── IT DESTROYS NO DATA ────────────────────────────────────────────────
--
-- The forward migration created no table and no column, rewrote no row and
-- back-filled nothing. It changed privileges and one function body. Running
-- this file changes privileges and one function body back: every verification
-- request, every immutable decision, every claim, period and Passport event
-- is exactly as it was.
--
-- ── RUN IT WITH THE APPLICATION HALF ───────────────────────────────────
--
-- On its own it leaves the reviewer page asking for claim fields the function
-- no longer returns -- they render as absent, which is the same thing the
-- page shows for a claim that genuinely has none, so it degrades quietly
-- rather than breaking. It does not restore any leak by itself either: the
-- holder-facing reads name their columns and never asked for the note. What
-- it removes is the guarantee that a crafted request cannot.

BEGIN;

-- ── A. Back to table-level privileges ──────────────────────────────────
-- Column-level grants and table-level grants coexist in the catalogue, so the
-- column grants are revoked explicitly rather than left to be masked by the
-- table grant issued after them.
REVOKE SELECT (
  id, holder_user_id, claim_id, period_id, request_kind, target_employer_id,
  status, submitted_at, decided_at, decided_by, verification_method,
  holder_message, valid_from, valid_until
) ON public.sp_verification_requests FROM authenticated;

REVOKE SELECT (
  id, request_id, holder_user_id, decided_by, decider_organisation, decision,
  verification_method, valid_from, valid_until, decided_at
) ON public.sp_verification_decisions FROM authenticated;

REVOKE INSERT (
  id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status
) ON public.sp_verification_requests FROM authenticated;

GRANT SELECT, INSERT ON public.sp_verification_requests  TO authenticated;
GRANT SELECT          ON public.sp_verification_decisions TO authenticated;

COMMENT ON COLUMN public.sp_verification_requests.decision_note  IS NULL;
COMMENT ON COLUMN public.sp_verification_decisions.decision_note IS NULL;

-- ── B. The Phase 10 review detail, restored verbatim ───────────────────
CREATE OR REPLACE FUNCTION public.sp_verifier_request_detail(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.sp_verification_requests
   WHERE id = _request_id AND request_kind = 'cqrityjob_review';
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  SELECT jsonb_build_object(
    'id', _r.id,
    'status', _r.status,
    'submitted_at', _r.submitted_at,
    'subject_type', CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
    'is_self', (_r.holder_user_id = auth.uid()),
    'holder_name', (SELECT coalesce(display_name,'') FROM public.sp_passport_profiles
                     WHERE holder_user_id = _r.holder_user_id),
    'claim', (SELECT jsonb_build_object(
                'id', c.id, 'type', c.claim_type, 'title', c.title,
                'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
                'issued_on', c.issued_on, 'valid_until', c.valid_until,
                'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
                'version_no', c.version_no)
                FROM public.sp_claims c WHERE c.id = _r.claim_id),
    'period', (SELECT jsonb_build_object(
                'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
                'started_on', e.started_on, 'ended_on', e.ended_on,
                'employment_type', e.employment_type, 'jurisdiction', e.jurisdiction_code,
                'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state)
                FROM public.sp_experience_periods e WHERE e.id = _r.period_id),
    'previous_versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'title', pc.title,
                                          'version_no', pc.version_no,
                                          'lifecycle', pc.lifecycle_state)
                       ORDER BY pc.version_no)
        FROM public.sp_claims pc
       WHERE _r.claim_id IS NOT NULL
         AND pc.holder_user_id = _r.holder_user_id
         AND pc.id <> _r.claim_id
         AND pc.id IN (SELECT supersedes_id FROM public.sp_claims WHERE id = _r.claim_id)
    ), '[]'::jsonb),
    'evidence', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', ev.id, 'file_name', ev.file_name, 'mime_type', ev.mime_type,
               'size_bytes', ev.size_bytes, 'storage_path', ev.storage_path,
               'uploaded_at', ev.uploaded_at) ORDER BY ev.uploaded_at)
        FROM public.sp_evidence ev
       WHERE ev.lifecycle_state = 'active'
         AND ((_r.claim_id IS NOT NULL AND ev.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND ev.period_id = _r.period_id))
    ), '[]'::jsonb),
    'prior_decisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'decision', d.decision, 'organisation', d.decider_organisation,
               'method', d.verification_method, 'decided_at', d.decided_at,
               'note', d.decision_note) ORDER BY d.decided_at DESC)
        FROM public.sp_verification_decisions d
        JOIN public.sp_verification_requests r2 ON r2.id = d.request_id
       WHERE r2.holder_user_id = _r.holder_user_id
         AND ((_r.claim_id IS NOT NULL AND r2.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND r2.period_id = _r.period_id))
    ), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_request_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_request_detail(uuid) TO authenticated;

COMMIT;
