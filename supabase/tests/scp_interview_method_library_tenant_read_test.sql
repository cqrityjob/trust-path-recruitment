-- Interview-method library: the employer read boundary, tested deliberately.
--
-- The finding this suite exists for: draft interview-method design content
-- was readable by every active employer member of every employer, because the
-- five employer read policies decided on membership alone. Migration
-- 20261115090000 routes them through scp_iv_employer_may_read_method():
-- approved contract, or a case of the caller's OWN employer that pins the
-- method. This suite proves that boundary from every side that matters --
-- two employers, a suspended employer, an invited (not yet active) member, a
-- candidate with a login and no seat, a governance reader, a platform admin,
-- and anon -- and then proves that its own assertions would NOTICE if the
-- policy or the grant were weakened again.
--
-- Everything it plants is labelled SYNTETISK and rolls back. No AI, no
-- network. Deterministic.

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

-- Become a signed-in principal the way PostgREST would: the database role
-- AND the JWT subject. Nothing else -- in particular no metadata claim -- is
-- ever consulted by any policy in this domain, which ML8 proves.
CREATE OR REPLACE FUNCTION pg_temp.become(_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _user::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  SET LOCAL ROLE authenticated;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.leave() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;


-- ###########################################################################
-- Fixture. Two active employers, one that will be suspended, an invited
-- (never active) member, a candidate with no seat, a governance reader and a
-- platform admin. All SYNTETISK, all on the 7300 prefix, all rolled back.
-- ###########################################################################
INSERT INTO auth.users (id, email) VALUES
  ('73000000-0000-4000-8000-00000000000a', 'ml-employer-a@test.local'),
  ('73000000-0000-4000-8000-00000000000b', 'ml-employer-b@test.local'),
  ('73000000-0000-4000-8000-00000000000c', 'ml-candidate@test.local'),
  ('73000000-0000-4000-8000-00000000000d', 'ml-suspended-owner@test.local'),
  ('73000000-0000-4000-8000-00000000000e', 'ml-invited-member@test.local'),
  ('73000000-0000-4000-8000-00000000000f', 'ml-governance-reviewer@test.local'),
  ('73000000-0000-4000-8000-000000000010', 'ml-platform-admin@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('73000000-0000-4000-8000-0000000000a1', 'SYNTETISK Arbetsgivare A AB', 'ml-employer-a', 'active'),
  ('73000000-0000-4000-8000-0000000000b1', 'SYNTETISK Arbetsgivare B AB', 'ml-employer-b', 'active'),
  ('73000000-0000-4000-8000-0000000000d1', 'SYNTETISK Suspenderad AB',   'ml-suspended',  'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('73000000-0000-4000-8000-00000000000a', '73000000-0000-4000-8000-0000000000a1', 'owner',  'active'),
  ('73000000-0000-4000-8000-00000000000b', '73000000-0000-4000-8000-0000000000b1', 'member', 'active'),
  ('73000000-0000-4000-8000-00000000000d', '73000000-0000-4000-8000-0000000000d1', 'owner',  'active'),
  ('73000000-0000-4000-8000-00000000000e', '73000000-0000-4000-8000-0000000000a1', 'member', 'invited')
ON CONFLICT DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('73000000-0000-4000-8000-00000000000f', 'reviewer')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('73000000-0000-4000-8000-000000000010', 'admin')
ON CONFLICT DO NOTHING;

-- Handles the groups share. GRANTed to authenticated so a policy-scoped read
-- can still find its own fixture ids.
CREATE TEMP TABLE ml (
  trust_method uuid,       -- the CQrity TRUST library row every case pins
  open_pack    uuid,       -- Vaktare v1: openly available pilot content
  pack_a       uuid,       -- a RESTRICTED draft pack version granted to A only
  pack_b       uuid,       -- a RESTRICTED draft pack version granted to B only
  case_a       uuid,       -- A's own case, pinned to TRUST
  case_s       uuid,       -- the soon-to-be-suspended employer's case
  library      integer,    -- how many library methods exist in total
  drafts       integer     -- how many of them are NOT approved
) ON COMMIT DROP;
-- anon too: ML5 must be refused at the FUNCTION or the content table, not at
-- this handle table, or a "permission denied" there would pass for the real
-- refusal.
GRANT SELECT ON ml TO authenticated, anon;

DO $$
DECLARE
  _trust uuid; _open uuid; _role uuid; _pa uuid; _pb uuid; _pv uuid; _case uuid; _case_s uuid;
  _a uuid := '73000000-0000-4000-8000-00000000000a';
  _s uuid := '73000000-0000-4000-8000-00000000000d';
  _emp_a uuid := '73000000-0000-4000-8000-0000000000a1';
  _emp_b uuid := '73000000-0000-4000-8000-0000000000b1';
  _emp_s uuid := '73000000-0000-4000-8000-0000000000d1';
BEGIN
  SELECT m.id INTO _trust FROM public.scp_interview_methods m
   WHERE m.slug = 'cqrity-trust' ORDER BY m.version_number DESC LIMIT 1;
  SELECT v.id INTO _open FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';
  SELECT p.role_id INTO _role FROM public.scp_interview_packs p WHERE p.slug = 'vaktare-se';

  -- Two RESTRICTED draft pack versions: the kind of content only an explicit
  -- grant opens. One granted to A, one granted to B.
  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('ml-restricted-a', _role, 'SYNTETISK begränsat paket A', 'Testfixtur: endast A får se detta.')
  RETURNING id INTO _pa;
  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, locale, role_version_id, source_reference, source_document_version, summary_sv)
  SELECT _pa, 1, 'sv-SE', v.role_version_id, 'SYNTETISK fixtur', 'v0', 'Fixtur A'
    FROM public.scp_interview_pack_versions v WHERE v.id = _open;
  SELECT v.id INTO _pv FROM public.scp_interview_pack_versions v WHERE v.pack_id = _pa;
  UPDATE public.scp_interview_pack_versions SET content_hash = 'ml-fixture-a' WHERE id = _pv;
  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
  VALUES (_emp_a, _pv, 'SYNTETISK kontrollerad kohort A.', 'internal_qa', 'development', current_date + 30);
  UPDATE ml SET pack_a = _pv;
  _pa := _pv;

  INSERT INTO public.scp_interview_packs (slug, role_id, name_sv, purpose_sv)
  VALUES ('ml-restricted-b', _role, 'SYNTETISK begränsat paket B', 'Testfixtur: endast B får se detta.')
  RETURNING id INTO _pb;
  INSERT INTO public.scp_interview_pack_versions
    (pack_id, version_number, locale, role_version_id, source_reference, source_document_version, summary_sv)
  SELECT _pb, 1, 'sv-SE', v.role_version_id, 'SYNTETISK fixtur', 'v0', 'Fixtur B'
    FROM public.scp_interview_pack_versions v WHERE v.id = _open;
  SELECT v.id INTO _pv FROM public.scp_interview_pack_versions v WHERE v.pack_id = _pb;
  UPDATE public.scp_interview_pack_versions SET content_hash = 'ml-fixture-b' WHERE id = _pv;
  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, expires_on)
  VALUES (_emp_b, _pv, 'SYNTETISK kontrollerad kohort B.', 'internal_qa', 'development', current_date + 30);
  _pb := _pv;

  -- A's case, built through the governed RPC exactly as the product builds
  -- one, against the openly available pilot content. Creation pins TRUST.
  PERFORM pg_temp.become(_a);
  _case := public.scp_iv_create_case(_emp_a, 'SYNTETISK intervju A', _open, 'SYNTETISK kandidat', NULL, 'ML-A-1');
  PERFORM pg_temp.leave();

  -- The third employer builds its case while active, and is then suspended:
  -- continuity access to work that exists is what ML7 checks.
  PERFORM pg_temp.become(_s);
  _case_s := public.scp_iv_create_case(_emp_s, 'SYNTETISK intervju S', _open, 'SYNTETISK kandidat', NULL, 'ML-S-1');
  PERFORM pg_temp.leave();
  -- The status guard admits the transition only inside moderation; the suite
  -- marks it the way moderate_employer() does, for this one statement.
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = 'suspended' WHERE id = _emp_s;
  PERFORM set_config('app.employer_moderation_in_progress', 'off', true);

  INSERT INTO ml (trust_method, open_pack, pack_a, pack_b, case_a, case_s, library, drafts)
  VALUES (_trust, _open, _pa, _pb, _case, _case_s,
          (SELECT count(*) FROM public.scp_interview_methods),
          (SELECT count(*) FROM public.scp_interview_methods WHERE approval_state <> 'approved'));
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML0 — the world the boundary is proved against'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.ok(f.library >= 6 AND f.drafts = f.library,
    format('ML0.1 the whole method library is unapproved design content (%s of %s), so the boundary is load-bearing today', f.drafts, f.library));
  PERFORM pg_temp.ok((SELECT c.trust_method_id FROM public.scp_interview_cases c WHERE c.id = f.case_a) = f.trust_method,
    'ML0.2 A''s case pins the TRUST method, as creation guarantees');
  PERFORM pg_temp.ok((SELECT approval_state FROM public.scp_interview_methods WHERE id = f.trust_method) = 'draft',
    'ML0.3 and TRUST is itself a draft: continuity access to a draft is exactly the case-linked category');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_conduct_steps WHERE method_id = f.trust_method) = 6
    AND (SELECT count(*) FROM public.scp_interview_conduct_prohibitions WHERE method_id = f.trust_method) = 8
    AND (SELECT count(*) FROM public.scp_interview_conduct_guidance WHERE method_id = f.trust_method) = 30,
    'ML0.4 TRUST carries six conduct steps, eight prohibitions and thirty guidance rows for the workspace to render');
  PERFORM pg_temp.ok((SELECT status FROM public.employers WHERE id = '73000000-0000-4000-8000-0000000000d1') = 'suspended'
    AND (SELECT status FROM public.employer_memberships WHERE user_id = '73000000-0000-4000-8000-00000000000e') = 'invited',
    'ML0.5 the suspended employer and the invited membership are in place');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML1 — employer A reads its own permitted draft content'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000a');

  -- The draft pack version explicitly granted to A.
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(f.pack_a),
    'ML1.1 the pack read entitlement admits A to the draft version granted to A');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = f.pack_a;
  PERFORM pg_temp.ok(_n = 1, 'ML1.2 and RLS shows A that version row');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000a1') s
                              WHERE s.pack_version_id = f.pack_a AND s.entitlement_basis = 'pilot_grant'),
    'ML1.3 the startable list offers it to A on the pilot-grant basis');

  -- The draft method A's own case pins: readable through the case link.
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_method(f.trust_method),
    'ML1.4 the method read entitlement admits A to the draft method A''s own case pins');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 1, format('ML1.5 A reads exactly the one pinned method row and no other (%s)', _n));
  PERFORM pg_temp.ok((SELECT slug FROM public.scp_interview_methods) = 'cqrity-trust',
    'ML1.6 and it is TRUST');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_steps;
  PERFORM pg_temp.ok(_n = 6, format('ML1.7 A reads the six conduct steps of the pinned method (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_prohibitions;
  PERFORM pg_temp.ok(_n = 8, format('ML1.8 and its eight prohibitions (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 30, format('ML1.9 and its thirty stage-guidance rows (%s)', _n));
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_interview_conduct_guidance g WHERE g.method_id <> f.trust_method),
    'ML1.10 every guidance row A reads belongs to the pinned method');
  PERFORM pg_temp.ok((SELECT s.stage_key FROM public.scp_trust_stage_for_case(f.case_a) s) = 'ready',
    'ML1.11 the case-scoped stage projection still answers A');
  PERFORM pg_temp.ok(public.scp_iv_can_read_case(f.case_a),
    'ML1.12 and A reads its own case');
  PERFORM pg_temp.leave();
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML2 — employer A cannot read employer B''s draft'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(f.pack_b),
    'ML2.1 the pack read entitlement refuses A the draft version granted to B');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = f.pack_b;
  PERFORM pg_temp.ok(_n = 0, 'ML2.2 and RLS shows A nothing of it');
  SELECT count(*) INTO _n FROM public.scp_interview_packs WHERE slug = 'ml-restricted-b';
  PERFORM pg_temp.ok(_n = 0, 'ML2.3 not even the pack identity');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000a1') s
                                  WHERE s.pack_version_id = f.pack_b),
    'ML2.4 and the startable list does not offer it');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_pilot_grants g WHERE g.employer_id = '73000000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.ok(_n = 0, 'ML2.5 B''s grant row is invisible to A');
  -- The library methods A has no case against stay invisible too: a grant
  -- on one pack is not a licence to browse the draft library.
  SELECT count(*) INTO _n FROM public.scp_interview_methods WHERE slug <> 'cqrity-trust';
  PERFORM pg_temp.ok(_n = 0, 'ML2.6 the other draft library methods stay invisible to A');
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.ok(_n = 0, format('ML2.7 and so do their practice statements (%s)', _n));
  PERFORM pg_temp.leave();
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML3 — employer B cannot infer that employer A''s draft exists'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');

  -- A's granted pack: no row, no identity, no grant, no listing, no predicate.
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions WHERE id = f.pack_a;
  PERFORM pg_temp.ok(_n = 0, 'ML3.1 B reads no row for A''s draft version');
  SELECT count(*) INTO _n FROM public.scp_interview_packs WHERE slug = 'ml-restricted-a';
  PERFORM pg_temp.ok(_n = 0, 'ML3.2 nor its pack identity');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_pilot_grants g WHERE g.employer_id <> '73000000-0000-4000-8000-0000000000b1';
  PERFORM pg_temp.ok(_n = 0, 'ML3.3 nor any grant row of another employer');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000b1') s
                                  WHERE s.pack_version_id = f.pack_a),
    'ML3.4 nor an entry for it in B''s startable list');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(f.pack_a),
    'ML3.5 and the pack predicate says no, which is the same answer as the table');

  -- A's case and the draft method it pins: B has no case, so B reads no
  -- method row at all, and cannot learn from the library that anybody has
  -- pinned anything.
  SELECT count(*) INTO _n FROM public.scp_interview_cases WHERE id = f.case_a;
  PERFORM pg_temp.ok(_n = 0, 'ML3.6 B reads no row for A''s case');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(f.trust_method),
    'ML3.7 the method predicate refuses B the draft method that only A''s case pins');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 0, format('ML3.8 B reads zero library methods (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.ok(_n = 0, format('ML3.9 zero practice statements (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_steps;
  PERFORM pg_temp.ok(_n = 0, format('ML3.10 zero conduct steps (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_prohibitions;
  PERFORM pg_temp.ok(_n = 0, format('ML3.11 zero prohibitions (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 0, format('ML3.12 zero guidance rows (%s)', _n));
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_for_case(f.case_a)),
    'ML3.13 the case-scoped stage projection answers B nothing for A''s case');

  -- Openly available pilot content is the owner's decision of 2026-08-28 and
  -- is NOT the finding: B, an active member, still reads it, unchanged.
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(f.open_pack),
    'ML3.14 the openly available pilot pack stays readable to an active member with no grant (unchanged)');
  PERFORM pg_temp.leave();
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML4 — a candidate has a login and no seat, which is not the same'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000c');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(f.trust_method),
    'ML4.1 the method predicate refuses a candidate');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(f.pack_a) AND NOT public.scp_iv_employer_may_read_pack(f.open_pack),
    'ML4.2 and the pack predicate refuses a candidate even for openly available content');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 0, 'ML4.3 a candidate reads zero library methods');
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.ok(_n = 0, 'ML4.4 zero practice statements');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_steps;
  PERFORM pg_temp.ok(_n = 0, 'ML4.5 zero conduct steps');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_prohibitions;
  PERFORM pg_temp.ok(_n = 0, 'ML4.6 zero prohibitions');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 0, 'ML4.7 zero guidance rows');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions;
  PERFORM pg_temp.ok(_n = 0, 'ML4.8 zero pack versions, draft or open');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000a1')),
    'ML4.9 and the startable list for an employer they do not belong to is empty');
  PERFORM pg_temp.leave();
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML5 — anon cannot even ask'; END $$;
-- ###########################################################################
-- anon holds no table grant and no execute grant: a harder refusal than an
-- empty result, and one the Data API returns before any policy is consulted.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_methods',
  'permission denied', 'ML5.1 anon cannot read the method library');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_method_practices',
  'permission denied', 'ML5.2 nor the practice statements');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_conduct_steps',
  'permission denied', 'ML5.3 nor the conduct steps');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_conduct_prohibitions',
  'permission denied', 'ML5.4 nor the prohibitions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_conduct_guidance',
  'permission denied', 'ML5.5 nor the guidance');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_pack_versions',
  'permission denied', 'ML5.6 nor any pack version');
SELECT pg_temp.must_fail('SELECT public.scp_iv_employer_may_read_method((SELECT trust_method FROM ml))',
  'permission denied', 'ML5.7 anon cannot execute the method predicate');
SELECT pg_temp.must_fail('SELECT public.scp_iv_employer_may_read_pack((SELECT open_pack FROM ml))',
  'permission denied', 'ML5.8 nor the pack predicate');
SELECT pg_temp.must_fail('SELECT * FROM public.scp_iv_startable_pack_versions((SELECT case_a FROM ml))',
  'permission denied', 'ML5.9 nor the startable list');
RESET ROLE;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML6 — approved platform content reaches employers only through its approved contract'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer; _peace uuid; _peace_practices integer;
BEGIN
  SELECT * INTO f FROM ml;
  SELECT m.id INTO _peace FROM public.scp_interview_methods m WHERE m.slug = 'peace-recruitment';
  SELECT count(*) INTO _peace_practices FROM public.scp_interview_method_practices p WHERE p.method_id = _peace;
  PERFORM pg_temp.ok(_peace IS NOT NULL AND _peace_practices > 0,
    'ML6.1 the PEACE library method exists with practice statements and no case pins it');

  -- Before approval: invisible to B (no case), whatever its membership.
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(_peace),
    'ML6.2 a draft library method is refused to an active member with no case');
  PERFORM pg_temp.leave();

  -- The governed act: approval. Recorded with the approval columns the table
  -- CHECK requires, as the content roles would record it.
  UPDATE public.scp_interview_methods
     SET approval_state = 'approved', approved_at = now(),
         approved_by = '73000000-0000-4000-8000-00000000000f'
   WHERE id = _peace;

  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_method(_peace),
    'ML6.3 once approved, the same method is admitted to the same member');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 1 AND (SELECT slug FROM public.scp_interview_methods) = 'peace-recruitment',
    'ML6.4 B reads exactly the approved method and still none of the drafts');
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.ok(_n = _peace_practices, format('ML6.5 and exactly its practice statements (%s)', _n));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_steps;
  PERFORM pg_temp.ok(_n = 6, format('ML6.6 and the six conduct steps keyed to it (%s)', _n));
  PERFORM pg_temp.leave();

  -- A candidate is still nobody, approved or not.
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000c');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(_peace),
    'ML6.7 approval opens the method to employer members, not to candidates');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 0, 'ML6.8 and a candidate still reads zero rows');
  PERFORM pg_temp.leave();

  -- Governance readers keep their own contract: every state, every method.
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000f');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = f.library, format('ML6.9 a content reviewer reads the whole library, drafts included (%s of %s)', _n, f.library));
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(f.trust_method),
    'ML6.10 through their own policy -- the employer predicate does not admit them, so it grants nothing extra');
  PERFORM pg_temp.leave();
  PERFORM pg_temp.become('73000000-0000-4000-8000-000000000010');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = f.library, format('ML6.11 a platform admin reads the whole library (%s of %s)', _n, f.library));
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 30 * f.library, format('ML6.12 and every guidance row of every method (%s)', _n));
  PERFORM pg_temp.leave();

  -- Retire it again: retired is not approved, and the door closes.
  UPDATE public.scp_interview_methods
     SET approval_state = 'retired', approved_at = NULL, approved_by = NULL
   WHERE id = _peace;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(_peace),
    'ML6.13 a retired method is refused again: only "approved" is the approved contract');
  PERFORM pg_temp.leave();
  UPDATE public.scp_interview_methods SET approval_state = 'draft' WHERE id = _peace;
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML7 — suspended and pending employer behaviour is unchanged'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;

  -- The suspended employer's owner: continuity access to the case that
  -- exists and the draft method it pins; no new case; empty startable list.
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000d');
  PERFORM pg_temp.ok(public.scp_iv_can_read_case(f.case_s),
    'ML7.1 a suspended employer''s owner still reads the case that exists (continuity, unchanged)');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_method(f.trust_method),
    'ML7.2 and the draft method that case pins -- continuity is not re-gated on employer status');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_steps;
  PERFORM pg_temp.ok(_n = 6, 'ML7.3 so the conduct steps of the pinned method still render for the existing work');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack(f.open_pack),
    'ML7.4 and the pinned open-pilot pack stays readable (unchanged continuity branch)');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', '73000000-0000-4000-8000-0000000000d1', 'SYNTETISK ny', f.open_pack, 'K'),
    'SCP_IV_EMPLOYER_NOT_ACTIVE', 'ML7.5 but starts nothing new (unchanged)');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000d1')),
    'ML7.6 and its startable list is empty (unchanged)');
  PERFORM pg_temp.leave();

  -- An invited membership is not an active one: nothing, on every door.
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000e');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(f.trust_method),
    'ML7.7 an invited (pending) member of employer A is refused the method A''s case pins');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(f.pack_a) AND NOT public.scp_iv_employer_may_read_pack(f.open_pack),
    'ML7.8 and every pack, granted or open');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 0, 'ML7.9 reads zero library methods');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 0, 'ML7.10 and zero guidance rows');
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(f.case_a),
    'ML7.11 and cannot read A''s case (unchanged)');
  PERFORM pg_temp.leave();
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML8 — forged metadata claims grant nothing'; END $$;
-- ###########################################################################
-- A JWT whose user_metadata and app_metadata claim an admin role and a seat
-- at employer A, on a principal who has neither. Authorisation is resolved
-- from user_roles and employer_memberships only, so the claims are inert.
DO $$
DECLARE f ml%ROWTYPE; _n integer;
  _cand uuid := '73000000-0000-4000-8000-00000000000c';
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', _cand::text, 'role', 'authenticated',
    'user_metadata', json_build_object('role', 'admin', 'platform_role', 'superadmin',
                                       'employer_id', '73000000-0000-4000-8000-0000000000a1',
                                       'employer_role', 'owner', 'is_platform_admin', true),
    'app_metadata', json_build_object('role', 'admin', 'employer_id', '73000000-0000-4000-8000-0000000000a1'))::text, true);
  PERFORM set_config('request.jwt.claim.sub', _cand::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.ok(NOT public.is_platform_admin(auth.uid()),
    'ML8.1 a forged admin claim does not make a platform admin');
  PERFORM pg_temp.ok(NOT public.has_employer_role(auth.uid(), '73000000-0000-4000-8000-0000000000a1', NULL),
    'ML8.2 a forged employer claim does not make an employer member');
  PERFORM pg_temp.ok(NOT public.scp_interview_can_read(auth.uid()),
    'ML8.3 nor a governance reader');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_method(f.trust_method),
    'ML8.4 the method predicate refuses the forged principal');
  PERFORM pg_temp.ok(NOT public.scp_iv_employer_may_read_pack(f.pack_a),
    'ML8.5 and so does the pack predicate');
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(f.case_a),
    'ML8.6 and the case authority');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.ok(_n = 0, 'ML8.7 zero library methods');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.ok(_n = 0, 'ML8.8 zero guidance rows');
  SELECT count(*) INTO _n FROM public.scp_interview_pack_versions;
  PERFORM pg_temp.ok(_n = 0, 'ML8.9 zero pack versions');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions('73000000-0000-4000-8000-0000000000a1')),
    'ML8.10 and an empty startable list for the employer the claim names');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  PERFORM set_config('request.jwt.claim.role', NULL, true);

  -- And the predicate's own text consults no claim: the boundary is not a
  -- happy accident of which claims this suite happened to forge.
  PERFORM pg_temp.ok(
    (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method')
      !~* '(raw_user_meta_data|user_metadata|app_metadata|jwt\.claims)',
    'ML8.11 the predicate''s body reads no JWT metadata claim at all');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_policies pol
                 WHERE pol.schemaname = 'public'
                   AND pol.tablename IN ('scp_interview_methods', 'scp_interview_method_practices',
                                         'scp_interview_conduct_steps', 'scp_interview_conduct_prohibitions',
                                         'scp_interview_conduct_guidance', 'scp_interview_pack_versions',
                                         'scp_interview_packs', 'scp_interview_pack_pilot_grants', 'scp_interview_cases')
                   AND (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) ~* '(raw_user_meta_data|user_metadata|app_metadata|jwt\.claims)'),
    'ML8.12 and no policy on the interview content or case tables does either');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML9 — direct table reads and direct RPC calls both fail closed'; END $$;
-- ###########################################################################
DO $$
DECLARE f ml%ROWTYPE;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_method(NULL) = false,
    'ML9.1 a null method answers false, never null');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_method('00000000-0000-4000-8000-000000000000') = false,
    'ML9.2 an unknown method answers false');
  PERFORM pg_temp.ok(public.scp_iv_employer_may_read_pack('00000000-0000-4000-8000-000000000000') = false,
    'ML9.3 an unknown pack version answers false');
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(f.case_a) AND NOT public.scp_iv_can_write_case(f.case_a),
    'ML9.4 the case authorities refuse B for A''s case');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_for_case(f.case_a)),
    'ML9.5 the case-scoped RPC returns no row rather than an error that confirms the case');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', '73000000-0000-4000-8000-0000000000a1', 'SYNTETISK', f.open_pack, 'K'),
    'SCP_IV_NOT_EMPLOYER_MEMBER', 'ML9.6 B cannot create a case inside employer A');
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L)', '73000000-0000-4000-8000-0000000000b1', 'SYNTETISK', f.pack_a, 'K'),
    'SCP_IV_PACK_NOT_USABLE', 'ML9.7 nor pin A''s granted draft to a case of its own');
  PERFORM pg_temp.leave();

  -- With no principal at all -- the shape of a server-side call that forgot
  -- to carry a user -- the predicate is false for every method there is.
  PERFORM pg_temp.ok(
    NOT coalesce((SELECT bool_or(public.scp_iv_employer_may_read_method(m.id)) FROM public.scp_interview_methods m), false),
    'ML9.8 with no auth.uid() the predicate refuses every method in the library');
END $$;

-- The authenticated role holds no write on the conduct tables and no write
-- policy exists on any of the five for a non-editor: a signed-in employer
-- cannot make a draft "approved" by writing to it.
DO $$
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.must_fail(
    $q$UPDATE public.scp_interview_conduct_steps SET label_sv = 'x'$q$,
    'permission denied', 'ML9.9 an employer member cannot write a conduct step');
  PERFORM pg_temp.leave();
END $$;
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000a');
  -- The editor policies exist for content roles; under RLS an employer member
  -- matches none, so the UPDATE touches zero rows and approves nothing.
  UPDATE public.scp_interview_methods SET approval_state = 'approved', approved_at = now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = 0, 'ML9.10 an employer member cannot approve a method by writing to it (0 rows)');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_methods WHERE approval_state = 'approved') = 0,
    'ML9.11 and nothing became approved');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML10 — the SECURITY DEFINER grants match the explicit allowlist'; END $$;
-- ###########################################################################
DO $$
DECLARE _fn oid; _grantees text; _unpinned text;
BEGIN
  SELECT p.oid INTO _fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method';
  PERFORM pg_temp.ok((SELECT p.prosecdef FROM pg_proc p WHERE p.oid = _fn),
    'ML10.1 the method predicate is SECURITY DEFINER (invoker rights would recurse into its own table''s policy)');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c WHERE p.oid = _fn AND c = 'search_path=public'),
    'ML10.2 and pins search_path = public');

  -- The exact executor set, read from the ACL: the owner, authenticated and
  -- service_role. Nothing else, and PUBLIC (grantee 0) in particular not.
  SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ' ORDER BY a.grantee::text)
    INTO _grantees
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = _fn AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
  PERFORM pg_temp.ok(_grantees = 'authenticated, service_role',
    format('ML10.3 its executors are exactly authenticated and service_role (found: %s)', _grantees));
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', _fn, 'EXECUTE'),
    'ML10.4 anon cannot execute it');

  -- The pack predicate and the case authorities carry the same allowlist.
  FOR _fn IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('scp_iv_employer_may_read_pack', 'scp_iv_can_read_case', 'scp_iv_can_write_case',
                         'scp_iv_startable_pack_versions', 'scp_trust_stage_for_case', 'scp_interview_can_read')
  LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ' ORDER BY a.grantee::text)
      INTO _grantees
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = _fn AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF _grantees <> 'authenticated, service_role' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: ML10.5 % is executable by "%", not by exactly authenticated and service_role', _fn::regprocedure, _grantees;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'ML10.5 the pack predicate, the case authorities, the startable list, the stage projection and the governance-reader predicate carry exactly the same executors');

  -- The internal halves stay internal: service_role only.
  FOR _fn IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('scp_iv_open_pilot_available', 'scp_iv_case_start_basis')
  LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ' ORDER BY a.grantee::text)
      INTO _grantees
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = _fn AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF _grantees <> 'service_role' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: ML10.6 internal helper % is executable by "%"', _fn::regprocedure, _grantees;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok(true, 'ML10.6 the internal entitlement halves are executable by service_role only');

  -- Schema-wide: no SECURITY DEFINER function in public is executable by
  -- PUBLIC, and the anon-executable set is exactly the four reviewed names
  -- that supabase/tests/security_hardening_test.sql S3.1 allowlists.
  PERFORM pg_temp.ok(NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public' AND p.prosecdef AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')),
    'ML10.7 no SECURITY DEFINER function in public is executable by PUBLIC');
  PERFORM pg_temp.ok(
    (SELECT coalesce(string_agg(p.proname, ', ' ORDER BY p.proname), '')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'))
    = 'cd_get_shared_report, cd_record_funnel_event, cd_submit_test_feedback, employer_is_active_status',
    'ML10.8 the anon-executable SECURITY DEFINER set is exactly the four reviewed functions');
  SELECT string_agg(p.proname, ', ') INTO _unpinned
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (p.proname LIKE 'scp_iv\_%' OR p.proname LIKE 'scp_interview\_%' OR p.proname LIKE 'scp_trust\_%')
     AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  PERFORM pg_temp.ok(_unpinned IS NULL,
    format('ML10.9 every SECURITY DEFINER function in the interview domain pins search_path (unpinned: %s)', coalesce(_unpinned, 'none')));

  -- And the five policies really route through the predicate, with no bare
  -- membership decision left anywhere on these tables.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policies pol
      WHERE pol.schemaname = 'public'
        AND (pol.tablename, pol.policyname) IN (
          ('scp_interview_methods', 'scp_interview_methods_employer_read'),
          ('scp_interview_method_practices', 'scp_interview_method_practices_employer_read'),
          ('scp_interview_conduct_steps', 'scp_interview_conduct_steps_read'),
          ('scp_interview_conduct_prohibitions', 'scp_interview_conduct_prohibitions_read'),
          ('scp_interview_conduct_guidance', 'scp_interview_conduct_guidance_read'))
        AND pol.qual LIKE '%scp_iv_employer_may_read_method(%'
        AND pol.qual NOT ILIKE '%employer_memberships%') = 5,
    'ML10.10 all five employer read policies decide through the predicate and none on bare membership');
  PERFORM pg_temp.ok(NOT EXISTS (
      SELECT 1 FROM pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename IN ('scp_interview_methods', 'scp_interview_method_practices',
                               'scp_interview_conduct_steps', 'scp_interview_conduct_prohibitions',
                               'scp_interview_conduct_guidance')
         AND (pol.qual = 'true' OR pol.with_check = 'true')),
    'ML10.11 and no policy on the five tables is unconditional');
END $$;


-- ###########################################################################
DO $$ BEGIN RAISE NOTICE 'GROUP ML11 — the suite would NOTICE a weakened policy or grant'; END $$;
-- ###########################################################################
-- A denial suite that stops noticing passes silently forever. Each control
-- below plants the exact defect the suite exists to catch, inside a
-- savepoint, and requires the SAME assertion that passed above to fail now.
-- Then the savepoint is rolled back and the assertion is shown to pass again.

-- Control 1: the original defect, verbatim -- the method policy decides on
-- membership alone.
SAVEPOINT ml_weakened_policy;
ALTER POLICY scp_interview_methods_employer_read ON public.scp_interview_methods
  USING (EXISTS (SELECT 1 FROM public.employer_memberships em
                  WHERE em.user_id = auth.uid() AND em.status = 'active'));
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = f.library,
    format('ML11.1 CONTROL: with the membership-only policy restored, B reads the whole draft library again (%s) -- so ML3.8 detects it', _n));
END $$;
ROLLBACK TO SAVEPOINT ml_weakened_policy;
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _n FROM public.scp_interview_methods;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = 0, 'ML11.2 and after the control is undone, B reads zero again');
END $$;

-- Control 2: the predicate loses its approval check -- a draft counts as
-- approved content for any member.
SAVEPOINT ml_weakened_predicate;
CREATE OR REPLACE FUNCTION public.scp_iv_employer_may_read_method(_method_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.employer_memberships em
                                             WHERE em.user_id = auth.uid() AND em.status = 'active');
$$;
DO $$
DECLARE f ml%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO f FROM ml;
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = 30 * f.library,
    format('ML11.3 CONTROL: with the approval and case checks removed from the predicate, B reads every guidance row (%s) -- so ML3.12 detects it', _n));
END $$;
ROLLBACK TO SAVEPOINT ml_weakened_predicate;
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO _n FROM public.scp_interview_conduct_guidance;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = 0, 'ML11.4 and after the control is undone, zero again');
END $$;

-- Control 3: the grant is widened to anon.
SAVEPOINT ml_weakened_grant;
GRANT EXECUTE ON FUNCTION public.scp_iv_employer_may_read_method(uuid) TO anon;
DO $$
DECLARE _fn oid; _grantees text;
BEGIN
  SELECT p.oid INTO _fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_employer_may_read_method';
  SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ' ORDER BY a.grantee::text)
    INTO _grantees
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = _fn AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
  PERFORM pg_temp.ok(_grantees <> 'authenticated, service_role' AND has_function_privilege('anon', _fn, 'EXECUTE'),
    format('ML11.5 CONTROL: with anon granted, the executor set is "%s" -- so ML10.3 and ML10.4 detect it', _grantees));
END $$;
SET LOCAL ROLE anon;
DO $$
DECLARE _r boolean;
BEGIN
  _r := public.scp_iv_employer_may_read_method((SELECT trust_method FROM ml));
  PERFORM pg_temp.ok(_r = false, 'ML11.6 CONTROL: and anon can now CALL it (it still answers false) -- so ML5.7 detects the grant');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT ml_weakened_grant;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT public.scp_iv_employer_may_read_method((SELECT trust_method FROM ml))',
  'permission denied', 'ML11.7 and after the control is undone, anon cannot call it again');
RESET ROLE;

-- Control 4: a policy is made unconditional.
SAVEPOINT ml_unconditional;
ALTER POLICY scp_interview_method_practices_employer_read ON public.scp_interview_method_practices USING (true);
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n > 0,
    format('ML11.8 CONTROL: with an unconditional practices policy, even a candidate reads them (%s) -- so ML4.4 and ML10.11 detect it', _n));
END $$;
ROLLBACK TO SAVEPOINT ml_unconditional;
DO $$
DECLARE _n integer;
BEGIN
  PERFORM pg_temp.become('73000000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO _n FROM public.scp_interview_method_practices;
  PERFORM pg_temp.leave();
  PERFORM pg_temp.ok(_n = 0, 'ML11.9 and after the control is undone, a candidate reads zero again');
END $$;


DO $$ BEGIN RAISE NOTICE 'Interview-method library tenant-read assertions passed.'; END $$;
ROLLBACK;
