-- The recruitment workspace's CONTRACT half (20261208090000): the two
-- backstops on job_applications, proved by EXECUTING the paths they close.
--
-- The new application enforces both rules itself (recruitment_workspace_test
-- proves that). These triggers exist for every OTHER path to the row: a
-- hand-made call to set_application_status() or to the old apply RPC that
-- skips every server function.
--
--   K · the backstops
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
CREATE OR REPLACE FUNCTION pg_temp.must_fail_code(stmt text, needle text, code text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text; _state text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM; _state := SQLSTATE;
    IF position(needle in _msg) = 0 OR _state <> code THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%" (%), got "%" (%)', label, needle, code, _msg, _state;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail_code(text, text, text, text) TO PUBLIC;

DO $$ BEGIN RAISE NOTICE 'GROUP K — the job_applications backstops'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.job_applications'::regclass
     AND tgname IN ('job_applications_decision_guard', 'job_applications_required_answers')) = 2,
  'K0 both backstops are live');

CREATE TEMP TABLE tk AS
SELECT
  'a7000000-1111-0000-0000-00000000000a'::uuid AS emp,
  'a7000000-0000-0000-0000-00000000000a'::uuid AS owner_u,
  'a7000000-0000-0000-0000-00000000000d'::uuid AS member_u,
  'a7000000-0000-0000-0000-0000000000ad'::uuid AS moderator,
  'a7000000-0000-0000-0000-000000000c01'::uuid AS cand,
  'a7000000-2222-0000-0000-000000000001'::uuid AS job_q,
  'a7000000-2222-0000-0000-000000000002'::uuid AS job_p,
  'a7000000-3333-0000-0000-000000000001'::uuid AS app_q,
  'a7000000-3333-0000-0000-000000000002'::uuid AS app_p;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_u,   'tk-owner@rec.test',  now() FROM tk UNION ALL
SELECT member_u,  'tk-member@rec.test', now() FROM tk UNION ALL
SELECT moderator, 'tk-mod@rec.test',    now() FROM tk UNION ALL
SELECT cand,      'tk-cand@rec.test',   now() FROM tk;
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM tk;
INSERT INTO public.employers (id, name, slug, status) SELECT emp, 'Spärr AB', 'sparr-rec', 'active' FROM tk;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp, owner_u,  'owner',  'active' FROM tk UNION ALL
SELECT emp, member_u, 'member', 'active' FROM tk;
GRANT SELECT ON tk TO PUBLIC;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a7000000-0000-0000-0000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_q, 'tk-job-q', 'TKREC001', emp, 'Väktare med krav', 'Guard with requirement', 'internal', 'draft' FROM tk UNION ALL
SELECT job_p, 'tk-job-p', 'TKREC002', emp, 'Väktare utan frågor', 'Guard without questions', 'internal', 'draft' FROM tk;
SELECT public.rec_save_vacancy_structure((SELECT job_q FROM tk), '[]'::jsonb,
  '[{"prompt_sv":"Har du väktarutbildning?","prompt_en":"Security officer training?","answer_kind":"yes_no","is_required":true}]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a7000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days'
 WHERE id IN (SELECT job_q FROM tk UNION ALL SELECT job_p FROM tk);
RESET ROLE; RESET request.jwt.claim.sub;

-- K1. The old apply RPC, called by hand, with no answers. The deferred
-- trigger fires at COMMIT; forcing it IMMEDIATE inside the statement makes
-- the COMMIT-time refusal observable in a suite that never commits.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000c01';
SELECT pg_temp.must_fail_code(format($f$DO $x$ BEGIN
    PERFORM public.sp_submit_application_with_cv_source(
      %L, %L, NULL, NULL, 'x/tk-cv.pdf', 'cv.pdf', 100, 'upload', NULL, false);
    SET CONSTRAINTS public.job_applications_required_answers IMMEDIATE;
  END $x$$f$, (SELECT app_q FROM tk), (SELECT job_q FROM tk)),
  'APPLICATION_ANSWERS_MISSING', '23514',
  'K1 an application created around rec_submit_application without its required answer is refused at COMMIT');
SET CONSTRAINTS public.job_applications_required_answers DEFERRED;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.job_applications a, tk WHERE a.id = tk.app_q),
  'K2 and no application row survives it');
SELECT public.sp_submit_application_with_cv_source(
  (SELECT app_p FROM tk), (SELECT job_p FROM tk), NULL, NULL, 'x/tk-cv2.pdf', 'cv.pdf', 100, 'upload', NULL, false);
SET CONSTRAINTS public.job_applications_required_answers IMMEDIATE;
SET CONSTRAINTS public.job_applications_required_answers DEFERRED;
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.job_applications a, tk WHERE a.id = tk.app_p),
  'K3 a vacancy without required questions still takes an application by that path');
RESET ROLE; RESET request.jwt.claim.sub;

-- K4-K6. The canonical status RPC, called by hand.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a7000000-0000-0000-0000-00000000000d';
SELECT * FROM public.set_application_status((SELECT app_p FROM tk), 'reviewing', NULL);
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, tk WHERE a.id = tk.app_p) = 'reviewing',
  'K4 review work through the canonical RPC stays open to a plain member');
SELECT pg_temp.must_fail_code(format($f$SELECT * FROM public.set_application_status(%L, 'rejected', NULL)$f$,
  (SELECT app_p FROM tk)), 'RECRUITMENT_DECISION_NOT_PERMITTED', '42501',
  'K5 a plain member cannot record a decision by calling set_application_status() around every server function');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a7000000-0000-0000-0000-00000000000a';
SELECT * FROM public.set_application_status((SELECT app_p FROM tk), 'rejected', NULL);
SELECT pg_temp.ok(
  (SELECT status FROM public.job_applications a, tk WHERE a.id = tk.app_p) = 'rejected',
  'K6 the owner records it by the same path');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated', 'public.rec_application_decision_guard()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rec_check_required_answers()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_application_decision_guard()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.rec_check_required_answers()', 'EXECUTE'),
  'K8 neither trigger function is callable on its own');

ROLLBACK;
