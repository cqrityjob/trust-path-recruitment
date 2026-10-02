-- P1-B (5/5), 20270112090000: employer attestation in the Security Passport
-- requires an ACTIVE organisation.
--
--   PA-F the fixture: holder H asks employer E (active) to confirm an
--        employment period. E's owner sees the request in the attestation
--        queue and may decide it.
--   PA0  REPRODUCTION. E is suspended after the request was filed. Inside a
--        savepoint the pre-fix bodies and policy are restored by running the
--        real rollback file: E's owner still sees the queue and approves the
--        period, which becomes verified. Rolled back.
--   PA1  with E suspended, the queue and the decision are refused exactly as
--        for a non-representative, and the period stays self-declared.
--   PA2  the same for pending, rejected, archived and draft.
--   PA3  reactivation restores the queue and the decision; the CQrityjob
--        review branch of sp_verifier_decide is unaffected throughout.
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

CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql;
    _r := 'ok';
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- h holder; o owner of E; m plain member of E; x owner of another employer;
-- adm platform admin; v CQrityjob verifier.
INSERT INTO auth.users (id, email) VALUES
  ('0f140000-0000-4000-8000-000000000001', 'pa-holder@test.invalid'),
  ('0f140000-0000-4000-8000-000000000002', 'pa-owner@test.invalid'),
  ('0f140000-0000-4000-8000-000000000003', 'pa-member@test.invalid'),
  ('0f140000-0000-4000-8000-000000000009', 'pa-other-owner@test.invalid'),
  ('0f140000-0000-4000-8000-00000000000a', 'pa-admin@test.invalid'),
  ('0f140000-0000-4000-8000-00000000000c', 'pa-verifier@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('0f140000-0000-4000-8000-00000000000a', 'admin'),
  ('0f140000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f140000-1111-4000-8000-000000000001', 'PA Bevakning AB', 'pa-bevakning', 'active'),
  ('0f140000-1111-4000-8000-000000000009', 'PA Annan AB', 'pa-annan', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f140000-1111-4000-8000-000000000001', '0f140000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('0f140000-1111-4000-8000-000000000001', '0f140000-0000-4000-8000-000000000003', 'member', 'active'),
  ('0f140000-1111-4000-8000-000000000009', '0f140000-0000-4000-8000-000000000009', 'owner', 'active');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('0f140000-0000-4000-8000-000000000001', 'PA Holder', 'SE') ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, employment_type, fte_fraction,
   security_relevance, security_fraction, started_on, ended_on)
VALUES ('0f140000-4444-4000-8000-000000000001', '0f140000-0000-4000-8000-000000000001', 'PA Bevakning AB',
        'Security Officer', 'full_time', 1.00, 'primary', 1.00, DATE '2024-01-01', DATE '2025-12-31');

CREATE TEMP TABLE pa(label text PRIMARY KEY, id uuid);
GRANT ALL ON pa TO authenticated;
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f140000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  _req := public.sp_submit_for_verification(NULL, '0f140000-4444-4000-8000-000000000001',
            'employer_attestation', '0f140000-1111-4000-8000-000000000001');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO pa VALUES ('req', _req);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.queue_as(_uid text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text; _q jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    _q := public.sp_employer_attestation_queue('0f140000-1111-4000-8000-000000000001');
    _r := 'rows:' || jsonb_array_length(_q);
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.decide_as(_uid text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.try_as(_uid, format(
    'SELECT public.sp_verifier_decide(%L, ''approved'', ''employer_confirmation'', ''Bekräftat.'', NULL, NULL, NULL)',
    (SELECT id FROM pa WHERE label = 'req')));
$$;
-- The decision, undone: 'ok' or the refusal.
CREATE OR REPLACE FUNCTION pg_temp.probe_decide(_uid text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  BEGIN
    _r := pg_temp.decide_as(_uid);
    RAISE EXCEPTION 'PA_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PA_PROBE_UNDO' THEN _r := 'err:' || split_part(SQLERRM, ':', 1); END IF;
  END;
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT assertion_level FROM public.sp_experience_periods WHERE id = '0f140000-4444-4000-8000-000000000001')
      || '|' || (SELECT status FROM public.sp_verification_requests WHERE id = (SELECT id FROM pa WHERE label = 'req'));
$$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = '0f140000-1111-4000-8000-000000000001';
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f140000-0000-4000-8000-00000000000a', true);
  PERFORM public.moderate_employer('0f140000-1111-4000-8000-000000000001', _action, 'P1-B regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ── PA-F · while E is active ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PA-F -- while E is active its owner attests'; END $$;
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') = 'rows:1',
  'PA-F.1 E''s owner sees the request in the attestation queue');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000003') = 'err:SP_NOT_EMPLOYER_REPRESENTATIVE'
                  AND pg_temp.queue_as('0f140000-0000-4000-8000-000000000009') = 'err:SP_NOT_EMPLOYER_REPRESENTATIVE',
  'PA-F.2 a plain member and another employer''s owner are refused, as before');
SELECT pg_temp.ok(pg_temp.probe_decide('0f140000-0000-4000-8000-000000000002') = 'ok'
                  AND pg_temp.state() = 'self_declared|pending',
  'PA-F.3 E''s owner may decide it (probe undone)');

-- ── PA0 · reproduction on the pre-fix state ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PA0 -- reproduction: a suspended employer attests on the pre-fix state'; END $$;
SELECT pg_temp.moderate('suspended');
SAVEPOINT before_fix;
\ir ../rollback/20270112090000_passport_attestation_active_employer_rollback.sql
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') = 'rows:1',
  'PA0.1 PRE-FIX: the suspended employer''s owner still sees the queue');
CREATE TEMP TABLE pa0 AS SELECT pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') AS decided;
SELECT pg_temp.ok((SELECT decided FROM pa0) = 'ok' AND pg_temp.state() = 'verified|approved',
  'PA0.2 PRE-FIX: and approves the period, which becomes verified');
ROLLBACK TO SAVEPOINT before_fix;

-- ── PA1 · suspended ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PA1 -- a suspended employer cannot attest'; END $$;
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') = 'err:SP_NOT_EMPLOYER_REPRESENTATIVE',
  'PA1.1 the queue is refused as for a non-representative: ' || pg_temp.queue_as('0f140000-0000-4000-8000-000000000002'));
SELECT pg_temp.ok(pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') = 'err:SP_NOT_EMPLOYER_REPRESENTATIVE',
  'PA1.2 the decision is refused as for a non-representative');
SELECT pg_temp.ok(pg_temp.state() = 'self_declared|pending', 'PA1.3 the period stays self-declared and the request pending');

-- ── PA2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PA2 -- pending, rejected, archived and draft'; END $$;
SELECT pg_temp.force_status('pending');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%'
                  AND pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%', 'PA2.1 pending: refused');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%'
                  AND pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%', 'PA2.2 rejected: refused');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%'
                  AND pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%', 'PA2.3 archived: refused');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%'
                  AND pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') LIKE 'err:%', 'PA2.4 draft: refused');
SELECT pg_temp.ok(pg_temp.state() = 'self_declared|pending', 'PA2.5 nothing was decided');
SELECT pg_temp.force_status('suspended');

-- ── PA3 · reactivation ──────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PA3 -- reactivation restores attestation'; END $$;
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(pg_temp.queue_as('0f140000-0000-4000-8000-000000000002') = 'rows:1',
  'PA3.1 the owner sees the queue again');
CREATE TEMP TABLE pa3 AS SELECT pg_temp.decide_as('0f140000-0000-4000-8000-000000000002') AS decided;
SELECT pg_temp.ok((SELECT decided FROM pa3) = 'ok' AND pg_temp.state() = 'verified|approved',
  'PA3.2 and approves the period');
-- The CQrityjob branch: a claim reviewed by a passport verifier is unaffected.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
                              issued_on, valid_until, assertion_level, lifecycle_state, jurisdiction_code)
VALUES ('0f140000-3333-4000-8000-000000000001', '0f140000-0000-4000-8000-000000000001', 'licence', 'OV',
        'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'self_declared', 'active', 'SE');
DO $$
DECLARE _req uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f140000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;
  PERFORM public.sp_attach_evidence('0f140000-3333-4000-8000-000000000001', NULL,
            '0f140000-0000-4000-8000-000000000001/c1/licence.pdf', 'licence.pdf', 'application/pdf', 1000, NULL);
  _req := public.sp_submit_for_verification('0f140000-3333-4000-8000-000000000001', NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  INSERT INTO pa VALUES ('cq', _req);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
CREATE TEMP TABLE pa_cq AS SELECT pg_temp.try_as('0f140000-0000-4000-8000-00000000000c', format(
    'SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)',
    (SELECT id FROM pa WHERE label = 'cq'))) AS decided;
SELECT pg_temp.ok((SELECT decided FROM pa_cq) = 'ok'
  AND (SELECT assertion_level FROM public.sp_claims WHERE id = '0f140000-3333-4000-8000-000000000001') = 'verified',
  'PA3.3 the CQrityjob review branch of sp_verifier_decide is unaffected');

ROLLBACK;
