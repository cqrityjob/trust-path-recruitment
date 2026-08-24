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

-- Installs exactly what Lovable's rewrite produced -- all 13 rows of it: the
-- six active_title rules it reproduced correctly, the single
-- GB_SIA_ELIGIBLE_NFL it substituted for seven eligibility rules, and the six
-- renamed GB_SIA_EDU_* education rules. An earlier version of this fixture
-- built only 7 rows, which left assertion 1.3 -- "no GB_SIA_EDU_* survive" --
-- with nothing to catch. A mutation that does not reproduce the defect cannot
-- prove the assertions detect it.
--
-- Wrapped in a savepoint so the canonical set is restored whatever happens.
BEGIN;
SAVEPOINT before_mutation;

DELETE FROM public.sp_professional_titles
 WHERE market_pack_code='GB' AND (code LIKE 'GB\_SIA\_ELIG\_%' OR code LIKE 'GB\_SIA\_QUAL\_%'
                                  OR code='GB_SIA_TOP_UP');
INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, output_kind, name_local, name_en,
   requires_credential_codes, requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'GB', 'SECURITY_GUARD', v.output_kind, v.name, v.name,
       ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  ('GB_SIA_ELIGIBLE_NFL', 'local_eligibility',   'SIA Non-Front-Line licence held · United Kingdom',           'UK_SIA_LICENCE_NFL', 210),
  ('GB_SIA_EDU_SG',       'education_completed', 'Licence-linked qualification — Security Guarding',           'UK_SIA_QUAL_SG',     310),
  ('GB_SIA_EDU_DS',       'education_completed', 'Licence-linked qualification — Door Supervision',            'UK_SIA_QUAL_DS',     320),
  ('GB_SIA_EDU_CCTV',     'education_completed', 'Licence-linked qualification — Public Space Surveillance',   'UK_SIA_QUAL_CCTV',   330),
  ('GB_SIA_EDU_CP',       'education_completed', 'Licence-linked qualification — Close Protection',            'UK_SIA_QUAL_CP',     340),
  ('GB_SIA_EDU_CVIT',     'education_completed', 'Licence-linked qualification — Cash and Valuables in Transit','UK_SIA_QUAL_CVIT',  350),
  ('GB_SIA_EDU_TOP_UP',   'education_completed', 'SIA top-up / refresher training completed',                  'UK_SIA_TOP_UP',      360)
) AS v(code, output_kind, name, cred, priority)
ON CONFLICT (code) DO NOTHING;

DO $mut$
DECLARE
  _total integer; _title integer; _elig integer; _edu integer; _stray integer;
  _missed text[] := ARRAY[]::text[];
BEGIN
  SELECT count(*) INTO _total FROM public.sp_professional_titles WHERE market_pack_code='GB';
  SELECT count(*) INTO _title FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='active_title';
  SELECT count(*) INTO _elig FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='local_eligibility';
  SELECT count(*) INTO _edu FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND output_kind='education_completed';
  SELECT count(*) INTO _stray FROM public.sp_professional_titles
   WHERE market_pack_code='GB' AND (code LIKE 'GB\_SIA\_EDU\_%' OR code='GB_SIA_ELIGIBLE_NFL');

  -- The fixture must actually be Lovable's set before anything is concluded
  -- from it. 13 rows, split 6/1/6.
  IF _total <> 13 OR _title <> 6 OR _elig <> 1 OR _edu <> 6 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: the mutation fixture is not Lovable''s 13-rule set '
      '(found %/%/%/% for total/title/eligibility/education). The mutation proof '
      'is meaningless unless it reproduces the real defect.',
      _total, _title, _elig, _edu;
  END IF;

  -- Each GROUP 1 assertion is required to trip. One firing is not enough: the
  -- earlier 7-row fixture tripped the eligibility count while leaving the
  -- GB_SIA_EDU_* check unexercised.
  IF _total = 19 THEN _missed := _missed || 'total-is-19'; END IF;
  IF _title = 6 AND _elig = 7 AND _edu = 6 THEN _missed := _missed || 'split-is-6/7/6'; END IF;
  IF _stray = 0 THEN _missed := _missed || 'no-GB_SIA_EDU_*-or-ELIGIBLE_NFL-present'; END IF;

  IF cardinality(_missed) > 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: the generated rule set did NOT trip every contract check. '
      'Undetected: %. This suite cannot detect the defect it exists to prevent.',
      array_to_string(_missed, ', ');
  END IF;

  RAISE NOTICE '    ok  6.1 the generated 13-rule set trips the total (% <> 19)', _total;
  RAISE NOTICE '    ok  6.2 and the split (%/%/% <> 6/7/6)', _title, _elig, _edu;
  RAISE NOTICE '    ok  6.3 and the non-canonical code check (% GB_SIA_EDU_*/ELIGIBLE_NFL rows present)', _stray;
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
  RAISE NOTICE '    ok  6.4 the canonical 19-rule set is restored after the mutation';
  RAISE NOTICE '    ok  15 UK title rule assertions passed';
END $restored$;
