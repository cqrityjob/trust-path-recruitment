-- =============================================================================
-- Security Passport — Phase 5b: pgcrypto is not in `public` on the hosted
-- project, and two functions assumed it was.
--
-- ── HOW THIS WAS FOUND ─────────────────────────────────────────────────
--
-- The hosted denial tests, run immediately after the Phase 3 + Phase 5
-- migrations were applied. `sp_get_disclosure` failed with
--
--     function digest(text, unknown) does not exist
--
-- Both `sp_create_disclosure` and `sp_get_disclosure` call `digest()` (and
-- the former also calls `gen_random_bytes()`), which come from pgcrypto.
-- Every Passport function is declared `SET search_path = public` — correct
-- and deliberate, because a mutable search_path on a SECURITY DEFINER
-- function is a privilege-escalation route. But Supabase installs pgcrypto
-- into the `extensions` schema, so `public` alone cannot see it.
--
-- The local test harness did not catch this: a plain `CREATE EXTENSION
-- pgcrypto` there puts the functions in `public`, where the search_path
-- finds them. The suites were right about the logic and wrong about the
-- environment — which is exactly the class of defect that only appears when
-- something is actually deployed.
--
-- Impact had this shipped unfixed: creating a share and opening a share link
-- would both have failed. No data loss, no exposure — the failure is closed,
-- not open — but the sharing half of the product would not have worked at
-- all.
--
-- ── THE FIX, AND WHY IT IS STILL SAFE ──────────────────────────────────
--
-- `SET search_path = public, extensions`. Still explicit, still immutable,
-- still not `""` or user-controlled, and `public` still resolves first — so
-- nothing in `extensions` can shadow a Passport object. It only adds the one
-- schema the hosted platform actually keeps pgcrypto in.
--
-- Nothing else changes: both function bodies are byte-identical to their
-- Phase 3 / Phase 5 versions.
-- =============================================================================

-- Belt and braces: if a future environment has pgcrypto somewhere else
-- again, this makes the dependency explicit rather than assumed.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


CREATE OR REPLACE FUNCTION public.sp_create_disclosure(
  _package_code text, _expires_days integer, _purpose text, _recipient_hint text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _token text; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  _token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.sp_disclosures (
    holder_user_id, package_code, token_hash, purpose, recipient_hint, expires_at)
  VALUES (auth.uid(), _package_code, encode(digest(_token, 'sha256'), 'hex'),
          _purpose, _recipient_hint,
          CASE WHEN _expires_days IS NULL THEN NULL ELSE now() + (_expires_days || ' days')::interval END)
  RETURNING id INTO _id;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','disclosure_created','package',_package_code));
  RETURN _token;
END; $$;

REVOKE ALL ON FUNCTION public.sp_create_disclosure(text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_disclosure(text,integer,text,text) TO authenticated;


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
    'verified_experience_days', coalesce((
      SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
        FROM public.sp_experience_periods e
       WHERE e.holder_user_id = _d.holder_user_id
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
    ), 0));

  RETURN _payload;
END; $$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

COMMENT ON FUNCTION public.sp_get_disclosure IS
  'Recipient payload, assembled from the package contract. Called ONLY by the '
  'application server (service_role) behind sp_throttle_public_access. anon '
  'has no direct execution on this or any other sp_* function.';
