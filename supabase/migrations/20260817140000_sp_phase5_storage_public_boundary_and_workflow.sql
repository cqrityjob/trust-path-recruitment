-- =============================================================================
-- Security Passport — Phase 5: private evidence Storage, the public boundary,
-- and the workflow functions the product surfaces actually call.
--
-- Phase 3 proved the trust core. This migration makes it usable without
-- weakening any of it:
--
--   * a PRIVATE `passport-evidence` bucket with holder-scoped Storage RLS and
--     a verifier read that exists only while a review is open;
--   * removal of direct anonymous database execution — the recipient path
--     moves behind the server, where abuse protection can actually be
--     enforced;
--   * a durable, cross-instance throttle for that public path;
--   * narrow SECURITY DEFINER read functions for the verifier queue and the
--     employer attestation queue, because neither role has (or gains) any
--     blanket read over Passport content;
--   * the remaining controlled transitions: withdraw a request, withdraw
--     evidence, raise a dispute, revoke a verification.
--
-- Additive. The two functions REPLACED here (`sp_guard_trust_fields_immutable`
-- and `sp_get_disclosure`) keep their Phase 3 behaviour exactly; each gains
-- one narrow, documented addition and nothing is removed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Reconcile the production hardening applied by hand
-- -----------------------------------------------------------------------------
-- These three are TRIGGER functions. Postgres grants EXECUTE to PUBLIC on
-- every new function, so they carried an anon grant they had no use for. They
-- are not directly callable (a trigger function called as a plain function
-- errors on the missing trigger context), so this was never exploitable — but
-- "not exploitable" is not the same as "not granted", and an audit that counts
-- anon-executable functions should count zero.
--
-- This was applied to the hosted project by hand during the Phase 2 audit.
-- Recording it here makes it replayable: a database rebuilt from migrations
-- alone now reaches the same state as production, which is the only way the
-- migration history can be trusted as the source of truth.
DO $$
BEGIN
  IF to_regprocedure('public.sp_guard_events_append_only()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sp_guard_events_append_only() FROM PUBLIC, anon';
  END IF;
  IF to_regprocedure('public.sp_guard_trust_fields_immutable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sp_guard_trust_fields_immutable() FROM PUBLIC, anon';
  END IF;
  IF to_regprocedure('public.sp_guard_decisions_append_only()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sp_guard_decisions_append_only() FROM PUBLIC, anon';
  END IF;
END $$;

-- Same default-grant problem, different function: Phase 3 created
-- `sp_is_verifier` without an explicit REVOKE, so it inherited EXECUTE for
-- PUBLIC. It is a capability probe — an anonymous caller has no business
-- asking it anything. `authenticated` keeps EXECUTE because the RLS policies
-- and the Storage policies call it as the querying role.
REVOKE ALL ON FUNCTION public.sp_is_verifier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_verifier(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 1. The private evidence bucket
-- -----------------------------------------------------------------------------
-- Private, with the size ceiling and MIME allowlist declared on the bucket as
-- well as in the `sp_evidence` CHECK constraints. Two places, deliberately:
-- the bucket setting stops the bytes arriving, the constraint stops a row
-- claiming something the bucket would have refused.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'passport-evidence',
  'passport-evidence',
  false,
  10485760,                                             -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,                       -- never flips to public
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 2. Storage RLS
-- -----------------------------------------------------------------------------
-- Path convention: `<holder_user_id>/<uuid>.<ext>` — the first folder segment
-- is the owner. Same convention as the existing job-application-cvs bucket, so
-- this is the pattern already proven in this repository rather than a new one.
--
-- `sp_attach_evidence` independently refuses a row whose path does not start
-- with the caller's uid, so a forged metadata row cannot point at somebody
-- else's object even if a Storage policy were later loosened.

DROP POLICY IF EXISTS "sp_evidence_holder_select" ON storage.objects;
DROP POLICY IF EXISTS "sp_evidence_holder_insert" ON storage.objects;
DROP POLICY IF EXISTS "sp_evidence_holder_update" ON storage.objects;
DROP POLICY IF EXISTS "sp_evidence_holder_delete" ON storage.objects;
DROP POLICY IF EXISTS "sp_evidence_verifier_select" ON storage.objects;

CREATE POLICY "sp_evidence_holder_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'passport-evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "sp_evidence_holder_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'passport-evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "sp_evidence_holder_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'passport-evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'passport-evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "sp_evidence_holder_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'passport-evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- The verifier read is bounded by an OPEN REVIEW, not by the role. A platform
-- admin with no request in front of them reads nothing; when the request is
-- decided, the access ends by itself. There is deliberately no employer
-- policy on this bucket at all: an employer attests to employment they have
-- direct knowledge of and never receives the holder's documents.
CREATE POLICY "sp_evidence_verifier_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'passport-evidence'
  AND public.sp_is_verifier(auth.uid())
  AND EXISTS (
    SELECT 1
      FROM public.sp_evidence ev
      JOIN public.sp_verification_requests r
        ON (r.claim_id = ev.claim_id OR r.period_id = ev.period_id)
     WHERE ev.storage_path = storage.objects.name
       AND ev.lifecycle_state = 'active'
       AND r.request_kind = 'cqrityjob_review'
       AND r.status IN ('pending', 'clarification_requested'))
);


-- -----------------------------------------------------------------------------
-- 3. Evidence withdrawal, and the guard change that makes it honest
-- -----------------------------------------------------------------------------
-- Phase 3 allowed self_declared -> document_provided under the evidence
-- context. Withdrawal needs the opposite direction: when the last active
-- document is removed, a claim that was only ever DOCUMENT_PROVIDED must fall
-- back to SELF_DECLARED. Leaving it as DOCUMENT_PROVIDED would assert a
-- document that is no longer there.
--
-- This widens the guard by exactly one transition, and that transition
-- REDUCES the asserted level. The route to VERIFIED is untouched: it remains
-- the transaction-local verification context, set only by
-- `sp_verifier_decide`.
CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assertion_level IS DISTINCT FROM OLD.assertion_level THEN
    IF NEW.assertion_level = 'document_provided'
       AND OLD.assertion_level = 'self_declared'
       AND coalesce(current_setting('sp.evidence_context', true), '') = 'on' THEN
      NULL;
    -- Withdrawal. Only ever downward, and only from document_provided: a
    -- VERIFIED claim is never reduced by removing a file, because the
    -- verification was a decision about the fact, not about the upload.
    ELSIF NEW.assertion_level = 'self_declared'
       AND OLD.assertion_level = 'document_provided'
       AND coalesce(current_setting('sp.evidence_context', true), '') = 'on' THEN
      NULL;
    ELSIF coalesce(current_setting('sp.verification_context', true), '') = 'on' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'SP_TRUST_FIELD_IMMUTABLE: assertion_level may only change through the evidence or verification workflow'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND NEW.lifecycle_state NOT IN ('superseded', 'withdrawn')
     AND coalesce(current_setting('sp.verification_context', true), '') <> 'on' THEN
    RAISE EXCEPTION 'SP_LIFECYCLE_TRANSITION_NOT_ALLOWED: % -> % requires the verification workflow',
      OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_guard_trust_fields_immutable() FROM PUBLIC, anon;


CREATE OR REPLACE FUNCTION public.sp_withdraw_evidence(_evidence_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ev public.sp_evidence%ROWTYPE; _remaining integer;
BEGIN
  SELECT * INTO _ev FROM public.sp_evidence WHERE id = _evidence_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_EVIDENCE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _ev.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Withdrawal is blocked while a reviewer is relying on the file. Pulling
  -- evidence out from under an open review would leave a decision resting on
  -- something nobody can look at again.
  IF EXISTS (SELECT 1 FROM public.sp_verification_requests r
              WHERE r.status IN ('pending','clarification_requested')
                AND ((_ev.claim_id IS NOT NULL AND r.claim_id = _ev.claim_id)
                  OR (_ev.period_id IS NOT NULL AND r.period_id = _ev.period_id))) THEN
    RAISE EXCEPTION 'SP_EVIDENCE_UNDER_REVIEW' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.sp_evidence SET lifecycle_state = 'withdrawn' WHERE id = _evidence_id;

  SELECT count(*) INTO _remaining FROM public.sp_evidence
   WHERE lifecycle_state = 'active'
     AND ((_ev.claim_id IS NOT NULL AND claim_id = _ev.claim_id)
       OR (_ev.period_id IS NOT NULL AND period_id = _ev.period_id));

  IF _remaining = 0 THEN
    PERFORM set_config('sp.evidence_context', 'on', true);
    IF _ev.claim_id IS NOT NULL THEN
      UPDATE public.sp_claims SET assertion_level = 'self_declared'
       WHERE id = _ev.claim_id AND assertion_level = 'document_provided';
    ELSE
      UPDATE public.sp_experience_periods SET assertion_level = 'self_declared'
       WHERE id = _ev.period_id AND assertion_level = 'document_provided';
    END IF;
    PERFORM set_config('sp.evidence_context', 'off', true);
  END IF;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_ev.holder_user_id, auth.uid(), 'claim_corrected',
          CASE WHEN _ev.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_ev.claim_id, _ev.period_id),
          jsonb_build_object('action','evidence_withdrawn','evidence_id',_evidence_id,
                             'remaining_active_evidence',_remaining));
END; $$;

REVOKE ALL ON FUNCTION public.sp_withdraw_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_withdraw_evidence(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4. Holder-side workflow: withdraw a request, raise a dispute
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_withdraw_verification_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _r.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  -- `withdrawn` is one of the two statuses the row-level
  -- sp_vr_decided_has_decider CHECK exempts from needing a decider, which is
  -- correct: nobody decided anything, the holder took the question back.
  UPDATE public.sp_verification_requests SET status = 'withdrawn' WHERE id = _request_id;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'claim_corrected',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('action','request_withdrawn','request_id',_request_id));
END; $$;

REVOKE ALL ON FUNCTION public.sp_withdraw_verification_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_withdraw_verification_request(uuid) TO authenticated;


-- A dispute is the holder saying "this entry is wrong or contested" without
-- silently deleting it. It moves lifecycle only — never assertion_level — so
-- a disputed entry keeps its history and simply stops counting anywhere
-- (countsTowardExperience() already excludes it) and stops being disclosed.
CREATE OR REPLACE FUNCTION public.sp_raise_dispute(_claim_id uuid, _period_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid;
BEGIN
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  PERFORM set_config('sp.verification_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims SET lifecycle_state = 'disputed'
     WHERE id = _claim_id AND lifecycle_state = 'active';
  ELSE
    UPDATE public.sp_experience_periods SET lifecycle_state = 'disputed'
     WHERE id = _period_id AND lifecycle_state = 'active';
  END IF;
  PERFORM set_config('sp.verification_context', 'off', true);

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_corrected',
          CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_claim_id, _period_id),
          jsonb_build_object('action','dispute_raised','reason',left(coalesce(_reason,''), 300)));
END; $$;

REVOKE ALL ON FUNCTION public.sp_raise_dispute(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_raise_dispute(uuid,uuid,text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 5. Verifier-side: revocation, and the two narrow queue reads
-- -----------------------------------------------------------------------------
-- Revocation is the mirror of approval and lives in the same place: only a
-- verifier reaches it, and it writes an append-only decision row against the
-- request that granted the verification in the first place. That keeps the
-- audit chain intact — a recipient looking at history sees the grant and the
-- revocation attributed to the same claim.
CREATE OR REPLACE FUNCTION public.sp_verifier_revoke(_claim_id uuid, _period_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _req_id uuid; _org text;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_VERIFICATION_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Because sp_verifier_decide is the only route to VERIFIED, anything that
  -- can be revoked necessarily has an approved request behind it. If there
  -- is none, something is wrong and we refuse rather than write an
  -- unattributable decision.
  SELECT r.id INTO _req_id
    FROM public.sp_verification_requests r
   WHERE r.status = 'approved'
     AND ((_claim_id IS NOT NULL AND r.claim_id = _claim_id)
       OR (_period_id IS NOT NULL AND r.period_id = _period_id))
   ORDER BY r.decided_at DESC LIMIT 1;
  IF _req_id IS NULL THEN
    RAISE EXCEPTION 'SP_NO_APPROVED_REQUEST_TO_REVOKE' USING ERRCODE='no_data_found';
  END IF;

  _org := 'CQrityjob';

  PERFORM set_config('sp.verification_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims SET lifecycle_state = 'revoked' WHERE id = _claim_id;
  ELSE
    UPDATE public.sp_experience_periods SET lifecycle_state = 'revoked' WHERE id = _period_id;
  END IF;
  PERFORM set_config('sp.verification_context', 'off', true);

  INSERT INTO public.sp_verification_decisions (
    request_id, holder_user_id, decided_by, decider_organisation, decision, decision_note)
  VALUES (_req_id, _holder, auth.uid(), _org, 'revoked', _reason);

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_corrected',
          CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_claim_id, _period_id),
          jsonb_build_object('action','verification_revoked','organisation',_org));
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_revoke(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_revoke(uuid,uuid,text) TO authenticated;


-- The verifier queue. A verifier has NO blanket read over Passport content —
-- the Phase 3 RLS deliberately gives them the request rows and nothing else —
-- so the queue is assembled here, returning exactly the fields a reviewer
-- needs to do the review and no others.
CREATE OR REPLACE FUNCTION public.sp_verifier_queue(_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'submitted_at'), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'submitted_at', r.submitted_at,
      'subject_type', CASE WHEN r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
      'holder_name', coalesce(p.display_name, ''),
      'title', coalesce(c.title, e.role_title),
      'claim_type', c.claim_type,
      'issuer', c.claimed_issuer_name,
      'employer', e.employer_name,
      'jurisdiction', coalesce(c.jurisdiction_code, e.jurisdiction_code),
      'assertion', coalesce(c.assertion_level, e.assertion_level),
      'lifecycle', coalesce(c.lifecycle_state, e.lifecycle_state),
      'evidence_count', (SELECT count(*) FROM public.sp_evidence ev
                          WHERE ev.lifecycle_state = 'active'
                            AND ((r.claim_id IS NOT NULL AND ev.claim_id = r.claim_id)
                              OR (r.period_id IS NOT NULL AND ev.period_id = r.period_id)))
    ) AS x
    FROM public.sp_verification_requests r
    LEFT JOIN public.sp_claims c              ON c.id = r.claim_id
    LEFT JOIN public.sp_experience_periods e  ON e.id = r.period_id
    LEFT JOIN public.sp_passport_profiles p   ON p.holder_user_id = r.holder_user_id
   WHERE r.request_kind = 'cqrityjob_review'
     AND (_status IS NULL OR r.status = _status)
     AND (_status IS NOT NULL OR r.status IN ('pending','clarification_requested'))
  ) s;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_queue(text) TO authenticated;


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
    -- Previous versions of the same claim, so a reviewer sees what changed
    -- rather than judging a corrected entry with no history.
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


-- -----------------------------------------------------------------------------
-- 6. Employer attestation queue — the narrowest read in the product
-- -----------------------------------------------------------------------------
-- An employer representative sees ONE thing: the employment period they are
-- being asked about, and the name of the person asking. No qualifications, no
-- other employment, no evidence, no Passport, and no way to enumerate holders.
-- Everything not in this SELECT list is unreachable for them.
CREATE OR REPLACE FUNCTION public.sp_employer_attestation_queue(_employer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'submitted_at' DESC), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'submitted_at', r.submitted_at,
      'decided_at', r.decided_at,
      'holder_name', coalesce(p.display_name, ''),
      'role_title', e.role_title,
      'employer_name', e.employer_name,
      'started_on', e.started_on,
      'ended_on', e.ended_on,
      'employment_type', e.employment_type,
      'fte_fraction', e.fte_fraction,
      'security_relevance', e.security_relevance,
      'holder_message', r.holder_message
    ) AS x
    FROM public.sp_verification_requests r
    JOIN public.sp_experience_periods e      ON e.id = r.period_id
    LEFT JOIN public.sp_passport_profiles p  ON p.holder_user_id = r.holder_user_id
   WHERE r.request_kind = 'employer_attestation'
     AND r.target_employer_id = _employer_id
  ) s;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_employer_attestation_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_employer_attestation_queue(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 7. The public boundary
-- -----------------------------------------------------------------------------
-- Phase 3 granted `sp_get_disclosure` to anon so the recipient page could call
-- it directly. That works, but it puts the only public endpoint in the product
-- somewhere no rate limit can reach: anon can POST /rest/v1/rpc/... at will,
-- and the application has no way to see it, let alone throttle it.
--
-- The execution moves behind the application server, which already exists for
-- every other server-side read in this repository. anon loses direct database
-- execution entirely; the server calls the same, unchanged function.

-- Durable, cross-instance. An in-process counter resets on every deploy and is
-- per-instance, which is not a control at all under horizontal scaling.
CREATE TABLE IF NOT EXISTS public.sp_public_access_throttle (
  client_hash  text        NOT NULL,
  window_start timestamptz NOT NULL,
  attempts     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (client_hash, window_start)
);

ALTER TABLE public.sp_public_access_throttle ENABLE ROW LEVEL SECURITY;
-- No policies, deliberately: with RLS on and no policy, every role except
-- service_role and the definer reads and writes nothing.
REVOKE ALL ON public.sp_public_access_throttle FROM anon, authenticated;

COMMENT ON TABLE public.sp_public_access_throttle IS
  'Rate-limit state for the public recipient path. Keyed by a hash of the '
  'client hint — never a raw IP address.';

CREATE OR REPLACE FUNCTION public.sp_throttle_public_access(
  _client_hash text, _limit integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _window timestamptz; _attempts integer;
BEGIN
  _window := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.sp_public_access_throttle (client_hash, window_start, attempts)
  VALUES (coalesce(_client_hash, 'unknown'), _window, 1)
  ON CONFLICT (client_hash, window_start)
  DO UPDATE SET attempts = public.sp_public_access_throttle.attempts + 1
  RETURNING attempts INTO _attempts;

  -- Opportunistic cleanup; cheap enough to do inline and avoids needing a
  -- scheduled job for a table that is pure ephemeral state.
  IF random() < 0.01 THEN
    DELETE FROM public.sp_public_access_throttle WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN _attempts <= _limit;
END; $$;

REVOKE ALL ON FUNCTION public.sp_throttle_public_access(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_throttle_public_access(text,integer,integer) TO service_role;


-- `sp_get_disclosure` keeps its Phase 3 body verbatim, including the
-- claim-specific attribution join that a Phase 3 assertion caught being wrong.
-- One field is added: an AGGREGATE of verified experience in days.
--
-- Why aggregate rather than the period list: the locked Passport Card shows
-- verified tenure recognition, and the Public Passport Card package must not
-- disclose employer names. A total is strictly less revealing than the list
-- the other packages already carry, and it is what the recognition ladder
-- consumes.
CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.sp_disclosures%ROWTYPE; _p public.sp_passport_profiles%ROWTYPE; _payload jsonb;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures
   WHERE token_hash = encode(digest(coalesce(_token,''), 'sha256'), 'hex');

  IF NOT FOUND OR _d.revoked_at IS NOT NULL
     OR (_d.expires_at IS NOT NULL AND _d.expires_at < now()) THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id = _d.holder_user_id;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  _payload := jsonb_build_object(
    'status','active',
    'package', _d.package_code,
    'purpose', _d.purpose,
    'expires_at', _d.expires_at,
    'last_updated', greatest(_p.updated_at, _d.created_at),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        'issued_on', c.issued_on, 'valid_until', c.valid_until,
        'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
        'verified_at', c.verified_at,
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.claim_id = c.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1)))
      FROM public.sp_claims c
      WHERE c.holder_user_id = _d.holder_user_id
        AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active'
        AND _d.package_code IN ('verified_qualifications','employer_review','full_verification','public_card')
    ), '[]'::jsonb),
    'verified_experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
        'started_on', e.started_on, 'ended_on', e.ended_on,
        'jurisdiction', e.jurisdiction_code,
        'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state))
      FROM public.sp_experience_periods e
      WHERE e.holder_user_id = _d.holder_user_id
        AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
        AND _d.package_code IN ('verified_experience','employer_review','full_verification')
    ), '[]'::jsonb),
    -- Aggregate only. Interval union is applied on the server from the period
    -- list where the package carries one; for the card package, where it does
    -- not, this total is the whole of what is disclosed about experience.
    'verified_experience_days', coalesce((
      SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
        FROM public.sp_experience_periods e
       WHERE e.holder_user_id = _d.holder_user_id
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
    ), 0));

  RETURN _payload;
END; $$;

-- The boundary change itself. anon can no longer execute anything in this
-- schema; the server calls it with the service role, behind the throttle.
REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

COMMENT ON FUNCTION public.sp_get_disclosure IS
  'Recipient payload, assembled from the package contract. Called ONLY by the '
  'application server (service_role) behind sp_throttle_public_access. anon '
  'has no direct execution on this or any other sp_* function.';
