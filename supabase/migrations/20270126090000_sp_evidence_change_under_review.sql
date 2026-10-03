-- =============================================================================
-- 20270126090000 -- Security Passport: evidence added under an open review
-- binds the decision too.
--
-- Follows 20270125090000, which binds a review decision to the request's
-- content epoch (submitted_at) and refuses a stale or unbound decision on a
-- request whose content changed. sp_attach_evidence did not take part: a
-- holder can attach a document while a request is pending or awaiting a
-- clarification, the epoch stayed put, and a reviewer who loaded the request
-- before the new document could approve from that page (reproduced: the
-- reviewer saw 1 document, 2 were on file, the approval went through).
-- Withdrawing evidence under review is already refused
-- (SP_EVIDENCE_UNDER_REVIEW, 20260817140000).
--
-- The correction: attaching evidence to an entry with an open request moves
-- that request's submitted_at (clock_timestamp()) and sets answered_at, the
-- marker 20270125090000 reads. The decision path then refuses a page loaded
-- before the document and a bare call, exactly as for an edited entry. The
-- request's status is unchanged. Otherwise the body is the hosted one
-- (20270114090000), pinned by the rollback.
--
-- Release order: AFTER the application passes the reviewed version
-- (sp_verifier_decide_reviewed) -- until then the application's bare call
-- would be refused for a request answered by a document.
--
-- Rollback: supabase/rollback/20270126090000_sp_evidence_change_under_review_rollback.sql
-- Suite:    supabase/tests/sp_decision_bound_to_reviewed_content_test.sql, SR6
-- =============================================================================

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

  -- 20270126090000: evidence added while a review is open is part of what
  -- the reviewer decides on. The request's content epoch moves, and the
  -- request is marked as changed under review, so a page loaded before the
  -- new document fails safely (SP_REVIEW_STALE) and a decision must name the
  -- version that shows it. Runs on the request row the decision locks
  -- (SELECT ... FOR UPDATE), so an attach and a decision serialise. Status is
  -- not changed: an answer by document keeps the existing flow.
  UPDATE public.sp_verification_requests r
     SET submitted_at = clock_timestamp(), answered_at = clock_timestamp()
   WHERE r.status IN ('pending', 'clarification_requested')
     AND ((_claim_id IS NOT NULL AND r.claim_id = _claim_id)
       OR (_period_id IS NOT NULL AND r.period_id = _period_id));

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

DO $$
BEGIN
  IF position('20270126090000' IN (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_EVIDENCE_UNDER_REVIEW_PROOF: sp_attach_evidence does not move the review epoch';
  END IF;
  IF has_function_privilege('anon', 'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_EVIDENCE_UNDER_REVIEW_PROOF: anon may attach evidence';
  END IF;
  RAISE NOTICE 'SP_EVIDENCE_UNDER_REVIEW_PROOF ok: evidence added under review binds the decision';
END $$;
