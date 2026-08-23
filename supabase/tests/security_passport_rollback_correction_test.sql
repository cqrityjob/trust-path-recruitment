-- Security Passport -- the correction path survives a Phase A rollback
-- ===========================================================================
-- Phase A's 35 rollback assertions check SHAPE: columns dropped, tables gone,
-- credentials removed. All 35 passed against a rollback that left holders
-- unable to correct their own records, because nothing asked whether the
-- functions that SURVIVED the rollback could still run.
--
-- The forward migration 20260907091000 drops the pre-Phase-A 13-argument
-- sp_correct_claim and creates a 15-argument one reading
-- _old.authorisation_scope and _old.sub_jurisdiction_code from an
-- sp_claims%ROWTYPE. Its rollback dropped those columns. plpgsql resolves
-- record fields at execution, so the mismatch is invisible until a real holder
-- corrects a real claim:
--
--   ERROR: record "_old" has no field "sub_jurisdiction_code"
--
-- This suite runs in two phases against the same database and the same rows,
-- selected with -v phase=before|after:
--
--   before -- immediately before the rollback chain, with Phase A applied.
--             Creates a holder and TWO active claims. Corrects claim A through
--             the Phase A path, proving the forward correction works. Leaves
--             claim B active and untouched.
--   after  -- immediately after all 7 rollbacks. Corrects claim B -- a real
--             row that predates the rollback -- and proves the restored
--             function is the pre-Phase-A one and reads no removed column.
--
-- Claim B is the point. Correcting a row created after the rollback would
-- prove much less: the defect is about pre-existing holder records.

\set ON_ERROR_STOP on
\if :{?phase}
\else
  \echo 'FAIL: this suite requires -v phase=before or -v phase=after'
  \quit 1
\endif

-- psql does not interpolate :'phase' inside a dollar-quoted body, so the phase
-- travels as a session setting the DO block reads back.
SELECT set_config('sp.rollback_correction_phase', :'phase', false);

DO $rbc$
DECLARE
  _phase    text := current_setting('sp.rollback_correction_phase');
  _h        uuid := '00000000-0000-0000-0000-0000000c0ff1';
  _a        uuid := '00000000-0000-0000-0000-0000000c0ffa';
  _b        uuid := '00000000-0000-0000-0000-0000000c0ffb';
  _new      uuid;
  _nargs    integer;
  _bad      text;
  _state    text;
BEGIN
IF _phase = 'before' THEN
  RAISE NOTICE 'GROUP 1 -- a real holder with two correctable claims, Phase A applied';

  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;

  INSERT INTO public.sp_claims (id, holder_user_id, claim_type, title, credential_code,
                                jurisdiction_code, lifecycle_state)
  VALUES (_a, _h, 'training', 'VU1 corrected while Phase A is applied', 'VU1', 'SE', 'active'),
         (_b, _h, 'training', 'VU1 that must outlive the rollback',     'VU1', 'SE', 'active');
  RAISE NOTICE '    ok  two active claims exist';

  RAISE NOTICE 'GROUP 2 -- the Phase A correction path works';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  SELECT public.sp_correct_claim(
    _a, 'VU1 corrected while Phase A is applied (rev)', 'Utbildare', 'SE',
    NULL, NULL, NULL, 'forward-path probe', 'VU1', NULL, NULL, NULL, NULL) INTO _new;
  RESET ROLE;

  IF _new IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the Phase A correction returned no new claim';
  END IF;

  SELECT lifecycle_state INTO _state FROM public.sp_claims WHERE id = _a;
  IF _state <> 'superseded' THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: the corrected claim is %, expected superseded', _state;
  END IF;
  RAISE NOTICE '    ok  correction succeeded and superseded the original';

  SELECT lifecycle_state INTO _state FROM public.sp_claims WHERE id = _b;
  IF _state <> 'active' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: claim B is % before the rollback, expected active', _state;
  END IF;
  RAISE NOTICE '    ok  claim B is still active and will be corrected after the rollback';

ELSIF _phase = 'after' THEN
  RAISE NOTICE 'GROUP 3 -- after all 7 rollbacks, the pre-Phase-A signature is back';

  SELECT count(*) INTO _nargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_correct_claim';
  IF _nargs <> 1 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % sp_correct_claim overload(s) survive the rollback; '
      'two overloads differing only in defaulted trailing arguments make every '
      'legacy call ambiguous', _nargs;
  END IF;

  SELECT p.pronargs INTO _nargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_correct_claim';
  IF _nargs <> 13 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: sp_correct_claim has % arguments after rollback, '
      'expected the pre-Phase-A 13', _nargs;
  END IF;
  RAISE NOTICE '    ok  exactly one overload, at 13 arguments';

  RAISE NOTICE 'GROUP 4 -- no surviving function reads a column the rollback removed';
  SELECT string_agg(p.proname || '/' || p.pronargs, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.prosrc LIKE '%authorisation_scope%'
       OR p.prosrc LIKE '%sub_jurisdiction_code%');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: function(s) % still read authorisation_scope or '
      'sub_jurisdiction_code, which the rollback dropped. They will fail at '
      'run time, not at definition time.', _bad;
  END IF;
  RAISE NOTICE '    ok  nothing reads authorisation_scope or sub_jurisdiction_code';

  RAISE NOTICE 'GROUP 5 -- and a real pre-existing claim can still be corrected';
  SELECT lifecycle_state INTO _state FROM public.sp_claims WHERE id = _b;
  IF _state IS NULL THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: claim B did not survive the rollback -- the GROUP 5 '
      'assertion cannot run, and a correction path that is never exercised '
      'must fail this suite rather than be reported as passing';
  END IF;
  IF _state <> 'active' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: claim B is % after rollback, expected active', _state;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- The 13-argument shape: exactly what the pre-Phase-A application sends.
  SELECT public.sp_correct_claim(
    _b, 'VU1 that must outlive the rollback (rev)', 'Utbildare', 'SE',
    NULL, NULL, NULL, 'post-rollback probe', 'VU1', NULL, NULL, NULL, NULL) INTO _new;
  RESET ROLE;

  IF _new IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: the post-rollback correction returned no new claim';
  END IF;

  SELECT lifecycle_state INTO _state FROM public.sp_claims WHERE id = _b;
  IF _state <> 'superseded' THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: after rollback the corrected claim is %, expected superseded',
      _state;
  END IF;
  RAISE NOTICE '    ok  a claim created before the rollback is still correctable';

  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  RAISE NOTICE '    ok  4 post-rollback correction assertions passed';

ELSE
  RAISE EXCEPTION 'unknown phase %, expected before or after', _phase;
END IF;
END $rbc$;
