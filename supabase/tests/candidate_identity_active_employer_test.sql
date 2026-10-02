-- P1-B (2/5), 20270109090000: candidate identity, interview notes and
-- candidate notifications require an ACTIVE organisation.
--
--   CI-F the fixture: employer E released a participant's report through the
--        real assign -> answer -> submit -> review -> release flow, recorded an
--        interview note against it, and moved the participant's job
--        application to 'interview' (an unsent status notification). While E
--        is active its owner resolves the participant, reads and writes notes
--        and gets the notification payload with the candidate's address.
--   CI0  REPRODUCTION. E is suspended. Inside a savepoint the pre-fix bodies
--        and policy are restored by running the real rollback file, and E's
--        owner still resolves the participant's e-mail, gets the notification
--        payload, records its delivery, and reads and writes notes. Rolled
--        back.
--   CI1  with E suspended, every read gives E's owner and member exactly what
--        an unrelated employer's owner gets, and every write is refused with
--        the existing refusal; nothing is written.
--   CI2  the same for pending, rejected, archived and draft.
--   CI3  reactivation restores every read and write.
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
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key, CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- ── Cast ────────────────────────────────────────────────────────────────
--   e    the employer under test;  x  an unrelated active employer
--   o    owner of e;  m  plain member of e;  r  authorised reviewer of e
--   p    the participant;  xo  owner of x;  adm  a platform admin
CREATE TEMP TABLE ci AS SELECT
  'c1d00000-1111-4000-8000-000000000001'::uuid AS e,
  'c1d00000-1111-4000-8000-000000000002'::uuid AS x,
  'c1d00000-0000-4000-8000-000000000001'::uuid AS o,
  'c1d00000-0000-4000-8000-000000000002'::uuid AS m,
  'c1d00000-0000-4000-8000-000000000003'::uuid AS r,
  'c1d00000-0000-4000-8000-000000000004'::uuid AS p,
  'c1d00000-0000-4000-8000-000000000005'::uuid AS xo,
  'c1d00000-0000-4000-8000-00000000000a'::uuid AS adm,
  'c1d00000-2222-4000-8000-000000000001'::uuid AS emp;
GRANT SELECT ON ci TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o, 'ci-owner@test.invalid' FROM ci UNION ALL
SELECT m, 'ci-member@test.invalid' FROM ci UNION ALL
SELECT r, 'ci-reviewer@test.invalid' FROM ci UNION ALL
SELECT p, 'ci-participant@test.invalid' FROM ci UNION ALL
SELECT xo, 'ci-other-owner@test.invalid' FROM ci UNION ALL
SELECT adm, 'ci-admin@test.invalid' FROM ci;
INSERT INTO public.user_roles (user_id, role) SELECT adm, 'admin' FROM ci;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'CI Employer', 'ci-employer', 'active' FROM ci UNION ALL
SELECT x, 'CI Other Employer', 'ci-other-employer', 'active' FROM ci;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM ci UNION ALL
SELECT e, m, 'member', 'active' FROM ci UNION ALL
SELECT e, r, 'member', 'active' FROM ci UNION ALL
SELECT x, xo, 'owner', 'active' FROM ci;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, r, ARRAY['workforce','recruitment']::text[], o FROM ci;
INSERT INTO public.employees (id, employer_id, first_name, last_name, email, employment_status, created_by)
SELECT emp, e, 'CI', 'Deltagare', 'ci-participant@test.invalid', 'active', o FROM ci;
INSERT INTO public.scp_fixture_access (employer_id, reason, granted_by)
SELECT e, 'Candidate identity suite', o FROM ci;

CREATE TEMP TABLE civ AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON civ TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM civ), 'Candidate identity suite', o, now() + interval '30 days' FROM ci;

-- One sitting: assigned by the owner, answered and submitted by the
-- participant; when _release, reviewed by the reviewer and released.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_release boolean) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM ci)::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    (SELECT e FROM ci), (SELECT version_id FROM civ), 'ci-participant@test.invalid',
    NULL, 'sv', 'workforce', (SELECT emp FROM ci), NULL);
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM ci)::text, true);
  FOR _it IN
    SELECT iv.id AS ivid, iv.item_format,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_attempts at ON at.id = _att AND at.form_id = fi.form_id
     ORDER BY fi.display_order
  LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
  IF _release THEN
    PERFORM set_config('request.jwt.claim.sub', (SELECT r FROM ci)::text, true);
    FOR _rv IN
      SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format
        FROM public.scp_human_reviews hr
        JOIN public.scp_candidate_responses r ON r.id = hr.response_id
        JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
       WHERE r.attempt_id = _att AND hr.review_status = 'pending'
    LOOP
      PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
        CASE WHEN _rv.is_safety_critical THEN 'no_concern' END,
        pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', (SELECT o FROM ci)::text, true);
    PERFORM public.scp_release_attempt_report(_att);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

CREATE TEMP TABLE cia AS SELECT pg_temp.run_attempt(true) AS released;
GRANT SELECT ON cia TO PUBLIC;
CREATE TEMP TABLE cisubj AS SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT released FROM cia);
GRANT SELECT ON cisubj TO PUBLIC;

-- An interview note against the released brief.
SELECT set_config('request.jwt.claim.sub', (SELECT o FROM ci)::text, true);
SELECT public.scp_record_interview_note((SELECT released FROM cia), 'SCC-11', 'evidence_confirmed', 'CI anteckning.');
SELECT set_config('request.jwt.claim.sub', '', true);

-- A published job (only a platform admin may create one directly), the
-- participant's application, and a move to 'interview' by E's owner: one
-- unsent, employer-made status event.
SELECT set_config('request.jwt.claim.sub', (SELECT adm FROM ci)::text, true);
INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method, slug, short_id, published_at, expires_at)
SELECT 'c1d00000-4444-4000-8000-000000000001', e, 'Väktare', 'Security guard', 'published', 'internal',
       'ci-vaktare', 'CIJ0001', now(), now() + interval '30 days' FROM ci;
SELECT set_config('request.jwt.claim.sub', (SELECT p FROM ci)::text, true);
INSERT INTO public.job_applications (id, job_id, applicant_user_id, phone, cover_note, consent_given_at)
SELECT 'c1d00000-5555-4000-8000-000000000001', 'c1d00000-4444-4000-8000-000000000001', p,
       '070-5550199', 'Jag söker tjänsten.', now() FROM ci;
SELECT set_config('request.jwt.claim.sub', (SELECT o FROM ci)::text, true);
SELECT public.set_application_status('c1d00000-5555-4000-8000-000000000001', 'reviewing', NULL);
SELECT public.set_application_status('c1d00000-5555-4000-8000-000000000001', 'interview', NULL);
SELECT set_config('request.jwt.claim.sub', '', true);
CREATE TEMP TABLE cie AS
SELECT id AS event_id FROM public.job_application_status_events
 WHERE application_id = 'c1d00000-5555-4000-8000-000000000001' AND new_status = 'interview';
GRANT SELECT ON cie TO PUBLIC;

-- What a principal reads, as the authenticated role:
-- 'identity:<rows>,<address seen>|payload:<rows>,<address seen>|notes:<rows>|rls_notes:<rows>'.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _i int; _ia boolean; _p int; _pa boolean; _n int; _rn int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), coalesce(bool_or(display_email = 'ci-participant@test.invalid'), false) INTO _i, _ia
    FROM public.scp_resolve_participant_identity((SELECT e FROM ci), (SELECT subject_id FROM cisubj));
  SELECT count(*), coalesce(bool_or(recipient_email = 'ci-participant@test.invalid'), false) INTO _p, _pa
    FROM public.jase_notification_payload((SELECT event_id FROM cie));
  SELECT count(*) INTO _n FROM public.scp_interview_notes((SELECT released FROM cia));
  SELECT count(*) INTO _rn FROM public.scp_interview_notes WHERE employer_id = (SELECT e FROM ci);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN format('identity:%s,%s|payload:%s,%s|notes:%s|rls_notes:%s', _i, _ia, _p, _pa, _n, _rn);
END $$;

-- The two writes, as the authenticated role: 'ok' or the refusal code.
CREATE OR REPLACE FUNCTION pg_temp.write_as(_uid uuid, _what text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    IF _what = 'note' THEN
      PERFORM public.scp_record_interview_note((SELECT released FROM cia), 'SCC-09', 'additional_context', 'CI skrivtest.');
    ELSE
      PERFORM public.jase_record_notification((SELECT event_id FROM cie), true, NULL);
    END IF;
    RAISE EXCEPTION 'CI_PROBE_UNDO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CI_PROBE_UNDO' THEN _r := split_part(SQLERRM, ':', 1); END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT adm FROM ci)::text, true);
  PERFORM public.moderate_employer((SELECT e FROM ci), _action, 'P1-B regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = (SELECT e FROM ci);
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

CREATE TEMP TABLE ci_base AS SELECT
  pg_temp.reads_as((SELECT o FROM ci)) AS owner_reads,
  pg_temp.reads_as((SELECT m FROM ci)) AS member_reads,
  pg_temp.reads_as((SELECT xo FROM ci)) AS outsider_reads,
  (SELECT count(*) FROM public.scp_interview_notes) AS notes_before;

-- ── CI-F · while E is active ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CI-F -- while E is active its members read and write'; END $$;
SELECT pg_temp.ok((SELECT owner_reads FROM ci_base) = 'identity:1,t|payload:1,t|notes:1|rls_notes:1',
  'CI-F.1 E''s owner resolves the participant, gets the notification payload with the address, and reads the note: ' || (SELECT owner_reads FROM ci_base));
SELECT pg_temp.ok((SELECT member_reads FROM ci_base) = 'identity:0,f|payload:1,t|notes:1|rls_notes:1',
  'CI-F.2 a plain member reads the payload and the note, but may not resolve identity (owner/admin only): ' || (SELECT member_reads FROM ci_base));
SELECT pg_temp.ok((SELECT outsider_reads FROM ci_base) = 'identity:0,f|payload:0,f|notes:0|rls_notes:0',
  'CI-F.3 an unrelated employer''s owner reads nothing');
SELECT pg_temp.ok(pg_temp.write_as((SELECT o FROM ci), 'note') = 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') = 'ok',
  'CI-F.4 E''s owner may record a note and a delivery');

-- ── CI0 · reproduction on the pre-fix state ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CI0 -- reproduction: a suspended employer on the pre-fix state'; END $$;
SELECT pg_temp.moderate('suspended');
SAVEPOINT before_fix;
\ir ../rollback/20270109090000_candidate_identity_active_employer_rollback.sql
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT owner_reads FROM ci_base),
  'CI0.1 PRE-FIX: the suspended employer''s owner still resolves the e-mail, gets the payload and reads the note');
SELECT pg_temp.ok(pg_temp.write_as((SELECT o FROM ci), 'note') = 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') = 'ok',
  'CI0.2 PRE-FIX: and still records a note and a delivery');
ROLLBACK TO SAVEPOINT before_fix;

-- ── CI1 · suspended ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CI1 -- a suspended employer reads and writes nothing'; END $$;
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT outsider_reads FROM ci_base),
  'CI1.1 the suspended employer''s owner gets exactly an outsider''s answer: ' || pg_temp.reads_as((SELECT o FROM ci)));
SELECT pg_temp.ok(pg_temp.reads_as((SELECT m FROM ci)) = (SELECT outsider_reads FROM ci_base),
  'CI1.2 its plain member gets exactly an outsider''s answer');
SELECT pg_temp.ok(pg_temp.write_as((SELECT o FROM ci), 'note') = 'SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW',
  'CI1.3 recording a note is refused with the existing refusal: ' || pg_temp.write_as((SELECT o FROM ci), 'note'));
SELECT pg_temp.ok(pg_temp.write_as((SELECT o FROM ci), 'delivery') = 'JASE_NOT_AUTHORISED',
  'CI1.4 recording a delivery is refused with the existing refusal: ' || pg_temp.write_as((SELECT o FROM ci), 'delivery'));
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_interview_notes) = (SELECT notes_before FROM ci_base)
  AND (SELECT notified_at IS NULL AND notify_attempts = 0 FROM public.job_application_status_events WHERE id = (SELECT event_id FROM cie)),
  'CI1.5 nothing was written: no note, the event still unsent with no attempt counted');

-- ── CI2 · every other non-active status ─────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CI2 -- pending, rejected, archived and draft'; END $$;
SELECT pg_temp.force_status('pending');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT outsider_reads FROM ci_base)
  AND pg_temp.write_as((SELECT o FROM ci), 'note') <> 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') <> 'ok',
  'CI2.1 pending: nothing read, nothing written');
SELECT pg_temp.force_status('rejected');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT outsider_reads FROM ci_base)
  AND pg_temp.write_as((SELECT o FROM ci), 'note') <> 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') <> 'ok',
  'CI2.2 rejected: nothing read, nothing written');
SELECT pg_temp.force_status('archived');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT outsider_reads FROM ci_base)
  AND pg_temp.write_as((SELECT o FROM ci), 'note') <> 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') <> 'ok',
  'CI2.3 archived: nothing read, nothing written');
SELECT pg_temp.force_status('draft');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT outsider_reads FROM ci_base)
  AND pg_temp.write_as((SELECT o FROM ci), 'note') <> 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') <> 'ok',
  'CI2.4 draft: nothing read, nothing written');
SELECT pg_temp.force_status('suspended');

-- ── CI3 · reactivation ──────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CI3 -- reactivation restores every read and write'; END $$;
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT o FROM ci)) = (SELECT owner_reads FROM ci_base),
  'CI3.1 the owner reads exactly what it read before the suspension');
SELECT pg_temp.ok(pg_temp.reads_as((SELECT m FROM ci)) = (SELECT member_reads FROM ci_base),
  'CI3.2 the plain member reads exactly what it read before');
SELECT pg_temp.ok(pg_temp.write_as((SELECT o FROM ci), 'note') = 'ok' AND pg_temp.write_as((SELECT o FROM ci), 'delivery') = 'ok',
  'CI3.3 the owner may record a note and a delivery again');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_resolve_participant_identity(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.jase_notification_payload(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.jase_record_notification(uuid,boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_interview_notes(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_record_interview_note(uuid,text,text,text)', 'EXECUTE'),
  'CI3.4 anon may execute none of the five');

ROLLBACK;
