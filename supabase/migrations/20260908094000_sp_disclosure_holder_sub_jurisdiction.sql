-- Security Passport — the recipient learns WHERE the holder works, precisely.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- `sp_passport_profiles` has carried `sub_jurisdiction_code` since
-- 20260908093000, and every authenticated Passport surface renders a Dubai
-- holder as "Dubai, Förenade Arabemiraten" / "Dubai, United Arab Emirates".
--
-- `sp_disclosure_payload` emitted only:
--
--     'jurisdiction', _p.jurisdiction_code
--
-- for the holder, so the recipient/share view — the ONE surface a stranger
-- ever sees — collapsed Dubai into "United Arab Emirates". SIRA licenses the
-- emirate and not the country, so that is precisely the UAE-wide reading the
-- Dubai market pack was built to refuse, reappearing at the worst possible
-- place.
--
-- Confirmed by opening a real share against a local full stack: the
-- authenticated Passport said "Dubai, United Arab Emirates" and the recipient
-- page said "United Arab Emirates".
--
-- ── WHAT THIS CHANGES, AND ONLY THIS ───────────────────────────────────
--
-- One key is added to the holder object. The function is otherwise reproduced
-- verbatim from the canonical definition, so a reviewer can diff it and see a
-- single semantic addition.
--
-- Deliberately NOT touched: the authorisation decision
-- (`_may_see_exact_scope`), disclosure scope, the token lookup, rate limiting,
-- RLS, holder_note (which this function has never emitted), credential
-- jurisdiction, market activation and every trust rule above. No column, table,
-- policy, grant or constraint is altered — this migration replaces one function
-- body and nothing else.
--
-- The recipient already receives the holder's COUNTRY. This adds the emirate
-- the profile already stores, so the share says the same true thing the
-- Passport does. It discloses no new class of information.
--
-- Reversible: see
-- supabase/rollback/20260908094000_sp_disclosure_holder_sub_jurisdiction_rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.sp_disclosure_payload(_disclosure_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _d public.sp_disclosures%ROWTYPE;
  _p public.sp_passport_profiles%ROWTYPE;
  _may_see_exact_scope boolean;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures WHERE id = _disclosure_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles
   WHERE holder_user_id = _d.holder_user_id;

  -- Decided once, here, rather than in each of the surfaces that render it.
  _may_see_exact_scope := (
    _d.application_id IS NOT NULL
    OR _d.package_code IN ('employer_review', 'full_verification')
  );

  RETURN jsonb_build_object(
    'status','active',
    'package', _d.package_code,
    'focus', CASE WHEN _d.focus_claim_id IS NULL THEN 'passport' ELSE 'credential' END,
    'purpose', _d.purpose,
    'expires_at', _d.expires_at,
    'authorised_at', _d.created_at,
    'last_updated', greatest(_p.updated_at, _d.created_at),
    'holder', CASE _p.privacy_mode
                WHEN 'anonymous' THEN NULL
                WHEN 'initials'  THEN regexp_replace(coalesce(_p.display_name,''), '(\S)\S*', '\1.', 'g')
                ELSE _p.display_name END,
    'privacy_mode', _p.privacy_mode,
    'profession_slug', _p.cig_profession_slug,
    'jurisdiction', _p.jurisdiction_code,
    -- The emirate, where the holder stated one.
    --
    -- Every credential above has carried its own `sub_jurisdiction`
    -- since the three-market foundation. The HOLDER's did not, so a
    -- Dubai-based holder reached the recipient page as "United Arab
    -- Emirates" — the UAE-wide reading the Dubai market pack exists to
    -- refuse, reintroduced at the one surface a stranger actually sees.
    --
    -- NULL stays NULL. A Swedish or UK holder has no sub-jurisdiction
    -- and this emits none; nothing is inferred from the country.
    'sub_jurisdiction', _p.sub_jurisdiction_code,
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'credential_code', c.credential_code,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        -- Provenance, not private detail: a Dubai credential shown without its
        -- emirate invites the UAE-wide reading the market pack refuses.
        'sub_jurisdiction', c.sub_jurisdiction_code,
        -- True whenever the approval has boundaries, for EVERY package. A
        -- stranger learns that limits exist without learning what they are.
        'scope_limited', (c.authorisation_scope IS NOT NULL
                          AND length(btrim(c.authorisation_scope)) > 0),
        -- The protected object itself, only where the reader has a lawful
        -- reason: an application the holder chose, or a package they picked
        -- knowing what it carries.
        'authorisation_scope', CASE WHEN _may_see_exact_scope
                                    THEN c.authorisation_scope ELSE NULL END,
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
END; $function$;

COMMIT;
