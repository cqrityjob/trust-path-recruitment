-- Closed-test setup for the Phase 2 journey.
--
-- ── THIS IS NOT A MIGRATION ───────────────────────────────────────────────
--
-- It lives in scripts/ deliberately. It inserts synthetic organisations and
-- grants, which must never become part of the migration chain that runs against
-- every environment. Run it by hand, once, against the closed-test project.
--
-- Run it in the Lovable Cloud / Supabase SQL editor, which connects as an
-- owner role. It is idempotent: running it twice changes nothing the second
-- time.
--
-- ── PRECONDITION ──────────────────────────────────────────────────────────
--
-- Three auth users must already exist. This script does NOT create them,
-- because creating an account means setting a password, and that belongs to a
-- person, not to a script. Create them first (Supabase → Authentication → Add
-- user, "Auto Confirm User" ticked):
--
--   employer.owner@closed-test.invalid   -- owns the closed-test organisation
--   participant@closed-test.invalid      -- takes the assessment
--   reviewer@closed-test.invalid         -- adjudicates the constructed response
--
-- `.invalid` is reserved by RFC 2606 and can never route anywhere, so no
-- synthetic account can ever send mail to a real person. If the Supabase form
-- refuses the TLD, use @closed-test.example instead and change the three
-- constants below to match.
--
-- Everything here is synthetic. No real employer, candidate or employee is
-- referenced, and no real personal data appears anywhere in this file.

\set ON_ERROR_STOP on

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — resolve the three synthetic accounts
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Resolved by email rather than by pasted UUID, so there is no opportunity to
-- transcribe the wrong id and wire a real person into the closed test.

DO $$
DECLARE
  _owner       uuid;
  _participant uuid;
  _reviewer    uuid;
  _employer    uuid;
  _missing     text[] := '{}';
BEGIN
  SELECT id INTO _owner       FROM auth.users WHERE email = 'employer.owner@closed-test.invalid';
  SELECT id INTO _participant FROM auth.users WHERE email = 'participant@closed-test.invalid';
  SELECT id INTO _reviewer    FROM auth.users WHERE email = 'reviewer@closed-test.invalid';

  IF _owner       IS NULL THEN _missing := _missing || ARRAY['employer.owner@closed-test.invalid']; END IF;
  IF _participant IS NULL THEN _missing := _missing || ARRAY['participant@closed-test.invalid'];    END IF;
  IF _reviewer    IS NULL THEN _missing := _missing || ARRAY['reviewer@closed-test.invalid'];       END IF;

  IF array_length(_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'CLOSED_TEST_ACCOUNTS_MISSING: create these users first, then re-run: %',
      array_to_string(_missing, ', ');
  END IF;

  -- ── The closed-test organisation ────────────────────────────────────────
  -- Named so that nobody who stumbles across it in a list mistakes it for a
  -- customer.
  INSERT INTO public.employers (name, slug, status, country)
  VALUES ('STÄNGD TEST — CQrityjob internt', 'stangd-test-cqrityjob', 'active', 'SE')
  ON CONFLICT (slug) DO UPDATE SET status = 'active'
  RETURNING id INTO _employer;

  INSERT INTO public.employer_memberships
    (employer_id, user_id, role, status, accepted_at)
  VALUES (_employer, _owner, 'owner', 'active', now())
  ON CONFLICT DO NOTHING;

  -- ── The fixture grant ───────────────────────────────────────────────────
  -- One row, one organisation. This is the whole of what makes the fixture
  -- visible, and it is why every other employer on the platform still sees
  -- nothing.
  INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
  VALUES (_employer, 'Phase 2 closed test — internal only', _owner)
  ON CONFLICT (employer_id) DO NOTHING;

  -- ── The reviewer ────────────────────────────────────────────────────────
  --
  -- CORRECTED 2026-08-21. This block used to insert a content role and NOTHING
  -- else, on the stated principle that the reviewer must not be a member of the
  -- employer. #51 (20260829090000_scp_employer_response_reviewers) inverted
  -- that. `scp_can_review_for` now requires an ACTIVE membership in the
  -- reviewing organisation AND an explicit per-use-case authorisation, so the
  -- account this script used to produce could review nothing at all: an empty
  -- queue, every attempt stuck at `submitted`, and no report ever released.
  -- That is the state the hosted project was found in during the recruitment
  -- E2E, and it is what this script would have reproduced.
  --
  -- Independence lives in `scp_review_conflict`, and #63
  -- (20260903100000_scp_review_conflict_disclosure) narrowed it to the two
  -- rules that are absolute: nobody reviews their own responses, and nobody
  -- reviews an attempt whose employer decision they have already recorded.
  -- Commissioning the assessment, or having moved the candidate's application,
  -- is now DISCLOSED on the completed review rather than refused — a two-person
  -- firm should not need a third person to finish its own cycle.
  --
  -- The reviewer account below is still deliberately NOT the owner. It costs
  -- nothing here and keeps the fixture exercising the cleanest path, where no
  -- disclosure is recorded at all.
  INSERT INTO public.scp_content_roles (user_id, role, granted_by)
  VALUES (_reviewer, 'reviewer', _owner)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 1. Membership. `member`, not admin: reviewing needs no elevated role, and a
  --    reviewer who could also assign would trip the conflict rule on every
  --    attempt they had assigned.
  INSERT INTO public.employer_memberships
    (employer_id, user_id, role, status, accepted_at)
  VALUES (_employer, _reviewer, 'member', 'active', now())
  ON CONFLICT DO NOTHING;

  -- 2. The authorisation itself. Both use cases, because this fixture exercises
  --    the workforce journey and the recruitment journey. A real organisation
  --    grants only what it needs — the Team panel offers workforce, recruitment
  --    or both.
  INSERT INTO public.scp_employer_reviewers
    (employer_id, user_id, allowed_use_cases, granted_by)
  VALUES (_employer, _reviewer, ARRAY['workforce','recruitment']::text[], _owner)
  ON CONFLICT (employer_id, user_id) WHERE revoked_at IS NULL DO UPDATE
    SET allowed_use_cases = EXCLUDED.allowed_use_cases,
        granted_by = EXCLUDED.granted_by;

  RAISE NOTICE 'closed-test organisation: % (slug stangd-test-cqrityjob)', _employer;
  RAISE NOTICE 'owner %, participant %, reviewer %', _owner, _participant, _reviewer;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — prove the grant does what it claims
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Configuration that is not verified is a guess. These six checks are the
-- hosted equivalents of journey group J12, and they run as real principals via
-- SET LOCAL ROLE rather than as the owner. Check 6 was added after the
-- recruitment E2E found an organisation that passed every grant check and still
-- could not complete a single assessment.

DO $$
DECLARE
  _employer  uuid;
  _owner     uuid;
  _other     uuid;
  _other_usr uuid;
  _ver       uuid;
  _n         int;
  _sqlstate  text;
  _msg       text;
BEGIN
  SELECT id INTO _employer FROM public.employers WHERE slug = 'stangd-test-cqrityjob';
  SELECT user_id INTO _owner FROM public.employer_memberships
    WHERE employer_id = _employer AND role = 'owner' LIMIT 1;

  -- ── 1. exactly one organisation holds the grant ─────────────────────────
  SELECT count(*) INTO _n FROM public.scp_fixture_access;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: % organisations hold fixture access, expected exactly 1', _n;
  END IF;
  RAISE NOTICE 'CHECK 1 ok — exactly one organisation holds fixture access';

  -- ── 2. the granted organisation sees the fixture ────────────────────────
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n
    FROM public.scp_employer_library(_employer) l
   WHERE l.is_test_fixture;
  RESET ROLE;
  IF _n < 1 THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: the granted organisation cannot see the fixture';
  END IF;
  RAISE NOTICE 'CHECK 2 ok — the granted organisation sees % fixture programme(s)', _n;

  -- ── 3. an ungranted organisation sees nothing ───────────────────────────
  -- Built here, in this transaction, and rolled back with it: the check needs
  -- an organisation that has never held a grant, and borrowing a real one
  -- would mean touching a customer's row.
  SELECT id INTO _other_usr FROM auth.users WHERE email = 'participant@closed-test.invalid';
  INSERT INTO public.employers (name, slug, status)
  VALUES ('STÄNGD TEST — ogrundad kontroll', 'stangd-test-kontroll', 'active')
  ON CONFLICT (slug) DO UPDATE SET status = 'active'
  RETURNING id INTO _other;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at)
  VALUES (_other, _other_usr, 'owner', 'active', now())
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', _other_usr::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n
    FROM public.scp_employer_library(_other) l
   WHERE l.is_test_fixture;
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: an ungranted organisation sees % fixture row(s)', _n;
  END IF;
  RAISE NOTICE 'CHECK 3 ok — an ungranted organisation sees no fixture content';

  -- ── 4. a crafted assignment from an ungranted organisation is refused ────
  -- The version id is fetched as owner, exactly as an attacker who had read it
  -- from somewhere else would already hold it. Absence from the library must
  -- not be the only thing standing in the way.
  SELECT av.id INTO _ver
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.is_test_fixture AND av.content_status = 'published'
   ORDER BY av.version_number DESC LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', _other_usr::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.scp_employer_assign(
      _other, _ver, 'participant@closed-test.invalid', NULL, 'sv');
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 4 FAILED: an ungranted organisation assigned the fixture';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    RESET ROLE;
    IF _msg NOT LIKE '%SCP_FIXTURE_NOT_AVAILABLE%' THEN
      RAISE EXCEPTION 'CHECK 4 FAILED: refused with the wrong error (% / %)', _sqlstate, _msg;
    END IF;
  END;
  RAISE NOTICE 'CHECK 4 ok — refused with SCP_FIXTURE_NOT_AVAILABLE';

  -- ── 5. the grant list is not employer-readable ──────────────────────────
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO _n FROM public.scp_fixture_access;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 5 FAILED: an employer read the fixture-access list (% rows)', _n;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'CHECK 5 ok — permission denied, as intended';
  END;

  -- ── 6. the reviewer can actually review ─────────────────────────────────
  -- Added 2026-08-21. Without this the script could report five green checks
  -- and still leave an organisation that cannot complete a single assessment,
  -- which is precisely what happened. Configuration that is not verified is a
  -- guess, and this is the guess that cost a pilot.
  SELECT user_id INTO _other_usr FROM public.employer_memberships
    WHERE employer_id = _employer AND role = 'member' LIMIT 1;
  IF _other_usr IS NULL
     OR NOT public.scp_can_review_for(_other_usr, _employer, 'workforce')
     OR NOT public.scp_can_review_for(_other_usr, _employer, 'recruitment') THEN
    RAISE EXCEPTION
      'CHECK 6 FAILED: the reviewer holds no working authorisation. Reviewing '
      'needs an ACTIVE employer_memberships row AND an scp_employer_reviewers '
      'row covering the use case — a content role alone does nothing.';
  END IF;
  RAISE NOTICE 'CHECK 6 ok — the reviewer is authorised for workforce and recruitment';

  -- The control organisation was only ever scaffolding for checks 3 and 4.
  DELETE FROM public.employer_memberships WHERE employer_id = _other;
  DELETE FROM public.employers WHERE id = _other;
  RAISE NOTICE 'control organisation removed';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- What to expect
-- ═══════════════════════════════════════════════════════════════════════════
--
--   NOTICE:  closed-test organisation: <uuid> (slug stangd-test-cqrityjob)
--   NOTICE:  CHECK 1 ok — exactly one organisation holds fixture access
--   NOTICE:  CHECK 2 ok — the granted organisation sees 1 fixture programme(s)
--   NOTICE:  CHECK 3 ok — an ungranted organisation sees no fixture content
--   NOTICE:  CHECK 4 ok — refused with SCP_FIXTURE_NOT_AVAILABLE
--   NOTICE:  CHECK 5 ok — permission denied, as intended
--   NOTICE:  CHECK 6 ok — the reviewer is authorised for workforce and recruitment
--   NOTICE:  control organisation removed
--
-- Any EXCEPTION rolls the whole thing back and configures nothing. That is the
-- intended behaviour: a closed test that is half-configured is worse than one
-- that has not started.
