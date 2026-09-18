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
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code, claimed_issuer_name)
  VALUES (_h, 'training', 'Ordningsvaktsutbildning (grundutbildning)', 'OV_TRAINING', 'SE', 'Polismyndigheten');
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
    IF _txt NOT LIKE 'SP_GOVERNED_METADATA_IMMUTABLE%' THEN
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
    -- Since 20261126090000 SV is in the approved catalogue, so the refusal names
    -- the real reason instead of pretending the definition does not exist.
    IF _txt NOT LIKE 'SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 3.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  3.2 without its scope the approval is refused, not stored as general';
  END;

  BEGIN
    INSERT INTO public.sp_claims(holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,valid_until,authorisation_scope)
    VALUES(_h,'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen',current_date+300,'Candidate scope');
    -- Since 20261126090000 this is the INTENDED path: SV is selectable, and its
    -- scope is what makes it truthful. The row must carry exactly that scope.
    IF NOT EXISTS(SELECT 1 FROM public.sp_claims WHERE holder_user_id=_h AND credential_code='SV'
                   AND authorisation_scope='Candidate scope' AND claimed_issuer_name='Länsstyrelsen') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 3.3 a scoped skyddsvakt approval was not stored with its scope';
    END IF;
    DELETE FROM public.sp_claims WHERE holder_user_id=_h AND credential_code='SV' AND authorisation_scope='Candidate scope';
    RAISE NOTICE 'ok  3.3 with its scope the approval is stored, under Länsstyrelsen, carrying that scope';
  END;
  -- …and a scope cannot be attached to a definition that has none.
  BEGIN
    INSERT INTO public.sp_claims(holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,valid_until,authorisation_scope)
    VALUES(_h,'licence','Ordningsvaktsförordnande','OV','SE','Polismyndigheten',current_date+300,'Candidate scope');
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3b a candidate-defined scope was accepted on an unscoped appointment';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SP_GOVERNED_METADATA_IMMUTABLE' THEN RAISE; END IF;
    RAISE NOTICE 'ok  3.3b a holder cannot attach a scope to an appointment that has none';
  END;
  BEGIN
    INSERT INTO public.sp_claims(holder_user_id,claim_type,title,credential_code,jurisdiction_code,claimed_issuer_name,lifecycle_state)
    VALUES(_h,'licence','Skyddsvaktsförordnande','SV','SE','Länsstyrelsen','draft');
    RAISE EXCEPTION 'ASSERTION FAILED: draft bypass accepted';
  EXCEPTION WHEN check_violation THEN
    -- SV is listed since 20261126090000; the refusal is the scope rule itself.
    IF SQLERRM<>'SP_CREDENTIAL_REQUIRES_SCOPE' THEN RAISE; END IF;
    RAISE NOTICE 'ok  3.4 drafts cannot bypass governed scope requirements';
  END;
  BEGIN
    UPDATE public.sp_claims SET authorisation_scope='Candidate scope' WHERE holder_user_id=_h AND credential_code='OV_TRAINING';
    RAISE EXCEPTION 'ASSERTION FAILED: candidate scope added to approved definition';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'SP_GOVERNED_METADATA_IMMUTABLE' THEN RAISE; END IF;
    RAISE NOTICE 'ok  3.5 approved scope cannot be redefined on a claim';
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
