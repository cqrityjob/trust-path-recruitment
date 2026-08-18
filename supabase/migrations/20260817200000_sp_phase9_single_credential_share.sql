-- =============================================================================
-- Security Passport — Phase 9: sharing ONE credential
--
-- ── THE PRODUCT NEED ─────────────────────────────────────────────────────
--
-- A holder who has just had a VU1 verified wants to send that, not their
-- whole Passport. Until now the smallest thing they could share was a
-- package, so proving one credential meant disclosing every verified
-- credential they hold.
--
-- ── WHY IT REUSES THE DISCLOSURE MACHINERY ───────────────────────────────
--
-- The obvious alternative is a second sharing mechanism for credentials.
-- That would mean a second token format, a second revocation path, a second
-- throttle and a second fail-closed head — four more places for the security
-- contract to be got subtly wrong.
--
-- Instead a disclosure gains an OPTIONAL focus: `focus_claim_id`. When set,
-- the payload carries exactly that one claim and nothing else. Everything
-- that already protects a share — the hashed token, the expiry, revocation,
-- the throttle, the byte-identical unavailable response — protects this too,
-- unchanged, because it IS a disclosure.
--
-- ── IT CAN ONLY EVER NARROW ──────────────────────────────────────────────
--
-- The focus is applied as an additional AND on the existing claim filter, so
-- a focused share is always a strict subset of the package it was created
-- under. It cannot reach a claim the package would not have disclosed, it
-- cannot disclose an unverified or inactive claim, and it cannot widen a
-- package. Ownership is checked at creation: the claim must belong to the
-- caller, or the share is refused outright.
-- =============================================================================

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS focus_claim_id uuid REFERENCES public.sp_claims(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.sp_disclosures.focus_claim_id IS
  'Optional. When set, the disclosure carries exactly this one claim instead '
  'of the package''s full claim list. Only ever narrows: the package filter '
  'still applies on top.';

CREATE INDEX IF NOT EXISTS sp_disclosures_focus_claim_idx
  ON public.sp_disclosures (focus_claim_id)
  WHERE focus_claim_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Creation, with the focus as a new trailing argument.
--
-- A NEW signature rather than an overload of the old one: an overload would
-- let a stale caller reach the unfocused behaviour by accident, and the old
-- four-argument form is still legitimately used for whole-Passport shares.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_create_credential_disclosure(
  _claim_id uuid, _expires_days integer, _purpose text, _recipient_hint text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _token text; _id uuid; _owner uuid; _assertion text; _lifecycle text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT holder_user_id, assertion_level, lifecycle_state
    INTO _owner, _assertion, _lifecycle
    FROM public.sp_claims WHERE id = _claim_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'SP_CLAIM_NOT_FOUND' USING ERRCODE='no_data_found';
  END IF;

  -- SECURITY DEFINER means RLS does not protect this function; the ownership
  -- check is the only thing between it and someone else's credential.
  IF _owner <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Refused rather than silently producing an empty page: a holder pressing
  -- "share this credential" on something unverified should be told why, not
  -- handed a link that shows nothing.
  IF _assertion <> 'verified' OR _lifecycle <> 'active' THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_NOT_SHAREABLE: % / %', _assertion, _lifecycle
      USING ERRCODE='check_violation';
  END IF;

  _token := encode(gen_random_bytes(32), 'hex');

  -- Always the qualifications package: it is the narrowest contract that
  -- carries a credential with its attribution and validity, and the focus
  -- narrows it further to this one claim.
  INSERT INTO public.sp_disclosures (
    holder_user_id, package_code, token_hash, purpose, recipient_hint,
    expires_at, focus_claim_id)
  VALUES (auth.uid(), 'verified_qualifications', encode(digest(_token, 'sha256'), 'hex'),
          _purpose, _recipient_hint,
          CASE WHEN _expires_days IS NULL THEN NULL
               ELSE now() + (_expires_days || ' days')::interval END,
          _claim_id)
  RETURNING id INTO _id;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','credential_disclosure_created','claim_id',_claim_id));

  RETURN _token;
END; $$;

REVOKE ALL ON FUNCTION public.sp_create_credential_disclosure(uuid,integer,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_credential_disclosure(uuid,integer,text,text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- The payload: one extra AND on the claim filter, and a flag so the page
-- knows to render as a credential rather than a Passport.
--
-- Everything else is Phase 7's body verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    -- Lets the recipient page render a credential page rather than a
    -- Passport, without inferring intent from the array length.
    'focus', CASE WHEN _d.focus_claim_id IS NULL THEN 'passport' ELSE 'credential' END,
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
        -- The focus. Only ever narrows.
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
        -- A credential share carries no employment at all.
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

  RETURN _payload;
END; $$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;
