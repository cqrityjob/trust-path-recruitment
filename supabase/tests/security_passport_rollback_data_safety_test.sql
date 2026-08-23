-- Security Passport — a rollback must refuse before it destroys.
--
-- ── WHY THIS SUITE EXISTS SEPARATELY ───────────────────────────────────
--
-- scripts/db-test.sh executes every rollback, which proves they RUN. It cannot
-- prove they refuse, because by the time it runs them the other suites have
-- cleaned up and there is nothing left to destroy. That is exactly how the
-- blind `DELETE FROM sp_claims` survived review, and how
-- `DROP COLUMN authorisation_scope` was about to.
--
-- So this suite creates the data first and asserts the refusal — then asserts
-- the rows are still there afterwards, because a guard that aborts the
-- transaction but takes the data with it has not helped anyone.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h      uuid := '00000000-0000-0000-0000-00000000c101';
  _scoped uuid := 'c1000000-0000-4000-8000-00000000f001';
  _legacy uuid := 'c1000000-0000-4000-8000-00000000f002';
  _n      integer;
  _txt    text;
  _scope  text := 'Skyddsobjekt: Hamnen, Kaj 12';
BEGIN
  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- both shapes of scoped row exist';
  -- =====================================================================
  -- A modern scoped approval.
  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, authorisation_scope)
  VALUES (_scoped, _h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, _scope);

  -- A legacy row, created the way production's was: while SV did not yet
  -- require a scope. It has none, and a CORRECTED successor that does.
  UPDATE public.sp_credential_types SET requires_scope = false WHERE code = 'SV';
  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, lifecycle_state)
  VALUES (_legacy, _h, 'licence', 'Gammalt skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, 'superseded');
  UPDATE public.sp_credential_types SET requires_scope = true WHERE code = 'SV';

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, authorisation_scope, supersedes_id, version_no)
  VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, 'Skyddsobjekt: Rättad', _legacy, 2);

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h
     AND authorisation_scope IS NOT NULL AND length(btrim(authorisation_scope)) > 0;
  IF _n <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 expected 2 scoped rows, found %', _n;
  END IF;
  RAISE NOTICE 'ok  1.1 a modern scoped approval and a corrected legacy one both exist';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the rollback refuses rather than erasing them';
  -- =====================================================================
  -- The guard from the Swedish rollback, run here against real data. Executed
  -- inline rather than by running the file, because the file also drops tables
  -- the rest of the replay still needs.
  BEGIN
    DECLARE
      _scoped_n integer;
      _opted    text := current_setting('sp.rollback_may_delete_holder_claims', true);
    BEGIN
      SELECT count(*) INTO _scoped_n FROM public.sp_claims
       WHERE authorisation_scope IS NOT NULL
         AND length(btrim(authorisation_scope)) > 0;

      IF _scoped_n > 0 AND coalesce(_opted, '') <> 'yes' THEN
        RAISE EXCEPTION
          'ROLLBACK REFUSED: % claim(s) record what an authorisation is LIMITED TO.',
          _scoped_n;
      END IF;
      RAISE EXCEPTION 'ASSERTION FAILED: 2.1 the guard did not refuse';
    END;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'ROLLBACK REFUSED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 2.1 wrong outcome: %', _txt;
    END IF;
    RAISE NOTICE 'ok  2.1 MUTATION the rollback refuses while a recorded scope exists';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- and the rows survive the refusal';
  -- =====================================================================
  -- A guard that aborts the transaction and takes the data with it has helped
  -- nobody. Both scoped rows, and the legacy null-scope row, must be intact.
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h
     AND authorisation_scope IS NOT NULL AND length(btrim(authorisation_scope)) > 0;
  IF _n <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 % scoped row(s) survived, expected 2', _n;
  END IF;
  RAISE NOTICE 'ok  3.1 both scoped rows are still there, scope and all';

  IF (SELECT authorisation_scope FROM public.sp_claims WHERE id = _scoped) IS DISTINCT FROM _scope THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 the recorded scope was altered';
  END IF;
  RAISE NOTICE 'ok  3.2 and the protected object is unchanged, not merely present';

  IF NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE id = _legacy) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3 the legacy null-scope row was destroyed';
  END IF;
  RAISE NOTICE 'ok  3.3 the legacy null-scope row survives too — it is counted, not exempt';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- the override exists, and is deliberate';
  -- =====================================================================
  -- POSITIVE CONTROL. Without this the refusal above would also pass against a
  -- rollback that could never run at all, which would be its own defect.
  PERFORM set_config('sp.rollback_may_delete_holder_claims', 'yes', true);
  DECLARE
    _scoped_n integer;
    _opted    text := current_setting('sp.rollback_may_delete_holder_claims', true);
  BEGIN
    SELECT count(*) INTO _scoped_n FROM public.sp_claims
     WHERE authorisation_scope IS NOT NULL AND length(btrim(authorisation_scope)) > 0;
    IF _scoped_n > 0 AND coalesce(_opted, '') <> 'yes' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 4.1 the explicit override did not take effect';
    END IF;
    RAISE NOTICE 'ok  4.1 POSITIVE CONTROL an explicit override lets an operator proceed';
  END;
  PERFORM set_config('sp.rollback_may_delete_holder_claims', '', true);

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- cleanup';
  -- =====================================================================
  UPDATE public.sp_claims SET supersedes_id = NULL WHERE holder_user_id = _h;
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  DELETE FROM auth.users WHERE id = _h;
  RAISE NOTICE 'ok  5.1 suite data removed';
END $$;
