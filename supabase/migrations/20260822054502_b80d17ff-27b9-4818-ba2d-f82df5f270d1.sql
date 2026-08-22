-- The candidate decides, per application, what a specific employer may see.
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────────
--
-- The Security Passport has been holder-controlled from Phase 3: the holder
-- picks a package, gets a link, and may revoke it. That model assumes the
-- holder can hand a URL to a named recipient.
--
-- Recruitment does not work that way. The employer is not somebody the
-- candidate emails; the employer is a workspace on the other side of an
-- application the candidate already made. With only token sharing available,
-- the choices were both wrong:
--
--   * paste a Passport link into a cover note — which makes a revocable,
--     scoped disclosure into a string that lives in the employer's own
--     records forever; or
--   * treat APPLYING as consent to read the Passport — which is exactly the
--     thing this product must never do.
--
-- ── APPLICATION IS NOT CONSENT ──────────────────────────────────────────
--
-- Nothing here reads a Passport because an application exists. A disclosure
-- row must be created BY THE HOLDER, naming ONE application, before an
-- employer can read anything at all — and when there is none, the employer
-- read returns {"status":"none"}. That response is IDENTICAL whether the
-- candidate has no Passport, has one and shared nothing, or shared something
-- and revoked it. Passport existence is not observable from the employer
-- side; only an explicit act of disclosure is.
--
-- ── WHY THIS IS THE SAME MECHANISM, NOT A SECOND ONE ────────────────────
--
-- A parallel "employer view of a Passport" would mean a second payload
-- builder, a second package contract, a second revocation path and a second
-- set of exclusions — four more places to get the privacy contract subtly
-- wrong, and two answers to "what did this person actually share".
--
-- So an application disclosure IS an sp_disclosures row. It carries the same
-- package_code, the same optional focus_claim_id, the same expiry, the same
-- revocation, the same access log, and — after this migration — literally
-- the same payload builder as the public token path.
--
--   sp_disclosure_payload(disclosure_id)   <- the contract, in one place
--        ^                          ^
--        |                          |
--   sp_get_disclosure(token)   sp_application_disclosure(application_id)
--     public /p/$token             employer, membership-checked
--
-- Extracting the builder is the whole reason this migration touches
-- sp_get_disclosure at all. Its head — the fail-closed unavailable response,
-- the access record — is unchanged.
--
-- ── ADDRESSING: A DISCLOSURE HAS EXACTLY ONE WAY IN ─────────────────────
--
-- A token disclosure is reachable by anyone holding the token. An application
-- disclosure must NOT be: turning a candidate's scoped share into a public
-- URL would silently widen it. So token_hash becomes nullable and a CHECK
-- enforces exactly one addressing mode per row. The token path additionally
-- refuses application-scoped rows explicitly, so the boundary does not depend
-- on NULL semantics in an equality test.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- One column, one CHECK, one partial unique index, one narrowed column grant
-- on sp_disclosures, one extracted function, one redefined function, three
-- new functions. No claim, evidence, verification or package contract
-- changes. No sp_* -> scp_* foreign key is introduced: the link is to
-- job_applications, which is the recruitment record, not the assessment one.
--
-- Remediation: drop the three new functions, restore sp_get_disclosure from
-- 20260817200000, drop sp_disclosure_payload, drop the index, the CHECK and
-- the column. Nothing that existed before depends on any of them.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The scope
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS application_id uuid
    REFERENCES public.job_applications(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.sp_disclosures.application_id IS
  'When set, this disclosure is addressed to the employer that owns this job '
  'application instead of to whoever holds a link. Created only by the holder, '
  'through sp_share_passport_with_application. An application never confers '
  'access by existing.';

ALTER TABLE public.sp_disclosures ALTER COLUMN token_hash DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'sp_disclosures_one_addressing_mode') THEN
    ALTER TABLE public.sp_disclosures
      ADD CONSTRAINT sp_disclosures_one_addressing_mode CHECK (
        (application_id IS NULL AND token_hash IS NOT NULL) OR
        (application_id IS NOT NULL AND token_hash IS NULL));
  END IF;
END $$;

-- One live disclosure per application. Re-sharing supersedes rather than
-- accumulating, so "what has this candidate shared with us" has one answer
-- and revoking is unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosures_one_live_per_application
  ON public.sp_disclosures (application_id)
  WHERE application_id IS NOT NULL AND revoked_at IS NULL;

-- The holder's own UPDATE grant was table-wide, which meant a holder could
-- rewrite an existing share's package or point it at a different application
-- rather than revoking and re-sharing. Revocation is the only direct write a
-- holder needs; everything else goes through a function that checks ownership
-- and scope. Same column-grant pattern as assessment_assignments.scp_open.
REVOKE UPDATE ON public.sp_disclosures FROM authenticated;
GRANT  UPDATE (revoked_at) ON public.sp_disclosures TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The package contract, in one place
--
-- Body carried forward VERBATIM from 20260817200000 (Phase 9), keyed on the
-- disclosure id instead of resolving a token. Nothing is added to the payload
-- and nothing is removed from it.
--
-- Executable by NOBODY. Both callers are SECURITY DEFINER and run as the
-- owner, so no role needs EXECUTE — which means there is no way to ask for a
-- payload without going through a path that checks who is asking.
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

COMMENT ON FUNCTION public.sp_disclosure_payload(uuid) IS
  'The disclosure package contract, assembled server-side. The ONLY builder: '
  'the public token path and the application-scoped employer path both return '
  'exactly this, so the two surfaces cannot disagree about what a package '
  'contains. Executable by no role -- reachable only through a caller that '
  'has already established who is asking and on what basis.';

REVOKE ALL ON FUNCTION public.sp_disclosure_payload(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The public token path — head unchanged, body delegated
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE _d public.sp_disclosures%ROWTYPE;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures
   WHERE token_hash = encode(digest(coalesce(_token,''), 'sha256'), 'hex')
     -- Explicit, not implied by NULL semantics: an application-scoped share
     -- is not a link, and must never become one.
     AND application_id IS NULL;

  IF NOT FOUND OR _d.revoked_at IS NOT NULL
     OR (_d.expires_at IS NOT NULL AND _d.expires_at < now()) THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  RETURN public.sp_disclosure_payload(_d.id);
END; $$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The holder shares, naming one application
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_share_passport_with_application(
  _application_id uuid,
  _package_code   text,
  _expires_days   integer DEFAULT 30,
  _focus_claim_id uuid DEFAULT NULL,
  _purpose        text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE _applicant uuid; _employer uuid; _employer_name text; _id uuid;
        _owner uuid; _assertion text; _lifecycle text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT a.applicant_user_id, a.employer_id INTO _applicant, _employer
    FROM public.job_applications a WHERE a.id = _application_id;

  -- One refusal for "no such application" and for "not yours", so this cannot
  -- be used to discover which application ids exist.
  IF _applicant IS NULL OR _applicant <> auth.uid() THEN
    RAISE EXCEPTION 'SP_NOT_YOUR_APPLICATION: you can only share your Passport '
      'with an employer you have applied to.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                  WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  -- The package contract is a closed set; an unknown code must not become a
  -- row whose payload nobody has reviewed.
  IF _package_code NOT IN ('public_card','verified_qualifications',
                           'verified_experience','employer_review',
                           'full_verification') THEN
    RAISE EXCEPTION 'SP_UNKNOWN_PACKAGE: % is not a disclosure package.', _package_code
      USING ERRCODE='check_violation';
  END IF;

  IF _focus_claim_id IS NOT NULL THEN
    SELECT holder_user_id, assertion_level, lifecycle_state
      INTO _owner, _assertion, _lifecycle
      FROM public.sp_claims WHERE id = _focus_claim_id;
    IF _owner IS NULL OR _owner <> auth.uid() THEN
      RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege';
    END IF;
    IF _assertion <> 'verified' OR _lifecycle <> 'active' THEN
      RAISE EXCEPTION 'SP_CLAIM_NOT_SHAREABLE: only a current verified entry '
        'can be shared.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  -- Re-sharing supersedes. The previous share is revoked rather than left
  -- live, so the employer never holds two answers and the holder's own list
  -- shows one current disclosure per application.
  UPDATE public.sp_disclosures
     SET revoked_at = now()
   WHERE application_id = _application_id
     AND holder_user_id = auth.uid()
     AND revoked_at IS NULL;

  SELECT e.name INTO _employer_name FROM public.employers e WHERE e.id = _employer;

  INSERT INTO public.sp_disclosures (
    holder_user_id, package_code, token_hash, application_id,
    purpose, recipient_hint, focus_claim_id, expires_at)
  VALUES (
    auth.uid(), _package_code, NULL, _application_id,
    _purpose, _employer_name, _focus_claim_id,
    CASE WHEN _expires_days IS NULL THEN NULL
         ELSE now() + (_expires_days || ' days')::interval END)
  RETURNING id INTO _id;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','application_disclosure_created',
                             'package',_package_code,
                             'application_id',_application_id));

  RETURN _id;
END; $$;

COMMENT ON FUNCTION public.sp_share_passport_with_application(uuid, text, integer, uuid, text) IS
  'The holder discloses a Passport package to ONE employer, through ONE of '
  'their own applications. Produces no link and no token. Revoked with '
  'sp_revoke_disclosure like any other share.';

REVOKE ALL     ON FUNCTION public.sp_share_passport_with_application(uuid, text, integer, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_share_passport_with_application(uuid, text, integer, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. What the holder has shared, per application
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_my_application_disclosures()
RETURNS TABLE(
  disclosure_id uuid, application_id uuid,
  employer_name text, job_title_sv text, job_title_en text,
  package_code text, focus_claim_id uuid,
  created_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
  access_count integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT d.id, d.application_id, e.name, j.title_sv, coalesce(j.title_en, j.title_sv),
         d.package_code, d.focus_claim_id,
         d.created_at, d.expires_at, d.revoked_at, d.access_count
    FROM public.sp_disclosures d
    JOIN public.job_applications a ON a.id = d.application_id
    LEFT JOIN public.employers e ON e.id = a.employer_id
    LEFT JOIN public.jobs j ON j.id = a.job_id
   WHERE d.holder_user_id = auth.uid()
     AND d.application_id IS NOT NULL
   ORDER BY d.created_at DESC;
$$;

REVOKE ALL     ON FUNCTION public.sp_my_application_disclosures() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_my_application_disclosures() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. What the employer may read — and the silence when nothing was shared
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_application_disclosure(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE _employer uuid; _d public.sp_disclosures%ROWTYPE;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;

  -- Every negative answer is the same answer. A caller who is not a member,
  -- names an application that does not exist, or names one whose candidate
  -- has disclosed nothing, cannot tell those cases apart -- and therefore
  -- cannot learn that a Passport exists.
  IF _employer IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                     WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                       AND m.status = 'active') THEN
    RETURN jsonb_build_object('status','none');
  END IF;

  SELECT * INTO _d FROM public.sp_disclosures
   WHERE application_id = _application_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN RETURN jsonb_build_object('status','none'); END IF;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  RETURN public.sp_disclosure_payload(_d.id);
END; $$;

COMMENT ON FUNCTION public.sp_application_disclosure(uuid) IS
  'What one candidate has explicitly disclosed to one employer through one '
  'application. Returns {"status":"none"} for every negative case -- not a '
  'member, no such application, nothing shared, revoked, expired -- so the '
  'employer cannot infer that a Passport exists. Reading is recorded, so the '
  'holder can see that it was read.';

REVOKE ALL     ON FUNCTION public.sp_application_disclosure(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_application_disclosure(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Self-verification
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sp_disclosures'
                    AND column_name='application_id') THEN
    RAISE EXCEPTION 'SP_APP_DISCLOSURE_MISSING: application_id did not install';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='sp_disclosures_one_addressing_mode') THEN
    RAISE EXCEPTION 'SP_ADDRESSING_UNGUARDED: a row could carry a token and an application';
  END IF;

  IF pg_get_functiondef('public.sp_get_disclosure(text)'::regprocedure)
       NOT LIKE '%application_id IS NULL%' THEN
    RAISE EXCEPTION 'SP_TOKEN_PATH_UNSCOPED: the token path can reach an application disclosure';
  END IF;

  IF pg_get_functiondef('public.sp_get_disclosure(text)'::regprocedure)
       NOT LIKE '%sp_disclosure_payload%' THEN
    RAISE EXCEPTION 'SP_TWO_PAYLOAD_BUILDERS: the token path no longer uses the shared builder';
  END IF;

  IF has_function_privilege('anon','public.sp_application_disclosure(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.sp_share_passport_with_application(uuid,text,integer,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'SP_APP_DISCLOSURE_ANON: an application disclosure path is callable by anon';
  END IF;

  IF has_function_privilege('authenticated','public.sp_disclosure_payload(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SP_PAYLOAD_DIRECTLY_CALLABLE: the payload builder is reachable without a check';
  END IF;

  IF has_column_privilege('authenticated','public.sp_disclosures','package_code','UPDATE')
     OR has_column_privilege('authenticated','public.sp_disclosures','application_id','UPDATE') THEN
    RAISE EXCEPTION 'SP_DISCLOSURE_REWRITABLE: a holder can rewrite an existing share in place';
  END IF;
END $$;