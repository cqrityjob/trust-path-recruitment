-- =============================================================================
-- 20270318090000 -- Recruitment: find voluntarily discoverable people for a
-- published job, explain why, and ask them to get in touch.
--
-- Canonical forward slot. Schema-first: no application code in the same PR.
-- Depends on 20270316090000 (user_notices, metrics) and 20270317090000
-- (sp_talent_*). Does not change any application-disclosure contract: an
-- application share is still read only through sp_application_disclosure.
--
-- 1. rec_requirement_criteria_sets -- binds each requirement of the job's
--    CONFIRMED profile (rec_requirement_profiles) to the governed catalogue:
--      credential  one or more sp_credential_types codes of ONE class
--                  (education | certification | regulated_authorisation),
--                  optional jurisdiction, must-be-valid, minimum level;
--      experience  minimum months of security-relevant experience;
--      unbound     a requirement that cannot be read from a Passport and is
--                  always shown as "to clarify".
--    Versioned and immutable like the profile; a set is valid only for the
--    profile version it was confirmed against. A changed profile needs the
--    criteria confirmed again before searching.
--
-- 2. rec_talent_search / rec_talent_profile -- deterministic and explainable.
--    Who: an active owner/admin of an ACTIVE organisation, or the job's
--    responsible recruiter (rec_can_manage), for a job that is published and
--    open. A plain member is refused. Every other caller receives the same
--    refusal whether the job exists or not.
--    What: only holders whose visibility is open/active, only the items they
--    selected, read live through sp_talent_card (20270317090000). A paused
--    holder's search_ref is rotated, so old results stop resolving.
--    How it reads: per requirement one of
--      evidenced | needs_clarification | not_shared | to_clarify
--    "not_shared" never means "does not have it". An international
--    certification is never a regulated authorisation: a criterion's codes
--    are all of one class, and only those codes can satisfy it.
--    Order (documented, explained to the recruiter): mandatory requirements
--    evidenced, of those reviewed, desirable evidenced, stated job
--    preferences met, then the opaque reference. No score, no verdict, no
--    rejection, no personality data.
--
-- 3. rec_talent_contact_requests -- a contact request tied to the job.
--    One open request per (job, person); a request a person declined is not
--    sent again for that job. Caps: 20 per sender and 60 per organisation per
--    24 hours, and at most 3 open requests per person from one organisation.
--    The person can accept, decline, or decline and stop all contact from the
--    organisation (sp_talent_blocks). Accepting shares the person's name with
--    the organisation and invites them to apply; it creates no application and
--    shares nothing else. The application, and any Passport sharing with it,
--    stays the person's own act through rec_submit_application.
--    The organisation keeps a dated snapshot of what it saw when it sent the
--    request, labelled as such; it is cleared when the person declines or
--    blocks, and it never becomes standing access (hiring changes nothing).
--
-- Rollback: supabase/rollback/20270318090000_rec_talent_search_and_contact_rollback.sql
-- Suite:    supabase/tests/rec_talent_search_and_contact_test.sql
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Notices gain the contact kinds.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_notices DROP CONSTRAINT user_notices_kind_check;
ALTER TABLE public.user_notices ADD CONSTRAINT user_notices_kind_check CHECK (kind IN (
  'passport_review_requested', 'passport_clarification_answered',
  'passport_clarification_requested', 'passport_decision_approved',
  'passport_decision_rejected', 'passport_verification_revoked',
  'talent_contact_received', 'talent_contact_accepted', 'talent_contact_declined'));
ALTER TABLE public.user_notices DROP CONSTRAINT user_notices_subject_type_check;
ALTER TABLE public.user_notices ADD CONSTRAINT user_notices_subject_type_check
  CHECK (subject_type IN ('claim', 'experience', 'request', 'contact'));

-- ---------------------------------------------------------------------------
-- Who may search and contact for a job. Explicit user argument so the e-mail
-- worker can re-check it without a session.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.rec_talent_user_may_search(_user uuid, _job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.id = _job_id
       AND public.employer_is_active_status(j.employer_id)
       AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
       AND public.has_employer_role(_user, j.employer_id, NULL)
       AND (public.has_employer_role(_user, j.employer_id, ARRAY['owner', 'admin'])
            OR EXISTS (SELECT 1 FROM public.recruitment_settings s
                        WHERE s.job_id = j.id AND s.responsible_user_id = _user)));
$$;
REVOKE ALL ON FUNCTION public.rec_talent_user_may_search(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_talent_assert_may_search(_job_id uuid)
RETURNS public.jobs LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE;
BEGIN
  IF NOT public.rec_talent_user_may_search(auth.uid(), _job_id) THEN
    -- Identical for "no such job", "not published", "not your organisation" and "not allowed".
    RAISE EXCEPTION 'TALENT_SEARCH_NOT_AVAILABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO j FROM public.jobs WHERE id = _job_id;
  RETURN j;
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_assert_may_search(uuid) FROM PUBLIC, anon, authenticated;

-- What the UI should offer on a job page: may this caller search? Never says why not.
CREATE FUNCTION public.rec_talent_access(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.sp_assert_passport_session();
  RETURN jsonb_build_object('maySearch', public.rec_talent_user_may_search(auth.uid(), _job_id));
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Catalogue-bound criteria for the confirmed profile.
-- ---------------------------------------------------------------------------
CREATE TABLE public.rec_requirement_criteria_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id  uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  version      integer NOT NULL CHECK (version > 0),
  criteria     jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array'),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);
ALTER TABLE public.rec_requirement_criteria_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_requirement_criteria_sets FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_criteria_sets_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'TALENT_CRITERIA_IMMUTABLE' USING ERRCODE = 'check_violation'; END IF;
  -- Deletion only follows the job or the organisation (cascade).
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = OLD.job_id) THEN
    RAISE EXCEPTION 'TALENT_CRITERIA_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.rec_criteria_sets_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rec_criteria_sets_immutable BEFORE UPDATE OR DELETE ON public.rec_requirement_criteria_sets
  FOR EACH ROW EXECUTE FUNCTION public.rec_criteria_sets_immutable();

CREATE FUNCTION public.rec_talent_latest_profile(_job_id uuid)
RETURNS public.rec_requirement_profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM public.rec_requirement_profiles WHERE job_id = _job_id ORDER BY version DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.rec_talent_latest_profile(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_talent_latest_criteria(_job_id uuid)
RETURNS public.rec_requirement_criteria_sets LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT * FROM public.rec_requirement_criteria_sets WHERE job_id = _job_id ORDER BY version DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.rec_talent_latest_criteria(uuid) FROM PUBLIC, anon, authenticated;

-- Read for the job page. Readable by any organisation member who may read the
-- job's profile (rec_is_member); editing is rec_can_manage.
CREATE FUNCTION public.rec_talent_get_criteria(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; c public.rec_requirement_criteria_sets%ROWTYPE;
BEGIN
  PERFORM public.sp_assert_passport_session();
  SELECT * INTO j FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND OR NOT public.rec_is_member(j.employer_id) THEN
    RAISE EXCEPTION 'TALENT_SEARCH_NOT_AVAILABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  p := public.rec_talent_latest_profile(_job_id);
  c := public.rec_talent_latest_criteria(_job_id);
  RETURN jsonb_build_object(
    'jobId', j.id, 'jobStatus', j.status,
    'jobActive', public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at),
    'canManage', public.rec_can_manage(j.id),
    'maySearch', public.rec_talent_user_may_search(auth.uid(), j.id),
    'profile', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', p.id, 'version', p.version, 'confirmedAt', p.confirmed_at,
        'requirements', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'requirementId', r->>'requirementId', 'kind', r->>'kind', 'labelSv', r->>'labelSv', 'labelEn', r->>'labelEn',
            'position', (r->>'position')::integer) ORDER BY (r->>'position')::integer), '[]'::jsonb)
          FROM jsonb_array_elements(p.rules) r)) END,
    'criteria', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id, 'version', c.version, 'profileId', c.profile_id, 'confirmedAt', c.confirmed_at,
        'current', c.profile_id = p.id, 'items', c.criteria) END,
    'jobPreferences', jsonb_build_object(
        'area', j.family_id, 'country', j.country, 'city', j.city,
        'employmentType', j.employment_type, 'workplaceType', j.workplace_type));
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_get_criteria(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_get_criteria(uuid) TO authenticated;

-- Catalogue options for the criteria editor: active, governed definitions only.
CREATE FUNCTION public.rec_talent_catalogue_options()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'code', t.code, 'nameSv', t.name_sv, 'nameEn', t.name_en, 'abbreviation', t.symbol_label,
      'requirementClass', public.sp_catalogue_requirement_class(t.code), 'jurisdiction', t.jurisdiction_code,
      'subJurisdiction', t.sub_jurisdiction_code, 'scope', t.scope_code)
    ORDER BY public.sp_catalogue_requirement_class(t.code), t.jurisdiction_code NULLS FIRST, t.name_en), '[]'::jsonb)
  FROM public.sp_credential_types t
  WHERE t.is_active AND public.sp_is_passport_credential(t.claim_type, t.code)
    AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.rec_talent_catalogue_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_catalogue_options() TO authenticated;

-- _profile_id: the requirement-profile version the editor was showing. A
-- profile confirmed in another session since then is refused, so criteria are
-- never bound to a profile the user has not seen (review 2026-10-15, RF7).
CREATE FUNCTION public.rec_talent_confirm_criteria(_job_id uuid, _expected_version integer, _profile_id uuid, _criteria jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; cur public.rec_requirement_criteria_sets%ROWTYPE;
        c jsonb; rule jsonb; out jsonb := '[]'; codes text[]; cls text; klass text; months integer;
        jur text; min_level text; v integer;
BEGIN
  PERFORM public.sp_assert_passport_session();
  SELECT * INTO j FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN
    RAISE EXCEPTION 'TALENT_SEARCH_NOT_AVAILABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  p := public.rec_talent_latest_profile(_job_id);
  IF p.id IS NULL THEN RAISE EXCEPTION 'TALENT_PROFILE_REQUIRED' USING ERRCODE = 'check_violation'; END IF;
  IF p.id IS DISTINCT FROM _profile_id THEN
    RAISE EXCEPTION 'TALENT_CRITERIA_STALE' USING ERRCODE = 'check_violation';
  END IF;
  cur := public.rec_talent_latest_criteria(_job_id);
  v := coalesce(cur.version, 0);
  IF v <> coalesce(_expected_version, -1) THEN
    RAISE EXCEPTION 'TALENT_CRITERIA_STALE' USING ERRCODE = 'check_violation';
  END IF;
  IF _criteria IS NULL OR jsonb_typeof(_criteria) <> 'array' OR jsonb_array_length(_criteria) > 30
     OR (SELECT count(DISTINCT x->>'requirementId') FROM jsonb_array_elements(_criteria) x) <> jsonb_array_length(_criteria) THEN
    RAISE EXCEPTION 'TALENT_CRITERIA_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  FOR rule IN SELECT value FROM jsonb_array_elements(p.rules) ORDER BY (value->>'position')::integer LOOP
    SELECT value INTO c FROM jsonb_array_elements(_criteria) WHERE value->>'requirementId' = rule->>'requirementId';
    codes := NULL; months := NULL; jur := NULL; min_level := 'any'; klass := 'unbound';
    IF c IS NOT NULL THEN
      IF jsonb_typeof(c->'credentialCodes') = 'array' AND jsonb_array_length(c->'credentialCodes') > 0 THEN
        SELECT array_agg(DISTINCT x) INTO codes FROM jsonb_array_elements_text(c->'credentialCodes') x;
        IF cardinality(codes) > 5 OR EXISTS (
             SELECT 1 FROM unnest(codes) x WHERE NOT EXISTS (
               SELECT 1 FROM public.sp_credential_types t WHERE t.code = x AND t.is_active
                 AND public.sp_is_passport_credential(t.claim_type, t.code))) THEN
          RAISE EXCEPTION 'TALENT_CRITERIA_UNKNOWN_CREDENTIAL' USING ERRCODE = 'check_violation';
        END IF;
        SELECT min(public.sp_catalogue_requirement_class(x)), count(DISTINCT public.sp_catalogue_requirement_class(x))::text
          INTO klass, cls FROM unnest(codes) x;
        IF cls <> '1' THEN
          -- An international certification and a regulated authorisation are different facts.
          RAISE EXCEPTION 'TALENT_CRITERIA_MIXED_CLASSES' USING ERRCODE = 'check_violation';
        END IF;
        jur := nullif(upper(btrim(coalesce(c->>'jurisdiction', ''))), '');
        IF jur IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sp_jurisdictions WHERE code = jur) THEN
          RAISE EXCEPTION 'TALENT_CRITERIA_INVALID' USING ERRCODE = 'check_violation';
        END IF;
        min_level := coalesce(nullif(c->>'minLevel', ''), 'any');
        IF min_level NOT IN ('any', 'document_provided', 'document_reviewed') THEN
          RAISE EXCEPTION 'TALENT_CRITERIA_INVALID' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF c ? 'experienceMonths' AND jsonb_typeof(c->'experienceMonths') = 'number' THEN
        months := (c->>'experienceMonths')::integer;
        IF months NOT BETWEEN 1 AND 480 THEN RAISE EXCEPTION 'TALENT_CRITERIA_INVALID' USING ERRCODE = 'check_violation'; END IF;
        klass := 'experience';
      END IF;
    END IF;
    out := out || jsonb_build_array(jsonb_build_object(
      'requirementId', rule->>'requirementId', 'kind', rule->>'kind',
      'labelSv', rule->>'labelSv', 'labelEn', rule->>'labelEn', 'position', (rule->>'position')::integer,
      'requirementClass', klass,
      'credentialCodes', CASE WHEN codes IS NULL THEN '[]'::jsonb ELSE (
          SELECT jsonb_agg(jsonb_build_object('code', t.code, 'nameSv', t.name_sv, 'nameEn', t.name_en,
                   'abbreviation', t.symbol_label, 'jurisdiction', t.jurisdiction_code, 'scope', t.scope_code) ORDER BY t.code)
            FROM public.sp_credential_types t WHERE t.code = ANY (codes)) END,
      'jurisdiction', jur,
      'mustBeValid', CASE WHEN codes IS NULL THEN NULL ELSE coalesce((c->>'mustBeValid')::boolean, true) END,
      'minLevel', CASE WHEN codes IS NULL THEN NULL ELSE min_level END,
      'experienceMonths', months));
    c := NULL;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(_criteria) x
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.rules) r WHERE r->>'requirementId' = x->>'requirementId')) > 0 THEN
    RAISE EXCEPTION 'TALENT_CRITERIA_UNKNOWN_REQUIREMENT' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.rec_requirement_criteria_sets (job_id, employer_id, profile_id, version, criteria, confirmed_by)
  VALUES (j.id, j.employer_id, p.id, v + 1, out, auth.uid());
  RETURN public.rec_talent_get_criteria(_job_id);
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_confirm_criteria(uuid, integer, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_confirm_criteria(uuid, integer, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deterministic evaluation of one holder against one job.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.rec_talent_level_rank(_level text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _level WHEN 'source_confirmed' THEN 4 WHEN 'document_reviewed' THEN 3 WHEN 'employer_confirmed' THEN 3
                     WHEN 'document_provided' THEN 2 WHEN 'self_declared' THEN 1 ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.rec_talent_level_rank(text) FROM PUBLIC, anon;

CREATE FUNCTION public.rec_talent_evaluate(_card jsonb, _criteria jsonb, _job public.jobs)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cr jsonb; m jsonb; best jsonb; reasons text[]; state text; results jsonb := '[]';
        mand_total integer := 0; mand_ev integer := 0; mand_rev integer := 0; des_ev integer := 0;
        any_relevant boolean := false; prefs jsonb := _card->'preferences'; pref_area text; pref_loc text; pref_emp text;
        pref_met integer := 0; months integer; needed integer; codes text[]; any_expired_mand boolean := false;
BEGIN
  FOR cr IN SELECT value FROM jsonb_array_elements(_criteria) ORDER BY (value->>'position')::integer LOOP
    reasons := '{}'; best := NULL; state := NULL;
    IF cr->>'requirementClass' = 'unbound' THEN
      state := 'to_clarify';
    ELSIF cr->>'requirementClass' = 'experience' THEN
      months := coalesce((_card->>'totalSecurityMonths')::integer, 0);
      needed := (cr->>'experienceMonths')::integer;
      IF jsonb_array_length(coalesce(_card->'experience', '[]')) = 0 THEN
        state := 'not_shared';
      ELSE
        any_relevant := true;
        best := jsonb_build_object('months', months, 'level',
          CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_card->'experience') e
                                 WHERE e->>'level' NOT IN ('employer_confirmed', 'document_reviewed'))
               THEN 'confirmed' ELSE 'declared' END);
        IF months >= needed THEN state := 'evidenced';
        ELSE state := 'needs_clarification'; reasons := array_append(reasons, 'fewer_months_shared'); END IF;
        IF best->>'level' = 'declared' THEN reasons := array_append(reasons, 'experience_declared'); END IF;
      END IF;
    ELSE
      SELECT array_agg(x->>'code') INTO codes FROM jsonb_array_elements(cr->'credentialCodes') x;
      SELECT x INTO best FROM jsonb_array_elements(_card->'merits') x
       WHERE x->>'code' = ANY (codes)
       ORDER BY (x->>'validity' IN ('valid', 'no_expiry', 'expiring_soon')) DESC,
                (cr->>'jurisdiction' IS NULL OR x->>'jurisdiction' = cr->>'jurisdiction'
                   OR x->>'validityJurisdiction' = cr->>'jurisdiction') DESC,
                public.rec_talent_level_rank(x->>'level') DESC, x->>'validUntil' DESC NULLS FIRST
       LIMIT 1;
      IF best IS NULL THEN
        state := 'not_shared';
        IF cr->>'requirementClass' = 'regulated_authorisation'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(_card->'merits') x WHERE x->>'requirementClass' = 'certification') THEN
          reasons := array_append(reasons, 'international_certification_is_not_authorisation');
        END IF;
      ELSE
        any_relevant := true;
        IF cr->>'jurisdiction' IS NOT NULL AND best->>'jurisdiction' IS DISTINCT FROM cr->>'jurisdiction'
           AND best->>'validityJurisdiction' IS DISTINCT FROM cr->>'jurisdiction' THEN
          reasons := array_append(reasons, 'other_jurisdiction');
        END IF;
        -- Validity only changes the state when the employer asked for a valid
        -- merit; otherwise expiry is a note (review 2026-10-15, RF6).
        IF coalesce((cr->>'mustBeValid')::boolean, true) THEN
          IF best->>'validity' = 'expired' THEN reasons := array_append(reasons, 'expired');
          ELSIF best->>'validity' = 'not_yet_valid' THEN reasons := array_append(reasons, 'not_yet_valid');
          -- A date the catalogue requires but the person did not give is unknown, not valid.
          ELSIF best->>'validity' = 'not_stated' AND coalesce((best->>'validityRequired')::boolean, false) THEN
            reasons := array_append(reasons, 'validity_not_stated');
          END IF;
        END IF;
        IF cr->>'minLevel' = 'document_reviewed' AND public.rec_talent_level_rank(best->>'level') < 3 THEN
          reasons := array_append(reasons, 'level_below_requested');
        ELSIF cr->>'minLevel' = 'document_provided' AND public.rec_talent_level_rank(best->>'level') < 2 THEN
          reasons := array_append(reasons, 'level_below_requested');
        END IF;
        state := CASE WHEN cardinality(reasons) = 0 THEN 'evidenced' ELSE 'needs_clarification' END;
        -- Notes that do not change the state.
        IF NOT coalesce((cr->>'mustBeValid')::boolean, true) THEN
          IF best->>'validity' = 'expired' THEN reasons := array_append(reasons, 'expired');
          ELSIF best->>'validity' = 'not_yet_valid' THEN reasons := array_append(reasons, 'not_yet_valid');
          END IF;
        END IF;
        IF best->>'validity' = 'expiring_soon' THEN reasons := array_append(reasons, 'expiring_soon'); END IF;
        IF (best->>'hasScopeLimitation')::boolean THEN reasons := array_append(reasons, 'scope_limited'); END IF;
        IF best->>'level' = 'self_declared' THEN reasons := array_append(reasons, 'self_declared'); END IF;
        IF cr->>'kind' = 'mandatory' AND best->>'validity' = 'expired' THEN any_expired_mand := true; END IF;
      END IF;
    END IF;

    IF cr->>'kind' = 'mandatory' AND cr->>'requirementClass' <> 'unbound' THEN
      mand_total := mand_total + 1;
      IF state = 'evidenced' THEN
        mand_ev := mand_ev + 1;
        IF public.rec_talent_level_rank(best->>'level') >= 3 OR best->>'level' = 'confirmed' THEN mand_rev := mand_rev + 1; END IF;
      END IF;
    ELSIF cr->>'kind' = 'desirable' AND state = 'evidenced' THEN
      des_ev := des_ev + 1;
    END IF;

    results := results || jsonb_build_array(jsonb_build_object(
      'requirementId', cr->>'requirementId', 'kind', cr->>'kind', 'labelSv', cr->>'labelSv', 'labelEn', cr->>'labelEn',
      'requirementClass', cr->>'requirementClass', 'state', state, 'reasons', to_jsonb(reasons),
      'evidence', CASE WHEN best IS NULL THEN NULL ELSE best END,
      'requested', jsonb_build_object('credentials', cr->'credentialCodes', 'jurisdiction', cr->'jurisdiction',
                                      'minLevel', cr->'minLevel', 'experienceMonths', cr->'experienceMonths')));
  END LOOP;

  -- Stated job preferences against the person's own preferences.
  pref_area := CASE WHEN _job.family_id IS NULL OR jsonb_array_length(prefs->'areas') = 0 THEN 'not_stated'
                    WHEN prefs->'areas' ? _job.family_id THEN 'match' ELSE 'differs' END;
  pref_loc := CASE WHEN jsonb_array_length(prefs->'countries') = 0 AND jsonb_array_length(prefs->'cities') = 0
                        AND jsonb_array_length(prefs->'workplaceTypes') = 0 THEN 'not_stated'
                   WHEN _job.workplace_type = 'remote' AND prefs->'workplaceTypes' ? 'remote' THEN 'match'
                   WHEN _job.city IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(prefs->'cities') ci
                                                          WHERE lower(ci) = lower(_job.city)) THEN 'match'
                   WHEN _job.country IS NOT NULL AND prefs->'countries' ? upper(_job.country) THEN 'match'
                   ELSE 'differs' END;
  pref_emp := CASE WHEN _job.employment_type IS NULL OR jsonb_array_length(prefs->'employmentTypes') = 0 THEN 'not_stated'
                   WHEN prefs->'employmentTypes' ? _job.employment_type THEN 'match' ELSE 'differs' END;
  pref_met := (pref_area = 'match')::integer + (pref_loc = 'match')::integer + (pref_emp = 'match')::integer;

  RETURN jsonb_build_object(
    'relevant', any_relevant,
    'criteria', results,
    'summary', jsonb_build_object(
      'mandatoryTotal', mand_total, 'mandatoryEvidenced', mand_ev, 'mandatoryReviewed', mand_rev,
      'desirableEvidenced', des_ev, 'preferencesMet', pref_met, 'expiredMandatory', any_expired_mand,
      'toClarify', (SELECT count(*) FROM jsonb_array_elements(results) r WHERE r->>'state' <> 'evidenced')),
    'preferences', jsonb_build_object('area', pref_area, 'location', pref_loc, 'employmentType', pref_emp,
                                      'availableFrom', prefs->'availableFrom'));
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_evaluate(jsonb, jsonb, public.jobs) FROM PUBLIC, anon, authenticated;

-- Searchable holders for an employer: visible, not blocked, not the caller.
CREATE FUNCTION public.rec_talent_pool(_employer_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.holder_user_id FROM public.sp_talent_profiles p
   WHERE p.visibility IN ('open', 'active')
     AND p.holder_user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.sp_talent_blocks b
                      WHERE b.holder_user_id = p.holder_user_id AND b.employer_id = _employer_id);
$$;
REVOKE ALL ON FUNCTION public.rec_talent_pool(uuid) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.rec_talent_search_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id  uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('search', 'profile')),
  result_count integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rec_talent_search_log_actor_idx ON public.rec_talent_search_log (actor_id, created_at);
ALTER TABLE public.rec_talent_search_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_talent_search_log FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_talent_search(_job_id uuid, _filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; c public.rec_requirement_criteria_sets%ROWTYPE;
        _rows jsonb; _total integer; _f jsonb := coalesce(_filters, '{}'::jsonb);
BEGIN
  PERFORM public.sp_assert_passport_session();
  j := public.rec_talent_assert_may_search(_job_id);
  IF (SELECT count(*) FROM public.rec_talent_search_log
       WHERE actor_id = auth.uid() AND created_at > now() - interval '1 hour') >= 120 THEN
    RAISE EXCEPTION 'TALENT_RATE_LIMITED' USING ERRCODE = 'check_violation';
  END IF;
  p := public.rec_talent_latest_profile(_job_id);
  c := public.rec_talent_latest_criteria(_job_id);
  IF p.id IS NULL THEN RETURN jsonb_build_object('status', 'profile_required'); END IF;
  IF c.id IS NULL OR c.profile_id <> p.id THEN RETURN jsonb_build_object('status', 'criteria_required'); END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.criteria) x WHERE x->>'requirementClass' <> 'unbound') THEN
    RETURN jsonb_build_object('status', 'criteria_required');
  END IF;

  WITH evaluated AS (
    SELECT holder, card, public.rec_talent_evaluate(card, c.criteria, j) AS ev
      FROM (SELECT h AS holder, public.sp_talent_card(h) AS card FROM public.rec_talent_pool(j.employer_id) h) x
     WHERE card IS NOT NULL),
  kept AS (
    SELECT * FROM evaluated
     WHERE (ev->>'relevant')::boolean
       AND (NOT coalesce((_f->>'allMandatory')::boolean, false)
            OR (ev#>>'{summary,mandatoryEvidenced}')::integer = (ev#>>'{summary,mandatoryTotal}')::integer)
       AND (NOT coalesce((_f->>'reviewedOnly')::boolean, false) OR (ev#>>'{summary,mandatoryReviewed}')::integer > 0)
       AND (NOT coalesce((_f->>'validOnly')::boolean, false) OR NOT (ev#>>'{summary,expiredMandatory}')::boolean)
       AND (NOT coalesce((_f->>'activeOnly')::boolean, false) OR card->>'visibility' = 'active')
       AND (NOT coalesce((_f->>'preferencesMatch')::boolean, false) OR (ev#>>'{summary,preferencesMet}')::integer > 0)),
  ranked AS (
    SELECT *, row_number() OVER (ORDER BY
        (ev#>>'{summary,mandatoryEvidenced}')::integer DESC,
        (ev#>>'{summary,mandatoryReviewed}')::integer DESC,
        (ev#>>'{summary,desirableEvidenced}')::integer DESC,
        (ev#>>'{summary,preferencesMet}')::integer DESC,
        card->>'ref') AS pos
      FROM kept)
  SELECT (SELECT count(*) FROM kept),
         coalesce(jsonb_agg(jsonb_build_object(
           'ref', card->>'ref', 'position', pos, 'visibility', card->>'visibility',
           'merits', card->'merits', 'experience', card->'experience', 'totalSecurityMonths', card->'totalSecurityMonths',
           'preferences', card->'preferences', 'evaluation', ev,
           'contact', (SELECT jsonb_build_object('id', r.id, 'status', r.status, 'createdAt', r.created_at)
                         FROM public.rec_talent_contact_requests r
                        WHERE r.job_id = j.id AND r.holder_user_id = ranked.holder
                        ORDER BY r.created_at DESC LIMIT 1))
           ORDER BY pos) FILTER (WHERE pos <= 50), '[]'::jsonb)
    INTO _total, _rows FROM ranked;

  INSERT INTO public.rec_talent_search_log (job_id, employer_id, actor_id, kind, result_count)
  VALUES (j.id, j.employer_id, auth.uid(), 'search', _total);

  RETURN jsonb_build_object('status', 'ok', 'jobId', j.id, 'profileVersion', p.version, 'criteriaVersion', c.version,
    'total', _total, 'shown', least(_total, 50), 'results', _rows, 'searchedAt', now(),
    'ordering', jsonb_build_array('mandatoryEvidenced', 'mandatoryReviewed', 'desirableEvidenced', 'preferencesMet', 'reference'));
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_search(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_search(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Contact requests.
-- ---------------------------------------------------------------------------
CREATE TABLE public.rec_talent_contact_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id      uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  sender_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  holder_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The reference the sender used. Rotated away on pause; kept for the sender's
  -- own list so a result row can show "contacted".
  search_ref       uuid NOT NULL,
  message          text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 20 AND 2000),
  locale           text NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv', 'en')),
  idempotency_key  uuid NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  blocked_employer boolean NOT NULL DEFAULT false,
  application_id   uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  -- What the organisation saw when it sent the request. Dated; cleared on decline.
  snapshot         jsonb,
  snapshot_at      timestamptz,
  UNIQUE (employer_id, idempotency_key)
);
CREATE UNIQUE INDEX rec_talent_contact_one_open ON public.rec_talent_contact_requests (job_id, holder_user_id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX rec_talent_contact_holder_idx ON public.rec_talent_contact_requests (holder_user_id, created_at DESC);
CREATE INDEX rec_talent_contact_job_idx ON public.rec_talent_contact_requests (job_id, created_at DESC);
CREATE INDEX rec_talent_contact_sender_idx ON public.rec_talent_contact_requests (sender_user_id, created_at);
ALTER TABLE public.rec_talent_contact_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_talent_contact_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_talent_contact_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.job_id <> OLD.job_id OR NEW.employer_id <> OLD.employer_id OR NEW.holder_user_id <> OLD.holder_user_id
     OR NEW.message <> OLD.message OR NEW.created_at <> OLD.created_at OR NEW.search_ref <> OLD.search_ref
     OR NEW.idempotency_key <> OLD.idempotency_key THEN
    RAISE EXCEPTION 'TALENT_CONTACT_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'pending' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'TALENT_CONTACT_ALREADY_ANSWERED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_contact_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rec_talent_contact_guard BEFORE UPDATE ON public.rec_talent_contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.rec_talent_contact_guard();

CREATE FUNCTION public.rec_talent_profile(_job_id uuid, _ref uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; c public.rec_requirement_criteria_sets%ROWTYPE;
        _holder uuid; _card jsonb;
BEGIN
  PERFORM public.sp_assert_passport_session();
  j := public.rec_talent_assert_may_search(_job_id);
  SELECT tp.holder_user_id INTO _holder FROM public.sp_talent_profiles tp
   WHERE tp.search_ref = _ref AND tp.holder_user_id IN (SELECT public.rec_talent_pool(j.employer_id));
  -- A paused, private, blocked or unknown reference all read the same.
  IF _holder IS NULL THEN RETURN jsonb_build_object('status', 'not_available'); END IF;
  p := public.rec_talent_latest_profile(_job_id);
  c := public.rec_talent_latest_criteria(_job_id);
  _card := public.sp_talent_card(_holder);
  INSERT INTO public.rec_talent_search_log (job_id, employer_id, actor_id, kind, result_count)
  VALUES (j.id, j.employer_id, auth.uid(), 'profile', 1);
  RETURN jsonb_build_object('status', 'ok', 'readAt', now(), 'card', _card,
    'evaluation', CASE WHEN c.id IS NOT NULL AND c.profile_id = p.id THEN public.rec_talent_evaluate(_card, c.criteria, j) END,
    'contact', (SELECT jsonb_build_object('id', r.id, 'status', r.status, 'createdAt', r.created_at, 'respondedAt', r.responded_at)
                  FROM public.rec_talent_contact_requests r
                 WHERE r.job_id = j.id AND r.holder_user_id = _holder ORDER BY r.created_at DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_profile(uuid, uuid) TO authenticated;

CREATE FUNCTION public.rec_talent_send_contact(_job_id uuid, _ref uuid, _message text, _idempotency_key uuid, _locale text DEFAULT 'sv')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; c public.rec_requirement_criteria_sets%ROWTYPE;
        _holder uuid; _card jsonb; _existing public.rec_talent_contact_requests%ROWTYPE; _id uuid;
        _text text := btrim(coalesce(_message, ''));
BEGIN
  PERFORM public.sp_assert_passport_session();
  j := public.rec_talent_assert_may_search(_job_id);
  IF _idempotency_key IS NULL OR char_length(_text) NOT BETWEEN 20 AND 2000 OR coalesce(_locale, '') NOT IN ('sv', 'en') THEN
    RAISE EXCEPTION 'TALENT_CONTACT_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  -- A retry of the same send returns what the first one did.
  SELECT * INTO _existing FROM public.rec_talent_contact_requests
   WHERE employer_id = j.employer_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _existing.job_id <> j.id OR _existing.search_ref <> _ref THEN
      RAISE EXCEPTION 'TALENT_CONTACT_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('status', 'already_sent', 'id', _existing.id, 'contactStatus', _existing.status);
  END IF;

  SELECT tp.holder_user_id INTO _holder FROM public.sp_talent_profiles tp
   WHERE tp.search_ref = _ref AND tp.holder_user_id IN (SELECT public.rec_talent_pool(j.employer_id))
   FOR UPDATE OF tp;
  IF _holder IS NULL THEN RAISE EXCEPTION 'TALENT_PROFILE_NOT_AVAILABLE' USING ERRCODE = 'no_data_found'; END IF;

  SELECT * INTO _existing FROM public.rec_talent_contact_requests
   WHERE job_id = j.id AND holder_user_id = _holder ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND _existing.status IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object('status', 'already_contacted', 'id', _existing.id, 'contactStatus', _existing.status);
  END IF;
  IF FOUND AND _existing.status = 'declined' THEN
    RAISE EXCEPTION 'TALENT_CONTACT_DECLINED_BEFORE' USING ERRCODE = 'check_violation';
  END IF;

  -- Mass-contact limits.
  IF (SELECT count(*) FROM public.rec_talent_contact_requests WHERE sender_user_id = auth.uid() AND created_at > now() - interval '24 hours') >= 20
     OR (SELECT count(*) FROM public.rec_talent_contact_requests WHERE employer_id = j.employer_id AND created_at > now() - interval '24 hours') >= 60 THEN
    RAISE EXCEPTION 'TALENT_CONTACT_LIMIT_REACHED' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.rec_talent_contact_requests
       WHERE employer_id = j.employer_id AND holder_user_id = _holder AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'TALENT_CONTACT_LIMIT_REACHED' USING ERRCODE = 'check_violation';
  END IF;

  p := public.rec_talent_latest_profile(_job_id);
  c := public.rec_talent_latest_criteria(_job_id);
  _card := public.sp_talent_card(_holder);

  INSERT INTO public.rec_talent_contact_requests (job_id, employer_id, sender_user_id, holder_user_id, search_ref, message,
                                                  locale, idempotency_key, snapshot, snapshot_at)
  VALUES (j.id, j.employer_id, auth.uid(), _holder, _ref, _text, _locale, _idempotency_key,
          jsonb_build_object('merits', _card->'merits', 'experience', _card->'experience',
                             'totalSecurityMonths', _card->'totalSecurityMonths',
                             'evaluation', CASE WHEN c.id IS NOT NULL AND c.profile_id = p.id
                                                THEN public.rec_talent_evaluate(_card, c.criteria, j) END,
                             'profileVersion', p.version, 'criteriaVersion', c.version),
          now())
  RETURNING id INTO _id;

  PERFORM public.user_notices_enqueue(_holder, 'holder', 'talent_contact_received', 'contact', _id, NULL, 'contact:' || _id);
  PERFORM public.product_metric_record('talent_contact_requested');
  RETURN jsonb_build_object('status', 'sent', 'id', _id, 'contactStatus', 'pending');
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_send_contact(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_send_contact(uuid, uuid, text, uuid, text) TO authenticated;

-- The organisation's own list for a job. Readable by whoever may manage the
-- recruitment (rec_can_manage) -- not by every member. The person's name is
-- shown only after they accepted. A snapshot is labelled with its time.
CREATE FUNCTION public.rec_talent_contacts(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE;
BEGIN
  PERFORM public.sp_assert_passport_session();
  SELECT * INTO j FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN
    RAISE EXCEPTION 'TALENT_SEARCH_NOT_AVAILABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'createdAt', r.created_at, 'respondedAt', r.responded_at,
      'message', r.message, 'sentByMe', r.sender_user_id = auth.uid(),
      'name', CASE WHEN r.status = 'accepted' THEN coalesce(nullif(btrim(pr.display_name), ''), NULL) END,
      'applicationId', r.application_id,
      'currentlyDiscoverable', EXISTS (SELECT 1 FROM public.sp_talent_profiles tp
                                        WHERE tp.holder_user_id = r.holder_user_id AND tp.search_ref = r.search_ref
                                          AND tp.visibility <> 'private')
                                 AND NOT EXISTS (SELECT 1 FROM public.sp_talent_blocks b
                                                  WHERE b.holder_user_id = r.holder_user_id AND b.employer_id = r.employer_id),
      'snapshot', CASE WHEN r.snapshot IS NOT NULL THEN r.snapshot || jsonb_build_object('takenAt', r.snapshot_at) END)
      ORDER BY r.created_at DESC)
    FROM public.rec_talent_contact_requests r
    LEFT JOIN public.profiles pr ON pr.id = r.holder_user_id AND r.status = 'accepted'
   WHERE r.job_id = _job_id), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_contacts(uuid) TO authenticated;

CREATE FUNCTION public.rec_talent_withdraw_contact(_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.rec_talent_contact_requests%ROWTYPE;
BEGIN
  PERFORM public.sp_assert_passport_session();
  SELECT * INTO r FROM public.rec_talent_contact_requests WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(r.job_id) THEN
    RAISE EXCEPTION 'TALENT_SEARCH_NOT_AVAILABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('status', r.status);
  END IF;
  UPDATE public.rec_talent_contact_requests SET status = 'withdrawn', responded_at = now(), snapshot = NULL, snapshot_at = NULL
   WHERE id = r.id;
  RETURN jsonb_build_object('status', 'withdrawn');
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_withdraw_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_talent_withdraw_contact(uuid) TO authenticated;

-- The person's side.
CREATE FUNCTION public.sp_talent_my_contacts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.sp_assert_passport_session();
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'createdAt', r.created_at, 'respondedAt', r.responded_at, 'message', r.message,
      'blockedEmployer', r.blocked_employer,
      'employer', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'logoUrl', e.logo_url),
      'job', jsonb_build_object('id', j.id, 'slug', j.slug, 'titleSv', j.title_sv, 'titleEn', j.title_en,
                                'city', j.city, 'country', j.country, 'employmentType', j.employment_type,
                                'open', public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at),
                                'acceptsApplications', j.application_method = 'internal'),
      'applicationId', r.application_id)
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC)
    FROM public.rec_talent_contact_requests r
    JOIN public.employers e ON e.id = r.employer_id
    JOIN public.jobs j ON j.id = r.job_id
   WHERE r.holder_user_id = auth.uid()), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_my_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_my_contacts() TO authenticated;

-- Blocking an organisation is one act wherever it is chosen: the block, every
-- open request from that organisation declined with its snapshot cleared, and
-- the answered request marked (review 2026-10-15, RF5).
CREATE FUNCTION public.sp_talent_block_employer(_holder uuid, _employer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.sp_talent_blocks (holder_user_id, employer_id) VALUES (_holder, _employer_id) ON CONFLICT DO NOTHING;
  UPDATE public.rec_talent_contact_requests
     SET status = 'declined', responded_at = now(), blocked_employer = true, snapshot = NULL, snapshot_at = NULL
   WHERE holder_user_id = _holder AND employer_id = _employer_id AND status = 'pending';
  UPDATE public.rec_talent_contact_requests
     SET blocked_employer = true, snapshot = NULL, snapshot_at = NULL
   WHERE holder_user_id = _holder AND employer_id = _employer_id AND status = 'declined' AND NOT blocked_employer;
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_block_employer(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sp_talent_respond_contact(_contact_id uuid, _accept boolean, _block_employer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.rec_talent_contact_requests%ROWTYPE; j public.jobs%ROWTYPE; _kind text; _recipient uuid;
BEGIN
  PERFORM public.sp_assert_passport_session();
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.rec_talent_contact_requests WHERE id = _contact_id FOR UPDATE;
  IF NOT FOUND OR r.holder_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'TALENT_CONTACT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF _accept AND coalesce(_block_employer, false) THEN
    RAISE EXCEPTION 'TALENT_CONTACT_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  -- Answering twice the same way is a repeat, not an error (double click).
  IF r.status <> 'pending' THEN
    IF (r.status = 'accepted' AND _accept) OR (r.status = 'declined' AND NOT _accept) THEN
      IF coalesce(_block_employer, false) AND r.status = 'declined' THEN
        PERFORM public.sp_talent_block_employer(auth.uid(), r.employer_id);
      END IF;
      RETURN jsonb_build_object('status', r.status, 'repeat', true);
    END IF;
    RAISE EXCEPTION 'TALENT_CONTACT_ALREADY_ANSWERED' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO j FROM public.jobs WHERE id = r.job_id;
  IF _accept AND NOT public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at) THEN
    RAISE EXCEPTION 'TALENT_JOB_CLOSED' USING ERRCODE = 'check_violation';
  END IF;

  IF _accept THEN
    UPDATE public.rec_talent_contact_requests SET status = 'accepted', responded_at = now() WHERE id = r.id;
    _kind := 'talent_contact_accepted';
    PERFORM public.product_metric_record('talent_contact_accepted');
    -- Already applied to this job? Link it.
    UPDATE public.rec_talent_contact_requests SET application_id = (
      SELECT a.id FROM public.job_applications a WHERE a.job_id = r.job_id AND a.applicant_user_id = r.holder_user_id
         AND a.withdrawn_at IS NULL ORDER BY a.created_at DESC LIMIT 1)
     WHERE id = r.id;
  ELSE
    UPDATE public.rec_talent_contact_requests
       SET status = 'declined', responded_at = now(), blocked_employer = coalesce(_block_employer, false),
           snapshot = NULL, snapshot_at = NULL
     WHERE id = r.id;
    _kind := 'talent_contact_declined';
    IF coalesce(_block_employer, false) THEN
      PERFORM public.sp_talent_block_employer(auth.uid(), r.employer_id);
    END IF;
  END IF;

  _recipient := r.sender_user_id;
  IF _recipient IS NOT NULL AND public.rec_talent_user_may_search(_recipient, r.job_id) THEN
    PERFORM public.user_notices_enqueue(_recipient, 'recruiter', _kind, 'contact', r.id, NULL, 'contact-answer:' || r.id);
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN _accept THEN 'accepted' ELSE 'declined' END, 'repeat', false);
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_respond_contact(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_respond_contact(uuid, boolean, boolean) TO authenticated;

-- An application by a person who accepted a contact for the same job is linked
-- to it, so the recruiter can continue in the existing application workflow.
-- Nothing else happens: no data is shared by this link.
CREATE FUNCTION public.rec_talent_link_application() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.rec_talent_contact_requests SET application_id = NEW.id
   WHERE job_id = NEW.job_id AND holder_user_id = NEW.applicant_user_id AND status = 'accepted' AND application_id IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rec_talent_link_application() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rec_talent_link_application AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.rec_talent_link_application();

-- ---------------------------------------------------------------------------
-- Notices: inbox facts and claim-time rules for the contact kinds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_notices_still_allowed(_n public.user_notices)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _n.audience = 'reviewer' THEN EXISTS (SELECT 1 FROM public.user_roles ur
                                  WHERE ur.user_id = _n.recipient_user_id AND ur.role = 'passport_verifier'::public.app_role)
    WHEN _n.kind = 'talent_contact_received' THEN EXISTS (
      SELECT 1 FROM public.rec_talent_contact_requests r
       WHERE r.id = _n.subject_id AND r.holder_user_id = _n.recipient_user_id AND r.status = 'pending')
    WHEN _n.audience = 'recruiter' THEN EXISTS (
      SELECT 1 FROM public.rec_talent_contact_requests r
       WHERE r.id = _n.subject_id AND public.rec_talent_user_may_search(_n.recipient_user_id, r.job_id))
    WHEN _n.audience = 'holder' THEN true
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.user_notices_still_allowed(public.user_notices) FROM PUBLIC, anon, authenticated;

-- Read-time access: a recruiter notice needs the right to that job's search now.
CREATE OR REPLACE FUNCTION public.user_notices_visible(_n public.user_notices)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _n.audience = 'holder' THEN true
    WHEN _n.audience = 'reviewer' THEN EXISTS (SELECT 1 FROM public.user_roles ur
                                  WHERE ur.user_id = _n.recipient_user_id AND ur.role = 'passport_verifier'::public.app_role)
    WHEN _n.audience = 'recruiter' THEN EXISTS (
      SELECT 1 FROM public.rec_talent_contact_requests r
       WHERE r.id = _n.subject_id AND public.rec_talent_user_may_search(_n.recipient_user_id, r.job_id))
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.user_notices_visible(public.user_notices) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_notices_inbox(_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.sp_assert_passport_session();
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'unread', (SELECT count(*) FROM public.user_notices un
                WHERE un.recipient_user_id = auth.uid() AND un.read_at IS NULL AND public.user_notices_visible(un)),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'audience', n.audience, 'kind', n.kind, 'subjectType', n.subject_type,
               'subjectId', n.subject_id, 'requestId', n.request_id, 'createdAt', n.created_at, 'readAt', n.read_at,
               'verificationMethod', n.verification_method,
               'credentialCode', c.credential_code,
               'title', CASE WHEN n.audience = 'holder' THEN coalesce(c.title, p.role_title) END,
               'employerName', e.name, 'employerSlug', e.slug,
               'jobTitleSv', j.title_sv, 'jobTitleEn', j.title_en, 'jobId', j.id)
             ORDER BY n.created_at DESC)
        FROM (SELECT * FROM public.user_notices un WHERE un.recipient_user_id = auth.uid() AND public.user_notices_visible(un)
               ORDER BY created_at DESC LIMIT greatest(1, least(coalesce(_limit, 30), 100))) n
        LEFT JOIN public.sp_claims c ON n.subject_type = 'claim' AND c.id = n.subject_id
        LEFT JOIN public.sp_experience_periods p ON n.subject_type = 'experience' AND p.id = n.subject_id
        LEFT JOIN public.rec_talent_contact_requests r ON n.subject_type = 'contact' AND r.id = n.subject_id
        LEFT JOIN public.employers e ON e.id = r.employer_id
        LEFT JOIN public.jobs j ON j.id = r.job_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.user_notices_inbox(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_notices_inbox(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_notices_claim_emails(_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _token uuid := gen_random_uuid(); _out jsonb;
BEGIN
  -- Re-check everything that could be handed out, an expired claim included
  -- (review 2026-10-15, RF3); the due set repeats the check.
  UPDATE public.user_notices n SET email_status = 'skipped', email_error_code = 'recipient_not_allowed'
   WHERE (n.email_status IN ('pending', 'failed')
          OR (n.email_status = 'claimed' AND n.email_claimed_at < now() - interval '3 minutes'))
     AND NOT public.user_notices_still_allowed(n);

  WITH due AS (
    SELECT n.id FROM public.user_notices n
     WHERE (n.email_status = 'pending'
         OR (n.email_status = 'failed' AND n.email_attempts < 5
             AND n.email_claimed_at < now() - make_interval(mins => 5 * n.email_attempts))
         OR (n.email_status = 'claimed' AND n.email_claimed_at < now() - interval '3 minutes'))
       AND n.created_at > now() - interval '7 days'
       AND public.user_notices_still_allowed(n)
     ORDER BY n.created_at
     LIMIT greatest(1, least(coalesce(_limit, 20), 50))
     FOR UPDATE SKIP LOCKED),
  claimed AS (
    UPDATE public.user_notices n
       SET email_status = 'claimed', email_claimed_at = now(), email_claim_token = _token,
           email_attempts = n.email_attempts + 1
      FROM due WHERE n.id = due.id
    RETURNING n.*)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'claimToken', c.email_claim_token, 'kind', c.kind, 'audience', c.audience,
           'subjectType', c.subject_type, 'subjectId', c.subject_id, 'requestId', c.request_id,
           'email', u.email, 'locale', coalesce(pr.locale, 'sv'),
           'verificationMethod', c.verification_method,
           'credentialCode', cl.credential_code,
           'employerName', e.name, 'jobTitleSv', j.title_sv, 'jobTitleEn', j.title_en, 'jobId', j.id,
           'employerSlug', e.slug)), '[]'::jsonb)
    INTO _out
    FROM claimed c
    JOIN auth.users u ON u.id = c.recipient_user_id
    LEFT JOIN public.profiles pr ON pr.id = c.recipient_user_id
    LEFT JOIN public.sp_claims cl ON c.subject_type = 'claim' AND cl.id = c.subject_id
    LEFT JOIN public.rec_talent_contact_requests r ON c.subject_type = 'contact' AND r.id = c.subject_id
    LEFT JOIN public.employers e ON e.id = r.employer_id
    LEFT JOIN public.jobs j ON j.id = r.job_id;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.user_notices_claim_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_notices_claim_emails(integer) TO service_role;

-- Postflight.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.rec_talent_search(uuid,jsonb)', 'public.rec_talent_profile(uuid,uuid)',
    'public.rec_talent_send_contact(uuid,uuid,text,uuid,text)', 'public.rec_talent_contacts(uuid)',
    'public.rec_talent_withdraw_contact(uuid)', 'public.rec_talent_get_criteria(uuid)',
    'public.rec_talent_confirm_criteria(uuid,integer,uuid,jsonb)', 'public.rec_talent_catalogue_options()',
    'public.rec_talent_access(uuid)', 'public.sp_talent_my_contacts()',
    'public.sp_talent_respond_contact(uuid,boolean,boolean)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'TALENT_SEARCH_PROOF: anon may execute %', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.rec_talent_evaluate(jsonb,jsonb,public.jobs)', 'public.rec_talent_pool(uuid)',
    'public.rec_talent_user_may_search(uuid,uuid)', 'public.rec_talent_assert_may_search(uuid)'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'TALENT_SEARCH_PROOF: authenticated may execute %', f; END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.rec_talent_contact_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.rec_requirement_criteria_sets', 'SELECT') THEN
    RAISE EXCEPTION 'TALENT_SEARCH_PROOF: a talent table is directly readable';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.rec_talent_search(uuid,jsonb)', 'public.rec_talent_profile(uuid,uuid)',
    'public.rec_talent_send_contact(uuid,uuid,text,uuid,text)', 'public.rec_talent_contacts(uuid)',
    'public.rec_talent_withdraw_contact(uuid)', 'public.rec_talent_get_criteria(uuid)',
    'public.rec_talent_confirm_criteria(uuid,integer,uuid,jsonb)', 'public.rec_talent_access(uuid)',
    'public.sp_talent_my_contacts()', 'public.sp_talent_respond_contact(uuid,boolean,boolean)',
    'public.user_notices_inbox(integer)'] LOOP
    IF position('sp_assert_passport_session()' IN (SELECT prosrc FROM pg_proc WHERE oid = f::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'TALENT_SEARCH_PROOF: % does not assert the Passport session', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'TALENT_SEARCH_PROOF ok';
END $$;

COMMIT;
