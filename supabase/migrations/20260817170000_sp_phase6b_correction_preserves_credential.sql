-- Security Passport — Phase 6b: correction preserves the credential identity.
--
-- Additive: no table, column, constraint, policy or trigger changes. One
-- SECURITY DEFINER function is replaced, its ownership check and its
-- supersede-never-overwrite behaviour intact.
--
-- ── DEFECT 1: THE CREDENTIAL FIELDS WERE SILENTLY DROPPED ──────────────
--
-- `sp_correct_claim` was written in Phase 2 and lists the columns it carries
-- into the new version by name. Phase 6 added `credential_code`,
-- `credential_reference` and `holder_note`; the function did not know about
-- them, so correcting a VU1 quietly turned it into an uncoded free-text claim
-- and discarded the certificate number and the holder's own note.
--
-- ── DEFECT 2: A CORRECTED CLAIM COULD NOT BE VERIFIED, OR STAYED VERIFIED ──
--
-- The old body inserted `_old.assertion_level` but not `verified_by_user_id`
-- or `verified_at`. For a VERIFIED claim that violates
-- `sp_claim_verified_is_attributed`, so correcting a verified credential
-- failed outright. Its comment ("in Phase 2 is always 'self_declared'") was
-- true when written and stopped being true when Phase 3 shipped verification.
--
-- Carrying VERIFIED forward unconditionally would be the worse bug: the
-- holder could get a credential verified, then edit its title, issuer, dates
-- or reference and keep the verified state on an assertion nobody checked.
--
-- ── THE RULE ───────────────────────────────────────────────────────────
--
-- A correction that changes WHAT IS BEING ASSERTED resets trust to
-- `self_declared` and drops the attribution. A correction that changes only
-- the holder's own private note does not, because the credential itself is
-- unchanged.
--
-- "Materially changed" is every field that identifies the credential: title,
-- issuer, jurisdiction, the three dates, the credential code and the
-- credential reference. `holder_note` is deliberately excluded — it is the
-- holder's commentary, never a verification finding, so editing it cannot
-- invalidate someone else's decision.
--
-- DOCUMENT_PROVIDED resets on the same rule and for a concrete reason:
-- evidence rows point at a claim id, the new version has a new id, and no
-- evidence is attached to it. Carrying the level forward would assert
-- documentation that is not there.

DROP FUNCTION IF EXISTS public.sp_correct_claim(uuid, text, text, text, date, date, date, text);

CREATE OR REPLACE FUNCTION public.sp_correct_claim(
  _claim_id uuid,
  _title text,
  _claimed_issuer_name text,
  _jurisdiction_code text,
  _issued_on date,
  _valid_from date,
  _valid_until date,
  _reason text,
  -- Phase 6 fields. Like every parameter above, these are a FULL replacement,
  -- not a patch: the correction form is pre-filled with the current values and
  -- submits the complete intended state. The old 8-argument signature is
  -- dropped rather than overloaded so that a stale caller cannot silently
  -- blank these three.
  _credential_code text,
  _credential_reference text,
  _holder_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old public.sp_claims%ROWTYPE;
  _new_id uuid;
  _material boolean;
  _next_level text;
  _next_by uuid;
  _next_at timestamptz;
BEGIN
  SELECT * INTO _old FROM public.sp_claims WHERE id = _claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER means RLS does not protect this function. The ownership
  -- check is explicit and is the only thing between this RPC and someone
  -- else's Passport. Unchanged from Phase 2.
  IF _old.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _old.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_CORRECTABLE: state is %', _old.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  _material := (
       _old.title                 IS DISTINCT FROM _title
    OR _old.claimed_issuer_name   IS DISTINCT FROM _claimed_issuer_name
    OR _old.jurisdiction_code     IS DISTINCT FROM _jurisdiction_code
    OR _old.issued_on             IS DISTINCT FROM _issued_on
    OR _old.valid_from            IS DISTINCT FROM _valid_from
    OR _old.valid_until           IS DISTINCT FROM _valid_until
    OR _old.credential_code       IS DISTINCT FROM _credential_code
    OR _old.credential_reference  IS DISTINCT FROM _credential_reference
  );

  IF _material AND _old.assertion_level <> 'self_declared' THEN
    -- What was checked is not what is now being claimed.
    _next_level := 'self_declared';
    _next_by    := NULL;
    _next_at    := NULL;
  ELSE
    -- Carried forward WITH its attribution, so a surviving VERIFIED level
    -- still names who decided it and when. The old body omitted these two
    -- columns, which is why correcting a verified claim used to fail the
    -- sp_claim_verified_is_attributed CHECK.
    _next_level := _old.assertion_level;
    _next_by    := _old.verified_by_user_id;
    _next_at    := _old.verified_at;
  END IF;

  -- A correction can never RAISE trust: _next_level is either the prior level
  -- or self_declared, and there is no parameter through which a caller could
  -- ask for anything else.
  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, title, claimed_issuer_name, jurisdiction_code,
    issued_on, valid_from, valid_until,
    credential_code, credential_reference, holder_note,
    assertion_level, verified_by_user_id, verified_at,
    lifecycle_state, version_no, supersedes_id)
  VALUES (
    _old.holder_user_id, _old.claim_type, _title, _claimed_issuer_name,
    _jurisdiction_code, _issued_on, _valid_from, _valid_until,
    _credential_code, _credential_reference, _holder_note,
    _next_level, _next_by, _next_at,
    'active', _old.version_no + 1, _old.id)
  RETURNING id INTO _new_id;

  UPDATE public.sp_claims
     SET lifecycle_state = 'superseded'
   WHERE id = _old.id;

  -- Append-only history. The event records what the correction did to trust,
  -- so a reviewer can see that a verified credential was reset and why,
  -- without having to diff two rows.
  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (
    _old.holder_user_id, auth.uid(), 'claim_corrected', 'claim', _new_id,
    jsonb_build_object(
      'supersedes', _old.id,
      'version_no', _old.version_no + 1,
      'reason', _reason,
      'previous_title', _old.title,
      'material_change', _material,
      'previous_assertion_level', _old.assertion_level,
      'assertion_level', _next_level,
      'verification_reset', (_material AND _old.assertion_level <> 'self_declared'),
      'previous_credential_code', _old.credential_code,
      'credential_code', _credential_code));
      -- Deliberately absent: credential_reference and holder_note. The event
      -- log is history, not a second copy of private content, and a reference
      -- number in a detail blob would outlive the correction that removed it.

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sp_correct_claim(
  uuid, text, text, text, date, date, date, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.sp_correct_claim IS
  'Corrects a claim by supersession: inserts version_no + 1, marks the prior '
  'row superseded and appends an event, atomically. Carries the credential '
  'code, reference and holder note forward. Resets assertion_level to '
  'self_declared (dropping attribution) when a field that identifies the '
  'credential changed, so verification cannot survive onto a materially '
  'different assertion. Never raises trust. Refuses any caller who is not '
  'the holder.';
