-- Submitting an application and disclosing a Passport are ONE decision.
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────────
--
-- 20260903091000 built the whole application-scoped disclosure model: the
-- holder-authorised creator, the membership-checked employer read, the
-- one-live-disclosure index, the shared payload builder. It is complete and
-- correct, and nothing ever called it during submission.
--
-- So a candidate with a fully verified Passport applied for a job and the
-- employer's application page said "Ingen Security Passport-information har
-- delats med er för den här ansökan." The infrastructure was right; the
-- product connection was missing.
--
-- ── WHY THIS IS A DATABASE FUNCTION AND NOT TWO BROWSER CALLS ───────────
--
-- The obvious fix is to insert the application and then call
-- sp_share_passport_with_application from the server function. That produces
-- a state the contract cannot describe: the application exists, the
-- disclosure does not, and the candidate has been told their Passport was
-- included. Retrying then risks a second application; not retrying leaves a
-- silent lie.
--
-- Both writes therefore happen inside ONE function, which is one transaction.
-- If the disclosure cannot be created the application insert is rolled back
-- with it, and the caller can honestly report that nothing was submitted.
--
-- ── WHY SECURITY INVOKER ────────────────────────────────────────────────
--
-- This function must not be able to write an application the caller could not
-- write themselves. It is deliberately INVOKER, so every RLS policy, trigger
-- and unique index on job_applications applies exactly as it does today --
-- including the duplicate-application protection, which is untouched. The one
-- privileged step, creating the disclosure, is delegated to the existing
-- SECURITY DEFINER function, which re-checks that the caller owns the
-- application it is being pointed at.
--
-- ── APPLICATION IS STILL NOT CONSENT ────────────────────────────────────
--
-- `_include_passport` defaults to FALSE. A caller that says nothing shares
-- nothing, so nothing about this function makes applying imply disclosure.
-- The candidate's authorisation is the explicit true they send with the
-- submission, and it is recorded by the existing sp_passport_events write
-- inside sp_share_passport_with_application.
--
-- ── NO EMPTY DISCLOSURES ────────────────────────────────────────────────
--
-- A disclosure whose payload would contain no verified record is not created.
-- It would give the employer a panel that says nothing and give the holder a
-- share to manage that discloses nothing.
--
-- ── PACKAGE ─────────────────────────────────────────────────────────────
--
-- `employer_review` -- fixed, not chosen at submission. It is the existing
-- package whose contract is exactly what an employer assessing an
-- application may see: identity, profession and jurisdiction, verified
-- qualifications, verified employment, verifier attribution and validity;
-- never evidence files, self-declared entries, contact details or internal
-- notes. No package is added, widened or redefined here.
--
-- Remediation: drop this one function. Nothing that existed before depends
-- on it, and submission falls back to the path that never disclosed.

CREATE OR REPLACE FUNCTION public.sp_submit_application_with_passport(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _status   text;
  _shared   boolean := false;
  _eligible boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The application insert. INVOKER, so RLS, the BEFORE INSERT trigger and the
  -- partial unique index that prevents a duplicate application all apply
  -- unchanged -- this function adds no way to write a row the caller could not
  -- write directly.
  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    _cv_storage_path, _cv_original_filename, 'application/pdf', _cv_size_bytes,
    now())
  RETURNING status INTO _status;

  IF _include_passport THEN
    -- Eligibility is checked here rather than left to fail inside the sharing
    -- function, because "you have nothing verified yet" is a normal outcome
    -- that must submit the application, not an error that rolls it back.
    SELECT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                    WHERE holder_user_id = auth.uid())
       AND (EXISTS (SELECT 1 FROM public.sp_claims c
                     WHERE c.holder_user_id = auth.uid()
                       AND c.assertion_level = 'verified'
                       AND c.lifecycle_state = 'active')
         OR EXISTS (SELECT 1 FROM public.sp_experience_periods e
                     WHERE e.holder_user_id = auth.uid()
                       AND e.assertion_level = 'verified'
                       AND e.lifecycle_state = 'active'))
      INTO _eligible;

    IF _eligible THEN
      -- Same creator the sharing surfaces use. It re-checks that the caller
      -- owns this application, so the check is not merely repeated here -- it
      -- is enforced where the row is written. Any failure raises, and the
      -- application insert above rolls back with it.
      PERFORM public.sp_share_passport_with_application(
        _application_id, 'employer_review', 30, NULL, NULL);
      _shared := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _application_id,
    'status', _status,
    -- The literal truth of what happened, for copy that must not overstate:
    -- `requested` says what the candidate asked for, `passport_shared` says
    -- what the database actually did.
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;

COMMENT ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) IS
  'Submits one job application and, when the candidate explicitly asked for '
  'it AND has verified content to disclose, creates the single '
  'application-scoped Passport disclosure in the same transaction. Defaults '
  'to disclosing nothing: applying is still not consent. SECURITY INVOKER, so '
  'RLS and duplicate-application protection are unchanged.';

REVOKE ALL     ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_submit_application_with_passport(uuid, uuid, text, text, text, text, bigint, boolean) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- The payload gains ONE field: when the holder authorised this disclosure.
--
-- The employer panel has to be able to say "the candidate chose to include
-- this, on this date" without the employer having to take that on trust. The
-- disclosure's own created_at is exactly that moment — it is written by
-- sp_share_passport_with_application, which only the holder can reach.
--
-- Additive: every existing key is carried forward unchanged, so the public
-- token path and the application path keep returning the same contract they
-- did before, plus one honest timestamp. Nothing about WHO may read it moves.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_disclosure_payload(_disclosure_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE _d public.sp_disclosures%ROWTYPE; _p public.sp_passport_profiles%ROWTYPE;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures WHERE id = _disclosure_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles
   WHERE holder_user_id = _d.holder_user_id;

  RETURN jsonb_build_object(
    'status','active',
    'package', _d.package_code,
    'focus', CASE WHEN _d.focus_claim_id IS NULL THEN 'passport' ELSE 'credential' END,
    'purpose', _d.purpose,
    'expires_at', _d.expires_at,
    -- The new field. When the holder authorised this disclosure.
    'authorised_at', _d.created_at,
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
        'credential_code', c.credential_code,
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
        AND (_d.focus_claim_id IS NULL OR c.id = _d.focus_claim_id)
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
        AND _d.focus_claim_id IS NULL
    ), '[]'::jsonb),
    'verified_experience_days', CASE
      WHEN _d.focus_claim_id IS NOT NULL THEN 0
      WHEN _d.package_code IN ('public_card','verified_experience','full_verification')
      THEN coalesce((
        SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
          FROM public.sp_experience_periods e
         WHERE e.holder_user_id = _d.holder_user_id
           AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
      ), 0)
      ELSE 0 END);
END; $$;

REVOKE ALL ON FUNCTION public.sp_disclosure_payload(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
