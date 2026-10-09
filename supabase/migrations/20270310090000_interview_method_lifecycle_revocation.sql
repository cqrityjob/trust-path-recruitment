BEGIN;
-- CLI-created 20261008181136; filename only renamed to next canonical slot
-- 20270310090000 under docs/release/release-sequence.md.
-- Forward-only eligibility correction. No content/hash, case/snapshot/report,
-- grant row, actor permission, AI switch, worker or cron is rewritten.
-- Existing case continuation/read is deliberately not changed.

-- Case creation and pack lifecycle writes already take this private lock
-- before their row locks (07090000). Include grant INSERT/UPDATE so a revoke
-- and a new case cannot pass each other; no client lock API is granted.
CREATE TRIGGER ri_pilot_grant_serialise BEFORE INSERT OR UPDATE
 ON public.scp_interview_pack_pilot_grants FOR EACH STATEMENT
 EXECUTE FUNCTION scp_private.interview_content_statement_lock();

CREATE OR REPLACE FUNCTION public.scp_interview_guard_pilot_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _status text;
  _expert boolean;
  _legal boolean;
BEGIN
  SELECT content_status INTO _status
    FROM public.scp_interview_pack_versions WHERE id = NEW.pack_version_id FOR SHARE;


  -- Revocation removes authority. It cannot issue, move, extend or rewrite a
  -- grant, and the existing table/RLS rights still decide who may UPDATE.
  -- reason is required by the existing revocation CHECK; actor is attribution.
  IF TG_OP = 'UPDATE' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by','revocation_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by','revocation_reason']) THEN
      RAISE EXCEPTION 'SCP_INTERVIEW_PILOT_REVOCATION_ONLY: no other grant field may change during revocation'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revocation_reason IS NULL OR length(btrim(NEW.revocation_reason)) = 0 THEN
      RAISE EXCEPTION 'scp_interview_pilot_revocation_check: revocation requires a nonblank reason'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- A published pack needs no grant. Issuing one implies the pack is
  -- unpublished, and silently granting against a published version would make
  -- the audit trail lie about why it was reachable.
  IF _status = 'published' THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PILOT_UNNECESSARY: pack version is already published and needs no pilot grant.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _status IN ('retired', 'suspended') THEN
    RAISE EXCEPTION
      'SCP_INTERVIEW_PILOT_ON_WITHDRAWN_PACK: pack version is "%" and cannot be piloted.', _status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A PRODUCTION pilot on unpublished content is the highest-risk case the
  -- product allows, so it carries the strictest precondition: the expert and
  -- legal gates must already have passed at the current content hash. It still
  -- does not publish the pack -- cognitive and product review remain outstanding
  -- and the pack keeps saying it is a hypothesis.
  IF NEW.environment = 'production' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.scp_interview_pack_reviews r
               WHERE r.pack_version_id = NEW.pack_version_id AND r.gate = 'expert'
                 AND r.decision = 'approved'
                 AND r.content_hash_at_review = public.scp_interview_pack_content_hash(NEW.pack_version_id)),
      EXISTS (SELECT 1 FROM public.scp_interview_pack_reviews r
               WHERE r.pack_version_id = NEW.pack_version_id AND r.gate = 'legal'
                 AND r.decision = 'approved'
                 AND r.content_hash_at_review = public.scp_interview_pack_content_hash(NEW.pack_version_id))
      INTO _expert, _legal;

    IF NOT _expert OR NOT _legal THEN
      RAISE EXCEPTION
        'SCP_INTERVIEW_PILOT_PRODUCTION_BLOCKED: a production pilot on unpublished content requires the expert and legal gates approved at the CURRENT content hash (expert=%, legal=%). A pilot grant is not a way around review.',
        _expert, _legal USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END; $$;


CREATE OR REPLACE FUNCTION public.scp_iv_case_start_basis(
  _employer_id uuid, _pack_version_id uuid, _user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _who uuid := coalesce(_user_id, auth.uid());
BEGIN
  -- Starting anything requires an ACTIVE employer, on every path. This is the
  -- half that continuity read access deliberately does NOT carry.
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN NULL;
  END IF;

  -- BESKT PR 2: only a role-interview pack version can start a case.
  SELECT v.content_status INTO _status
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE v.id = _pack_version_id
     AND p.pack_kind = 'role_interview';
  IF _status IS NULL OR _status IN ('suspended', 'retired') THEN
    RETURN NULL;
  END IF;

  -- Strongest basis first, so the audit trail records the real reason.
  IF _status = 'published' THEN
    RETURN 'published';
  END IF;
  IF public.scp_iv_open_pilot_available(_pack_version_id) THEN
    RETURN 'open_pilot';
  END IF;
  IF public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, _who) THEN
    RETURN 'pilot_grant';
  END IF;

  RETURN NULL;
END; $$;

-- These governed RPCs previously locked the version BEFORE their UPDATE's
-- statement trigger took the content lock. Start takes that lock first. Put
-- withdrawal in the same order, keeping the existing publisher check first.
DO $$
DECLARE _signature text; _definition text; _row_lock text :=
 '  SELECT * INTO _v FROM public.scp_interview_pack_versions WHERE id = _pack_version_id FOR UPDATE;';
BEGIN
 FOREACH _signature IN ARRAY ARRAY[
  'public.scp_interview_suspend_version(uuid,text)',
  'public.scp_interview_retire_version(uuid,text)'] LOOP
  SELECT pg_get_functiondef(_signature::regprocedure) INTO _definition;
  IF position('SCP_INTERVIEW_NOT_PUBLISHER' IN _definition)=0
   OR position(_row_lock IN _definition)=0
   OR position('scp_private.interview_content_lock()' IN _definition)>0 THEN
   RAISE EXCEPTION 'SCP_IV_LIFECYCLE_WITHDRAWAL_PRECONDITION: %',_signature;
  END IF;
  EXECUTE replace(_definition,_row_lock,
   E'  PERFORM scp_private.interview_content_lock();\n'||_row_lock);
 END LOOP;
END $$;

-- CREATE OR REPLACE preserves the existing owner/ACL. No grants are widened.
REVOKE ALL ON FUNCTION public.scp_interview_guard_pilot_grant() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.scp_iv_case_start_basis(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.scp_iv_case_start_basis(uuid,uuid,uuid) IS
 'INTERNAL authoritative NEW-case basis. An active employer and role_interview pack are required. Suspended/retired versions return NULL before all pilot-grant fallback. Restricted draft plus a valid individual grant remains supported; existing-case continuation is separate.';
COMMIT;
