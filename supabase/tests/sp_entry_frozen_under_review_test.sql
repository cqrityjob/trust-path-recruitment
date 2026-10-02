-- P1-H (20270118090000): a Passport entry under review cannot change
-- underneath the reviewer.
--
--   ER-F the fixture: holder A with self-declared periods and a credential;
--        holder B; a CQrityjob verifier V.
--   ER0  REPRODUCTION. Inside a savepoint the guard is removed with the real
--        rollback. A submits a period, then moves its start ten years back
--        and renames the role while it is pending; V approves; the period is
--        verified with content nobody reviewed. Rolled back.
--   ER1  with the guard, the same edit is refused (SP_ENTRY_UNDER_REVIEW) and
--        V's approval verifies the content A submitted.
--   ER2  the same holds for a claim (a credential's validity).
--   ER3  a clarification request: A may correct the entry, the request goes
--        back to 'pending', and a second edit is then refused until V decides.
--   ER4  with no open request (none, or withdrawn) A edits freely; B still
--        cannot touch A's entries; the helper answers nothing about B's.
--   ER5  the helper is not callable by anon.
--
-- Synthetic principals; everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub (no JWT claims, so the Passport session guard treats
-- these as the SQL-level calls it already admits).

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _r := 'ok:' || _n;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- Submit as A; decide as V. Return the request id / nothing.
CREATE OR REPLACE FUNCTION pg_temp.submit(_claim uuid, _period uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _r uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f180000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  _r := public.sp_submit_for_verification(_claim, _period, 'cqrityjob_review', NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.decide(_req uuid, _decision text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f180000-0000-4000-8000-00000000000c', true);
  SET LOCAL ROLE authenticated;
  IF _decision = 'approved' THEN
    PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review', 'Kontrollerat.', NULL, NULL, NULL);
  ELSE
    PERFORM public.sp_verifier_decide(_req, 'clarification_requested', NULL, NULL, 'Ange korrekt startdatum.', NULL, NULL);
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.period(_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT assertion_level || '|' || (current_date - started_on) || '|' || role_title
    FROM public.sp_experience_periods WHERE id = _id;
$$;
CREATE OR REPLACE FUNCTION pg_temp.req(_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.sp_verification_requests WHERE id = _id;
$$;

-- ── Cast ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('0f180000-0000-4000-8000-00000000000a', 'er-holder-a@test.invalid'),
  ('0f180000-0000-4000-8000-00000000000b', 'er-holder-b@test.invalid'),
  ('0f180000-0000-4000-8000-00000000000c', 'er-verifier@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f180000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES
  ('0f180000-0000-4000-8000-00000000000a', 'ER Holder A', 'SE'),
  ('0f180000-0000-4000-8000-00000000000b', 'ER Holder B', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state)
SELECT p.id, '0f180000-0000-4000-8000-00000000000a', 'ER Bevakning AB', 'Väktare', 'SE', 'full_time',
       current_date - 400, 'self_declared', 'active'
  FROM (VALUES ('0f180000-4444-4000-8000-0000000000a1'::uuid), ('0f180000-4444-4000-8000-0000000000a2'),
               ('0f180000-4444-4000-8000-0000000000a3'), ('0f180000-4444-4000-8000-0000000000a4')) p(id);
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state)
VALUES ('0f180000-4444-4000-8000-0000000000b1', '0f180000-0000-4000-8000-00000000000b', 'ER Annan AB', 'Väktare',
        'SE', 'full_time', current_date - 100, 'self_declared', 'active');
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
                              issued_on, valid_until, assertion_level, lifecycle_state, jurisdiction_code)
VALUES ('0f180000-3333-4000-8000-0000000000a1', '0f180000-0000-4000-8000-00000000000a', 'licence', 'OV',
        'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365,
        'self_declared', 'active', 'SE');
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f180000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_attach_evidence('0f180000-3333-4000-8000-0000000000a1', NULL,
            '0f180000-0000-4000-8000-00000000000a/a1/licence.pdf', 'licence.pdf', 'application/pdf', 1000, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.period('0f180000-4444-4000-8000-0000000000a1') = 'self_declared|400|Väktare',
  'ER-F A''s periods are self-declared, started 400 days ago');

CREATE OR REPLACE FUNCTION pg_temp.forge_sql(_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('UPDATE public.sp_experience_periods SET started_on = started_on - 3650, role_title = ''Säkerhetschef'' WHERE id = %L', _id);
$$;

-- ── ER0 reproduction: no guard ───────────────────────────────────────────
SAVEPOINT pre_fix;
\ir ../rollback/20270118090000_sp_entry_frozen_under_review_rollback.sql
CREATE TEMP TABLE er0 AS SELECT pg_temp.submit(NULL, '0f180000-4444-4000-8000-0000000000a1') AS req;
CREATE TEMP TABLE er0b AS SELECT pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  pg_temp.forge_sql('0f180000-4444-4000-8000-0000000000a1')) AS r;
SELECT pg_temp.decide((SELECT req FROM er0), 'approved');
SELECT pg_temp.ok((SELECT r FROM er0b) = 'ok:1'
  AND pg_temp.period('0f180000-4444-4000-8000-0000000000a1') = 'verified|4050|Säkerhetschef',
  'ER0.1 REPRODUCTION: pre-fix, A rewrites the period while it is pending and V''s approval verifies the rewrite');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── ER1 the period is frozen while pending ───────────────────────────────
CREATE TEMP TABLE er1 AS SELECT pg_temp.submit(NULL, '0f180000-4444-4000-8000-0000000000a1') AS req;
CREATE TEMP TABLE er1b AS SELECT pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  pg_temp.forge_sql('0f180000-4444-4000-8000-0000000000a1')) AS r;
SELECT pg_temp.ok((SELECT r FROM er1b) LIKE 'err:23514:SP_ENTRY_UNDER_REVIEW%',
  'ER1.1 A''s edit of a pending period is refused: ' || (SELECT r FROM er1b));
SELECT pg_temp.ok(pg_temp.period('0f180000-4444-4000-8000-0000000000a1') = 'self_declared|400|Väktare'
  AND pg_temp.req((SELECT req FROM er1)) = 'pending',
  'ER1.2 the period is unchanged and still pending');
SELECT pg_temp.decide((SELECT req FROM er1), 'approved');
SELECT pg_temp.ok(pg_temp.period('0f180000-4444-4000-8000-0000000000a1') = 'verified|400|Väktare',
  'ER1.3 V''s approval verifies exactly what A submitted');

-- ── ER2 a claim under review is frozen too ───────────────────────────────
CREATE TEMP TABLE er2 AS SELECT pg_temp.submit('0f180000-3333-4000-8000-0000000000a1', NULL) AS req;
CREATE TEMP TABLE er2b AS SELECT pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  'UPDATE public.sp_claims SET valid_until = DATE ''2199-12-31'' WHERE id = ''0f180000-3333-4000-8000-0000000000a1''') AS r;
SELECT pg_temp.ok((SELECT r FROM er2b) LIKE 'err:23514:SP_ENTRY_UNDER_REVIEW%'
  AND (SELECT valid_until = current_date + 365 FROM public.sp_claims WHERE id = '0f180000-3333-4000-8000-0000000000a1'),
  'ER2.1 A''s edit of a pending claim''s validity is refused and the claim is unchanged: ' || (SELECT r FROM er2b));

-- ── ER3 a clarification is answered by editing, and returns to review ────
CREATE TEMP TABLE er3 AS SELECT pg_temp.submit(NULL, '0f180000-4444-4000-8000-0000000000a2') AS req;
SELECT pg_temp.decide((SELECT req FROM er3), 'clarification');
SELECT pg_temp.ok(pg_temp.req((SELECT req FROM er3)) = 'clarification_requested',
  'ER3.1 V asks A for a clarification');
CREATE TEMP TABLE er3b AS SELECT pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  'UPDATE public.sp_experience_periods SET started_on = current_date - 380 WHERE id = ''0f180000-4444-4000-8000-0000000000a2''') AS r;
SELECT pg_temp.ok((SELECT r FROM er3b) = 'ok:1'
  AND pg_temp.req((SELECT req FROM er3)) = 'pending',
  'ER3.2 A corrects the period, and the request is back in review');
CREATE TEMP TABLE er3c AS SELECT pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  pg_temp.forge_sql('0f180000-4444-4000-8000-0000000000a2')) AS r;
SELECT pg_temp.ok((SELECT r FROM er3c) LIKE 'err:23514:SP_ENTRY_UNDER_REVIEW%',
  'ER3.3 a second edit while it is back in review is refused');
SELECT pg_temp.decide((SELECT req FROM er3), 'approved');
SELECT pg_temp.ok(pg_temp.period('0f180000-4444-4000-8000-0000000000a2') = 'verified|380|Väktare',
  'ER3.4 V verifies the corrected content, the one V reviewed');

-- ── ER4 no open request: free edits; nobody else's ───────────────────────
SELECT pg_temp.ok(pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
  'UPDATE public.sp_experience_periods SET role_title = ''Skyddsvakt'' WHERE id = ''0f180000-4444-4000-8000-0000000000a3''') = 'ok:1',
  'ER4.1 with no request A edits A''s own period');
CREATE TEMP TABLE er4 AS SELECT pg_temp.submit(NULL, '0f180000-4444-4000-8000-0000000000a4') AS req;
DO $$
DECLARE _req uuid := (SELECT req FROM er4);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f180000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_withdraw_verification_request(_req);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.req((SELECT req FROM er4)) = 'withdrawn'
  AND pg_temp.try_as('0f180000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_experience_periods SET role_title = ''Skyddsvakt'' WHERE id = ''0f180000-4444-4000-8000-0000000000a4''') = 'ok:1',
  'ER4.2 after withdrawing the request A edits the period again');
SELECT pg_temp.ok(pg_temp.try_as('0f180000-0000-4000-8000-00000000000b',
  pg_temp.forge_sql('0f180000-4444-4000-8000-0000000000a3')) = 'ok:0',
  'ER4.3 B still updates none of A''s periods');
CREATE TEMP TABLE er4c AS SELECT pg_temp.submit(NULL, '0f180000-4444-4000-8000-0000000000a3') AS req;
SELECT pg_temp.decide((SELECT req FROM er4c), 'clarification');
DO $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f180000-0000-4000-8000-00000000000b', true);
  SET LOCAL ROLE authenticated;
  _r := public.sp_entry_review_on_holder_edit(NULL, '0f180000-4444-4000-8000-0000000000a3');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_temp.ok(_r IS NULL AND pg_temp.req((SELECT req FROM er4c)) = 'clarification_requested',
    'ER4.4 the helper tells B nothing about A''s entry and moves none of A''s requests');
END $$;

-- ── ER5 privileges ───────────────────────────────────────────────────────
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_entry_review_on_holder_edit(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sp_guard_entry_under_review()', 'EXECUTE'),
  'ER5.1 anon cannot call the helper, and no client calls the trigger function');

ROLLBACK;
