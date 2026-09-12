-- ===========================================================================
-- BESKT PR 3 -- candidate preparation: behavioural database suite
-- ===========================================================================
--
-- Proves the runtime this PR ships: an authorised employer starts ONE
-- preparation from an existing application, the candidate reads the notice,
-- answers only what is shown, may omit or defer a question orally, saves,
-- resumes, reviews, corrects and submits once, and the employer then reads
-- the candidate's own submitted basis -- and nothing beyond it.
--
-- Everything planted here is SYNTHETIC and clearly named as such. The whole
-- suite runs inside ONE transaction and is rolled back, so it seeds nothing.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/bcp_candidate_preparation_test.sql
-- ===========================================================================

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

-- The PR #218 fixture: assertion helpers, planted governance actors, gate
-- grants and the synthetic method builder. Reused rather than reinvented.
\i supabase/tests/beskt_governed_content_fixture.sql

-- ---------------------------------------------------------------------------
-- C0 -- The runtime spine: two employers, two jobs, three applications.
--
-- Real tables, the existing ones. PR 3 creates no parallel user, employer,
-- job, application, candidate or authentication system, and this fixture
-- proves it by having none to create.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE bcpk (
  emp_a uuid, emp_b uuid, emp_suspended uuid,
  job_a uuid, job_b uuid, job_susp uuid,
  app_a uuid, app_b uuid, app_susp uuid, app_withdrawn uuid,
  cand_a uuid, cand_b uuid,
  rec_a uuid, rec_b uuid, outsider uuid, admin_u uuid,
  v uuid, prof uuid, hash text,
  sv_v uuid, sv_prof uuid,
  draft_v uuid, susp_v uuid, ret_v uuid, susp_prof uuid,
  job_a2 uuid, app_a2 uuid,
  assignment uuid, response uuid, scratch text, n bigint
) ON COMMIT DROP;
INSERT INTO bcpk DEFAULT VALUES;
GRANT ALL ON bcpk TO authenticated;

DO $seed$
DECLARE
  _emp_a uuid := 'b3000000-0000-4000-8000-00000000ea01';
  _emp_b uuid := 'b3000000-0000-4000-8000-00000000eb01';
  _emp_s uuid := 'b3000000-0000-4000-8000-00000000ec01';
  _cand_a uuid := 'b3000000-0000-4000-8000-0000000000c1';
  _cand_b uuid := 'b3000000-0000-4000-8000-0000000000c2';
  _rec_a uuid := 'b3000000-0000-4000-8000-0000000000d1';
  _rec_b uuid := 'b3000000-0000-4000-8000-0000000000d2';
  _out uuid := 'b3000000-0000-4000-8000-0000000000f1';
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';  -- the PR #218 platform admin
  _job_a uuid; _job_b uuid; _job_s uuid; _job_a2 uuid;
  _app_a uuid; _app_b uuid; _app_s uuid; _app_w uuid; _app_a2 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_cand_a, 'bcp-candidate-a@test.local'),
    (_cand_b, 'bcp-candidate-b@test.local'),
    (_rec_a, 'bcp-recruiter-a@test.local'),
    (_rec_b, 'bcp-recruiter-b@test.local'),
    (_out, 'bcp-outsider@test.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employers (id, slug, name, status) VALUES
    (_emp_a, 'bcp-synthetic-employer-a', 'SYNTETISK arbetsgivare A', 'active'),
    (_emp_b, 'bcp-synthetic-employer-b', 'SYNTETISK arbetsgivare B', 'active'),
    (_emp_s, 'bcp-synthetic-employer-suspended', 'SYNTETISK arbetsgivare S', 'active');

  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp_a, _rec_a, 'admin', 'active'),
    (_emp_b, _rec_b, 'admin', 'active'),
    (_emp_s, _rec_a, 'admin', 'active');

  -- Published on the platform's own moderation path, as the planted
  -- platform administrator, so the jobs are genuinely open for on-platform
  -- applications rather than forced past the guard.
  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('bcp-job-a', 'BCPJA1', _emp_a, 'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('bcp-job-b', 'BCPJB1', _emp_b, 'internal', 'Väktare B (syntetisk)', 'Security officer B (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_b;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('bcp-job-s', 'BCPJS1', _emp_s, 'internal', 'Väktare S (syntetisk)', 'Security officer S (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_s;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('bcp-job-a2', 'BCPJA2', _emp_a, 'internal', 'Larmoperatör (syntetisk)', 'Alarm operator (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a2;
  PERFORM pg_temp.nobody();

  -- The jobs are opened for on-platform applications the same way the
  -- product does it: created as drafts, then published.
  UPDATE public.jobs SET status = 'published', published_at = now(),
         expires_at = now() + interval '90 days'
   WHERE id IN (_job_a, _job_b, _job_s);

  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_a, now()) RETURNING id INTO _app_a;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_b, _emp_b, _cand_b, now()) RETURNING id INTO _app_b;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_s, _emp_s, _cand_b, now()) RETURNING id INTO _app_s;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at, withdrawn_at)
  VALUES (_job_a, _emp_a, _cand_b, now(), now()) RETURNING id INTO _app_w;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a2, _emp_a, _cand_b, now()) RETURNING id INTO _app_a2;

  -- Suspended only AFTER its job and application exist, and through the
  -- platform's own moderation RPC: the product refuses to create records
  -- for a non-operational organisation, which is itself the existing
  -- contract PR 3 relies on.
  PERFORM pg_temp.become(_admin);
  PERFORM public.moderate_employer(_emp_s, 'suspended', 'Syntetisk avstängning för testet.');
  PERFORM pg_temp.nobody();

  UPDATE bcpk SET emp_a = _emp_a, emp_b = _emp_b, emp_suspended = _emp_s,
    job_a = _job_a, job_b = _job_b, job_susp = _job_s,
    app_a = _app_a, app_b = _app_b, app_susp = _app_s, app_withdrawn = _app_w,
    cand_a = _cand_a, cand_b = _cand_b, rec_a = _rec_a, rec_b = _rec_b,
    outsider = _out, admin_u = _admin, job_a2 = _job_a2, app_a2 = _app_a2;
END
$seed$;

-- One published, candidate-safe recruitment-support method; one published
-- security-vetting method; one draft.
DO $content$
DECLARE _v uuid; _sv uuid; _draft uuid; _susp uuid; _ret uuid;
BEGIN
  _v := pg_temp.build_method('bcp-prep-method', 'recruitment_support');
  PERFORM pg_temp.submit(_v);
  PERFORM pg_temp.approve_all(_v);
  PERFORM pg_temp.publish(_v);

  _sv := pg_temp.build_method('bcp-prep-vetting', 'security_vetting_support');
  PERFORM pg_temp.submit(_sv);
  PERFORM pg_temp.approve_all(_sv);
  PERFORM pg_temp.publish(_sv);

  _draft := pg_temp.build_method('bcp-prep-draft', 'recruitment_support');

  _susp := pg_temp.build_method('bcp-prep-suspended', 'recruitment_support');
  PERFORM pg_temp.submit(_susp);
  PERFORM pg_temp.approve_all(_susp);
  PERFORM pg_temp.publish(_susp);
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_suspend_version(gen_random_uuid(), _susp, pg_temp.revision_of(_susp), 'Syntetiskt avstängd.');
  RESET ROLE; PERFORM pg_temp.nobody();

  _ret := pg_temp.build_method('bcp-prep-retired', 'recruitment_support');
  PERFORM pg_temp.submit(_ret);
  PERFORM pg_temp.approve_all(_ret);
  PERFORM pg_temp.publish(_ret);
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_retire_version(gen_random_uuid(), _ret, pg_temp.revision_of(_ret), 'Syntetiskt utfasad.');
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE bcpk SET
    v = _v,
    prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _v AND profile_key = 'lone_working'),
    hash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v),
    sv_v = _sv,
    sv_prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _sv AND profile_key = 'lone_working'),
    draft_v = _draft,
    susp_v = _susp,
    susp_prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _susp AND profile_key = 'lone_working'),
    ret_v = _ret;
END
$content$;

DO $c0$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;
  PERFORM pg_temp.ok((SELECT content_status FROM public.beskt_method_versions WHERE id = _k.v) = 'published',
    'C0.1 the synthetic recruitment-support method version is published');
  PERFORM pg_temp.ok(public.bcp_version_is_candidate_safe(_k.v),
    'C0.2 it is candidate safe: published, recruitment support, no security-vetting row');
  PERFORM pg_temp.ok(NOT public.bcp_version_is_candidate_safe(_k.sv_v),
    'C0.3 the security-vetting method version is NOT candidate safe');
  PERFORM pg_temp.ok(NOT public.bcp_version_is_candidate_safe(_k.draft_v),
    'C0.4 a draft version is NOT candidate safe');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_assignments) = 0,
    'C0.5 no preparation exists before the suite starts');
END
$c0$;

-- Local helpers: call a governed RPC as a signed-in principal and keep the
-- result, or count rows a principal can actually see.
CREATE OR REPLACE FUNCTION pg_temp.rpc(_u uuid, _sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_u);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _r;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.count_as(_u uuid, _sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.become(_u);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _n;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.count_anon(_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.nobody();
  SET LOCAL ROLE anon;
  EXECUTE _sql INTO _n;
  RESET ROLE;
  RETURN _n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; RAISE;
END $$;

-- The visible item keys of an assignment, as the candidate sees them.
CREATE OR REPLACE FUNCTION pg_temp.visible_keys(_a uuid, _u uuid) RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE _k text[];
BEGIN
  PERFORM pg_temp.become(_u);
  SET LOCAL ROLE authenticated;
  SELECT coalesce(array_agg(e ->> 'item_key' ORDER BY (e ->> 'sequence_position')::int), '{}'::text[])
    INTO _k
    FROM jsonb_array_elements(public.bcp_candidate_preparation(_a) -> 'items') e;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _k;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.draft_revision(_a uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT revision FROM public.bcp_responses WHERE assignment_id = _a AND response_state = 'draft';
$$;


-- ---------------------------------------------------------------------------
-- C1 -- The assignability gate. Fail closed by default: without an explicit,
--       live, in-window pilot grant NOTHING is assignable, to anybody.
-- ---------------------------------------------------------------------------
DO $c1$
DECLARE _k bcpk%ROWTYPE; _r jsonb; _op uuid := gen_random_uuid();
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 0,
    'C1.1 with no grant an authorised employer member is offered NOTHING');

  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_NOT_ASSIGNABLE', 'C1.2 and starting a preparation without a grant is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_grant_pilot(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.emp_a, _k.v, 'unauthorised', (current_date + 30)),
    'BCP_NOT_PLATFORM_ADMIN', 'C1.3 an employer administrator cannot admit their own employer to the pilot');

  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_grant_pilot(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.emp_a, _k.v, 'unauthorised', (current_date + 30)),
    'BCP_NOT_PLATFORM_ADMIN', 'C1.4 nor can a candidate');

  -- The platform administrator admits employer A, and only employer A.
  _r := pg_temp.rpc(_k.admin_u, format('SELECT public.bcp_grant_pilot(%L, %L, %L, %L, %L)',
          _op, _k.emp_a, _k.v, 'owner decision: synthetic pilot', (current_date + 30)));
  PERFORM pg_temp.ok(_r ->> 'employer_id' = _k.emp_a::text, 'C1.5 a platform administrator admits one employer to one method version');

  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.admin_u, format('SELECT public.bcp_grant_pilot(%L, %L, %L, %L, %L)',
      _op, _k.emp_a, _k.v, 'owner decision: synthetic pilot', (current_date + 30))) = _r,
    'C1.6 granting again with the same operation id returns the original receipt, not a second grant');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_pilot_grants WHERE employer_id = _k.emp_a) = 1,
    'C1.7 and exactly one grant row exists');

  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 1,
    'C1.8 the admitted employer is now offered exactly one method');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_b)) = 0,
    'C1.9 another employer is still offered nothing');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 0,
    'C1.10 and a member of another employer enumerates nothing for employer A');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 0,
    'C1.11 a candidate holds no membership and is offered nothing');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.outsider, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 0,
    'C1.12 a roleless user is offered nothing');

  -- The list and the create call share one decision: what is offered is
  -- exactly what carries the hash bcp_assign() demands.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format(
      'SELECT count(*) FROM public.bcp_assignable_method_versions(%L) WHERE content_hash = %L AND release_scope = %L',
      _k.emp_a, _k.hash, 'synthetic_internal_only')) = 1,
    'C1.13 the offer carries the exact content hash and the unchanged synthetic_internal_only scope');
END
$c1$;

-- The authority table is written only by its governed RPCs, and by no client
-- role at all -- service_role included.
DO $c1b$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;
  PERFORM pg_temp.must_fail(format(
    'SET LOCAL ROLE service_role; INSERT INTO public.bcp_pilot_grants (employer_id, method_version_id, granted_by, source_reference, expires_on) VALUES (%L, %L, %L, %L, %L)',
    _k.emp_b, _k.v, _k.admin_u, 'forged', (current_date + 30)),
    'permission denied', 'C1.14 service_role cannot insert a pilot grant: it holds no privilege on the authority table');
  RESET ROLE;
  PERFORM pg_temp.must_fail(format(
    'INSERT INTO public.bcp_pilot_grants (employer_id, method_version_id, granted_by, source_reference, expires_on) VALUES (%L, %L, %L, %L, %L)',
    _k.emp_b, _k.v, _k.admin_u, 'forged', (current_date + 30)),
    'BCP_PILOT_UNGOVERNED_WRITE', 'C1.15 and even the table owner is refused outside bcp_grant_pilot()');
  PERFORM pg_temp.must_fail(
    'DELETE FROM public.bcp_pilot_grants',
    'BCP_PILOT_UNGOVERNED_WRITE', 'C1.16 a pilot grant is never deleted');
END
$c1b$;


-- ---------------------------------------------------------------------------
-- C2 -- Starting a preparation from an existing job application.
-- ---------------------------------------------------------------------------
DO $c2$
DECLARE
  _k bcpk%ROWTYPE; _r jsonb; _op uuid := gen_random_uuid(); _a uuid;
BEGIN
  SELECT * INTO _k FROM bcpk;

  _r := pg_temp.rpc(_k.rec_a, format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)',
          _op, _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'));
  _a := (_r ->> 'assignment_id')::uuid;
  UPDATE bcpk SET assignment = _a;

  PERFORM pg_temp.ok(_a IS NOT NULL, 'C2.1 an authorised employer member creates ONE preparation from an existing application');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_assignments) = 1, 'C2.2 and exactly one assignment exists');
  PERFORM pg_temp.ok((SELECT candidate_user_id FROM public.bcp_assignments WHERE id = _a) = _k.cand_a,
    'C2.3 bound to the application''s own applicant, not a name typed by the recruiter');
  PERFORM pg_temp.ok((SELECT employer_id FROM public.bcp_assignments WHERE id = _a) = _k.emp_a
                 AND (SELECT job_id FROM public.bcp_assignments WHERE id = _a) = _k.job_a,
    'C2.4 and to that application''s own employer and job');
  PERFORM pg_temp.ok((SELECT pinned_content_hash FROM public.bcp_assignments WHERE id = _a) = _k.hash
                 AND (SELECT method_version_id FROM public.bcp_assignments WHERE id = _a) = _k.v
                 AND (SELECT exposure_profile_id FROM public.bcp_assignments WHERE id = _a) = _k.prof,
    'C2.5 the method version, exposure profile and content hash are pinned on the row');
  PERFORM pg_temp.ok((SELECT mode FROM public.bcp_assignments WHERE id = _a) = 'recruitment_support'
                 AND (SELECT pinned_release_scope FROM public.bcp_assignments WHERE id = _a) = 'synthetic_internal_only',
    'C2.6 recorded as recruitment support under the unchanged synthetic_internal_only scope');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _a) = 'assigned'
                 AND (SELECT revision FROM public.bcp_assignments WHERE id = _a) = 1,
    'C2.7 it starts at "assigned", revision 1');

  -- Replay: same actor, same operation, same request.
  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.rec_a, format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)',
      _op, _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1')) = _r,
    'C2.8 REPLAY: the same operation id and request returns the original result');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_assignments) = 1,
    'C2.9 and writes nothing a second time');

  -- A changed payload under the same operation id is refused.
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L, %L)', _op, _k.app_a, _k.v, _k.prof, _k.hash,
           'beskt-prep-notice-1', (now() + interval '7 days')),
    'BCP_OPERATION_PAYLOAD_MISMATCH', 'C2.10 the same operation id with a CHANGED request is refused');

  -- Another actor cannot take over an operation id.
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_b,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', _op, _k.app_b, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_OPERATION_ACTOR_MISMATCH', 'C2.11 and another actor cannot reuse it');

  -- One live preparation per application.
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_ASSIGNMENT_EXISTS', 'C2.12 a second live preparation for the same application is refused');

  -- The append-only ledger carries the receipt.
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_events
                       WHERE assignment_id = _a AND event = 'assignment_created') = 1,
    'C2.13 exactly one assignment_created event carries the receipt');
  PERFORM pg_temp.ok((SELECT result FROM public.bcp_events WHERE operation_id = _op) = _r,
    'C2.14 and the stored receipt IS the returned result');
END
$c2$;

-- Every refusal path on the way in.
DO $c2b$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_b,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_NOT_EMPLOYER_MEMBER', 'C2.15 CROSS-TENANT: a member of another employer cannot start on employer A''s application');
  PERFORM pg_temp.must_fail_as('authenticated', _k.outsider,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_NOT_EMPLOYER_MEMBER', 'C2.16 a roleless user cannot start one');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_NOT_EMPLOYER_MEMBER', 'C2.17 the candidate cannot assign a preparation to themselves');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_susp, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_EMPLOYER_NOT_ACTIVE', 'C2.18 a suspended employer cannot start one');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_withdrawn, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'BCP_APPLICATION_WITHDRAWN', 'C2.19 a withdrawn application cannot be prepared for');

  -- Content-state refusals.
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_b, _k.draft_v,
      (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _k.draft_v AND profile_key = 'lone_working'),
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.draft_v), 'beskt-prep-notice-1'),
    'BCP_NOT_EMPLOYER_MEMBER', 'C2.20 membership is checked before any content state is revealed');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_withdrawn, _k.draft_v,
      (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _k.draft_v AND profile_key = 'lone_working'),
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.draft_v), 'beskt-prep-notice-1'),
    'BCP_APPLICATION_WITHDRAWN', 'C2.21 and the application state before that');
END
$c2b$;

-- ---------------------------------------------------------------------------
-- C3 -- The notice. Nothing is answered before the candidate has been
--       informed, and the acknowledgement is an information receipt, never
--       consent.
-- ---------------------------------------------------------------------------
DO $c3$
DECLARE _k bcpk%ROWTYPE; _d jsonb; _h text; _r jsonb; _op uuid := gen_random_uuid();
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, 1, %L)', gen_random_uuid(), _k.assignment, '[]'),
    'BCP_NOTICE_NOT_ACKNOWLEDGED', 'C3.1 nothing can be answered before the notice is acknowledged');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_submit(%L, %L, 1)', gen_random_uuid(), _k.assignment),
    'BCP_NOTICE_NOT_ACKNOWLEDGED', 'C3.2 and nothing can be submitted before it either');

  -- The descriptor the candidate is shown, and the hash that binds it.
  _d := pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_notice_descriptor(%L)', _k.assignment));
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements_text(_d -> 'sections')) = 9,
    'C3.3 the notice covers exactly the nine required matters');
  PERFORM pg_temp.ok(
    _d -> 'sections' ? 'purpose' AND _d -> 'sections' ? 'use_of_information'
    AND _d -> 'sections' ? 'human_decision' AND _d -> 'sections' ? 'not_a_test_with_score'
    AND _d -> 'sections' ? 'may_omit_questions' AND _d -> 'sections' ? 'oral_discussion'
    AND _d -> 'sections' ? 'review_and_correct' AND _d -> 'sections' ? 'who_can_access'
    AND _d -> 'sections' ? 'retention',
    'C3.4 purpose, use, human decision, not-a-test, omission, oral, review, recipients and retention');
  PERFORM pg_temp.ok((_d ->> 'produces_score')::boolean = false
                 AND _d ->> 'decision_maker' = 'accountable_employer_human',
    'C3.5 it states that a human decides and that no score is produced');
  PERFORM pg_temp.ok(_d ->> 'retention_class' = 'recruitment_record',
    'C3.6 the retention class comes from the governed exposure profile');
  PERFORM pg_temp.ok(_d ->> 'lawful_basis_reference' IS NOT NULL,
    'C3.7 and so does the lawful-basis reference');

  _h := pg_temp.rpc(_k.cand_a, format('SELECT to_jsonb(public.bcp_notice_hash(%L))', _k.assignment)) #>> '{}';

  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_b,
    format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.assignment,
           'beskt-prep-notice-1', _h, 'sv-SE'),
    'BCP_NOT_CANDIDATE', 'C3.8 WRONG CANDIDATE: another candidate cannot acknowledge this notice');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.assignment,
           'beskt-prep-notice-1', _h, 'sv-SE'),
    'BCP_NOT_CANDIDATE', 'C3.9 and neither can the employer, on the candidate''s behalf');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.assignment,
           'beskt-prep-notice-1', repeat('a', 64), 'sv-SE'),
    'BCP_NOTICE_HASH_MISMATCH', 'C3.10 a notice the client invented is refused: the hash is the server''s own');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)', gen_random_uuid(), _k.assignment,
           'beskt-prep-notice-0', _h, 'sv-SE'),
    'BCP_NOTICE_VERSION_MISMATCH', 'C3.11 and so is an older notice version');

  _r := pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)',
          _op, _k.assignment, 'beskt-prep-notice-1', _h, 'sv-SE'));
  UPDATE bcpk SET response = (_r ->> 'response_id')::uuid;

  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _k.assignment) = 'notice_acknowledged',
    'C3.12 acknowledging moves the preparation to notice_acknowledged');
  PERFORM pg_temp.ok((SELECT acknowledged_at FROM public.bcp_assignments WHERE id = _k.assignment) IS NOT NULL
                 AND (SELECT first_opened_at FROM public.bcp_assignments WHERE id = _k.assignment) IS NOT NULL,
    'C3.13 the delivery and acknowledgement times are recorded');
  PERFORM pg_temp.ok((SELECT acknowledgement_kind FROM public.bcp_notice_acknowledgements
                       WHERE assignment_id = _k.assignment) = 'information_received',
    'C3.14 the acknowledgement is recorded as information received -- NOT as GDPR consent');
  PERFORM pg_temp.ok((SELECT notice_content_hash FROM public.bcp_notice_acknowledgements
                       WHERE assignment_id = _k.assignment) = _h,
    'C3.15 bound to the exact notice bytes the candidate was shown');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_responses WHERE assignment_id = _k.assignment) = 1,
    'C3.16 and the candidate''s first draft is opened in the same transaction');

  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, %L, %L)',
      _op, _k.assignment, 'beskt-prep-notice-1', _h, 'sv-SE')) = _r,
    'C3.17 REPLAY: acknowledging again with the same operation id returns the original receipt');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_notice_acknowledgements WHERE assignment_id = _k.assignment) = 1,
    'C3.18 and records no second acknowledgement');

  PERFORM pg_temp.must_fail(format(
    'UPDATE public.bcp_notice_acknowledgements SET locale = %L WHERE assignment_id = %L', 'en-GB', _k.assignment),
    'BCP_APPEND_ONLY', 'C3.19 an acknowledgement can never be edited');
  PERFORM pg_temp.must_fail(format(
    'DELETE FROM public.bcp_notice_acknowledgements WHERE assignment_id = %L', _k.assignment),
    'BCP_APPEND_ONLY', 'C3.20 nor deleted, by any caller');
END
$c3$;


-- ---------------------------------------------------------------------------
-- C4 -- Answering: governed visibility, neutral states, save and resume,
--       and compare-and-swap.
-- ---------------------------------------------------------------------------
DO $c4$
DECLARE
  _k bcpk%ROWTYPE; _rev integer; _before bigint; _op uuid := gen_random_uuid(); _r jsonb;
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.ok(
    pg_temp.visible_keys(_k.assignment, _k.cand_a)
      = ARRAY['lone_working_experience', 'reported_incident', 'information_acknowledged'],
    'C4.1 only the governed items the routing currently shows are in front of the candidate');

  -- An item a show rule has not yet opened cannot be answered.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"lone_working_example","response_state":"answered","value_text":"smuggled"}]'),
    'BCP_ITEM_NOT_VISIBLE', 'C4.2 HIDDEN ITEM: an item the candidate cannot see cannot be answered');

  -- An interview-phase item, an item of another version, and a
  -- security-vetting item are all refused.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"interview_topic_lone_working","response_state":"omitted"}]'),
    'BCP_ITEM_NOT_CANDIDATE_PHASE', 'C4.3 an interview-phase item is not a candidate-preparation item');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"not_an_item_of_this_version","response_state":"omitted"}]'),
    'BCP_ITEM_NOT_IN_VERSION', 'C4.4 an item outside the assigned version is refused');

  -- Stale revision: refused, and NOTHING is written.
  _before := (SELECT count(*) FROM public.bcp_answers);
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment, 99,
      '[{"item_key":"reported_incident","response_state":"answered","value_boolean":true}]'),
    'BCP_STALE_REVISION', 'C4.5 STALE REVISION: a save naming the wrong revision is refused');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_answers) = _before,
    'C4.6 and writes nothing at all');

  -- A real save. i1 = yes opens i2 through PR #218's routing authority.
  _rev := pg_temp.draft_revision(_k.assignment);
  _r := pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', _op, _k.assignment, _rev,
    '[{"item_key":"lone_working_experience","response_state":"answered","option_keys":["yes"]},'
    '{"item_key":"reported_incident","response_state":"answered","value_boolean":true}]'));
  PERFORM pg_temp.ok((_r ->> 'saved')::int = 2, 'C4.7 two typed answers are saved against governed item keys');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _k.assignment) = 'in_progress',
    'C4.8 and the preparation moves to in_progress');
  PERFORM pg_temp.ok(
    pg_temp.visible_keys(_k.assignment, _k.cand_a)
      = ARRAY['lone_working_experience', 'lone_working_example', 'reported_incident',
              'incident_context', 'information_acknowledged'],
    'C4.9 ROUTING: answering opens exactly the governed follow-up items, in governed order');

  -- Resume: the exact answers come back.
  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.cand_a, format(
      'SELECT (SELECT e -> ''answer'' FROM jsonb_array_elements(public.bcp_candidate_preparation(%L) -> ''items'') e WHERE e ->> ''item_key'' = ''lone_working_experience'')',
      _k.assignment)) -> 'option_keys' = '["yes"]'::jsonb,
    'C4.10 SAVE AND RESUME: the exact stored answer is returned to the candidate');

  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', _op, _k.assignment, _rev,
      '[{"item_key":"lone_working_experience","response_state":"answered","option_keys":["yes"]},'
      '{"item_key":"reported_incident","response_state":"answered","value_boolean":true}]')) = _r,
    'C4.11 REPLAY: the same save operation returns the original receipt');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_answers WHERE response_id = _k.response) = 2,
    'C4.12 and does not double-write');
END
$c4$;

DO $c4b$
DECLARE _k bcpk%ROWTYPE; _rev integer;
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"lone_working_experience","response_state":"answered","option_keys":["maybe"]}]'),
    'BCP_OPTION_NOT_IN_ITEM', 'C4.13 an option the governed item does not offer is refused');

  -- "Discuss orally" only where the governed item allows it.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"information_acknowledged","response_state":"discuss_orally"}]'),
    'BCP_ORAL_NOT_ALLOWED', 'C4.14 "discuss orally" is refused where the governed item does not allow it');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment),
      '[{"item_key":"reported_incident","response_state":"maybe_later"}]'),
    'BCP_ANSWER_STATE_UNKNOWN', 'C4.15 and there is no fourth response state');

  -- Wrong subject: nobody else writes into this preparation.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_b,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment), '[]'),
    'BCP_NOT_CANDIDATE', 'C4.16 WRONG CANDIDATE: another candidate cannot answer this preparation');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_save_answers(%L, %L, %s, %L)', gen_random_uuid(), _k.assignment,
      pg_temp.draft_revision(_k.assignment), '[]'),
    'BCP_NOT_CANDIDATE', 'C4.17 and neither can the employer answer on their behalf');

  -- Neutrality: a discuss-orally answer fires no rule, so the item it would
  -- have opened closes again -- an omission opens no branch.
  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"lone_working_experience","response_state":"discuss_orally"}]'));
  PERFORM pg_temp.ok(
    NOT (pg_temp.visible_keys(_k.assignment, _k.cand_a) @> ARRAY['lone_working_example']),
    'C4.18 NEUTRAL: a discuss-orally answer fires no routing rule and opens no branch');
  PERFORM pg_temp.ok(
    (SELECT value_boolean IS NULL AND value_text IS NULL AND value_date IS NULL AND selected_option_keys IS NULL
       FROM public.bcp_answers WHERE response_id = _k.response AND item_key = 'lone_working_experience'),
    'C4.19 and carries no value at all, so it cannot be read as one');

  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"lone_working_experience","response_state":"omitted"}]'));
  PERFORM pg_temp.ok(
    NOT (pg_temp.visible_keys(_k.assignment, _k.cand_a) @> ARRAY['lone_working_example']),
    'C4.20 an omitted answer is equally neutral');
  PERFORM pg_temp.ok(
    (SELECT public.bcp_routing_answers(_k.response)) -> 'lone_working_experience' IS NULL,
    'C4.21 and neither state reaches the routing map at all');

  -- CORRECTION before submission: the candidate changes their mind back.
  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"lone_working_experience","response_state":"answered","option_keys":["yes"]}]'));
  PERFORM pg_temp.ok(
    pg_temp.visible_keys(_k.assignment, _k.cand_a) @> ARRAY['lone_working_example'],
    'C4.22 CORRECTION: a candidate may change an answer before submission, and routing follows');
END
$c4b$;

-- ---------------------------------------------------------------------------
-- C5 -- Review, submit, and immutability.
-- ---------------------------------------------------------------------------
DO $c5$
DECLARE
  _k bcpk%ROWTYPE; _rev integer; _op uuid := gen_random_uuid(); _r jsonb; _hash text;
BEGIN
  SELECT * INTO _k FROM bcpk;

  -- Answer the follow-up the routing opened, then take the source back to
  -- "no" so the follow-up is hidden again with its answer still stored.
  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"lone_working_example","response_state":"answered","value_text":"Syntetiskt svar."}]'));
  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"lone_working_experience","response_state":"answered","option_keys":["no"]}]'));
  PERFORM pg_temp.ok(
    NOT (pg_temp.visible_keys(_k.assignment, _k.cand_a) @> ARRAY['lone_working_example']),
    'C5.1 a follow-up the candidate closed again is no longer shown');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_answers WHERE response_id = _k.response AND item_key = 'lone_working_example') = 1,
    'C5.2 although its earlier answer is still stored in the draft');

  -- Incomplete submission names exactly what is outstanding.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_submit(%L, %L, %s)', gen_random_uuid(), _k.assignment,
           pg_temp.draft_revision(_k.assignment)),
    'BCP_INCOMPLETE', 'C5.3 a submission is refused while a shown question has not been addressed');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _k.assignment) = 'in_progress',
    'C5.4 and the preparation is untouched by the refusal');

  -- Address the rest: one skipped, one acknowledged.
  _rev := pg_temp.draft_revision(_k.assignment);
  PERFORM pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _k.assignment, _rev,
    '[{"item_key":"incident_context","response_state":"omitted"},'
    '{"item_key":"information_acknowledged","response_state":"answered","value_boolean":true}]'));

  -- Stale revision on submit is refused without writing.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_submit(%L, %L, 99)', gen_random_uuid(), _k.assignment),
    'BCP_STALE_REVISION', 'C5.5 a submission naming a stale revision is refused without writing');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _k.assignment) = 'in_progress',
    'C5.6 and the preparation is still open');

  -- Wrong subject cannot submit.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_b,
    format('SELECT public.bcp_submit(%L, %L, %s)', gen_random_uuid(), _k.assignment,
           pg_temp.draft_revision(_k.assignment)),
    'BCP_NOT_CANDIDATE', 'C5.7 another candidate cannot submit this preparation');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_submit(%L, %L, %s)', gen_random_uuid(), _k.assignment,
           pg_temp.draft_revision(_k.assignment)),
    'BCP_NOT_CANDIDATE', 'C5.8 and neither can the employer submit it for them');

  -- The real submission.
  _rev := pg_temp.draft_revision(_k.assignment);
  _r := pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_submit(%L, %L, %s)', _op, _k.assignment, _rev));
  _hash := _r ->> 'submitted_content_hash';

  PERFORM pg_temp.ok(_r ->> 'lifecycle_state' = 'submitted' AND _hash ~ '^[0-9a-f]{64}$',
    'C5.9 SUBMIT: the draft is frozen and hashed in one transaction');
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _k.assignment) = 'submitted'
                 AND (SELECT submitted_at FROM public.bcp_assignments WHERE id = _k.assignment) IS NOT NULL,
    'C5.10 the assignment records the submission time');
  PERFORM pg_temp.ok(
    (SELECT submitted_method_content_hash FROM public.bcp_responses WHERE id = _k.response) = _k.hash,
    'C5.11 and the method content hash the answers were given against');

  -- The stale hidden answer had NO downstream effect.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_answers WHERE response_id = _k.response AND item_key = 'lone_working_example') = 0,
    'C5.12 STALE HIDDEN ANSWER: an answer the final routing no longer shows is removed, not submitted');
  PERFORM pg_temp.ok(
    (SELECT (metadata ->> 'stale_hidden_answers_removed')::int FROM public.bcp_events WHERE operation_id = _op) = 1,
    'C5.13 and the removal is recorded in the append-only ledger');
  PERFORM pg_temp.ok(
    (SELECT array_agg(item_key ORDER BY item_key) FROM public.bcp_answers WHERE response_id = _k.response)
      = ARRAY['incident_context', 'information_acknowledged', 'lone_working_experience', 'reported_incident'],
    'C5.14 the frozen response holds exactly the questions that were on screen');

  -- Idempotent, and once only.
  PERFORM pg_temp.ok(
    pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_submit(%L, %L, %s)', _op, _k.assignment, _rev)) = _r,
    'C5.15 REPLAY: submitting again with the same operation id returns the original receipt');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_submit(%L, %L, %s)', gen_random_uuid(), _k.assignment, 1),
    'BCP_ALREADY_SUBMITTED', 'C5.16 and a genuinely second submission is refused');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_responses WHERE assignment_id = _k.assignment) = 1,
    'C5.17 exactly one response version exists');

  -- Read-only from here.
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_save_answers(%L, %L, 1, %L)', gen_random_uuid(), _k.assignment,
      '[{"item_key":"reported_incident","response_state":"omitted"}]'),
    'BCP_ALREADY_SUBMITTED', 'C5.18 nothing can be answered after submission');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_cancel(%L, %L, %L)', gen_random_uuid(), _k.assignment, 'too late'),
    'BCP_ALREADY_SUBMITTED', 'C5.19 and the employer cannot cancel away a submitted basis');
  PERFORM pg_temp.ok(
    (pg_temp.rpc(_k.cand_a, format('SELECT public.bcp_candidate_preparation(%L)', _k.assignment))
       ->> 'read_only')::boolean,
    'C5.20 the candidate sees a clear read-only, submitted state');
END
$c5$;

-- Immutability against EVERY writer, including the table owner.
DO $c5b$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;
  PERFORM pg_temp.must_fail(format(
    'UPDATE public.bcp_responses SET submitted_content_hash = %L WHERE id = %L', repeat('b', 64), _k.response),
    'BCP_RESPONSE_IMMUTABLE', 'C5.21 IMMUTABLE: a submitted response cannot be edited, by any caller');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.bcp_responses WHERE id = %L', _k.response),
    'BCP_RESPONSE_NO_DELETE', 'C5.22 nor deleted');
  PERFORM pg_temp.must_fail(format(
    'UPDATE public.bcp_answers SET value_text = %L WHERE response_id = %L AND item_key = %L',
    'rewritten', _k.response, 'incident_context'),
    'BCP_ANSWER_FROZEN', 'C5.23 nor may an answer under it be changed');
  PERFORM pg_temp.must_fail(format(
    'DELETE FROM public.bcp_answers WHERE response_id = %L', _k.response),
    'BCP_ANSWER_FROZEN', 'C5.24 nor removed');
  PERFORM pg_temp.must_fail(format(
    'INSERT INTO public.bcp_answers (response_id, item_id, item_key, answer_type, response_state) VALUES (%L, %L, %L, %L, %L)',
    _k.response, (SELECT id FROM public.beskt_items WHERE method_version_id = _k.v AND item_key = 'lone_working_example'),
    'lone_working_example', 'long_text', 'omitted'),
    'BCP_ANSWER_FROZEN', 'C5.25 nor added to');
  PERFORM pg_temp.must_fail(format(
    'UPDATE public.bcp_assignments SET lifecycle_state = %L WHERE id = %L', 'in_progress', _k.assignment),
    'BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE', 'C5.26 and a submitted preparation cannot be rewound');
  PERFORM pg_temp.must_fail(format(
    'UPDATE public.bcp_assignments SET method_version_id = %L WHERE id = %L', _k.draft_v, _k.assignment),
    'BCP_ASSIGNMENT_IMMUTABLE', 'C5.27 what was assigned can never be swapped underneath it');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.bcp_assignments WHERE id = %L', _k.assignment),
    'BCP_ASSIGNMENT_NO_DELETE', 'C5.28 and an assignment is cancelled, never deleted');
  PERFORM pg_temp.must_fail(format('UPDATE public.bcp_events SET reason = %L WHERE assignment_id = %L', 'x', _k.assignment),
    'BCP_APPEND_ONLY', 'C5.29 the lifecycle ledger is append-only for every caller');
  PERFORM pg_temp.must_fail(format('DELETE FROM public.bcp_events WHERE assignment_id = %L', _k.assignment),
    'BCP_APPEND_ONLY', 'C5.30 including deletion');
END
$c5b$;

-- ---------------------------------------------------------------------------
-- C6 -- Who may read what. A second employer, a second candidate and a
--       second, UNSUBMITTED preparation make every boundary testable.
-- ---------------------------------------------------------------------------
DO $c6prep$
DECLARE _k bcpk%ROWTYPE; _r jsonb; _b uuid;
BEGIN
  SELECT * INTO _k FROM bcpk;
  PERFORM pg_temp.rpc(_k.admin_u, format('SELECT public.bcp_grant_pilot(%L, %L, %L, %L, %L)',
    gen_random_uuid(), _k.emp_b, _k.v, 'owner decision: synthetic pilot B', (current_date + 30)));
  _r := pg_temp.rpc(_k.rec_b, format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)',
    gen_random_uuid(), _k.app_b, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'));
  _b := (_r ->> 'assignment_id')::uuid;
  UPDATE bcpk SET scratch = _b::text;

  -- Candidate B acknowledges and answers, but does NOT submit.
  PERFORM pg_temp.rpc(_k.cand_b, format('SELECT public.bcp_acknowledge_notice(%L, %L, %L, public.bcp_notice_hash(%L), %L)',
    gen_random_uuid(), _b, 'beskt-prep-notice-1', _b, 'en-GB'));
  PERFORM pg_temp.rpc(_k.cand_b, format('SELECT public.bcp_save_answers(%L, %L, %s, %L)',
    gen_random_uuid(), _b, pg_temp.draft_revision(_b),
    '[{"item_key":"reported_incident","response_state":"answered","value_boolean":false}]'));
END
$c6prep$;

DO $c6$
DECLARE _k bcpk%ROWTYPE; _b uuid; _rb jsonb;
BEGIN
  SELECT * INTO _k FROM bcpk;
  _b := _k.scratch::uuid;

  -- Candidates see their own preparation and nobody else's.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, 'SELECT count(*) FROM public.bcp_candidate_assignments()') = 1,
    'C6.1 a candidate''s My Career list holds exactly their own preparation');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a,
      format('SELECT count(*) FROM public.bcp_candidate_assignments() WHERE assignment_id = %L', _k.assignment)) = 1,
    'C6.2 and it is theirs');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_b,
      format('SELECT count(*) FROM public.bcp_candidate_assignments() WHERE assignment_id = %L', _k.assignment)) = 0,
    'C6.3 another candidate''s preparation is absent from it');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_b,
    format('SELECT public.bcp_candidate_preparation(%L)', _k.assignment),
    'BCP_NOT_AUTHORISED', 'C6.4 WRONG CANDIDATE: and cannot be opened directly either');
  PERFORM pg_temp.must_fail_as('authenticated', _k.outsider,
    format('SELECT public.bcp_candidate_preparation(%L)', _k.assignment),
    'BCP_NOT_AUTHORISED', 'C6.5 a roleless user opens nothing');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_candidate_preparation(%L)', _k.assignment),
    'BCP_NOT_AUTHORISED', 'C6.6 and the employer never reads the candidate''s own working view');

  -- THE DRAFT BOUNDARY.
  _rb := pg_temp.rpc(_k.rec_b, format('SELECT public.bcp_employer_readback(%L)', _b));
  PERFORM pg_temp.ok(_rb ->> 'lifecycle_state' = 'in_progress' AND (_rb ->> 'is_submitted')::boolean = false,
    'C6.7 the employer sees the STATUS of an unsubmitted preparation');
  PERFORM pg_temp.ok(_rb -> 'answers' = 'null'::jsonb AND _rb -> 'submitted_response' = 'null'::jsonb,
    'C6.8 DRAFT PRIVACY: but no answers at all -- absent, not empty, not partial');
  PERFORM pg_temp.ok(_rb -> 'topics_for_interview' = 'null'::jsonb,
    'C6.9 and no derived topics from an unsubmitted draft');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format(
      'SELECT count(*) FROM public.bcp_answers a JOIN public.bcp_responses r ON r.id = a.response_id WHERE r.assignment_id = %L', _b)) = 0,
    'C6.10 nor can the employer reach a draft answer through the tables');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_b, format(
      'SELECT count(*) FROM public.bcp_answers a JOIN public.bcp_responses r ON r.id = a.response_id WHERE r.assignment_id = %L', _b)) = 1,
    'C6.11 while its own candidate reads it perfectly well');

  -- The submitted readback.
  _rb := pg_temp.rpc(_k.rec_a, format('SELECT public.bcp_employer_readback(%L)', _k.assignment));
  PERFORM pg_temp.ok((_rb ->> 'is_submitted')::boolean AND _rb ->> 'submitted_at' IS NOT NULL,
    'C6.12 READBACK: the employer sees that it was submitted, and when');
  PERFORM pg_temp.ok(_rb #>> '{method,content_hash}' = _k.hash
                 AND _rb #>> '{method,content_hash_algorithm}' = 'sha256'
                 AND (_rb #>> '{method,version_number}')::int >= 1,
    'C6.13 with the method, version and content hash actually used');
  PERFORM pg_temp.ok((SELECT count(*) FROM jsonb_array_elements(_rb -> 'answers')) = 4,
    'C6.14 and the candidate''s own four submitted answers');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_rb -> 'answers') e WHERE e ->> 'response_state' = 'omitted') = 1,
    'C6.15 with the omitted state shown explicitly, as a state and not a blank');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_rb -> 'topics_for_interview') e
      WHERE e ->> 'item_key' = 'incident_context' AND e ->> 'reason' = 'omitted') = 1,
    'C6.16 and the governed topic the interview still needs to cover');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_rb -> 'answers') e
      WHERE e ->> 'item_key' = 'lone_working_example') = 0,
    'C6.17 the stale hidden answer reaches the employer nowhere');

  -- Cross-tenant.
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_b,
    format('SELECT public.bcp_employer_readback(%L)', _k.assignment),
    'BCP_NOT_AUTHORISED', 'C6.18 CROSS-TENANT: another employer''s member reads nothing');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_employer_readback(%L)', _b),
    'BCP_NOT_AUTHORISED', 'C6.19 a candidate cannot use the employer readback');
  PERFORM pg_temp.must_fail_as('authenticated', _k.outsider,
    format('SELECT public.bcp_employer_readback(%L)', _k.assignment),
    'BCP_NOT_AUTHORISED', 'C6.20 and neither can a roleless user');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_employer_assignments(%L)', _k.emp_a)) = 0,
    'C6.21 the employer list is empty for another employer''s member');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format('SELECT count(*) FROM public.bcp_employer_assignments(%L)', _k.emp_a)) = 1,
    'C6.22 and holds exactly their own employer''s preparations');

  -- Direct table reads obey the same boundary.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_b, format('SELECT count(*) FROM public.bcp_assignments WHERE id = %L', _k.assignment)) = 0,
    'C6.23 RLS: another candidate reads no row of this assignment');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignments WHERE id = %L', _k.assignment)) = 0,
    'C6.24 nor does another employer''s member');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.outsider, 'SELECT count(*) FROM public.bcp_assignments') = 0,
    'C6.25 a roleless user reads no assignment at all');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.outsider, 'SELECT count(*) FROM public.bcp_answers') = 0
    AND pg_temp.count_as(_k.outsider, 'SELECT count(*) FROM public.bcp_responses') = 0
    AND pg_temp.count_as(_k.outsider, 'SELECT count(*) FROM public.bcp_events') = 0,
    'C6.26 and no response, answer or ledger row');
END
$c6$;

-- Anonymous callers get nothing anywhere.
DO $c6b$
DECLARE _k bcpk%ROWTYPE; _t text;
BEGIN
  SELECT * INTO _k FROM bcpk;
  FOREACH _t IN ARRAY ARRAY['bcp_pilot_grants', 'bcp_assignments', 'bcp_notice_acknowledgements',
                            'bcp_responses', 'bcp_answers', 'bcp_events'] LOOP
    PERFORM pg_temp.must_fail(format('SET LOCAL ROLE anon; SELECT count(*) FROM public.%I', _t),
      'permission denied', 'C6.27 anon cannot read ' || _t);
    RESET ROLE;
  END LOOP;
  PERFORM pg_temp.must_fail(format('SET LOCAL ROLE anon; SELECT public.bcp_candidate_preparation(%L)', _k.assignment),
    'permission denied', 'C6.28 anon cannot call the candidate read model');
  RESET ROLE;
  PERFORM pg_temp.must_fail(format('SET LOCAL ROLE anon; SELECT public.bcp_employer_readback(%L)', _k.assignment),
    'permission denied', 'C6.29 anon cannot call the employer readback');
  RESET ROLE;
  PERFORM pg_temp.must_fail(format('SET LOCAL ROLE anon; SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)',
    gen_random_uuid(), _k.app_a, _k.v, _k.prof, _k.hash, 'beskt-prep-notice-1'),
    'permission denied', 'C6.30 and anon cannot start a preparation');
  RESET ROLE;
END
$c6b$;

-- The widened read contract widened EXACTLY one thing.
DO $c6c$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, format(
      'SELECT count(*) FROM public.beskt_resolve_item_sequence(%L, %L, %L, ''{}''::jsonb)', _k.v, _k.prof, 'recruitment_support')) = 3,
    'C6.31 THE ONE WIDENING: a preparation party reaches PR #218''s routing authority for their own version');
  PERFORM pg_temp.must_fail_as('authenticated', _k.outsider,
    format('SELECT count(*) FROM public.beskt_resolve_item_sequence(%L, %L, %L, ''{}''::jsonb)', _k.v, _k.prof, 'recruitment_support'),
    'BESKT_NOT_AUTHORISED', 'C6.32 and nobody without an assignment does');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.beskt_published_method(%L)', _k.v),
    'BESKT_NOT_AUTHORISED', 'C6.33 the FULL governed document stays closed to the candidate');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.beskt_published_method(%L)', _k.v),
    'BESKT_NOT_AUTHORISED', 'C6.34 and to the employer: no interviewer prompt, anchor or routing graph leaks');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, 'SELECT count(*) FROM public.beskt_readable_published_versions()') = 0,
    'C6.35 the governed listing stays closed to a preparation party');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, 'SELECT count(*) FROM public.beskt_items') = 0
    AND pg_temp.count_as(_k.cand_a, 'SELECT count(*) FROM public.beskt_prompts') = 0,
    'C6.36 and the governed content tables answer them nothing directly');
  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT count(*) FROM public.beskt_resolve_item_sequence(%L, %L, %L, ''{}''::jsonb)',
      _k.sv_v, _k.sv_prof, 'security_vetting_support'),
    'BESKT_NOT_AUTHORISED', 'C6.37 SECURITY VETTING: never reachable through a preparation, in any mode');
END
$c6c$;

-- ---------------------------------------------------------------------------
-- C7 -- What may be ASSIGNED. Only published recruitment-support content, at
--       the exact version, profile and hash the caller was looking at.
-- ---------------------------------------------------------------------------
DO $c7$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;

  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.draft_v,
      (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _k.draft_v AND profile_key = 'lone_working'),
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.draft_v), 'beskt-prep-notice-1'),
    'BCP_METHOD_NOT_PUBLISHED', 'C7.1 a DRAFT method version can never be assigned');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.susp_v, _k.susp_prof,
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.susp_v), 'beskt-prep-notice-1'),
    'BCP_METHOD_NOT_PUBLISHED', 'C7.2 nor a SUSPENDED one');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.ret_v,
      (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _k.ret_v AND profile_key = 'lone_working'),
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.ret_v), 'beskt-prep-notice-1'),
    'BCP_METHOD_NOT_PUBLISHED', 'C7.3 nor a RETIRED one');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.sv_v, _k.sv_prof,
      (SELECT content_hash FROM public.beskt_method_versions WHERE id = _k.sv_v), 'beskt-prep-notice-1'),
    'BCP_METHOD_MODE_NOT_PERMITTED', 'C7.4 SECURITY VETTING: a security-vetting method can never be assigned here');

  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.v, _k.prof,
      repeat('c', 64), 'beskt-prep-notice-1'),
    'BCP_CONTENT_HASH_MISMATCH', 'C7.5 HASH MISMATCH: content that moved since the caller looked is refused');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.v, _k.susp_prof,
      _k.hash, 'beskt-prep-notice-1'),
    'BCP_PROFILE_NOT_IN_VERSION', 'C7.6 PROFILE MISMATCH: a profile of another version is refused');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.v, _k.prof,
      _k.hash, 'beskt-prep-notice-99'),
    'BCP_NOTICE_VERSION_UNKNOWN', 'C7.7 and an unknown candidate notice version is refused');

  -- Revocation closes the door again, on the list and on the create call.
  PERFORM pg_temp.rpc(_k.admin_u, format('SELECT public.bcp_revoke_pilot(%L, %L, %L, %L)',
    gen_random_uuid(), _k.emp_a, _k.v, 'Syntetisk återkallelse.'));
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format('SELECT count(*) FROM public.bcp_assignable_method_versions(%L)', _k.emp_a)) = 0,
    'C7.8 REVOKED: the employer is offered nothing again');
  PERFORM pg_temp.must_fail_as('authenticated', _k.rec_a,
    format('SELECT public.bcp_assign(%L, %L, %L, %L, %L, %L)', gen_random_uuid(), _k.app_a2, _k.v, _k.prof,
      _k.hash, 'beskt-prep-notice-1'),
    'BCP_NOT_ASSIGNABLE', 'C7.9 and cannot start a new preparation');
  PERFORM pg_temp.ok(
    (pg_temp.rpc(_k.rec_a, format('SELECT public.bcp_employer_readback(%L)', _k.assignment)) ->> 'is_submitted')::boolean,
    'C7.10 while the preparation already submitted under the grant stays readable');
END
$c7$;


-- ---------------------------------------------------------------------------
-- C8 -- Privileges. No client role writes anything directly, service_role
--       included, and no helper function is a way round that.
-- ---------------------------------------------------------------------------
DO $c8$
DECLARE
  _k bcpk%ROWTYPE; _t text; _priv text; _role text; _fn text; _n integer;
BEGIN
  SELECT * INTO _k FROM bcpk;

  FOREACH _t IN ARRAY ARRAY['bcp_pilot_grants', 'bcp_assignments', 'bcp_notice_acknowledgements',
                            'bcp_responses', 'bcp_answers', 'bcp_events'] LOOP
    PERFORM pg_temp.ok(
      (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = _t),
      'C8.1 ' || _t || ' carries ENABLE and FORCE row level security');
    FOREACH _priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      FOREACH _role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF has_table_privilege(_role, 'public.' || _t, _priv) THEN
          RAISE EXCEPTION 'ASSERTION FAILED: % holds % on %', _role, _priv, _t;
        END IF;
      END LOOP;
    END LOOP;
    PERFORM pg_temp.ok(true, 'C8.2 no client role, service_role included, may write ' || _t);
  END LOOP;

  -- service_role is not a user-facing authorisation mechanism.
  PERFORM pg_temp.must_fail(format(
    'SET LOCAL ROLE service_role; INSERT INTO public.bcp_assignments (employer_id, job_id, application_id, candidate_user_id, method_version_id, exposure_profile_id, pinned_content_hash, pinned_release_scope, notice_version, assigned_by) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
    _k.emp_b, _k.job_a, _k.app_a2, _k.cand_a, _k.v, _k.prof, _k.hash, 'synthetic_internal_only', 'beskt-prep-notice-1', _k.rec_b),
    'permission denied', 'C8.3 NO SERVICE-ROLE BYPASS: service_role cannot forge an assignment');
  RESET ROLE;
  PERFORM pg_temp.must_fail(format(
    'SET LOCAL ROLE service_role; UPDATE public.bcp_answers SET value_text = %L WHERE response_id = %L', 'x', _k.response),
    'permission denied', 'C8.4 nor rewrite a submitted answer');
  RESET ROLE;
  PERFORM pg_temp.must_fail(
    'SET LOCAL ROLE service_role; DELETE FROM public.bcp_events',
    'permission denied', 'C8.5 nor erase the ledger');
  RESET ROLE;

  -- The internal helpers are not a way round the RPCs.
  FOREACH _fn IN ARRAY ARRAY[
      'public.bcp_record_event(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,uuid,text,jsonb,jsonb)',
      'public.bcp_operation_begin(uuid,text)',
      'public.bcp_canonical_answers(uuid)',
      'public.bcp_answers_content_hash(uuid)',
      'public.bcp_routing_answers(uuid)',
      'public.bcp_visible_items(uuid,uuid)',
      'public.bcp_party_can_read_method_version(uuid)'] LOOP
    IF has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE')
       OR has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: internal helper % is reachable by a client role', _fn;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'C8.6 NO HELPER BYPASS: every internal helper is unreachable by anon and authenticated');

  PERFORM pg_temp.must_fail_as('authenticated', _k.cand_a,
    format('SELECT public.bcp_visible_items(%L, %L)', _k.assignment, _k.response),
    'permission denied', 'C8.7 including the visibility helper, even for the candidate it concerns');

  -- Every bcp_ function pins its search_path and is closed to anon.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'bcp\_%' ESCAPE '\'
     AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  PERFORM pg_temp.ok(_n = 0, 'C8.8 every bcp_ function pins its search_path');
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'bcp\_%' ESCAPE '\'
     AND has_function_privilege('anon', p.oid::regprocedure, 'EXECUTE');
  PERFORM pg_temp.ok(_n = 0, 'C8.9 and none of them is executable by anon');

  -- No table is left readable-by-default or writable by policy.
  SELECT count(*) INTO _n FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename LIKE 'bcp\_%' ESCAPE '\'
     AND (p.cmd <> 'SELECT' OR p.qual IS NULL OR p.qual = 'true');
  PERFORM pg_temp.ok(_n = 0, 'C8.10 no write policy and no unconditional policy exists on any bcp_ table');
END
$c8$;


-- ---------------------------------------------------------------------------
-- C9 -- No interpretation exists anywhere: not as a column, not as a
--       function, not as a returned key.
-- ---------------------------------------------------------------------------
DO $c9$
DECLARE _k bcpk%ROWTYPE; _n integer; _rb jsonb; _src text;
BEGIN
  SELECT * INTO _k FROM bcpk;

  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'bcp\_%' ESCAPE '\'
     AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire)'
          OR c.column_name = 'points');
  PERFORM pg_temp.ok(_n = 0, 'C9.1 NO SCORE PATH: no scoring, ranking, suitability or verdict column exists');

  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'bcp\_%' ESCAPE '\'
     AND c.data_type = 'jsonb' AND c.table_name <> 'bcp_events';
  PERFORM pg_temp.ok(_n = 0, 'C9.2 answers are typed: no free-form jsonb answer document exists');

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'bcp\_%' ESCAPE '\'
     AND p.proname ~* '(score|rank|rate|grade|suitab|credib|verdict|recommend|decide|risk)';
  PERFORM pg_temp.ok(_n = 0, 'C9.3 and no bcp_ function is named for one');

  _rb := pg_temp.rpc(_k.rec_a, format('SELECT public.bcp_employer_readback(%L)', _k.assignment));
  SELECT count(*) INTO _n FROM jsonb_object_keys(_rb) k
   WHERE k ~* '(score|rank|suitab|credib|truthful|recommend|risk|verdict|conclusion|assessment|observation|grade)';
  PERFORM pg_temp.ok(_n = 0, 'C9.4 the employer readback returns no score, conclusion, observation or grade key');
  PERFORM pg_temp.ok(NOT (_rb ? 'application_status') AND NOT (_rb ? 'report'),
    'C9.5 and neither an application status nor a report: those belong to later PRs');
  -- app_a carried a preparation all the way to submission; app_a2 never had
  -- one. Their application status is identical, so nothing in PR 3 moved it.
  PERFORM pg_temp.ok(
    (SELECT status FROM public.job_applications WHERE id = _k.app_a) =
    (SELECT status FROM public.job_applications WHERE id = _k.app_a2),
    'C9.6 NO STATUS CHANGE: a submitted preparation left the job application exactly where an unprepared control sits');

  -- The neutral states really are neutral all the way through.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM jsonb_array_elements(_rb -> 'answers') e
      WHERE e ->> 'response_state' = 'omitted'
        AND e -> 'value_text' = 'null'::jsonb AND e -> 'value_boolean' = 'null'::jsonb) = 1,
    'C9.7 an omitted answer reaches the employer as a STATE with no value invented for it');

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_routing_answers';
  PERFORM pg_temp.ok(position('a.response_state = ''answered''' in _src) > 0,
    'C9.8 and never reaches the routing map, so it can open no adverse branch');

  -- PR #218's boundaries are exactly where PR #218 left them.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.beskt_method_versions'::regclass
               AND pg_get_constraintdef(oid) LIKE '%release_scope = ''synthetic_internal_only''%'),
    'C9.9 release_scope was NOT widened: synthetic_internal_only is still the only representable value');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'beskt\_%' ESCAPE '\') = 13,
    'C9.10 the PR #218 content domain still has exactly its thirteen tables');
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_resolve_item_sequence';
  PERFORM pg_temp.ok(position('BESKT_ROUTE_NOT_ORDERED' in _src) > 0 AND position('r.evaluation_order' in _src) = 0,
    'C9.11 and PR #218''s routing authority is reused unchanged, not forked');
END
$c9$;

-- ---------------------------------------------------------------------------
-- C10 -- The exposure-profile selector the employer screen offers.
-- ---------------------------------------------------------------------------
DO $c10$
DECLARE _k bcpk%ROWTYPE;
BEGIN
  SELECT * INTO _k FROM bcpk;
  -- Employer A's grant was revoked in C7, employer B's is still live.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L)', _k.emp_b, _k.v)) = 1,
    'C10.1 an admitted employer is offered the documented role-exposure profile');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format(
      'SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L) WHERE candidate_item_count = 5 AND retention_class = %L',
      _k.emp_b, _k.v, 'recruitment_record')) = 1,
    'C10.2 with the number of candidate questions it carries and its retention class');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_a, format('SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L)', _k.emp_a, _k.v)) = 0,
    'C10.3 an employer whose grant was revoked is offered none');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L)', _k.emp_a, _k.v)) = 0,
    'C10.4 CROSS-TENANT: and none for an employer they are not a member of');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.cand_a, format('SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L)', _k.emp_a, _k.v)) = 0,
    'C10.5 a candidate enumerates no governed profile at all');
  PERFORM pg_temp.ok(
    pg_temp.count_as(_k.rec_b, format('SELECT count(*) FROM public.bcp_assignable_exposure_profiles(%L, %L)', _k.emp_b, _k.sv_v)) = 0,
    'C10.6 SECURITY VETTING: a security-vetting version offers no profile here, ever');
END
$c10$;

-- ---------------------------------------------------------------------------
-- C11 -- Why PR 3 must be unwound BEFORE PR 2.
--
--        Not a convention and not a comment: the runtime holds ON DELETE
--        RESTRICT foreign keys into the PR #218 content domain, so PR 2's own
--        rollback refuses while PR 3 exists. Asserted from the catalogue, so
--        the release ordering is a property of the schema.
-- ---------------------------------------------------------------------------
DO $c11$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class f ON f.oid = k.confrelid
   WHERE k.contype = 'f'
     AND c.relname LIKE 'bcp\_%' ESCAPE '\'
     AND f.relname LIKE 'beskt\_%' ESCAPE '\';
  PERFORM pg_temp.ok(_n >= 2,
    'C11.1 the candidate-preparation runtime references the PR #218 content domain by foreign key');

  SELECT count(*) INTO _n
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class f ON f.oid = k.confrelid
   WHERE k.contype = 'f'
     AND c.relname LIKE 'bcp\_%' ESCAPE '\'
     AND f.relname LIKE 'beskt\_%' ESCAPE '\'
     AND k.confdeltype <> 'r';
  PERFORM pg_temp.ok(_n = 0,
    'C11.2 every one of them is ON DELETE RESTRICT, so no cascade can destroy governed history');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_constraint k
             JOIN pg_class c ON c.oid = k.conrelid
             JOIN pg_class f ON f.oid = k.confrelid
            WHERE k.contype = 'f'
              AND c.relname = 'bcp_assignments'
              AND f.relname = 'beskt_method_versions'),
    'C11.3 an assignment pins a governed method version by foreign key, which is why PR 2 cannot unwind first');
END
$c11$;

\echo '    BESKT candidate-preparation assertions passed'
ROLLBACK;
