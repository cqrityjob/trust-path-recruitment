-- 20261129090000 — the internal test activation, through real sessions.
--
-- A platform owner may let ONE employer use ONE exact, complete,
-- recruitment-only method content for internal functional testing — as a
-- recorded decision that is not a review, publishes nothing, and stops the
-- moment the content changes. Everything here is synthetic and rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE TEMP TABLE it (
  v uuid, v_vetting uuid, v_incomplete uuid, prof uuid, hash text,
  emp_a uuid, emp_b uuid, member_b uuid, cand_b uuid,
  app_a uuid, app_b uuid, activation uuid, assignment uuid
) ON COMMIT DROP;
INSERT INTO it DEFAULT VALUES;
GRANT ALL ON it TO authenticated;

-- ---- setup ---------------------------------------------------------------
DO $setup$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp_a uuid := 'b2000000-0000-4000-8000-00000000ee01';
  _emp_b uuid := 'b7000000-0000-4000-8000-00000000eb01';
  _member_b uuid := 'b7000000-0000-4000-8000-0000000000d2';
  _cand_a uuid := 'b2000000-0000-4000-8000-0000000000c1';
  _cand_b uuid := 'b7000000-0000-4000-8000-0000000000c2';
  _v uuid; _vv uuid; _job_a uuid; _job_b uuid; _app_a uuid; _app_b uuid; _pack uuid; _vi uuid; _r jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_member_b, 'it-member-b@synthetic.test'), (_cand_b, 'it-candidate-b@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_b, 'SYNTETISK Annan Testarbetsgivare', 'synthetic-it-other', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_emp_b, _member_b, 'owner', 'active') ON CONFLICT DO NOTHING;

  _v := pg_temp.build_method('synthetic-it-recruitment', 'recruitment_support');
  _vv := pg_temp.build_method('synthetic-it-vetting', 'security_vetting_support');

  -- A version with no content at all: the validator blocks it.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000e1');
  SET LOCAL ROLE authenticated;
  _r := public.beskt_create_method(gen_random_uuid(), 'synthetic-it-empty', 'SYNTETISK tom metod',
    'SYNTETISKT syfte för tom metod.', NULL);
  _pack := (_r ->> 'pack_id')::uuid;
  _r := public.beskt_create_method_version(gen_random_uuid(), _pack, 'recruitment_support',
    'synthetic-it', 'synthetic-1', 'cqrity_design_hypothesis', NULL, NULL);
  _vi := (_r ->> 'method_version_id')::uuid;
  RESET ROLE;
  PERFORM pg_temp.nobody();

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
  VALUES ('it-job-a', 'ITJOBA', _emp_a, 'internal', 'Väktare (syntetisk)', 'Guard (synthetic)', 'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
  VALUES ('it-job-b', 'ITJOBB', _emp_b, 'internal', 'Väktare B (syntetisk)', 'Guard B (synthetic)', 'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_b;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_a, now()) RETURNING id INTO _app_a;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_b, _emp_b, _cand_b, now()) RETURNING id INTO _app_b;

  UPDATE it SET v = _v, v_vetting = _vv, v_incomplete = _vi,
    prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _v
             AND permitted_mode = 'recruitment_support' ORDER BY display_order LIMIT 1),
    hash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v),
    emp_a = _emp_a, emp_b = _emp_b, member_b = _member_b, cand_b = _cand_b,
    app_a = _app_a, app_b = _app_b;
  PERFORM pg_temp.ok((SELECT content_status FROM public.beskt_method_versions WHERE id = _v) = 'draft',
    'IT0 the recruitment version is an unreviewed draft');
  PERFORM pg_temp.ok(cardinality(pg_temp.blockers(_v)) = 0,
    'IT0.1 and the validator has nothing blocking about its content');
END $setup$;

-- ---- IT1: before any activation, nothing is usable -------------------------
DO $$
DECLARE r it%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_assignable_method_versions(r.emp_a) WHERE method_version_id = r.v;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'IT1.1 an unreviewed draft is not offered to the employer');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.bcp_assign(gen_random_uuid(), %L, %L, %L, %L, public.bcp_notice_version())',
           r.app_a, r.v, r.prof, r.hash),
    'BCP_METHOD_NOT_PUBLISHED', 'IT1.2 and it cannot be assigned');
END $$;

-- ---- IT2: who may record the decision, and on what --------------------------
DO $$
DECLARE r it%ROWTYPE;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 30)',
           r.emp_a, r.v, 'SYNTETISKT ägarbeslut om intern test'),
    'BCP_NOT_PLATFORM_ADMIN', 'IT2.1 an employer member cannot activate anything');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000e1',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 30)',
           r.emp_a, r.v, 'SYNTETISKT ägarbeslut om intern test'),
    'BCP_NOT_PLATFORM_ADMIN', 'IT2.2 nor can the method''s own editor');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 30)',
           r.emp_a, r.v_vetting, 'SYNTETISKT ägarbeslut om intern test'),
    'BCP_METHOD_NOT_CANDIDATE_SAFE', 'IT2.3 security-vetting content is never activated for candidates');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 30)',
           r.emp_a, r.v_incomplete, 'SYNTETISKT ägarbeslut om intern test'),
    'BCP_TEST_ACTIVATION_INCOMPLETE', 'IT2.4 incomplete content is refused');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 30)',
           r.emp_a, r.v, 'kort'),
    'BCP_TEST_ACTIVATION_DECISION_REQUIRED', 'IT2.5 the decision must be written down');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.bcp_grant_internal_test_activation(gen_random_uuid(), %L, %L, %L, current_date + 120)',
           r.emp_a, r.v, 'SYNTETISKT ägarbeslut om intern test'),
    'BCP_TEST_ACTIVATION_EXPIRY', 'IT2.6 and it ends within 90 days');
END $$;

-- ---- IT3: the owner's decision is recorded -- and nothing is approved --------
DO $$
DECLARE r it%ROWTYPE; _res jsonb; _replay jsonb; _op uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  _res := public.bcp_grant_internal_test_activation(_op, r.emp_a, r.v,
    'SYNTETISKT ägarbeslut: intern funktionstest med testdata', current_date + 30);
  _replay := public.bcp_grant_internal_test_activation(_op, r.emp_a, r.v,
    'SYNTETISKT ägarbeslut: intern funktionstest med testdata', current_date + 30);
  RESET ROLE;
  UPDATE it SET activation = (_res ->> 'activation_id')::uuid;
  PERFORM pg_temp.ok(_res ->> 'pinned_content_hash' = r.hash, 'IT3.1 the decision pins the exact content hash');
  PERFORM pg_temp.ok((_replay ->> 'replayed')::boolean AND _replay ->> 'activation_id' = _res ->> 'activation_id',
    'IT3.2 a retried operation records it once');
  PERFORM pg_temp.ok((SELECT content_status FROM public.beskt_method_versions WHERE id = r.v) = 'draft'
    AND (SELECT validation_label FROM public.beskt_method_versions WHERE id = r.v) = 'pilot_hypothesis',
    'IT3.3 the version stays an unreviewed draft, labelled a pilot hypothesis');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.beskt_method_reviews WHERE method_version_id = r.v),
    'IT3.4 and not one review row exists — no approval is fabricated');
END $$;

-- ---- IT4: the activated employer can use it; nobody else can -----------------
DO $$
DECLARE r it%ROWTYPE; _n integer; _p integer; _res jsonb; _other integer;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_assignable_method_versions(r.emp_a) WHERE method_version_id = r.v;
  SELECT count(*) INTO _p FROM public.bcp_assignable_exposure_profiles(r.emp_a, r.v);
  _res := public.bcp_assign(gen_random_uuid(), r.app_a, r.v, r.prof, r.hash, public.bcp_notice_version());
  RESET ROLE;
  UPDATE it SET assignment = (_res ->> 'assignment_id')::uuid;
  PERFORM pg_temp.ok(_n = 1 AND _p >= 1, 'IT4.1 the activated employer is offered the version and its profiles');
  PERFORM pg_temp.ok((_res ->> 'assignment_id') IS NOT NULL, 'IT4.2 and starts a preparation from its own application');

  PERFORM pg_temp.become(r.member_b);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _other FROM public.bcp_assignable_method_versions(r.emp_b) WHERE method_version_id = r.v;
  RESET ROLE;
  PERFORM pg_temp.ok(_other = 0, 'IT4.3 another employer is not offered it');
  PERFORM pg_temp.must_fail_as('authenticated', r.member_b,
    format('SELECT public.bcp_assign(gen_random_uuid(), %L, %L, %L, %L, public.bcp_notice_version())',
           r.app_b, r.v, r.prof, r.hash),
    'BCP_METHOD_NOT_PUBLISHED', 'IT4.4 and cannot assign it, even to its own application');
END $$;

-- ---- IT5: the parties read the content; outsiders do not ---------------------
DO $$
DECLARE r it%ROWTYPE; _cand boolean; _other boolean;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000c1');
  SET LOCAL ROLE authenticated;
  _cand := public.beskt_can_read_version(r.v);
  RESET ROLE;
  PERFORM pg_temp.become(r.member_b);
  SET LOCAL ROLE authenticated;
  _other := public.beskt_can_read_version(r.v);
  RESET ROLE;
  PERFORM pg_temp.ok(_cand, 'IT5.1 the assigned candidate reads the method content');
  PERFORM pg_temp.ok(NOT _other, 'IT5.2 a member of another employer does not');
END $$;

-- ---- IT6: revoking stops new starts, never strands a started test ------------
DO $$
DECLARE r it%ROWTYPE; _n integer; _cand boolean;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('SELECT public.bcp_revoke_internal_test_activation(gen_random_uuid(), %L, %L)', r.activation, ''),
    'BCP_REASON_REQUIRED', 'IT6.1 a revocation must say why');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_revoke_internal_test_activation(gen_random_uuid(), r.activation, 'SYNTETISKT testet är klart');
  RESET ROLE;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000d1');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_assignable_method_versions(r.emp_a) WHERE method_version_id = r.v;
  RESET ROLE;
  PERFORM pg_temp.ok(_n = 0, 'IT6.2 after revocation the version is no longer offered');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000c1');
  SET LOCAL ROLE authenticated;
  _cand := public.beskt_can_read_version(r.v);
  RESET ROLE;
  PERFORM pg_temp.ok(_cand, 'IT6.3 but the candidate of the started test still reads its unchanged content');
END $$;

-- ---- IT7: a content change ends the activation's reach ------------------------
DO $$
DECLARE r it%ROWTYPE; _cand boolean; _res jsonb;
BEGIN
  SELECT * INTO r FROM it;
  -- A fresh activation, then a real content change by the editor.
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  _res := public.bcp_grant_internal_test_activation(gen_random_uuid(), r.emp_a, r.v,
    'SYNTETISKT ägarbeslut: andra testomgången', current_date + 10);
  RESET ROLE;
  UPDATE public.beskt_items SET wording_sv = wording_sv || ' (ändrad)'
   WHERE method_version_id = r.v AND id = (SELECT id FROM public.beskt_items WHERE method_version_id = r.v ORDER BY item_key LIMIT 1);
  PERFORM pg_temp.touch(r.v);
  PERFORM pg_temp.ok((SELECT content_hash FROM public.beskt_method_versions WHERE id = r.v) <> r.hash,
    'IT7.0 the content really changed');
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    format('SELECT public.bcp_assign(gen_random_uuid(), %L, %L, %L, (SELECT content_hash FROM public.beskt_method_versions WHERE id = %L), public.bcp_notice_version())',
           r.app_a, r.v, r.prof, r.v),
    'BCP_METHOD_NOT_PUBLISHED', 'IT7.1 changed content is no longer covered by the activation');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000c1');
  SET LOCAL ROLE authenticated;
  _cand := public.beskt_can_read_version(r.v);
  RESET ROLE;
  PERFORM pg_temp.ok(NOT _cand, 'IT7.2 and a candidate never meets content other than what was activated');
END $$;

-- ---- IT8: the record is written only through the governed functions ----------
DO $$
DECLARE r it%ROWTYPE;
BEGIN
  SELECT * INTO r FROM it;
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000ad',
    format('INSERT INTO public.bcp_internal_test_activations (employer_id, method_version_id, pinned_content_hash, decision_reference, decided_by, expires_on, grant_operation_id) VALUES (%L, %L, %L, %L, %L, current_date + 5, gen_random_uuid())',
           r.emp_b, r.v, r.hash, 'SYNTETISKT direkt skrivning', 'b2000000-0000-4000-8000-0000000000ad'),
    'permission denied', 'IT8.1 no client can write the table directly, not even the platform admin');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_internal_test_activations WHERE id = %L', r.activation),
    'BCP_TEST_ACTIVATION_UNGOVERNED_WRITE', 'IT8.2 and the owner cannot delete a decision outside the governed path');
END $$;

-- ---- IT9: content roles, governed and audited --------------------------------
DO $$
DECLARE _has boolean; _after boolean; _audit integer;
BEGIN
  PERFORM pg_temp.must_fail_as('authenticated', 'b2000000-0000-4000-8000-0000000000d1',
    'SELECT public.beskt_set_content_role(gen_random_uuid(), ''beskt-roleless@test.local'', ''editor'', true, ''SYNTETISKT'')',
    'BESKT_NOT_PLATFORM_ADMIN', 'IT9.1 only a platform admin changes content roles');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_set_content_role(gen_random_uuid(), 'BESKT-ROLELESS@test.local', 'editor', true,
    'SYNTETISKT ägaren installerar metodinnehållet');
  RESET ROLE;
  _has := public.scp_has_content_role('b2000000-0000-4000-8000-0000000000f1', 'editor');
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_set_content_role(gen_random_uuid(), 'beskt-roleless@test.local', 'editor', false,
    'SYNTETISKT installationen är klar');
  RESET ROLE;
  _after := public.scp_has_content_role('b2000000-0000-4000-8000-0000000000f1', 'editor');
  SELECT count(*) INTO _audit FROM public.scp_content_role_changes
   WHERE user_id = 'b2000000-0000-4000-8000-0000000000f1';
  PERFORM pg_temp.ok(_has AND NOT _after, 'IT9.2 a role is granted by e-mail and withdrawn again');
  PERFORM pg_temp.ok(_audit = 2, 'IT9.3 and both changes are in the audit, with who and why');
END $$;

-- ---- IT10: catalogue ------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.ok(NOT has_function_privilege('anon',
      'public.bcp_grant_internal_test_activation(uuid,uuid,uuid,text,date)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated',
      'public.bcp_internal_test_activation_active(uuid,uuid)', 'EXECUTE')
    AND NOT has_table_privilege('anon', 'public.bcp_internal_test_activations', 'SELECT'),
    'IT10.1 anon reaches nothing, and the predicates are internal');
  -- The interviewer's wordings follow the party read: the activation that
  -- COVERED the started content, with the assignment's own pinned hash.
  PERFORM pg_temp.ok(
    position('bcp_internal_test_activation_covers(_a.employer_id, _v.id' IN
             (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts')) > 0
    AND position('_a.pinned_content_hash' IN
             (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts')) > 0
    AND position('bcp_internal_test_activation_active' IN
             (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts')) = 0,
    'IT10.2 the conversation wordings of a started test follow the covering activation');
END $$;

ROLLBACK;
