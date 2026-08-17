-- =============================================================================
-- Security Passport — Phase 7: credential presentation in the public payload
--
-- Two changes to `sp_get_disclosure`, both additive-or-narrowing. Nothing
-- else in the function body moves.
--
-- ── 1. THE BLOCKER: the recipient page cannot show the right symbol ──────
--
-- Phase 6 gave every claim a `credential_code` (VU1 / VU2 / OV / SV, FK to
-- `sp_credential_types`). The disclosure payload never carried it, so the
-- only public surface in the product had no authoritative way to know WHICH
-- credential it was rendering. The alternatives available to a client are
-- all unacceptable:
--
--   * infer the symbol from `title` — a holder-typed string, so the holder
--     would be choosing their own credential symbol;
--   * take it from the URL or a client fixture — trivially forgeable.
--
-- So the code is emitted by the server, from the FK-constrained column, and
-- ONLY inside the claim objects the package already discloses. It adds no
-- new row to the payload and no new package capability: a claim whose code
-- appears here is a claim whose title, issuer, dates, assertion level and
-- lifecycle state are already being disclosed to the same recipient.
--
-- `credential_reference` and `holder_note` are NOT added and must never be:
-- the first is a lookup key into someone else's register, the second is the
-- holder's private words. Both are documented PRIVATE in Phase 6.
--
-- ── 2. A PACKAGE-BOUNDARY LEAK, CLOSED ───────────────────────────────────
--
-- `verified_experience_days` was computed for EVERY package and filtered out
-- in the browser. Two packages are not promised it by the contract the
-- holder agrees to (see LIVE_PACKAGES in src/lib/security-passport/
-- packages.ts): `verified_qualifications` and `employer_review` list no
-- tenure total.
--
-- Hiding a disclosed field in the UI is not access control — this codebase
-- says so in several places, and it was true here. The aggregate is now
-- scoped to exactly the three packages that promise it. `employer_review`
-- loses nothing a recipient needs: it still discloses the full verified
-- period list, which is strictly more informative than the total.
--
-- ── WHAT DELIBERATELY DOES NOT CHANGE ────────────────────────────────────
--
--   * `SECURITY DEFINER` with an immutable `search_path = public, extensions`
--     (Phase 5b), so the schema-qualified `digest()` call keeps resolving.
--   * The fail-closed head: unknown, revoked and expired tokens all return
--     the same `{"status":"unavailable"}` with no further work done.
--   * The throttle and the hashed access record.
--   * `assertion_level = 'verified' AND lifecycle_state = 'active'`. A
--     revoked, superseded or disputed claim is not disclosed at all, and
--     nothing here can elevate a self-declared or documented claim.
--   * Expiry stays DERIVED at read time from `valid_until`, exactly as
--     Phase 3 established, so a verified credential whose validity has
--     passed is disclosed with its real dates and presented as expired by
--     the reader rather than silently dropped.
--   * The grants: anon executes nothing; only service_role may call this.
-- =============================================================================

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
        -- The one new field. Server-authored, FK-constrained, and present
        -- only on claims this package already discloses.
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
    -- Scoped to the three packages whose stated contract includes a tenure
    -- total. Previously computed for all five and hidden in the browser.
    'verified_experience_days', CASE
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

-- Restated rather than assumed: a CREATE OR REPLACE keeps existing grants,
-- but the boundary is important enough to be visible in every migration that
-- touches this function.
REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

COMMENT ON FUNCTION public.sp_get_disclosure IS
  'Recipient payload, assembled from the package contract. Called ONLY by the '
  'application server (service_role) behind sp_throttle_public_access. anon '
  'has no direct execution on this or any other sp_* function. Emits '
  'credential_code for disclosed claims so the public page can render the '
  'authoritative credential symbol; never emits credential_reference or '
  'holder_note.';
