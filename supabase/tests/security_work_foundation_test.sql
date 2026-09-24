-- Security Work foundation: execute the boundary as real database roles.
-- Everything is synthetic and transaction-local. The mutation-control suite
-- includes this file with sw_keep_fixture set, reuses its exact assertions,
-- and rolls back every intentionally broken protection before the next one.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Check the precise PostgreSQL failure class, never just a message fragment.
-- A no-op UPDATE is not a caught denial and fails this assertion.
CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, expected_state text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_message text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
    IF actual_state IS DISTINCT FROM expected_state THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected SQLSTATE %, got % (%)',
        label, expected_state, actual_state, actual_message;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.login(who uuid, anonymous boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN who IS NULL THEN '{}' ELSE
      jsonb_build_object('sub', who, 'role', 'authenticated', 'is_anonymous', anonymous, 'session_id', who)::text
    END, true);
END $$;

CREATE TEMP TABLE sw AS SELECT
  '51000000-0000-4000-8000-000000000001'::uuid AS owner_a,
  '51000000-0000-4000-8000-000000000002'::uuid AS owner_b,
  '51000000-0000-4000-8000-000000000003'::uuid AS editor,
  '51000000-0000-4000-8000-000000000004'::uuid AS viewer,
  '51000000-0000-4000-8000-000000000005'::uuid AS approver,
  '51000000-0000-4000-8000-000000000006'::uuid AS inactive,
  '51000000-0000-4000-8000-000000000007'::uuid AS outsider,
  '51000000-0000-4000-8000-000000000008'::uuid AS moderator,
  '51000000-0000-4000-8000-000000000009'::uuid AS anonymous_user,
  '51000000-1111-4000-8000-000000000001'::uuid AS employer,
  '51000000-2222-4000-8000-000000000001'::uuid AS job,
  '51000000-3333-4000-8000-000000000001'::uuid AS application,
  '51000000-4444-4000-8000-000000000001'::uuid AS disclosure;
GRANT SELECT ON sw TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_a, 'sw-owner-a@example.test', now() FROM sw UNION ALL
SELECT owner_b, 'sw-owner-b@example.test', now() FROM sw UNION ALL
SELECT editor, 'sw-editor@example.test', now() FROM sw UNION ALL
SELECT viewer, 'sw-viewer@example.test', now() FROM sw UNION ALL
SELECT approver, 'sw-approver@example.test', now() FROM sw UNION ALL
SELECT inactive, 'sw-inactive@example.test', now() FROM sw UNION ALL
SELECT outsider, 'sw-outsider@example.test', now() FROM sw UNION ALL
SELECT moderator, 'sw-moderator@example.test', now() FROM sw UNION ALL
SELECT anonymous_user, 'sw-anonymous@example.test', now() FROM sw;
INSERT INTO auth.sessions(id, user_id, not_after)
SELECT id, id, now() + interval '1 day' FROM auth.users
WHERE id::text LIKE '51000000-0000-4000-8000-%';

-- The outsider is a real employer owner, applicant and Passport holder.
-- Those relationships are intentionally present, not just named in a label.
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM sw;
INSERT INTO public.employers (id, slug, name, status)
SELECT employer, 'security-work-boundary-fixture', 'Synthetic SW Employer', 'active' FROM sw;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, outsider, 'owner', 'active' FROM sw UNION ALL
SELECT employer, owner_a, 'member', 'active' FROM sw;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT moderator FROM sw));
INSERT INTO public.jobs
  (id, slug, short_id, employer_id, title_sv, title_en, application_method, status, published_at, expires_at)
SELECT job, 'security-work-boundary-job', 'SWB0001', employer,
  'Syntetisk tjänst', 'Synthetic role', 'internal', 'published', now(), now() + interval '30 days'
FROM sw;

-- Surface inventory is explicit: a missing table cannot make a loop pass.
CREATE TEMP TABLE sw_tables(name text PRIMARY KEY);
INSERT INTO sw_tables VALUES
  ('sw_workspaces'), ('sw_workspace_memberships'), ('sw_monitoring_profiles'),
  ('sw_intelligence_requirements'), ('sw_sources'), ('sw_source_items'),
  ('sw_intelligence_items'), ('sw_assessments'), ('sw_risks'), ('sw_controls'),
  ('sw_actions'), ('sw_reports'), ('sw_citations'), ('sw_ai_runs'),
  ('sw_audit_events'), ('sw_record_versions');
GRANT SELECT ON sw_tables TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assert_closed_role(label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE target record;
BEGIN
  FOR target IN SELECT name FROM sw_tables ORDER BY name LOOP
    PERFORM pg_temp.must_fail(format('SELECT count(*) FROM public.%I', target.name),
      '42501', label || ' read ' || target.name);
    PERFORM pg_temp.must_fail(format('DELETE FROM public.%I', target.name),
      '42501', label || ' delete ' || target.name);
    PERFORM pg_temp.must_fail(format('TRUNCATE public.%I', target.name),
      '42501', label || ' truncate ' || target.name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_workspace_rows(target_workspace uuid, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE target record; visible bigint;
BEGIN
  FOR target IN SELECT name FROM sw_tables ORDER BY name LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', target.name,
      CASE WHEN target.name = 'sw_workspaces' THEN 'id' ELSE 'workspace_id' END)
      INTO visible USING target_workspace;
    PERFORM pg_temp.ok(visible = 0, label || ' ' || target.name);
  END LOOP;
END $$;

SET LOCAL ROLE anon;
SELECT pg_temp.login(NULL);
SELECT pg_temp.assert_closed_role('SW-ANON');
SELECT pg_temp.must_fail('SELECT public.sw_create_personal_workspace(''Anonymous'')',
  '42501', 'SW-ANON anonymous cannot bootstrap');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT anonymous_user FROM sw), true);
SELECT pg_temp.must_fail('SELECT public.sw_create_personal_workspace(''Anonymous auth'')',
  '42501', 'SW-AUTH anonymous sign-in cannot bootstrap');
SELECT pg_temp.login('51000000-0000-4000-8000-000000000099');
SELECT pg_temp.must_fail('SELECT public.sw_create_personal_workspace(''Deleted account'')',
  '42501', 'SW-AUTH missing auth user cannot bootstrap with an old JWT');

SELECT pg_temp.login((SELECT owner_a FROM sw));
CREATE TEMP TABLE sw_a AS SELECT public.sw_create_personal_workspace('Synthetic workspace A') AS id;
SELECT pg_temp.ok(public.sw_create_personal_workspace('Retry must not create B') = (SELECT id FROM sw_a),
  'SW-CREATE retry returns the same personal workspace');
SELECT pg_temp.ok((SELECT count(*) FROM public.sw_workspaces) = 1,
  'SW-CREATE retry leaves exactly one visible workspace');
SELECT pg_temp.login((SELECT owner_b FROM sw));
CREATE TEMP TABLE sw_b AS SELECT public.sw_create_personal_workspace('Synthetic workspace B') AS id;
RESET ROLE;
GRANT SELECT ON sw_a, sw_b TO PUBLIC;
SELECT pg_temp.ok((SELECT a.id <> b.id FROM sw_a a CROSS JOIN sw_b b),
  'SW-CREATE different owners get different workspaces');

-- Metadata proves the inventory is present; access behavior below proves the
-- policies actually deny data, independently of these catalog assertions.
SELECT pg_temp.ok((SELECT count(*) FROM sw_tables t
  JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)
  WHERE c.relrowsecurity) = 16, 'SW-SURFACE all sixteen tables enable RLS');

CREATE OR REPLACE FUNCTION pg_temp.assert_function_privileges() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE (p.pronamespace='sw_private'::regnamespace
      OR (p.pronamespace='public'::regnamespace AND p.proname='sw_create_personal_workspace'))
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('service_role',p.oid,'EXECUTE')
        OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
    ), 'SW-PRIV no new function is executable by PUBLIC, anon, or service');
END $$;
SELECT pg_temp.assert_function_privileges();
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='sw_private'::regnamespace
  AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'],false)),
  'SW-PRIV every private helper pins an empty search path');
SELECT pg_temp.ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.sw_create_personal_workspace(text)'::regprocedure)
  AND NOT has_schema_privilege('authenticated','sw_private','CREATE')
  AND NOT has_schema_privilege('anon','sw_private','USAGE'),
  'SW-PRIV public wrapper is invoker and private schema has no caller DDL');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='sw_private'::regnamespace
  AND p.proname NOT IN ('is_human','can_read','can_edit','can_approve','create_personal_workspace')
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')),
  'SW-PRIV internal trigger helpers have no direct authenticated execution');

RESET ROLE;
SELECT pg_temp.login(NULL);
INSERT INTO public.job_applications
  (id, job_id, employer_id, applicant_user_id, consent_given_at)
SELECT application, job, employer, outsider, now() FROM sw;
INSERT INTO public.sp_passport_profiles (holder_user_id, display_name)
SELECT outsider, 'Synthetic unrelated Passport' FROM sw UNION ALL
SELECT owner_a, 'Synthetic Security Work owner Passport' FROM sw;
INSERT INTO public.sp_disclosures
  (id, holder_user_id, package_code, token_hash, recipient_hint, purpose, locale, expires_at)
SELECT disclosure, owner_a, 'public_card', encode(digest(repeat('sw-fixture', 8), 'sha256'), 'hex'),
  'sw-outsider@example.test', 'Synthetic boundary proof', 'sv', now() + interval '1 day'
FROM sw;

-- Membership fixtures are operator-owned. There is deliberately no membership
-- write API; the same stale JWT is used again after operator revocation below.
SELECT pg_temp.login((SELECT owner_a FROM sw));
INSERT INTO public.sw_workspace_memberships(workspace_id, user_id, role, active, can_approve)
SELECT id, (SELECT editor FROM sw), 'editor', true, false FROM sw_a UNION ALL
SELECT id, (SELECT viewer FROM sw), 'viewer', true, false FROM sw_a UNION ALL
SELECT id, (SELECT approver FROM sw), 'editor', true, true FROM sw_a UNION ALL
SELECT id, (SELECT inactive FROM sw), 'editor', false, true FROM sw_a UNION ALL
SELECT id, (SELECT anonymous_user FROM sw), 'owner', true, true FROM sw_a;

CREATE TEMP TABLE sw_ids AS SELECT
  gen_random_uuid() AS source_a, gen_random_uuid() AS source_b,
  gen_random_uuid() AS item_a, gen_random_uuid() AS item_b,
  gen_random_uuid() AS signal_a, gen_random_uuid() AS signal_b,
  gen_random_uuid() AS assessment_a, gen_random_uuid() AS assessment_b,
  gen_random_uuid() AS draft_a, gen_random_uuid() AS risk_a,
  gen_random_uuid() AS action_a, gen_random_uuid() AS cancelled_action,
  gen_random_uuid() AS report_a, gen_random_uuid() AS citation_a,
  gen_random_uuid() AS report_citation, gen_random_uuid() AS requirement_a;
GRANT SELECT ON sw_ids TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT owner_a FROM sw));
INSERT INTO public.sw_monitoring_profiles(workspace_id, sector, decisions_supported)
SELECT id, 'Synthetic sector', 'Plan safe access to the synthetic site' FROM sw_a;
INSERT INTO public.sw_intelligence_requirements(id, workspace_id, question)
SELECT requirement_a, (SELECT id FROM sw_a), 'Could an announced closure affect our access?' FROM sw_ids;
INSERT INTO public.sw_sources(id, workspace_id, name, publisher, reliability_category)
SELECT source_a, (SELECT id FROM sw_a), 'Synthetic official notice', 'Fixture publisher', 'official' FROM sw_ids;
INSERT INTO public.sw_source_items(id, workspace_id, source_id, deduplication_key, original_title, factual_extract)
SELECT item_a, (SELECT id FROM sw_a), source_a, 'notice-a', 'Synthetic access notice',
  'The synthetic road will close on 1 October. This is a fictional test observation.' FROM sw_ids;
INSERT INTO public.sw_intelligence_items(id, workspace_id, source_item_id, requirement_id, title)
SELECT signal_a, (SELECT id FROM sw_a), item_a, requirement_a, 'Potential synthetic access disruption' FROM sw_ids;
INSERT INTO public.sw_assessments(id, workspace_id, intelligence_item_id, title)
SELECT assessment_a, (SELECT id FROM sw_a), signal_a, 'Synthetic access assessment' FROM sw_ids;
INSERT INTO public.sw_assessments(id, workspace_id, title)
SELECT draft_a, (SELECT id FROM sw_a), 'Draft retained for boundary controls' FROM sw_ids;
INSERT INTO public.sw_risks(id, workspace_id, assessment_id, title, likelihood, consequence)
SELECT risk_a, (SELECT id FROM sw_a), assessment_a, 'Synthetic delayed access', 2, 3 FROM sw_ids;
INSERT INTO public.sw_controls(workspace_id, risk_id, title)
SELECT (SELECT id FROM sw_a), risk_a, 'Existing synthetic alternate entrance' FROM sw_ids;
INSERT INTO public.sw_actions(id, workspace_id, assessment_id, risk_id, title, assignee_user_id, due_date)
SELECT action_a, (SELECT id FROM sw_a), assessment_a, risk_a, 'Confirm alternate entrance',
  (SELECT editor FROM sw), current_date + 7 FROM sw_ids;
INSERT INTO public.sw_actions(id, workspace_id, assessment_id, title)
SELECT cancelled_action, (SELECT id FROM sw_a), assessment_a, 'Synthetic duplicate task' FROM sw_ids;
INSERT INTO public.sw_reports(id, workspace_id, assessment_id, title)
SELECT report_a, (SELECT id FROM sw_a), assessment_a, 'Synthetic formal security report' FROM sw_ids;
INSERT INTO public.sw_citations(id, workspace_id, source_item_id, assessment_id, claim, excerpt)
SELECT citation_a, (SELECT id FROM sw_a), item_a, assessment_a,
  'The announced closure affects access.', 'The synthetic road will close on 1 October.' FROM sw_ids;

SELECT pg_temp.login((SELECT owner_b FROM sw));
INSERT INTO public.sw_sources(id, workspace_id, name)
SELECT source_b, (SELECT id FROM sw_b), 'Workspace B private manual source' FROM sw_ids;
INSERT INTO public.sw_source_items(id, workspace_id, source_id, deduplication_key, original_title, factual_extract)
SELECT item_b, (SELECT id FROM sw_b), source_b, 'notice-b', 'Workspace B private fact',
  'Workspace B fictional content must remain private.' FROM sw_ids;
INSERT INTO public.sw_intelligence_items(id, workspace_id, source_item_id, title)
SELECT signal_b, (SELECT id FROM sw_b), item_b, 'Workspace B intelligence' FROM sw_ids;
INSERT INTO public.sw_assessments(id, workspace_id, intelligence_item_id, title)
SELECT assessment_b, (SELECT id FROM sw_b), signal_b, 'Workspace B assessment' FROM sw_ids;
UPDATE public.sw_intelligence_items SET status='relevant', human_rationale='Original workspace B decision'
WHERE id=(SELECT signal_b FROM sw_ids);
CREATE OR REPLACE FUNCTION pg_temp.assert_triage_attribution() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET human_rationale=''Tampered decision'' WHERE id=%L',
    (SELECT signal_b FROM sw_ids)), '23514', 'SW-TRIAGE decided rationale changes require new decision');
END $$;
SELECT pg_temp.assert_triage_attribution();
RESET ROLE;

-- AI provenance is inert in this phase: an operator fixture proves reads are
-- scoped while every client/provider insertion and execution path is denied.
INSERT INTO public.sw_ai_runs(workspace_id, requested_by, purpose, provider, model,
  template_version, idempotency_key, source_item_id, status, structured_output)
SELECT (SELECT id FROM sw_a), (SELECT owner_a FROM sw), 'summarise', 'deterministic-fixture',
  'test-only', 'fixture-v1', 'fixture-a', item_a, 'succeeded', '{"summary":"Synthetic fixture"}'::jsonb
FROM sw_ids;

SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT owner_a FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_b), 'SW-ISOLATION A cannot read B');
WITH changed AS (UPDATE public.sw_assessments SET title = 'Cross-workspace overwrite'
  WHERE id = (SELECT assessment_b FROM sw_ids) RETURNING id)
SELECT pg_temp.ok((SELECT count(*) FROM changed) = 0,
  'SW-ISOLATION A cannot update B even with a known record identifier');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sw_audit_events
  WHERE workspace_id = (SELECT id FROM sw_a) AND entity_table = 'sw_workspace_memberships'
    AND entity_id = (SELECT owner_a FROM sw) AND operation = 'INSERT'
    AND details->'before' = 'null'::jsonb
    AND details->'after' = '{"role":"owner","active":true,"can_approve":true}'::jsonb),
  'SW-AUDIT bootstrap records explicit membership capabilities');
SELECT pg_temp.login((SELECT owner_b FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-ISOLATION B cannot read A');
SELECT pg_temp.login((SELECT outsider FROM sw));
SELECT pg_temp.ok((SELECT count(*) FROM public.employer_memberships WHERE user_id = (SELECT outsider FROM sw)) = 1
  AND (SELECT count(*) FROM public.job_applications WHERE applicant_user_id = (SELECT outsider FROM sw)) = 1
  AND (SELECT count(*) FROM public.sp_passport_profiles WHERE holder_user_id = (SELECT outsider FROM sw)) = 1,
  'SW-BOUNDARY unrelated employer, application and Passport relationships really exist');
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-BOUNDARY employer applicant Passport recipient gets no access');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_assessments(workspace_id,title) VALUES (%L,''intrusion'')',
  (SELECT id FROM sw_a)), '42501', 'SW-BOUNDARY unrelated relationship cannot write');
SELECT pg_temp.login((SELECT moderator FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-BOUNDARY platform admin does not inherit membership');
SELECT pg_temp.login((SELECT inactive FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-MEMBERSHIP inactive cannot read');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_assessments(workspace_id,title) VALUES (%L,''inactive write'')',
  (SELECT id FROM sw_a)), '42501', 'SW-MEMBERSHIP inactive cannot write');
SELECT pg_temp.login((SELECT anonymous_user FROM sw), true);
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-AUTH anonymous JWT overrides even explicit membership');
RESET ROLE;
UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = (SELECT viewer FROM sw);
SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT viewer FROM sw));
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-AUTH banned current user cannot use a valid JWT');
RESET ROLE;
UPDATE auth.users SET banned_until = NULL WHERE id = (SELECT viewer FROM sw);
SET LOCAL ROLE authenticated;

SELECT pg_temp.login((SELECT viewer FROM sw));
SELECT pg_temp.ok((SELECT count(*) FROM public.sw_assessments) = 2,
  'SW-VIEWER sees both assessments in the authorized workspace');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_assessments(workspace_id,title) VALUES (%L,''viewer write'')',
  (SELECT id FROM sw_a)), '42501', 'SW-VIEWER insert is denied');
WITH changed AS (UPDATE public.sw_assessments SET title = 'viewer rewrite'
  WHERE id = (SELECT draft_a FROM sw_ids) RETURNING id)
SELECT pg_temp.ok((SELECT count(*) FROM changed) = 0, 'SW-VIEWER RLS permits zero updates');
SELECT pg_temp.must_fail('UPDATE public.sw_workspace_memberships SET can_approve = true',
  '42501', 'SW-VIEWER cannot give itself approval');

SELECT pg_temp.login((SELECT editor FROM sw));
UPDATE public.sw_assessments SET situation = 'Synthetic draft saved by editor'
WHERE id = (SELECT draft_a FROM sw_ids);
SELECT pg_temp.ok((SELECT situation = 'Synthetic draft saved by editor' AND version = 2
  FROM public.sw_assessments WHERE id = (SELECT draft_a FROM sw_ids)),
  'SW-EDITOR saves a versioned draft');
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET created_by = %L WHERE id = %L',
  (SELECT owner_b FROM sw), (SELECT draft_a FROM sw_ids)), '23514', 'SW-IMMUTABLE creator cannot be reassigned');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_assessments(workspace_id,title,created_by) VALUES (%L,''forged creator'',%L)',
  (SELECT id FROM sw_a), (SELECT owner_a FROM sw)), '42501', 'SW-IMMUTABLE insert cannot forge creator');
SELECT pg_temp.must_fail('UPDATE public.sw_workspace_memberships SET active = true',
  '42501', 'SW-EDITOR cannot change memberships');
SELECT pg_temp.must_fail(format('UPDATE public.sw_workspaces SET owner_user_id = %L WHERE id = %L',
  (SELECT editor FROM sw), (SELECT id FROM sw_a)), '42501', 'SW-IMMUTABLE workspace owner column is not writable');
RESET ROLE;

-- Grant this editor B access as well. Membership in both must not permit moving
-- canonical records or attaching facts from B to records in A.
SELECT pg_temp.login((SELECT owner_b FROM sw));
INSERT INTO public.sw_workspace_memberships(workspace_id, user_id, role)
SELECT id, (SELECT editor FROM sw), 'editor' FROM sw_b;

CREATE OR REPLACE FUNCTION pg_temp.assert_workspace_immutable() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('UPDATE public.sw_monitoring_profiles SET workspace_id = %L WHERE workspace_id = %L',
    (SELECT id FROM sw_b), (SELECT id FROM sw_a)), '23514', 'SW-IMMUTABLE dual member cannot move record');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.assert_cross_workspace_fk() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format($s$INSERT INTO public.sw_source_items
    (workspace_id,source_id,deduplication_key,original_title,factual_extract)
    VALUES (%L,%L,'cross-scope-fixture','Invalid parent','Synthetic extract')$s$,
    (SELECT id FROM sw_a), (SELECT source_b FROM sw_ids)), '23503', 'SW-FK dual member cannot attach foreign source');
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.ok((SELECT count(*) FROM public.sw_workspaces) = 2,
  'SW-DUAL editor really has active membership in both workspaces');
SELECT pg_temp.assert_workspace_immutable();
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET workspace_id = %L WHERE id = %L',
  (SELECT id FROM sw_b), (SELECT draft_a FROM sw_ids)), '23514', 'SW-IMMUTABLE dual member cannot move assessment');
SELECT pg_temp.assert_cross_workspace_fk();
SELECT pg_temp.must_fail(format($s$INSERT INTO public.sw_actions
  (workspace_id,assessment_id,title,assignee_user_id) VALUES (%L,%L,'Bad assignee',%L)$s$,
  (SELECT id FROM sw_a), (SELECT assessment_a FROM sw_ids), (SELECT inactive FROM sw)),
  '23514', 'SW-ACTION inactive assignee is rejected on initial insert');
SELECT pg_temp.must_fail(format($s$INSERT INTO public.sw_actions
  (workspace_id,assessment_id,risk_id,title) VALUES (%L,%L,%L,'Mismatched assessment')$s$,
  (SELECT id FROM sw_a), (SELECT draft_a FROM sw_ids), (SELECT risk_a FROM sw_ids)),
  '23503', 'SW-FK action cannot name a risk from another assessment');
SELECT pg_temp.must_fail(format($s$INSERT INTO public.sw_intelligence_items
  (workspace_id,source_item_id,title) VALUES (%L,%L,'Duplicate ingestion')$s$,
  (SELECT id FROM sw_a), (SELECT item_a FROM sw_ids)), '23505', 'SW-DEDUPE repeated source cannot duplicate intelligence');
SELECT pg_temp.must_fail(format($s$INSERT INTO public.sw_source_items
  (workspace_id,source_id,deduplication_key,original_title,factual_extract)
  VALUES (%L,%L,'notice-a','Duplicate notice','Same canonical input')$s$,
  (SELECT id FROM sw_a), (SELECT source_a FROM sw_ids)), '23505', 'SW-DEDUPE repeated source key cannot duplicate facts');

CREATE OR REPLACE FUNCTION pg_temp.assert_illegal_approval() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format($s$UPDATE public.sw_assessments
    SET status='approved', approved_by=%L, approved_at=now() WHERE id=%L$s$,
    (SELECT editor FROM sw), (SELECT draft_a FROM sw_ids)), '23514', 'SW-STATE direct approval and forged stamp are denied');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.assert_spoofed_citation() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format($s$INSERT INTO public.sw_citations
    (workspace_id,source_item_id,assessment_id,claim,excerpt)
    VALUES (%L,%L,%L,'Fabricated factual assertion','This text does not occur in the source.')$s$,
    (SELECT id FROM sw_a), (SELECT item_a FROM sw_ids), (SELECT draft_a FROM sw_ids)),
    '23514', 'SW-CITATION quoted excerpt must occur in the source');
END $$;
SELECT pg_temp.assert_illegal_approval();
SELECT pg_temp.assert_spoofed_citation();

SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET status=''promoted'', human_rationale=''Promote without triage'' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE pending cannot skip directly to promoted');
SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET status=''relevant'' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE human decision requires rationale');
UPDATE public.sw_intelligence_items SET status = 'relevant', human_rationale = 'Synthetic closure affects our route'
WHERE id = (SELECT signal_a FROM sw_ids);
SELECT pg_temp.ok((SELECT status = 'relevant' AND decided_by = (SELECT editor FROM sw) AND decided_at IS NOT NULL
  FROM public.sw_intelligence_items WHERE id = (SELECT signal_a FROM sw_ids)),
  'SW-TRIAGE relevant decision is stamped with the actual human');
SELECT pg_temp.login((SELECT owner_a FROM sw));
SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET human_rationale=''Rewritten by another editor'' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE same-status rationale cannot retain another actor attribution');
SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET human_rationale='''' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE decided rationale cannot be erased');
UPDATE public.sw_intelligence_items SET status='dismissed', human_rationale='Synthetic alternate route removes relevance'
WHERE id=(SELECT signal_a FROM sw_ids);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sw_audit_events WHERE entity_id=(SELECT signal_a FROM sw_ids)
  AND old_status='relevant' AND new_status='dismissed'
  AND details->'before'->>'rationale'='Synthetic closure affects our route'
  AND details->'before'->>'decided_by'=(SELECT editor::text FROM sw)
  AND details->'after'->>'rationale'='Synthetic alternate route removes relevance'
  AND details->'after'->>'decided_by'=(SELECT owner_a::text FROM sw)),
  'SW-TRIAGE successive decisions preserve both rationales and human actors');
SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET human_rationale=''Dismissal rewrite'' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE dismissed rationale is also protected');
SELECT pg_temp.login((SELECT editor FROM sw));
UPDATE public.sw_intelligence_items SET status='relevant', human_rationale='Synthetic new planning need requires review'
WHERE id=(SELECT signal_a FROM sw_ids);
UPDATE public.sw_intelligence_items SET status = 'promoted', human_rationale = 'Assessment created for follow-up'
WHERE id = (SELECT signal_a FROM sw_ids);
SELECT pg_temp.ok((SELECT status = 'promoted' FROM public.sw_intelligence_items WHERE id = (SELECT signal_a FROM sw_ids)),
  'SW-TRIAGE linked assessment permits promotion');
SELECT pg_temp.must_fail(format('UPDATE public.sw_intelligence_items SET human_rationale=''rewrite'' WHERE id=%L',
  (SELECT signal_a FROM sw_ids)), '23514', 'SW-TRIAGE promoted decision cannot be rewritten');

UPDATE public.sw_assessments SET situation = 'Synthetic closure', professional_conclusion = 'Use the alternate entrance.',
  likelihood = 2, consequence = 3, status = 'in_review' WHERE id = (SELECT assessment_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET status=''approved'' WHERE id=%L',
  (SELECT assessment_a FROM sw_ids)), '42501', 'SW-APPROVAL ordinary editor cannot approve');
SELECT pg_temp.login((SELECT approver FROM sw));
-- Missing evidence cannot be disguised by a valid approver capability.
UPDATE public.sw_assessments SET professional_conclusion = 'Uncited synthetic conclusion', likelihood = 2,
  consequence = 2, status = 'in_review' WHERE id = (SELECT draft_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET status=''approved'' WHERE id=%L',
  (SELECT draft_a FROM sw_ids)), '23514', 'SW-APPROVAL citation is mandatory');
UPDATE public.sw_assessments SET status = 'draft' WHERE id = (SELECT draft_a FROM sw_ids);
UPDATE public.sw_assessments SET status = 'approved' WHERE id = (SELECT assessment_a FROM sw_ids);
SELECT pg_temp.ok((SELECT status = 'approved' AND approved_by = (SELECT approver FROM sw) AND approved_at IS NOT NULL
  FROM public.sw_assessments WHERE id = (SELECT assessment_a FROM sw_ids)),
  'SW-APPROVAL explicit capability approves and records the human actor');
SELECT pg_temp.ok((SELECT snapshot->>'status' = 'approved'
  AND snapshot->>'approved_by' = (SELECT approver::text FROM sw)
  AND jsonb_array_length(snapshot->'citations') = 1 FROM public.sw_record_versions
  WHERE assessment_id = (SELECT assessment_a FROM sw_ids) ORDER BY version DESC LIMIT 1),
  'SW-VERSION approved snapshot preserves exact content and citation');

CREATE OR REPLACE FUNCTION pg_temp.assert_approved_content() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('UPDATE public.sw_assessments SET situation=''silent rewrite'' WHERE id=%L',
    (SELECT assessment_a FROM sw_ids)), '23514', 'SW-FROZEN approved assessment content cannot change');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.assert_approved_citation() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('DELETE FROM public.sw_citations WHERE id=%L',
    (SELECT citation_a FROM sw_ids)), '23514', 'SW-FROZEN approved citation cannot be deleted');
END $$;
SELECT pg_temp.assert_approved_content();
SELECT pg_temp.assert_approved_citation();
SELECT pg_temp.must_fail(format($s$INSERT INTO public.sw_citations
  (workspace_id,source_item_id,assessment_id,claim,excerpt) VALUES (%L,%L,%L,'New claim','The synthetic road')$s$,
  (SELECT id FROM sw_a), (SELECT item_a FROM sw_ids), (SELECT assessment_a FROM sw_ids)),
  '23514', 'SW-FROZEN no citation can be added after approval');
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET approved_by=%L WHERE id=%L',
  (SELECT owner_a FROM sw), (SELECT assessment_a FROM sw_ids)), '23514', 'SW-FROZEN approval actor cannot be forged');

SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.must_fail(format('UPDATE public.sw_risks SET status=''accepted'', decision_rationale=''Proceed'' WHERE id=%L',
  (SELECT risk_a FROM sw_ids)), '42501', 'SW-RISK editor cannot accept risk');
SELECT pg_temp.login((SELECT approver FROM sw));
UPDATE public.sw_risks SET status = 'accepted', decision_rationale = 'Synthetic review accepts residual risk'
WHERE id = (SELECT risk_a FROM sw_ids);
SELECT pg_temp.ok((SELECT accepted_by = (SELECT approver FROM sw) AND accepted_at IS NOT NULL
  FROM public.sw_risks WHERE id = (SELECT risk_a FROM sw_ids)), 'SW-RISK acceptance records approver');
SELECT pg_temp.ok((SELECT jsonb_array_length(snapshot->'controls') = 1
  AND snapshot->'controls'->0->>'title' = 'Existing synthetic alternate entrance'
  FROM public.sw_record_versions WHERE risk_id = (SELECT risk_a FROM sw_ids)
  ORDER BY version DESC LIMIT 1), 'SW-RISK approved snapshot preserves exact controls');
SELECT pg_temp.must_fail(format('UPDATE public.sw_controls SET description=''rewrite'' WHERE risk_id=%L',
  (SELECT risk_a FROM sw_ids)), '23514', 'SW-RISK accepted controls cannot change');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_controls(workspace_id,risk_id,title) VALUES (%L,%L,''late control'')',
  (SELECT id FROM sw_a), (SELECT risk_a FROM sw_ids)), '23514', 'SW-RISK controls cannot be appended after acceptance');
SELECT pg_temp.must_fail(format('UPDATE public.sw_risks SET likelihood=5 WHERE id=%L',
  (SELECT risk_a FROM sw_ids)), '23514', 'SW-RISK approved rating cannot be overwritten');
UPDATE public.sw_risks SET status = 'closed', decision_rationale = 'Synthetic closure reviewed'
WHERE id = (SELECT risk_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_risks SET status=''proposed'' WHERE id=%L',
  (SELECT risk_a FROM sw_ids)), '23514', 'SW-RISK closed risk cannot reopen silently');

SELECT pg_temp.login((SELECT editor FROM sw));
UPDATE public.sw_actions SET status = 'in_progress' WHERE id = (SELECT action_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_actions SET status=''blocked'' WHERE id=%L',
  (SELECT action_a FROM sw_ids)), '23514', 'SW-ACTION blocked requires rationale');
UPDATE public.sw_actions SET status = 'blocked', decision_rationale = 'Waiting for synthetic site contact'
WHERE id = (SELECT action_a FROM sw_ids);
UPDATE public.sw_actions SET status = 'in_progress' WHERE id = (SELECT action_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_actions SET status=''completed'' WHERE id=%L',
  (SELECT action_a FROM sw_ids)), '23514', 'SW-ACTION completion requires evidence');
UPDATE public.sw_actions SET status = 'completed', decision_rationale = 'Alternate route checked',
  completion_evidence = 'Synthetic site confirmation recorded' WHERE id = (SELECT action_a FROM sw_ids);
SELECT pg_temp.ok((SELECT closed_by = (SELECT editor FROM sw) AND closed_at IS NOT NULL
  FROM public.sw_actions WHERE id = (SELECT action_a FROM sw_ids)), 'SW-ACTION completion is an explicit human decision');
SELECT pg_temp.must_fail(format('UPDATE public.sw_actions SET status=''open'' WHERE id=%L',
  (SELECT action_a FROM sw_ids)), '23514', 'SW-ACTION completed action cannot reopen');
UPDATE public.sw_actions SET status = 'cancelled', decision_rationale = 'Duplicate of completed synthetic task'
WHERE id = (SELECT cancelled_action FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_actions SET title=''rewrite'' WHERE id=%L',
  (SELECT cancelled_action FROM sw_ids)), '23514', 'SW-ACTION cancelled action is final');

INSERT INTO public.sw_citations(id, workspace_id, source_item_id, report_id, claim, excerpt)
SELECT report_citation, (SELECT id FROM sw_a), item_a, report_a,
  'Closure is supported by the source.', 'The synthetic road will close on 1 October.' FROM sw_ids;
SELECT pg_temp.login((SELECT approver FROM sw));
SELECT pg_temp.must_fail(format('UPDATE public.sw_reports SET status=''approved'' WHERE id=%L',
  (SELECT report_a FROM sw_ids)), '23514', 'SW-REPORT empty formal sections cannot be approved');
UPDATE public.sw_reports SET executive_summary = 'Synthetic summary', overall_description = 'Synthetic scope',
  risk_assessment = 'Human assessment uses a transparent 1–5 scale', identified_risks = 'Synthetic access disruption',
  security_arrangement = 'Alternate entrance', preparedness_incident_management = 'Synthetic response contact',
  conclusion = 'Human conclusion: use the alternate entrance', contacts = 'Synthetic duty function'
WHERE id = (SELECT report_a FROM sw_ids);
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.must_fail(format('UPDATE public.sw_reports SET status=''approved'' WHERE id=%L',
  (SELECT report_a FROM sw_ids)), '42501', 'SW-REPORT ordinary editor cannot approve a complete report');
SELECT pg_temp.login((SELECT approver FROM sw));
UPDATE public.sw_reports SET status = 'approved' WHERE id = (SELECT report_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_reports SET conclusion=''changed'' WHERE id=%L',
  (SELECT report_a FROM sw_ids)), '23514', 'SW-REPORT approved report content cannot change');
SELECT pg_temp.must_fail(format('DELETE FROM public.sw_citations WHERE id=%L',
  (SELECT report_citation FROM sw_ids)), '23514', 'SW-REPORT approved report citations cannot change');
UPDATE public.sw_reports SET status = 'exported' WHERE id = (SELECT report_a FROM sw_ids);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.sw_audit_events
  WHERE entity_id = (SELECT report_a FROM sw_ids) AND old_status = 'approved' AND new_status = 'exported'
  AND actor_user_id = (SELECT approver FROM sw)), 'SW-AUDIT export transition has actor and prior state');
UPDATE public.sw_reports SET status = 'archived' WHERE id = (SELECT report_a FROM sw_ids);
SELECT pg_temp.must_fail(format('UPDATE public.sw_reports SET status=''draft'' WHERE id=%L',
  (SELECT report_a FROM sw_ids)), '23514', 'SW-REPORT archive is final');
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.assert_history_immutable() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('UPDATE public.sw_audit_events SET operation=''DELETE'' WHERE id=(SELECT id FROM public.sw_audit_events WHERE workspace_id=%L LIMIT 1)',
    (SELECT id FROM sw_a)), '23514', 'SW-HISTORY audit rows resist operator accidental rewrite');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.assert_source_immutable() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.must_fail(format('UPDATE public.sw_source_items SET factual_extract=''rewritten'' WHERE id=%L',
    (SELECT item_a FROM sw_ids)), '23514', 'SW-HISTORY source facts resist operator accidental rewrite');
END $$;
SELECT pg_temp.assert_history_immutable();
SELECT pg_temp.assert_source_immutable();
SELECT pg_temp.must_fail(format('DELETE FROM public.sw_record_versions WHERE assessment_id=%L',
  (SELECT assessment_a FROM sw_ids)), '23514', 'SW-HISTORY saved versions resist operator accidental deletion');

SET LOCAL ROLE authenticated;
SELECT pg_temp.login((SELECT owner_a FROM sw));
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sw_workspace_memberships','sw_audit_events','sw_record_versions','sw_ai_runs'] LOOP
    PERFORM pg_temp.must_fail(format('INSERT INTO public.%I DEFAULT VALUES', table_name), '42501', 'SW-PROTECTED insert ' || table_name);
    PERFORM pg_temp.must_fail(format('UPDATE public.%I SET workspace_id=workspace_id', table_name), '42501', 'SW-PROTECTED update ' || table_name);
    PERFORM pg_temp.must_fail(format('DELETE FROM public.%I', table_name), '42501', 'SW-PROTECTED delete ' || table_name);
    PERFORM pg_temp.must_fail(format('TRUNCATE public.%I', table_name), '42501', 'SW-PROTECTED truncate ' || table_name);
  END LOOP;
END $$;
SELECT pg_temp.must_fail(format('UPDATE public.sw_source_items SET factual_extract=''changed'' WHERE id=%L',
  (SELECT item_a FROM sw_ids)), '42501', 'SW-SOURCE source update has no client grant');
SELECT pg_temp.must_fail('SELECT sw_private.record_change()', '42501', 'SW-HELPER internal audit function is not executable');

-- Revocation is evaluated on the next query with no token refresh.
SELECT pg_temp.login((SELECT editor FROM sw));
SELECT pg_temp.ok((SELECT count(*) FROM public.sw_assessments WHERE workspace_id=(SELECT id FROM sw_a)) = 2,
  'SW-REVOKE editor sees A before membership removal');
RESET ROLE;
UPDATE public.sw_workspace_memberships SET active = false
WHERE workspace_id=(SELECT id FROM sw_a) AND user_id=(SELECT editor FROM sw);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_no_workspace_rows((SELECT id FROM sw_a), 'SW-REVOKE stale JWT cannot bypass current membership');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_assessments(workspace_id,title) VALUES (%L,''revoked write'')',
  (SELECT id FROM sw_a)), '42501', 'SW-REVOKE stale JWT cannot write');
SELECT pg_temp.ok((SELECT count(*) FROM public.sw_assessments WHERE workspace_id=(SELECT id FROM sw_b)) = 1,
  'SW-REVOKE removing A does not remove independently granted B access');
RESET ROLE;
UPDATE public.sw_workspace_memberships SET active = true
WHERE workspace_id=(SELECT id FROM sw_a) AND user_id=(SELECT editor FROM sw);

SET LOCAL ROLE service_role;
-- Even a copied permanent-human claim does not authorize a service actor.
SELECT pg_temp.login((SELECT owner_a FROM sw));
SELECT pg_temp.assert_closed_role('SW-SERVICE');
SELECT pg_temp.must_fail('SELECT public.sw_create_personal_workspace(''AI bootstrap'')',
  '42501', 'SW-SERVICE provider cannot create workspace');
SELECT pg_temp.must_fail(format('UPDATE public.sw_assessments SET status=''approved'' WHERE id=%L',
  (SELECT draft_a FROM sw_ids)), '42501', 'SW-SERVICE provider cannot approve');
SELECT pg_temp.must_fail(format('INSERT INTO public.sw_ai_runs(workspace_id,requested_by,purpose,provider,model,template_version,idempotency_key,source_item_id) VALUES (%L,%L,''summarise'',''model'',''model-v1'',''v1'',''ai-write'',%L)',
  (SELECT id FROM sw_a), (SELECT owner_a FROM sw), (SELECT item_a FROM sw_ids)),
  '42501', 'SW-SERVICE provider has no AI-run write activation');
RESET ROLE;
SELECT pg_temp.login((SELECT owner_a FROM sw));

-- Leave deterministic current user + fixtures for transaction-local mutation
-- controls and rollback-refusal proof only when the caller explicitly asks.
\if :{?sw_keep_fixture}
\else
ROLLBACK;
\endif
