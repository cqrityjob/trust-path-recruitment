-- 20270125090000: a Security Passport review decision is bound to the content
-- the reviewer actually saw.
--
--   SR-F the fixture: holder A with self-declared periods; holder B; a
--        CQrityjob verifier V; a signed-in non-verifier N.
--   SR0  REPRODUCTION. Inside a savepoint the binding is removed with the real
--        rollback. V opens A's period, asks for a clarification; A changes the
--        period (the request returns to review); V approves from the page
--        still showing the old content; the NEW content is verified. Rolled back.
--   SR1  with the binding, the same approval from the stale page is refused
--        (SP_REVIEW_STALE): the period is not verified, the request is still
--        in review, and no decision is recorded.
--   SR2  a bare sp_verifier_decide call on the answered request is refused too,
--        and so is a stale clarification or rejection.
--   SR3  V reloads (the current submitted_at) and approves: exactly the content
--        V now sees is verified.
--   SR4  the legitimate flows are unchanged: a request never sent for
--        clarification is decided by either entry point; a clarification
--        that is approved without any change by A needs no reload; A can
--        withdraw an answered request; a rejection after reload works.
--   SR5  the binding never stands in for authority: a non-verifier calling the
--        reviewed entry point is refused as before; a NULL version is refused;
--        anon cannot execute it; a wrong version on a fresh request is refused.
--   SR6  20270126090000: evidence attached while a review is open binds the
--        decision too -- a page loaded before the new document is refused, as
--        is a bare call; after reloading, the reviewer approves.
--   SR7  the review page's own flow, end to end through the read model it
--        uses: the version comes from sp_verifier_request_detail exactly as
--        the page receives it (the JSON string), the stale page is refused,
--        the reload shows the new content and a new version, and deciding
--        with that version verifies what is now shown.
--
-- Synthetic principals; everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Run _sql as _uid; 'ok' or 'err:<first word of the message>'.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.submit(_period uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _r uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f190000-0000-4000-8000-00000000000a', true);
  SET LOCAL ROLE authenticated;
  _r := public.sp_submit_for_verification(NULL, _period, 'cqrityjob_review', NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- What V's page carries: the request's submitted_at as it was when V loaded it.
CREATE OR REPLACE FUNCTION pg_temp.seen(_req uuid) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT submitted_at FROM public.sp_verification_requests WHERE id = _req;
$$;

CREATE OR REPLACE FUNCTION pg_temp.approve_sql(_req uuid, _seen timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)',
                _req, _seen);
$$;
CREATE OR REPLACE FUNCTION pg_temp.clarify_sql(_req uuid, _seen timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.sp_verifier_decide_reviewed(%L, %L, ''clarification_requested'', NULL, NULL, ''Ange korrekt roll.'', NULL, NULL)',
                _req, _seen);
$$;
CREATE OR REPLACE FUNCTION pg_temp.reject_sql(_req uuid, _seen timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.sp_verifier_decide_reviewed(%L, %L, ''rejected'', ''document_review'', NULL, ''Underlaget räcker inte.'', NULL, NULL)',
                _req, _seen);
$$;
CREATE OR REPLACE FUNCTION pg_temp.bare_approve_sql(_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.sp_verifier_decide(%L, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)', _req);
$$;
CREATE OR REPLACE FUNCTION pg_temp.holder_edit_sql(_period uuid, _role text) RETURNS text LANGUAGE sql AS $$
  SELECT format('UPDATE public.sp_experience_periods SET role_title = %L, started_on = current_date - 3000 WHERE id = %L',
                _role, _period);
$$;

CREATE OR REPLACE FUNCTION pg_temp.period(_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT assertion_level || '|' || (current_date - started_on) || '|' || role_title
    FROM public.sp_experience_periods WHERE id = _id;
$$;
CREATE OR REPLACE FUNCTION pg_temp.req(_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.sp_verification_requests WHERE id = _id;
$$;
-- plpgsql, so the suite still loads (and fails by assertion) where the column
-- does not exist -- the rollback negative control.
CREATE OR REPLACE FUNCTION pg_temp.answered(_id uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT (to_jsonb(r) ->> 'answered_at') IS NOT NULL FROM public.sp_verification_requests r WHERE r.id = _id);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.decisions(_id uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.sp_verification_decisions WHERE request_id = _id;
$$;

CREATE OR REPLACE FUNCTION pg_temp.attach(_period uuid, _name text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
    format('SELECT public.sp_attach_evidence(NULL, %L, %L, %L, ''application/pdf'', 1000, NULL)',
           _period, '0f190000-0000-4000-8000-00000000000a/' || _name, _name));
$$;
CREATE OR REPLACE FUNCTION pg_temp.evidence(_period uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.sp_evidence WHERE period_id = _period AND lifecycle_state = 'active';
$$;

-- ── Cast ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('0f190000-0000-4000-8000-00000000000a', 'sr-holder-a@test.invalid'),
  ('0f190000-0000-4000-8000-00000000000b', 'sr-holder-b@test.invalid'),
  ('0f190000-0000-4000-8000-00000000000c', 'sr-verifier@test.invalid'),
  ('0f190000-0000-4000-8000-00000000000d', 'sr-nobody@test.invalid');
INSERT INTO public.user_roles (user_id, role) VALUES ('0f190000-0000-4000-8000-00000000000c', 'passport_verifier');
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES
  ('0f190000-0000-4000-8000-00000000000a', 'SR Holder A', 'SE'),
  ('0f190000-0000-4000-8000-00000000000b', 'SR Holder B', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state)
SELECT p.id, '0f190000-0000-4000-8000-00000000000a', 'SR Bevakning AB', 'Väktare', 'SE', 'full_time',
       current_date - 400, 'self_declared', 'active'
  FROM (VALUES ('0f190000-4444-4000-8000-0000000000a1'::uuid), ('0f190000-4444-4000-8000-0000000000a2'),
               ('0f190000-4444-4000-8000-0000000000a3'), ('0f190000-4444-4000-8000-0000000000a4'),
               ('0f190000-4444-4000-8000-0000000000a5'), ('0f190000-4444-4000-8000-0000000000a6'),
               ('0f190000-4444-4000-8000-0000000000a7'), ('0f190000-4444-4000-8000-0000000000a8')) p(id);
SELECT pg_temp.ok(pg_temp.period('0f190000-4444-4000-8000-0000000000a1') = 'self_declared|400|Väktare',
  'SR-F A''s periods are self-declared Väktare, started 400 days ago');

-- ── SR0 reproduction: no binding ─────────────────────────────────────────
SAVEPOINT pre_fix;
\ir ../rollback/20270125090000_sp_decision_bound_to_reviewed_content_rollback.sql
CREATE TEMP TABLE sr0 AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a1') AS req;
-- V's page is loaded now: it shows "Väktare, 400 days".
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  format('SELECT public.sp_verifier_decide(%L, ''clarification_requested'', NULL, NULL, ''Ange korrekt roll.'', NULL, NULL)',
         (SELECT req FROM sr0))) = 'ok', 'SR0.a V asks for a clarification');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  pg_temp.holder_edit_sql('0f190000-4444-4000-8000-0000000000a1', 'Säkerhetschef')) = 'ok'
  AND pg_temp.req((SELECT req FROM sr0)) = 'pending', 'SR0.b A answers by changing the period; back in review');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.bare_approve_sql((SELECT req FROM sr0))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a1') = 'verified|3000|Säkerhetschef',
  'SR0.1 REPRODUCTION: pre-fix, V approves from the page showing Väktare/400 and Säkerhetschef/3000 is verified');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── SR1 the stale approval is refused ────────────────────────────────────
CREATE TEMP TABLE sr1 AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a1') AS req;
CREATE TEMP TABLE sr1seen AS SELECT pg_temp.seen((SELECT req FROM sr1)) AS at;   -- V's page loads
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr1), (SELECT at FROM sr1seen))) = 'ok'
  AND pg_temp.req((SELECT req FROM sr1)) = 'clarification_requested',
  'SR1.a V asks for a clarification from the page it loaded');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  pg_temp.holder_edit_sql('0f190000-4444-4000-8000-0000000000a1', 'Säkerhetschef')) = 'ok'
  AND pg_temp.req((SELECT req FROM sr1)) = 'pending'
  AND pg_temp.answered((SELECT req FROM sr1)),
  'SR1.b A answers by changing the period; the request is back in review and marked answered');
CREATE TEMP TABLE sr1n AS SELECT pg_temp.decisions((SELECT req FROM sr1)) AS n;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr1), (SELECT at FROM sr1seen))) = 'err:SP_REVIEW_STALE',
  'SR1.1 V''s approval from the page loaded before the answer is refused (SP_REVIEW_STALE)');
SELECT pg_temp.ok(pg_temp.period('0f190000-4444-4000-8000-0000000000a1') = 'self_declared|3000|Säkerhetschef'
  AND pg_temp.req((SELECT req FROM sr1)) = 'pending'
  AND pg_temp.decisions((SELECT req FROM sr1)) = (SELECT n FROM sr1n),
  'SR1.2 nothing is verified, the request is still in review and no decision is recorded');

-- ── SR2 no other way round it ────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.bare_approve_sql((SELECT req FROM sr1))) = 'err:SP_REVIEW_STALE',
  'SR2.1 a bare sp_verifier_decide call on the answered request is refused: it names no reviewed version');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.reject_sql((SELECT req FROM sr1), (SELECT at FROM sr1seen))) = 'err:SP_REVIEW_STALE'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr1), (SELECT at FROM sr1seen))) = 'err:SP_REVIEW_STALE',
  'SR2.2 a stale rejection or clarification is refused the same way');
-- The marker cannot be planted by a caller and survive into the decision:
-- the reviewed entry point overwrites it, and sp_verifier_decide clears it.
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  format('SELECT set_config(''sp.reviewed_submitted_at'', %L, true), public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', NULL, NULL, NULL, NULL)',
         pg_temp.seen((SELECT req FROM sr1))::text, (SELECT req FROM sr1), (SELECT at FROM sr1seen))) = 'err:SP_REVIEW_STALE',
  'SR2.3 a stale version stays stale however the marker is set around it');

-- ── SR3 reload, then decide ──────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr1), pg_temp.seen((SELECT req FROM sr1)))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a1') = 'verified|3000|Säkerhetschef'
  AND pg_temp.req((SELECT req FROM sr1)) = 'approved',
  'SR3.1 after reloading, V approves and exactly the content V now sees is verified');

-- ── SR4 the legitimate flows are unchanged ───────────────────────────────
CREATE TEMP TABLE sr4a AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a2') AS req;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.bare_approve_sql((SELECT req FROM sr4a))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a2') = 'verified|400|Väktare',
  'SR4.1 a request never sent for clarification is still approved by the existing entry point');
CREATE TEMP TABLE sr4b AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a3') AS req;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr4b), pg_temp.seen((SELECT req FROM sr4b)))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a3') = 'verified|400|Väktare',
  'SR4.2 and by the reviewed entry point');
CREATE TEMP TABLE sr4c AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a4') AS req;
CREATE TEMP TABLE sr4cseen AS SELECT pg_temp.seen((SELECT req FROM sr4c)) AS at;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr4c), (SELECT at FROM sr4cseen))) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr4c), (SELECT at FROM sr4cseen))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a4') = 'verified|400|Väktare',
  'SR4.3 a clarification approved without any change by A needs no reload: the page is not stale');
CREATE TEMP TABLE sr4d AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a5') AS req;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr4d), pg_temp.seen((SELECT req FROM sr4d)))) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  pg_temp.holder_edit_sql('0f190000-4444-4000-8000-0000000000a5', 'Skyddsvakt')) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  format('SELECT public.sp_withdraw_verification_request(%L)', (SELECT req FROM sr4d))) = 'ok'
  AND pg_temp.req((SELECT req FROM sr4d)) = 'withdrawn',
  'SR4.4 A can still withdraw an answered request');
CREATE TEMP TABLE sr4e AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a6') AS req;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr4e), pg_temp.seen((SELECT req FROM sr4e)))) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  pg_temp.holder_edit_sql('0f190000-4444-4000-8000-0000000000a6', 'Skyddsvakt')) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.reject_sql((SELECT req FROM sr4e), pg_temp.seen((SELECT req FROM sr4e)))) = 'ok'
  AND pg_temp.req((SELECT req FROM sr4e)) = 'rejected'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a6') LIKE 'self_declared|%',
  'SR4.5 after reloading the answer, V can reject it; nothing is verified');

-- ── SR5 the binding never stands in for authority ────────────────────────
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000d',
  pg_temp.approve_sql((SELECT req FROM sr1), pg_temp.seen((SELECT req FROM sr1)))) = 'err:SP_NOT_VERIFIER',
  'SR5.1 a signed-in non-verifier with the right version is refused as before (SP_NOT_VERIFIER)');
CREATE TEMP TABLE sr5 AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a2') AS req;
SELECT pg_temp.ok(
  pg_temp.try_as('0f190000-0000-4000-8000-00000000000c', pg_temp.approve_sql((SELECT req FROM sr5), NULL)) = 'err:SP_REVIEW_STALE'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
        pg_temp.approve_sql((SELECT req FROM sr5), pg_temp.seen((SELECT req FROM sr5)) - interval '1 second')) = 'err:SP_REVIEW_STALE'
  AND pg_temp.req((SELECT req FROM sr5)) = 'pending',
  'SR5.2 a missing or wrong version is refused even on a request never sent for clarification');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date)', 'EXECUTE'),
  'SR5.3 anon cannot execute the reviewed entry point; signed-in users can, and the database decides who may decide');

-- ── SR6 evidence added under review binds the decision too ───────────────
SELECT pg_temp.ok(pg_temp.attach('0f190000-4444-4000-8000-0000000000a7', 'intyg.pdf') = 'ok',
  'SR6.a A attaches a document to the period');
CREATE TEMP TABLE sr6 AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a7') AS req;
CREATE TEMP TABLE sr6seen AS SELECT pg_temp.seen((SELECT req FROM sr6)) AS at;      -- V's page: 1 document
SELECT pg_temp.ok(pg_temp.attach('0f190000-4444-4000-8000-0000000000a7', 'annat-intyg.pdf') = 'ok'
  AND pg_temp.evidence('0f190000-4444-4000-8000-0000000000a7') = 2
  AND pg_temp.req((SELECT req FROM sr6)) = 'pending',
  'SR6.b while the request is pending A attaches a second document; the request stays in review');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr6), (SELECT at FROM sr6seen))) = 'err:SP_REVIEW_STALE'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.bare_approve_sql((SELECT req FROM sr6))) = 'err:SP_REVIEW_STALE'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a7') LIKE 'document_provided|%',
  'SR6.1 the approval from the page that showed one document is refused, and so is a bare call');
CREATE TEMP TABLE sr6b AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000a8') AS req;
CREATE TEMP TABLE sr6bseen AS SELECT pg_temp.seen((SELECT req FROM sr6b)) AS at;
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.clarify_sql((SELECT req FROM sr6b), (SELECT at FROM sr6bseen))) = 'ok'
  AND pg_temp.attach('0f190000-4444-4000-8000-0000000000a8', 'svar.pdf') = 'ok'
  AND pg_temp.req((SELECT req FROM sr6b)) = 'clarification_requested'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr6b), (SELECT at FROM sr6bseen))) = 'err:SP_REVIEW_STALE',
  'SR6.2 a clarification answered with a document: the status is unchanged and the stale approval is refused');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr6), pg_temp.seen((SELECT req FROM sr6)))) = 'ok'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000a7') LIKE 'verified|%'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.approve_sql((SELECT req FROM sr6b), pg_temp.seen((SELECT req FROM sr6b)))) = 'ok',
  'SR6.3 after reloading -- the page now shows every document -- V approves both');
SELECT pg_temp.ok(pg_temp.attach('0f190000-4444-4000-8000-0000000000a2', 'efter-beslut.pdf') = 'ok'
  AND pg_temp.req((SELECT req FROM sr4a)) = 'approved',
  'SR6.4 a document added after the decision touches no decided request');

-- ── SR7 the review page's flow through its read model ────────────────────
-- What the page holds is the detail JSON; the version it sends back is that
-- JSON's submitted_at string, unchanged (verification.functions.ts).
CREATE OR REPLACE FUNCTION pg_temp.detail(_req uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE AS $$
DECLARE _j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0f190000-0000-4000-8000-00000000000c', true);
  SET LOCAL ROLE authenticated;
  _j := public.sp_verifier_request_detail(_req);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _j;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.page_sql(_decision text, _req uuid, _version text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE _decision
    WHEN 'approved' THEN format('SELECT public.sp_verifier_decide_reviewed(%L, %L::timestamptz, ''approved'', ''document_review'', ''Kontrollerat.'', NULL, NULL, NULL)', _req, _version)
    ELSE format('SELECT public.sp_verifier_decide_reviewed(%L, %L::timestamptz, ''clarification_requested'', NULL, NULL, ''Ange korrekt roll.'', NULL, NULL)', _req, _version)
  END;
$$;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, jurisdiction_code,
                                          employment_type, started_on, assertion_level, lifecycle_state)
VALUES ('0f190000-4444-4000-8000-0000000000b1', '0f190000-0000-4000-8000-00000000000a', 'SR Bevakning AB',
        'Väktare', 'SE', 'full_time', current_date - 400, 'self_declared', 'active');
CREATE TEMP TABLE sr7 AS SELECT pg_temp.submit('0f190000-4444-4000-8000-0000000000b1') AS req;
CREATE TEMP TABLE sr7_page1 AS SELECT pg_temp.detail((SELECT req FROM sr7)) AS j;
SELECT pg_temp.ok(
  (SELECT j->>'submitted_at' FROM sr7_page1) IS NOT NULL
  AND (SELECT (j->>'submitted_at')::timestamptz FROM sr7_page1) = pg_temp.seen((SELECT req FROM sr7))
  AND (SELECT j->'period'->>'role' FROM sr7_page1) = 'Väktare',
  'SR7.1 the page''s detail shows Väktare and carries the request''s exact version as text');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.page_sql('clarify', (SELECT req FROM sr7), (SELECT j->>'submitted_at' FROM sr7_page1))) = 'ok'
  AND pg_temp.try_as('0f190000-0000-4000-8000-00000000000a',
  pg_temp.holder_edit_sql('0f190000-4444-4000-8000-0000000000b1', 'Säkerhetschef')) = 'ok'
  AND pg_temp.req((SELECT req FROM sr7)) = 'pending',
  'SR7.2 V asks from the page; A answers by changing the period and it returns to review');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.page_sql('approved', (SELECT req FROM sr7), (SELECT j->>'submitted_at' FROM sr7_page1))) = 'err:SP_REVIEW_STALE'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000b1') = 'self_declared|3000|Säkerhetschef',
  'SR7.3 approving from the page that still shows Väktare is refused SP_REVIEW_STALE; nothing is verified');
CREATE TEMP TABLE sr7_page2 AS SELECT pg_temp.detail((SELECT req FROM sr7)) AS j;
SELECT pg_temp.ok(
  (SELECT j->'period'->>'role' FROM sr7_page2) = 'Säkerhetschef'
  AND (SELECT j->>'submitted_at' FROM sr7_page2) IS DISTINCT FROM (SELECT j->>'submitted_at' FROM sr7_page1)
  AND (SELECT (j->>'submitted_at')::timestamptz FROM sr7_page2) = pg_temp.seen((SELECT req FROM sr7)),
  'SR7.4 the reload the page does on SP_REVIEW_STALE shows the new content and a new version');
SELECT pg_temp.ok(pg_temp.try_as('0f190000-0000-4000-8000-00000000000c',
  pg_temp.page_sql('approved', (SELECT req FROM sr7), (SELECT j->>'submitted_at' FROM sr7_page2))) = 'ok'
  AND pg_temp.req((SELECT req FROM sr7)) = 'approved'
  AND pg_temp.period('0f190000-4444-4000-8000-0000000000b1') = 'verified|3000|Säkerhetschef',
  'SR7.5 deciding again from the reloaded page verifies exactly what it now shows');

ROLLBACK;
