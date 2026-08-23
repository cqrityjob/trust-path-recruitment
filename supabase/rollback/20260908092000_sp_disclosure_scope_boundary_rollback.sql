-- =============================================================================
-- ROLLBACK — disclosure scope boundary
--
-- Restores sp_disclosure_payload to the version 20260904090000 left: no
-- authorisation_scope, no scope_limited, no sub_jurisdiction.
--
-- ── WHAT ROLLING THIS BACK ACTUALLY DOES ───────────────────────────────
--
-- An employer reading an application-scoped disclosure sees a skyddsvakt
-- approval with NO limits stated at all — which reads as a general national
-- licence, broader than what the authority granted. That is the wrong
-- direction to fail in, and it is the reason this migration exists.
--
-- It also removes `scope_limited` from the public card, so a stranger is told
-- nothing about boundaries rather than "limited, details withheld".
--
-- No data is lost: this migration only ever read columns. Every
-- authorisation_scope a holder recorded stays exactly where it is.
--
-- Ordering is free — this touches one function and no table — but it must run
-- BEFORE any later migration that redefines the same function.
-- =============================================================================

BEGIN;

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

COMMIT;
