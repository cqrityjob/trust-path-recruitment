-- The manual retention routines in docs/legal/retention-runbook-v1.md, run as
-- written on synthetic data. The statements are the files in supabase/retention/,
-- read here with `cat` (psql runs from the repository root, as scripts/db-test.sh
-- does), so the runbook cannot describe one thing and the test prove another
-- (launch-legal:check holds the runbook to those files).
--
--   RT1  feedback dry run   counts exactly the rows older than 12 months, in both
--                           tables, and changes nothing
--   RT2  feedback delete    removes exactly those rows, reports the same numbers,
--                           and leaves a row from 11 months ago and from today
--   RT3  inactive accounts  lists exactly the accounts with no sign-in for 24
--                           months (and never-signed-in accounts created that long
--                           ago), oldest first, and nothing else
--   RT4  a second run       is a no-op

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

-- ── fixture ────────────────────────────────────────────────────────────────
-- (idempotent: a run that failed half way leaves nothing behind for the next one)
DELETE FROM public.beta_feedback WHERE id::text LIKE 'c1000000-%';
DELETE FROM public.cd_test_feedback WHERE id::text LIKE 'c2000000-%';
DELETE FROM auth.users WHERE id::text LIKE 'c3000000-%';
INSERT INTO public.beta_feedback (id, category, message, created_at) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'bug',   'synthetic, 13 months old', now() - interval '13 months'),
  ('c1000000-0000-0000-0000-000000000002', 'idea',  'synthetic, 25 months old', now() - interval '25 months'),
  ('c1000000-0000-0000-0000-000000000003', 'other', 'synthetic, 11 months old', now() - interval '11 months'),
  ('c1000000-0000-0000-0000-000000000004', 'bug',   'synthetic, today',         now());

INSERT INTO public.cd_test_feedback (id, locale, free_text, submitted_at) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'sv', 'synthetic, 14 months old', now() - interval '14 months'),
  ('c2000000-0000-0000-0000-000000000002', 'en', 'synthetic, 11 months old', now() - interval '11 months'),
  ('c2000000-0000-0000-0000-000000000003', 'sv', 'synthetic, today',         now());

INSERT INTO auth.users (id, email, created_at, last_sign_in_at) VALUES
  ('c3000000-0000-0000-0000-000000000001', 'rt-old-signin@retention.test',   now() - interval '40 months', now() - interval '25 months'),
  ('c3000000-0000-0000-0000-000000000002', 'rt-never-old@retention.test',    now() - interval '30 months', NULL),
  ('c3000000-0000-0000-0000-000000000003', 'rt-active@retention.test',       now() - interval '40 months', now() - interval '2 months'),
  ('c3000000-0000-0000-0000-000000000004', 'rt-new-never@retention.test',    now() - interval '1 month',   NULL),
  ('c3000000-0000-0000-0000-000000000005', 'rt-23-months@retention.test',    now() - interval '40 months', now() - interval '23 months');

-- ── RT1 · the dry run ──────────────────────────────────────────────────────
\set dry `cat supabase/retention/feedback-12-months.dry-run.sql`
CREATE TEMP TABLE rt_dry AS :dry ;

DO $$
DECLARE _b bigint; _t bigint; _before bigint;
BEGIN
  -- Rows other than ours may exist in a shared database; the dry run counts
  -- every one older than 12 months, so compare it with the table itself.
  SELECT due INTO _b FROM rt_dry WHERE source = 'beta_feedback';
  SELECT due INTO _t FROM rt_dry WHERE source = 'cd_test_feedback';
  IF _b <> (SELECT count(*) FROM public.beta_feedback WHERE created_at < now() - interval '12 months') THEN
    RAISE EXCEPTION 'RT1.1 FAIL: dry run counted % beta rows', _b;
  END IF;
  IF _t <> (SELECT count(*) FROM public.cd_test_feedback WHERE submitted_at < now() - interval '12 months') THEN
    RAISE EXCEPTION 'RT1.2 FAIL: dry run counted % test rows', _t;
  END IF;
  IF _b < 2 OR _t < 1 THEN
    RAISE EXCEPTION 'RT1.3 FAIL: the dry run missed the synthetic rows (% / %)', _b, _t;
  END IF;
  SELECT count(*) INTO _before FROM public.beta_feedback WHERE id::text LIKE 'c1000000-%';
  IF _before <> 4 THEN RAISE EXCEPTION 'RT1.4 FAIL: the dry run changed a table (% synthetic beta rows)', _before; END IF;
  RAISE NOTICE 'ok  RT1 the dry run counts exactly what is older than 12 months and changes nothing';
END $$;

-- ── RT2 · the delete ───────────────────────────────────────────────────────
\set del `cat supabase/retention/feedback-12-months.delete.sql`
CREATE TEMP TABLE rt_del AS :del ;

DO $$
DECLARE _b bigint; _t bigint;
BEGIN
  SELECT due INTO _b FROM rt_dry WHERE source = 'beta_feedback';
  SELECT due INTO _t FROM rt_dry WHERE source = 'cd_test_feedback';
  IF (SELECT beta_feedback_deleted FROM rt_del) <> _b OR (SELECT cd_test_feedback_deleted FROM rt_del) <> _t THEN
    RAISE EXCEPTION 'RT2.1 FAIL: the delete reported % / % but the dry run said % / %',
      (SELECT beta_feedback_deleted FROM rt_del), (SELECT cd_test_feedback_deleted FROM rt_del), _b, _t;
  END IF;
  IF EXISTS (SELECT 1 FROM public.beta_feedback WHERE id IN
       ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002'))
     OR EXISTS (SELECT 1 FROM public.cd_test_feedback WHERE id = 'c2000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'RT2.2 FAIL: a row older than 12 months survived';
  END IF;
  IF (SELECT count(*) FROM public.beta_feedback WHERE id IN
        ('c1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000004')) <> 2
     OR (SELECT count(*) FROM public.cd_test_feedback WHERE id IN
        ('c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000003')) <> 2 THEN
    RAISE EXCEPTION 'RT2.3 FAIL: a row younger than 12 months was deleted';
  END IF;
  RAISE NOTICE 'ok  RT2 the delete removes exactly the rows the dry run counted and keeps the 11-month and today rows';
END $$;

-- ── RT4 · a second run is a no-op ──────────────────────────────────────────
CREATE TEMP TABLE rt_del2 AS :del ;

DO $$
BEGIN
  IF (SELECT beta_feedback_deleted + cd_test_feedback_deleted FROM rt_del2) <> 0 THEN
    RAISE EXCEPTION 'RT4.1 FAIL: a second run deleted rows';
  END IF;
  RAISE NOTICE 'ok  RT4 a second run deletes nothing';
END $$;

-- ── RT3 · inactive accounts ────────────────────────────────────────────────
\set inactive `cat supabase/retention/inactive-accounts-24-months.list.sql`
CREATE TEMP TABLE rt_inactive AS :inactive ;

DO $$
DECLARE _ids text;
BEGIN
  SELECT string_agg(id::text, ',' ORDER BY inactive_since) INTO _ids
    FROM rt_inactive WHERE id::text LIKE 'c3000000-%';
  IF _ids IS DISTINCT FROM 'c3000000-0000-0000-0000-000000000002,c3000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'RT3.1 FAIL: the list was %, expected the never-signed-in 30-month account then the 25-month one', _ids;
  END IF;
  IF EXISTS (SELECT 1 FROM rt_inactive WHERE id IN
      ('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000005')) THEN
    RAISE EXCEPTION 'RT3.2 FAIL: an active, new or 23-month account is on the list';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE id::text LIKE 'c3000000-%') <> 5 THEN
    RAISE EXCEPTION 'RT3.3 FAIL: the list changed accounts';
  END IF;
  RAISE NOTICE 'ok  RT3 the inactive-account list holds exactly the accounts silent for 24 months, oldest first, and changes nothing';
END $$;

-- ── clean up the synthetic rows ────────────────────────────────────────────
DELETE FROM public.beta_feedback WHERE id::text LIKE 'c1000000-%';
DELETE FROM public.cd_test_feedback WHERE id::text LIKE 'c2000000-%';
DELETE FROM auth.users WHERE id::text LIKE 'c3000000-%';
