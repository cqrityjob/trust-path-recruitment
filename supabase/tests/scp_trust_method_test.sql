-- CQrity TRUST — the five stages, their gates and their prohibitions.
--
-- Deterministic. No AI is invoked, no network is touched, and every assertion
-- is about the CONTRACT rather than about any model's output.
--
-- The point of this suite is the prohibitions. It is easy to test that a
-- journey works; what matters here is that the things TRUST forbids cannot be
-- done, and that the research claims behind it cannot quietly become stronger
-- than their sources.
--
-- Everything rolls back.

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


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM1 — TRUST is registered, and registered as a hypothesis'; END $$;
-- ===========================================================================

DO $$
DECLARE _m uuid; _n integer; _state text;
BEGIN
  SELECT id, approval_state INTO _m, _state FROM public.scp_interview_methods
   WHERE slug = 'cqrity-trust' AND version_number = 1;
  PERFORM pg_temp.ok(_m IS NOT NULL, 'TM1.1 CQrity TRUST v1 exists as a governed method');
  PERFORM pg_temp.ok(_state = 'draft',
    format('TM1.2 and is DRAFT, not approved (%s) — a migration must not manufacture its own review', _state));

  -- It is one method, not five product modules. PEACE and ORBIT remain
  -- separately attributed SOURCES inside it.
  SELECT count(*) INTO _n FROM public.scp_interview_methods WHERE method_family = 'cqrity_trust';
  PERFORM pg_temp.ok(_n = 1, 'TM1.3 exactly one TRUST method row — TRUST is a synthesis, not a family');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_interview_methods WHERE method_family = 'peace')
    AND EXISTS (SELECT 1 FROM public.scp_interview_methods WHERE method_family = 'orbit'),
    'TM1.4 PEACE and ORBIT survive as independently attributed methods, not folded away');

  -- The forbidden claims are recorded as forbidden.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_interview_methods
             WHERE slug = 'cqrity-trust'
               AND array_to_string(prohibited_interpretations, ' ') ILIKE '%vetenskapligt validerad%'),
    'TM1.5 "TRUST is scientifically validated" is recorded as a prohibited interpretation');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_interview_methods
             WHERE slug = 'cqrity-trust'
               AND array_to_string(prohibited_interpretations, ' ') ILIKE '%förutsäger arbetsprestation%'),
    'TM1.6 and so is "PEACE or ORBIT predicts job performance"');

  PERFORM pg_temp.ok(
    (SELECT intended_context FROM public.scp_interview_methods WHERE slug = 'cqrity-trust')
      ILIKE '%design hypothesis%',
    'TM1.7 the method describes itself as a research-grounded design hypothesis');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM2 — five stages, in order, each with a human gate'; END $$;
-- ===========================================================================

DO $$
DECLARE _n integer; _letters text;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_trust_stages;
  PERFORM pg_temp.ok(_n = 5, format('TM2.1 five stages (%s)', _n));

  SELECT string_agg(letter, '' ORDER BY ordinal) INTO _letters FROM public.scp_trust_stages;
  PERFORM pg_temp.ok(_letters = 'TRUST', format('TM2.2 they spell TRUST in order (%s)', _letters));

  -- Every permitted AI task carries the human gate that follows it.
  SELECT count(*) INTO _n FROM public.scp_trust_stage_ai_tasks
   WHERE btrim(coalesce(human_gate_sv, '')) = '';
  PERFORM pg_temp.ok(_n = 0, 'TM2.3 no permitted AI task exists without a human gate');

  -- And an ungated one cannot be inserted.
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_trust_stage_ai_tasks (stage_id, ai_task_id, human_gate_sv)
    SELECT s.id, t.id, '   ' FROM public.scp_trust_stages s, public.scp_ai_tasks t
     WHERE s.stage_key = 'trace' AND t.task_key = 'evidence_extraction' LIMIT 1$q$),
    'human_gate_sv',
    'TM2.4 an AI task cannot be permitted with a blank human gate');

  -- Every AI task in the product belongs to exactly one stage: an unbound task
  -- is one nobody decided when it may run.
  SELECT count(*) INTO _n FROM public.scp_ai_tasks t
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks a WHERE a.ai_task_id = t.id);
  PERFORM pg_temp.ok(_n = 0, format('TM2.5 every AI task belongs to a TRUST stage (%s unbound)', _n));

  -- The Understand stage permits none.
  SELECT count(*) INTO _n FROM public.scp_trust_stage_ai_tasks a
    JOIN public.scp_trust_stages s ON s.id = a.stage_id WHERE s.stage_key = 'understand';
  PERFORM pg_temp.ok(_n = 0,
    'TM2.6 Understand permits NO AI task — rapport work is the interviewer''s, and an empty allowlist cannot be widened by a prompt');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM3 — the stage a case is in, derived not stored'; END $$;
-- ===========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('77770000-0000-4000-8000-000000000001', 'trust-owner@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('77770000-0000-4000-8000-00000000000a', 'Trust AB', 'trust-ab', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('77770000-0000-4000-8000-000000000001','77770000-0000-4000-8000-00000000000a','owner','active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active';

DO $$
DECLARE
  _packv uuid; _case uuid; _stage text; _plan uuid; _session uuid;
  _owner uuid := '77770000-0000-4000-8000-000000000001';
  _emp uuid := '77770000-0000-4000-8000-00000000000a';
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, starts_on, expires_on)
  VALUES (_emp, _packv, 'TRUST-kontraktstest.', 'synthetic_test', 'development',
          current_date - 1, current_date + 7)
  ON CONFLICT (employer_id, pack_version_id) DO UPDATE
    SET revoked_at = NULL, revocation_reason = NULL, expires_on = current_date + 7;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _case := public.scp_iv_create_case(_emp, 'TRUST-resa', _packv, 'K.', NULL, 'EXT-TRUST');
  RESET ROLE;

  -- The case pins the METHOD, not only the pack.
  PERFORM pg_temp.ok(
    (SELECT trust_method_id FROM public.scp_interview_cases WHERE id = _case) IS NOT NULL,
    'TM3.1 a new case pins the TRUST method version, like the pack content hash');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _stage := public.scp_trust_case_stage(_case);
  RESET ROLE;
  PERFORM pg_temp.ok(_stage = 'ready',
    format('TM3.2 a new case reads as R — Ready (%s); Target happened in the governed pack before it existed', _stage));

  -- Walk the case through and read the stage at each point.
  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases SET status = 'sources_ready' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_generated' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_approved' WHERE id = _case;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'ready',
    'TM3.3 an approved plan is still Ready — the interview has not happened');
  RESET ROLE;

  -- Started through the product's own RPC rather than a raw insert, so the
  -- test exercises the path a recruiter actually takes.
  INSERT INTO public.scp_interview_prep_plans (case_id, status, approved_at, approved_by)
  VALUES (_case, 'approved', now(), _owner) RETURNING id INTO _plan;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _session := public.scp_iv_start_session(_case, 'Testintervjuare');
  PERFORM public.scp_iv_set_session_state(_session, NULL, 'engage_explain', NULL, NULL);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'understand',
    'TM3.4 engage/explain reads as U — Understand');

  PERFORM public.scp_iv_set_session_state(_session, NULL, 'account', NULL, NULL);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'structure',
    'TM3.5 the account phase reads as S — Structure, inside the same case status');
  RESET ROLE;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases SET status = 'interview_complete' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'evidence_review' WHERE id = _case;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'trace',
    'TM3.6 evidence review reads as T — Trace');
  RESET ROLE;

  -- The stage is derived, so there is no second status to disagree with.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'scp_interview_cases'
                   AND column_name IN ('trust_stage', 'trust_stage_key', 'current_stage')),
    'TM3.7 the stage is NOT stored on the case — one status, no drift');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM4 — what TRUST forbids stays forbidden'; END $$;
-- ===========================================================================

DO $$
DECLARE _n integer;
BEGIN
  -- No scoring vocabulary anywhere in the TRUST tables.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name LIKE 'scp_trust%'
     AND column_name ~* 'score|weight|total|rank|threshold|recommend|suitab|fit';
  PERFORM pg_temp.ok(_n = 0,
    format('TM4.1 no TRUST table carries a score, weight, total, threshold, ranking or suitability column (%s)', _n));

  -- Each stage that can produce a conclusion records what may NOT be concluded.
  SELECT count(*) INTO _n FROM public.scp_trust_stages s
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions p WHERE p.stage_id = s.id);
  PERFORM pg_temp.ok(_n = 0, format('TM4.2 every stage records prohibited interpretations (%s without)', _n));

  -- The five named prohibitions from the Evidence Pack are present somewhere.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions
             WHERE statement_sv ILIKE '%totalpoäng%' OR statement_sv ILIKE '%rangordning%'),
    'TM4.3 "no total score or ranking" is recorded as a stage prohibition');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions
             WHERE statement_sv ILIKE '%anställningsrekommendation%'),
    'TM4.4 "no automatic hiring recommendation" is recorded');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions
             WHERE statement_sv ILIKE '%trovärdighetsanalys%' OR statement_sv ILIKE '%emotions%'),
    'TM4.5 "no emotion, voice or credibility analysis" is recorded');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions WHERE statement_sv ILIKE '%Q1-Q8%'),
    'TM4.6 "Q1-Q8 may never be rewritten" is recorded');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_trust_stage_prohibitions
             WHERE statement_sv ILIKE '%ofullständigt svar%'),
    'TM4.7 "a short answer is not low competence or dishonesty" is recorded');

  -- The knowledge graph still creates no weighting or candidate outcome.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_intel_edges'
     AND column_name ~* 'weight|score|strength';
  PERFORM pg_temp.ok(_n = 0, 'TM4.8 the intelligence graph still has no weight or score column');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM5 — research traceability, and its limits'; END $$;
-- ===========================================================================

DO $$
DECLARE _n integer; _strength text;
BEGIN
  -- All eight claim cards, all draft.
  SELECT count(*) INTO _n FROM public.scp_research_claims WHERE slug LIKE 'c-%';
  PERFORM pg_temp.ok(_n = 8, format('TM5.1 the eight Evidence Pack claim cards are registered (%s)', _n));

  SELECT count(*) INTO _n FROM public.scp_research_claims
   WHERE slug LIKE 'c-%' AND status <> 'draft';
  PERFORM pg_temp.ok(_n = 0, format('TM5.2 none was seeded as approved (%s)', _n));

  -- PEACE and ORBIT claims cannot be stronger than their unread sources.
  SELECT evidence_strength INTO _strength FROM public.scp_research_claims WHERE slug = 'c-peace-01';
  PERFORM pg_temp.ok(_strength = 'pending_source_verification',
    format('TM5.3 the PEACE claim is pending, because the source is not fully read (%s)', _strength));
  SELECT evidence_strength INTO _strength FROM public.scp_research_claims WHERE slug = 'c-orbit-01';
  PERFORM pg_temp.ok(_strength = 'pending_source_verification',
    format('TM5.4 and so is the ORBIT claim (%s)', _strength));

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_research_sources
                 WHERE slug IN ('peace-investigative-interviewing','orbit-rapport-based-interviewing')
                   AND access_status = 'verified_read'),
    'TM5.5 neither PEACE nor ORBIT is marked fully read');

  -- Every stage records what LIMITS it, not only what supports it.
  SELECT count(*) INTO _n FROM public.scp_trust_stages s
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_claims c
                      WHERE c.stage_id = s.id AND c.relation = 'limits');
  PERFORM pg_temp.ok(_n = 0,
    format('TM5.6 every stage records a LIMITING claim, not only supporting ones (%s without)', _n));

  -- Who established each access status is recorded, and the owner's
  -- attestation is not disguised as the build's own verification.
  SELECT count(*) INTO _n FROM public.scp_research_sources WHERE access_attested_by IS NULL;
  PERFORM pg_temp.ok(_n = 0, format('TM5.7 every source records WHO established its access status (%s missing)', _n));

  PERFORM pg_temp.ok(
    (SELECT access_attested_by FROM public.scp_research_sources WHERE slug = 'opm-structured-interviews')
      = 'owner_evidence_pack_v1',
    'TM5.8 the OPM read is attributed to the owner''s Evidence Pack, not to this build');

  SELECT count(*) INTO _n FROM public.scp_research_sources
   WHERE access_attested_by = 'independent_reviewer';
  PERFORM pg_temp.ok(_n = 0,
    format('TM5.9 no source claims independent verification, because none has happened (%s)', _n));
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM6 — the boundaries TRUST must not move'; END $$;
-- ===========================================================================

DO $$
DECLARE _n integer;
BEGIN
  -- Career Discovery firewall untouched.
  SELECT count(*) INTO _n
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class f ON f.oid = c.confrelid
   WHERE c.contype = 'f' AND (t.relname LIKE 'scp_trust%' OR t.relname LIKE 'scp_interview%')
     AND f.relname LIKE 'cd\_%';
  PERFORM pg_temp.ok(_n = 0, format('TM6.1 no TRUST or interview table reaches Career Discovery (%s)', _n));

  -- Passport write boundary untouched.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_claims_no_interview_write'),
    'TM6.2 the Passport write guard is still in place');

  -- No TRUST table reaches into Passport claims either.
  SELECT count(*) INTO _n
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class f ON f.oid = c.confrelid
   WHERE c.contype = 'f' AND t.relname LIKE 'scp_trust%' AND f.relname LIKE 'sp\_%';
  PERFORM pg_temp.ok(_n = 0, format('TM6.3 no TRUST table has a foreign key into Passport (%s)', _n));

  -- The research rationale is admin-only: a recruiter sees process support in
  -- plain language, and a candidate sees neither.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_policies
             WHERE tablename = 'scp_trust_stage_claims' AND qual ILIKE '%is_platform_admin%'),
    'TM6.4 stage-to-claim links are platform-admin only — process support is shown, research rationale is not');

  -- AI is still off.
  PERFORM pg_temp.ok(
    (SELECT ai_enabled FROM public.scp_interview_ai_config) = false,
    'TM6.5 AI remains disabled');
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM7 — RLS: candidates and employers cannot read the internal tables'; END $$;
-- ===========================================================================
--
-- Owner review finding 1. The first version granted SELECT to every
-- `authenticated` identity with USING (true), and a candidate is authenticated.
-- The candidate route carried a comment saying it "should not be able to reach
-- that table at all"; the Data API could. A comment is not a policy.

INSERT INTO auth.users (id, email) VALUES
  ('88880000-0000-4000-8000-0000000000c1', 'trust-candidate@test.local'),
  ('88880000-0000-4000-8000-0000000000e1', 'trust-employer@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('88880000-0000-4000-8000-0000000000e1','77770000-0000-4000-8000-00000000000a','member','active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active';

DO $$
DECLARE
  _n integer;
  _cand uuid := '88880000-0000-4000-8000-0000000000c1';
  _emp  uuid := '88880000-0000-4000-8000-0000000000e1';
BEGIN
  -- ---- a candidate, using a real authenticated identity -------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cand::text, true);

  SELECT count(*) INTO _n FROM public.scp_trust_stages;
  PERFORM pg_temp.ok(_n = 0, format('TM7.1 a CANDIDATE reads zero rows from scp_trust_stages (%s)', _n));

  SELECT count(*) INTO _n FROM public.scp_trust_stage_ai_tasks;
  PERFORM pg_temp.ok(_n = 0, format('TM7.2 zero from scp_trust_stage_ai_tasks (%s)', _n));

  SELECT count(*) INTO _n FROM public.scp_trust_stage_prohibitions;
  PERFORM pg_temp.ok(_n = 0, format('TM7.3 zero from scp_trust_stage_prohibitions (%s)', _n));

  SELECT count(*) INTO _n FROM public.scp_trust_stage_claims;
  PERFORM pg_temp.ok(_n = 0, format('TM7.4 zero from scp_trust_stage_claims (%s)', _n));
  RESET ROLE;

  -- ---- an ordinary EMPLOYER member gets nothing directly either ----------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _emp::text, true);
  SELECT count(*) INTO _n FROM public.scp_trust_stages;
  PERFORM pg_temp.ok(_n = 0,
    format('TM7.5 an EMPLOYER also reads zero directly — the projection is the only door (%s)', _n));
  RESET ROLE;

  -- ---- and no policy is permissive any more -------------------------------
  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename LIKE 'scp_trust%' AND qual = 'true';
  PERFORM pg_temp.ok(_n = 0, format('TM7.6 no TRUST policy uses USING (true) (%s)', _n));

  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename LIKE 'scp_trust%' AND qual NOT ILIKE '%is_platform_admin%';
  PERFORM pg_temp.ok(_n = 0,
    format('TM7.7 every TRUST policy is platform-admin scoped (%s not)', _n));

  -- ---- anon gets nothing, and holds no grant ------------------------------
  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_name LIKE 'scp_trust%';
  PERFORM pg_temp.ok(_n = 0, format('TM7.8 anon holds no grant on any TRUST table (%s)', _n));
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM8 — the employer projection returns the safe fields only'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _case uuid; _r record; _cols text;
  _owner uuid := '77770000-0000-4000-8000-000000000001';
  _cand uuid := '88880000-0000-4000-8000-0000000000c1';
BEGIN
  SELECT id INTO _case FROM public.scp_interview_cases
   WHERE employer_id = '77770000-0000-4000-8000-00000000000a' ORDER BY created_at LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT * INTO _r FROM public.scp_trust_stage_for_case(_case);
  RESET ROLE;

  PERFORM pg_temp.ok(_r.stage_key IS NOT NULL,
    'TM8.1 an employer who can read the case gets the stage through the projection');
  PERFORM pg_temp.ok(_r.name_sv IS NOT NULL AND _r.purpose_sv IS NOT NULL,
    'TM8.2 it carries the plain-language name and purpose the banner needs');
  PERFORM pg_temp.ok(_r.method_version IS NOT NULL,
    'TM8.3 and the pinned method version');

  -- methodological_basis is ABSENT FROM THE RETURN TYPE, not filtered by the
  -- caller. No future caller can select it by accident.
  SELECT string_agg(p.attname, ',') INTO _cols
    FROM pg_proc f
    JOIN unnest(f.proallargtypes, f.proargnames) AS p(atttypid, attname) ON true
   WHERE f.oid = 'public.scp_trust_stage_for_case(uuid)'::regprocedure;
  PERFORM pg_temp.ok(_cols NOT ILIKE '%methodological%',
    'TM8.4 methodological_basis is not in the projection''s return type at all');
  PERFORM pg_temp.ok(_cols NOT ILIKE '%claim%',
    'TM8.5 nor is any claim link');

  -- A candidate cannot read the case, so the projection returns nothing.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _cand::text, true);
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_trust_stage_for_case(_case)),
    'TM8.6 a candidate gets nothing from the projection either — same answer as the table');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM9 — stage/task permission enforced at EXECUTION'; END $$;
-- ===========================================================================
--
-- Owner review finding 2. TM2.6 proved the Understand stage has no rows in the
-- binding table. It did not prove the product refuses to run there, because
-- scp_iv_ai_run_start never consulted the table. This group attempts every
-- active task in Understand and checks the database refuses each one.

DO $$
DECLARE
  _case uuid; _plan uuid; _session uuid; _task text;
  _runs_before integer; _runs_after integer;
  _events_before integer; _events_after integer;
  _attempted integer := 0; _refused integer := 0;
  _owner uuid := '77770000-0000-4000-8000-000000000001';
BEGIN
  -- A case of its own. TM3 walked its case to the end of the journey, and this
  -- group needs one sitting in Understand.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _case := public.scp_iv_create_case(
    '77770000-0000-4000-8000-00000000000a', 'TRUST-stage-test',
    (SELECT ver.id FROM public.scp_interview_pack_versions ver
       JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se'),
    'K.', NULL, 'EXT-STAGE');
  RESET ROLE;

  INSERT INTO public.scp_interview_prep_plans (case_id, status, approved_at, approved_by)
  VALUES (_case, 'approved', now(), _owner) RETURNING id INTO _plan;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases SET status = 'sources_ready' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_generated' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_approved' WHERE id = _case;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);
  -- scp_iv_start_session makes the move to interview_in_progress itself, and
  -- refuses to start from anything but an approved plan.

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _session := public.scp_iv_start_session(_case, 'Testintervjuare');
  PERFORM public.scp_iv_set_session_state(_session, NULL, 'engage_explain', NULL, NULL);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'understand',
    'TM9.1 the case is in U — Understand');
  RESET ROLE;

  SELECT count(*) INTO _runs_before FROM public.scp_interview_ai_runs WHERE case_id = _case;
  SELECT count(*) INTO _events_before FROM public.scp_interview_case_events WHERE case_id = _case;

  -- EVERY active task, one at a time.
  FOR _task IN SELECT task_key FROM public.scp_ai_tasks WHERE activation_status = 'active' ORDER BY 1
  LOOP
    _attempted := _attempted + 1;
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
      PERFORM public.scp_iv_ai_run_start(_case, _task, 'deterministic', 'test');
      RESET ROLE;
      RAISE EXCEPTION
        'ASSERTION FAILED: TM9.2 task "%" STARTED in the Understand stage', _task;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%SCP_TRUST_TASK_WRONG_STAGE%'
         AND SQLERRM NOT LIKE '%SCP_TRUST_TASK_UNBOUND%' THEN
        RAISE EXCEPTION 'ASSERTION FAILED: TM9.2 task "%" refused for the wrong reason: %',
          _task, SQLERRM;
      END IF;
      _refused := _refused + 1;
    END;
  END LOOP;

  PERFORM pg_temp.ok(_attempted > 0 AND _refused = _attempted,
    format('TM9.2 EVERY active AI task (%s of %s) is refused in Understand — proved at execution, not in a table',
           _refused, _attempted));

  -- A refused attempt leaves nothing behind.
  SELECT count(*) INTO _runs_after FROM public.scp_interview_ai_runs WHERE case_id = _case;
  SELECT count(*) INTO _events_after FROM public.scp_interview_case_events WHERE case_id = _case;
  PERFORM pg_temp.ok(_runs_after = _runs_before,
    format('TM9.3 no run row was created by any refused attempt (%s -> %s)', _runs_before, _runs_after));
  PERFORM pg_temp.ok(_events_after = _events_before,
    format('TM9.4 and no ledger event (%s -> %s)', _events_before, _events_after));

  -- The SAME task succeeds in the stage that permits it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_set_session_state(_session, NULL, 'account', NULL, NULL);
  PERFORM pg_temp.ok(public.scp_trust_case_stage(_case) = 'structure',
    'TM9.5 moving to the account phase puts the case in S — Structure');

  PERFORM public.scp_iv_ai_run_start(_case, 'evidence_extraction', 'deterministic', 'test');
  PERFORM pg_temp.ok(true,
    'TM9.6 evidence_extraction, refused a moment ago, now runs — the gate is the STAGE, not the task');

  -- And a task belonging to a different stage is still refused here.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L)',
           _case, 'role_requirement_extraction', 'deterministic', 'test'),
    'SCP_TRUST_TASK_WRONG_STAGE',
    'TM9.7 a task belonging to Target is refused in Structure, and the error names where it does belong');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP TM10 — a v1 case stays v1 after v2 exists'; END $$;
-- ===========================================================================
--
-- Owner review finding 3. A single-column UNIQUE(slug) made a second version
-- impossible to insert, so "pinning" could never be tested. It is gone.

DO $$
DECLARE
  _v1 uuid; _v2 uuid; _v1_case uuid; _v2_case uuid; _packv uuid;
  _stage record; _n integer;
  _owner uuid := '77770000-0000-4000-8000-000000000001';
  _emp uuid := '77770000-0000-4000-8000-00000000000a';
BEGIN
  SELECT id INTO _v1 FROM public.scp_interview_methods
   WHERE slug = 'cqrity-trust' AND version_number = 1;
  -- The case TM9 left in Structure, so the execution half of this group is
  -- exercised in a stage where v1 and v2 genuinely differ.
  SELECT id INTO _v1_case FROM public.scp_interview_cases
   WHERE employer_id = _emp AND title = 'TRUST-stage-test' LIMIT 1;

  PERFORM pg_temp.ok(
    (SELECT trust_method_id FROM public.scp_interview_cases WHERE id = _v1_case) = _v1,
    'TM10.1 the existing case is pinned to TRUST v1');

  -- ---- a v2 fixture, which the old schema could not even hold -------------
  INSERT INTO public.scp_interview_methods
    (slug, version_number, name, method_family, purpose, intended_context,
     supported_behaviours, prohibited_interpretations, product_implementation, approval_state)
  VALUES ('cqrity-trust', 2, 'CQrity TRUST Interview Method', 'cqrity_trust',
          'v2-fixture.', 'v2-fixture. Research-grounded design hypothesis.',
          ARRAY['v2'], ARRAY['v2 är inte vetenskapligt validerad'], 'v2-fixture', 'draft')
  RETURNING id INTO _v2;
  PERFORM pg_temp.ok(_v2 IS NOT NULL,
    'TM10.2 a SECOND method version can now be inserted — UNIQUE(slug) made this impossible before');

  -- v2 gets its own stages, deliberately differing: it permits NOTHING in
  -- Structure, so "which version governs" is observable rather than academic.
  INSERT INTO public.scp_trust_stages
    (method_id, stage_key, ordinal, letter, name_sv, name_en, purpose_sv, purpose_en,
     methodological_basis, human_responsibility_sv, output_sv)
  SELECT _v2, s.stage_key, s.ordinal, s.letter, s.name_sv || ' (v2)', s.name_en,
         s.purpose_sv, s.purpose_en, s.methodological_basis, s.human_responsibility_sv, s.output_sv
    FROM public.scp_trust_stages s WHERE s.method_id = _v1;

  -- v2 binds evidence_extraction to Trace instead of Structure.
  INSERT INTO public.scp_trust_stage_ai_tasks (stage_id, ai_task_id, human_gate_sv)
  SELECT s2.id, t.id, 'v2-gate'
    FROM public.scp_trust_stages s2, public.scp_ai_tasks t
   WHERE s2.method_id = _v2 AND s2.stage_key = 'trace' AND t.task_key = 'evidence_extraction';

  -- ---- the v1 case still renders and executes under v1 --------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT * INTO _stage FROM public.scp_trust_stage_for_case(_v1_case);
  RESET ROLE;

  PERFORM pg_temp.ok(_stage.method_version = 1,
    format('TM10.3 the v1 case still RENDERS as v1 after v2 exists (%s)', _stage.method_version));
  PERFORM pg_temp.ok(_stage.name_sv NOT LIKE '%(v2)%',
    format('TM10.4 and shows v1''s stage definition, not v2''s (%s)', _stage.name_sv));

  -- Executes under v1 too: evidence_extraction is a Structure task in v1 and a
  -- Trace task in v2, and the v1 case is in Structure.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_ai_run_start(_v1_case, 'evidence_extraction', 'deterministic', 'test');
  RESET ROLE;
  PERFORM pg_temp.ok(true,
    'TM10.5 and EXECUTES under v1''s bindings — the same task would be wrong-stage under v2');

  -- ---- the pin cannot be moved --------------------------------------------
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_cases SET trust_method_id = %L WHERE id = %L', _v2, _v1_case),
    'SCP_TRUST_PIN_IMMUTABLE',
    'TM10.6 the pinned method cannot be moved to v2 — that would rewrite what the interview was');

  -- ---- a NEW case pins v2, deliberately, under the internal-QA rule -------
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _v2_case := public.scp_iv_create_case(_emp, 'v2-fall', _packv, 'K.', NULL, 'EXT-V2');
  RESET ROLE;

  PERFORM pg_temp.ok(
    (SELECT trust_method_id FROM public.scp_interview_cases WHERE id = _v2_case) = _v2,
    'TM10.7 a NEW case pins v2 — the newest eligible version, chosen by rule');

  PERFORM pg_temp.ok(
    (SELECT trust_method_id FROM public.scp_interview_cases WHERE id = _v1_case) = _v1,
    'TM10.8 while the old case is untouched by that — two cases, two methods, at once');

  -- ---- the eligibility rule is a rule, not "the highest number" -----------
  PERFORM pg_temp.must_fail(
    'SELECT public.scp_trust_eligible_method(''production'')',
    'SCP_TRUST_NO_APPROVED_METHOD',
    'TM10.9 production use fails closed — no TRUST version is approved, and newest is not governed');

  PERFORM pg_temp.must_fail(
    'SELECT public.scp_trust_eligible_method(''whatever'')',
    'SCP_TRUST_UNKNOWN_USAGE_MODE',
    'TM10.10 an unrecognised usage mode is refused rather than assumed');

  -- Retiring v2 falls back to v1 rather than to nothing.
  UPDATE public.scp_interview_methods SET approval_state = 'retired' WHERE id = _v2;
  PERFORM pg_temp.ok(public.scp_trust_eligible_method('internal_qa') = _v1,
    'TM10.11 retiring v2 falls back to v1 — retirement actually withdraws a version');

  -- The redundant stored version is gone, so nothing can disagree.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_name = 'scp_interview_cases' AND column_name = 'trust_method_version';
  PERFORM pg_temp.ok(_n = 0,
    'TM10.12 the version is derived from the pinned row, not stored a second time');
END $$;

DO $$ BEGIN RAISE NOTICE 'TRUST METHOD SUITE COMPLETE'; END $$;
ROLLBACK;
