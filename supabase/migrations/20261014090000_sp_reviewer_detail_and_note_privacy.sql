-- Security Passport — what the reviewer sees, and what the holder cannot.
--
-- Two changes that pull in opposite directions and belong in one file because
-- they are the same boundary read from two sides: `sp_verification_requests`
-- and `sp_verification_decisions` carry both the facts a reviewer needs and
-- the reasoning a holder must never read.
--
--
-- ── A. THE INTERNAL NOTE WAS READABLE BY THE PERSON IT IS ABOUT ────────
--
-- `decision_note` is the reviewer's internal reasoning. `holder_message` is
-- what the candidate is told. The application has been careful about the
-- distinction from the beginning: `listMyVerificationRequests` names its
-- columns one by one and omits the note, and the comment above that select
-- says why.
--
-- None of that is a control. `authenticated` holds table-level SELECT on both
-- tables, and the holder's own RLS policies -- `sp_vr_self` and `sp_vd_read`
-- -- match their rows. So the holder reaches the note by asking for it:
--
--   GET /rest/v1/sp_verification_requests?select=decision_note
--   GET /rest/v1/sp_verification_decisions?select=decision_note
--
-- Both were confirmed against a running stack before this file was written,
-- with a real holder token over HTTP, and both returned the note in full.
-- What a React component chooses not to render is not a privacy boundary.
--
-- The same grant let the holder WRITE the field. `sp_vr_self_insert` allows a
-- holder to insert their own pending request, and INSERT was granted on the
-- whole row, so a candidate could file a request carrying a `decision_note`
-- of their own composition -- text that reaches the reviewer's own detail
-- payload indistinguishable from a colleague's reasoning. Planting was
-- confirmed the same way. Both directions are closed below.
--
-- ── WHY COLUMN GRANTS AND NOT A VIEW OR A NEW RPC ─────────────────────
--
-- The three functions that legitimately read the note -- sp_verifier_decide,
-- sp_verifier_revoke and sp_verifier_request_detail -- are all SECURITY
-- DEFINER and run as the owner, so removing the column from `authenticated`
-- costs the reviewer nothing. Nothing else in the repository selects it.
--
-- A holder-safe view or another RPC would each add a second definition of
-- "what a holder may see", to be kept in step with the policies that already
-- say it. Column privileges put the answer on the column itself, where a
-- crafted request meets it whatever shape the request takes. The existing RLS
-- policies are untouched: WHICH ROWS a principal sees is unchanged, and only
-- WHICH COLUMN is removed.
--
-- ── THE LISTS ARE EXPLICIT, DELIBERATELY ──────────────────────────────
--
-- A future column is then unreadable until someone grants it, rather than
-- readable until someone notices. For a table that holds internal reviewer
-- reasoning that is the correct direction to fail: a missing column is a bug
-- report on the next deploy, a leaked one is not.
--
--
-- ── B. THE REVIEWER WAS DECIDING ON LESS THAN THE DATABASE KNEW ───────
--
-- `sp_verifier_request_detail` returned the claim's title, issuer, country
-- and dates. It did not return `credential_code`, `credential_reference`,
-- `sub_jurisdiction_code` or `authorisation_scope` -- the reference number
-- printed on the certificate, the emirate a Dubai licence is actually valid
-- in, and the limit on a scoped authorisation. A reviewer comparing a
-- document against a claim could not see the fields the document is checked
-- against.
--
-- `previous_versions` was computed for claims only. An employment period
-- corrected by supersession reached the reviewer looking like a first
-- submission, so "the candidate changed this after it was rejected" was
-- invisible on exactly the object where it matters most.
--
-- Additive only: every key this function returned it still returns, with the
-- same name and the same type.

BEGIN;

-- =============================================================================
-- A. Column-level privileges. RLS is untouched.
-- =============================================================================

REVOKE SELECT ON public.sp_verification_requests  FROM authenticated;
REVOKE SELECT ON public.sp_verification_decisions FROM authenticated;
-- INSERT is narrowed to the columns a holder legitimately supplies when
-- filing their own request. Everything a DECISION writes -- the outcome, the
-- method, the validity window, the note, who decided and when -- is written
-- by sp_verifier_decide as SECURITY DEFINER and never by the holder.
REVOKE INSERT ON public.sp_verification_requests  FROM authenticated;

GRANT SELECT (
  id, holder_user_id, claim_id, period_id, request_kind, target_employer_id,
  status, submitted_at, decided_at, decided_by, verification_method,
  holder_message, valid_from, valid_until
) ON public.sp_verification_requests TO authenticated;

GRANT SELECT (
  id, request_id, holder_user_id, decided_by, decider_organisation, decision,
  verification_method, valid_from, valid_until, decided_at
) ON public.sp_verification_decisions TO authenticated;

GRANT INSERT (
  id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status
) ON public.sp_verification_requests TO authenticated;

-- anon held nothing on either table and is re-revoked rather than assumed:
-- this project's hosted database grants new objects to anon by default, and a
-- privacy boundary is the wrong place to rely on a default having been
-- overridden correctly.
REVOKE ALL ON public.sp_verification_requests  FROM anon;
REVOKE ALL ON public.sp_verification_decisions FROM anon;

COMMENT ON COLUMN public.sp_verification_requests.decision_note IS
  'INTERNAL reviewer reasoning. Not granted to authenticated: readable only '
  'through SECURITY DEFINER verifier functions. The holder is told '
  'holder_message.';
COMMENT ON COLUMN public.sp_verification_decisions.decision_note IS
  'INTERNAL reviewer reasoning. Not granted to authenticated: readable only '
  'through SECURITY DEFINER verifier functions.';

-- =============================================================================
-- B. The review detail, carrying the facts the decision is actually about.
-- =============================================================================
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
    -- The claim as the CANDIDATE stated it. `credential_code` and
    -- `credential_reference` are what a certificate is matched against;
    -- `sub_jurisdiction_code` is the difference between a Dubai licence and a
    -- UAE-wide one; `authorisation_scope` is the limit that turns a scoped
    -- approval into a general one when it goes missing.
    --
    -- ── WHY credential_reference IS HERE AND NOWHERE ELSE ────────────
    --
    -- Phase 7 documents it as PRIVATE and keeps it out of every disclosure
    -- package, because to a recipient it is a lookup key into someone else's
    -- register. That boundary is unchanged and still asserted for all five
    -- packages (phase 7 suite, GROUP 3).
    --
    -- The verifier is not a recipient. Matching the number on the certificate
    -- against the number on the claim is the specific act being asked for,
    -- and a reviewer who cannot see the claimed reference is checking a title
    -- against a document. This function is verifier-gated and the column is
    -- reachable through no other path.
    --
    -- `holder_note` is deliberately NOT here. Phase 7 calls it the holder's
    -- private words, and unlike the reference it is not something a document
    -- is checked against.
    'claim', (SELECT jsonb_build_object(
                'id', c.id, 'type', c.claim_type, 'title', c.title,
                'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
                'sub_jurisdiction', c.sub_jurisdiction_code,
                'credential_code', c.credential_code,
                'credential_reference', c.credential_reference,
                'authorisation_scope', c.authorisation_scope,
                'issued_on', c.issued_on, 'valid_from', c.valid_from,
                'valid_until', c.valid_until,
                'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
                'version_no', c.version_no)
                FROM public.sp_claims c WHERE c.id = _r.claim_id),
    'period', (SELECT jsonb_build_object(
                'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
                'started_on', e.started_on, 'ended_on', e.ended_on,
                'employment_type', e.employment_type, 'jurisdiction', e.jurisdiction_code,
                'security_relevance', e.security_relevance,
                'security_fraction', e.security_fraction,
                'fte_fraction', e.fte_fraction,
                'version_no', e.version_no,
                'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state)
                FROM public.sp_experience_periods e WHERE e.id = _r.period_id),
    -- Prior versions of THIS fact, for claims and now for periods too. A
    -- correction by supersession is the signal that this is not a first
    -- submission, and it was reaching the reviewer for one object type only.
    'previous_versions', CASE
      WHEN _r.claim_id IS NOT NULL THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'title', pc.title,
                                            'version_no', pc.version_no,
                                            'lifecycle', pc.lifecycle_state)
                         ORDER BY pc.version_no)
          FROM public.sp_claims pc
         WHERE pc.holder_user_id = _r.holder_user_id
           AND pc.id <> _r.claim_id
           AND pc.id IN (SELECT supersedes_id FROM public.sp_claims WHERE id = _r.claim_id)
      ), '[]'::jsonb)
      ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pe.id,
                                            'title', pe.role_title || ' — ' || pe.employer_name,
                                            'version_no', pe.version_no,
                                            'lifecycle', pe.lifecycle_state)
                         ORDER BY pe.version_no)
          FROM public.sp_experience_periods pe
         WHERE pe.holder_user_id = _r.holder_user_id
           AND pe.id <> _r.period_id
           AND pe.id IN (SELECT supersedes_id FROM public.sp_experience_periods
                          WHERE id = _r.period_id)
      ), '[]'::jsonb)
    END,
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
