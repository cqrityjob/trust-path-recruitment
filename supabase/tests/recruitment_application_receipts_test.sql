-- Automatic receipts for received applications (20261213090000), proved by
-- EXECUTING every rule as the role that would really meet it.
--
--   F · fixture         one organisation with an owner, a member and a
--                       responsible person; one next door; two candidates
--   T · the setting     the standard text, who may change it, what is kept
--   R · the receipt     written at the commit of a correct submission only,
--                       once, in the candidate's language, with the text
--                       that was current -- and never for a failed one, a
--                       replay, or an application that already existed
--   E · the e-mail      claim / settle by the applicant or a manager; an
--                       unsettled claim is unknown, never "not sent"; a
--                       retry is a person's decision
--   V · visibility      the candidate reads their own receipt and nobody
--                       else's; the employer sees its delivery status
--
-- The receipt trigger is deferred to the commit; this suite runs in one
-- transaction that ends in ROLLBACK, so it sets the trigger IMMEDIATE and
-- proves the same rule at the end of each statement instead.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

DO $$ BEGIN RAISE NOTICE 'GROUP F — the fixture'; END $$;

CREATE TEMP TABLE rc AS
SELECT
  'ce000000-1111-0000-0000-00000000000a'::uuid AS emp_a,
  'ce000000-1111-0000-0000-00000000000b'::uuid AS emp_b,
  'ce000000-0000-0000-0000-00000000000a'::uuid AS owner_a,
  'ce000000-0000-0000-0000-00000000000d'::uuid AS member_a,
  'ce000000-0000-0000-0000-00000000000e'::uuid AS resp_a,
  'ce000000-0000-0000-0000-00000000000b'::uuid AS owner_b,
  'ce000000-0000-0000-0000-0000000000ad'::uuid AS moderator,
  'ce000000-0000-0000-0000-000000000c01'::uuid AS cand_sv,
  'ce000000-0000-0000-0000-000000000c02'::uuid AS cand_en,
  'ce000000-0000-0000-0000-000000000c03'::uuid AS cand_noname,
  'ce000000-0000-0000-0000-000000000c04'::uuid AS cand_off,
  'ce000000-2222-0000-0000-000000000001'::uuid AS job_a,
  'ce000000-2222-0000-0000-000000000002'::uuid AS job_off,
  'ce000000-2222-0000-0000-00000000000b'::uuid AS job_b,
  'ce000000-3333-0000-0000-000000000001'::uuid AS app_sv,
  'ce000000-3333-0000-0000-000000000002'::uuid AS app_en,
  'ce000000-3333-0000-0000-000000000003'::uuid AS app_noname,
  'ce000000-3333-0000-0000-000000000004'::uuid AS app_off,
  'ce000000-3333-0000-0000-000000000005'::uuid AS app_fail,
  'ce000000-3333-0000-0000-000000000006'::uuid AS app_before;
GRANT SELECT ON rc TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT owner_a,     'owner-a@rc.test',   now(), '{"display_name":"Owner A"}'::jsonb FROM rc UNION ALL
SELECT member_a,    'member-a@rc.test',  now(), '{"display_name":"Member A"}'::jsonb FROM rc UNION ALL
SELECT resp_a,      'resp-a@rc.test',    now(), '{"display_name":"Resp A"}'::jsonb FROM rc UNION ALL
SELECT owner_b,     'owner-b@rc.test',   now(), '{"display_name":"Owner B"}'::jsonb FROM rc UNION ALL
SELECT moderator,   'mod@rc.test',       now(), '{"display_name":"Mod"}'::jsonb FROM rc UNION ALL
SELECT cand_sv,     'kim@rc.test',       now(), '{"display_name":"Kim Kandidat","locale":"sv"}'::jsonb FROM rc UNION ALL
SELECT cand_en,     'alex@rc.test',      now(), '{"display_name":"Alex Applicant","locale":"en"}'::jsonb FROM rc UNION ALL
SELECT cand_noname, 'noname@rc.test',    now(), '{"display_name":"x"}'::jsonb FROM rc UNION ALL
SELECT cand_off,    'off@rc.test',       now(), '{"display_name":"Ove Off"}'::jsonb FROM rc;
UPDATE public.profiles SET display_name = NULL WHERE id = (SELECT cand_noname FROM rc);
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM rc;

INSERT INTO public.employers (id, name, slug, status)
SELECT emp_a, 'Mottagning A AB', 'mottagning-a', 'active' FROM rc UNION ALL
SELECT emp_b, 'Mottagning B AB', 'mottagning-b', 'active' FROM rc;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp_a, owner_a,  'owner',  'active' FROM rc UNION ALL
SELECT emp_a, member_a, 'member', 'active' FROM rc UNION ALL
SELECT emp_a, resp_a,   'member', 'active' FROM rc UNION ALL
SELECT emp_b, owner_b,  'owner',  'active' FROM rc;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_a,   'rc-job-a',   'RC00001', emp_a, 'Väktare, Gävle', 'Security officer, Gävle', 'internal', 'draft' FROM rc UNION ALL
SELECT job_off, 'rc-job-off', 'RC00002', emp_a, 'Väktare, Luleå', 'Security officer, Luleå', 'internal', 'draft' FROM rc;
SELECT public.rec_save_vacancy_structure(
  (SELECT job_a FROM rc),
  '[{"key":"r1","kind":"mandatory","label_sv":"Väktarutbildning","label_en":"Security officer training"}]'::jsonb,
  '[{"requirement_key":"r1","prompt_sv":"Har du väktarutbildning?","prompt_en":"Do you hold security officer training?","answer_kind":"yes_no","is_required":true}]'::jsonb);
SELECT public.rec_set_recruitment_responsible((SELECT job_a FROM rc), (SELECT resp_a FROM rc));
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000b';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_b, 'rc-job-b', 'RC0000B', emp_b, 'Väktare B', 'Guard B', 'internal', 'draft' FROM rc;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days'
 WHERE id IN (SELECT job_a FROM rc UNION ALL SELECT job_off FROM rc UNION ALL SELECT job_b FROM rc);
RESET ROLE; RESET request.jwt.claim.sub;

-- An application that EXISTED before the receipt was switched on.
SET CONSTRAINTS job_applications_zz_receipt IMMEDIATE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c03';
SELECT public.rec_submit_application((SELECT app_before FROM rc), (SELECT job_a FROM rc), NULL, NULL,
  'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true)));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT coalesce(receipt_enabled, false) FROM public.recruitment_settings s, rc WHERE s.job_id = rc.job_a) = false
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_before),
  'F1 a recruitment that exists today has the receipt OFF, and an application made then got none');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP T — the setting'; END $$;

SELECT pg_temp.ok(
  public.rec_receipt_default('sv', 'subject') LIKE '%{tjänst}%'
  AND public.rec_receipt_default('sv', 'body') LIKE 'Hej {namn}!%'
  AND public.rec_receipt_default('sv', 'body') LIKE '%{länk}%'
  AND public.rec_receipt_default('en', 'body') LIKE 'Hi {name}!%'
  AND public.rec_receipt_default('sv', 'body') NOT ILIKE '%inom %dag%'
  AND public.rec_receipt_default('en', 'body') NOT ILIKE '%within %day%',
  'T1 the standard text greets by name, names the vacancy, links the application, and promises no response time');
SELECT pg_temp.ok(
  public.rec_render_receipt('Hej {namn}, {tjänst} hos {företag}: {länk}', 'Kim', 'Väktare', 'AB', '/x')
    = 'Hej Kim, Väktare hos AB: /x'
  AND public.rec_render_receipt('Hi {name}, {job} at {company}: {link}', 'Alex', 'Guard', 'AB', '/x')
    = 'Hi Alex, Guard at AB: /x'
  AND public.rec_render_receipt('Hej {namn}!', '', 'V', 'AB', '/x') = 'Hej!',
  'T2 the placeholders render in either language, and an empty name leaves no hole');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000d';  -- a plain member
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_receipt_settings(%L, true)$f$, (SELECT job_a FROM rc)),
  'RECRUITMENT_NOT_PERMITTED', 'T3 a member who is not responsible cannot switch the receipt on');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000b';  -- the other organisation
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_receipt_settings(%L, true)$f$, (SELECT job_a FROM rc)),
  'RECRUITMENT_NOT_FOUND', 'T4 another organisation cannot, and is told the recruitment does not exist');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_receipt_settings(%L, true)$f$, (SELECT job_a FROM rc)),
  'permission denied', 'T5 anon cannot execute the setting at all');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000e';  -- the responsible person
CREATE TEMP TABLE t6 ON COMMIT DROP AS
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true, NULL, NULL, NULL, NULL, NULL) AS v;
SELECT pg_temp.ok(
  (SELECT v FROM t6) > 0
  AND (SELECT receipt_enabled AND receipt_body_sv IS NULL AND receipt_updated_by = (SELECT resp_a FROM rc)
         FROM public.recruitment_settings s, rc WHERE s.job_id = rc.job_a),
  'T6 the responsible person switches it on with the standard text, and the change is attributed');
CREATE TEMP TABLE t7 ON COMMIT DROP AS
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true,
    public.rec_receipt_default('sv', 'subject'), public.rec_receipt_default('sv', 'body'), NULL, NULL, NULL) AS v;
SELECT pg_temp.ok(
  (SELECT v FROM t7) > 0
  AND (SELECT receipt_subject_sv IS NULL AND receipt_body_sv IS NULL
         FROM public.recruitment_settings s, rc WHERE s.job_id = rc.job_a),
  'T7 saving the standard text verbatim is stored as "standard", so a later improvement reaches it');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_receipt_settings(%L, true, 'x', 'y', NULL, NULL, 1)$f$, (SELECT job_a FROM rc)),
  'STALE_VERSION', 'T8 a stale version is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_set_receipt_settings(%L, true, 'x', %L, NULL, NULL, NULL)$f$,
  (SELECT job_a FROM rc), repeat('a', 4001)),
  'recruitment_settings_receipt_text_shape', 'T9 a body over 4 000 characters is refused');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_before),
  'T10 switching the receipt on wrote nothing to the application that already existed');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP R — the receipt'; END $$;

-- A failed submission (required answer missing) leaves no application and
-- no receipt, although the trigger fires immediately here.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_submit_application(
    %L, %L, NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb)$f$,
  (SELECT app_fail FROM rc), (SELECT job_a FROM rc)),
  'APPLICATION_ANSWERS_MISSING', 'R1 a submission that fails its required answers is refused');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.job_applications a, rc WHERE a.id = rc.app_fail)
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_fail),
  'R2 and neither an application nor a receipt survives it');

-- A correct submission in Swedish.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c01';
CREATE TEMP TABLE r_sv ON COMMIT DROP AS
SELECT public.rec_submit_application((SELECT app_sv FROM rc), (SELECT job_a FROM rc), NULL, 'Hej', 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true))) AS res;
GRANT SELECT ON r_sv TO PUBLIC;
-- The replay of the same submission (a retry after a lost response).
CREATE TEMP TABLE r_sv2 ON COMMIT DROP AS
SELECT public.rec_submit_application((SELECT app_sv FROM rc), (SELECT job_a FROM rc), NULL, 'Hej', 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true))) AS res;
GRANT SELECT ON r_sv2 TO PUBLIC;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv AND m.kind = 'receipt') = 1,
  'R3 a correct submission has exactly one receipt');
SELECT pg_temp.ok(
  (SELECT (res->>'replayed')::boolean FROM r_sv2) = true
  AND (SELECT count(*) FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 1,
  'R4 a replayed submission answers "replayed" and writes no second receipt');
SELECT pg_temp.ok(
  (SELECT m.status = 'sent' AND m.sent_at IS NOT NULL AND m.sent_by IS NULL AND m.created_by IS NULL
          AND m.email_status = 'not_attempted' AND m.language = 'sv'
          AND m.idempotency_key = 'receipt:' || rc.app_sv::text
     FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'R5 the receipt is a SENT message by nobody, in the candidate''s language, with the e-mail not yet attempted');
SELECT pg_temp.ok(
  (SELECT m.subject = 'Vi har tagit emot din ansökan – Väktare, Gävle'
          AND m.body LIKE 'Hej Kim!%'
          AND m.body LIKE '%tjänsten Väktare, Gävle hos Mottagning A AB%'
          AND m.body LIKE '%/my-career/applications?application=' || rc.app_sv::text || '%'
          AND position('{' in m.body) = 0
     FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'R6 the text is rendered: first name, vacancy, company and a link to THIS application, no placeholder left');
SELECT pg_temp.must_fail(format($f$INSERT INTO public.recruitment_messages (application_id, job_id, employer_id, kind, subject, body, language, status, sent_at)
  SELECT %L, job_a, emp_a, 'receipt', 'Igen', 'Igen', 'sv', 'sent', now() FROM rc$f$, (SELECT app_sv FROM rc)),
  'recruitment_messages_receipt_once_idx', 'R7 a second receipt for the same application is impossible, whatever writes it');

-- A submission in English, after the employer has edited the English text.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true, NULL, NULL,
  'Received: {job}', E'Hello {name},\nwe have your application for {job} at {company}. {link}');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c02';
SELECT public.rec_submit_application((SELECT app_en FROM rc), (SELECT job_a FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', false)));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT m.language = 'en' AND m.subject = 'Received: Security officer, Gävle'
          AND m.body LIKE 'Hello Alex,%Security officer, Gävle at Mottagning A AB.%'
     FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'R8 an English-speaking candidate gets the English text, as it was when they applied');

-- The template changes afterwards; the receipts already written do not.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true, 'Ny rad', 'Ny text {namn}', 'New', 'New {name}');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT m.subject FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 'Vi har tagit emot din ansökan – Väktare, Gävle'
  AND (SELECT m.subject FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en) = 'Received: Security officer, Gävle',
  'R9 a later template change leaves the receipts already written exactly as they were');

-- Switched off: a new application gets nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), false);
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c04';
SELECT public.rec_submit_application((SELECT app_off FROM rc), (SELECT job_a FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true)));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_off),
  'R10 with the receipt off, a new application gets none');
-- Switched on again with the standard text: nothing is written for the
-- three applications that exist, and an unnamed candidate is greeted cleanly.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages m, rc WHERE m.job_id = rc.job_a AND m.kind = 'receipt') = 2,
  'R11 switching it on again writes nothing retroactively');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c03';
SELECT public.rec_submit_application((SELECT app_noname FROM rc), (SELECT job_off FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false, '[]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_noname),
  'R12 a recruitment nobody switched on (job_off) sends nothing');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP E — the e-mail copy'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c02';  -- Alex, about Kim's application
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L)$f$, (SELECT app_sv FROM rc)),
  'APPLICATION_NOT_FOUND', 'E1 another candidate cannot claim somebody else''s receipt e-mail');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L)$f$, (SELECT app_sv FROM rc)),
  'APPLICATION_NOT_FOUND', 'E2 nor can another organisation');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L)$f$, (SELECT app_sv FROM rc)),
  'APPLICATION_NOT_FOUND', 'E3 nor a member who may not write to candidates');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c01';  -- Kim, the applicant
CREATE TEMP TABLE e1 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc));
GRANT SELECT ON e1 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT outcome = 'claimed' AND recipient_email = 'kim@rc.test' AND employer_name = 'Mottagning A AB'
          AND job_title = 'Väktare, Gävle' AND language = 'sv' FROM e1),
  'E4 the applicant''s own request claims the e-mail and is handed the address and the envelope');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc))) = 'in_progress',
  'E5 a second request while it is in flight sends nothing more');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, true)$f$, (SELECT app_sv FROM rc)),
  'RECRUITMENT_NOT_PERMITTED', 'E6 the applicant cannot force a retry');
SELECT pg_temp.ok(public.rec_settle_receipt_send((SELECT app_sv FROM rc), 'not_configured') = 'not_configured',
  'E7 an environment without mail settles as not configured');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc))) = 'not_configured',
  'E8 and asking again does not retry on its own');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000e';  -- the responsible person
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc), true)) = 'claimed',
  'E9 a manager may retry once mail is configured');
CREATE TEMP TABLE e10 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT app_sv FROM rc), 'failed', 'HTTP_500') AS v;
SELECT pg_temp.ok((SELECT v FROM e10) = 'failed'
  AND (SELECT email_error FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 'HTTP_500',
  'E10 a provider failure is recorded with its status');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc), true)) = 'claimed',
  'E11 a failed e-mail can be retried by a person');
-- The claim is left unsettled and ages past the window: the outcome is
-- UNKNOWN, not "nothing was sent" -- and not resent by itself.
RESET ROLE; RESET request.jwt.claim.sub;
UPDATE public.recruitment_messages SET email_claimed_at = now() - interval '10 minutes'
 WHERE application_id = (SELECT app_sv FROM rc);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000e';
CREATE TEMP TABLE e12 ON COMMIT DROP AS SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc));
SELECT pg_temp.ok((SELECT outcome FROM e12) = 'unknown'
  AND (SELECT email_status = 'unknown' AND email_error = 'NO_SETTLE'
         FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'E12 a claim that was never settled is reported as unknown, and stays so');
SELECT pg_temp.ok(public.rec_settle_receipt_send((SELECT app_sv FROM rc), 'sent') = 'unknown',
  'E13 a late settle cannot overwrite the unknown outcome');
CREATE TEMP TABLE e14 ON COMMIT DROP AS SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc), true);
CREATE TEMP TABLE e14b ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT app_sv FROM rc), 'sent') AS v;
SELECT pg_temp.ok((SELECT outcome FROM e14) = 'claimed' AND (SELECT v FROM e14b) = 'sent',
  'E14 a person''s retry resolves it, and the provider''s acceptance is recorded');
CREATE TEMP TABLE e15 ON COMMIT DROP AS SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc), true);
CREATE TEMP TABLE e15b ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT app_sv FROM rc), 'failed', 'late') AS v;
SELECT pg_temp.ok((SELECT outcome FROM e15) = 'already_sent' AND (SELECT v FROM e15b) = 'sent',
  'E15 once accepted, nothing sends it again and a late failure cannot overwrite it');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 1
  AND (SELECT email_attempts FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 4,
  'E16 through all of that: ONE message, four recorded attempts');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_off FROM rc))) = 'none',
  'E17 an application without a receipt answers "none", refusing nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP V — who sees it'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c01';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages) = 1
  AND (SELECT kind FROM public.recruitment_messages) = 'receipt'
  AND (SELECT application_id FROM public.recruitment_messages) = (SELECT app_sv FROM rc),
  'V1 Kim reads exactly one message: their own receipt, and not Alex''s');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000d';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages WHERE kind = 'receipt') = 2
  AND (SELECT email_status FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv) = 'sent'
  AND (SELECT email_status FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en) = 'not_attempted',
  'V2 a member of the organisation sees both receipts with their delivery status');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages) = 0,
  'V3 the organisation next door sees none');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.recruitment_messages', 'permission denied',
  'V4 anon cannot read messages at all');
RESET ROLE;

ROLLBACK;
