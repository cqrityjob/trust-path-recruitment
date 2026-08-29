-- The list and the create button must agree.
--
-- P0 regression, found in owner UAT: the new-interview selector offered
-- Väktare v1 and the create call then refused it. The two were answering
-- different questions -- "may this USER READ a pack?" versus "may THIS
-- EMPLOYER START one?" -- and diverged whenever a version was readable only
-- for continuity, or the user belonged to more than one employer.
--
-- Every assertion below uses THE SAME employer identity and THE SAME pack
-- version id across the list and the create, because a test that lists with
-- one identity and creates with another cannot catch this class of bug.
--
-- Deterministic. No AI is invoked, no network is touched. Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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


-- ---------------------------------------------------------------------------
-- Fixtures: an ACTIVE employer, a SUSPENDED one, an ARCHIVED one, a second
-- tenant, and a candidate with no membership. One user deliberately belongs
-- to BOTH the active and the suspended employer -- that overlap is what made
-- the multi-employer contradiction reachable.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('aaaa0000-0000-4000-8000-000000000001', 'start-owner@test.local'),
  ('aaaa0000-0000-4000-8000-000000000002', 'start-candidate@test.local'),
  ('aaaa0000-0000-4000-8000-000000000003', 'start-other-tenant@test.local'),
  ('aaaa0000-0000-4000-8000-000000000004', 'start-publisher@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('aaaa0000-0000-4000-8000-00000000000a', 'Säkerhet AB',   'start-sakerhet-ab', 'active'),
  ('aaaa0000-0000-4000-8000-00000000000b', 'Pausad AB',     'start-pausad-ab',   'suspended'),
  ('aaaa0000-0000-4000-8000-00000000000c', 'Arkiverad AB',  'start-arkiv-ab',    'archived'),
  ('aaaa0000-0000-4000-8000-00000000000d', 'Annan Tenant AB','start-annan-ab',   'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('aaaa0000-0000-4000-8000-000000000001','aaaa0000-0000-4000-8000-00000000000a','owner','active'),
  -- the same person, also in a suspended and an archived employer
  ('aaaa0000-0000-4000-8000-000000000001','aaaa0000-0000-4000-8000-00000000000b','owner','active'),
  ('aaaa0000-0000-4000-8000-000000000001','aaaa0000-0000-4000-8000-00000000000c','owner','active'),
  ('aaaa0000-0000-4000-8000-000000000003','aaaa0000-0000-4000-8000-00000000000d','owner','active')
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('aaaa0000-0000-4000-8000-000000000004', 'publisher')
ON CONFLICT DO NOTHING;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SC1 — list, then create, with the same identity and the same version'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _listed uuid; _basis text; _case uuid; _meta jsonb; _n integer;
  _owner uuid := 'aaaa0000-0000-4000-8000-000000000001';
  _emp uuid := 'aaaa0000-0000-4000-8000-00000000000a';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- A. the startable list returns Väktare v1
  SELECT s.pack_version_id, s.entitlement_basis INTO _listed, _basis
    FROM public.scp_iv_startable_pack_versions(_emp) s
    JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'vaktare-se';

  PERFORM pg_temp.ok(_listed IS NOT NULL,
    'SC1.A the startable list returns Väktare v1 for an active employer with no grant');

  -- C. the basis the list reports
  PERFORM pg_temp.ok(_basis = 'open_pilot',
    format('SC1.C the list reports basis open_pilot (got %s)', _basis));

  -- B. creating with EXACTLY the id the list returned succeeds
  _case := public.scp_iv_create_case(_emp, 'UAT', _listed, 'Kandidat', NULL, 'SC-1');
  PERFORM pg_temp.ok(_case IS NOT NULL,
    'SC1.B creating with the id the list returned succeeds — no contradiction');
  RESET ROLE;

  SELECT e.metadata INTO _meta FROM public.scp_interview_case_events e
   WHERE e.case_id = _case AND e.event = 'case_created';

  PERFORM pg_temp.ok(_meta ->> 'entitlement_basis' = _basis,
    'SC1.C2 the basis recorded on the case is the same one the list reported');

  -- D. usage mode
  PERFORM pg_temp.ok(_meta ->> 'trust_usage_mode' = 'internal_qa',
    'SC1.D the case runs in internal_qa, and Väktare v1 stays a pilot hypothesis');
  PERFORM pg_temp.ok(_meta ->> 'validation_label' = 'pilot_hypothesis',
    'SC1.D2 the pilot_hypothesis label is unchanged by any of this');

  -- The structural claim, stated as an assertion rather than a comment:
  -- everything the list offers, create accepts. The list is gathered as the
  -- employer; the basis is then checked as the owner role, because the shared
  -- basis function is internal and a browser principal cannot call it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  CREATE TEMP TABLE sc1_listed ON COMMIT DROP AS
    SELECT pack_version_id FROM public.scp_iv_startable_pack_versions(_emp);
  RESET ROLE;

  SELECT count(*) INTO _n FROM sc1_listed l
   WHERE public.scp_iv_case_start_basis(_emp, l.pack_version_id, _owner) IS NULL;
  PERFORM pg_temp.ok(_n = 0,
    'SC1.E every version the list offers has a live start basis — the list cannot offer a refusal');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SC2 — the reported failure: continuity read is not a start permission'; END $$;
-- ===========================================================================

-- This is the exact shape of the owner UAT failure. A case pinned the version,
-- which keeps it READABLE for continuity; the old selector consumed that read
-- grant and offered a pack the create call then refused.
DO $$
DECLARE
  _packv uuid; _n integer;
  _owner uuid := 'aaaa0000-0000-4000-8000-000000000001';
  _emp uuid := 'aaaa0000-0000-4000-8000-00000000000a';
  _publisher uuid := 'aaaa0000-0000-4000-8000-000000000004';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';

  -- Withdraw availability. A case from SC1 already pins this version.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM public.scp_interview_set_pilot_availability(_packv, false, 'Testsuite: tillbakadraget.');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- Continuity survives: the employer can still READ the version its case pinned.
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(_packv),
    'SC2.1 continuity read access survives withdrawal — finished work stays interpretable');

  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = _packv;
  PERFORM pg_temp.ok(_n = 1,
    'SC2.2 and RLS still shows the pinned version row');

  -- ...but it is NOT startable, and the list says so.
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp)
   WHERE pack_version_id = _packv;
  PERFORM pg_temp.ok(_n = 0,
    'SC2.3 the startable list drops the withdrawn version — continuity is not permission to start');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)',
           _emp, 'Should refuse', _packv, 'K', 'SC-2'),
    'SCP_IV_PACK_NOT_USABLE',
    'SC2.4 and create refuses it — list and button agree on the refusal too');
  RESET ROLE;

  -- Historical evidence is untouched by the withdrawal.
  SELECT count(*) INTO _n FROM public.scp_interview_cases
   WHERE pack_version_id = _packv AND pack_content_hash IS NOT NULL AND trust_method_id IS NOT NULL;
  PERFORM pg_temp.ok(_n >= 1,
    'SC2.5 the existing case keeps its pinned pack hash and TRUST method after withdrawal');

  -- Put it back for the remaining groups.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM public.scp_interview_set_pilot_availability(_packv, true, 'Testsuite: öppnad igen.');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SC3 — the multi-employer contradiction'; END $$;
-- ===========================================================================

-- The same user, in a workspace belonging to an employer that is not active.
-- The read entitlement is satisfied by ANY active membership of ANY active
-- employer, so the old selector listed the pack here too.
DO $$
DECLARE
  _packv uuid; _n integer;
  _owner uuid := 'aaaa0000-0000-4000-8000-000000000001';
  _susp uuid := 'aaaa0000-0000-4000-8000-00000000000b';
  _arch uuid := 'aaaa0000-0000-4000-8000-00000000000c';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- The user still passes the READ entitlement, because of the ACTIVE employer
  -- they also belong to. That is correct, and it is exactly why the list must
  -- not be built from it.
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(_packv),
    'SC3.1 the user passes the read entitlement via their OTHER, active employer');

  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_susp);
  PERFORM pg_temp.ok(_n = 0,
    'SC3.2 but the suspended employer''s workspace offers nothing to start');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_can_start_interviews(_susp),
    'SC3.3 and the screen can say why: this account cannot start interviews');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)',
           _susp, 'Nope', _packv, 'K', 'SC-3'),
    'SCP_IV_EMPLOYER_NOT_ACTIVE',
    'SC3.4 create refuses in the suspended workspace');

  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_arch);
  PERFORM pg_temp.ok(_n = 0,
    'SC3.5 an archived employer offers nothing either');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)',
           _arch, 'Nope', _packv, 'K', 'SC-4'),
    'SCP_IV_EMPLOYER_NOT_ACTIVE',
    'SC3.6 and refuses creation');

  -- The active workspace is unaffected: same user, same moment.
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions('aaaa0000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.ok(_n = 1,
    'SC3.7 while the SAME user''s active workspace still offers exactly one startable pack');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SC4 — candidates and other tenants enumerate nothing'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid; _n integer;
  _candidate uuid := 'aaaa0000-0000-4000-8000-000000000002';
  _other uuid := 'aaaa0000-0000-4000-8000-000000000003';
  _emp uuid := 'aaaa0000-0000-4000-8000-00000000000a';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';

  -- A candidate: no membership anywhere.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _candidate::text, true);
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp);
  PERFORM pg_temp.ok(_n = 0,
    'SC4.1 a candidate cannot enumerate startable packs for an employer');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_can_start_interviews(_emp),
    'SC4.2 nor learn that the employer could start one');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)',
           _emp, 'Nope', _packv, 'K', 'SC-5'),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'SC4.3 and cannot create a case');
  -- The internal basis function stays internal.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_case_start_basis(%L, %L)', _emp, _packv),
    'permission denied',
    'SC4.4 the shared basis function is not callable by a browser principal');
  RESET ROLE;

  -- Another tenant's owner.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp);
  PERFORM pg_temp.ok(_n = 0,
    'SC4.5 another tenant cannot enumerate this employer''s startable packs');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)',
           _emp, 'Nope', _packv, 'K', 'SC-6'),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'SC4.6 and cannot create in it');
  -- ...but their own active workspace works, so this is isolation, not breakage.
  SELECT count(*) INTO _n
    FROM public.scp_iv_startable_pack_versions('aaaa0000-0000-4000-8000-00000000000d');
  PERFORM pg_temp.ok(_n = 1,
    'SC4.7 their own active workspace still offers the openly available pilot');
  RESET ROLE;

  -- anon reaches none of it.
  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail(
    format('SELECT * FROM public.scp_iv_startable_pack_versions(%L)', _emp),
    'permission denied',
    'SC4.8 anon has no EXECUTE on the startable list');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SC5 — the restricted grant path still lists and starts'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _pack uuid; _v uuid; _role uuid; _n integer; _basis text; _case uuid;
  _owner uuid := 'aaaa0000-0000-4000-8000-000000000001';
  _emp uuid := 'aaaa0000-0000-4000-8000-00000000000a';
BEGIN
  SELECT role_id INTO _role FROM public.scp_interview_packs WHERE slug = 'vaktare-se';

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('sc-restricted-fixture', _role, 'Begränsad fixtur', 'Testfixtur för medgivandespåret.')
  RETURNING id INTO _pack;
  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, locale, role_version_id, source_reference,
     source_document_version, summary_sv)
  SELECT _pack, 1, 'sv-SE', v.role_version_id, 'Testfixtur', 'v0', 'Fixtur'
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p2 ON p2.id = v.pack_id
   WHERE p2.slug = 'vaktare-se' LIMIT 1;
  SELECT id INTO _v FROM public.scp_interview_pack_versions WHERE pack_id = _pack;
  UPDATE public.scp_interview_pack_versions SET content_hash = 'sc-restricted-hash' WHERE id = _v;

  -- Restricted and ungranted: absent from the list, refused by create.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions(_emp) WHERE pack_version_id = _v;
  PERFORM pg_temp.ok(_n = 0,
    'SC5.1 restricted content is absent from the startable list');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'Nope', _v, 'K', 'SC-7'),
    'SCP_IV_PACK_NOT_USABLE',
    'SC5.2 and refused by create — the two agree');
  RESET ROLE;

  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
  VALUES (_emp, _v, 'Kontrollerad kohort.', 'internal_qa', 'development', current_date + 30);

  -- Granted: present in the list, and startable, with the grant basis.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT entitlement_basis INTO _basis FROM public.scp_iv_startable_pack_versions(_emp)
   WHERE pack_version_id = _v;
  PERFORM pg_temp.ok(_basis = 'pilot_grant',
    'SC5.3 a granted restricted version appears in the list with basis pilot_grant');
  _case := public.scp_iv_create_case(_emp, 'Kohort', _v, 'Kandidat', NULL, 'SC-8');
  PERFORM pg_temp.ok(_case IS NOT NULL,
    'SC5.4 and creating with the listed id succeeds');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT e.metadata ->> 'entitlement_basis' FROM public.scp_interview_case_events e
      WHERE e.case_id = _case AND e.event = 'case_created') = 'pilot_grant',
    'SC5.5 and the case records the grant basis the list reported');
END $$;

ROLLBACK;
