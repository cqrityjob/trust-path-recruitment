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

DO $$ BEGIN RAISE NOTICE 'TRUST METHOD SUITE COMPLETE'; END $$;
ROLLBACK;
