-- public.cd_outstanding_reviews is operator-only -- behaviour under real RLS.
--
-- Owner decision of 2026-09-14: only platform administrators and explicitly
-- authorised internal testers/operators may read outstanding review gates.
-- Ordinary candidates, employers and other authenticated users must not.
--
-- Everything that asks "may THIS person read THIS" runs as `authenticated`
-- (or `anon`) with a JWT subject set, never as the owner, because the owner
-- can read anything and would prove nothing. Same shape as
-- supabase/tests/jobs_self_publish_test.sql.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

-- Reads the view as `_role` with subject `_sub`; returns the row count, or
-- -1 if the read was refused outright by table privileges.
CREATE OR REPLACE FUNCTION pg_temp.rows_seen(_role text, _sub text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', _role);
  PERFORM set_config('request.jwt.claim.sub', _sub, true);
  BEGIN
    SELECT count(*) INTO _n FROM public.cd_outstanding_reviews;
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    RETURN -1;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- ── Fixtures: one principal per audience the decision names ───────────────

INSERT INTO auth.users (id, email) VALUES
  ('cd010000-0000-0000-0000-000000000001','candidate@outstanding.invalid'),
  ('cd010000-0000-0000-0000-000000000002','employer-a@outstanding.invalid'),
  ('cd010000-0000-0000-0000-000000000003','employer-b@outstanding.invalid'),
  ('cd010000-0000-0000-0000-000000000004','tester@outstanding.invalid'),
  ('cd010000-0000-0000-0000-000000000005','admin@outstanding.invalid'),
  ('cd010000-0000-0000-0000-000000000006','superadmin@outstanding.invalid');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('cd010000-1111-0000-0000-000000000001','Outstanding A AB','outstanding-a','active'),
  ('cd010000-1111-0000-0000-000000000002','Outstanding B AB','outstanding-b','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('cd010000-1111-0000-0000-000000000001','cd010000-0000-0000-0000-000000000002','owner','active',now()),
  ('cd010000-1111-0000-0000-000000000002','cd010000-0000-0000-0000-000000000003','owner','active',now());

-- The two operator shapes, established through the real mechanisms.
INSERT INTO public.cd_internal_testers (user_id) VALUES ('cd010000-0000-0000-0000-000000000004');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('cd010000-0000-0000-0000-000000000005','admin'),
  ('cd010000-0000-0000-0000-000000000006','superadmin');

-- No definition-version fixture is created. The canonical migration history
-- already ships exactly the shape this suite needs: 2026-scd-v3.0.0 sits in
-- internal_test and 2026-scd-v3.1.0 in active, both with uncleared gates. The
-- active one is the trap -- it is the row an ordinary user CAN read on the
-- base table through the permissive "live readable" policy, and therefore the
-- row that security_invoker = true alone would still have exposed through
-- this view. Asserting against real canonical data beats asserting against a
-- fixture invented to make the test pass.

DO $$
DECLARE _total bigint; _live bigint; _n bigint; _opts text;
BEGIN
  SELECT count(*) INTO _total
    FROM public.cd_definition_versions dv
    CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
   WHERE g.value <> 'true'::jsonb;

  SELECT count(*) INTO _live
    FROM public.cd_definition_versions dv
    CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
   WHERE g.value <> 'true'::jsonb
     AND dv.lifecycle_status IN ('pilot','active');

  PERFORM pg_temp.ok(_total > 0, format('CDO0 fixture: %s uncleared gate row(s) exist, %s of them on live instruments', _total, _live));
  PERFORM pg_temp.ok(_live  > 0, 'CDO0b at least one uncleared gate sits on a pilot/active instrument (the trap row)');

  RAISE NOTICE '── Structure ───────────────────────────────────────────────';

  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO _opts
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'cd_outstanding_reviews';
  PERFORM pg_temp.ok(_opts LIKE '%security_invoker=true%',  'CDO1 the view is security_invoker = true');
  PERFORM pg_temp.ok(_opts LIKE '%security_barrier=true%',  'CDO2 the view is security_barrier = true');
  PERFORM pg_temp.ok(
    pg_get_viewdef('public.cd_outstanding_reviews'::regclass, true) LIKE '%cd_is_internal_tester%',
    'CDO3 the operator predicate is in the view body, not merely in a comment');

  -- The contrast case. scp_scoring_version_lineage is DELIBERATELY a definer
  -- view (20260801100000). This suite must never be read as a licence to
  -- "fix" it too, so it asserts that it was left alone.
  PERFORM pg_temp.ok(
    (SELECT coalesce(array_to_string(c.reloptions, ','), '') FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'scp_scoring_version_lineage')
      LIKE '%security_invoker=false%',
    'CDO4 scp_scoring_version_lineage is still deliberately definer -- untouched');

  RAISE NOTICE '── Actor matrix ────────────────────────────────────────────';

  -- 1. Anonymous.
  PERFORM pg_temp.ok(NOT has_table_privilege('anon','public.cd_outstanding_reviews','SELECT'),
                     'CDO5 anon holds no SELECT privilege on the view at all');
  _n := pg_temp.rows_seen('anon', '');
  PERFORM pg_temp.ok(_n = -1, 'CDO6 anonymous  -> refused (permission denied)');

  -- 2. Ordinary candidate.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok(_n = 0, format('CDO7 ordinary candidate -> 0 rows (saw %s)', _n));

  -- 3. Ordinary employer.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000002');
  PERFORM pg_temp.ok(_n = 0, format('CDO8 ordinary employer (tenant A) -> 0 rows (saw %s)', _n));

  -- 4. Cross-tenant employer.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000003');
  PERFORM pg_temp.ok(_n = 0, format('CDO9 cross-tenant employer (tenant B) -> 0 rows (saw %s)', _n));

  -- 5. Internal tester / operator.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000004');
  PERFORM pg_temp.ok(_n = _total,
    format('CDO10 internal tester -> ALL %s gate row(s), including internal_test (saw %s)', _total, _n));

  -- 6. Platform administrator, both role spellings.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000005');
  PERFORM pg_temp.ok(_n = _total, format('CDO11 platform admin -> ALL %s gate row(s) (saw %s)', _total, _n));
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000006');
  PERFORM pg_temp.ok(_n = _total, format('CDO12 superadmin -> ALL %s gate row(s) (saw %s)', _total, _n));

  RAISE NOTICE '── The specific regression this closes ─────────────────────';

  -- CDO13 is the assertion a security_invoker-only fix FAILS. An ordinary
  -- candidate can still read the live instrument on the BASE TABLE (that is
  -- the permissive policy working as designed), which is precisely why the
  -- view needs its own operator predicate on top.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','cd010000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _n FROM public.cd_definition_versions
   WHERE lifecycle_status IN ('pilot','active');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','', true);
  PERFORM pg_temp.ok(_n > 0,
    'CDO13 a candidate still reads live rows on the BASE TABLE -- so invoker alone could not have been the fix');

  -- And yet zero of them reach the view.
  _n := pg_temp.rows_seen('authenticated','cd010000-0000-0000-0000-000000000001');
  PERFORM pg_temp.ok(_n = 0, 'CDO14 ...and none of those live rows reach the candidate through the view');

  -- No principal at all, owner session: the predicate, not RLS, is what refuses.
  SELECT count(*) INTO _n FROM public.cd_outstanding_reviews;
  PERFORM pg_temp.ok(_n = 0, 'CDO15 owner session with no JWT subject -> 0 rows (the body predicate refuses)');

  PERFORM pg_temp.ok(has_table_privilege('authenticated','public.cd_outstanding_reviews','SELECT'),
                     'CDO16 authenticated retains SELECT, so operators are not locked out by privilege');

  RAISE NOTICE '    ok  16 operator-only assertions passed';
END $$;

ROLLBACK;
