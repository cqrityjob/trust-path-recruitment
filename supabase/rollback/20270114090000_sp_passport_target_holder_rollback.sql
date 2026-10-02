-- Rollback for 20270114090000_sp_passport_target_holder.
--
-- Drops the six table constraints and the two referenced UNIQUE pairs, and
-- restores the four functions exactly as hosted before (md5(prosrc) pinned
-- below). This REOPENS P1-E of the 2026-10-02 re-audit: a holder naming their
-- own claim and another holder's period can again attach evidence to, and
-- open a review on, that other holder's period. No row is touched.

ALTER TABLE public.sp_verification_requests
  DROP CONSTRAINT IF EXISTS sp_vr_period_same_holder,
  DROP CONSTRAINT IF EXISTS sp_vr_claim_same_holder,
  DROP CONSTRAINT IF EXISTS sp_vr_exactly_one_target;
ALTER TABLE public.sp_evidence
  DROP CONSTRAINT IF EXISTS sp_evidence_period_same_holder,
  DROP CONSTRAINT IF EXISTS sp_evidence_claim_same_holder,
  DROP CONSTRAINT IF EXISTS sp_evidence_exactly_one_target;
ALTER TABLE public.sp_experience_periods DROP CONSTRAINT IF EXISTS sp_experience_periods_id_holder_key;
ALTER TABLE public.sp_claims DROP CONSTRAINT IF EXISTS sp_claims_id_holder_key;

CREATE OR REPLACE FUNCTION public.sp_attach_evidence(_claim_id uuid, _period_id uuid, _storage_path text, _file_name text, _mime_type text, _size_bytes integer, _sha256 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _holder uuid; _id uuid;
BEGIN
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  -- The path's first segment is the owner, matching the Storage policy. A
  -- mismatch here would mean a row pointing at somebody else's object.
  IF split_part(_storage_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'SP_EVIDENCE_PATH_NOT_OWNED' USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO public.sp_evidence (
    holder_user_id, claim_id, period_id, storage_path, file_name, mime_type, size_bytes, sha256)
  VALUES (_holder, _claim_id, _period_id, _storage_path, _file_name, _mime_type, _size_bytes, _sha256)
  RETURNING id INTO _id;

  PERFORM set_config('sp.evidence_context', 'on', true);
  IF _claim_id IS NOT NULL THEN
    UPDATE public.sp_claims SET assertion_level = 'document_provided'
     WHERE id = _claim_id AND assertion_level = 'self_declared';
  ELSE
    UPDATE public.sp_experience_periods SET assertion_level = 'document_provided'
     WHERE id = _period_id AND assertion_level = 'self_declared';
  END IF;
  PERFORM set_config('sp.evidence_context', 'off', true);

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_holder, auth.uid(), 'claim_corrected',
          CASE WHEN _claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_claim_id, _period_id),
          jsonb_build_object('evidence_id', _id, 'assertion_level', 'document_provided'));
  RETURN _id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(_claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _holder uuid; _id uuid; _employer_status text;
BEGIN
  -- An employer confirms employment. A request that asks one to confirm
  -- anything else is refused before it is a row, whoever is asking.
  IF _kind = 'employer_attestation' AND (_period_id IS NULL OR _claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='check_violation';
  END IF;

  -- NEW. The organisation being asked must be one CQrityjob has approved.
  --
  -- Placed before the holder check on purpose, and it is the one ordering
  -- decision in this function that discloses anything: it means a caller
  -- learns that an id is not an eligible employer without having proved they
  -- own the entry. That is acceptable here and would not be elsewhere --
  -- eligibility is a property of an ORGANISATION, the same organisations are
  -- already listed publicly by the job site, and the alternative is a
  -- candidate whose request is refused for the wrong stated reason. Nothing
  -- about the ENTRY is revealed either way; that check still stands below.
  --
  -- NULL is refused explicitly rather than left to the table CHECK. The
  -- constraint (`sp_vr_employer_kind_has_employer`, 20260817120000) already makes the
  -- row unwritable, but it surfaces as a constraint name from inside the
  -- database, and this function's contract is that a caller gets a sentence
  -- it can act on.
  IF _kind = 'employer_attestation' THEN
    IF _employer_id IS NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_REQUIRED' USING ERRCODE='check_violation';
    END IF;
    SELECT status INTO _employer_status FROM public.employers WHERE id = _employer_id;
    IF _employer_status IS NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_NOT_FOUND' USING ERRCODE='no_data_found';
    END IF;
    IF _employer_status <> 'active' THEN
      RAISE EXCEPTION 'SP_EMPLOYER_NOT_ELIGIBLE' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;

  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  IF EXISTS (SELECT 1 FROM public.sp_verification_requests
              WHERE status IN ('pending','clarification_requested')
                AND (claim_id = _claim_id OR period_id = _period_id)) THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_OPEN' USING ERRCODE='check_violation';
  END IF;

  -- The check above is a read followed by a write, and a concurrent
  -- submission fits between them. The partial unique indexes decide it; this
  -- block only translates their refusal back into the answer this function
  -- has always given, so the loser of the race and a caller who simply asked
  -- twice read the same sentence.
  BEGIN
    INSERT INTO public.sp_verification_requests (
      holder_user_id, claim_id, period_id, request_kind, target_employer_id)
    VALUES (_holder, _claim_id, _period_id, _kind, _employer_id)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_OPEN' USING ERRCODE='check_violation';
  END;
  RETURN _id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.sp_raise_dispute(_claim_id uuid, _period_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$
;

CREATE OR REPLACE FUNCTION public.sp_verifier_revoke(_claim_id uuid, _period_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$
;

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)'::regprocedure));
  IF _m <> '265695d93ef6c8489ee176e985fe9c04' THEN
    RAISE EXCEPTION 'SP_TARGET_HOLDER_ROLLBACK: sp_attach_evidence is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_submit_for_verification(uuid,uuid,text,uuid)'::regprocedure));
  IF _m <> '5f10ce0fac1788245d22d4496730f4e3' THEN
    RAISE EXCEPTION 'SP_TARGET_HOLDER_ROLLBACK: sp_submit_for_verification is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_raise_dispute(uuid,uuid,text)'::regprocedure));
  IF _m <> 'c67dcfc8f0af5bbc0932a3892f447562' THEN
    RAISE EXCEPTION 'SP_TARGET_HOLDER_ROLLBACK: sp_raise_dispute is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_verifier_revoke(uuid,uuid,text)'::regprocedure));
  IF _m <> 'd8ef4bda44d3f5a71039c9abf4c05779' THEN
    RAISE EXCEPTION 'SP_TARGET_HOLDER_ROLLBACK: sp_verifier_revoke is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'SP_TARGET_HOLDER_ROLLBACK ok: hosted pre-fix bodies in place';
END $$;
