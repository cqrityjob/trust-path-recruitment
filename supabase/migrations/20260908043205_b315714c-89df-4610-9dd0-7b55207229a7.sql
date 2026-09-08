-- =============================================================================
-- Security Passport — the holder chooses WHICH merits a share carries, and
-- the recipient is told exactly what backs each one.
-- =============================================================================
-- (Canonical file: supabase/migrations/20261101090000_sp_selected_merit_sharing.sql
--  from main 52b0aaf1c54cbabf42b82305e4d29af33c6e3ced. The file's own outer
--  BEGIN/COMMIT is omitted only because this mechanism already runs the whole
--  body in one transaction; every statement below is otherwise the file's.)

-- ---------------------------------------------------------------------------
-- 1. The sixth package code
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_package_code_check;

ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_package_code_check CHECK (package_code IN
    ('public_card', 'verified_qualifications', 'verified_experience',
     'employer_review', 'full_verification', 'selected_merits'));

-- ---------------------------------------------------------------------------
-- 2. The language the recipient reads in, and the idempotency record
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE public.sp_disclosures
  DROP CONSTRAINT IF EXISTS sp_disclosures_locale_check;
ALTER TABLE public.sp_disclosures
  ADD CONSTRAINT sp_disclosures_locale_check
  CHECK (locale IS NULL OR locale IN ('sv', 'en'));

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS request_key uuid;

ALTER TABLE public.sp_disclosures
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN public.sp_disclosures.request_key IS
  'Caller-generated idempotency key. A retry of a create whose response was '
  'lost finds the existing row instead of minting a second live link. Unique '
  'per holder; NULL for every share created before this migration.';

COMMENT ON COLUMN public.sp_disclosures.request_fingerprint IS
  'SHA-256 of every fact that decides what this disclosure IS. A retry whose '
  'facts differ is a conflict, not a replay: a key names one intention.';

CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosures_request_key_uidx
  ON public.sp_disclosures (holder_user_id, request_key)
  WHERE request_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The selection itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_disclosure_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_id uuid NOT NULL REFERENCES public.sp_disclosures(id) ON DELETE CASCADE,

  claim_id      uuid REFERENCES public.sp_claims(id) ON DELETE CASCADE,
  experience_id uuid REFERENCES public.sp_experience_periods(id) ON DELETE CASCADE,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_disclosure_items_one_subject
    CHECK (num_nonnulls(claim_id, experience_id) = 1)
);

COMMENT ON TABLE public.sp_disclosure_items IS
  'Which merits one disclosure carries. Written once, at creation, by the '
  'selected-sharing functions only. The payload intersects this list with the '
  'active-lifecycle filter, so the selection can only ever narrow: a merit '
  'added later is absent, and a merit that lapses drops out.';

CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosure_items_claim_uidx
  ON public.sp_disclosure_items (disclosure_id, claim_id)
  WHERE claim_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sp_disclosure_items_experience_uidx
  ON public.sp_disclosure_items (disclosure_id, experience_id)
  WHERE experience_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sp_disclosure_items_disclosure_idx
  ON public.sp_disclosure_items (disclosure_id);

ALTER TABLE public.sp_disclosure_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_disclosure_items_self ON public.sp_disclosure_items;
CREATE POLICY sp_disclosure_items_self ON public.sp_disclosure_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sp_disclosures d
                  WHERE d.id = sp_disclosure_items.disclosure_id
                    AND d.holder_user_id = auth.uid()));

REVOKE ALL ON public.sp_disclosure_items FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.sp_disclosure_items TO authenticated;

-- Revocation is a one-way lifecycle operation, not a mutable timestamp.
REVOKE UPDATE (revoked_at) ON public.sp_disclosures FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. The request fingerprint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_share_request_fingerprint(
  _holder         uuid,
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _recipient_hint text,
  _locale         text,
  _source         uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT encode(digest(
    'spshare.v1'
    || '|' || length(coalesce(_holder::text, ''))         || ':' || coalesce(_holder::text, '')
    || '|' || length(coalesce(array_to_string(_claim_ids, ','), ''))
            || ':' || coalesce(array_to_string(_claim_ids, ','), '')
    || '|' || length(coalesce(array_to_string(_experience_ids, ','), ''))
            || ':' || coalesce(array_to_string(_experience_ids, ','), '')
    || '|' || length(coalesce(_expires_days::text, ''))   || ':' || coalesce(_expires_days::text, '')
    || '|' || length(coalesce(_purpose, ''))              || ':' || coalesce(_purpose, '')
    || '|' || length(coalesce(_recipient_hint, ''))       || ':' || coalesce(_recipient_hint, '')
    || '|' || length(coalesce(_locale, ''))               || ':' || coalesce(_locale, '')
    || '|' || length(coalesce(_source::text, ''))         || ':' || coalesce(_source::text, ''),
    'sha256'), 'hex');
$function$;

REVOKE ALL ON FUNCTION public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The one payload builder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_selected_merits_payload(
  _holder         uuid,
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _purpose        text,
  _locale         text,
  _expires_at     timestamptz,
  _authorised_at  timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _p public.sp_passport_profiles%ROWTYPE;
  _c uuid[] := coalesce(_claim_ids, '{}'::uuid[]);
  _e uuid[] := coalesce(_experience_ids, '{}'::uuid[]);
BEGIN
  SELECT * INTO _p FROM public.sp_passport_profiles WHERE holder_user_id = _holder;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;

  RETURN jsonb_build_object(
    'status','active',
    'package','selected_merits',
    'focus','passport',
    'purpose', _purpose,
    'locale', _locale,
    'expires_at', _expires_at,
    'authorised_at', _authorised_at,
    'last_updated', (
      SELECT max(t) FROM (
        SELECT max(c.updated_at) FROM public.sp_claims c
          WHERE c.holder_user_id = _holder AND c.lifecycle_state = 'active'
            AND c.id = ANY(_c)
        UNION ALL
        SELECT max(e.updated_at) FROM public.sp_experience_periods e
          WHERE e.holder_user_id = _holder AND e.lifecycle_state = 'active'
            AND e.id = ANY(_e)
        UNION ALL
        SELECT _p.updated_at
      ) AS s(t)),
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
        'key', 'c' || t.ord,
        'type', t.claim_type, 'title', t.title,
        'credential_code', t.credential_code,
        'issuer', t.claimed_issuer_name, 'jurisdiction', t.jurisdiction_code,
        'sub_jurisdiction', t.sub_jurisdiction_code,
        'scope_limited', (t.authorisation_scope IS NOT NULL
                          AND length(btrim(t.authorisation_scope)) > 0),
        'authorisation_scope', NULL,
        'issued_on', t.issued_on, 'valid_until', t.valid_until,
        'assertion', t.assertion_level, 'lifecycle', t.lifecycle_state,
        'verified_at', t.verified_at,
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.claim_id = t.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.claim_id = t.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY t.ord)
      FROM (
        SELECT c.*, row_number() OVER (ORDER BY c.issued_on DESC NULLS LAST, c.id) AS ord
          FROM public.sp_claims c
         WHERE c.holder_user_id = _holder
           AND c.lifecycle_state = 'active'
           AND c.id = ANY(_c)
      ) t
    ), '[]'::jsonb),
    'verified_experience', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key', 'e' || t.ord,
        'employer', t.employer_name, 'role', t.role_title,
        'started_on', t.started_on, 'ended_on', t.ended_on,
        'jurisdiction', t.jurisdiction_code,
        'assertion', t.assertion_level, 'lifecycle', t.lifecycle_state,
        'verifier_organisation', (SELECT d2.decider_organisation
                                    FROM public.sp_verification_decisions d2
                                    JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                   WHERE r2.period_id = t.id AND d2.decision = 'approved'
                                   ORDER BY d2.decided_at DESC LIMIT 1),
        'verification_method', (SELECT d2.verification_method
                                  FROM public.sp_verification_decisions d2
                                  JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
                                 WHERE r2.period_id = t.id AND d2.decision = 'approved'
                                 ORDER BY d2.decided_at DESC LIMIT 1))
        ORDER BY t.ord)
      FROM (
        SELECT e.*, row_number() OVER (ORDER BY e.started_on DESC, e.id) AS ord
          FROM public.sp_experience_periods e
         WHERE e.holder_user_id = _holder
           AND e.lifecycle_state = 'active'
           AND e.id = ANY(_e)
      ) t
    ), '[]'::jsonb),
    'verified_experience_days', coalesce((
      SELECT sum(coalesce(e.ended_on, current_date) - e.started_on)
        FROM public.sp_experience_periods e
       WHERE e.holder_user_id = _holder
         AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
         AND e.id = ANY(_e)
         AND EXISTS (
           SELECT 1
             FROM public.sp_verification_decisions d2
             JOIN public.sp_verification_requests r2 ON r2.id = d2.request_id
            WHERE r2.period_id = e.id
              AND r2.request_kind = 'employer_attestation'
              AND r2.target_employer_id IS NOT NULL
              AND d2.decision = 'approved'
              AND d2.verification_method = 'employer_confirmation'
              AND nullif(btrim(d2.decider_organisation), '') IS NOT NULL
              AND lower(btrim(d2.decider_organisation)) <> 'cqrityjob'
         )
    ), 0));
END; $function$;

REVOKE ALL ON FUNCTION public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The live payload delegates for a selected share
-- ---------------------------------------------------------------------------
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

  IF _d.package_code = 'selected_merits' THEN
    RETURN public.sp_selected_merits_payload(
      _d.holder_user_id,
      coalesce((SELECT array_agg(i.claim_id)
                  FROM public.sp_disclosure_items i
                 WHERE i.disclosure_id = _d.id AND i.claim_id IS NOT NULL), '{}'::uuid[]),
      coalesce((SELECT array_agg(i.experience_id)
                  FROM public.sp_disclosure_items i
                 WHERE i.disclosure_id = _d.id AND i.experience_id IS NOT NULL), '{}'::uuid[]),
      _d.purpose,
      _d.locale,
      _d.expires_at,
      _d.created_at);
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
    'locale', _d.locale,
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

-- ---------------------------------------------------------------------------
-- 7. The anonymous boundary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_disclosure(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $function$
DECLARE _d public.sp_disclosures%ROWTYPE; _payload jsonb;
BEGIN
  SELECT * INTO _d FROM public.sp_disclosures
   WHERE token_hash = encode(digest(coalesce(_token,''), 'sha256'), 'hex')
     AND application_id IS NULL;

  IF NOT FOUND OR _d.revoked_at IS NOT NULL
     OR (_d.expires_at IS NOT NULL AND _d.expires_at < now()) THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  UPDATE public.sp_disclosures SET access_count = access_count + 1 WHERE id = _d.id;
  INSERT INTO public.sp_disclosure_accesses (disclosure_id) VALUES (_d.id);

  _payload := public.sp_disclosure_payload(_d.id);

  IF _payload ->> 'status' <> 'active' THEN
    RETURN jsonb_build_object('status','unavailable');
  END IF;

  IF _d.package_code = 'selected_merits' THEN
    _payload := jsonb_set(_payload, '{verified_claims}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'c' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_claims')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    _payload := jsonb_set(_payload, '{verified_experience}', coalesce((
      SELECT jsonb_agg((row.value - 'id')
                       || jsonb_build_object('key', coalesce(row.value ->> 'key', 'e' || row.ord))
                       ORDER BY row.ord)
        FROM jsonb_array_elements(_payload -> 'verified_experience')
               WITH ORDINALITY AS row(value, ord)), '[]'::jsonb));

    RETURN _payload || jsonb_build_object('checked_at', now());
  END IF;

  RETURN _payload;
END; $function$;

REVOKE ALL ON FUNCTION public.sp_get_disclosure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_disclosure(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. The input contract, shared by every selected-sharing entry point
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_assert_share_inputs(integer, text);

CREATE OR REPLACE FUNCTION public.sp_assert_share_inputs(
  _expires_days integer,
  _locale       text,
  _purpose      text,
  _recipient_hint text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF _expires_days IS NULL OR _expires_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'SP_UNSUPPORTED_EXPIRY: a share lasts 7, 30 or 90 days.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _locale IS NULL OR _locale NOT IN ('sv', 'en') THEN
    RAISE EXCEPTION 'SP_UNSUPPORTED_LOCALE: a share is rendered in sv or en.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _purpose IS NOT NULL AND length(_purpose) > 200 THEN
    RAISE EXCEPTION 'SP_PURPOSE_TOO_LONG: purpose is limited to 200 characters.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _recipient_hint IS NOT NULL AND length(_recipient_hint) > 200 THEN
    RAISE EXCEPTION 'SP_RECIPIENT_HINT_TOO_LONG: recipient hint is limited to 200 characters.'
      USING ERRCODE = 'check_violation';
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.sp_assert_share_inputs(integer, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_create_selected_disclosure(
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _recipient_hint text,
  _locale         text,
  _request_key    uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  _token text;
  _id uuid;
  _existing public.sp_disclosures%ROWTYPE;
  _expires timestamptz;
  _fp text;
  _c uuid[];
  _e uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _request_key IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED: every create must name the attempt '
      'it belongs to.' USING ERRCODE='check_violation';
  END IF;

  PERFORM public.sp_assert_share_inputs(
    _expires_days, _locale, _purpose, _recipient_hint);

  IF coalesce(cardinality(_claim_ids), 0)
       + coalesce(cardinality(_experience_ids), 0) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE='check_violation';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO _c FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO _e FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x;

  _fp := public.sp_share_request_fingerprint(
    auth.uid(), _c, _e, _expires_days, _purpose, _recipient_hint, _locale, NULL);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_share:' || auth.uid()::text || ':' || _request_key::text, 0));

  SELECT * INTO _existing FROM public.sp_disclosures
   WHERE holder_user_id = auth.uid() AND request_key = _request_key;

  IF FOUND THEN
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END IF;

  IF cardinality(_c) + cardinality(_e) = 0 THEN
    RAISE EXCEPTION 'SP_NOTHING_SELECTED: choose at least one current merit to share.'
      USING ERRCODE='check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                  WHERE holder_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'SP_NO_PASSPORT' USING ERRCODE='no_data_found';
  END IF;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  _expires := now() + (_expires_days || ' days')::interval;
  _token   := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.sp_disclosures (
      holder_user_id, package_code, token_hash, purpose, recipient_hint,
      locale, expires_at, request_key, request_fingerprint)
    VALUES (auth.uid(), 'selected_merits', encode(digest(_token, 'sha256'), 'hex'),
            _purpose, _recipient_hint, _locale, _expires, _request_key, _fp)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.sp_disclosures
     WHERE holder_user_id = auth.uid() AND request_key = _request_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_SHARE_NOT_CREATED' USING ERRCODE='check_violation';
    END IF;
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END;

  INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id)
  SELECT _id, x FROM unnest(_c) AS x;

  INSERT INTO public.sp_disclosure_items (disclosure_id, experience_id)
  SELECT _id, x FROM unnest(_e) AS x;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','selected_disclosure_created',
                             'claims', cardinality(_c),
                             'employments', cardinality(_e)));

  RETURN jsonb_build_object(
    'status','created',
    'token', _token,
    'disclosure_id', _id,
    'expires_at', _expires);
END; $function$;

REVOKE ALL ON FUNCTION public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. The preview
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_preview_selected_disclosure(
  _claim_ids      uuid[],
  _experience_ids uuid[],
  _expires_days   integer,
  _purpose        text,
  _locale         text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _c uuid[];
  _e uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;

  PERFORM public.sp_assert_share_inputs(_expires_days, _locale, _purpose, NULL);

  IF coalesce(cardinality(_claim_ids), 0)
       + coalesce(cardinality(_experience_ids), 0) > 200 THEN
    RAISE EXCEPTION 'SP_TOO_MANY_MERITS' USING ERRCODE='check_violation';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO _c FROM unnest(coalesce(_claim_ids, '{}'::uuid[])) AS x;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO _e FROM unnest(coalesce(_experience_ids, '{}'::uuid[])) AS x;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active')
     <> cardinality(_c) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_experience_periods e
       WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
         AND e.lifecycle_state = 'active')
     <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  RETURN public.sp_selected_merits_payload(
    auth.uid(), _c, _e, _purpose, _locale,
    now() + (_expires_days || ' days')::interval,
    now());
END; $function$;

REVOKE ALL ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. A new link over the same contents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_replace_selected_disclosure(
  _disclosure_id    uuid,
  _revoke_previous  boolean,
  _request_key      uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  _source public.sp_disclosures%ROWTYPE;
  _existing public.sp_disclosures%ROWTYPE;
  _token text; _id uuid; _fp text; _days integer; _expires timestamptz;
  _c uuid[]; _e uuid[];
  _revoke boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _request_key IS NULL THEN
    RAISE EXCEPTION 'SP_REQUEST_KEY_REQUIRED: every create must name the attempt '
      'it belongs to.' USING ERRCODE='check_violation';
  END IF;
  IF _revoke_previous IS NULL THEN
    RAISE EXCEPTION 'SP_REVOKE_CHOICE_REQUIRED: choose whether the previous link '
      'must stop working.' USING ERRCODE='check_violation';
  END IF;
  _revoke := _revoke_previous;

  _fp := public.sp_share_request_fingerprint(
    auth.uid(), NULL, NULL, NULL, CASE WHEN _revoke THEN 'revoke' ELSE 'keep' END,
    NULL, NULL, _disclosure_id);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sp_share:' || auth.uid()::text || ':' || _request_key::text, 0));

  SELECT * INTO _existing FROM public.sp_disclosures
   WHERE holder_user_id = auth.uid() AND request_key = _request_key;
  IF FOUND THEN
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END IF;

  SELECT * INTO _source FROM public.sp_disclosures
   WHERE id = _disclosure_id AND holder_user_id = auth.uid();

  IF NOT FOUND OR _source.package_code <> 'selected_merits' THEN
    RAISE EXCEPTION 'SP_SHARE_NOT_REPLACEABLE: only your own current chosen-merit '
      'share can be reissued.' USING ERRCODE='check_violation';
  END IF;
  IF _source.revoked_at IS NOT NULL
     OR _source.expires_at IS NULL
     OR _source.expires_at < now() THEN
    RAISE EXCEPTION 'SP_SHARE_NOT_REPLACEABLE: only your own current chosen-merit '
      'share can be reissued.' USING ERRCODE='check_violation';
  END IF;

  _days := round(extract(epoch FROM (_source.expires_at - _source.created_at)) / 86400.0);
  PERFORM public.sp_assert_share_inputs(
    _days, _source.locale, _source.purpose, _source.recipient_hint);

  SELECT coalesce(array_agg(DISTINCT i.claim_id ORDER BY i.claim_id)
                    FILTER (WHERE i.claim_id IS NOT NULL), '{}'::uuid[]),
         coalesce(array_agg(DISTINCT i.experience_id ORDER BY i.experience_id)
                    FILTER (WHERE i.experience_id IS NOT NULL), '{}'::uuid[])
    INTO _c, _e
    FROM public.sp_disclosure_items i
   WHERE i.disclosure_id = _source.id;

  IF cardinality(_c) + cardinality(_e) = 0 THEN
    RAISE EXCEPTION 'SP_NOTHING_SELECTED: choose at least one current merit to share.'
      USING ERRCODE='check_violation';
  END IF;

  IF (SELECT count(*) FROM public.sp_claims c
       WHERE c.id = ANY(_c) AND c.holder_user_id = auth.uid()
         AND c.lifecycle_state = 'active') <> cardinality(_c)
     OR (SELECT count(*) FROM public.sp_experience_periods e
          WHERE e.id = ANY(_e) AND e.holder_user_id = auth.uid()
            AND e.lifecycle_state = 'active') <> cardinality(_e) THEN
    RAISE EXCEPTION 'SP_MERIT_NOT_SHAREABLE: only your own current merits can be '
      'shared.' USING ERRCODE='check_violation';
  END IF;

  _expires := now() + (_days || ' days')::interval;
  _token   := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.sp_disclosures (
      holder_user_id, package_code, token_hash, purpose, recipient_hint,
      locale, expires_at, request_key, request_fingerprint)
    VALUES (auth.uid(), 'selected_merits', encode(digest(_token, 'sha256'), 'hex'),
            _source.purpose, _source.recipient_hint, _source.locale, _expires,
            _request_key, _fp)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _existing FROM public.sp_disclosures
     WHERE holder_user_id = auth.uid() AND request_key = _request_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_SHARE_NOT_CREATED' USING ERRCODE='check_violation';
    END IF;
    IF _existing.request_fingerprint IS DISTINCT FROM _fp THEN
      RAISE EXCEPTION 'SP_REQUEST_KEY_CONFLICT: this attempt already created a '
        'share with different contents.' USING ERRCODE='check_violation';
    END IF;
    RETURN jsonb_build_object(
      'status','already_created',
      'disclosure_id', _existing.id,
      'expires_at', _existing.expires_at,
      'created_at', _existing.created_at);
  END;

  INSERT INTO public.sp_disclosure_items (disclosure_id, claim_id)
  SELECT _id, x FROM unnest(_c) AS x;
  INSERT INTO public.sp_disclosure_items (disclosure_id, experience_id)
  SELECT _id, x FROM unnest(_e) AS x;

  IF _revoke THEN
    UPDATE public.sp_disclosures SET revoked_at = coalesce(revoked_at, now())
     WHERE id = _source.id AND holder_user_id = auth.uid();
  END IF;

  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (auth.uid(), auth.uid(), 'privacy_changed', 'profile', _id,
          jsonb_build_object('action','selected_disclosure_reissued',
                             'claims', cardinality(_c),
                             'employments', cardinality(_e),
                             'previous_revoked', _revoke));

  RETURN jsonb_build_object(
    'status','created',
    'token', _token,
    'disclosure_id', _id,
    'expires_at', _expires,
    'previous_revoked', _revoke);
END; $function$;

REVOKE ALL ON FUNCTION public.sp_replace_selected_disclosure(uuid, boolean, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_replace_selected_disclosure(uuid, boolean, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Postflight
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n integer;
BEGIN
  IF has_table_privilege('anon', 'public.sp_disclosure_items', 'SELECT')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'INSERT')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'UPDATE')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'DELETE')
     OR has_table_privilege('anon', 'public.sp_disclosure_items', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: anon can reach sp_disclosure_items.';
  END IF;

  IF has_table_privilege('authenticated', 'public.sp_disclosure_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'DELETE')
     OR has_table_privilege('authenticated', 'public.sp_disclosure_items', 'TRUNCATE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder can write sp_disclosure_items '
      'directly; the selection would no longer be a server-side fact.';
  END IF;

  IF has_column_privilege(
       'authenticated', 'public.sp_disclosures', 'revoked_at', 'UPDATE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder can reactivate a '
      'revoked disclosure through the table.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sp_disclosure_items', 'SELECT') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder cannot read their own selection.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.sp_disclosure_items'::regclass) THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: RLS is not enabled on sp_disclosure_items.';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'sp_disclosure_items';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: expected exactly one policy on '
      'sp_disclosure_items, found %.', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('sp_selected_merits_payload','sp_create_selected_disclosure',
                       'sp_preview_selected_disclosure','sp_replace_selected_disclosure',
                       'sp_share_request_fingerprint','sp_assert_share_inputs')
     AND p.proconfig IS NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a new function has no pinned search_path.';
  END IF;

  IF has_function_privilege('anon',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_replace_selected_disclosure(uuid, boolean, uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_assert_share_inputs(integer, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: anon can execute a new sharing function.';
  END IF;

  IF has_function_privilege('authenticated',
       'public.sp_selected_merits_payload(uuid,uuid[],uuid[],text,text,timestamptz,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.sp_share_request_fingerprint(uuid,uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.sp_assert_share_inputs(integer,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: authenticated can execute an internal function.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.sp_create_selected_disclosure(uuid[],uuid[],integer,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.sp_preview_selected_disclosure(uuid[],uuid[],integer,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.sp_replace_selected_disclosure(uuid, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: a holder cannot create, preview or reissue.';
  END IF;

  IF has_function_privilege('anon', 'public.sp_get_disclosure(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sp_get_disclosure(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: sp_get_disclosure is no longer service-role only.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sp_disclosures'::regclass
       AND conname = 'sp_disclosures_package_code_check'
       AND pg_get_constraintdef(oid) LIKE '%selected_merits%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: selected_merits is not an accepted package.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public'
                    AND indexname = 'sp_disclosures_request_key_uidx') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the request-key index is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sp_disclosures'
                    AND column_name='request_fingerprint') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: request_fingerprint is missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sp_get_disclosure'
                    AND p.prosrc LIKE '%IF _d.package_code = ''selected_merits''%'
                    AND p.prosrc LIKE '%- ''id''%'
                    AND p.prosrc LIKE '%checked_at%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the selected-merit boundary no longer '
      'scopes identifier stripping and server check time to its package.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sp_create_selected_disclosure'
                    AND p.prosrc LIKE '%pg_advisory_xact_lock%') THEN
    RAISE EXCEPTION 'SP_SELECTED_SHARE_POSTFLIGHT: the create is no longer serialised on its key.';
  END IF;
END $$;