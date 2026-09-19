-- 20261201090000 — direct access to governed BESKT content, and the recruitment
-- setup that follows a case, through real sessions.
--
-- Proves: a NEW active organisation and an EXISTING one reach content the
-- publisher made available, with no grant, activation, content role or install
-- of their own; published content needs no pilot grant; a pending organisation
-- and another organisation's members reach nothing; availability is a governed,
-- idempotent, frozen content property that reviews and publishes nothing;
-- withdrawal stops new starts but not started work; and the setup is recorded
-- once, readable only where its case or assignment is. Synthetic; rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE TEMP TABLE ld (
  v uuid, vv uuid, vp uuid, prof uuid, hash text, vhash text,
  emp_a uuid, emp_new uuid, emp_pending uuid, emp_b uuid,
  owner_a uuid, owner_new uuid, owner_pending uuid, member_b uuid, editor uuid, publisher uuid,
  cand uuid, app_new uuid, job_new uuid, started uuid, setup uuid, tcase uuid,
  pack_v uuid, role_v uuid, op uuid
) ON COMMIT DROP;
INSERT INTO ld DEFAULT VALUES;
GRANT ALL ON ld TO authenticated;

CREATE FUNCTION pg_temp.listed(_employer uuid, _as uuid) RETURNS TABLE(id uuid, availability text)
LANGUAGE plpgsql AS $l$
BEGIN
  PERFORM pg_temp.become(_as); SET LOCAL ROLE authenticated;
  RETURN QUERY SELECT m.method_version_id, m.availability FROM public.bcp_assignable_method_versions(_employer) m;
  RESET ROLE; PERFORM pg_temp.nobody();
END $l$;

CREATE FUNCTION pg_temp.set_open(_v uuid, _available boolean, _op uuid DEFAULT gen_random_uuid(),
  _who uuid DEFAULT 'b2000000-0000-4000-8000-0000000000b1') RETURNS jsonb
LANGUAGE plpgsql AS $s$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  _r := public.beskt_set_pilot_availability(_op, _v, _available, 'SYNTETISKT innehållsbeslut: öppen pilot.');
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _r;
END $s$;

-- ---- setup ---------------------------------------------------------------
DO $setup$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp_a uuid := 'b2000000-0000-4000-8000-00000000ee01';
  _owner_a uuid := 'b2000000-0000-4000-8000-0000000000d1';
  _cand uuid := 'b2000000-0000-4000-8000-0000000000c1';
  _emp_new uuid := 'b9000000-0000-4000-8000-00000000e001';
  _emp_pending uuid := 'b9000000-0000-4000-8000-00000000e002';
  _emp_b uuid := 'b9000000-0000-4000-8000-00000000e003';
  _owner_new uuid := 'b9000000-0000-4000-8000-0000000000d1';
  _owner_pending uuid := 'b9000000-0000-4000-8000-0000000000d2';
  _member_b uuid := 'b9000000-0000-4000-8000-0000000000d3';
  _v uuid; _vv uuid; _vp uuid; _job uuid; _app uuid; _pack_v uuid; _role_v uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_owner_new, 'ld-owner-new@synthetic.test'), (_owner_pending, 'ld-owner-pending@synthetic.test'),
    (_member_b, 'ld-member-b@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  -- A brand-new organisation: active, and nothing else -- no grant, no
  -- activation, no content role, nothing installed.
  INSERT INTO public.employers (id, name, slug, status) VALUES
    (_emp_new, 'SYNTETISK Ny AB', 'synthetic-ld-new', 'active'),
    (_emp_pending, 'SYNTETISK Väntande AB', 'synthetic-ld-pending', 'pending'),
    (_emp_b, 'SYNTETISK Annan AB', 'synthetic-ld-other', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp_new, _owner_new, 'owner', 'active'), (_emp_pending, _owner_pending, 'owner', 'active'),
    (_emp_b, _member_b, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  _v := pg_temp.build_method('synthetic-ld-recruitment', 'recruitment_support');
  _vv := pg_temp.build_method('synthetic-ld-vetting', 'security_vetting_support');
  _vp := pg_temp.build_method('synthetic-ld-published', 'recruitment_support', _store => false);
  PERFORM pg_temp.submit(_vp); PERFORM pg_temp.approve_all(_vp); PERFORM pg_temp.publish(_vp);

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
  VALUES ('ld-job', 'LDJOB1', _emp_new, 'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job, _emp_new, _cand, now()) RETURNING id INTO _app;
  SELECT pv.id, rv.id INTO _pack_v, _role_v
    FROM public.scp_interview_pack_versions pv CROSS JOIN public.scp_role_versions rv LIMIT 1;

  UPDATE ld SET v = _v, vv = _vv, vp = _vp,
    prof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _v AND profile_key = 'lone_working'),
    hash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v),
    vhash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _vv),
    emp_a = _emp_a, emp_new = _emp_new, emp_pending = _emp_pending, emp_b = _emp_b,
    owner_a = _owner_a, owner_new = _owner_new, owner_pending = _owner_pending, member_b = _member_b,
    editor = 'b2000000-0000-4000-8000-0000000000e1', publisher = 'b2000000-0000-4000-8000-0000000000b1',
    cand = _cand, app_new = _app, job_new = _job, pack_v = _pack_v, role_v = _role_v;

  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.bcp_pilot_grants WHERE employer_id IN (_emp_new, _emp_a))
                     AND NOT EXISTS (SELECT 1 FROM public.bcp_internal_test_activations WHERE employer_id = _emp_new)
                     AND NOT public.scp_has_content_role(_owner_new, 'editor'),
    'LD0.1 the new organisation holds no grant, no activation and no content role');
  PERFORM pg_temp.ok((SELECT pilot_availability FROM public.beskt_method_versions WHERE id = _v) = 'restricted',
    'LD0.2 a version starts restricted: nothing is available merely by existing');
END $setup$;

-- ---- LD1: published content needs no grant; drafts need the publisher ---------
DO $$
DECLARE r ld%ROWTYPE;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.ok((SELECT array_agg(availability) FROM pg_temp.listed(r.emp_new, r.owner_new)) = ARRAY['published'],
    'LD1.1 a new organisation sees the published version at once, with no pilot grant, and no draft');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_a, r.owner_a) WHERE id = r.vp),
    'LD1.2 an existing organisation sees the same published version, without installing anything');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_pending, r.owner_pending)),
    'LD1.3 an organisation that is not active sees nothing');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L)',
           r.app_new, 'recruitment_support', r.v, r.prof, r.hash, r.owner_new, 'Kontakt: rekryteraren'),
    'BCP_NOT_ASSIGNABLE', 'LD1.4 a restricted draft cannot be started, even by the owner');
END $$;

-- ---- LD2: availability is a governed content property ------------------------
DO $$
DECLARE r ld%ROWTYPE; _op uuid := gen_random_uuid(); _a jsonb; _b jsonb; _c jsonb; _rev integer;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.beskt_set_pilot_availability(gen_random_uuid(), %L, true, %L)', r.v, 'Jag vill ha den'),
    'BESKT_NOT_PUBLISHER', 'LD2.1 an employer owner cannot open content');
  PERFORM pg_temp.must_fail_as('authenticated', r.editor,
    format('SELECT public.beskt_set_pilot_availability(gen_random_uuid(), %L, true, %L)', r.v, 'Redaktör'),
    'BESKT_NOT_PUBLISHER', 'LD2.2 nor can a content editor');
  PERFORM pg_temp.must_fail_as('authenticated', r.publisher,
    format('SELECT public.beskt_set_pilot_availability(gen_random_uuid(), %L, true, %L)', r.vp, 'Publicerad'),
    'BESKT_NOT_OPENABLE', 'LD2.3 a published version is governed by its status alone');
  _rev := pg_temp.revision_of(r.v);
  _a := pg_temp.set_open(r.v, true, _op);
  _b := pg_temp.set_open(r.v, true, _op);
  _c := pg_temp.set_open(r.v, true);
  PERFORM pg_temp.ok((_a ->> 'changed')::boolean AND _b = _a AND NOT (_c ->> 'changed')::boolean
                     AND pg_temp.revision_of(r.v) = _rev + 1,
    'LD2.4 the publisher opens it once; a replay answers the same and a repeat changes nothing');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.beskt_method_events
                       WHERE method_version_id = r.v AND event = 'availability_opened') = 1,
    'LD2.5 exactly one availability event is recorded');
  PERFORM pg_temp.ok((SELECT content_status = 'draft' AND validation_label = 'pilot_hypothesis'
                        FROM public.beskt_method_versions WHERE id = r.v)
                     AND NOT EXISTS (SELECT 1 FROM public.beskt_method_reviews WHERE method_version_id = r.v),
    'LD2.6 opening reviews, publishes and relabels nothing');
  PERFORM pg_temp.must_fail_as('authenticated', r.editor,
    format('SELECT public.beskt_delete_content(gen_random_uuid(), %L, %s, %L, %L)',
           r.v, pg_temp.revision_of(r.v), 'section', 'anything'),
    'BESKT_OPEN_FROZEN', 'LD2.7 available content is frozen');
END $$;

-- ---- LD3: every organisation reaches it directly; nobody else does -------------
DO $$
DECLARE r ld%ROWTYPE; _res jsonb; _n integer;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_new, r.owner_new) WHERE id = r.v AND availability = 'open_pilot')
                     AND EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_a, r.owner_a) WHERE id = r.v AND availability = 'open_pilot'),
    'LD3.1 the new and the existing organisation both list it as open pilot content');
  SELECT count(*) - count(DISTINCT id) INTO _n FROM pg_temp.listed(r.emp_new, r.owner_new);
  PERFORM pg_temp.ok(_n = 0, 'LD3.2 no version is listed twice');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_pending, r.owner_pending)),
    'LD3.3 the organisation that is not active still sees nothing');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_new, r.member_b)),
    'LD3.4 a member of another organisation lists nothing for this one');
  PERFORM pg_temp.must_fail_as('authenticated', r.member_b,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L)',
           r.app_new, 'recruitment_support', r.v, r.prof, r.hash, r.member_b, 'Kontakt'),
    'BCP_NOT_', 'LD3.5 another organisation cannot start it on this application');

  PERFORM pg_temp.become(r.owner_new); SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), r.app_new, 'recruitment_support', r.v, r.prof, r.hash,
    r.owner_new, 'Kontakt: rekryteraren, 08-000 00 00');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ld SET started = (_res ->> 'assignment_id')::uuid;
  PERFORM pg_temp.ok((SELECT method_version_id = r.v AND pinned_content_hash = r.hash
                        FROM public.bcp_assignments WHERE id = (_res ->> 'assignment_id')::uuid),
    'LD3.6 the new organisation starts it directly, pinned to the content it was shown');
END $$;

-- ---- LD4: the setup follows the start ---------------------------------------
DO $$
DECLARE r ld%ROWTYPE; _id uuid; _again uuid; _seen integer; _other integer; _c uuid;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.become(r.owner_new); SET LOCAL ROLE authenticated;
  _id := public.scp_record_recruitment_setup(r.emp_new, 'beskt', 'operational', 'vaktare', 'general', NULL, r.started);
  _again := public.scp_record_recruitment_setup(r.emp_new, 'beskt', 'operational', 'vaktare', 'general', NULL, r.started);
  SELECT count(*) INTO _seen FROM public.scp_recruitment_setups WHERE id = _id;
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ld SET setup = _id;
  PERFORM pg_temp.ok(_id = _again AND _seen = 1,
    'LD4.1 recorded once; the same setup again answers with the same record');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.scp_record_recruitment_setup(%L, ''beskt'', ''strategic'', ''security_manager'', ''general'', NULL, %L)',
           r.emp_new, r.started),
    'SCP_SETUP_ALREADY_RECORDED', 'LD4.2 a different setup for the same start is refused');
  PERFORM pg_temp.must_fail_as('authenticated', r.member_b,
    format('SELECT public.scp_record_recruitment_setup(%L, ''beskt'', ''operational'', ''vaktare'', ''general'', NULL, %L)',
           r.emp_new, r.started),
    'SCP_SETUP_NOT_PERMITTED', 'LD4.3 another organisation cannot write it');
  PERFORM pg_temp.become(r.member_b); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _other FROM public.scp_recruitment_setups WHERE id = _id;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_other = 0, 'LD4.4 nor read it');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('UPDATE public.scp_recruitment_setups SET environment = ''hospital'' WHERE id = %L', _id),
    'permission denied', 'LD4.5 no client writes the table directly');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_recruitment_setups SET environment = ''hospital'' WHERE id = %L', _id),
    'SCP_SETUP_UNGOVERNED_WRITE', 'LD4.6 and even an owner of the table cannot change it outside the function');

  -- Carried into an interview case: attached once, same setup.
  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (r.emp_new, r.job_new, r.app_new, r.cand, 'SYNTETISK Kandidat', r.pack_v, r.role_v,
          'SYNTETISK Väktare – BESKT', r.owner_new)
  RETURNING id INTO _c;
  UPDATE ld SET tcase = _c;
  PERFORM pg_temp.become(r.owner_new); SET LOCAL ROLE authenticated;
  _again := public.scp_record_recruitment_setup(r.emp_new, 'beskt', 'operational', 'vaktare', 'general', _c, r.started);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_again = _id
                     AND (SELECT interview_case_id FROM public.scp_recruitment_setups WHERE id = _id) = _c,
    'LD4.7 the case the assignment is carried into is attached to the same setup');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.scp_record_recruitment_setup(%L, ''trust'', ''operational'', ''vaktare'', ''general'', %L, NULL)',
           r.emp_new, _c),
    'SCP_SETUP_ALREADY_RECORDED', 'LD4.8 and the case cannot be given a second, different setup');
END $$;

-- ---- LD5: withdrawal stops new starts, not started work -----------------------
DO $$
DECLARE r ld%ROWTYPE; _read boolean;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.set_open(r.v, false);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_new, r.owner_new) WHERE id = r.v),
    'LD5.1 once withdrawn it is no longer listed');
  INSERT INTO auth.users (id, email) VALUES ('b9000000-0000-4000-8000-0000000000c2', 'ld-cand2@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (r.job_new, r.emp_new, 'b9000000-0000-4000-8000-0000000000c2', now());
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L)',
           (SELECT id FROM public.job_applications WHERE job_id = r.job_new
             AND applicant_user_id = 'b9000000-0000-4000-8000-0000000000c2'),
           'recruitment_support', r.v, r.prof, r.hash, r.owner_new, 'Kontakt'),
    'BCP_NOT_ASSIGNABLE', 'LD5.2 and cannot be started again');
  PERFORM pg_temp.become(r.cand); SET LOCAL ROLE authenticated;
  _read := jsonb_array_length(public.bcp_candidate_preparation(r.started) -> 'items') > 0;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_read, 'LD5.3 the candidate of the started assignment still reads its unchanged content');
  PERFORM pg_temp.ok((SELECT pilot_availability FROM public.beskt_method_versions WHERE id = r.v) = 'restricted'
                     AND (SELECT count(*) FROM public.beskt_method_events
                           WHERE method_version_id = r.v AND event = 'availability_withdrawn') = 1,
    'LD5.4 the withdrawal is one recorded event, and nothing reopens it');
END $$;

-- ---- LD6: a vetting stays the security function's ------------------------------
DO $$
DECLARE r ld%ROWTYPE;
BEGIN
  SELECT * INTO r FROM ld;
  PERFORM pg_temp.set_open(r.vv, true);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_temp.listed(r.emp_new, r.owner_new) WHERE id = r.vv),
    'LD6.1 an open vetting version is listed for the new organisation');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_new,
    format('SELECT public.bcp_start_beskt(gen_random_uuid(), %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
           r.app_new, 'security_vetting_support', r.vv,
           (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = r.vv AND permitted_mode = 'security_vetting_support'),
           r.vhash, r.owner_new, 'Kontakt', r.owner_new,
           'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.',
           'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.'),
    'BCP_', 'LD6.2 but availability does not bypass the security function: an owner who is not appointed cannot start a vetting');
END $$;

-- ---- LD7: grants --------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.beskt_set_pilot_availability(uuid,uuid,boolean,text)', 'EXECUTE')
                     AND NOT has_function_privilege('anon', 'public.scp_record_recruitment_setup(uuid,text,text,text,text,uuid,uuid)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.bcp_offer_covers(uuid,uuid)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.bcp_open_pilot_available(uuid)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.bcp_offer_content_covers(uuid,uuid,text)', 'EXECUTE')
                     AND NOT has_table_privilege('anon', 'public.scp_recruitment_setups', 'SELECT')
                     AND NOT has_table_privilege('authenticated', 'public.scp_recruitment_setups', 'INSERT')
                     AND NOT has_table_privilege('authenticated', 'public.scp_recruitment_setups', 'TRUNCATE'),
    'LD7.1 anon reaches nothing new; the entitlement predicates are internal; the setup table is read-only to clients');
END $$;

ROLLBACK;
