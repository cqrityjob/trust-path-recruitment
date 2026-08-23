-- Security Passport — Swedish truth model assertions.
--
-- Three things the Swedish system distinguishes and the old four-credential
-- vocabulary could not say. Each is asserted by attempting the thing the model
-- forbids, and each denial is paired with the same write differing only in the
-- forbidden dimension — a refusal nobody can contrast has proved nothing.
--
--   1. Completing ordningsvakt training is not being appointed.
--   2. A personnel approval is a checked result and NOTHING else. Nothing
--      about the police register behind it may enter the Passport.
--   3. A skyddsvakt approval is scoped, and is misleading without its scope.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h uuid := '00000000-0000-0000-0000-00000000fc01';
  _n integer;
  _txt text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- training and appointment are separate credentials';
  -- =====================================================================

  IF (SELECT category FROM public.sp_credential_types WHERE code = 'OV_TRAINING')
     <> 'qualification' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 ordningsvakt training must be a qualification';
  END IF;
  IF (SELECT category FROM public.sp_credential_types WHERE code = 'OV')
     <> 'appointment' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 OV must remain the appointment';
  END IF;
  RAISE NOTICE 'ok  1.1 ordningsvakt training is a qualification';
  RAISE NOTICE 'ok  1.2 OV still means the förordnande, so no stored claim changed meaning';

  -- The training has no expiry of its own and must not be forced to invent one.
  IF (SELECT requires_valid_until FROM public.sp_credential_types
       WHERE code IN ('OV_TRAINING','OV_REFRESHER','OV_TRANSPORT') AND requires_valid_until) IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 a training credential must not require an expiry';
  END IF;
  RAISE NOTICE 'ok  1.3 none of the three training credentials invents an expiry';

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code)
  VALUES (_h, 'training', 'Ordningsvaktsutbildning', 'OV_TRAINING', 'SE');
  RAISE NOTICE 'ok  1.4 somebody who has done the course can now record exactly that';

  -- The whole point: the course carries no eligibility and no title.
  IF (SELECT contributes_to FROM public.sp_credential_types WHERE code = 'OV_TRAINING')
     <> ARRAY['education_completed']::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 the training must contribute to education only';
  END IF;
  RAISE NOTICE 'ok  1.5 the course contributes to completed education and nothing else';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- a personnel approval is a narrow result, enforced';
  -- =====================================================================

  IF (SELECT narrow_result_only FROM public.sp_credential_types
       WHERE code = 'SE_PERSONNEL_APPROVAL') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 the personnel approval must be narrow-result-only';
  END IF;
  RAISE NOTICE 'ok  2.1 the personnel approval is marked narrow-result-only';

  -- A holder note is where register contents, an explanation of a refusal or
  -- a mention of an offence would arrive. The database refuses it outright.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, holder_note)
    VALUES (_h, 'licence', 'Personalgodkännande (bevakningsföretag)',
            'SE_PERSONNEL_APPROVAL', 'SE', 'Länsstyrelsen',
            'Godkänd trots anmärkning i belastningsregistret');
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 a note was accepted on a narrow-result credential';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_NARROW_RESULT_ONLY%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 2.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  2.2 register commentary cannot be attached to a personnel approval';
  END;

  -- Nor may the TITLE be free text, which is the other way a sentence about
  -- somebody's record would get in.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name)
    VALUES (_h, 'licence', 'Godkänd efter prövning av belastningsregistret',
            'SE_PERSONNEL_APPROVAL', 'SE', 'Länsstyrelsen');
    RAISE EXCEPTION 'ASSERTION FAILED: 2.3 a free-text title was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.3 the title must be the controlled label, not free text';
  END;

  -- A DRAFT is refused too. Completeness rules wait for submit; this one
  -- cannot, because a draft that already stored the sentence has already
  -- done the harm.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, holder_note, lifecycle_state)
    VALUES (_h, 'licence', 'Personalgodkännande (bevakningsföretag)',
            'SE_PERSONNEL_APPROVAL', 'SE', 'Länsstyrelsen',
            'Anteckning om utredning', 'draft');
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 a DRAFT stored register commentary';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.4 the narrow-result rule binds drafts too, not only submissions';
  END;

  -- POSITIVE CONTROL: the controlled label, with an authority and no note,
  -- stores normally. Without this the three refusals above would also pass
  -- against a credential nobody can use at all.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name)
  VALUES (_h, 'licence', 'Personalgodkännande (bevakningsföretag)',
          'SE_PERSONNEL_APPROVAL', 'SE', 'Länsstyrelsen');
  RAISE NOTICE 'ok  2.5 POSITIVE CONTROL the checked result itself records normally';

  -- And it is eligibility, never a title.
  IF (SELECT contributes_to FROM public.sp_credential_types
       WHERE code = 'SE_PERSONNEL_APPROVAL') @> ARRAY['active_title']::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.6 a personnel approval must not feed a title';
  END IF;
  RAISE NOTICE 'ok  2.6 a personnel approval grants eligibility, not a professional title';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- a skyddsvakt approval must say what it covers';
  -- =====================================================================

  IF (SELECT requires_scope FROM public.sp_credential_types WHERE code = 'SV') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 SV must require a scope';
  END IF;
  RAISE NOTICE 'ok  3.1 the skyddsvakt approval requires a scope';

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until)
    VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
            'Länsstyrelsen', current_date + 300);
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 an unscoped skyddsvakt approval was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 3.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  3.2 without its scope the approval is refused, not stored as general';
  END;

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, authorisation_scope)
  VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, 'Skyddsobjekt: Hamnen');
  RAISE NOTICE 'ok  3.3 POSITIVE CONTROL the same approval, scoped, stores normally';

  -- Grandfathering. Skyddsvakt claims exist from before this column did, and
  -- the trigger fires on UPDATE as well as INSERT — so an unconditional rule
  -- would have frozen those rows: no correction, no verification, no expiry,
  -- refused over a field the form never asked for. Asserted by writing a row
  -- the way the old schema did and then updating it.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, authorisation_scope, lifecycle_state)
  VALUES (_h, 'licence', 'Gammalt skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, NULL, 'draft');

  UPDATE public.sp_claims
     SET valid_until = current_date + 400
   WHERE holder_user_id = _h AND credential_code = 'SV' AND authorisation_scope IS NULL;
  RAISE NOTICE 'ok  3.4 a pre-existing scopeless approval can still be corrected';

  -- But a scope that IS recorded cannot be taken away.
  BEGIN
    UPDATE public.sp_claims
       SET authorisation_scope = NULL
     WHERE holder_user_id = _h AND authorisation_scope = 'Skyddsobjekt: Hamnen';
    RAISE EXCEPTION 'ASSERTION FAILED: 3.5 a recorded scope was removed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  3.5 a scope that was recorded cannot be removed later';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- the derivation rules, as data';
  -- =====================================================================

  SELECT count(*) INTO _n FROM public.sp_professional_titles WHERE market_pack_code = 'SE';
  IF _n < 11 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 expected the Swedish rule set, found %', _n;
  END IF;
  RAISE NOTICE 'ok  4.1 % Swedish derivation rules are seeded', _n;

  -- The rule the whole model turns on: Väktare needs BOTH steps.
  IF (SELECT requires_credential_codes FROM public.sp_professional_titles
       WHERE code = 'SE_VAKTARE_COMPETENCE') <> ARRAY['VU1','VU2']::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 the Väktare rule must require VU1 AND VU2';
  END IF;
  RAISE NOTICE 'ok  4.2 the Väktare competence rule requires both training steps';

  -- No title may rest on training. Asserted over the whole table so a rule
  -- added later cannot quietly reintroduce it.
  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE t.output_kind IN ('active_title', 'local_eligibility')
       AND EXISTS (
         SELECT 1 FROM unnest(t.requires_credential_codes) AS c(code)
          JOIN public.sp_credential_types ct ON ct.code = c.code
         WHERE ct.category = 'qualification')
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.3 an authority-bearing rule rests on a qualification';
  END IF;
  RAISE NOTICE 'ok  4.3 no title or eligibility anywhere rests on completed training';

  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE output_kind IN ('active_title','local_eligibility')
                AND (requires_assertion_level <> 'verified' OR NOT requires_current_validity)) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.4 an authority-bearing rule accepts weak or stale evidence';
  END IF;
  RAISE NOTICE 'ok  4.4 every authority-bearing rule demands verified, current evidence';

  -- Ordningsvakt comes from the appointment, and the training rule produces
  -- education. Asserted as a pair so neither can drift alone.
  IF (SELECT requires_credential_codes FROM public.sp_professional_titles
       WHERE code = 'SE_ORDNINGSVAKT_TITLE') <> ARRAY['OV']::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.5 the Ordningsvakt title must come from the appointment';
  END IF;
  IF (SELECT output_kind FROM public.sp_professional_titles
       WHERE code = 'SE_OV_TRAINING_COMPLETED') <> 'education_completed' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.6 the training rule must produce completed education';
  END IF;
  RAISE NOTICE 'ok  4.5 the Ordningsvakt title is derived from the förordnande';
  RAISE NOTICE 'ok  4.6 the training produces completed education, never the title';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- cleanup';
  -- =====================================================================
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  RAISE NOTICE 'ok  5.1 suite data removed';
END $$;
