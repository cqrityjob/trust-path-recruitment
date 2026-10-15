-- =============================================================================
-- 20270317090000 -- Security Passport: voluntary discoverability for employers.
--
-- Canonical forward slot. Schema-first: no application code in the same PR.
--
-- A person can use the Passport privately and SEPARATELY choose to be found
-- for job opportunities. This slot is the holder's half:
--
--   sp_talent_profiles   one row per holder who has ever opened the setting.
--                        visibility: private | open | active. NO row = private.
--                        Off by default; no existing account is enabled by
--                        this migration (it inserts no rows).
--   sp_talent_items      exactly which merits / experience periods are
--                        searchable. Nothing else of the Passport is.
--   sp_talent_blocks     "stop contact from this company".
--   sp_talent_consent_events  append-only record of every visibility change.
--
-- Consent is its own act. Sharing a Passport with an application
-- (sp_disclosures.application_id, application-disclosure-contract.md) is NOT
-- read here and cannot enable discoverability; enabling requires an explicit
-- consent version on sp_talent_save_settings.
--
-- search_ref is the only identifier an employer ever sees. It is rotated every
-- time the holder leaves discoverability (pause / private), so a profile in an
-- old result list stops resolving at once.
--
-- sp_talent_card(holder) is the ONE builder of what an employer can see. The
-- holder's preview (sp_talent_preview) and the employer reads in 20270318090000
-- both call it, so the preview cannot differ from what is shown. It never
-- returns: documents, credential/licence numbers, holder notes, the free-text
-- authorisation scope (only that a limitation exists), review notes, the
-- employer names of experience periods, the person's name or contact details.
-- An administrator's approval is labelled document_reviewed -- never as a
-- confirmation by the issuer.
--
-- Rollback: supabase/rollback/20270317090000_sp_talent_discovery_rollback.sql
-- Suite:    supabase/tests/sp_talent_discovery_test.sql
-- =============================================================================
BEGIN;

CREATE TABLE public.sp_talent_profiles (
  holder_user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility            text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'open', 'active')),
  search_ref            uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  consent_text_version  text CHECK (consent_text_version IS NULL OR consent_text_version ~ '^[a-z0-9._-]{1,40}$'),
  consented_at          timestamptz,
  visibility_changed_at timestamptz NOT NULL DEFAULT now(),
  areas                 text[] NOT NULL DEFAULT '{}' CHECK (cardinality(areas) <= 14),
  countries             text[] NOT NULL DEFAULT '{}' CHECK (cardinality(countries) <= 10),
  cities                text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cities) <= 5),
  employment_types      text[] NOT NULL DEFAULT '{}' CHECK (employment_types <@ ARRAY['full_time','part_time','contract','temporary','internship']::text[]),
  workplace_types       text[] NOT NULL DEFAULT '{}' CHECK (workplace_types <@ ARRAY['onsite','hybrid','remote']::text[]),
  available_from        date,
  version               integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sp_talent_visible_has_consent CHECK (
    visibility = 'private' OR (consent_text_version IS NOT NULL AND consented_at IS NOT NULL))
);
CREATE INDEX sp_talent_profiles_visible_idx ON public.sp_talent_profiles (visibility) WHERE visibility <> 'private';

CREATE TABLE public.sp_talent_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id       uuid,
  experience_id  uuid,
  added_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sp_talent_items_one_target CHECK (num_nonnulls(claim_id, experience_id) = 1),
  CONSTRAINT sp_talent_items_claim_same_holder FOREIGN KEY (claim_id, holder_user_id)
    REFERENCES public.sp_claims (id, holder_user_id) ON DELETE CASCADE,
  CONSTRAINT sp_talent_items_period_same_holder FOREIGN KEY (experience_id, holder_user_id)
    REFERENCES public.sp_experience_periods (id, holder_user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX sp_talent_items_claim_uq ON public.sp_talent_items (claim_id) WHERE claim_id IS NOT NULL;
CREATE UNIQUE INDEX sp_talent_items_period_uq ON public.sp_talent_items (experience_id) WHERE experience_id IS NOT NULL;
CREATE INDEX sp_talent_items_holder_idx ON public.sp_talent_items (holder_user_id);

CREATE TABLE public.sp_talent_blocks (
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id    uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (holder_user_id, employer_id)
);

CREATE TABLE public.sp_talent_consent_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_visibility      text NOT NULL,
  to_visibility        text NOT NULL,
  consent_text_version text,
  item_count           integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sp_talent_consent_events_holder_idx ON public.sp_talent_consent_events (holder_user_id, created_at);

-- No client DML on any of the four. The holder reads own rows; every write is an RPC.
ALTER TABLE public.sp_talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_talent_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_talent_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_talent_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_talent_profiles, public.sp_talent_items, public.sp_talent_blocks,
              public.sp_talent_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sp_talent_items, public.sp_talent_blocks, public.sp_talent_consent_events TO authenticated;
-- search_ref is not readable by the holder either: nothing needs it client-side.
GRANT SELECT (holder_user_id, visibility, consent_text_version, consented_at, visibility_changed_at, areas, countries,
              cities, employment_types, workplace_types, available_from, version, created_at, updated_at)
  ON public.sp_talent_profiles TO authenticated;
CREATE POLICY sp_talent_profiles_own ON public.sp_talent_profiles FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
CREATE POLICY sp_talent_items_own ON public.sp_talent_items FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
CREATE POLICY sp_talent_blocks_own ON public.sp_talent_blocks FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
CREATE POLICY sp_talent_consent_events_own ON public.sp_talent_consent_events FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
-- The same session rule as every private Passport table (RF1).
CREATE POLICY sp_private_session_read ON public.sp_talent_profiles AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active());
CREATE POLICY sp_private_session_read ON public.sp_talent_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active());
CREATE POLICY sp_private_session_read ON public.sp_talent_blocks AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active());
CREATE POLICY sp_private_session_read ON public.sp_talent_consent_events AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active());

CREATE TRIGGER sp_private_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.sp_talent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard();
CREATE TRIGGER sp_private_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.sp_talent_items
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard();
CREATE TRIGGER sp_private_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.sp_talent_blocks
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard();

CREATE FUNCTION public.sp_talent_consent_events_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR (EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id)
                          AND NOT public.account_deletion_releases(OLD.holder_user_id)) THEN
    RAISE EXCEPTION 'SP_TALENT_CONSENT_HISTORY_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_consent_events_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_talent_consent_events_immutable BEFORE UPDATE OR DELETE ON public.sp_talent_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.sp_talent_consent_events_guard();

-- ---------------------------------------------------------------------------
-- Catalogue classes for matching: education | certification |
-- regulated_authorisation. (Experience is the fourth, from periods.)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sp_catalogue_requirement_class(_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN t.code IS NULL THEN NULL
    WHEN t.claim_type = 'licence' THEN 'regulated_authorisation'
    WHEN t.claim_type = 'training' OR t.scope_code = 'national_qualification' THEN 'education'
    ELSE 'certification' END
  FROM (SELECT 1) one LEFT JOIN public.sp_credential_types t ON t.code = _code;
$$;
REVOKE ALL ON FUNCTION public.sp_catalogue_requirement_class(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalogue_requirement_class(text) TO authenticated;

-- How an entry is backed, in words the employer view may use. An approval by
-- CQrityjob is a document review, not a confirmation from the issuer.
CREATE FUNCTION public.sp_talent_entry_level(_assertion text, _claim_id uuid, _period_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE _assertion
    WHEN 'verified' THEN coalesce((
      SELECT CASE d.verification_method
               WHEN 'employer_confirmation' THEN 'employer_confirmed'
               WHEN 'issuer_confirmation' THEN 'source_confirmed'
               ELSE 'document_reviewed' END
        FROM public.sp_verification_decisions d
        JOIN public.sp_verification_requests r ON r.id = d.request_id
       WHERE d.decision = 'approved'
         AND ((_claim_id IS NOT NULL AND r.claim_id = _claim_id) OR (_period_id IS NOT NULL AND r.period_id = _period_id))
       ORDER BY d.recorded_at DESC LIMIT 1), 'document_reviewed')
    WHEN 'document_provided' THEN 'document_provided'
    ELSE 'self_declared' END;
$$;
REVOKE ALL ON FUNCTION public.sp_talent_entry_level(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- A merit that has not started yet is not valid yet, whatever its end date
-- says (review 2026-10-15, RF6).
CREATE FUNCTION public.sp_talent_validity(_valid_from date, _valid_until date, _no_expiry boolean)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _valid_from IS NOT NULL AND _valid_from > current_date THEN 'not_yet_valid'
    WHEN coalesce(_no_expiry, false) AND _valid_until IS NULL THEN 'no_expiry'
    WHEN _valid_until IS NULL THEN 'not_stated'
    WHEN _valid_until < current_date THEN 'expired'
    WHEN _valid_until <= current_date + 60 THEN 'expiring_soon'
    ELSE 'valid' END;
$$;
REVOKE ALL ON FUNCTION public.sp_talent_validity(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_validity(date, date, boolean) TO authenticated;

-- The searchable merits, read live. Revoked, withdrawn, superseded and draft
-- entries never appear; an expired one appears as expired.
CREATE FUNCTION public.sp_talent_merits(_holder uuid)
RETURNS TABLE (claim_id uuid, code text, name_sv text, name_en text, abbreviation text, requirement_class text,
               jurisdiction_code text, sub_jurisdiction_code text, validity_jurisdiction_code text,
               issued_year integer, valid_until date, validity text, validity_required boolean, level text,
               has_scope_limitation boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.credential_code, t.name_sv, t.name_en, t.symbol_label,
         public.sp_catalogue_requirement_class(c.credential_code),
         c.jurisdiction_code, c.sub_jurisdiction_code, d.validity_jurisdiction_code,
         extract(year FROM c.issued_on)::integer, c.valid_until,
         public.sp_talent_validity(c.valid_from, c.valid_until, d.no_expiry), t.requires_valid_until,
         public.sp_talent_entry_level(c.assertion_level, c.id, NULL),
         c.authorisation_scope IS NOT NULL
    FROM public.sp_talent_items i
    JOIN public.sp_claims c ON c.id = i.claim_id
    JOIN public.sp_credential_types t ON t.code = c.credential_code
    LEFT JOIN public.sp_credential_details d ON d.claim_id = c.id
   WHERE i.holder_user_id = _holder
     AND c.lifecycle_state IN ('active', 'expired')
     AND public.sp_is_passport_credential(c.claim_type, c.credential_code);
$$;
REVOKE ALL ON FUNCTION public.sp_talent_merits(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sp_talent_experience(_holder uuid)
RETURNS TABLE (experience_id uuid, role_title text, security_relevance text, started_on date, ended_on date,
               months integer, level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.role_title, p.security_relevance,
         date_trunc('month', p.started_on)::date, date_trunc('month', p.ended_on)::date,
         ((coalesce(p.ended_on, current_date) - p.started_on) / 30.44)::integer,
         CASE public.sp_talent_entry_level(p.assertion_level, NULL, p.id)
           WHEN 'employer_confirmed' THEN 'employer_confirmed'
           WHEN 'document_reviewed' THEN 'document_reviewed'
           WHEN 'document_provided' THEN 'document_provided'
           ELSE 'self_declared' END
    FROM public.sp_talent_items i
    JOIN public.sp_experience_periods p ON p.id = i.experience_id
   WHERE i.holder_user_id = _holder AND p.lifecycle_state = 'active';
$$;
REVOKE ALL ON FUNCTION public.sp_talent_experience(uuid) FROM PUBLIC, anon, authenticated;

-- The ONE employer-visible card. Called by the holder preview and by the
-- employer reads; never directly by a client.
CREATE FUNCTION public.sp_talent_card(_holder uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'ref', p.search_ref,
    'visibility', p.visibility,
    'preferences', jsonb_build_object(
      'areas', to_jsonb(p.areas), 'countries', to_jsonb(p.countries), 'cities', to_jsonb(p.cities),
      'employmentTypes', to_jsonb(p.employment_types), 'workplaceTypes', to_jsonb(p.workplace_types),
      'availableFrom', p.available_from),
    'merits', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'code', m.code, 'nameSv', m.name_sv, 'nameEn', m.name_en, 'abbreviation', m.abbreviation,
        'requirementClass', m.requirement_class, 'jurisdiction', m.jurisdiction_code,
        'subJurisdiction', m.sub_jurisdiction_code, 'validityJurisdiction', m.validity_jurisdiction_code,
        'issuedYear', m.issued_year, 'validUntil', m.valid_until, 'validity', m.validity,
        'validityRequired', m.validity_required, 'level', m.level,
        'hasScopeLimitation', m.has_scope_limitation)
        ORDER BY m.requirement_class, m.name_en) FROM public.sp_talent_merits(p.holder_user_id) m), '[]'::jsonb),
    'experience', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'roleTitle', e.role_title, 'securityRelevance', e.security_relevance, 'startedOn', e.started_on,
        'endedOn', e.ended_on, 'months', e.months, 'level', e.level)
        ORDER BY e.started_on DESC) FROM public.sp_talent_experience(p.holder_user_id) e), '[]'::jsonb),
    'totalSecurityMonths', (
      SELECT coalesce(sum(upper(r) - lower(r)), 0) / 30.44
        FROM unnest((SELECT range_agg(daterange(ep.started_on, coalesce(ep.ended_on, current_date)))
                       FROM public.sp_talent_items i JOIN public.sp_experience_periods ep ON ep.id = i.experience_id
                      WHERE i.holder_user_id = p.holder_user_id AND ep.lifecycle_state = 'active'
                        AND ep.security_relevance IN ('primary', 'partial'))) r)::integer)
  FROM public.sp_talent_profiles p WHERE p.holder_user_id = _holder;
$$;
REVOKE ALL ON FUNCTION public.sp_talent_card(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Holder RPCs.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sp_talent_get_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.sp_talent_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM public.sp_assert_passport_session();
  SELECT * INTO p FROM public.sp_talent_profiles WHERE holder_user_id = auth.uid();
  RETURN jsonb_build_object(
    'visibility', coalesce(p.visibility, 'private'),
    'version', coalesce(p.version, 0),
    'consentTextVersion', p.consent_text_version, 'consentedAt', p.consented_at,
    'visibilityChangedAt', p.visibility_changed_at,
    'preferences', jsonb_build_object(
      'areas', to_jsonb(coalesce(p.areas, '{}')), 'countries', to_jsonb(coalesce(p.countries, '{}')),
      'cities', to_jsonb(coalesce(p.cities, '{}')), 'employmentTypes', to_jsonb(coalesce(p.employment_types, '{}')),
      'workplaceTypes', to_jsonb(coalesce(p.workplace_types, '{}')), 'availableFrom', p.available_from),
    'items', jsonb_build_object(
      'claims', coalesce((SELECT jsonb_agg(i.claim_id) FROM public.sp_talent_items i JOIN public.sp_claims c ON c.id = i.claim_id
                          WHERE i.holder_user_id = auth.uid() AND c.lifecycle_state IN ('active', 'expired')), '[]'::jsonb),
      'experiences', coalesce((SELECT jsonb_agg(i.experience_id) FROM public.sp_talent_items i JOIN public.sp_experience_periods ep ON ep.id = i.experience_id
                          WHERE i.holder_user_id = auth.uid() AND ep.lifecycle_state = 'active'), '[]'::jsonb)),
    'blockedEmployers', coalesce((SELECT jsonb_agg(jsonb_build_object('employerId', b.employer_id, 'name', e.name, 'since', b.created_at) ORDER BY b.created_at DESC)
                                    FROM public.sp_talent_blocks b JOIN public.employers e ON e.id = b.employer_id
                                   WHERE b.holder_user_id = auth.uid()), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_get_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_get_settings() TO authenticated;

-- Exactly what an employer would see now, plus whether it is currently shown.
CREATE FUNCTION public.sp_talent_preview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _card jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM public.sp_assert_passport_session();
  _card := public.sp_talent_card(auth.uid());
  IF _card IS NULL THEN
    -- Never opened: the empty card that private would show (nothing).
    RETURN jsonb_build_object('searchable', false, 'card', NULL);
  END IF;
  RETURN jsonb_build_object('searchable', _card->>'visibility' <> 'private', 'card', _card - 'ref');
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_preview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_preview() TO authenticated;

-- One atomic save: visibility, items and preferences together, guarded by the
-- version the holder's page was loaded with.
CREATE FUNCTION public.sp_talent_save_settings(
  _expected_version integer, _visibility text, _consent_text_version text,
  _claim_ids uuid[], _experience_ids uuid[], _preferences jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.sp_talent_profiles%ROWTYPE; _holder uuid := auth.uid(); _from text; _count integer; _consent_changed boolean; _exists boolean;
        _areas text[]; _countries text[]; _cities text[]; _emp text[]; _work text[]; _avail date; _x text;
BEGIN
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM public.sp_assert_passport_session();
  IF _visibility NOT IN ('private', 'open', 'active') THEN
    RAISE EXCEPTION 'SP_TALENT_INVALID: visibility' USING ERRCODE = 'check_violation';
  END IF;
  _claim_ids := coalesce(_claim_ids, '{}'); _experience_ids := coalesce(_experience_ids, '{}');
  IF cardinality(_claim_ids) > 40 OR cardinality(_experience_ids) > 20 THEN
    RAISE EXCEPTION 'SP_TALENT_INVALID: too many items' USING ERRCODE = 'check_violation';
  END IF;

  -- Preferences, validated against the platform's own vocabularies.
  _preferences := coalesce(_preferences, '{}'::jsonb);
  SELECT coalesce(array_agg(DISTINCT v), '{}') INTO _areas FROM jsonb_array_elements_text(coalesce(_preferences->'areas', '[]')) v;
  SELECT coalesce(array_agg(DISTINCT upper(v)), '{}') INTO _countries FROM jsonb_array_elements_text(coalesce(_preferences->'countries', '[]')) v;
  SELECT coalesce(array_agg(DISTINCT btrim(v)), '{}') INTO _cities FROM jsonb_array_elements_text(coalesce(_preferences->'cities', '[]')) v WHERE btrim(v) <> '';
  SELECT coalesce(array_agg(DISTINCT v), '{}') INTO _emp FROM jsonb_array_elements_text(coalesce(_preferences->'employmentTypes', '[]')) v;
  SELECT coalesce(array_agg(DISTINCT v), '{}') INTO _work FROM jsonb_array_elements_text(coalesce(_preferences->'workplaceTypes', '[]')) v;
  _avail := nullif(_preferences->>'availableFrom', '')::date;
  FOREACH _x IN ARRAY _areas LOOP
    IF NOT public.assert_cig_family_id(_x) THEN RAISE EXCEPTION 'SP_TALENT_INVALID: area' USING ERRCODE = 'check_violation'; END IF;
  END LOOP;
  FOREACH _x IN ARRAY _countries LOOP
    IF _x !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'SP_TALENT_INVALID: country' USING ERRCODE = 'check_violation'; END IF;
  END LOOP;
  FOREACH _x IN ARRAY _cities LOOP
    IF char_length(_x) > 80 THEN RAISE EXCEPTION 'SP_TALENT_INVALID: city' USING ERRCODE = 'check_violation'; END IF;
  END LOOP;
  IF NOT (_emp <@ ARRAY['full_time','part_time','contract','temporary','internship']::text[])
     OR NOT (_work <@ ARRAY['onsite','hybrid','remote']::text[]) THEN
    RAISE EXCEPTION 'SP_TALENT_INVALID: preference' USING ERRCODE = 'check_violation';
  END IF;

  -- Items must be the holder's own searchable entries.
  IF EXISTS (SELECT 1 FROM unnest(_claim_ids) x(id)
              WHERE NOT EXISTS (SELECT 1 FROM public.sp_claims c
                                 WHERE c.id = x.id AND c.holder_user_id = _holder
                                   AND c.lifecycle_state IN ('active', 'expired')
                                   AND c.credential_code IS NOT NULL
                                   AND public.sp_is_passport_credential(c.claim_type, c.credential_code)))
     OR EXISTS (SELECT 1 FROM unnest(_experience_ids) x(id)
              WHERE NOT EXISTS (SELECT 1 FROM public.sp_experience_periods p2
                                 WHERE p2.id = x.id AND p2.holder_user_id = _holder AND p2.lifecycle_state = 'active')) THEN
    RAISE EXCEPTION 'SP_TALENT_ITEM_NOT_AVAILABLE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO p FROM public.sp_talent_profiles WHERE holder_user_id = _holder FOR UPDATE;
  _exists := FOUND;
  IF coalesce(p.version, 0) <> coalesce(_expected_version, -1) THEN
    RAISE EXCEPTION 'SP_TALENT_STALE: the settings changed in another window; reload them' USING ERRCODE = 'check_violation';
  END IF;
  _from := coalesce(p.visibility, 'private');
  _consent_changed := _visibility <> 'private' AND p.consent_text_version IS DISTINCT FROM _consent_text_version;

  IF _visibility <> 'private' THEN
    IF _consent_text_version IS NULL OR _consent_text_version !~ '^[a-z0-9._-]{1,40}$' THEN
      RAISE EXCEPTION 'SP_TALENT_CONSENT_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
    IF cardinality(_claim_ids) + cardinality(_experience_ids) = 0 THEN
      RAISE EXCEPTION 'SP_TALENT_NOTHING_SELECTED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT _exists THEN
    INSERT INTO public.sp_talent_profiles (holder_user_id) VALUES (_holder) RETURNING * INTO p;
  END IF;

  UPDATE public.sp_talent_profiles SET
    visibility = _visibility,
    consent_text_version = CASE WHEN _visibility <> 'private' THEN _consent_text_version ELSE consent_text_version END,
    consented_at = CASE WHEN _visibility <> 'private' AND (_from = 'private' OR consent_text_version IS DISTINCT FROM _consent_text_version)
                        THEN clock_timestamp() ELSE consented_at END,
    -- Leaving discoverability makes every reference an employer holds dead.
    search_ref = CASE WHEN _visibility = 'private' AND _from <> 'private' THEN gen_random_uuid() ELSE search_ref END,
    visibility_changed_at = CASE WHEN _visibility <> _from THEN clock_timestamp() ELSE visibility_changed_at END,
    areas = _areas, countries = _countries, cities = _cities, employment_types = _emp, workplace_types = _work,
    available_from = _avail, version = version + 1, updated_at = clock_timestamp()
  WHERE holder_user_id = _holder RETURNING * INTO p;

  DELETE FROM public.sp_talent_items i WHERE i.holder_user_id = _holder
     AND NOT (coalesce(i.claim_id = ANY (_claim_ids), false) OR coalesce(i.experience_id = ANY (_experience_ids), false));
  INSERT INTO public.sp_talent_items (holder_user_id, claim_id)
    SELECT _holder, x FROM unnest(_claim_ids) x ON CONFLICT DO NOTHING;
  INSERT INTO public.sp_talent_items (holder_user_id, experience_id)
    SELECT _holder, x FROM unnest(_experience_ids) x ON CONFLICT DO NOTHING;
  SELECT count(*) INTO _count FROM public.sp_talent_items WHERE holder_user_id = _holder;

  IF _visibility <> _from OR _consent_changed THEN
    INSERT INTO public.sp_talent_consent_events (holder_user_id, from_visibility, to_visibility, consent_text_version, item_count)
    VALUES (_holder, _from, _visibility, CASE WHEN _visibility <> 'private' THEN _consent_text_version END, _count);
  END IF;
  IF _from = 'private' AND _visibility <> 'private' THEN
    PERFORM public.product_metric_record('talent_visibility_enabled');
  END IF;

  RETURN public.sp_talent_get_settings();
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_save_settings(integer, text, text, uuid[], uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_save_settings(integer, text, text, uuid[], uuid[], jsonb) TO authenticated;

-- Pause in one act, from any page: private, references rotated, selections kept.
CREATE FUNCTION public.sp_talent_pause()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _from text; _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM public.sp_assert_passport_session();
  SELECT visibility INTO _from FROM public.sp_talent_profiles WHERE holder_user_id = auth.uid() FOR UPDATE;
  IF _from IS NOT NULL AND _from <> 'private' THEN
    UPDATE public.sp_talent_profiles
       SET visibility = 'private', search_ref = gen_random_uuid(), visibility_changed_at = clock_timestamp(),
           version = version + 1, updated_at = clock_timestamp()
     WHERE holder_user_id = auth.uid();
    SELECT count(*) INTO _count FROM public.sp_talent_items WHERE holder_user_id = auth.uid();
    INSERT INTO public.sp_talent_consent_events (holder_user_id, from_visibility, to_visibility, item_count)
    VALUES (auth.uid(), _from, 'private', _count);
  END IF;
  RETURN public.sp_talent_get_settings();
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_pause() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_pause() TO authenticated;

CREATE FUNCTION public.sp_talent_unblock_employer(_employer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM public.sp_assert_passport_session();
  DELETE FROM public.sp_talent_blocks WHERE holder_user_id = auth.uid() AND employer_id = _employer_id;
  RETURN public.sp_talent_get_settings();
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_unblock_employer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_talent_unblock_employer(uuid) TO authenticated;

-- A correction creates a new version (sp_correct_claim, and the same for an
-- experience period). If the old version was searchable, the new one REPLACES
-- it in the selection -- the holder chose to share that merit -- and the
-- superseded version leaves it, so a saved selection never holds an entry the
-- holder can no longer select (review 2026-10-15, RF4). The new version
-- carries its OWN level: a material change starts again as self-declared, so
-- no earlier approval is inherited.
CREATE FUNCTION public.sp_talent_follow_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.supersedes_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'sp_claims' THEN
    IF EXISTS (SELECT 1 FROM public.sp_talent_items WHERE claim_id = NEW.supersedes_id) THEN
      DELETE FROM public.sp_talent_items WHERE claim_id = NEW.supersedes_id;
      INSERT INTO public.sp_talent_items (holder_user_id, claim_id) VALUES (NEW.holder_user_id, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.sp_talent_items WHERE experience_id = NEW.supersedes_id) THEN
    DELETE FROM public.sp_talent_items WHERE experience_id = NEW.supersedes_id;
    INSERT INTO public.sp_talent_items (holder_user_id, experience_id) VALUES (NEW.holder_user_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_talent_follow_correction() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_talent_follow_correction AFTER INSERT ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_talent_follow_correction();
CREATE TRIGGER sp_talent_follow_correction AFTER INSERT ON public.sp_experience_periods
  FOR EACH ROW EXECUTE FUNCTION public.sp_talent_follow_correction();

-- Postflight.
DO $$
DECLARE f text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_talent_profiles) THEN
    RAISE EXCEPTION 'SP_TALENT_PROOF: the migration must not enable anyone';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.sp_talent_get_settings()', 'public.sp_talent_preview()', 'public.sp_talent_pause()',
    'public.sp_talent_save_settings(integer,text,text,uuid[],uuid[],jsonb)', 'public.sp_talent_unblock_employer(uuid)',
    'public.sp_talent_card(uuid)', 'public.sp_talent_merits(uuid)', 'public.sp_talent_experience(uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'SP_TALENT_PROOF: anon may execute %', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.sp_talent_card(uuid)', 'public.sp_talent_merits(uuid)', 'public.sp_talent_experience(uuid)'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'SP_TALENT_PROOF: a client may read a card directly: %', f; END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.sp_talent_profiles', 'search_ref', 'SELECT') THEN
    RAISE EXCEPTION 'SP_TALENT_PROOF: search_ref is readable';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.sp_talent_get_settings()', 'public.sp_talent_preview()', 'public.sp_talent_pause()',
    'public.sp_talent_save_settings(integer,text,text,uuid[],uuid[],jsonb)', 'public.sp_talent_unblock_employer(uuid)'] LOOP
    IF position('sp_assert_passport_session()' IN (SELECT prosrc FROM pg_proc WHERE oid = f::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'SP_TALENT_PROOF: % does not assert the Passport session', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'SP_TALENT_PROOF ok';
END $$;

COMMIT;
