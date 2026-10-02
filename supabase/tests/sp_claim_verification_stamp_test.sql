-- P1-F (20270115090000): a holder cannot set or change a claim's verification
-- stamp (verified_at, verified_by_user_id).
--
--   VS-F the fixture: holder A with two self-declared claims; holder B; a
--        CQrityjob verifier V. A's selected-merits preview shows no
--        verification time.
--   VS0  REPRODUCTION. Inside a savepoint the pre-fix trigger and policy are
--        restored by running the real rollback file. A writes verified_at on
--        A's own self-declared claim, and A's preview then shows a
--        self-declared claim with a verification time. Rolled back.
--   VS1  that write is refused, as is writing verified_by_user_id, clearing
--        or moving the stamp, and doing it on the second claim; A's ordinary
--        edits of the same claim still work; nothing was stamped.
--   VS2  the legitimate path still stamps: V approves A's claim through
--        sp_verifier_decide and the claim carries V and a time. A then can
--        neither move nor clear that stamp; a non-material correction carries
--        it forward and a material one clears it, as before.
--   VS3  each layer alone refuses: the pre-fix trigger with the new policy,
--        and the new trigger with the pre-fix policy.
--   VS4  the period table, which shares the trigger, is unaffected: A still
--        edits A's own period; B still cannot touch A's claim.
--
-- Synthetic principals; everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub (no JWT claims are set, so the Passport session guard
-- treats these as the SQL-level calls it already admits).

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Run one statement as a principal with the authenticated role.
-- Returns 'ok:<rows>' or 'err:<SQLSTATE>:<message prefix>'.
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

-- A's preview of one claim, as A: '<assertion>|<verified_at present>'.
CREATE OR REPLACE FUNCTION pg_temp.preview(_claim uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _p jsonb; _c jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  _p := public.sp_preview_selected_disclosure(ARRAY[_claim], ARRAY[]::uuid[], 30, 'job_application', 'sv');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  _c := _p->'verified_claims'->0;
  RETURN coalesce(_c->>'assertion', '?') || '|' || ((_c->>'verified_at') IS NOT NULL)::text;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.stamp(_claim uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT assertion_level || '|' || (verified_at IS NOT NULL)::text || '|' || coalesce(verified_by_user_id::text, '-')
    FROM public.sp_claims WHERE id = _claim;
$$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- a holder A; b holder B; v CQrityjob verifier.
INSERT INTO auth.users (id, email) VALUES
  ('0f100000-0000-4000-8000-00000000000a', 'vs-holder-a@test.invalid'),
  ('0f100000-0000-4000-8000-00000000000b', 'vs-holder-b@test.invalid'),
  ('0f100000-0000-4000-8000-00000000000c', 'vs-verifier@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f100000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES
  ('0f100000-0000-4000-8000-00000000000a', 'VS Holder A', 'SE'),
  ('0f100000-0000-4000-8000-00000000000b', 'VS Holder B', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;
-- A1 and A2: A's self-declared credentials. P1: A's employment period.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
                              issued_on, valid_until, assertion_level, lifecycle_state, jurisdiction_code) VALUES
  ('0f100000-3333-4000-8000-0000000000a1', '0f100000-0000-4000-8000-00000000000a', 'licence', 'OV',
   'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'self_declared', 'active', 'SE'),
  ('0f100000-3333-4000-8000-0000000000a2', '0f100000-0000-4000-8000-00000000000a', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', current_date - 200, NULL, 'self_declared', 'active', 'SE');
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state)
VALUES ('0f100000-4444-4000-8000-0000000000a1', '0f100000-0000-4000-8000-00000000000a', 'VS Bevakning AB',
        'Väktare', 'SE', 'full_time', current_date - 400, 'self_declared', 'active');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS-F — two self-declared claims, no stamp'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.stamp('0f100000-3333-4000-8000-0000000000a1') = 'self_declared|false|-'
                  AND pg_temp.stamp('0f100000-3333-4000-8000-0000000000a2') = 'self_declared|false|-',
  'VS-F.1 A''s two claims are self-declared with no verification stamp');
SELECT pg_temp.ok(pg_temp.preview('0f100000-3333-4000-8000-0000000000a1') = 'self_declared|false',
  'VS-F.2 A''s preview shows a self-declared claim with no verification time');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS0 — reproduction: the holder forges a verification time'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270115090000_sp_claim_verification_stamp_rollback.sql
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = ''2026-01-15 10:00+00'' WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') = 'ok:1',
  'VS0.1 PRE-FIX: A writes verified_at on A''s own self-declared claim');
SELECT pg_temp.ok(pg_temp.preview('0f100000-3333-4000-8000-0000000000a1') = 'self_declared|true',
  'VS0.2 PRE-FIX: and A''s preview now shows a self-declared claim WITH a verification time');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS1 — the holder cannot write the stamp'; END $$;
-- =========================================================================
CREATE TEMP TABLE vs1 AS SELECT
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = ''2026-01-15 10:00+00'' WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') AS set_at,
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_by_user_id = ''0f100000-0000-4000-8000-00000000000c'' WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') AS set_by,
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = now(), credential_reference = ''UTB-2026-01'' WHERE id = ''0f100000-3333-4000-8000-0000000000a2''') AS set_with_edit;
SELECT pg_temp.ok((SELECT set_at FROM vs1) LIKE 'err:23514:SP_TRUST_FIELD_IMMUTABLE%',
  'VS1.1 writing verified_at is refused: ' || (SELECT set_at FROM vs1));
SELECT pg_temp.ok((SELECT set_by FROM vs1) LIKE 'err:23514:SP_TRUST_FIELD_IMMUTABLE%',
  'VS1.2 writing verified_by_user_id is refused: ' || (SELECT set_by FROM vs1));
SELECT pg_temp.ok((SELECT set_with_edit FROM vs1) LIKE 'err:23514:SP_TRUST_FIELD_IMMUTABLE%',
  'VS1.3 smuggling it in with an ordinary edit is refused, edit and all: ' || (SELECT set_with_edit FROM vs1));
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET credential_reference = ''OV-12345'' WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') = 'ok:1',
  'VS1.4 A''s ordinary edit of the same claim still works');
SELECT pg_temp.ok(pg_temp.stamp('0f100000-3333-4000-8000-0000000000a1') = 'self_declared|false|-'
                  AND pg_temp.stamp('0f100000-3333-4000-8000-0000000000a2') = 'self_declared|false|-'
                  AND (SELECT credential_reference IS NULL FROM public.sp_claims WHERE id = '0f100000-3333-4000-8000-0000000000a2'),
  'VS1.5 nothing was stamped, and the refused edit left A2 as it was');
SELECT pg_temp.ok(pg_temp.preview('0f100000-3333-4000-8000-0000000000a1') = 'self_declared|false',
  'VS1.6 A''s preview still shows no verification time');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS2 — the verification workflow still stamps, and the stamp is fixed'; END $$;
-- =========================================================================
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_attach_evidence('0f100000-3333-4000-8000-0000000000a1', NULL,
            '0f100000-0000-4000-8000-00000000000a/a1/licence.pdf', 'licence.pdf', 'application/pdf', 1000, NULL);
  _req := public.sp_submit_for_verification('0f100000-3333-4000-8000-0000000000a1', NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-00000000000c', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review', 'Kontrollerat mot original.', NULL, NULL, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.stamp('0f100000-3333-4000-8000-0000000000a1') = 'verified|true|0f100000-0000-4000-8000-00000000000c',
  'VS2.1 V''s approval through sp_verifier_decide stamps the claim with V and a time');
SELECT pg_temp.ok(pg_temp.preview('0f100000-3333-4000-8000-0000000000a1') = 'verified|true',
  'VS2.2 A''s preview shows the verified claim with its verification time');
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = verified_at - interval ''400 days'' WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') LIKE 'err:%'
  AND pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = NULL, verified_by_user_id = NULL WHERE id = ''0f100000-3333-4000-8000-0000000000a1''') LIKE 'err:%'
  AND pg_temp.stamp('0f100000-3333-4000-8000-0000000000a1') = 'verified|true|0f100000-0000-4000-8000-00000000000c',
  'VS2.3 A can neither move nor clear the stamp on the verified claim');
CREATE TEMP TABLE vs2 AS SELECT NULL::uuid AS same, NULL::uuid AS material;
GRANT ALL ON vs2 TO authenticated;
DO $$
DECLARE _c public.sp_claims%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.sp_claims WHERE id = '0f100000-3333-4000-8000-0000000000a1';
  PERFORM set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  UPDATE vs2 SET same = public.sp_correct_claim(_c.id, _c.title, _c.claimed_issuer_name, _c.jurisdiction_code,
                    _c.issued_on, _c.valid_from, _c.valid_until, 'Ingen ändring i sak.', _c.credential_code,
                    _c.credential_reference, _c.holder_note, NULL, NULL, NULL, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.stamp((SELECT same FROM vs2)) = 'verified|true|0f100000-0000-4000-8000-00000000000c',
  'VS2.4 a correction that changes no material fact carries the stamp forward, as before');
DO $$
DECLARE _c public.sp_claims%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.sp_claims WHERE id = (SELECT same FROM vs2);
  PERFORM set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  UPDATE vs2 SET material = public.sp_correct_claim(_c.id, _c.title, _c.claimed_issuer_name, _c.jurisdiction_code,
                    _c.issued_on, _c.valid_from, _c.valid_until + 30, 'Nytt slutdatum.', _c.credential_code,
                    _c.credential_reference, _c.holder_note, NULL, NULL, NULL, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok(pg_temp.stamp((SELECT material FROM vs2)) = 'self_declared|false|-',
  'VS2.5 a material correction (a new expiry date) clears the stamp, as before');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS3 — each layer alone refuses'; END $$;
-- =========================================================================
-- (a) the pre-fix trigger (the real rollback), then the new policy back.
SAVEPOINT layer_a;
\ir ../rollback/20270115090000_sp_claim_verification_stamp_rollback.sql
ALTER POLICY sp_claims_self_update ON public.sp_claims
  WITH CHECK (holder_user_id = auth.uid() AND assertion_level = 'self_declared'
              AND verified_by_user_id IS NULL AND verified_at IS NULL);
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = now() WHERE id = ''0f100000-3333-4000-8000-0000000000a2''') LIKE 'err:42501:%',
  'VS3.1 with the stamp guard removed from the trigger, the policy alone refuses');
ROLLBACK TO SAVEPOINT layer_a;
-- (b) the new trigger, the pre-fix policy.
SAVEPOINT layer_b;
ALTER POLICY sp_claims_self_update ON public.sp_claims
  WITH CHECK (holder_user_id = auth.uid() AND assertion_level = 'self_declared' AND verified_by_user_id IS NULL);
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_claims SET verified_at = now() WHERE id = ''0f100000-3333-4000-8000-0000000000a2''') LIKE 'err:23514:SP_TRUST_FIELD_IMMUTABLE%',
  'VS3.2 with the pre-fix policy, the trigger alone refuses');
ROLLBACK TO SAVEPOINT layer_b;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP VS4 — periods unaffected; other holders still refused'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_experience_periods SET role_title = ''Skyddsvakt'' WHERE id = ''0f100000-4444-4000-8000-0000000000a1''') = 'ok:1',
  'VS4.1 A still edits A''s own period (the period table shares the trigger)');
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_experience_periods SET assertion_level = ''verified'' WHERE id = ''0f100000-4444-4000-8000-0000000000a1''') LIKE 'err:23514:SP_TRUST_FIELD_IMMUTABLE%',
  'VS4.2 and still cannot raise its assertion level');
SELECT pg_temp.ok(
  pg_temp.try_as('0f100000-0000-4000-8000-00000000000b',
    'UPDATE public.sp_claims SET credential_reference = ''x'' WHERE id = ''0f100000-3333-4000-8000-0000000000a2''') = 'ok:0',
  'VS4.3 B still cannot touch A''s claim');

ROLLBACK;
