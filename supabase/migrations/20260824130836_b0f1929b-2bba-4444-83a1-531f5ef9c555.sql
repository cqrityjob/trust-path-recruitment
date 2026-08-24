-- Security Passport — the scope reaches the reader who needs it, and no further.
--
-- ── WHAT WAS MISSING ───────────────────────────────────────────────────
--
-- A skyddsvakt approval is limited to an employer, a principal or a protected
-- object. `authorisation_scope` records which, and until now it never left the
-- database: `sp_disclosure_payload` did not emit it, so an employer reading an
-- application-scoped disclosure saw an approval with no limits stated at all.
--
-- That is the wrong failure. An approval shown without its scope reads as a
-- general national licence — broader than what the authority granted.
--
-- ── THE BOUNDARY (owner decision 2) ────────────────────────────────────
--
--   include the EXACT scope   application-scoped disclosures,
--                             `employer_review`, `full_verification`
--   exclude the EXACT scope   `public_card` and every other package
--   never                     PublicTitle, social cards, LinkedIn/OG images,
--                             any marketing export
--
-- A public view may say an approval IS limited without naming the site. That is
-- `scope_limited`, a boolean, emitted to everyone. It tells a stranger the
-- approval has boundaries — which is true and useful — while the protected
-- object stays with the reader who has a lawful reason to know it.
--
-- ── WHY A BOOLEAN RATHER THAN OMISSION ─────────────────────────────────
--
-- Omitting the field entirely on a public card would leave the reader to assume
-- the approval is unlimited, which is the exact misreading the scope exists to
-- prevent. Saying "limited, details withheld" is both narrower and honester
-- than saying nothing.
--
-- ── sub_jurisdiction IS NOT SENSITIVE ──────────────────────────────────
--
-- The emirate is provenance, not private detail, and a Dubai credential shown
-- without it invites exactly the UAE-wide reading the market pack refuses. It
-- is emitted to every package.
--
-- Additive. Every existing key is carried forward unchanged, so the public
-- token path and the application path keep their contract plus three fields.
-- Nothing about WHO may read a disclosure moves.

BEGIN;

CREATE OR REPLACE FUNCTION public.sp_disclosure_payload(_disclosure_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
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
END; $$;

COMMENT ON FUNCTION public.sp_disclosure_payload IS
  'The one disclosure contract, shared by the public token path and the '
  'application path. Emits the EXACT authorisation_scope only to an '
  'application-scoped disclosure or an employer_review / full_verification '
  'package; every other reader gets scope_limited, a boolean, which says an '
  'approval has boundaries without naming the protected object.';

REVOKE ALL ON FUNCTION public.sp_disclosure_payload(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;