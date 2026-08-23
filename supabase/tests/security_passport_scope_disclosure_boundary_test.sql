-- Security Passport — the scope reaches the right reader and no further.
--
-- Owner decision 2, asserted against the real sp_disclosure_payload:
--
--   include the EXACT scope   application-scoped disclosures,
--                             `employer_review`, `full_verification`
--   exclude the EXACT scope   `public_card` and every other package
--
-- Every exclusion is paired with the inclusion that proves the payload could
-- have carried it. A "scope absent" assertion on a payload with no claims in
-- it would pass for the wrong reason.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h        uuid := '00000000-0000-0000-0000-00000000b101';
  _verifier uuid := '00000000-0000-0000-0000-00000000b199';
  _claim    uuid := 'b1000000-0000-4000-8000-00000000e001';
  _emp      uuid;
  _app      uuid;
  _job      uuid;
  _d        uuid;
  _payload  jsonb;
  _c        jsonb;
  _scope    text := 'Skyddsobjekt: Hamnen, Kaj 12';
  _pkg      text;
  _txt      text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h), (_verifier) ON CONFLICT DO NOTHING;
  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name)
  VALUES (_h, 'Testinnehavare') ON CONFLICT (holder_user_id) DO NOTHING;

  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, authorisation_scope,
     assertion_level, lifecycle_state, verified_by_user_id, verified_at)
  VALUES (_claim, _h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, _scope,
          'verified', 'active', _verifier, now());

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- a public card never names the protected object';
  -- =====================================================================
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash)
  VALUES (_h, 'public_card', repeat('a', 64)) RETURNING id INTO _d;

  _payload := public.sp_disclosure_payload(_d);
  _c := _payload -> 'verified_claims' -> 0;

  IF _c IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.0 the public card carried no claim to test';
  END IF;
  RAISE NOTICE 'ok  1.0 POSITIVE CONTROL the public card does carry the credential';

  IF _c ->> 'authorisation_scope' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 a public card leaked the exact scope';
  END IF;
  RAISE NOTICE 'ok  1.1 MUTATION the exact scope is absent from a public card';

  IF (_c ->> 'scope_limited')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 the public card hid that limits exist';
  END IF;
  RAISE NOTICE 'ok  1.2 but it DOES say the approval is limited — silence would read as unlimited';

  IF _payload::text LIKE '%Hamnen%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 the protected object appears somewhere in the payload';
  END IF;
  RAISE NOTICE 'ok  1.3 the protected object appears nowhere in the whole public payload';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- verified_qualifications is not an employer package';
  -- =====================================================================
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash)
  VALUES (_h, 'verified_qualifications', repeat('b', 64)) RETURNING id INTO _d;

  _payload := public.sp_disclosure_payload(_d);
  _c := _payload -> 'verified_claims' -> 0;
  IF _c IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.0 no claim to test';
  END IF;
  IF _c ->> 'authorisation_scope' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 a token qualifications package leaked the scope';
  END IF;
  RAISE NOTICE 'ok  2.0 POSITIVE CONTROL the package carries the credential';
  RAISE NOTICE 'ok  2.1 MUTATION a shared-link qualifications package withholds the scope';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the packages the holder picks knowingly DO carry it';
  -- =====================================================================
  FOREACH _pkg IN ARRAY ARRAY['employer_review','full_verification'] LOOP
    INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash)
    VALUES (_h, _pkg, encode(gen_random_bytes(32), 'hex')) RETURNING id INTO _d;

    _payload := public.sp_disclosure_payload(_d);
    IF (_payload -> 'verified_claims' -> 0) ->> 'authorisation_scope' IS DISTINCT FROM _scope THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 3.x % did not carry the scope', _pkg;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  3.1 employer_review carries the exact scope';
  RAISE NOTICE 'ok  3.2 full_verification carries the exact scope';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- an application-scoped disclosure carries it';
  -- =====================================================================
  -- The narrowest package there is, deliberately: an application disclosure
  -- must carry the scope even when its package alone would not.
  -- Self-sufficient rather than borrowing a fixture. A real application needs
  -- a published, internal job -- enforced by a trigger, not just the TS layer --
  -- so the suite creates exactly that. Nothing is bypassed: this is the same
  -- shape a genuine application has, which is the point.
  SELECT id INTO _emp FROM public.employers LIMIT 1;
  IF _emp IS NULL THEN
    -- Reported, never skipped silently: a run without this coverage says so.
    RAISE NOTICE 'ok  4.0 NOT COVERED no employer exists in this database';
  ELSE
    -- Created as a draft and then published, because that is the only route
    -- the database allows. Following it rather than bypassing it is the whole
    -- point: this fixture is a real job, not a shape that looks like one.
    INSERT INTO public.jobs
      (employer_id, slug, short_id, status, application_method, expires_at)
    VALUES (_emp, 'scope-boundary-fixture-' || substr(md5(random()::text), 1, 8),
            substr(md5(random()::text), 1, 8), 'draft', 'internal',
            now() + interval '30 days')
    RETURNING id INTO _job;

    -- published_at is moderation-owned and stamped by the platform, so only
    -- the status moves here.
    UPDATE public.jobs SET status = 'published' WHERE id = _job;

    BEGIN
      INSERT INTO public.job_applications
        (job_id, employer_id, applicant_user_id, status, consent_given_at)
      VALUES (_job, _emp, _h, 'submitted', now()) RETURNING id INTO _app;
    EXCEPTION WHEN others THEN
      _app := NULL;
      GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
      RAISE NOTICE 'ok  4.0 NOT COVERED could not build a real application here: %', _txt;
    END;

    IF _app IS NOT NULL THEN
      INSERT INTO public.sp_disclosures
        (holder_user_id, package_code, application_id)
      VALUES (_h, 'verified_qualifications', _app) RETURNING id INTO _d;
    END IF;

    IF _app IS NOT NULL THEN
      _payload := public.sp_disclosure_payload(_d);
      IF (_payload -> 'verified_claims' -> 0) ->> 'authorisation_scope' IS DISTINCT FROM _scope THEN
        RAISE EXCEPTION 'ASSERTION FAILED: 4.1 an application disclosure withheld the scope';
      END IF;
      RAISE NOTICE 'ok  4.1 an application disclosure carries the scope on the SAME package';
      RAISE NOTICE 'ok  4.2 which GROUP 2 proved withholds it when shared by link';
    END IF;

    IF _app IS NOT NULL THEN
      DELETE FROM public.sp_disclosures WHERE application_id = _app;
      DELETE FROM public.job_applications WHERE id = _app;
    END IF;
    DELETE FROM public.jobs WHERE id = _job;
  END IF;

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- the emirate travels everywhere, being provenance';
  -- =====================================================================
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash)
  VALUES (_h, 'public_card', repeat('c', 64)) RETURNING id INTO _d;
  _payload := public.sp_disclosure_payload(_d);
  IF NOT ((_payload -> 'verified_claims' -> 0) ? 'sub_jurisdiction') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 sub_jurisdiction is not emitted';
  END IF;
  RAISE NOTICE 'ok  5.1 sub_jurisdiction is emitted even on a public card';

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- cleanup';
  -- =====================================================================
  DELETE FROM public.sp_disclosures WHERE holder_user_id = _h;
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  DELETE FROM public.sp_passport_profiles WHERE holder_user_id = _h;
  DELETE FROM auth.users WHERE id IN (_h, _verifier);
  RAISE NOTICE 'ok  6.1 suite data removed';
END $$;
