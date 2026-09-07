-- Rollback for 20261101090000_sp_selected_merit_sharing.sql
--
-- Removes selected-merit sharing and restores `sp_disclosure_payload` to the
-- definition it had before it, from the migration that last defined it:
--
--   sp_disclosure_payload   20260908094000_sp_disclosure_holder_sub_jurisdiction.sql
--
-- Reproduced verbatim APART FROM ONE ADDED GUARD, which is called out here
-- because a rollback that quietly differs from what it claims to restore is
-- worse than no rollback. The original body evaluates a package by asking
-- `_d.package_code IN (...)` inside each aggregate. Fed a `selected_merits`
-- row — which exists once the forward migration has run — every one of those
-- tests is false, so it would return `status: "active"` with empty arrays: a
-- live page telling a recipient this person holds no verified merits at all.
-- That is the worst possible direction to fail in, so the restored function
-- refuses a package it has no contract for and returns the same single
-- `unavailable` payload a revoked link returns.
--
-- ── WHAT REVERTING COSTS ───────────────────────────────────────────────
--
--   * A holder can no longer choose WHICH merits a link carries. Sharing
--     returns to the five fixed packages plus the single-credential share.
--   * A share created while the forward migration was live STOPS RESOLVING,
--     by the guard described above: the recipient page renders the same
--     `unavailable` as a revoked link. That is the intended direction of
--     failure — a link whose scope can no longer be evaluated must show
--     nothing, never everything — but it means every live selected share
--     goes dark until the forward migration is re-applied.
--   * A lost create response can mint a second live link again.
--   * The holder's language choice for a recipient is lost.
--
-- ── DATA SAFETY ────────────────────────────────────────────────────────
--
-- This is deliberately NOT a clean drop of everything the forward migration
-- created. Two things are kept:
--
--   * `sp_disclosures.locale` and `sp_disclosures.request_key` are LEFT IN
--     PLACE. They carry values a holder supplied; dropping the columns would
--     destroy them, and an unused nullable column costs nothing. Re-applying
--     the forward migration finds them and continues.
--   * `sp_disclosure_items` rows are the holder's own sharing decisions. The
--     table is left in place too, unreachable but intact, so re-applying
--     restores every live share exactly as it was.
--
-- What IS removed is everything that can be CALLED: the three functions, and
-- the package code's acceptance. After this runs nothing can create, preview
-- or resolve a selected share, which is the property a rollback has to have.
--
-- Existing rows whose package_code is 'selected_merits' would violate the
-- restored CHECK, so the constraint is added NOT VALID: it refuses every new
-- row without rewriting or deleting a single existing one. Re-applying the
-- forward migration replaces it with the widened, validated version.

BEGIN;

DROP FUNCTION IF EXISTS public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text);
DROP FUNCTION IF EXISTS public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid);

-- Restored verbatim from 20260908094000.
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

  -- The added guard. See the header: a package with no contract here must
  -- render as nothing, never as an empty but active Passport.
  IF _d.package_code NOT IN ('public_card','verified_qualifications',
                             'verified_experience','employer_review',
                             'full_verification') THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  SELECT * INTO _p FROM public.sp_passport_profiles
   WHERE holder_user_id = _d.holder_user_id;

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
    'sub_jurisdiction', _p.sub_jurisdiction_code,
    'verified_claims', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.claim_type, 'title', c.title,
        'credential_code', c.credential_code,
        'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
        'sub_jurisdiction', c.sub_jurisdiction_code,
        'scope_limited', (c.authorisation_scope IS NOT NULL
                          AND length(btrim(c.authorisation_scope)) > 0),
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

-- The builder goes last: nothing calls it once the payload has been restored.
DROP FUNCTION IF EXISTS public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz);

-- The closed set, back to five. NOT VALID so no existing row is examined:
-- a selected share created while the forward migration was live keeps its row
-- (and its items) and simply stops resolving.
ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_package_code_check;

ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_package_code_check CHECK (package_code IN
    ('public_card', 'verified_qualifications', 'verified_experience',
     'employer_review', 'full_verification')) NOT VALID;

COMMIT;
