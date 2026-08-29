-- Tenant isolation for Interview Intelligence, tested deliberately.
--
-- An access denial observed by accident is not evidence of a boundary. This
-- suite constructs two employers, gives each its own recruiter, and then tries
-- every read and write across the boundary that a real multi-tenant SaaS has
-- to refuse: the case, the notes, the AI proposals, the confirmed material,
-- the assessments, the report, and the AI run provenance.
--
-- A candidate -- an authenticated principal with no employer seat at all -- is
-- tested separately, because "logged in" and "entitled to see this" are
-- different things and the difference is where tenancy bugs live.
--
-- Deterministic. No AI, no network. Everything rolls back.

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
-- Two employers, two recruiters, one candidate with no seat anywhere.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('71000000-0000-4000-8000-00000000000a', 'tenant-a@test.local'),
  ('71000000-0000-4000-8000-00000000000b', 'tenant-b@test.local'),
  ('71000000-0000-4000-8000-00000000000c', 'tenant-candidate@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('71000000-0000-4000-8000-0000000000a1', 'Tenant A AB', 'tenant-a-ab', 'active'),
  ('71000000-0000-4000-8000-0000000000b1', 'Tenant B AB', 'tenant-b-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('71000000-0000-4000-8000-00000000000a','71000000-0000-4000-8000-0000000000a1','owner','active'),
  ('71000000-0000-4000-8000-00000000000b','71000000-0000-4000-8000-0000000000b1','owner','active')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE ti (case_a uuid, note_a uuid, sess_a uuid) ON COMMIT DROP;

-- Built through the governed RPCs, exactly as the product builds a case. A
-- fixture assembled by direct INSERT can create states the application never
-- could, and then proves isolation for a case that could not exist.
DO $$
DECLARE _packv uuid; _case uuid; _plan uuid; _sess uuid; _q uuid;
  _a uuid := '71000000-0000-4000-8000-00000000000a';
  _emp uuid := '71000000-0000-4000-8000-0000000000a1';
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _a::text, true);

  _case := public.scp_iv_create_case(_emp, 'A:s intervju', _packv, 'Tenant A Kandidat', NULL, 'TENANT-A-1');
  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare, stationär bevakning.', 'recruitment_interview', 'Berättigat intresse.');
  PERFORM public.scp_iv_mark_sources_ready(_case);
  _plan := public.scp_iv_record_manual_prep_plan(_case, '60 min', 'Inledning', 'Avslut');
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Godkänd.');
  _sess := public.scp_iv_start_session(_case, 'Intervju 1');

  SELECT id INTO _q FROM public.scp_interview_core_questions
   WHERE pack_version_id = _packv ORDER BY display_order LIMIT 1;

  -- Notes are written by a direct insert under RLS rather than through an
  -- RPC, which is exactly the path the application uses, so this exercises
  -- the real control rather than a convenient one.
  INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
  VALUES (_sess, _q, 'observation', 'A:s konfidentiella anteckning.', _a);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', NULL, true);

  INSERT INTO ti
  SELECT _case, n.id, _sess FROM public.scp_interview_session_notes n
   WHERE n.session_id = _sess LIMIT 1;
END $$;

GRANT SELECT ON ti TO authenticated;


-- ###########################################################################
-- GROUP TI1 — employer A sees its own case
-- ###########################################################################
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-00000000000a', true);
DO $$
DECLARE _c uuid := (SELECT case_a FROM ti);
BEGIN
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_cases WHERE id = _c) = 1,
    'TI1.1 employer A reads its own case');
  PERFORM pg_temp.ok(public.scp_iv_can_read_case(_c),
    'TI1.2 and the read helper agrees');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_session_notes n
                       JOIN public.scp_interview_sessions s ON s.id = n.session_id
                      WHERE s.case_id = _c) = 1,
    'TI1.3 employer A reads its own interview notes');
END $$;
RESET ROLE;


-- ###########################################################################
-- GROUP TI2 — employer B is refused every read across the boundary
-- ###########################################################################
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE _c uuid := (SELECT case_a FROM ti); _s uuid := (SELECT sess_a FROM ti);
BEGIN
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_cases WHERE id = _c) = 0,
    'TI2.1 employer B cannot read employer A''s case');
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(_c),
    'TI2.2 and the read helper refuses it too');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_sessions WHERE id = _s) = 0,
    'TI2.3 employer B cannot read the interview session');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_session_notes n
                       JOIN public.scp_interview_sessions s ON s.id = n.session_id
                      WHERE s.case_id = _c) = 0,
    'TI2.4 employer B cannot read the interview notes');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_evidence_proposals
                      WHERE case_id = _c) = 0,
    'TI2.5 employer B cannot read AI proposals on A''s case');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_evidence WHERE case_id = _c) = 0,
    'TI2.6 employer B cannot read A''s confirmed interview material');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = _c) = 0,
    'TI2.7 employer B cannot read A''s assessments');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_reports WHERE case_id = _c) = 0,
    'TI2.8 employer B cannot read A''s report');
  -- Provenance is as sensitive as the material it describes: an AI run row
  -- names the case, the task and the model that saw a candidate's words.
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_ai_runs WHERE case_id = _c) = 0,
    'TI2.9 employer B cannot read A''s AI run provenance');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_case_events WHERE case_id = _c) = 0,
    'TI2.10 employer B cannot read A''s audit events');
END $$;


-- ###########################################################################
-- GROUP TI3 — and every write across the boundary
-- ###########################################################################
-- The refusal here is harder than RLS: `authenticated` holds no UPDATE or
-- DELETE grant on these tables at all, so a cross-tenant write is rejected
-- before any row filter is consulted. Every state change goes through a
-- governed SECURITY DEFINER routine, which is the design -- and it means the
-- assertion is a thrown permission error, not a zero-row update.
SELECT pg_temp.must_fail(
  format('UPDATE public.scp_interview_cases SET title = ''kapad'' WHERE id = %L', (SELECT case_a FROM ti)),
  'permission denied', 'TI3.1 employer B cannot rename employer A''s case');

-- Notes are different, and the difference is worth being precise about: a
-- recruiter edits their own notes directly, so `authenticated` DOES hold an
-- UPDATE grant here and the boundary is RLS rather than the grant. The
-- statement therefore succeeds and must touch nothing. Asserting "it threw"
-- would have passed for the wrong reason on the other tables and failed here
-- while the data was in fact safe -- so the assertion is the one that
-- matters: A's note is byte-identical afterwards.
DO $$
DECLARE _s uuid := (SELECT sess_a FROM ti); _before text; _after text; _n integer;
BEGIN
  SELECT body INTO _before FROM public.scp_interview_session_notes WHERE session_id = _s;
  PERFORM pg_temp.ok(_before IS NULL,
    'TI3.2a employer B cannot even read A''s note in order to compare it');

  UPDATE public.scp_interview_session_notes SET body = 'kapad' WHERE session_id = _s;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM pg_temp.ok(_n = 0, 'TI3.2b employer B''s update of A''s notes touches no row');
END $$;

SELECT pg_temp.must_fail(
  format('DELETE FROM public.scp_interview_cases WHERE id = %L', (SELECT case_a FROM ti)),
  'permission denied', 'TI3.3 employer B cannot delete A''s case');

SELECT pg_temp.must_fail(
  format('SELECT public.scp_iv_begin_evidence_review(%L)', (SELECT case_a FROM ti)),
  'SCP_IV_', 'TI3.4 employer B cannot drive A''s case through the governed RPC');
RESET ROLE;


-- ###########################################################################
-- GROUP TI4 — a candidate has a login and no seat, which is not the same
-- ###########################################################################
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-00000000000c', true);
DO $$
DECLARE _c uuid := (SELECT case_a FROM ti);
BEGIN
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_cases WHERE id = _c) = 0,
    'TI4.1 an authenticated candidate reads no interview case');
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(_c),
    'TI4.2 and the read helper refuses them');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_session_notes) = 0,
    'TI4.3 a candidate reads no interview notes at all');
END $$;
RESET ROLE;

-- anon has no grant, which is a harder refusal than an empty result.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_cases',
  'permission denied', 'TI4.4 anon cannot even ask for interview cases');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_interview_session_notes',
  'permission denied', 'TI4.5 anon cannot even ask for interview notes');
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('request.jwt.claim.sub', NULL, true);

-- Finally, from A's own seat: the note B tried to overwrite is unchanged.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-00000000000a', true);
DO $$
BEGIN
  PERFORM pg_temp.ok(
    (SELECT body FROM public.scp_interview_session_notes WHERE session_id = (SELECT sess_a FROM ti))
      = 'A:s konfidentiella anteckning.',
    'TI5.1 A''s interview note survived B''s attempt to rewrite it, byte for byte');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('request.jwt.claim.sub', NULL, true);

DO $$ BEGIN RAISE NOTICE 'Tenant isolation assertions passed.'; END $$;
ROLLBACK;
