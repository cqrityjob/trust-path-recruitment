-- =============================================================================
-- P1-E -- a Passport request or evidence names exactly one entry, and it is
-- the holder's own
-- =============================================================================
--
-- THE DEFECT (2026-10-02 full re-audit, P1-E, reproduced on production inside
-- a rolled-back transaction):
--
--   sp_attach_evidence and sp_submit_for_verification take both a claim and a
--   period. When a claim was named they checked only the claim's holder, then
--   stored the period exactly as passed -- another holder's period. Holder A,
--   naming A's own claim and holder B's period:
--     - attached A's file to B's period, which B's verifier dossier then
--       showed and B could not withdraw (SP_EVIDENCE_UNDER_REVIEW);
--     - opened a CQrityjob review on B's period, which blocked B's own
--       submission (SP_REQUEST_ALREADY_OPEN) and, once a verifier approved,
--       put "CQrityjob / document_review" provenance on B's period in B's
--       disclosures -- after which B's period could be revoked.
--   sp_raise_dispute and sp_verifier_revoke accept the same pair with the
--   same ambiguity. Nothing at the table level tied a request or an evidence
--   row to its holder's own entry.
--
-- THE INVARIANT: every evidence row and verification request names exactly
-- one entry -- a claim or a period -- and that entry belongs to the row's
-- holder.
--
-- THE FIX (two layers):
--   1. Functions. sp_attach_evidence, sp_submit_for_verification,
--      sp_raise_dispute and sp_verifier_revoke refuse unless exactly one of
--      claim and period is named (SP_TARGET_AMBIGUOUS), before anything is
--      read or written -- the rule sp_resolve_dispute already applies. The
--      holder check then always covers the one entry used. The application
--      always names exactly one (src/lib/security-passport/rpc.ts).
--   2. Tables. sp_evidence and sp_verification_requests each gain a CHECK
--      that exactly one of claim_id / period_id is set, and composite foreign
--      keys (claim_id, holder_user_id) -> sp_claims (id, holder_user_id) and
--      (period_id, holder_user_id) -> sp_experience_periods (id,
--      holder_user_id), so no writer -- now or later -- can attach a row to
--      another holder's entry. The two referenced pairs get UNIQUE
--      constraints (id is already unique, so they hold by construction).
--
-- NOT CHANGED: every legitimate call (one entry, one's own); the existing
-- foreign keys and their ON DELETE CASCADE; grants; reads; any row. Hosted
-- (read-only, 2026-10-02): 12 evidence rows and 11 requests, none naming both
-- entries and none pointing at another holder's entry; 149 Passport events,
-- none about another holder's entry.
--
-- Rollback: supabase/rollback/20270114090000_sp_passport_target_holder_rollback.sql
-- Suite:    supabase/tests/sp_passport_target_holder_test.sql
-- =============================================================================

-- ── 0. Precondition: nothing to repair ───────────────────────────────────
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY[
    'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)',
    'public.sp_submit_for_verification(uuid,uuid,text,uuid)',
    'public.sp_raise_dispute(uuid,uuid,text)',
    'public.sp_verifier_revoke(uuid,uuid,text)'] LOOP
    IF to_regprocedure(_s) IS NULL THEN
      RAISE EXCEPTION 'SP_TARGET_HOLDER_PRECONDITION: % is missing', _s;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.sp_evidence WHERE num_nonnulls(claim_id, period_id) <> 1)
     OR EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE num_nonnulls(claim_id, period_id) <> 1)
     OR EXISTS (SELECT 1 FROM public.sp_evidence e JOIN public.sp_claims c ON c.id = e.claim_id
                 WHERE c.holder_user_id <> e.holder_user_id)
     OR EXISTS (SELECT 1 FROM public.sp_evidence e JOIN public.sp_experience_periods p ON p.id = e.period_id
                 WHERE p.holder_user_id <> e.holder_user_id)
     OR EXISTS (SELECT 1 FROM public.sp_verification_requests r JOIN public.sp_claims c ON c.id = r.claim_id
                 WHERE c.holder_user_id <> r.holder_user_id)
     OR EXISTS (SELECT 1 FROM public.sp_verification_requests r JOIN public.sp_experience_periods p ON p.id = r.period_id
                 WHERE p.holder_user_id <> r.holder_user_id) THEN
    RAISE EXCEPTION 'SP_TARGET_HOLDER_PRECONDITION: an evidence row or request names two entries or another holder''s entry; investigate before applying';
  END IF;
END $$;

-- ── 1. The functions refuse two entries ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_attach_evidence(_claim_id uuid, _period_id uuid, _storage_path text, _file_name text, _mime_type text, _size_bytes integer, _sha256 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _holder uuid; _id uuid;
BEGIN
  -- 20270114090000: exactly one target. With both named, only the claim's
  -- holder was checked and the period was used as passed -- another
  -- holder's period.
  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS: name exactly one of claim or period' USING ERRCODE = 'check_violation';
  END IF;

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

  -- 20270114090000: exactly one target. With both named, only the claim's
  -- holder was checked and the period was used as passed -- another
  -- holder's period.
  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS: name exactly one of claim or period' USING ERRCODE = 'check_violation';
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
  -- 20270114090000: exactly one target. With both named, only the claim's
  -- holder was checked and the period was used as passed -- another
  -- holder's period.
  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS: name exactly one of claim or period' USING ERRCODE = 'check_violation';
  END IF;

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

  -- 20270114090000: exactly one target. With both named, only the claim's
  -- holder was checked and the period was used as passed -- another
  -- holder's period.
  IF (_claim_id IS NULL) = (_period_id IS NULL) THEN
    RAISE EXCEPTION 'SP_TARGET_AMBIGUOUS: name exactly one of claim or period' USING ERRCODE = 'check_violation';
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

-- ── 2. The tables: one entry, the holder's own ───────────────────────────
ALTER TABLE public.sp_claims
  ADD CONSTRAINT sp_claims_id_holder_key UNIQUE (id, holder_user_id);
ALTER TABLE public.sp_experience_periods
  ADD CONSTRAINT sp_experience_periods_id_holder_key UNIQUE (id, holder_user_id);

ALTER TABLE public.sp_evidence
  ADD CONSTRAINT sp_evidence_exactly_one_target
    CHECK (num_nonnulls(claim_id, period_id) = 1),
  ADD CONSTRAINT sp_evidence_claim_same_holder
    FOREIGN KEY (claim_id, holder_user_id) REFERENCES public.sp_claims (id, holder_user_id) ON DELETE CASCADE,
  ADD CONSTRAINT sp_evidence_period_same_holder
    FOREIGN KEY (period_id, holder_user_id) REFERENCES public.sp_experience_periods (id, holder_user_id) ON DELETE CASCADE;

ALTER TABLE public.sp_verification_requests
  ADD CONSTRAINT sp_vr_exactly_one_target
    CHECK (num_nonnulls(claim_id, period_id) = 1),
  ADD CONSTRAINT sp_vr_claim_same_holder
    FOREIGN KEY (claim_id, holder_user_id) REFERENCES public.sp_claims (id, holder_user_id) ON DELETE CASCADE,
  ADD CONSTRAINT sp_vr_period_same_holder
    FOREIGN KEY (period_id, holder_user_id) REFERENCES public.sp_experience_periods (id, holder_user_id) ON DELETE CASCADE;

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _s text; _c text;
BEGIN
  FOREACH _s IN ARRAY ARRAY[
    'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)',
    'public.sp_submit_for_verification(uuid,uuid,text,uuid)',
    'public.sp_raise_dispute(uuid,uuid,text)',
    'public.sp_verifier_revoke(uuid,uuid,text)'] LOOP
    IF position('SP_TARGET_AMBIGUOUS' IN (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'SP_TARGET_HOLDER_PROOF: % does not refuse two entries', _s;
    END IF;
  END LOOP;
  FOREACH _c IN ARRAY ARRAY['sp_evidence_exactly_one_target', 'sp_evidence_claim_same_holder',
                            'sp_evidence_period_same_holder', 'sp_vr_exactly_one_target',
                            'sp_vr_claim_same_holder', 'sp_vr_period_same_holder',
                            'sp_claims_id_holder_key', 'sp_experience_periods_id_holder_key'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = _c AND convalidated) THEN
      RAISE EXCEPTION 'SP_TARGET_HOLDER_PROOF: constraint % is missing or not validated', _c;
    END IF;
  END LOOP;
  RAISE NOTICE 'SP_TARGET_HOLDER_PROOF ok: every request and evidence row names one entry, its holder''s own';
END $$;
