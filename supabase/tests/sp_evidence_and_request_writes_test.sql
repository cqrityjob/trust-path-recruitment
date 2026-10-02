-- P1-4 (20270106090000): Passport evidence and verification requests are
-- written only by their functions.
--
--   SV-F the fixture: holders A and B with their own claims and evidence,
--        attached through sp_attach_evidence; B's claim 1 is under a
--        CQrityjob review.
--   SV0  REPRODUCTION. Inside a savepoint the pre-fix grants and policies are
--        restored by running the real rollback file. A plants A's file on
--        B's claim under review, the verifier's dossier shows it, and B
--        cannot remove it; A repoints A's own evidence onto B's claim; A opens
--        a request on B's other claim and B can no longer submit it. Rolled
--        back.
--   SV1  every one of those direct writes is refused, and B's entries are
--        left as B made them.
--   SV2  the legitimate flows still work through the functions, and the
--        functions still refuse another holder's target and path.
--   SV3  reads are unchanged: holder, other holder, verifier.
--   SV4  each layer alone holds: with the write grants restored the policies
--        refuse; with the old policies restored the privileges refuse.
--   SV5  a holder cannot edit their own evidence directly either (e.g.
--        un-withdraw it); anon holds no write.
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

-- A count as a principal.
CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid text, _sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- a holder A (attacker); b holder B (victim); v CQrityjob verifier.
INSERT INTO auth.users (id, email) VALUES
  ('0f0e0000-0000-4000-8000-00000000000a', 'sv-holder-a@test.invalid'),
  ('0f0e0000-0000-4000-8000-00000000000b', 'sv-holder-b@test.invalid'),
  ('0f0e0000-0000-4000-8000-00000000000c', 'sv-verifier@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f0e0000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES
  ('0f0e0000-0000-4000-8000-00000000000a', 'SV Holder A', 'SE'),
  ('0f0e0000-0000-4000-8000-00000000000b', 'SV Holder B', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;
-- A1: A's claim. B1: B's claim, to be under review. B2: B's other claim.
INSERT INTO public.sp_claims (id, holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
                              issued_on, valid_until, assertion_level, lifecycle_state, jurisdiction_code) VALUES
  ('0f0e0000-3333-4000-8000-0000000000a1', '0f0e0000-0000-4000-8000-00000000000a', 'licence', 'OV',
   'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'self_declared', 'active', 'SE'),
  ('0f0e0000-3333-4000-8000-0000000000b1', '0f0e0000-0000-4000-8000-00000000000b', 'licence', 'OV',
   'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'self_declared', 'active', 'SE'),
  ('0f0e0000-3333-4000-8000-0000000000b2', '0f0e0000-0000-4000-8000-00000000000b', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', current_date - 200, NULL, 'self_declared', 'active', 'SE');

CREATE TEMP TABLE ids(label text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO authenticated;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV-F — evidence attached and a review opened through the functions'; END $$;
-- =========================================================================
DO $$
DECLARE _id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f0e0000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  _id := public.sp_attach_evidence('0f0e0000-3333-4000-8000-0000000000a1', NULL,
           '0f0e0000-0000-4000-8000-00000000000a/a1/licence.pdf', 'licence.pdf', 'application/pdf', 1000, NULL);
  RESET ROLE;
  INSERT INTO ids VALUES ('a_ev', _id);
  PERFORM set_config('request.jwt.claim.sub', '0f0e0000-0000-4000-8000-00000000000b', true);
  SET LOCAL ROLE authenticated;
  _id := public.sp_attach_evidence('0f0e0000-3333-4000-8000-0000000000b1', NULL,
           '0f0e0000-0000-4000-8000-00000000000b/b1/licence.pdf', 'licence.pdf', 'application/pdf', 1000, NULL);
  RESET ROLE;
  INSERT INTO ids VALUES ('b_ev', _id);
  PERFORM set_config('request.jwt.claim.sub', '0f0e0000-0000-4000-8000-00000000000b', true);
  SET LOCAL ROLE authenticated;
  _id := public.sp_submit_for_verification('0f0e0000-3333-4000-8000-0000000000b1', NULL, 'cqrityjob_review', NULL);
  RESET ROLE;
  INSERT INTO ids VALUES ('b_req', _id);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_evidence WHERE id IN (SELECT id FROM ids WHERE label IN ('a_ev', 'b_ev'))) = 2
                  AND (SELECT status FROM public.sp_verification_requests WHERE id = (SELECT id FROM ids WHERE label = 'b_req')) = 'pending',
  'SV-F.1 A and B each attached evidence through sp_attach_evidence; B''s claim 1 is under review');
SELECT pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000c',
                    'SELECT count(*) FROM public.sp_evidence WHERE claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''') = 1,
  'SV-F.2 the verifier''s dossier for B''s claim 1 holds B''s one file');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV0 — reproduction: direct writes plant evidence and requests on another holder'; END $$;
-- =========================================================================
SAVEPOINT pre_fix;
\ir ../rollback/20270106090000_sp_evidence_and_request_writes_rpc_only_rollback.sql
-- 20270114090000 (P1-E) later added a table-level invariant that also refuses
-- a cross-holder row. Lift it too, so this reproduces the state before both.
\ir ../rollback/20270114090000_sp_passport_target_holder_rollback.sql
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_evidence (id, holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f0e0000-4444-4000-8000-0000000000f1'', ''0f0e0000-0000-4000-8000-00000000000a'',
             ''0f0e0000-3333-4000-8000-0000000000b1'', ''0f0e0000-0000-4000-8000-00000000000a/x/forged.pdf'',
             ''forged.pdf'', ''application/pdf'', 10)');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV0.1 PRE-FIX: A inserts A''s file onto B''s claim under review (' || _r || ')');
  PERFORM pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000c',
                       'SELECT count(*) FROM public.sp_evidence WHERE claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''') = 2,
    'SV0.2 PRE-FIX: the verifier''s dossier for B''s claim now shows A''s file');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000b',
    'SELECT public.sp_withdraw_evidence(''0f0e0000-4444-4000-8000-0000000000f1'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SP_NOT_HOLDER%', 'SV0.3 PRE-FIX: B cannot remove it (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_evidence SET claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''
      WHERE id = (SELECT id FROM ids WHERE label = ''a_ev'')');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV0.4 PRE-FIX: A repoints A''s own evidence onto B''s claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind, status)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b2'', ''cqrityjob_review'', ''pending'')');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV0.5 PRE-FIX: A opens a review request on B''s claim 2 (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000b',
    'SELECT public.sp_submit_for_verification(''0f0e0000-3333-4000-8000-0000000000b2'', NULL, ''cqrityjob_review'', NULL)');
  PERFORM pg_temp.ok(_r LIKE 'err:23514:SP_REQUEST_ALREADY_OPEN%', 'SV0.6 PRE-FIX: B can no longer submit their own claim 2 (' || _r || ')');
END $$;
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV1 — every direct write is refused'; END $$;
-- =========================================================================
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_evidence (id, holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f0e0000-4444-4000-8000-0000000000f1'', ''0f0e0000-0000-4000-8000-00000000000a'',
             ''0f0e0000-3333-4000-8000-0000000000b1'', ''0f0e0000-0000-4000-8000-00000000000a/x/forged.pdf'',
             ''forged.pdf'', ''application/pdf'', 10)');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV1.1 A cannot insert evidence onto B''s claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_evidence SET claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''
      WHERE id = (SELECT id FROM ids WHERE label = ''a_ev'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV1.2 A cannot repoint A''s evidence onto B''s claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind, status)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b2'', ''cqrityjob_review'', ''pending'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV1.3 A cannot open a request on B''s claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind, status)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000a1'', ''cqrityjob_review'', ''pending'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV1.4 nor directly on A''s own claim: requests go through sp_submit_for_verification (' || _r || ')');
END $$;
SELECT pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000c',
                    'SELECT count(*) FROM public.sp_evidence WHERE claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''') = 1
                  AND (SELECT claim_id FROM public.sp_evidence WHERE id = (SELECT id FROM ids WHERE label = 'a_ev'))
                      = '0f0e0000-3333-4000-8000-0000000000a1',
  'SV1.5 the verifier''s dossier for B''s claim still holds only B''s file; A''s evidence stays on A''s claim');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV2 — the legitimate flows still work through the functions'; END $$;
-- =========================================================================
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000b',
    'SELECT public.sp_submit_for_verification(''0f0e0000-3333-4000-8000-0000000000b2'', NULL, ''cqrityjob_review'', NULL)');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV2.1 B submits their own claim 2 for review (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000b',
    'SELECT public.sp_withdraw_verification_request((SELECT r.id FROM public.sp_verification_requests r
       WHERE r.claim_id = ''0f0e0000-3333-4000-8000-0000000000b2'' AND r.status = ''pending''))');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV2.2 and withdraws that request (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(''0f0e0000-3333-4000-8000-0000000000a1'', NULL,
       ''0f0e0000-0000-4000-8000-00000000000a/a1/second.pdf'', ''second.pdf'', ''application/pdf'', 500, NULL)');
  PERFORM pg_temp.ok(_r = 'ok:1', 'SV2.3 A attaches a second file to A''s own claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'SELECT public.sp_withdraw_evidence((SELECT id FROM ids WHERE label = ''a_ev''))');
  PERFORM pg_temp.ok(_r = 'ok:1' AND (SELECT lifecycle_state FROM public.sp_evidence WHERE id = (SELECT id FROM ids WHERE label = 'a_ev')) = 'withdrawn',
    'SV2.4 A withdraws A''s first file (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(''0f0e0000-3333-4000-8000-0000000000b1'', NULL,
       ''0f0e0000-0000-4000-8000-00000000000a/x/forged.pdf'', ''forged.pdf'', ''application/pdf'', 10, NULL)');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SP_NOT_HOLDER%', 'SV2.5 the function still refuses A''s file on B''s claim (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'SELECT public.sp_attach_evidence(''0f0e0000-3333-4000-8000-0000000000a1'', NULL,
       ''0f0e0000-0000-4000-8000-00000000000b/b1/licence.pdf'', ''licence.pdf'', ''application/pdf'', 10, NULL)');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SP_EVIDENCE_PATH_NOT_OWNED%', 'SV2.6 and a path in B''s folder (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'SELECT public.sp_submit_for_verification(''0f0e0000-3333-4000-8000-0000000000b2'', NULL, ''cqrityjob_review'', NULL)');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:SP_NOT_HOLDER%', 'SV2.7 and a request on B''s claim (' || _r || ')');
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV3 — reads are unchanged'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000a',
                    'SELECT count(*) FROM public.sp_evidence WHERE holder_user_id = ''0f0e0000-0000-4000-8000-00000000000a''') = 2
                  AND pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000a',
                    'SELECT count(*) FROM public.sp_evidence WHERE holder_user_id <> ''0f0e0000-0000-4000-8000-00000000000a''') = 0,
  'SV3.1 a holder reads their own evidence and nobody else''s');
SELECT pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000b',
                    'SELECT count(*) FROM public.sp_verification_requests') = 2
                  AND pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000a',
                    'SELECT count(*) FROM public.sp_verification_requests') = 0,
  'SV3.2 a holder reads their own requests and nobody else''s');
SELECT pg_temp.ok(pg_temp.count_as('0f0e0000-0000-4000-8000-00000000000c',
                    'SELECT count(*) FROM public.sp_evidence') = 1,
  'SV3.3 the verifier reads exactly the evidence under an open review');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV4 — each layer holds alone'; END $$;
-- =========================================================================
SAVEPOINT layer;
GRANT INSERT, UPDATE ON public.sp_evidence TO authenticated;
GRANT INSERT (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status)
  ON public.sp_verification_requests TO authenticated;
DO $$
DECLARE _r text; _u text; _q text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_evidence (holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b1'',
             ''0f0e0000-0000-4000-8000-00000000000a/x/forged.pdf'', ''forged.pdf'', ''application/pdf'', 10)');
  _u := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_evidence SET claim_id = ''0f0e0000-3333-4000-8000-0000000000b1''
      WHERE id = (SELECT id FROM ids WHERE label = ''a_ev'')');
  _q := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind, status)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b2'', ''cqrityjob_review'', ''pending'')');
  -- No write policy: the insert violates row-level security and the update
  -- matches no row it may change.
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%' AND _u = 'ok:0'
                     AND (SELECT claim_id FROM public.sp_evidence WHERE id = (SELECT id FROM ids WHERE label = 'a_ev'))
                         = '0f0e0000-3333-4000-8000-0000000000a1',
    'SV4.1 with the write grants restored, the policies alone refuse the evidence insert and repoint (' || _r || ' / ' || _u || ')');
  PERFORM pg_temp.ok(_q LIKE 'err:42501:%',
    'SV4.2 and the request insert (' || _q || ')');
END $$;
ROLLBACK TO SAVEPOINT layer;
SAVEPOINT layer;
DROP POLICY sp_evidence_self ON public.sp_evidence;
CREATE POLICY sp_evidence_self ON public.sp_evidence FOR ALL TO authenticated
  USING (holder_user_id = auth.uid()) WITH CHECK (holder_user_id = auth.uid());
CREATE POLICY sp_vr_self_insert ON public.sp_verification_requests FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND status = 'pending' AND decided_by IS NULL);
DO $$
DECLARE _r text; _q text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_evidence (holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b1'',
             ''0f0e0000-0000-4000-8000-00000000000a/x/forged.pdf'', ''forged.pdf'', ''application/pdf'', 10)');
  _q := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'INSERT INTO public.sp_verification_requests (holder_user_id, claim_id, request_kind, status)
     VALUES (''0f0e0000-0000-4000-8000-00000000000a'', ''0f0e0000-3333-4000-8000-0000000000b2'', ''cqrityjob_review'', ''pending'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%' AND _q LIKE 'err:42501:%',
    'SV4.3 with the old policies restored, the privileges alone refuse both inserts (' || _r || ' / ' || _q || ')');
END $$;
ROLLBACK TO SAVEPOINT layer;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SV5 — no direct self-edits; anon holds nothing'; END $$;
-- =========================================================================
DO $$
DECLARE _r text;
BEGIN
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000a',
    'UPDATE public.sp_evidence SET lifecycle_state = ''active'' WHERE id = (SELECT id FROM ids WHERE label = ''a_ev'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV5.1 A cannot un-withdraw A''s own evidence directly (' || _r || ')');
  _r := pg_temp.try_as('0f0e0000-0000-4000-8000-00000000000b',
    'UPDATE public.sp_evidence SET storage_path = ''0f0e0000-0000-4000-8000-00000000000b/b1/other.pdf''
      WHERE id = (SELECT id FROM ids WHERE label = ''b_ev'')');
  PERFORM pg_temp.ok(_r LIKE 'err:42501:%', 'SV5.2 B cannot repoint the file under review directly (' || _r || ')');
END $$;
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.sp_evidence', 'INSERT')
                  AND NOT has_table_privilege('anon', 'public.sp_evidence', 'UPDATE')
                  AND NOT has_table_privilege('anon', 'public.sp_verification_requests', 'INSERT')
                  AND NOT has_column_privilege('anon', 'public.sp_verification_requests', 'claim_id', 'INSERT'),
  'SV5.3 anon holds no write on either table');

DO $$ BEGIN RAISE NOTICE 'ALL sp_evidence_and_request_writes assertions passed'; END $$;
ROLLBACK;
