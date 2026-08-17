-- =============================================================================
-- Security Passport — Phase 2 database assertions
--
-- Proves the twelve authorisation requirements the owner set for Phase 2,
-- plus the domain-boundary and append-only invariants, against a real
-- replayed database.
--
-- Every access assertion runs as a REAL role with a REAL auth.uid(), so RLS
-- evaluates exactly as it would behind PostgREST. Assertions that must fail
-- are executed and their error text checked — a denial test that merely
-- expects "no rows" cannot tell refusal apart from an empty table.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Runs a statement that MUST fail, and asserts on the message. Runs in a
-- subtransaction so a refusal does not abort the suite.
CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF needle <> '' AND position(lower(needle) IN lower(_msg)) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- failed, but with the wrong error: %', label, _msg;
    END IF;
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 90);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- the statement SUCCEEDED but must be refused', label;
END $$;

-- Counts rows visible to the CURRENT role/uid. Used for isolation checks.
CREATE OR REPLACE FUNCTION pg_temp.visible_count(rel text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s', rel) INTO _n;
  RETURN _n;
END $$;

\echo '==> Security Passport Phase 2'

-- -----------------------------------------------------------------------------
-- Fixtures: two unrelated holders and one employer member.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'holder-a@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'holder-b@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'employer-member@example.test'),
  ('a0000000-0000-0000-0000-000000000004', 'platform-admin@example.test')
ON CONFLICT (id) DO NOTHING;

-- A platform admin, to prove admin is NOT silently unrestricted.
INSERT INTO public.user_roles (user_id, role)
VALUES ('a0000000-0000-0000-0000-000000000004', 'admin')
ON CONFLICT DO NOTHING;

-- Holder A's Passport, written as holder A through RLS.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, cig_profession_slug)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'Holder A (fiktiv)', 'vaktare');

  INSERT INTO public.sp_experience_periods (
    holder_user_id, employer_name, role_title, started_on, ended_on)
  VALUES (
    'a0000000-0000-0000-0000-000000000001', 'Nordvakt (fiktiv)', 'Väktare',
    DATE '2021-01-01', DATE '2024-01-01');

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'training', 'Väktargrundutbildning');

  RESET ROLE;
END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.sp_passport_profiles) = 1,
  'F1 holder A created a Passport through RLS');

-- =============================================================================
-- GROUP 1 — ownership and isolation
-- =============================================================================
\echo '    GROUP 1 -- ownership and isolation'

DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  _n := pg_temp.visible_count('public.sp_passport_profiles');
  PERFORM pg_temp.ok(_n = 1, '1.1 holder A reads their own Passport');
  _n := pg_temp.visible_count('public.sp_claims');
  PERFORM pg_temp.ok(_n = 1, '1.2 holder A reads their own claim');
  RESET ROLE;
END $$;

DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  _n := pg_temp.visible_count('public.sp_passport_profiles');
  PERFORM pg_temp.ok(_n = 0, '1.3 holder B cannot read holder A''s Passport');
  _n := pg_temp.visible_count('public.sp_experience_periods');
  PERFORM pg_temp.ok(_n = 0, '1.4 holder B cannot read holder A''s experience');
  _n := pg_temp.visible_count('public.sp_claims');
  PERFORM pg_temp.ok(_n = 0, '1.5 holder B cannot read holder A''s claims');
  _n := pg_temp.visible_count('public.sp_passport_events');
  PERFORM pg_temp.ok(_n = 0, '1.6 holder B cannot read holder A''s history');
  RESET ROLE;
END $$;

-- An employer member has no Passport access. There is no employer policy at
-- all, which is the point: employer browsing is not a feature that was
-- switched off, it is a feature that does not exist.
DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
  _n := pg_temp.visible_count('public.sp_passport_profiles');
  PERFORM pg_temp.ok(_n = 0, '1.7 employer member cannot browse Passports');
  RESET ROLE;
END $$;

-- Platform admin is NOT silently unrestricted over Passport content.
DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
  PERFORM pg_temp.ok(public.is_platform_admin(auth.uid()),
    '1.8 the fixture admin really is a platform admin');
  _n := pg_temp.visible_count('public.sp_passport_profiles');
  PERFORM pg_temp.ok(_n = 0,
    '1.9 platform admin cannot read Passport content (Phase 3 decision, not a Phase 2 default)');
  RESET ROLE;
END $$;

-- Anonymous sees nothing, and holds no table grant either.
DO $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    _n := pg_temp.visible_count('public.sp_passport_profiles');
    PERFORM pg_temp.ok(_n = 0, '1.10 anon reads no Passport rows');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.ok(true, '1.10 anon has no grant on sp_passport_profiles at all');
  END;
  RESET ROLE;
END $$;

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'sp\_%'),
  '1.11 anon holds no table-level grant on any sp_* table');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname LIKE 'sp\_%'
       AND 'anon' = ANY (SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles))),
  '1.12 no sp_* policy names the anon role');

-- =============================================================================
-- GROUP 2 — trust fields are not the holder's to set
-- =============================================================================
\echo '    GROUP 2 -- trust fields'

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

  -- The headline case: a holder cannot verify themselves.
  PERFORM pg_temp.must_fail(
    'UPDATE public.sp_claims SET assertion_level = ''verified'' '
    || 'WHERE holder_user_id = ''a0000000-0000-0000-0000-000000000001''',
    'SP_TRUST_FIELD_IMMUTABLE',
    '2.1 holder cannot upgrade their own claim to VERIFIED');

  PERFORM pg_temp.must_fail(
    'UPDATE public.sp_claims SET assertion_level = ''document_provided'' '
    || 'WHERE holder_user_id = ''a0000000-0000-0000-0000-000000000001''',
    'SP_TRUST_FIELD_IMMUTABLE',
    '2.2 holder cannot upgrade their own claim to DOCUMENT PROVIDED');

  PERFORM pg_temp.must_fail(
    'UPDATE public.sp_experience_periods SET assertion_level = ''verified'' '
    || 'WHERE holder_user_id = ''a0000000-0000-0000-0000-000000000001''',
    'SP_TRUST_FIELD_IMMUTABLE',
    '2.3 holder cannot upgrade their own experience to VERIFIED');

  -- Inserting a pre-verified claim is refused by the INSERT policy.
  PERFORM pg_temp.must_fail(
    'INSERT INTO public.sp_claims (holder_user_id, claim_type, title, assertion_level) '
    || 'VALUES (''a0000000-0000-0000-0000-000000000001'', ''licence'', ''X'', ''verified'')',
    'row-level security',
    '2.4 holder cannot insert an already-VERIFIED claim');

  -- A lifecycle jump that Phase 2 has no process for is refused.
  PERFORM pg_temp.must_fail(
    'UPDATE public.sp_claims SET lifecycle_state = ''disputed'' '
    || 'WHERE holder_user_id = ''a0000000-0000-0000-0000-000000000001''',
    'SP_LIFECYCLE_TRANSITION_NOT_ALLOWED',
    '2.5 holder cannot move a claim into a Phase 3 lifecycle state');

  RESET ROLE;
END $$;

-- The trigger fires for service_role too. Supabase's service_role carries
-- BYPASSRLS, so a policy alone would leave the trust fields writable by any
-- server-side code that took a shortcut.
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(
    'UPDATE public.sp_claims SET assertion_level = ''verified''',
    'SP_TRUST_FIELD_IMMUTABLE',
    '2.6 even service_role (BYPASSRLS) cannot change assertion_level');
  RESET ROLE;
END $$;

-- Self-verification is refused at row level even for a direct superuser
-- write, because the CHECK constraint has no role.
SELECT pg_temp.must_fail(
  'INSERT INTO public.sp_claims (holder_user_id, claim_type, title, assertion_level, '
  || 'verified_by_user_id, verified_at) VALUES ('
  || '''a0000000-0000-0000-0000-000000000001'', ''licence'', ''Self-verified'', ''verified'', '
  || '''a0000000-0000-0000-0000-000000000001'', now())',
  'sp_claim_no_self_verification',
  '2.7 a claim verified by its own holder is impossible at row level');

SELECT pg_temp.must_fail(
  'INSERT INTO public.sp_claims (holder_user_id, claim_type, title, assertion_level) '
  || 'VALUES (''a0000000-0000-0000-0000-000000000002'', ''licence'', ''Unattributed'', ''verified'')',
  'sp_claim_verified_is_attributed',
  '2.8 a VERIFIED claim with no verifier is impossible at row level');

-- =============================================================================
-- GROUP 3 — history is append-only
-- =============================================================================
\echo '    GROUP 3 -- append-only history'

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  INSERT INTO public.sp_passport_events (
    holder_user_id, actor_user_id, event_type, subject_type, detail)
  VALUES ('a0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001',
          'passport_created', 'profile', '{"source":"test"}'::jsonb);
  RESET ROLE;
END $$;

-- 3.1 and 3.2 run as the suite's own superuser connection: no RLS, no grant
-- limit, every privilege. So the trigger is unambiguously what refuses, which
-- is exactly the guarantee append-only needs.
SELECT pg_temp.must_fail(
  'UPDATE public.sp_passport_events SET detail = ''{}''::jsonb',
  'SP_EVENTS_APPEND_ONLY',
  '3.1 passport history cannot be updated, even by a fully privileged caller');

SELECT pg_temp.must_fail(
  'DELETE FROM public.sp_passport_events',
  'SP_EVENTS_APPEND_ONLY',
  '3.2 passport history cannot be deleted, even by a fully privileged caller');

-- service_role is stopped one step earlier still: it was never granted
-- DELETE. Two independent defences rather than one, and this asserts the
-- outer one is really there.
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.must_fail(
    'DELETE FROM public.sp_passport_events',
    'permission denied',
    '3.3 service_role holds no DELETE grant on history in the first place');
  RESET ROLE;
END $$;

-- Append-only must not block erasure. Production verification caught the
-- first version of the guard refusing the auth.users cascade, which made a
-- holder's account undeletable once they had a Passport. This asserts both
-- halves: erasure works, and a direct delete is still refused.
DO $$
DECLARE _u uuid; _left integer;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (gen_random_uuid(), 'erasure-probe@example.test')
  RETURNING id INTO _u;

  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES (_u, 'erasure probe');
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title) VALUES (_u, 'training', 'probe');
  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type)
  VALUES (_u, _u, 'passport_created', 'profile');

  DELETE FROM auth.users WHERE id = _u;

  SELECT count(*) INTO _left FROM public.sp_passport_events WHERE holder_user_id = _u;
  PERFORM pg_temp.ok(_left = 0, '3.5 deleting the account erases the Passport history with it');
  SELECT count(*) INTO _left FROM public.sp_claims WHERE holder_user_id = _u;
  PERFORM pg_temp.ok(_left = 0, '3.6 deleting the account erases the claims with it');
END $$;

-- A holder cannot forge history for someone else.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_fail(
    'INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type) '
    || 'VALUES (''a0000000-0000-0000-0000-000000000001'', '
    || '''a0000000-0000-0000-0000-000000000002'', ''claim_created'')',
    'row-level security',
    '3.4 holder B cannot append to holder A''s history');
  RESET ROLE;
END $$;

-- =============================================================================
-- GROUP 4 — correction supersedes, never overwrites
-- =============================================================================
\echo '    GROUP 4 -- correction and supersession'

DO $$
DECLARE _claim uuid; _new uuid; _old_state text; _new_ver integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = 'a0000000-0000-0000-0000-000000000001'
     AND lifecycle_state = 'active' LIMIT 1;

  _new := public.sp_correct_claim(
    _claim, 'Väktargrundutbildning (VU1)', 'Nordvakt (fiktiv)', 'SE',
    DATE '2024-02-10', DATE '2024-02-10', NULL, 'typo in title');

  SELECT lifecycle_state INTO _old_state FROM public.sp_claims WHERE id = _claim;
  SELECT version_no INTO _new_ver FROM public.sp_claims WHERE id = _new;

  PERFORM pg_temp.ok(_old_state = 'superseded', '4.1 the corrected claim is superseded, not deleted');
  PERFORM pg_temp.ok(_new_ver = 2, '4.2 the correction is version 2');
  PERFORM pg_temp.ok(
    (SELECT supersedes_id FROM public.sp_claims WHERE id = _new) = _claim,
    '4.3 the new version points at what it replaced');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _new) = 'self_declared',
    '4.4 a correction never upgrades trust');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_passport_events
             WHERE event_type = 'claim_corrected' AND subject_id = _new),
    '4.5 the correction is recorded in history');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = 'a0000000-0000-0000-0000-000000000001') = 2,
    '4.6 both versions still exist');

  RESET ROLE;
END $$;

-- The RPC is SECURITY DEFINER, so its own ownership check is the only guard.
DO $$
DECLARE _claim uuid;
BEGIN
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = 'a0000000-0000-0000-0000-000000000001'
     AND lifecycle_state = 'active' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.sp_correct_claim(%L, ''hijacked'', NULL, ''SE'', NULL, NULL, NULL, ''x'')', _claim),
    'SP_NOT_HOLDER',
    '4.7 holder B cannot correct holder A''s claim through the RPC');
  RESET ROLE;
END $$;

-- =============================================================================
-- GROUP 5 — domain boundaries
-- =============================================================================
\echo '    GROUP 5 -- domain boundaries'

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
     WHERE con.contype = 'f'
       AND src.relname LIKE 'sp\_%'
       AND (tgt.relname LIKE 'scp\_%' OR tgt.relname LIKE 'cd\_%')),
  '5.1 no sp_* foreign key into any scp_* or cd_* table');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'sp\_%'
       AND (p.prosrc LIKE '%scp\_%' ESCAPE '\' OR p.prosrc LIKE '%cd\_%' ESCAPE '\')),
  '5.2 no sp_* function body reads an scp_* or cd_* object');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE 'sp\_%' AND NOT c.relrowsecurity) = 0,
  '5.3 every sp_* table has RLS enabled');

-- Phase 2 must not have quietly created Phase 3+ infrastructure.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND (c.relname LIKE 'sp\_verification%'
         OR c.relname LIKE 'sp\_disclosure%'
         OR c.relname LIKE 'sp\_share%'
         OR c.relname LIKE 'sp\_anchor%'
         OR c.relname LIKE 'sp\_ledger%'
         OR c.relname LIKE 'sp\_proof%')),
  '5.4 no verification, disclosure, share, ledger or proof table exists yet');

-- =============================================================================
-- GROUP 6 — the recognition rule is recorded, and recognitions are not stored
-- =============================================================================
\echo '    GROUP 6 -- recognition policy'

SELECT pg_temp.ok(
  (SELECT threshold_years FROM public.sp_recognition_policies WHERE version = 'v1')
    = ARRAY[1, 3, 5, 10, 15, 20],
  '6.1 the recognition ladder is 1/3/5/10/15/20');

SELECT pg_temp.ok(
  (SELECT basis FROM public.sp_recognition_policies WHERE version = 'v1') = 'verified_elapsed',
  '6.2 recognitions are measured against VERIFIED elapsed time only');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name LIKE 'sp\_%'
       AND (column_name LIKE '%score%' OR column_name LIKE '%rating%'
         OR column_name LIKE '%rank%' OR column_name LIKE '%percentile%'
         OR column_name LIKE '%employab%' OR column_name LIKE '%suitab%')),
  '6.3 no sp_* column can express a score, rating, rank or suitability');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name LIKE 'sp\_%'
       AND (column_name LIKE '%criminal%' OR column_name LIKE '%conviction%'
         OR column_name LIKE '%background_check%' OR column_name LIKE '%belastning%')),
  '6.4 no sp_* column can hold criminal-record or background-check data');

\echo '    ok  Security Passport Phase 2 assertions passed'
