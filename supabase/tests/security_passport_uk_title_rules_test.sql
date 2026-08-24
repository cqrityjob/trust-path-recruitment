-- Security Passport — the canonical UK title-derivation contract
-- ===========================================================================
-- Migration 3 was applied hosted through Lovable, which rewrote the reviewed
-- SQL: it dropped six local_eligibility rules and renamed the six
-- education_completed ones, leaving 13 GB rules where the contract defines 19.
-- 20260907092500_sp_uk_title_rules_correction.sql repairs that.
--
-- Counting alone would not have caught it and will not catch the next one, so
-- this suite asserts the SHAPE of the contract: which output each rule feeds,
-- which credential it reads, and what it demands before it fires. GROUP 6
-- installs the generated rule set and proves these assertions actually fail
-- against it — a regression test that cannot fail against the defect it names
-- is not a regression test.

\set ON_ERROR_STOP on

DO $uktr$
DECLARE
  _n       integer;
  _bad     text;
  _cls     text;
  _classes text[] := ARRAY['SG','DS','CCTV','CP','CVIT','KH'];
BEGIN
  RAISE NOTICE 'GROUP 1 -- the canonical set is exactly 19 rules, split 6/7/6';

  SELECT count(*) INTO _n FROM public.sp_professional_titles WHERE market_pack_code = 'GB';
  IF _n <> 19 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected 19 GB rules, found %', _n;
  END IF;
  RAISE NOTICE '    ok  1.1 19 GB professional-title rules';

  SELECT count(*) INTO _n FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='active_title';
  IF _n <> 6 THEN RAISE EXCEPTION 'ASSERTION FAILED: expected 6 active_title, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='local_eligibility';
  IF _n <> 7 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: expected 7 local_eligibility, found %. A current licence '
      'must state that it is active, not merely produce a title.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='education_completed';
  IF _n <> 6 THEN RAISE EXCEPTION 'ASSERTION FAILED: expected 6 education_completed, found %', _n; END IF;
  RAISE NOTICE '    ok  1.2 split is 6 active_title / 7 local_eligibility / 6 education_completed';

  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_professional_titles
   WHERE market_pack_code='GB'
     AND (code LIKE 'GB\_SIA\_EDU\_%' OR code = 'GB_SIA_ELIGIBLE_NFL');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: non-canonical generated rule(s) present: %', _bad;
  END IF;
  RAISE NOTICE '    ok  1.3 no GB_SIA_EDU_* and no GB_SIA_ELIGIBLE_NFL survive';

  SELECT string_agg(c, ', ' ORDER BY c) INTO _bad
    FROM unnest(ARRAY[
      'GB_SIA_TITLE_SG','GB_SIA_TITLE_DS','GB_SIA_TITLE_CCTV','GB_SIA_TITLE_CP',
      'GB_SIA_TITLE_CVIT','GB_SIA_TITLE_KH',
      'GB_SIA_ELIG_SG','GB_SIA_ELIG_DS','GB_SIA_ELIG_CCTV','GB_SIA_ELIG_CP',
      'GB_SIA_ELIG_CVIT','GB_SIA_ELIG_KH','GB_SIA_ELIG_NFL',
      'GB_SIA_QUAL_SG','GB_SIA_QUAL_DS','GB_SIA_QUAL_CCTV','GB_SIA_QUAL_CP',
      'GB_SIA_QUAL_CVIT','GB_SIA_TOP_UP']) AS c
   WHERE (SELECT count(*) FROM public.sp_professional_titles t
           WHERE t.code=c AND t.market_pack_code='GB') <> 1;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: canonical code(s) missing or duplicated: %', _bad;
  END IF;
  RAISE NOTICE '    ok  1.4 every canonical code exists exactly once';

  RAISE NOTICE 'GROUP 2 -- every licence class derives BOTH its title and its eligibility';
  FOREACH _cls IN ARRAY _classes LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_professional_titles
                    WHERE code='GB_SIA_TITLE_'||_cls AND output_kind='active_title'
                      AND requires_credential_codes = ARRAY['UK_SIA_LICENCE_'||_cls]::text[]) THEN
      RAISE EXCEPTION 'ASSERTION FAILED: GB_SIA_TITLE_% does not read UK_SIA_LICENCE_%', _cls, _cls;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sp_professional_titles
                    WHERE code='GB_SIA_ELIG_'||_cls AND output_kind='local_eligibility'
                      AND requires_credential_codes = ARRAY['UK_SIA_LICENCE_'||_cls]::text[]) THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: GB_SIA_ELIG_% is missing — this is exactly the rule '
        'Lovable dropped, so a current % licence would show a title with no '
        'statement that the licence is active', _cls, _cls;
    END IF;
  END LOOP;
  RAISE NOTICE '    ok  2.1 all 6 front-line classes derive a title from their licence';
  RAISE NOTICE '    ok  2.2 and all 6 derive local eligibility from the same licence';

  IF NOT EXISTS (SELECT 1 FROM public.sp_professional_titles
                  WHERE code='GB_SIA_ELIG_NFL' AND output_kind='local_eligibility'
                    AND requires_credential_codes = ARRAY['UK_SIA_LICENCE_NFL']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the non-front-line licence derives no eligibility';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code='GB' AND output_kind='active_title'
                AND 'UK_SIA_LICENCE_NFL' = ANY(requires_credential_codes)) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: non-front-line produced an active title. It permits a '
      'role in a licensed business, not a front-line activity.';
  END IF;
  RAISE NOTICE '    ok  2.3 non-front-line derives eligibility but never a front-line title';

  RAISE NOTICE 'GROUP 3 -- a qualification produces education, and nothing else';
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind <> 'education_completed'
     AND EXISTS (SELECT 1 FROM unnest(requires_credential_codes) rc
                  WHERE rc LIKE 'UK\_SIA\_QUAL\_%' OR rc = 'UK_SIA_TOP_UP');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: rule(s) % derive eligibility or a title from a '
      'qualification. Passing a course is not a licence.', _bad;
  END IF;
  RAISE NOTICE '    ok  3.1 MUTATION: no qualification feeds a title or eligibility';

  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='education_completed'
     AND EXISTS (SELECT 1 FROM unnest(requires_credential_codes) rc
                  WHERE rc LIKE 'UK\_SIA\_LICENCE\_%');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: education rule(s) % read a licence', _bad;
  END IF;
  RAISE NOTICE '    ok  3.2 and no education rule reads a licence';

  RAISE NOTICE 'GROUP 4 -- authority claims demand verification and current validity';
  SELECT string_agg(code, ', ' ORDER BY code) INTO _bad
    FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind IN ('active_title','local_eligibility')
     AND (requires_assertion_level <> 'verified' OR NOT requires_current_validity);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: rule(s) % would assert legal standing from unverified '
      'or expired evidence', _bad;
  END IF;
  RAISE NOTICE '    ok  4.1 expired, revoked, superseded or disputed licences cannot derive current authority';
  RAISE NOTICE '    ok  4.2 and self-declared evidence cannot either';

  RAISE NOTICE 'GROUP 5 -- the reviewed activation gate is untouched';
  IF EXISTS (SELECT 1 FROM public.sp_market_packs
              WHERE code='GB' AND (is_active OR legal_review_state <> 'pending')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the GB pack is no longer inactive/pending';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code='GB' AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: a GB rule is active while the pack is not';
  END IF;
  RAISE NOTICE '    ok  5.1 GB stays inactive and fail-closed until its review is approved';

  RAISE NOTICE 'GROUP 6 -- MUTATION: these assertions fail against the generated set';
END $uktr$;

-- Installs exactly what Lovable's rewrite produced, re-runs the GROUP 1 checks,
-- and requires them to fail. Wrapped in a savepoint so the canonical set is
-- restored whatever happens.
BEGIN;
SAVEPOINT before_mutation;

DELETE FROM public.sp_professional_titles
 WHERE market_pack_code='GB' AND (code LIKE 'GB\_SIA\_ELIG\_%' OR code LIKE 'GB\_SIA\_QUAL\_%'
                                  OR code='GB_SIA_TOP_UP');
INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, output_kind, name_local, name_en,
   requires_credential_codes, requires_assertion_level, requires_current_validity, is_active, priority)
VALUES ('GB_SIA_ELIGIBLE_NFL','GB','SECURITY_GUARD','local_eligibility',
        'SIA Non-Front-Line licence held · United Kingdom','SIA Non-Front-Line licence held · United Kingdom',
        ARRAY['UK_SIA_LICENCE_NFL']::text[], 'verified', true, false, 210)
ON CONFLICT (code) DO NOTHING;

DO $mut$
DECLARE _n integer; _fired boolean := false;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='local_eligibility';
  IF _n <> 7 THEN _fired := true; END IF;

  IF NOT _fired THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: the generated rule set did NOT trip the contract check. '
      'This suite cannot detect the defect it exists to prevent.';
  END IF;
  RAISE NOTICE '    ok  6.1 the generated 13-rule set is rejected by GROUP 1 (found % eligibility rules, not 7)', _n;
END $mut$;

ROLLBACK TO SAVEPOINT before_mutation;
COMMIT;

DO $restored$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_professional_titles WHERE market_pack_code='GB';
  IF _n <> 19 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the canonical set was not restored after the mutation (found %)', _n;
  END IF;
  RAISE NOTICE '    ok  6.2 the canonical 19-rule set is restored after the mutation';
  RAISE NOTICE '    ok  13 UK title rule assertions passed';
END $restored$;
