-- Open pilot entitlement — available governed content, not per-employer grants.
--
-- The owner decision of 2026-08-28: an ACTIVE employer uses available pilot
-- content immediately; admin governs the CONTENT (make available / withdraw),
-- never an employer-by-employer switch. This suite proves the new rule AND
-- that every boundary around it survived: suspended employers, withdrawn or
-- retired content, production governance, tenant isolation, candidates, and
-- the grant instrument that remains for restricted cohorts.
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
-- Fixtures. One ACTIVE employer, one SUSPENDED employer, a second active
-- employer for tenant isolation, a candidate with no membership anywhere,
-- and a platform publisher.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('88880000-0000-4000-8000-000000000001', 'op-active-owner@test.local'),
  ('88880000-0000-4000-8000-000000000002', 'op-suspended-owner@test.local'),
  ('88880000-0000-4000-8000-000000000003', 'op-candidate@test.local'),
  ('88880000-0000-4000-8000-000000000004', 'op-publisher@test.local'),
  ('88880000-0000-4000-8000-000000000005', 'op-other-owner@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('88880000-0000-4000-8000-00000000000a', 'Open Pilot AB', 'open-pilot-ab', 'active'),
  ('88880000-0000-4000-8000-00000000000b', 'Suspended AB', 'op-suspended-ab', 'suspended'),
  ('88880000-0000-4000-8000-00000000000c', 'Other Tenant AB', 'op-other-ab', 'active'),
  ('88880000-0000-4000-8000-00000000000d', 'Archived AB', 'op-archived-ab', 'archived')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('88880000-0000-4000-8000-000000000001','88880000-0000-4000-8000-00000000000a','owner','active'),
  ('88880000-0000-4000-8000-000000000002','88880000-0000-4000-8000-00000000000b','owner','active'),
  ('88880000-0000-4000-8000-000000000005','88880000-0000-4000-8000-00000000000c','owner','active'),
  ('88880000-0000-4000-8000-000000000002','88880000-0000-4000-8000-00000000000d','owner','active')
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('88880000-0000-4000-8000-000000000004', 'publisher')
ON CONFLICT DO NOTHING;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP1 — the owner decision is applied, and applied narrowly'; END $$;
-- ===========================================================================

DO $$
DECLARE _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  SELECT ver.* INTO _v FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.version_number = 1;

  PERFORM pg_temp.ok(_v.pilot_availability = 'open',
    'OP1.1 Vaktare v1 is openly available after replay');
  PERFORM pg_temp.ok(_v.content_status = 'draft',
    'OP1.2 and is STILL draft — availability publishes nothing');
  PERFORM pg_temp.ok(_v.validation_label = 'pilot_hypothesis',
    'OP1.3 and STILL a pilot hypothesis — no scientific claim was manufactured');
  PERFORM pg_temp.ok(EXISTS (
      SELECT 1 FROM public.scp_interview_pack_events e
       WHERE e.pack_version_id = _v.id AND e.event = 'pilot_opened'
         AND e.reason IS NOT NULL),
    'OP1.4 the opening is in the pack ledger, with its reason');
  PERFORM pg_temp.ok(NOT EXISTS (
      SELECT 1 FROM public.scp_interview_pack_pilot_grants g
       WHERE g.pack_version_id = _v.id),
    'OP1.5 and no grant row was needed to achieve it');
  PERFORM pg_temp.ok(public.scp_iv_open_pilot_available(_v.id),
    'OP1.6 the entitlement helper agrees the version is available');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP2 — an active employer uses it directly, in internal_qa mode'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid; _case uuid; _n integer; _meta jsonb;
  _owner uuid := '88880000-0000-4000-8000-000000000001';
  _emp uuid := '88880000-0000-4000-8000-00000000000a';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(_packv),
    'OP2.1 the read entitlement admits an active employer member with no grant');

  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = _packv;
  PERFORM pg_temp.ok(_n = 1,
    'OP2.2 and RLS actually shows the version row to that member');

  SELECT count(*) INTO _n FROM public.scp_interview_core_questions WHERE pack_version_id = _packv;
  PERFORM pg_temp.ok(_n = 8,
    'OP2.3 with all eight core questions readable');

  _case := public.scp_iv_create_case(_emp, 'Open pilot case', _packv, 'Kandidat A', NULL, 'OP-EXT-1');
  PERFORM pg_temp.ok(_case IS NOT NULL,
    'OP2.4 the employer creates a case with NO pilot grant row anywhere');
  RESET ROLE;

  SELECT e.metadata INTO _meta FROM public.scp_interview_case_events e
   WHERE e.case_id = _case AND e.event = 'case_created';
  PERFORM pg_temp.ok(_meta ->> 'entitlement_basis' = 'open_pilot',
    'OP2.5 the audit event names the entitlement basis: open_pilot');
  PERFORM pg_temp.ok(_meta ->> 'trust_usage_mode' = 'internal_qa',
    'OP2.6 the case pins under internal_qa, never production');
  PERFORM pg_temp.ok((_meta ->> 'used_pilot_grant')::boolean = false,
    'OP2.7 and truthfully records that no grant was used');
  PERFORM pg_temp.ok(_meta ->> 'validation_label' = 'pilot_hypothesis',
    'OP2.8 the pilot-hypothesis label rides into the case audit trail');

  PERFORM pg_temp.ok(EXISTS (
      SELECT 1 FROM public.scp_interview_cases c
       WHERE c.id = _case AND c.trust_method_id IS NOT NULL AND c.pack_content_hash IS NOT NULL),
    'OP2.9 the case pins the DRAFT TRUST method and the content hash — internal_qa accepts a draft method');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP3 — an employer that is not ACTIVE gets nothing new'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid;
  _susp_owner uuid := '88880000-0000-4000-8000-000000000002';
  _susp_emp uuid := '88880000-0000-4000-8000-00000000000b';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _susp_owner::text, true);

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)',
           _susp_emp, 'Nope', _packv, 'K'),
    'SCP_IV_EMPLOYER_NOT_ACTIVE',
    'OP3.1 a suspended employer cannot start an interview on open pilot content');

  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(_packv),
    'OP3.2 and its members cannot read the open pilot content either');
  RESET ROLE;

  -- The archived state is refused by the same check, not by a separate one.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _susp_owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)',
           '88880000-0000-4000-8000-00000000000d', 'Nope', _packv, 'K'),
    'SCP_IV_EMPLOYER_NOT_ACTIVE',
    'OP3.3 an archived employer is refused the same way');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP4 — availability is a governed content decision'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid; _n integer;
  _owner uuid := '88880000-0000-4000-8000-000000000001';
  _publisher uuid := '88880000-0000-4000-8000-000000000004';
  _emp uuid := '88880000-0000-4000-8000-00000000000a';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  -- Not a publisher: refused.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_set_pilot_availability(%L, false, %L)', _packv, 'nej'),
    'SCP_INTERVIEW_NOT_PUBLISHER',
    'OP4.1 an employer cannot change availability — it is a platform content decision');

  -- Nor can anyone rewrite the flag with a plain UPDATE: authenticated holds
  -- no UPDATE grant on the table at all.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_versions SET pilot_availability = %L WHERE id = %L',
           'restricted', _packv),
    'permission denied',
    'OP4.2 a direct UPDATE from an employer is refused outright');
  RESET ROLE;

  -- The publisher withdraws it, with a reason.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_set_pilot_availability(%L, false, %L)', _packv, '   '),
    'SCP_INTERVIEW_REASON_REQUIRED',
    'OP4.3 withdrawing without a reason is refused');
  PERFORM public.scp_interview_set_pilot_availability(_packv, false, 'Testsuite: tillfälligt tillbakadraget.');
  RESET ROLE;

  PERFORM pg_temp.ok(NOT public.scp_iv_open_pilot_available(_packv),
    'OP4.4 withdrawn means unavailable');
  PERFORM pg_temp.ok(EXISTS (
      SELECT 1 FROM public.scp_interview_pack_events e
       WHERE e.pack_version_id = _packv AND e.event = 'pilot_withdrawn'),
    'OP4.5 and the withdrawal is in the ledger');

  -- Withdrawn content refuses new cases immediately.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp, 'Nej', _packv, 'K'),
    'SCP_IV_PACK_NOT_USABLE',
    'OP4.6 a withdrawn version cannot start new cases');
  RESET ROLE;

  -- Reopen for the rest of the suite; double-open is refused.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM public.scp_interview_set_pilot_availability(_packv, true, 'Testsuite: öppnad igen.');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_set_pilot_availability(%L, true, %L)', _packv, 'igen'),
    'SCP_INTERVIEW_ALREADY_OPEN',
    'OP4.7 opening an already-open version is refused, so the ledger stays honest');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP5 — open availability freezes the content employers can see'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid;
  _publisher uuid := '88880000-0000-4000-8000-000000000004';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  PERFORM pg_temp.ok(NOT public.scp_interview_version_is_editable(_packv),
    'OP5.1 while open, the version is NOT editable — what a case pins cannot drift');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM public.scp_interview_set_pilot_availability(_packv, false, 'Testsuite: redigeringstest.');
  RESET ROLE;

  PERFORM pg_temp.ok(public.scp_interview_version_is_editable(_packv),
    'OP5.2 withdraw first, then edit — the freeze lifts with availability');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _publisher::text, true);
  PERFORM public.scp_interview_set_pilot_availability(_packv, true, 'Testsuite: öppnad igen.');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP6 — suspended and retired content is refused; production keeps its governance'; END $$;
-- ===========================================================================

-- A dedicated fixture version walks the whole ladder so the seeded pack is
-- left alone: draft -> reviews -> published -> suspended -> retired.
DO $$
DECLARE
  _pack uuid; _v uuid; _role uuid;
  _owner uuid := '88880000-0000-4000-8000-000000000001';
  _emp uuid := '88880000-0000-4000-8000-00000000000a';
BEGIN
  SELECT role_id INTO _role FROM public.scp_interview_packs WHERE slug = 'vaktare-se';

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('op-ladder-fixture', _role, 'OP-fixtur', 'Testfixtur för tillståndsmatrisen.')
  RETURNING id INTO _pack;

  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, locale, role_version_id, source_reference,
     source_document_version, summary_sv)
  SELECT _pack, 1, 'sv-SE', v.role_version_id, 'Testfixtur', 'v0', 'Fixtur'
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p2 ON p2.id = v.pack_id
   WHERE p2.slug = 'vaktare-se' LIMIT 1;
  SELECT id INTO _v FROM public.scp_interview_pack_versions WHERE pack_id = _pack;

  UPDATE public.scp_interview_pack_versions SET content_hash = 'op-fixture-hash' WHERE id = _v;

  -- Open it, then march the ladder with governed transitions.
  UPDATE public.scp_interview_pack_versions SET pilot_availability = 'open' WHERE id = _v;
  PERFORM pg_temp.ok(public.scp_iv_open_pilot_available(_v),
    'OP6.1 the fixture is open and available while in the review ladder');

  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions SET content_status = 'expert_review'    WHERE id = _v;
  UPDATE public.scp_interview_pack_versions SET content_status = 'legal_review'     WHERE id = _v;
  UPDATE public.scp_interview_pack_versions SET content_status = 'cognitive_review' WHERE id = _v;
  PERFORM pg_temp.ok(public.scp_iv_open_pilot_available(_v),
    'OP6.2 it stays available through the review states — review is not withdrawal');

  UPDATE public.scp_interview_pack_versions SET content_status = 'published' WHERE id = _v;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM pg_temp.ok(NOT public.scp_iv_open_pilot_available(_v),
    'OP6.3 published is NOT open-pilot — it is production, with production rules');

  -- Production requires an APPROVED TRUST method. None exists, so this fails
  -- closed — the open-pilot rule did not soften production governance.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp, 'Prod', _v, 'K'),
    'SCP_TRUST_NO_APPROVED_METHOD',
    'OP6.4 a published pack still demands an approved TRUST method — production fails closed today');
  RESET ROLE;

  -- Suspend it. The stale 'open' flag must not resurrect it.
  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions SET content_status = 'suspended' WHERE id = _v;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  PERFORM pg_temp.ok(NOT public.scp_iv_open_pilot_available(_v),
    'OP6.5 suspended content is unavailable even though the flag still says open');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp, 'Nej', _v, 'K'),
    'SCP_IV_PACK_NOT_USABLE',
    'OP6.6 and cannot start a case');
  RESET ROLE;

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_set_pilot_availability(%L, true, %L)', _v, 'nej'),
    'SCP_INTERVIEW_NOT_PUBLISHER',
    'OP6.7 nobody without the publisher role can flip it back');

  -- Retire it, then prove not even the publisher can touch availability on
  -- retired content — the flag itself is frozen from publication onward, and
  -- the governed RPC refuses the whole concept outside the review ladder.
  PERFORM set_config('scp_interview.governed_transition', 'on', true);
  UPDATE public.scp_interview_pack_versions SET content_status = 'retired' WHERE id = _v;
  PERFORM set_config('scp_interview.governed_transition', 'off', true);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '88880000-0000-4000-8000-000000000004', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_interview_set_pilot_availability(%L, true, %L)', _v, 'försök'),
    'SCP_INTERVIEW_NOT_OPENABLE',
    'OP6.8 retired content cannot be opened for pilot use, by anyone');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP7 — tenants and candidates stay where they are'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _packv uuid; _n integer;
  _other_owner uuid := '88880000-0000-4000-8000-000000000005';
  _candidate uuid := '88880000-0000-4000-8000-000000000003';
  _emp_a uuid := '88880000-0000-4000-8000-00000000000a';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  -- A member of ANOTHER employer cannot create cases in this tenant.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other_owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp_a, 'Intrång', _packv, 'K'),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'OP7.1 open availability opens the CONTENT, never another employer''s workspace');
  RESET ROLE;

  -- A candidate with no membership sees nothing and starts nothing.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _candidate::text, true);
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = _packv;
  PERFORM pg_temp.ok(_n = 0,
    'OP7.2 a candidate cannot read the open pilot pack version');
  SELECT count(*) INTO _n FROM public.scp_interview_core_questions WHERE pack_version_id = _packv;
  PERFORM pg_temp.ok(_n = 0,
    'OP7.3 nor its questions — Q1–Q8 stay employer-side');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp_a, 'Nej', _packv, 'K'),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'OP7.4 and a candidate cannot start an interview about anyone');
  RESET ROLE;

  -- anon cannot even ask the entitlement question.
  SET LOCAL ROLE anon;
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_open_pilot_available(%L)', _packv),
    'permission denied',
    'OP7.5 anon has no EXECUTE on the entitlement helper');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP OP8 — the grant instrument survives, for restricted cohorts'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _pack uuid; _v uuid; _role uuid; _case uuid; _meta jsonb;
  _owner uuid := '88880000-0000-4000-8000-000000000001';
  _emp uuid := '88880000-0000-4000-8000-00000000000a';
BEGIN
  SELECT role_id INTO _role FROM public.scp_interview_packs WHERE slug = 'vaktare-se';

  -- A RESTRICTED draft: invisible and unusable without a grant, exactly as
  -- before the owner decision.
  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('op-restricted-fixture', _role, 'Begränsad fixtur', 'Testfixtur för medgivandespåret.')
  RETURNING id INTO _pack;
  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, locale, role_version_id, source_reference,
     source_document_version, summary_sv)
  SELECT _pack, 1, 'sv-SE', v.role_version_id, 'Testfixtur', 'v0', 'Fixtur'
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p2 ON p2.id = v.pack_id
   WHERE p2.slug = 'vaktare-se' LIMIT 1;
  SELECT id INTO _v FROM public.scp_interview_pack_versions WHERE pack_id = _pack;
  UPDATE public.scp_interview_pack_versions SET content_hash = 'op-restricted-hash' WHERE id = _v;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', _emp, 'Nej', _v, 'K'),
    'SCP_IV_PACK_NOT_USABLE',
    'OP8.1 restricted content is still closed by default — open pilot is per version, not a blanket');
  RESET ROLE;

  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
  VALUES (_emp, _v, 'Kontrollerad kohort.', 'internal_qa', 'development', current_date + 30);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _case := public.scp_iv_create_case(_emp, 'Kohortfall', _v, 'Kandidat B', NULL, 'OP-EXT-2');
  RESET ROLE;

  SELECT e.metadata INTO _meta FROM public.scp_interview_case_events e
   WHERE e.case_id = _case AND e.event = 'case_created';
  PERFORM pg_temp.ok(_meta ->> 'entitlement_basis' = 'pilot_grant',
    'OP8.2 a grant still admits a restricted cohort, and the audit trail says so');
  PERFORM pg_temp.ok((_meta ->> 'used_pilot_grant')::boolean = true,
    'OP8.3 used_pilot_grant stays truthful on the grant path');
END $$;

ROLLBACK;
