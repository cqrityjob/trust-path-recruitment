-- P1-E (20270114090000): a Passport request or evidence row names exactly one
-- entry, and it is the holder's own.
--
--   TH-F the fixture: holder A with a claim and a period, holder B with a
--        period, a CQrityjob verifier V.
--   TH0  REPRODUCTION. Inside a savepoint the pre-fix functions and tables are
--        restored by running the real rollback file. A names A's own claim and
--        B's period: A's file is attached to B's period, a review is opened on
--        B's period, B's own submission is then refused as already open, and
--        V's approval records a CQrityjob approval against B's period, after
--        which B's period can be revoked. Rolled back.
--   TH1  both calls are refused as ambiguous; nothing is written; B submits
--        B's own period normally.
--   TH2  sp_raise_dispute and sp_verifier_revoke refuse two entries too.
--   TH3  the table layer alone refuses, with the pre-fix functions back:
--        evidence or a request on another holder's entry violates the
--        same-holder foreign key, and a row naming two entries violates the
--        one-target check.
--   TH4  every legitimate call still works: evidence and review on one's own
--        claim, on one's own period; a dispute; a revoke by V.
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

-- Run one statement as a principal ('' = the table owner, no role switch).
-- Returns 'ok' or 'err:<SQLSTATE>:<message prefix>'.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  IF _uid <> '' THEN SET LOCAL ROLE authenticated; END IF;
  BEGIN
    EXECUTE _sql;
    _r := 'ok';
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- a holder A (attacker); b holder B (victim); v CQrityjob verifier.
INSERT INTO auth.users (id, email) VALUES
  ('0f120000-0000-4000-8000-00000000000a', 'th-holder-a@test.invalid'),
  ('0f120000-0000-4000-8000-00000000000b', 'th-holder-b@test.invalid'),
  ('0f120000-0000-4000-8000-00000000000c', 'th-verifier@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f120000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES
  ('0f120000-0000-4000-8000-00000000000a', 'TH Holder A', 'SE'),
  ('0f120000-0000-4000-8000-00000000000b', 'TH Holder B', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
                              issued_on, valid_until, assertion_level, lifecycle_state, jurisdiction_code) VALUES
  ('0f120000-3333-4000-8000-0000000000a1', '0f120000-0000-4000-8000-00000000000a', 'licence', 'OV',
   'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'self_declared', 'active', 'SE');
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state) VALUES
  ('0f120000-4444-4000-8000-0000000000a1', '0f120000-0000-4000-8000-00000000000a', 'TH Bevakning A',
   'Väktare', 'SE', 'full_time', current_date - 400, 'self_declared', 'active'),
  ('0f120000-4444-4000-8000-0000000000b1', '0f120000-0000-4000-8000-00000000000b', 'TH Bevakning B',
   'Väktare', 'SE', 'full_time', current_date - 900, 'self_declared', 'active');

-- The two attacker calls: A's own claim, B's period.
CREATE OR REPLACE FUNCTION pg_temp.plant_evidence() RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(''0f120000-3333-4000-8000-0000000000a1'', ''0f120000-4444-4000-8000-0000000000b1'',
       ''0f120000-0000-4000-8000-00000000000a/x/planted.pdf'', ''planted.pdf'', ''application/pdf'', 1000, NULL)');
$$;
CREATE OR REPLACE FUNCTION pg_temp.plant_request() RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_submit_for_verification(''0f120000-3333-4000-8000-0000000000a1'', ''0f120000-4444-4000-8000-0000000000b1'',
       ''cqrityjob_review'', NULL)');
$$;
CREATE OR REPLACE FUNCTION pg_temp.on_b_period() RETURNS text LANGUAGE sql AS $$
  SELECT format('evidence:%s|requests:%s|assertion:%s',
    (SELECT count(*) FROM public.sp_evidence WHERE period_id = '0f120000-4444-4000-8000-0000000000b1'),
    (SELECT count(*) FROM public.sp_verification_requests WHERE period_id = '0f120000-4444-4000-8000-0000000000b1'),
    (SELECT assertion_level FROM public.sp_experience_periods WHERE id = '0f120000-4444-4000-8000-0000000000b1'));
$$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH-F — B''s period is untouched'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.on_b_period() = 'evidence:0|requests:0|assertion:self_declared',
  'TH-F.1 B''s period has no evidence, no request, and is self-declared');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH0 — reproduction: A attaches to and verifies B''s period'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270114090000_sp_passport_target_holder_rollback.sql
SELECT pg_temp.ok(pg_temp.plant_evidence() = 'ok' AND pg_temp.plant_request() = 'ok'
                  AND pg_temp.on_b_period() = 'evidence:1|requests:1|assertion:self_declared',
  'TH0.1 PRE-FIX: naming A''s claim and B''s period, A attaches a file to B''s period and opens a review on it');
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000b',
    'SELECT public.sp_submit_for_verification(NULL, ''0f120000-4444-4000-8000-0000000000b1'', ''cqrityjob_review'', NULL)')
  LIKE 'err:23514:SP_REQUEST_ALREADY_OPEN%',
  'TH0.2 PRE-FIX: B''s own submission of B''s period is refused as already open');
CREATE TEMP TABLE th0 AS SELECT pg_temp.try_as('0f120000-0000-4000-8000-00000000000c',
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)',
           (SELECT id FROM public.sp_verification_requests WHERE period_id = '0f120000-4444-4000-8000-0000000000b1'))) AS decided;
SELECT pg_temp.ok((SELECT decided FROM th0) = 'ok'
  AND (SELECT count(*) FROM public.sp_verification_decisions d
         JOIN public.sp_verification_requests r ON r.id = d.request_id
        WHERE r.period_id = '0f120000-4444-4000-8000-0000000000b1' AND d.decision = 'approved'
          AND d.decider_organisation = 'CQrityjob') = 1,
  'TH0.3 PRE-FIX: V''s approval records a CQrityjob approval against B''s period');
CREATE TEMP TABLE th0r AS SELECT pg_temp.try_as('0f120000-0000-4000-8000-00000000000c',
    'SELECT public.sp_verifier_revoke(NULL, ''0f120000-4444-4000-8000-0000000000b1'', ''x'')') AS revoked;
SELECT pg_temp.ok((SELECT revoked FROM th0r) = 'ok'
  AND (SELECT lifecycle_state FROM public.sp_experience_periods WHERE id = '0f120000-4444-4000-8000-0000000000b1') = 'revoked',
  'TH0.4 PRE-FIX: after which B''s period can be revoked');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH1 — two entries are refused; B is unaffected'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.plant_evidence() LIKE 'err:23514:SP_TARGET_AMBIGUOUS%',
  'TH1.1 attaching evidence naming a claim and a period is refused: ' || pg_temp.plant_evidence());
SELECT pg_temp.ok(pg_temp.plant_request() LIKE 'err:23514:SP_TARGET_AMBIGUOUS%',
  'TH1.2 submitting for verification naming a claim and a period is refused: ' || pg_temp.plant_request());
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(NULL, NULL, ''0f120000-0000-4000-8000-00000000000a/x/none.pdf'', ''none.pdf'', ''application/pdf'', 1000, NULL)')
  LIKE 'err:23514:SP_TARGET_AMBIGUOUS%',
  'TH1.3 naming neither is refused the same way');
SELECT pg_temp.ok(pg_temp.on_b_period() = 'evidence:0|requests:0|assertion:self_declared'
                  AND (SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = '0f120000-0000-4000-8000-00000000000a') = 0
                  AND (SELECT assertion_level FROM public.sp_claims WHERE id = '0f120000-3333-4000-8000-0000000000a1') = 'self_declared',
  'TH1.4 nothing was written, and A''s own claim was not touched either');
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000b',
    'SELECT public.sp_submit_for_verification(NULL, ''0f120000-4444-4000-8000-0000000000b1'', ''cqrityjob_review'', NULL)') = 'ok',
  'TH1.5 B submits B''s own period normally');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH2 — disputes and revocations refuse two entries too'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_raise_dispute(''0f120000-3333-4000-8000-0000000000a1'', ''0f120000-4444-4000-8000-0000000000b1'', ''x'')')
  LIKE 'err:23514:SP_TARGET_AMBIGUOUS%',
  'TH2.1 sp_raise_dispute refuses a claim and a period');
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000c',
    'SELECT public.sp_verifier_revoke(''0f120000-3333-4000-8000-0000000000a1'', ''0f120000-4444-4000-8000-0000000000b1'', ''x'')')
  LIKE 'err:23514:SP_TARGET_AMBIGUOUS%',
  'TH2.2 sp_verifier_revoke refuses a claim and a period');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH3 — the table layer alone refuses'; END $$;
-- =========================================================================
SAVEPOINT tables_only;
-- The pre-fix functions, the new constraints: the rollback's function bodies
-- only, by re-adding the constraints after it.
\ir ../rollback/20270114090000_sp_passport_target_holder_rollback.sql
ALTER TABLE public.sp_claims ADD CONSTRAINT sp_claims_id_holder_key UNIQUE (id, holder_user_id);
ALTER TABLE public.sp_experience_periods ADD CONSTRAINT sp_experience_periods_id_holder_key UNIQUE (id, holder_user_id);
ALTER TABLE public.sp_evidence
  ADD CONSTRAINT sp_evidence_exactly_one_target CHECK (num_nonnulls(claim_id, period_id) = 1),
  ADD CONSTRAINT sp_evidence_claim_same_holder FOREIGN KEY (claim_id, holder_user_id) REFERENCES public.sp_claims (id, holder_user_id) ON DELETE CASCADE,
  ADD CONSTRAINT sp_evidence_period_same_holder FOREIGN KEY (period_id, holder_user_id) REFERENCES public.sp_experience_periods (id, holder_user_id) ON DELETE CASCADE;
ALTER TABLE public.sp_verification_requests
  ADD CONSTRAINT sp_vr_exactly_one_target CHECK (num_nonnulls(claim_id, period_id) = 1),
  ADD CONSTRAINT sp_vr_claim_same_holder FOREIGN KEY (claim_id, holder_user_id) REFERENCES public.sp_claims (id, holder_user_id) ON DELETE CASCADE,
  ADD CONSTRAINT sp_vr_period_same_holder FOREIGN KEY (period_id, holder_user_id) REFERENCES public.sp_experience_periods (id, holder_user_id) ON DELETE CASCADE;
SELECT pg_temp.ok(pg_temp.plant_evidence() LIKE 'err:23514:%' AND pg_temp.plant_request() LIKE 'err:23514:%',
  'TH3.1 with the pre-fix functions, a row naming two entries violates the one-target check: ' || pg_temp.plant_evidence());
CREATE TEMP TABLE th3 AS SELECT
  pg_temp.try_as('',
    'INSERT INTO public.sp_evidence (holder_user_id, period_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f120000-0000-4000-8000-00000000000a'', ''0f120000-4444-4000-8000-0000000000b1'',
             ''0f120000-0000-4000-8000-00000000000a/x/owner.pdf'', ''owner.pdf'', ''application/pdf'', 10)') AS ev,
  pg_temp.try_as('',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind)
     VALUES (''0f120000-0000-4000-8000-00000000000b'', ''0f120000-3333-4000-8000-0000000000a1'', ''cqrityjob_review'')') AS req;
SELECT pg_temp.ok((SELECT ev FROM th3) LIKE 'err:23503:%' AND (SELECT req FROM th3) LIKE 'err:23503:%',
  'TH3.2 even the table owner cannot write evidence for A on B''s period, or a request for B on A''s claim (same-holder foreign keys): '
  || (SELECT ev || ' / ' || req FROM th3));
ROLLBACK TO SAVEPOINT tables_only;
CREATE TEMP TABLE th3b AS SELECT
  pg_temp.try_as('',
    'INSERT INTO public.sp_evidence (holder_user_id, period_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f120000-0000-4000-8000-00000000000a'', ''0f120000-4444-4000-8000-0000000000b1'',
             ''0f120000-0000-4000-8000-00000000000a/x/owner2.pdf'', ''owner2.pdf'', ''application/pdf'', 10)') AS ev;
SELECT pg_temp.ok((SELECT ev FROM th3b) LIKE 'err:23503:%',
  'TH3.3 and in the migrated state as it stands, the same owner write is refused: ' || (SELECT ev FROM th3b));

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TH4 — every legitimate call still works'; END $$;
-- =========================================================================
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(''0f120000-3333-4000-8000-0000000000a1'', NULL,
       ''0f120000-0000-4000-8000-00000000000a/a1/licence.pdf'', ''licence.pdf'', ''application/pdf'', 1000, NULL)') = 'ok'
  AND pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(NULL, ''0f120000-4444-4000-8000-0000000000a1'',
       ''0f120000-0000-4000-8000-00000000000a/pa1/intyg.pdf'', ''intyg.pdf'', ''application/pdf'', 1000, NULL)') = 'ok',
  'TH4.1 A attaches evidence to A''s own claim and to A''s own period');
SELECT pg_temp.ok(
  pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_submit_for_verification(''0f120000-3333-4000-8000-0000000000a1'', NULL, ''cqrityjob_review'', NULL)') = 'ok'
  AND pg_temp.try_as('0f120000-0000-4000-8000-00000000000a',
    'SELECT public.sp_submit_for_verification(NULL, ''0f120000-4444-4000-8000-0000000000a1'', ''cqrityjob_review'', NULL)') = 'ok',
  'TH4.2 A opens a review on A''s own claim and on A''s own period');
CREATE TEMP TABLE th4 AS SELECT pg_temp.try_as('0f120000-0000-4000-8000-00000000000c',
    format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)',
           (SELECT id FROM public.sp_verification_requests WHERE claim_id = '0f120000-3333-4000-8000-0000000000a1'))) AS decided,
  NULL::text AS revoked, NULL::text AS disputed;
UPDATE th4 SET revoked = pg_temp.try_as('0f120000-0000-4000-8000-00000000000c',
    'SELECT public.sp_verifier_revoke(''0f120000-3333-4000-8000-0000000000a1'', NULL, ''Återkallat i test.'')');
UPDATE th4 SET disputed = pg_temp.try_as('0f120000-0000-4000-8000-00000000000b',
    'SELECT public.sp_raise_dispute(NULL, ''0f120000-4444-4000-8000-0000000000b1'', ''Fel slutdatum.'')');
SELECT pg_temp.ok((SELECT decided = 'ok' AND revoked = 'ok' FROM th4)
  AND (SELECT lifecycle_state FROM public.sp_claims WHERE id = '0f120000-3333-4000-8000-0000000000a1') = 'revoked',
  'TH4.3 V approves A''s claim and can revoke it: ' || (SELECT decided || ' / ' || revoked FROM th4));
SELECT pg_temp.ok((SELECT disputed FROM th4) = 'ok'
  AND (SELECT lifecycle_state FROM public.sp_experience_periods WHERE id = '0f120000-4444-4000-8000-0000000000b1') = 'disputed',
  'TH4.4 B raises a dispute on B''s own period');
SELECT pg_temp.ok(pg_temp.on_b_period() = 'evidence:0|requests:1|assertion:self_declared',
  'TH4.5 B''s period carries only B''s own request');

ROLLBACK;
