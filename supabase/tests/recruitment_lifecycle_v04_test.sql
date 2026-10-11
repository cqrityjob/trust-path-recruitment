-- Recruitment lifecycle v0.4: the motivated profile change through every write
-- path, the candidate's in-app supplement answer and the BESKT items of an
-- interview composition (slots 20270313100000, 20270314100000, 20270315100000).
--
--   P · a CHANGE of a confirmed requirement profile needs a stated reason and
--       one history row, whichever function a client calls; the legacy
--       rec_ri_confirm_profile still serves the first confirmation and its own
--       recorded replays; a review of version N never reads as a confirmation
--       of version N+1.
--   A · the candidate answers a SENT supplement request on their own open
--       application, in the app, append-only; the employer reads the answer
--       through rec_ri_supplement_state and still resolves by hand.
--   B · a recruitment's composition may select published BESKT items meant for
--       recruitment support, interview phase, ordinary sensitivity; vetting
--       content is never selectable and the core stays mandatory.
--
-- One transaction, ends in ROLLBACK.

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
-- Reads of the private audit schema, for assertions made while acting as a client role.
CREATE OR REPLACE FUNCTION pg_temp.hist_rows(_job uuid) RETURNS bigint
LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM recruiter_intelligence.profile_change_reviews WHERE job_id = _job $$;
CREATE OR REPLACE FUNCTION pg_temp.op_exists(_op uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM recruiter_intelligence.operations WHERE operation_id = _op) $$;
GRANT EXECUTE ON FUNCTION pg_temp.hist_rows(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.op_exists(uuid) TO PUBLIC;

-- ── Fixture ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE fx AS
SELECT
  'b4000000-1111-4000-8000-00000000000a'::uuid AS emp,
  'b4000000-0000-4000-8000-00000000000a'::uuid AS owner_u,
  'b4000000-0000-4000-8000-00000000000d'::uuid AS member_u,
  'b4000000-0000-4000-8000-0000000000ad'::uuid AS moderator,
  'b4000000-0000-4000-8000-000000000c01'::uuid AS cand,
  'b4000000-0000-4000-8000-000000000c02'::uuid AS cand2,
  'b4000000-2222-4000-8000-000000000001'::uuid AS job,
  'b4000000-3333-4000-8000-000000000001'::uuid AS app,
  'b4000000-3333-4000-8000-000000000002'::uuid AS app2;
GRANT SELECT ON fx TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_u,   'v04-owner@rec.test',  now() FROM fx UNION ALL
SELECT member_u,  'v04-member@rec.test', now() FROM fx UNION ALL
SELECT moderator, 'v04-mod@rec.test',    now() FROM fx UNION ALL
SELECT cand,      'v04-cand@rec.test',   now() FROM fx UNION ALL
SELECT cand2,     'v04-cand2@rec.test',  now() FROM fx;
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM fx;
INSERT INTO public.employers (id, name, slug, status) SELECT emp, 'Livscykel v0.4 AB', 'livscykel-v04', 'active' FROM fx;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp, owner_u,  'owner',  'active' FROM fx UNION ALL
SELECT emp, member_u, 'member', 'active' FROM fx;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job, 'v04-job', 'V04REC01', emp, 'Väktare v0.4', 'Guard v0.4', 'internal', 'draft' FROM fx;
SELECT public.rec_save_vacancy_structure((SELECT job FROM fx),
  '[{"key":"r1","kind":"mandatory","label_sv":"Godkänd väktarutbildning","label_en":"Approved training"},
    {"key":"r2","kind":"desirable","label_sv":"B-körkort","label_en":"Driving licence"}]'::jsonb,
  '[{"requirement_key":"r1","prompt_sv":"Har du godkänd väktarutbildning?","prompt_en":"Approved training?","answer_kind":"yes_no","is_required":false}]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days' WHERE id = (SELECT job FROM fx);
RESET ROLE; RESET request.jwt.claim.sub;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at,
  cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes)
SELECT app,  job, emp, cand,  'submitted', now(), 'x/v04-cv-1.pdf', 'cv.pdf', 'application/pdf', 100 FROM fx UNION ALL
SELECT app2, job, emp, cand2, 'submitted', now(), 'x/v04-cv-2.pdf', 'cv.pdf', 'application/pdf', 100 FROM fx;

CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM public.recruitment_requirements WHERE job_id = fx.job AND kind = 'mandatory') AS req_m,
       (SELECT id FROM public.recruitment_requirements WHERE job_id = fx.job AND kind = 'desirable') AS req_d,
       (SELECT id FROM public.recruitment_questions WHERE job_id = fx.job) AS q
  FROM fx;
GRANT SELECT ON ids TO PUBLIC;
-- The first candidate answered yes to the mandatory question; the second did not answer.
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, prompt_sv_snapshot, answer_kind, answer_bool)
SELECT app, q, emp, 'Har du godkänd väktarutbildning?', 'yes_no', true FROM fx, ids;

CREATE TEMP TABLE rules AS
SELECT jsonb_build_array(
     jsonb_build_object('requirementId', req_m, 'kind', 'mandatory', 'acceptedSources', '["application_answer"]'::jsonb,
                        'decisionRule', 'boolean_yes', 'questionId', q, 'instructionSv', 'Kontrollera svaret.', 'instructionEn', NULL),
     jsonb_build_object('requirementId', req_d, 'kind', 'desirable', 'acceptedSources', '["application_cv"]'::jsonb,
                        'decisionRule', 'human_confirmed', 'questionId', NULL, 'instructionSv', 'Enligt CV.', 'instructionEn', NULL)) AS body
  FROM ids;
GRANT SELECT ON rules TO PUBLIC;
CREATE TEMP TABLE res (k text, v jsonb);
GRANT ALL ON res TO PUBLIC;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P — a profile change needs a reason, on every path'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_profile(%L, 0, 'b4000000-9999-4000-8000-000000000001', NULL, (SELECT body FROM rules))$f$, (SELECT job FROM fx)),
  'RECRUITMENT_NOT_PERMITTED', 'P1 a plain member still cannot confirm a profile through the legacy path');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO res SELECT 'v1', public.rec_ri_confirm_profile((SELECT job FROM fx), 0, 'b4000000-9999-4000-8000-000000000001', NULL, (SELECT body FROM rules));
SELECT pg_temp.ok((SELECT (v->>'version')::int FROM res WHERE k = 'v1') = 1
  AND (SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx)) = 1,
  'P2 the FIRST confirmation (0 -> 1) still goes through the legacy path: nothing earlier to motivate against');
SELECT pg_temp.ok(public.rec_ri_confirm_profile((SELECT job FROM fx), 0, 'b4000000-9999-4000-8000-000000000001', NULL, (SELECT body FROM rules)) = (SELECT v FROM res WHERE k = 'v1'),
  'P3 the legacy path replays its own recorded operation unchanged');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_profile(%L, 1, 'b4000000-9999-4000-8000-000000000002', NULL, (SELECT body FROM rules))$f$, (SELECT job FROM fx)),
  'RI_CHANGE_REASON_REQUIRED', 'P4 a CHANGE (1 -> 2) through the legacy path is refused: no reason, no history');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx)) = 1
  AND NOT pg_temp.op_exists('b4000000-9999-4000-8000-000000000002'),
  'P5 ... and leaves no version and no operation behind');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_reviewed_profile(%L, 1, 'b4000000-9999-4000-8000-000000000003', NULL, (SELECT body FROM rules), '   ')$f$, (SELECT job FROM fx)),
  'RI_CHANGE_REASON_REQUIRED', 'P6 the reviewed path refuses a blank reason');

-- A review of version 1, confirmed by a person, before the change.
INSERT INTO res SELECT 'rv1', public.rec_ri_get_review((SELECT app FROM fx));
SELECT pg_temp.ok((SELECT v->>'reviewState' FROM res WHERE k = 'rv1') = 'pending'
  AND (SELECT (v->>'profileVersion')::int FROM res WHERE k = 'rv1') = 1,
  'P7 the application reads version 1 and is pending review');
INSERT INTO res SELECT 'saved', public.rec_ri_save_review((SELECT app FROM fx),
  (SELECT (v->'profile'->>'profileId')::uuid FROM res WHERE k = 'rv1'),
  (SELECT (v->>'revision')::int FROM res WHERE k = 'rv1'),
  (SELECT v->>'bindingToken' FROM res WHERE k = 'rv1'),
  'b4000000-9999-4000-8000-000000000004',
  (SELECT jsonb_agg(jsonb_build_object('requirementId', c->>'requirementId', 'state', c->>'state',
      'sourceKind', c->'source'->>'kind', 'sourceReference', c->'source'->>'reference', 'sourceVersion', c->'source'->>'version',
      'sourceLabel', c->'source'->>'label', 'validUntil', c->>'validUntil', 'note', coalesce(c->>'note', 'Kontrollerad av granskaren.'),
      'neutralQuestion', c->>'neutralQuestion'))
     FROM res, jsonb_array_elements(v->'criteria') c WHERE k = 'rv1'),
  true, 'Boka intervju.', (SELECT owner_u FROM fx), NULL);
SELECT pg_temp.ok((SELECT (v->>'revision')::int FROM res WHERE k = 'saved') = 1
  AND (public.rec_ri_get_review((SELECT app FROM fx))->>'reviewState') = 'reviewed',
  'P8 the review of version 1 is confirmed by a person');

INSERT INTO res SELECT 'v2', public.rec_ri_confirm_reviewed_profile((SELECT job FROM fx), 1, 'b4000000-9999-4000-8000-000000000005', NULL,
  (SELECT jsonb_set(body, '{0,instructionSv}', '"Kontrollera svaret och utbildarens intyg."') FROM rules), 'Utbildningsintyg ska kontrolleras, inte bara svaret.');
SELECT pg_temp.ok((SELECT (v->>'version')::int FROM res WHERE k = 'v2') = 2
  AND pg_temp.hist_rows((SELECT job FROM fx)) = 1,
  'P9 the reviewed path confirms version 2 with its reason and ONE history row');
SELECT pg_temp.ok(public.rec_ri_confirm_reviewed_profile((SELECT job FROM fx), 1, 'b4000000-9999-4000-8000-000000000005', NULL,
  (SELECT jsonb_set(body, '{0,instructionSv}', '"Kontrollera svaret och utbildarens intyg."') FROM rules), 'Utbildningsintyg ska kontrolleras, inte bara svaret.') = (SELECT v FROM res WHERE k = 'v2')
  AND pg_temp.hist_rows((SELECT job FROM fx)) = 1,
  'P10 the same operation again: the same answer, still one history row');
INSERT INTO res SELECT 'hist', public.rec_ri_profile_change_history((SELECT job FROM fx));
SELECT pg_temp.ok(jsonb_array_length((SELECT v FROM res WHERE k = 'hist')) = 1
  AND (SELECT (v->0->>'version')::int FROM res WHERE k = 'hist') = 2
  AND (SELECT v->0->>'reason' FROM res WHERE k = 'hist') = 'Utbildningsintyg ska kontrolleras, inte bara svaret.'
  AND (SELECT (v->0->'impact'->>'reviewedActive')::int FROM res WHERE k = 'hist') = 1,
  'P11 the history names version 2, its reason and the one confirmed review it made stale; version 1 (legacy, pre-slot) has no row and is shown as such');
SELECT pg_temp.ok((public.rec_ri_get_review((SELECT app FROM fx))->>'reviewState') = 'stale'
  AND (public.rec_ri_get_review((SELECT app FROM fx))->>'profileVersion')::int = 2,
  'P12 the confirmed review of version 1 is STALE under version 2, never a confirmation of the new requirements');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_profile(%L, 2, 'b4000000-9999-4000-8000-000000000006', NULL, (SELECT body FROM rules))$f$, (SELECT job FROM fx)),
  'RI_CHANGE_REASON_REQUIRED', 'P13 the legacy path refuses the next change as well (2 -> 3)');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_reviewed_profile(%L, 1, 'b4000000-9999-4000-8000-000000000007', NULL, (SELECT body FROM rules), 'Igen')$f$, (SELECT job FROM fx)),
  'RI_STALE_VERSION', 'P14 the reviewed path keeps the CAS: an older expected version is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_confirm_reviewed_profile(%L, 2, 'b4000000-9999-4000-8000-000000000008', NULL, '[]'::jsonb, 'Tom regel')$f$, (SELECT job FROM fx)),
  'RI_PROFILE_INVALID', 'P15 ... and the rule validation of the core (every requirement, once)');
SELECT pg_temp.ok(pg_temp.hist_rows((SELECT job FROM fx)) = 1,
  'P16 a refused change writes no history row');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'recruiter_intelligence.confirm_profile_core(uuid,integer,uuid,date,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'recruiter_intelligence.confirm_profile_core(uuid,integer,uuid,date,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_ri_confirm_profile(uuid,integer,uuid,date,jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.rec_ri_confirm_profile(uuid,integer,uuid,date,jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text)', 'EXECUTE'),
  'P17 the core is private; the two public paths keep their grants');
SELECT pg_temp.ok(pg_get_functiondef('public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text)'::regprocedure) LIKE '%recruiter_intelligence.confirm_profile_core(%'
  AND pg_get_functiondef('public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text)'::regprocedure) NOT LIKE '%public.rec_ri_confirm_profile(%',
  'P18 the reviewed path writes through the private core, not through the public legacy function');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP A — the candidate''s answer to a supplement request'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO res SELECT 'sup', public.rec_ri_request_supplement((SELECT app FROM fx),
  (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx) AND version = 2),
  ARRAY[(SELECT req_m FROM ids)]::uuid[], 'Komplettering av din ansökan',
  'Vilket år fick du ditt utbildningsbevis, och av vilken utbildare?', 'sv', 'b4000000-9999-4000-8000-000000000011');
SELECT pg_temp.ok((SELECT v->>'messageStatus' FROM res WHERE k = 'sup') = 'draft', 'A1 the request is a DRAFT until a person sends it');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'Svar innan utskick.', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'MESSAGE_NOT_FOUND', 'A2 a draft is not readable and not answerable by the candidate');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
SELECT pg_temp.ok((SELECT outcome FROM public.rec_claim_message_send((SELECT (v->>'messageId')::uuid FROM res WHERE k = 'sup'))) IS NOT NULL,
  'A3 the responsible person sends the request (the mail worker owns delivery)');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT status FROM public.recruitment_messages WHERE id = (SELECT (v->>'messageId')::uuid FROM res WHERE k = 'sup')) = 'sent',
  'A4 the message is sent');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c02';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'Jag svarar på någon annans brev.', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'MESSAGE_NOT_FOUND', 'A5 another candidate cannot answer it, and learns nothing about it');
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'Anonymt svar.', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'permission denied', 'A6 anon has no execute');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, '   ', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'REPLY_BODY_INVALID', 'A7 an empty answer is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'Svar', 'de')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'REPLY_BODY_INVALID', 'A8 ... as is a language outside sv/en');
INSERT INTO res SELECT 'reply1', public.rec_candidate_reply_to_message((SELECT (v->>'messageId')::uuid FROM res WHERE k = 'sup'),
  'Utbildningsbeviset är från 2021, utbildare Bevakningsskolan Syd. Jag bifogar inget här; intyget kan visas vid intervjun.', 'sv');
SELECT pg_temp.ok((SELECT v->>'requestId' FROM res WHERE k = 'reply1') = (SELECT v->>'requestId' FROM res WHERE k = 'sup')
  AND (SELECT v->>'applicationId' FROM res WHERE k = 'reply1') = (SELECT app::text FROM fx),
  'A9 the candidate answers in the app; the reply is bound to the request and the application');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_candidate_replies) = 1, 'A10 the candidate reads their own reply under RLS');
SELECT pg_temp.must_fail(format($f$UPDATE public.rec_candidate_replies SET body = 'Ändrat' WHERE id = %L$f$, (SELECT v->>'replyId' FROM res WHERE k = 'reply1')),
  'permission denied', 'A11 no client DML on replies');
INSERT INTO res SELECT 'reply2', public.rec_candidate_reply_to_message((SELECT (v->>'messageId')::uuid FROM res WHERE k = 'sup'),
  'Tillägg: utbildningen avslutades i juni 2021.', 'sv');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c02';
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_candidate_replies) = 0, 'A12 another candidate reads none of it');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000d';
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_candidate_replies) = 2, 'A13 a member of the organisation reads both replies');
INSERT INTO res SELECT 'state', public.rec_ri_supplement_state((SELECT app FROM fx));
SELECT pg_temp.ok((SELECT (v->>'awaitingSupplement')::boolean FROM res WHERE k = 'state')
  AND (SELECT (v->>'candidateReplied')::boolean FROM res WHERE k = 'state')
  AND (SELECT jsonb_array_length(v->'requests'->0->'replies') FROM res WHERE k = 'state') = 2
  AND (SELECT v->'requests'->0->'replies'->0->>'body' FROM res WHERE k = 'state') LIKE 'Utbildningsbeviset är från 2021%'
  AND (SELECT v->'requests'->0->>'messageStatus' FROM res WHERE k = 'state') = 'sent',
  'A14 the employer reads: still awaiting a person''s resolution, candidate has replied, both replies in order, message sent');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_resolve_supplement(%L, 'answered', 'Svar kontrollerat.')$f$, (SELECT v->>'requestId' FROM res WHERE k = 'sup')),
  'RECRUITMENT_NOT_PERMITTED', 'A15 a plain member still cannot resolve the request');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.must_fail(format($f$UPDATE public.rec_candidate_replies SET body = 'Ändrat av ägarrollen' WHERE id = %L$f$, (SELECT v->>'replyId' FROM res WHERE k = 'reply1')),
  'RI_REPLY_IMMUTABLE', 'A16 a reply is never edited, not even by the owner role');
SELECT pg_temp.must_fail(format($f$DELETE FROM public.rec_candidate_replies WHERE id = %L$f$, (SELECT v->>'replyId' FROM res WHERE k = 'reply1')),
  'RI_REPLY_IMMUTABLE', 'A17 ... nor deleted');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO res SELECT 'resolved', public.rec_ri_resolve_supplement((SELECT (v->>'requestId')::uuid FROM res WHERE k = 'sup'), 'answered', 'Svaret i appen räcker; intyget visas vid intervjun.');
SELECT pg_temp.ok(NOT (SELECT (v->>'awaitingSupplement')::boolean FROM res WHERE k = 'resolved')
  AND NOT (SELECT (v->>'candidateReplied')::boolean FROM res WHERE k = 'resolved')
  AND (SELECT jsonb_array_length(v->'requests'->0->'replies') FROM res WHERE k = 'resolved') = 2,
  'A18 a person resolves it: no longer awaiting, the replies stay with the resolved request');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'För sent.', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup')),
  'SUPPLEMENT_ALREADY_RESOLVED', 'A19 a resolved request takes no further answer');
RESET ROLE; RESET request.jwt.claim.sub;

-- A second request, sent, then the application is closed: no answer to a closed application.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO res SELECT 'sup2', public.rec_ri_request_supplement((SELECT app FROM fx),
  (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx) AND version = 2),
  ARRAY[(SELECT req_m FROM ids)]::uuid[], 'Komplettering', 'Vilken utbildare?', 'sv', 'b4000000-9999-4000-8000-000000000012');
SELECT count(*) FROM public.rec_claim_message_send((SELECT (v->>'messageId')::uuid FROM res WHERE k = 'sup2'));
SELECT public.rec_set_application_stage((SELECT app FROM fx), 'submitted', 'rejected', NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000c01';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_candidate_reply_to_message(%L, 'Svar efter besked.', 'sv')$f$, (SELECT v->>'messageId' FROM res WHERE k = 'sup2')),
  'APPLICATION_NOT_OPEN', 'A20 a closed application takes no answer; the open request is the reviewer''s to withdraw');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT has_table_privilege('authenticated', 'public.rec_candidate_replies', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.rec_candidate_replies', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.rec_candidate_replies', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.rec_candidate_replies', 'SELECT')
  AND NOT has_function_privilege('anon', 'public.rec_candidate_reply_to_message(uuid,text,text)', 'EXECUTE'),
  'A21 clients read under RLS only; the one write is the RPC; anon has nothing');
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages WHERE application_id = (SELECT app FROM fx) AND kind = 'supplement_request') = 2
  AND (SELECT count(*) FROM public.recruitment_messages WHERE application_id = (SELECT app FROM fx) AND sent_at > now() - interval '1 minute') = 2,
  'A22 a reply sends no message of its own: the two sent rows are the two requests');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP B — BESKT items in the interview composition'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
-- Governed BESKT content does not exist in the replay. The fixture builds two
-- method versions as the table owner: one published for recruitment support
-- (with an ordinary interview item, an integrity-sensitive item and a
-- preparation-phase item) and one published for security vetting. Publication
-- goes through the lifecycle guard's own legal transitions.
CREATE TEMP TABLE bk (label text, id uuid);
GRANT SELECT ON bk TO PUBLIC;
DO $$
DECLARE _pack uuid := 'b4000000-5555-4000-8000-000000000001'; _packsv uuid := 'b4000000-5555-4000-8000-000000000002';
        _mv uuid; _mvsv uuid; _mvdraft uuid; _xp uuid; _xpsv uuid; _xpd uuid; _sec uuid; _secprep uuid; _secsv uuid; _secd uuid;
        _i_ok uuid; _i_sens uuid; _i_prep uuid; _i_sv uuid; _i_draft uuid;
BEGIN
  INSERT INTO public.scp_interview_packs (id, slug, name_sv, name_en, purpose_sv, pack_kind)
  VALUES (_pack, 'v04-beskt', 'BESKT v0.4 (syntetisk)', 'BESKT v0.4 (synthetic)', 'Syntetiskt syfte.', 'beskt_method'),
         (_packsv, 'v04-beskt-sv', 'BESKT säkerhetsprövning (syntetisk)', 'BESKT vetting (synthetic)', 'Syntetiskt syfte.', 'beskt_method');
  INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference, source_document_version, content_provenance, summary_sv, summary_en)
  VALUES (_pack, 1, 'recruitment_support', 'v04 suite', 'v04-1', 'cqrity_design_hypothesis', 'Rekryteringsstöd.', 'Recruitment support.') RETURNING id INTO _mv;
  INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference, source_document_version, content_provenance)
  VALUES (_packsv, 1, 'security_vetting_support', 'v04 suite', 'v04-1', 'cqrity_design_hypothesis') RETURNING id INTO _mvsv;
  INSERT INTO public.beskt_exposure_profiles (method_version_id, profile_key, display_order, exposure_area, permitted_mode, owning_review_role, retention_class, access_class, content_provenance)
  VALUES (_mv, 'keys', 1, 'keys_alarms_and_access_control', 'recruitment_support', 'recruitment', 'recruitment_record', 'recruiter', 'cqrity_design_hypothesis') RETURNING id INTO _xp;
  INSERT INTO public.beskt_exposure_profiles (method_version_id, profile_key, display_order, exposure_area, permitted_mode, owning_review_role, retention_class, access_class, content_provenance)
  VALUES (_mvsv, 'info', 1, 'access_to_protected_information', 'security_vetting_support', 'personnel_security', 'security_vetting_record', 'authorised_security_function', 'cqrity_design_hypothesis') RETURNING id INTO _xpsv;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_mv, 'interview_keys', 1, 'interview', 'Nycklar och larm', 'Keys and alarms') RETURNING id INTO _sec;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_mv, 'prep', 2, 'candidate_preparation', 'Förberedelse', 'Preparation') RETURNING id INTO _secprep;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_mvsv, 'vetting', 1, 'interview', 'Säkerhetsprövning', 'Vetting') RETURNING id INTO _secsv;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en,
    permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_mv, _sec, _xp, 'keys_routine', 1, 'Berätta hur du hanterat nycklar och larmkoder i ett tidigare uppdrag.', 'Tell us how you handled keys and alarm codes in an earlier assignment.',
          'Rollen innebär ansvar för nycklar och larm.', 'The role carries responsibility for keys and alarms.',
          'recruitment_support', 'interview', 'long_text', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis') RETURNING id INTO _i_ok;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en,
    permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_mv, _sec, _xp, 'keys_sensitive', 2, 'Känslig fråga (syntetisk).', 'Sensitive item (synthetic).', 'Syfte.', 'Purpose.',
          'recruitment_support', 'interview', 'long_text', 'voluntary', 'integrity_sensitive', 'beskt_interviewer', 'cqrity_design_hypothesis') RETURNING id INTO _i_sens;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en,
    permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_mv, _secprep, _xp, 'prep_ack', 1, 'Förberedelsefråga (syntetisk).', 'Preparation item (synthetic).', 'Syfte.', 'Purpose.',
          'recruitment_support', 'candidate_preparation', 'acknowledgement', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis') RETURNING id INTO _i_prep;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en,
    permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_mvsv, _secsv, _xpsv, 'vetting_item', 1, 'Säkerhetsprövningsfråga (syntetisk).', 'Vetting item (synthetic).', 'Syfte.', 'Purpose.',
          'security_vetting_support', 'interview', 'long_text', 'voluntary', 'security_vetting_only', 'authorised_security_function', 'cqrity_design_hypothesis') RETURNING id INTO _i_sv;
  -- Publish the first two through the guard's legal transitions (the fixture is the table owner).
  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions SET content_status = 'in_review', revision = revision + 1 WHERE id IN (_mv, _mvsv);
  UPDATE public.beskt_method_versions SET content_status = 'published', revision = revision + 1, content_hash = repeat('b', 64),
         published_at = now(), published_by = (SELECT moderator FROM fx) WHERE id IN (_mv, _mvsv);
  PERFORM set_config('beskt.governed_transition', '', true);
  -- One open version per pack: the draft (version 2) comes after version 1 is published.
  INSERT INTO public.beskt_method_versions (pack_id, version_number, mode, source_reference, source_document_version, content_provenance)
  VALUES (_pack, 2, 'recruitment_support', 'v04 suite', 'v04-2', 'cqrity_design_hypothesis') RETURNING id INTO _mvdraft;
  INSERT INTO public.beskt_exposure_profiles (method_version_id, profile_key, display_order, exposure_area, permitted_mode, owning_review_role, retention_class, access_class, content_provenance)
  VALUES (_mvdraft, 'keys', 1, 'keys_alarms_and_access_control', 'recruitment_support', 'recruitment', 'recruitment_record', 'recruiter', 'cqrity_design_hypothesis') RETURNING id INTO _xpd;
  INSERT INTO public.beskt_sections (method_version_id, section_key, display_order, phase, title_sv, title_en)
  VALUES (_mvdraft, 'interview_keys', 1, 'interview', 'Nycklar och larm', 'Keys and alarms') RETURNING id INTO _secd;
  INSERT INTO public.beskt_items (method_version_id, section_id, exposure_profile_id, item_key, display_order, wording_sv, wording_en, purpose_sv, purpose_en,
    permitted_mode, phase, answer_type, requiredness, sensitivity_class, access_class, content_provenance)
  VALUES (_mvdraft, _secd, _xpd, 'keys_routine', 1, 'Utkast (syntetisk).', 'Draft (synthetic).', 'Syfte.', 'Purpose.',
          'recruitment_support', 'interview', 'long_text', 'voluntary', 'ordinary', 'recruiter', 'cqrity_design_hypothesis') RETURNING id INTO _i_draft;
  INSERT INTO bk VALUES ('mv', _mv), ('mvsv', _mvsv), ('mvdraft', _mvdraft), ('i_ok', _i_ok), ('i_sens', _i_sens), ('i_prep', _i_prep), ('i_sv', _i_sv), ('i_draft', _i_draft);
END $$;
SELECT pg_temp.ok((SELECT count(*) FROM public.beskt_method_versions v JOIN bk ON bk.id = v.id WHERE v.content_status = 'published') = 2
  AND (SELECT content_status FROM public.beskt_method_versions WHERE id = (SELECT id FROM bk WHERE label = 'mvdraft')) = 'draft',
  'B0 fixture: a published recruitment method, a published vetting method, a draft');

CREATE TEMP TABLE pk AS
SELECT ver.id AS packv FROM public.scp_interview_pack_versions ver
  JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';
GRANT SELECT ON pk TO PUBLIC;
INSERT INTO public.scp_interview_pack_pilot_grants (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
SELECT emp, packv, 'Kontrollerad intern pilot.', 'internal_qa', 'development', current_date + 30 FROM fx, pk
ON CONFLICT DO NOTHING;
CREATE TEMP TABLE cat (c jsonb);
GRANT ALL ON cat TO PUBLIC;
CREATE TEMP TABLE sel (s jsonb);
GRANT ALL ON sel TO PUBLIC;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b4000000-0000-4000-8000-00000000000a';
INSERT INTO cat SELECT public.rec_ri_composition_catalog((SELECT emp FROM fx), (SELECT packv FROM pk));
SELECT pg_temp.ok((SELECT jsonb_array_length(c->'coreQuestions') FROM cat) = 8
  AND (SELECT jsonb_array_length(c->'approvedProbes') FROM cat) > 0
  AND (SELECT c->>'contentStatus' FROM cat) = 'draft',
  'B1 the role pack part of the catalogue is unchanged: 8 core questions, probes, its real status');
SELECT pg_temp.ok((SELECT jsonb_array_length(c->'besktMethodVersions') FROM cat) = 1
  AND (SELECT c->'besktMethodVersions'->0->>'id' FROM cat) = (SELECT id::text FROM bk WHERE label = 'mv')
  AND (SELECT c->'besktMethodVersions'->0->>'mode' FROM cat) = 'recruitment_support',
  'B2 the catalogue lists the published recruitment-support method only: not the vetting method, not the draft');
SELECT pg_temp.ok((SELECT jsonb_array_length(c->'besktItems') FROM cat) = 1
  AND (SELECT c->'besktItems'->0->>'id' FROM cat) = (SELECT id::text FROM bk WHERE label = 'i_ok')
  AND (SELECT c->'besktItems'->0->>'sectionTitleSv' FROM cat) = 'Nycklar och larm'
  AND (SELECT c->'besktItems'->0->>'wordingEn' FROM cat) LIKE 'Tell us how you handled keys%'
  AND (SELECT c->'besktItems'->0->>'purposeSv' FROM cat) = 'Rollen innebär ansvar för nycklar och larm.'
  AND (SELECT (c->>'vettingSelectable')::boolean FROM cat) = false,
  'B3 one selectable BESKT item: interview phase, ordinary, recruitment support, with section, wording and purpose in sv/en; vetting not selectable');
-- The selection: every core question, plus the BESKT item in the beskt group.
INSERT INTO sel SELECT (
  SELECT jsonb_agg(jsonb_build_object('group', CASE WHEN q->>'questionType' = 'situational' THEN 'scenarier' ELSE 'rollkompetens' END,
                                      'kind', 'core_question', 'itemId', q->>'id', 'position', (q->>'displayOrder')::int))
    FROM jsonb_array_elements((SELECT c FROM cat)->'coreQuestions') q)
  || jsonb_build_array(jsonb_build_object('group', 'beskt', 'kind', 'beskt_item', 'itemId', (SELECT id FROM bk WHERE label = 'i_ok'), 'position', 50));
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000031', %L, (SELECT jsonb_set(s, '{8,group}', '"rollkompetens"') FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_INVALID', 'B4 a BESKT item outside the beskt group is refused: the method boundary is visible in the setup');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000032', %L, (SELECT jsonb_set(s, '{8,itemId}', to_jsonb(%L::text)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk), (SELECT id FROM bk WHERE label = 'i_sens')),
  'RI_COMPOSITION_VETTING_ONLY', 'B5 an integrity-sensitive item is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000033', %L, (SELECT jsonb_set(s, '{8,itemId}', to_jsonb(%L::text)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk), (SELECT id FROM bk WHERE label = 'i_prep')),
  'RI_COMPOSITION_VETTING_ONLY', 'B6 a candidate-preparation item is not an interview question');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000034', %L, (SELECT jsonb_set(s, '{8,itemId}', to_jsonb(%L::text)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk), (SELECT id FROM bk WHERE label = 'i_sv')),
  'RI_COMPOSITION_VETTING_ONLY', 'B7 security-vetting content is refused in an ordinary recruitment');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000035', %L, (SELECT jsonb_set(s, '{8,itemId}', to_jsonb(%L::text)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk), (SELECT id FROM bk WHERE label = 'i_draft')),
  'RI_COMPOSITION_FOREIGN_ITEM', 'B8 an item of an unpublished method version is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000036', %L, (SELECT jsonb_set(s, '{8,itemId}', to_jsonb(gen_random_uuid()::text)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_FOREIGN_ITEM', 'B9 ... as is an item that does not exist');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b4000000-9999-4000-8000-000000000037', %L, (SELECT s - 0 FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_CORE_REQUIRED', 'B10 the core is still never a subset');
SELECT pg_temp.ok((public.rec_ri_save_composition((SELECT job FROM fx), 0, 'b4000000-9999-4000-8000-000000000038', (SELECT packv FROM pk), (SELECT s FROM sel), NULL)->>'version')::int = 1,
  'B11 version 1: eight core questions and one BESKT item in the beskt group');
SELECT pg_temp.ok(jsonb_array_length(public.rec_ri_get_composition((SELECT job FROM fx))->'selection') = 9
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(public.rec_ri_get_composition((SELECT job FROM fx))->'selection') x
               WHERE x->>'kind' = 'beskt_item' AND x->>'group' = 'beskt' AND x->>'itemId' = (SELECT id::text FROM bk WHERE label = 'i_ok')),
  'B12 the recruitment reads the BESKT item back in its group');
SELECT pg_temp.ok((public.rec_ri_save_composition((SELECT job FROM fx), 0, 'b4000000-9999-4000-8000-000000000038', (SELECT packv FROM pk), (SELECT s FROM sel), NULL)->>'version')::int = 1,
  'B13 the same operation again: still one version');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(pg_get_functiondef('public.scp_iv_start_session(uuid,text)'::regprocedure) NOT LIKE '%composition%'
  AND pg_get_functiondef('public.scp_iv_start_session(uuid,text)'::regprocedure) NOT LIKE '%beskt%'
  AND pg_get_functiondef('public.scp_iv_report_blockers(uuid)'::regprocedure) NOT LIKE '%beskt%',
  'B14 session seeding and the report blockers read neither the composition nor BESKT: the method tables are untouched');
SELECT pg_temp.ok((SELECT count(*) FROM public.beskt_items i JOIN bk ON bk.id = i.method_version_id) = 5
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.beskt_items'::regclass AND tgname LIKE '%composition%'),
  'B15 the slot adds no trigger or row to the BESKT tables');

ROLLBACK;
