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
--   S · server only     claim, settle and recovery are service_role's;
--                       no candidate, employer or anon can drive them
--   E · the attempt     every attempt has an identity; an answer counts
--                       only for the attempt it belongs to; a person's
--                       role is checked for the person the server names
--   U · unknown         an unsettled or unanswered claim is unknown, never
--                       "not sent"; inside the provider's window a resend
--                       under the same key is safe, after it a person must
--                       accept a possible duplicate and the key changes
--   D · recovery        what is due is handed over once, bounded, with a
--                       fixed recipient; nothing retroactive
--   G · no silent gap   a receipt that cannot be written fails the
--                       application's own transaction
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
  'ce000000-0000-0000-0000-000000000c05'::uuid AS cand_five,
  'ce000000-0000-0000-0000-000000000c06'::uuid AS cand_six,
  'ce000000-0000-0000-0000-000000000c07'::uuid AS cand_seven,
  'ce000000-2222-0000-0000-000000000001'::uuid AS job_a,
  'ce000000-2222-0000-0000-000000000002'::uuid AS job_off,
  'ce000000-2222-0000-0000-00000000000b'::uuid AS job_b,
  'ce000000-3333-0000-0000-000000000001'::uuid AS app_sv,
  'ce000000-3333-0000-0000-000000000002'::uuid AS app_en,
  'ce000000-3333-0000-0000-000000000003'::uuid AS app_noname,
  'ce000000-3333-0000-0000-000000000004'::uuid AS app_off,
  'ce000000-3333-0000-0000-000000000005'::uuid AS app_fail,
  'ce000000-3333-0000-0000-000000000006'::uuid AS app_before,
  'ce000000-3333-0000-0000-000000000007'::uuid AS app_five,
  'ce000000-3333-0000-0000-000000000008'::uuid AS app_six,
  'ce000000-3333-0000-0000-000000000009'::uuid AS app_seven;
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
SELECT cand_off,    'off@rc.test',       now(), '{"display_name":"Ove Off"}'::jsonb FROM rc UNION ALL
SELECT cand_five,   'fem@rc.test',       now(), '{"display_name":"Fem Femte"}'::jsonb FROM rc UNION ALL
SELECT cand_six,    'sex@rc.test',       now(), '{"display_name":"x"}'::jsonb FROM rc UNION ALL
SELECT cand_seven,  'sju@rc.test',       now(), '{"display_name":"Sju Sjunde"}'::jsonb FROM rc;
UPDATE public.profiles SET display_name = NULL WHERE id IN (SELECT cand_noname FROM rc UNION ALL SELECT cand_six FROM rc);
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
DO $$ BEGIN RAISE NOTICE 'GROUP S — server only'; END $$;

-- The applicant, a manager, a plain member, the other organisation and anon:
-- none of them can claim, settle or recover an e-mail. The truth about the
-- e-mail is written by trusted server code (service_role) and nobody else.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c01';  -- Kim, the applicant
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L)$f$, (SELECT app_sv FROM rc)),
  'permission denied', 'S1 the applicant cannot claim their own receipt e-mail through the API');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_settle_receipt_send(%L, 'sent', NULL, 'forged')$f$, gen_random_uuid()),
  'permission denied', 'S2 the applicant cannot attest "sent"');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_claim_due_receipts(10)',
  'permission denied', 'S3 nor run the recovery');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';  -- the owner
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L, true)$f$, (SELECT app_sv FROM rc), (SELECT owner_a FROM rc)),
  'permission denied', 'S4 an owner cannot claim directly either, even naming themself');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_settle_receipt_send(%L, 'sent', NULL, 'forged')$f$, gen_random_uuid()),
  'permission denied', 'S5 an employer cannot attest "sent"');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L)$f$, (SELECT app_sv FROM rc)),
  'permission denied', 'S6 anon cannot claim');
SELECT pg_temp.must_fail('SELECT * FROM public.rec_claim_due_receipts(10)',
  'permission denied', 'S7 anon cannot run the recovery');
RESET ROLE;
SELECT pg_temp.ok(
  NOT has_function_privilege('service_role', 'public.rec_receipt_take_attempt(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.rec_receipt_actor(public.job_applications,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_receipt_take_attempt(uuid,uuid)', 'EXECUTE'),
  'S8 the internal helpers are reachable through the claim only, not even by the server');
SELECT pg_temp.ok(
  (SELECT email_status = 'not_attempted' AND email_attempt_id IS NULL AND email_attempts = 0
     FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'S9 none of that touched the receipt');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP E — the attempt'; END $$;

SET LOCAL ROLE service_role;
-- The system's own dispatch right after the submission (no actor).
CREATE TEMP TABLE e1 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc));
GRANT SELECT ON e1 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT outcome = 'claimed' AND attempt_id IS NOT NULL AND recipient_email = 'kim@rc.test'
          AND application_id = (SELECT app_sv FROM rc)
          AND provider_key = 'receipt:' || (SELECT app_sv FROM rc)::text
          AND employer_name = 'Mottagning A AB' AND job_title = 'Väktare, Gävle' AND language = 'sv'
          AND attempts = 1 AND window_open
     FROM e1),
  'E1 the server''s claim gets an attempt id, the address, the envelope and the idempotency key of the logical receipt');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc))) = 'in_progress',
  'E2 a second claim while it is in flight sends nothing more');
CREATE TEMP TABLE e3 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send(gen_random_uuid(), 'sent', NULL, 'prov-x') AS v;
SELECT pg_temp.ok((SELECT v FROM e3) = 'stale'
  AND (SELECT email_status = 'sending' AND email_provider_id IS NULL FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'E3 an answer for an attempt that is not the current one is stale and changes nothing');
CREATE TEMP TABLE e4 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM e1), 'sent', NULL, 'prov-1') AS v;
SELECT pg_temp.ok((SELECT v FROM e4) = 'sent'
  AND (SELECT email_status = 'sent' AND email_provider_id = 'prov-1' AND email_settled_at IS NOT NULL
         FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'E4 the current attempt''s answer is recorded with the provider''s id');
CREATE TEMP TABLE e5 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM e1), 'failed', 'late') AS v;
SELECT pg_temp.ok((SELECT v FROM e5) = 'sent'
  AND (SELECT email_status = 'sent' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv),
  'E5 once accepted, a late failure for the same attempt cannot overwrite it');
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_receipt_send((SELECT app_sv FROM rc))) = 'already_sent',
  'E6 and nothing sends it again');
SELECT pg_temp.must_fail('SELECT public.rec_settle_receipt_send(gen_random_uuid(), ''delivered'')',
  'MESSAGE_RESULT_INVALID', 'E7 "delivered" is not a result this product can record');

-- Who the server may act for. The person is named by the server; the
-- database decides what they are to this application.
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L)$f$, (SELECT app_en FROM rc), (SELECT cand_sv FROM rc)),
  'APPLICATION_NOT_FOUND', 'E8 another candidate is nobody to this application');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L, true)$f$, (SELECT app_en FROM rc), (SELECT owner_b FROM rc)),
  'APPLICATION_NOT_FOUND', 'E9 nor is the other organisation''s owner');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L, true)$f$, (SELECT app_en FROM rc), (SELECT member_a FROM rc)),
  'APPLICATION_NOT_FOUND', 'E10 nor a member who may not write to candidates');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L, true)$f$, (SELECT app_en FROM rc), (SELECT cand_en FROM rc)),
  'RECRUITMENT_NOT_PERMITTED', 'E11 the applicant may not force a retry');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, NULL, true, true)$f$, (SELECT app_en FROM rc)),
  'RECRUITMENT_NOT_PERMITTED', 'E12 the system itself may never accept a duplicate');
RESET ROLE;

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP U — unknown, and the provider''s window'; END $$;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE u1 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_en FROM rc), (SELECT resp_a FROM rc), true);
GRANT SELECT ON u1 TO PUBLIC;
SELECT pg_temp.ok((SELECT outcome = 'claimed' AND recipient_email = 'alex@rc.test' AND language = 'en' AND attempts = 1 FROM u1),
  'U1 the responsible person''s retry claims the attempt');
CREATE TEMP TABLE u2 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM u1), 'unknown', 'HTTP_503') AS v;
SELECT pg_temp.ok((SELECT v FROM u2) = 'unknown'
  AND (SELECT email_status = 'unknown' AND email_error = 'HTTP_503' AND email_key_first_used_at IS NOT NULL
         FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U2 a 5xx, a timeout or a lost answer is recorded as UNKNOWN with its reason, never as failed and never as sent');
CREATE TEMP TABLE u3 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_en FROM rc));
SELECT pg_temp.ok((SELECT outcome = 'unknown' AND window_open FROM u3)
  AND (SELECT email_status = 'unknown' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U3 a plain claim does not resend an unknown outcome on its own');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.rec_claim_due_receipts(50) d, rc WHERE d.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)),
  'U4 the recovery leaves an unknown outcome alone for two minutes -- the answer may still be on its way');
RESET ROLE;
-- The candidate changes their address meanwhile; the logical e-mail keeps
-- the one it was first sent to, so the retry carries the same payload under
-- the same key.
UPDATE auth.users SET email = 'alex-new@rc.test' WHERE id = (SELECT cand_en FROM rc);
UPDATE public.recruitment_messages SET email_claimed_at = now() - interval '3 minutes'
 WHERE application_id = (SELECT app_en FROM rc);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE u5 ON COMMIT DROP AS SELECT * FROM public.rec_claim_due_receipts(50);
GRANT SELECT ON u5 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM u5, rc WHERE u5.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)) = 1
  AND (SELECT recipient_email = 'alex@rc.test' AND provider_key = 'receipt:' || (SELECT app_en FROM rc)::text AND attempts = 2
         FROM u5, rc WHERE u5.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)),
  'U5 inside the window the recovery resends under the SAME key to the SAME address: the provider deduplicates it');
SELECT pg_temp.ok((SELECT attempt_id FROM u5, rc WHERE u5.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)) <> (SELECT attempt_id FROM u1),
  'U6 and it is a new attempt with an identity of its own');
CREATE TEMP TABLE u7 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM u1), 'sent', NULL, 'prov-old') AS v;
SELECT pg_temp.ok((SELECT v FROM u7) = 'stale'
  AND (SELECT email_status = 'sending' AND email_provider_id IS NULL FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U7 the old attempt''s late answer cannot touch the new attempt');
CREATE TEMP TABLE u8 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send(
  (SELECT attempt_id FROM u5, rc WHERE u5.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)), 'unknown', 'TIMEOUT') AS v;
SELECT pg_temp.ok((SELECT v FROM u8) = 'unknown', 'U8 the new attempt times out too: unknown again');
RESET ROLE;
-- The window closes (the first request under this key was a day ago).
UPDATE public.recruitment_messages SET email_key_first_used_at = now() - interval '25 hours', email_claimed_at = now() - interval '3 minutes'
 WHERE application_id = (SELECT app_en FROM rc);
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.rec_claim_due_receipts(50) d, rc WHERE d.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_en)),
  'U9 after the provider''s window the recovery never resends by itself');
CREATE TEMP TABLE u10 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_en FROM rc), (SELECT resp_a FROM rc), true);
SELECT pg_temp.ok((SELECT outcome = 'unknown' AND NOT window_open FROM u10)
  AND (SELECT email_status = 'unknown' AND email_key_generation = 0 FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U10 nor does a person''s ordinary retry: the answer says the window has closed and sends nothing');
SELECT pg_temp.must_fail(format($f$SELECT * FROM public.rec_claim_receipt_send(%L, %L, true, true)$f$, (SELECT app_en FROM rc), (SELECT cand_en FROM rc)),
  'RECRUITMENT_NOT_PERMITTED', 'U11 the applicant cannot accept a duplicate on the employer''s behalf');
CREATE TEMP TABLE u12 ON COMMIT DROP AS SELECT * FROM public.rec_claim_receipt_send((SELECT app_en FROM rc), (SELECT resp_a FROM rc), true, true);
GRANT SELECT ON u12 TO PUBLIC;
SELECT pg_temp.ok((SELECT outcome = 'claimed' AND provider_key = 'receipt:' || (SELECT app_en FROM rc)::text || ':r1'
                     AND recipient_email = 'alex@rc.test' AND attempts = 3 FROM u12)
  AND (SELECT email_key_generation = 1 AND email_key_first_used_at > now() - interval '1 minute'
         FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U12 a manager who accepts the possible duplicate resends under a NEW key generation, to the same address');
CREATE TEMP TABLE u13 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM u12), 'sent', NULL, 'prov-2') AS v;
SELECT pg_temp.ok((SELECT v FROM u13) = 'sent'
  AND (SELECT email_status = 'sent' AND email_provider_id = 'prov-2' AND email_attempts = 3
         FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_en),
  'U13 and the provider''s acceptance is recorded: ONE message, three attempts, one provider id');
RESET ROLE;

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP D — recovery'; END $$;

-- A fifth candidate applies; the server "dies" before the dispatch, so the
-- receipt sits at not_attempted. The recovery must find it -- but not in the
-- first minute, when the saving request itself may still be sending.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c05';
SELECT public.rec_submit_application((SELECT app_five FROM rc), (SELECT job_a FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true)));
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.rec_claim_due_receipts(50) d, rc WHERE d.message_id = (SELECT id FROM public.recruitment_messages WHERE application_id = rc.app_five)),
  'D1 a receipt written a moment ago is the saving request''s to send, not the recovery''s');
RESET ROLE;
UPDATE public.recruitment_messages SET created_at = now() - interval '2 minutes' WHERE application_id = (SELECT app_five FROM rc);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d2 ON COMMIT DROP AS SELECT * FROM public.rec_claim_due_receipts(50);
GRANT SELECT ON d2 TO PUBLIC;
SELECT pg_temp.ok(
  (SELECT count(*) FROM d2) = 1
  AND (SELECT recipient_email = 'fem@rc.test' AND attempts = 1 AND attempt_id IS NOT NULL FROM d2),
  'D2 a send that never started is recovered, once, with its address and a first attempt');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_claim_due_receipts(50)) = 0,
  'D3 a second recovery right after finds nothing: the claim is in flight');
RESET ROLE;
-- That attempt ages out unsettled (the sweep died mid-send).
UPDATE public.recruitment_messages SET email_claimed_at = now() - interval '3 minutes' WHERE application_id = (SELECT app_five FROM rc);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d4 ON COMMIT DROP AS SELECT * FROM public.rec_claim_due_receipts(50);
GRANT SELECT ON d4 TO PUBLIC;
SELECT pg_temp.ok((SELECT count(*) FROM d4) = 1 AND (SELECT attempts = 2 FROM d4) AND (SELECT attempt_id FROM d4) <> (SELECT attempt_id FROM d2)
  AND (SELECT provider_key FROM d4) = (SELECT provider_key FROM d2),
  'D4 an aged-out claim is unknown and, inside the window, recovered under the same key as a new attempt');
CREATE TEMP TABLE d5 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM d2), 'sent', NULL, 'prov-dead') AS v;
SELECT pg_temp.ok((SELECT v FROM d5) = 'stale'
  AND (SELECT email_status = 'sending' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_five),
  'D5 the dead sweep''s answer, arriving now, is stale');
CREATE TEMP TABLE d6 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM d4), 'sent', NULL, 'prov-5') AS v;
SELECT pg_temp.ok((SELECT v FROM d6) = 'sent',
  'D6 the live attempt''s answer is the one that counts');
-- Bounded: five attempts and the recovery stops; a person is told.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
-- The owner's own subject renders to nothing for an unnamed candidate;
-- the standard text takes over rather than refusing the application.
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true, '{namn}', NULL, NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c06';
SELECT public.rec_submit_application((SELECT app_six FROM rc), (SELECT job_a FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true)));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  (SELECT subject = 'Vi har tagit emot din ansökan – Väktare, Gävle' AND body LIKE 'Hej!%'
     FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_six),
  'D7 an own text that renders to nothing falls back to the standard text; the application is not refused');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000a';
SELECT public.rec_set_receipt_settings((SELECT job_a FROM rc), true);
RESET ROLE; RESET request.jwt.claim.sub;
UPDATE public.recruitment_messages
   SET email_status = 'unknown', email_error = 'TIMEOUT', email_attempts = 5, email_attempt_id = gen_random_uuid(),
       email_claimed_at = now() - interval '10 minutes', email_key_first_used_at = now() - interval '1 hour', created_at = now() - interval '1 hour'
 WHERE application_id = (SELECT app_six FROM rc);
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_claim_due_receipts(50)) = 0,
  'D8 after five attempts the recovery stops, even inside the window');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000d';  -- a plain member
SELECT pg_temp.ok(public.rec_receipts_needing_attention((SELECT emp_a FROM rc)) = 1,
  'D9 and the organisation is shown exactly one receipt that needs a person');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(public.rec_receipts_needing_attention((SELECT emp_a FROM rc)) = 0,
  'D10 the organisation next door is shown none of it');
RESET ROLE; RESET request.jwt.claim.sub;
-- The provider says this key was already used with another payload: an
-- earlier request under it went through with something else, and only a
-- person can decide. Not resent, counted as needing attention.
UPDATE public.recruitment_messages
   SET email_status = 'unknown', email_error = 'IDEMPOTENCY_PAYLOAD_MISMATCH', email_attempts = 1,
       email_claimed_at = now() - interval '10 minutes', email_key_first_used_at = now() - interval '1 hour'
 WHERE application_id = (SELECT app_six FROM rc);
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_claim_due_receipts(50)) = 0,
  'D8b an idempotency-key conflict at the provider is never resent by the recovery');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-00000000000d';
SELECT pg_temp.ok(public.rec_receipts_needing_attention((SELECT emp_a FROM rc)) = 1,
  'D8c and it is shown as one receipt that needs a person');
RESET ROLE; RESET request.jwt.claim.sub;
-- A definite failure (a 4xx) is a person's; a rate limit is retried, bounded.
UPDATE public.recruitment_messages
   SET email_status = 'failed', email_error = 'HTTP_422', email_attempts = 1, email_claimed_at = now() - interval '1 hour'
 WHERE application_id = (SELECT app_six FROM rc);
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_claim_due_receipts(50)) = 0,
  'D11 a definite refusal (4xx) is not retried by the recovery');
RESET ROLE;
UPDATE public.recruitment_messages SET email_error = 'HTTP_429' WHERE application_id = (SELECT app_six FROM rc);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE d12 ON COMMIT DROP AS SELECT * FROM public.rec_claim_due_receipts(50);
SELECT pg_temp.ok((SELECT count(*) FROM d12) = 1 AND (SELECT attempts = 2 FROM d12),
  'D12 a rate limit is retried after ten minutes');
CREATE TEMP TABLE d13 ON COMMIT DROP AS SELECT public.rec_settle_receipt_send((SELECT attempt_id FROM d12), 'not_configured') AS v;
SELECT pg_temp.ok((SELECT v FROM d13) = 'not_configured'
  AND (SELECT count(*) FROM public.rec_claim_due_receipts(50)) = 0,
  'D13 an environment without mail settles as not configured, and the recovery does not loop on it');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.recruitment_messages m, rc WHERE m.job_id = rc.job_a AND m.kind = 'receipt') = 4
  AND NOT EXISTS (SELECT 1 FROM public.recruitment_messages m, rc WHERE m.application_id IN (rc.app_before, rc.app_off)),
  'D14 through all of that the recovery generated nothing: four receipts for four submissions made with the receipt on');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP G — no silent gap'; END $$;

-- The receipt cannot be written (simulated at the table): the application's
-- own transaction fails with it, loudly. No application without its receipt.
CREATE FUNCTION pg_temp.refuse_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'receipt' THEN RAISE EXCEPTION 'SIMULATED_RECEIPT_WRITE_FAILURE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_refuse_receipt BEFORE INSERT ON public.recruitment_messages
  FOR EACH ROW EXECUTE FUNCTION pg_temp.refuse_receipt();
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c07';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_submit_application(%L, %L, NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id', %L, 'answer_bool', true)))$f$,
  (SELECT app_seven FROM rc), (SELECT job_a FROM rc), (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a)),
  'SIMULATED_RECEIPT_WRITE_FAILURE', 'G1 a receipt that cannot be written fails the application''s own transaction');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.job_applications a, rc WHERE a.id = rc.app_seven),
  'G2 so no application exists without its receipt');
DROP TRIGGER zz_refuse_receipt ON public.recruitment_messages;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ce000000-0000-0000-0000-000000000c07';
SELECT public.rec_submit_application((SELECT app_seven FROM rc), (SELECT job_a FROM rc), NULL, NULL, 'x/cv.pdf', 'cv.pdf', 100, 'upload', NULL, false,
  jsonb_build_array(jsonb_build_object('question_id',
    (SELECT q.id FROM public.recruitment_questions q, rc WHERE q.job_id = rc.job_a), 'answer_bool', true)));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.job_applications a, rc WHERE a.id = rc.app_seven)
  AND (SELECT email_status = 'not_attempted' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_seven),
  'G3 the candidate''s retry saves the application together with its receipt');

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
  (SELECT count(*) FROM public.recruitment_messages WHERE kind = 'receipt') = 5
  AND (SELECT email_status = 'sent' AND email_provider_id = 'prov-1' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_sv)
  AND (SELECT email_status = 'not_configured' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_six)
  AND (SELECT email_status = 'not_attempted' FROM public.recruitment_messages m, rc WHERE m.application_id = rc.app_seven),
  'V2 a member of the organisation sees every receipt with its delivery status');
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
