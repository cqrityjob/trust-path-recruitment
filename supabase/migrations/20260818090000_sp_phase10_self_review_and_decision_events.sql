-- =============================================================================
-- Security Passport — Phase 10: a review the verifier may not decide, and an
-- audit event that says what actually happened.
--
-- ── WHY ────────────────────────────────────────────────────────────────
--
-- Production defect: the platform admin submitted a credential for review on
-- their own account, then opened the verification queue and tried to approve
-- it. `sp_verifier_decide` refused with SP_SELF_VERIFICATION_FORBIDDEN
-- (SQLSTATE 42501) at the self-verification guard — correctly, before writing
-- anything. Nobody may verify their own claim; that boundary is the product.
--
-- The defect is NOT the refusal. It is that the queue offered a decision that
-- could never succeed: the verifier read the entry, opened the evidence, typed
-- a note and a holder message, confirmed a permanent record, and only then
-- learned the action was impossible. Nothing in the payload said "this one is
-- yours".
--
-- So this migration does not weaken the guard. It tells the caller, before
-- they act, what the guard already knows.
--
-- ── WHAT CHANGES ───────────────────────────────────────────────────────
--
--   1. `sp_verifier_queue` and `sp_verifier_request_detail` emit `is_self`,
--      computed from `auth.uid()` INSIDE the function. The client cannot
--      influence it and gains no new data: it is one boolean about the
--      caller's own identity, on rows a verifier could already see.
--
--   2. The `sp_passport_events` event-type allowlist gains two members that
--      the application already tries to write:
--
--      * `claim_drafted` — `saveCredentialDraft` writes it whenever a
--        credential is saved without activating. The CHECK rejected it with
--        23514, and because that insert's error was never read, the draft was
--        created while its audit event was silently dropped. A gap in an
--        append-only history that nothing reported is worse than a failure.
--
--      * `verification_decided` — `sp_verifier_decide` wrote `claim_corrected`
--        for every decision, which is the SAME type the correction workflow
--        writes. A verification and a holder's correction were therefore
--        indistinguishable in the audit trail, and the trail exists precisely
--        to tell them apart.
--
--      Both are additive. Existing rows keep the type they were written with,
--      because history is not rewritten to look tidier.
--
-- Nothing here changes authorization: no grant is widened, no RLS policy is
-- touched, every capability check in every replaced function is carried over
-- unchanged, and each keeps its fixed `search_path`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Event-type allowlist — additive
-- -----------------------------------------------------------------------------
ALTER TABLE public.sp_passport_events
  DROP CONSTRAINT IF EXISTS sp_passport_events_event_type_check;

ALTER TABLE public.sp_passport_events
  ADD CONSTRAINT sp_passport_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'passport_created',
    'onboarding_progressed',
    'onboarding_completed',
    'experience_created',
    'experience_corrected',
    'experience_withdrawn',
    'claim_created',
    'claim_drafted',
    'claim_corrected',
    'claim_withdrawn',
    'verification_decided',
    'privacy_changed',
    'declaration_recorded'
  ]));


-- -----------------------------------------------------------------------------
-- 2. The decision — same transaction, same guards, honest event type
-- -----------------------------------------------------------------------------
-- Byte-for-byte the deployed function except for the event type on the final
-- INSERT. Reproduced in full rather than patched because CREATE OR REPLACE
-- rewrites the whole body, and a reviewer must be able to see that no guard
-- quietly disappeared in the rewrite.
CREATE OR REPLACE FUNCTION public.sp_verifier_decide(
  _request_id uuid, _decision text, _method text, _decision_note text,
  _holder_message text, _valid_from date, _valid_until date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  -- The boundary the production defect ran into. It stays exactly as it was.
  IF _r.holder_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_VERIFICATION_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _r.request_kind = 'cqrityjob_review' THEN
    IF NOT public.sp_is_verifier(auth.uid()) THEN
      RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
    END IF;
    _org := 'CQrityjob';
  ELSE
    IF NOT public.has_employer_role(auth.uid(), _r.target_employer_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
    END IF;
    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.sp_verification_requests
     SET status = _decision, decided_at = now(), decided_by = auth.uid(),
         verification_method = _method, decision_note = _decision_note,
         holder_message = _holder_message, valid_from = _valid_from, valid_until = _valid_until
   WHERE id = _request_id;

  INSERT INTO public.sp_verification_decisions (
    request_id, holder_user_id, decided_by, decider_organisation, decision,
    verification_method, decision_note, valid_from, valid_until)
  VALUES (_request_id, _r.holder_user_id, auth.uid(), _org, _decision,
          _method, _decision_note, _valid_from, _valid_until);

  IF _decision = 'approved' THEN
    PERFORM set_config('sp.verification_context', 'on', true);
    IF _r.claim_id IS NOT NULL THEN
      UPDATE public.sp_claims
         SET assertion_level = 'verified', verified_by_user_id = auth.uid(), verified_at = now(),
             valid_from = coalesce(_valid_from, valid_from), valid_until = coalesce(_valid_until, valid_until)
       WHERE id = _r.claim_id;
    ELSE
      UPDATE public.sp_experience_periods
         SET assertion_level = 'verified'
       WHERE id = _r.period_id;
    END IF;
    PERFORM set_config('sp.verification_context', 'off', true);
  END IF;

  -- Was 'claim_corrected', which is what a HOLDER correcting their own entry
  -- writes. A decision by someone else is a different event and now says so.
  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'verification_decided',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('decision', _decision, 'method', _method, 'organisation', _org));
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. The queue — same rows, same verifier check, plus `is_self`
-- -----------------------------------------------------------------------------
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
      -- Whether the caller is the holder. Computed here, from auth.uid(), so
      -- the browser cannot assert it and the answer always matches the guard
      -- inside `sp_verifier_decide`.
      'is_self', (r.holder_user_id = auth.uid()),
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


-- -----------------------------------------------------------------------------
-- 4. The review detail — same payload, plus `is_self`
-- -----------------------------------------------------------------------------
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
