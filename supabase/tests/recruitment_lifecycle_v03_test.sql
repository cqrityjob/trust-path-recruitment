-- Recruitment lifecycle v0.3: the supplement request, the reopen act and the
-- interview composition (slots 20270311100000 and 20270312100000).
--
--   S · a supplement is asked for named mandatory requirements of the CURRENT
--       profile version, produces a DRAFT message of its own kind, is open
--       until a person resolves it, idempotent by operation, never client DML.
--   R · "ej aktuell" reopens only through its own authorised act: manager,
--       stated reason, matching expected status, not archived, idempotent;
--       recorded in the status ledger; no message is written.
--   C · the interview composition is versioned and immutable over ONE pack
--       version, every core question always included, items verified against
--       the version, CAS + idempotent, a reason from version 2; a case pins
--       the version current at its creation and never re-points; session
--       seeding and the report blockers are untouched.
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

-- ── Fixture ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE fx AS
SELECT
  'b3000000-1111-4000-8000-00000000000a'::uuid AS emp,
  'b3000000-1111-4000-8000-00000000000b'::uuid AS emp_b,
  'b3000000-0000-4000-8000-00000000000a'::uuid AS owner_u,
  'b3000000-0000-4000-8000-00000000000b'::uuid AS owner_b,
  'b3000000-0000-4000-8000-00000000000d'::uuid AS member_u,
  'b3000000-0000-4000-8000-0000000000ad'::uuid AS moderator,
  'b3000000-0000-4000-8000-000000000c01'::uuid AS cand,
  'b3000000-2222-4000-8000-000000000001'::uuid AS job,
  'b3000000-3333-4000-8000-000000000001'::uuid AS app;
GRANT SELECT ON fx TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_u,   'v03-owner@rec.test',   now() FROM fx UNION ALL
SELECT owner_b,   'v03-owner-b@rec.test', now() FROM fx UNION ALL
SELECT member_u,  'v03-member@rec.test',  now() FROM fx UNION ALL
SELECT moderator, 'v03-mod@rec.test',     now() FROM fx UNION ALL
SELECT cand,      'v03-cand@rec.test',    now() FROM fx;
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM fx;
INSERT INTO public.employers (id, name, slug, status)
SELECT emp, 'Livscykel AB', 'livscykel-v03', 'active' FROM fx UNION ALL
SELECT emp_b, 'Annan AB', 'annan-v03', 'active' FROM fx;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp, owner_u,  'owner',  'active' FROM fx UNION ALL
SELECT emp, member_u, 'member', 'active' FROM fx UNION ALL
SELECT emp_b, owner_b, 'owner', 'active' FROM fx;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job, 'v03-job', 'V03REC01', emp, 'Väktare v0.3', 'Guard v0.3', 'internal', 'draft' FROM fx;
SELECT public.rec_save_vacancy_structure((SELECT job FROM fx),
  '[{"key":"r1","kind":"mandatory","label_sv":"Godkänd väktarutbildning","label_en":"Approved training"},
    {"key":"r2","kind":"desirable","label_sv":"B-körkort","label_en":"Driving licence"}]'::jsonb,
  '[{"requirement_key":"r1","prompt_sv":"Har du godkänd väktarutbildning?","prompt_en":"Approved training?","answer_kind":"yes_no","is_required":false}]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days' WHERE id = (SELECT job FROM fx);
RESET ROLE; RESET request.jwt.claim.sub;

-- The application, seeded the way the P1 oracle seeds its hundred: the row
-- itself, with consent, as the candidate submitted it.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at,
  cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes)
SELECT app, job, emp, cand, 'submitted', now(), 'x/v03-cv.pdf', 'cv.pdf', 'application/pdf', 100 FROM fx;

CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM public.recruitment_requirements WHERE job_id = fx.job AND kind = 'mandatory') AS req_m,
       (SELECT id FROM public.recruitment_requirements WHERE job_id = fx.job AND kind = 'desirable') AS req_d,
       (SELECT id FROM public.recruitment_questions WHERE job_id = fx.job) AS q
  FROM fx;
GRANT SELECT ON ids TO PUBLIC;

-- The profile, version 1, through the existing P1 path.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT public.rec_ri_confirm_profile((SELECT job FROM fx), 0, 'b3000000-9999-4000-8000-000000000001', NULL,
  (SELECT jsonb_build_array(
     jsonb_build_object('requirementId', req_m, 'kind', 'mandatory', 'acceptedSources', '["application_answer"]'::jsonb,
                        'decisionRule', 'boolean_yes', 'questionId', q, 'instructionSv', 'Kontrollera svaret.', 'instructionEn', NULL),
     jsonb_build_object('requirementId', req_d, 'kind', 'desirable', 'acceptedSources', '["application_cv"]'::jsonb,
                        'decisionRule', 'human_confirmed', 'questionId', NULL, 'instructionSv', 'Enligt CV.', 'instructionEn', NULL))
   FROM ids));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx)) = 1,
  'F1 fixture: one application, one confirmed requirement profile');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S — the supplement request'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE sup (result jsonb);
GRANT ALL ON sup TO PUBLIC;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_request_supplement(%L, (SELECT id FROM public.rec_requirement_profiles WHERE job_id = %L), ARRAY[%L]::uuid[], 'Komplettering', 'Vilket år fick du ditt utbildningsbevis?', 'sv', 'b3000000-9999-4000-8000-000000000011')$f$,
  (SELECT app FROM fx), (SELECT job FROM fx), (SELECT req_m FROM ids)),
  'RECRUITMENT_NOT_PERMITTED', 'S1 a plain member cannot ask for a supplement');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_request_supplement(%L, (SELECT id FROM public.rec_requirement_profiles WHERE job_id = %L), ARRAY[%L]::uuid[], 'Komplettering', 'Text', 'sv', 'b3000000-9999-4000-8000-000000000012')$f$,
  (SELECT app FROM fx), (SELECT job FROM fx), (SELECT req_d FROM ids)),
  'RI_SUPPLEMENT_INVALID', 'S2 a merit is never the subject of a supplement');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_request_supplement(%L, (SELECT id FROM public.rec_requirement_profiles WHERE job_id = %L), ARRAY[%L]::uuid[], 'Komplettering', '   ', 'sv', 'b3000000-9999-4000-8000-000000000013')$f$,
  (SELECT app FROM fx), (SELECT job FROM fx), (SELECT req_m FROM ids)),
  'RI_SUPPLEMENT_INVALID', 'S3 an empty body is refused: the message is the reviewer''s own words');
INSERT INTO sup SELECT public.rec_ri_request_supplement((SELECT app FROM fx),
  (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx)),
  ARRAY[(SELECT req_m FROM ids)]::uuid[], 'Komplettering av din ansökan',
  'Vilket år fick du ditt utbildningsbevis, och av vilken utbildare?', 'sv', 'b3000000-9999-4000-8000-000000000014');
SELECT pg_temp.ok((SELECT result->>'messageStatus' FROM sup) = 'draft' AND (SELECT (result->>'profileVersion')::int FROM sup) = 1,
  'S4 the request produces a DRAFT and names the profile version');
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages WHERE application_id = (SELECT app FROM fx) AND kind = 'supplement_request' AND status = 'draft') = 1,
  'S5 the draft is a message of its own kind, not sent');
SELECT pg_temp.ok((public.rec_ri_supplement_state((SELECT app FROM fx))->>'awaitingSupplement')::boolean,
  'S6 the application is now awaiting a supplement -- a view over the open row');
SELECT pg_temp.ok(public.rec_ri_request_supplement((SELECT app FROM fx),
  (SELECT id FROM public.rec_requirement_profiles WHERE job_id = (SELECT job FROM fx)),
  ARRAY[(SELECT req_m FROM ids)]::uuid[], 'Komplettering av din ansökan',
  'Vilket år fick du ditt utbildningsbevis, och av vilken utbildare?', 'sv', 'b3000000-9999-4000-8000-000000000014') = (SELECT result FROM sup)
  AND jsonb_array_length(public.rec_ri_supplement_state((SELECT app FROM fx))->'requests') = 1
  AND (SELECT count(*) FROM public.recruitment_messages WHERE application_id = (SELECT app FROM fx) AND kind = 'supplement_request') = 1,
  'S7 the same operation again returns the same answer: one request, one draft');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_request_supplement(%L, (SELECT id FROM public.rec_requirement_profiles WHERE job_id = %L), ARRAY[%L]::uuid[], 'Igen', 'Text', 'sv', 'b3000000-9999-4000-8000-000000000015')$f$,
  (SELECT app FROM fx), (SELECT job FROM fx), (SELECT req_m FROM ids)),
  'RI_SUPPLEMENT_OPEN', 'S8 a second request while one is open is refused');
SELECT pg_temp.must_fail(format($f$UPDATE public.rec_requirement_supplement_requests SET resolved_at = now(), outcome = 'answered' WHERE application_id = %L$f$, (SELECT app FROM fx)),
  'permission denied', 'S9 no client DML on the request table');
SELECT pg_temp.must_fail(format($f$DELETE FROM public.rec_requirement_supplement_requests WHERE application_id = %L$f$, (SELECT app FROM fx)),
  'permission denied', 'S10 ... nor a delete');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_resolve_supplement(((public.rec_ri_supplement_state(%L)->'requests'->0->>'requestId')::uuid), 'done', NULL)$f$, (SELECT app FROM fx)),
  'RI_SUPPLEMENT_INVALID', 'S11 an outcome is answered or withdrawn, nothing else');
SELECT pg_temp.ok(NOT (public.rec_ri_resolve_supplement((public.rec_ri_supplement_state((SELECT app FROM fx))->'requests'->0->>'requestId')::uuid, 'answered', 'Intyg mottaget och kontrollerat.')->>'awaitingSupplement')::boolean,
  'S12 a person resolves it; the application no longer awaits a supplement');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_resolve_supplement(((public.rec_ri_supplement_state(%L)->'requests'->0->>'requestId')::uuid), 'withdrawn', NULL)$f$, (SELECT app FROM fx)),
  'RI_SUPPLEMENT_RESOLVED', 'S13 a resolved request stays resolved');
SELECT pg_temp.ok((SELECT jsonb_array_length(public.rec_ri_supplement_state((SELECT app FROM fx))->'requests')) = 1
  AND (SELECT public.rec_ri_supplement_state((SELECT app FROM fx))->'requests'->0->>'outcome') = 'answered'
  AND (SELECT public.rec_ri_supplement_state((SELECT app FROM fx))->'requests'->0->>'messageStatus') = 'draft',
  'S14 the history keeps the request with its outcome and the draft''s state');
RESET ROLE; RESET request.jwt.claim.sub;

-- A second profile version makes the first stale for new requests.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT public.rec_ri_confirm_profile((SELECT job FROM fx), 1, 'b3000000-9999-4000-8000-000000000002', NULL,
  (SELECT jsonb_build_array(
     jsonb_build_object('requirementId', req_m, 'kind', 'mandatory', 'acceptedSources', '["application_answer"]'::jsonb,
                        'decisionRule', 'boolean_yes', 'questionId', q, 'instructionSv', 'Kontrollera svaret noga.', 'instructionEn', NULL),
     jsonb_build_object('requirementId', req_d, 'kind', 'desirable', 'acceptedSources', '["application_cv"]'::jsonb,
                        'decisionRule', 'human_confirmed', 'questionId', NULL, 'instructionSv', 'Enligt CV.', 'instructionEn', NULL))
   FROM ids));
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_request_supplement(%L, (SELECT id FROM public.rec_requirement_profiles WHERE job_id = %L AND version = 1), ARRAY[%L]::uuid[], 'Igen', 'Text', 'sv', 'b3000000-9999-4000-8000-000000000016')$f$,
  (SELECT app FROM fx), (SELECT job FROM fx), (SELECT req_m FROM ids)),
  'RI_STALE_VERSION', 'S15 a request against an older profile version is refused');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT has_table_privilege('authenticated', 'public.rec_requirement_supplement_requests', 'SELECT')
  AND NOT has_function_privilege('anon', 'public.rec_ri_request_supplement(uuid,uuid,uuid[],text,text,text,uuid)', 'EXECUTE'),
  'S16 the table is not readable by clients and anon has no execute');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP R — reopening a decision'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE rr (result jsonb);
GRANT ALL ON rr TO PUBLIC;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'submitted', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000021')$f$, (SELECT app FROM fx)),
  'REOPEN_NOT_ALLOWED', 'R1 only "ej aktuell" can be reopened');
SELECT public.rec_set_application_stage((SELECT app FROM fx), 'submitted', 'rejected', NULL);
SELECT pg_temp.ok((SELECT status FROM public.job_applications WHERE id = (SELECT app FROM fx)) = 'rejected', 'R2 the application is rejected');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000d';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'rejected', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000022')$f$, (SELECT app FROM fx)),
  'RECRUITMENT_DECISION_NOT_PERMITTED', 'R3 a plain member cannot reopen');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'rejected', '  ', 'b3000000-9999-4000-8000-000000000023')$f$, (SELECT app FROM fx)),
  'REOPEN_REASON_REQUIRED', 'R4 a reason is required');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'interview', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000024')$f$, (SELECT app FROM fx)),
  'STALE_APPLICATION_STAGE', 'R5 the expected status must match what the page showed');
SELECT public.rec_archive_material((SELECT job FROM fx), (SELECT app FROM fx), true);
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'rejected', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000025')$f$, (SELECT app FROM fx)),
  'APPLICATION_ARCHIVED', 'R6 an archived application is restored first, never reopened around the archive');
SELECT public.rec_archive_material((SELECT job FROM fx), (SELECT app FROM fx), false);
INSERT INTO rr SELECT public.rec_reopen_application((SELECT app FROM fx), 'rejected', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000026');
SELECT pg_temp.ok((SELECT status FROM public.job_applications WHERE id = (SELECT app FROM fx)) = 'reviewing'
  AND (SELECT result->>'status' FROM rr) = 'reviewing',
  'R7 reopened: rejected -> reviewing, back in the active list');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.job_application_status_events
  WHERE application_id = (SELECT app FROM fx) AND previous_status = 'rejected' AND new_status = 'reviewing'
    AND actor_role = 'employer' AND note LIKE 'Återöppnad: Felaktigt avslut%'),
  'R8 the ledger records the reopen with its reason');
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_messages WHERE application_id = (SELECT app FROM fx) AND kind IN ('rejection', 'offer', 'general', 'information')) = 0,
  'R9 reopening writes no message');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
SELECT pg_temp.ok(public.rec_reopen_application((SELECT app FROM fx), 'rejected', 'Felaktigt avslut, kandidaten ska granskas.', 'b3000000-9999-4000-8000-000000000026') = (SELECT result FROM rr),
  'R10 the same operation again is the same answer');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'rejected', 'Igen.', 'b3000000-9999-4000-8000-000000000027')$f$, (SELECT app FROM fx)),
  'STALE_APPLICATION_STAGE', 'R11 a new reopen on the reopened application is stale, not a second reopen');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_reopen_application(%L, 'rejected', 'En annan orsak under samma operation.', 'b3000000-9999-4000-8000-000000000026')$f$, (SELECT app FROM fx)),
  'RI_OPERATION_CONFLICT', 'R12 ... and the operation id cannot be reused with other content');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_requirement_supplement_requests WHERE application_id = (SELECT app FROM fx)) = 1,
  'R13 the supplement history survived the decision and the reopen');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP C — the interview composition'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
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
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000b';
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_composition_catalog(%L, %L)$f$, (SELECT emp FROM fx), (SELECT packv FROM pk)),
  'RECRUITMENT_NOT_PERMITTED', 'C1 another organisation reads no catalogue');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b3000000-0000-4000-8000-00000000000a';
INSERT INTO cat SELECT public.rec_ri_composition_catalog((SELECT emp FROM fx), (SELECT packv FROM pk));
SELECT pg_temp.ok((SELECT jsonb_array_length(c->'coreQuestions') FROM cat) = 8
  AND (SELECT jsonb_array_length(c->'competencies') FROM cat) = 6
  AND (SELECT jsonb_array_length(c->'approvedProbes') FROM cat) > 0
  AND (SELECT c->'coreQuestions'->0->>'code' FROM cat) = 'Q1'
  AND (SELECT c->>'contentStatus' FROM cat) = 'draft',
  'C2 the catalogue is the pack version verbatim: 8 core questions in order, 6 areas, approved probes, its real status');
-- The selection: every core question in its own group, plus two probes.
INSERT INTO sel SELECT (
  SELECT jsonb_agg(jsonb_build_object('group', CASE WHEN q->>'questionType' = 'situational' THEN 'scenarier' ELSE 'rollkompetens' END,
                                      'kind', 'core_question', 'itemId', q->>'id', 'position', (q->>'displayOrder')::int))
    FROM jsonb_array_elements((SELECT c FROM cat)->'coreQuestions') q)
  || (SELECT jsonb_agg(jsonb_build_object('group', 'fordjupning', 'kind', 'approved_probe', 'itemId', p->>'id', 'position', 100 + n))
        FROM (SELECT p, row_number() OVER () AS n FROM jsonb_array_elements((SELECT c FROM cat)->'approvedProbes') p LIMIT 2) x);
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b3000000-9999-4000-8000-000000000031', %L, (SELECT s - 0 FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_CORE_REQUIRED', 'C3 a subset of the core questions is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b3000000-9999-4000-8000-000000000032', %L, (SELECT s || jsonb_build_array(jsonb_build_object('group','x','kind','approved_probe','itemId',gen_random_uuid(),'position',999)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_FOREIGN_ITEM', 'C4 an item that is not a row of this pack version is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b3000000-9999-4000-8000-000000000033', %L, (SELECT s || jsonb_build_array(s->0 || '{"position": 998}'::jsonb) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_DUPLICATE', 'C5 the same question twice is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b3000000-9999-4000-8000-000000000034', %L, (SELECT s || jsonb_build_array(jsonb_build_object('group','x','kind','approved_probe','itemId',(SELECT c->'approvedProbes'->5->>'id' FROM cat),'position',1)) FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_DUPLICATE', 'C6 two items on one position are refused');
SELECT pg_temp.ok((public.rec_ri_save_composition((SELECT job FROM fx), 0, 'b3000000-9999-4000-8000-000000000035', (SELECT packv FROM pk), (SELECT s FROM sel), NULL)->>'version')::int = 1,
  'C7 version 1 is confirmed: 8 core questions and two probes, grouped and ordered');
SELECT pg_temp.ok((public.rec_ri_get_composition((SELECT job FROM fx))->>'version')::int = 1
  AND (public.rec_ri_get_composition((SELECT job FROM fx))->>'canManage')::boolean
  AND jsonb_array_length(public.rec_ri_get_composition((SELECT job FROM fx))->'selection') = 10,
  'C8 the recruitment reads its current composition');
SELECT pg_temp.ok((public.rec_ri_save_composition((SELECT job FROM fx), 0, 'b3000000-9999-4000-8000-000000000035', (SELECT packv FROM pk), (SELECT s FROM sel), NULL)->>'version')::int = 1
  AND (public.rec_ri_get_composition((SELECT job FROM fx))->>'version')::int = 1,
  'C9 the same operation again: still one version');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 0, 'b3000000-9999-4000-8000-000000000036', %L, (SELECT s FROM sel), 'Igen')$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_STALE_VERSION', 'C10 saving against a version that is no longer current is refused');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 1, 'b3000000-9999-4000-8000-000000000037', %L, (SELECT s FROM sel), NULL)$f$, (SELECT job FROM fx), (SELECT packv FROM pk)),
  'RI_COMPOSITION_REASON_REQUIRED', 'C11 changing a shared setup needs a stated reason');
-- A case for this recruitment pins version 1 at creation.
INSERT INTO cat (c) SELECT jsonb_build_object('case', public.scp_iv_create_case((SELECT emp FROM fx), 'Intervju v0.3', (SELECT packv FROM pk), 'Kandidat K.', NULL, 'EXT-V03', (SELECT job FROM fx), NULL));
SELECT pg_temp.ok((public.rec_ri_case_composition((SELECT (c->>'case')::uuid FROM cat WHERE c ? 'case'))->>'version')::int = 1
  AND (public.rec_ri_case_composition((SELECT (c->>'case')::uuid FROM cat WHERE c ? 'case'))->>'compositionId')
      = (public.rec_ri_get_composition((SELECT job FROM fx))->>'compositionId'),
  'C12 a new case pins the composition version current at its creation');
SELECT pg_temp.ok((public.rec_ri_save_composition((SELECT job FROM fx), 1, 'b3000000-9999-4000-8000-000000000038', (SELECT packv FROM pk), (SELECT s - 9 FROM sel), 'En fördjupning mindre: tiden räcker inte.')->>'version')::int = 2,
  'C13 version 2 with a reason');
SELECT pg_temp.ok((public.rec_ri_case_composition((SELECT (c->>'case')::uuid FROM cat WHERE c ? 'case'))->>'version')::int = 1
  AND (public.rec_ri_case_composition((SELECT (c->>'case')::uuid FROM cat WHERE c ? 'case'))->>'currentVersion')::int = 2
  AND (public.rec_ri_get_composition((SELECT job FROM fx))->>'olderBoundCases')::int = 1,
  'C14 the case keeps reading version 1; the recruitment says one case is bound to an older version');
SELECT pg_temp.must_fail(format($f$SELECT public.rec_ri_save_composition(%L, 2, 'b3000000-9999-4000-8000-000000000039', (SELECT ver.id FROM public.scp_interview_pack_versions ver JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'security-manager-se' LIMIT 1), '[]'::jsonb, 'Byte')$f$, (SELECT job FROM fx)),
  'RI_COMPOSITION', 'C16 the pack version of a recruitment''s setup is fixed (and an empty selection is invalid)');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.rec_interview_compositions', 'permission denied', 'C17 the table is not readable by clients');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.must_fail(format($f$UPDATE public.scp_interview_cases SET composition_id = NULL WHERE id = %L$f$, (SELECT (c->>'case')::uuid FROM cat WHERE c ? 'case')),
  'RI_COMPOSITION_BIND_IMMUTABLE', 'C15 a case is never re-pointed');
SELECT pg_temp.must_fail(format($f$UPDATE public.rec_interview_compositions SET selection = '[]'::jsonb WHERE job_id = %L AND version = 1$f$, (SELECT job FROM fx)),
  'RI_COMPOSITION_IMMUTABLE', 'C18 a confirmed version is never edited, not even by the owner role');
SELECT pg_temp.must_fail(format($f$DELETE FROM public.rec_interview_compositions WHERE job_id = %L AND version = 2$f$, (SELECT job FROM fx)),
  'RI_COMPOSITION_IMMUTABLE', 'C19 ... nor deleted');
SELECT pg_temp.ok(pg_get_functiondef('public.scp_iv_start_session(uuid,text)'::regprocedure) NOT LIKE '%composition%'
  AND pg_get_functiondef('public.scp_iv_report_blockers(uuid)'::regprocedure) NOT LIKE '%composition%',
  'C20 session seeding and the report blockers still read the pack version: eight questions, pack order');
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_interview_core_questions q JOIN pk ON pk.packv = q.pack_version_id) = 8
  AND (SELECT string_agg(q.code, ',' ORDER BY q.display_order) FROM public.scp_interview_core_questions q JOIN pk ON pk.packv = q.pack_version_id) = 'Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8',
  'C21 the core itself is untouched: Q1..Q8 in order');

ROLLBACK;
