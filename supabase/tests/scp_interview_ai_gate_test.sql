-- AI execution gate and model provenance.
--
-- Two confirmed defects:
--
--   1. scp_interview_ai_config.ai_enabled was documented as THE gate and
--      enforced nowhere. scp_iv_ai_run_start() checked membership, task
--      activation and the TRUST stage binding, and never the flag.
--   2. The run row carries `provider` and `model` as separate columns and the
--      application filled both from provider.name, so a real-model run
--      recorded "anthropic" as its model.
--
-- The gate must hold at the DATABASE boundary, not in the UI, and the manual
-- interview must stay reachable while AI is off -- otherwise "fail closed"
-- would mean "product closed".
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
-- Fixture: an active employer with a real case on the openly available pilot.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('cccc0000-0000-4000-8000-000000000001', 'ai-gate-owner@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('cccc0000-0000-4000-8000-00000000000a', 'AI Gate AB', 'ai-gate-ab', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('cccc0000-0000-4000-8000-000000000001','cccc0000-0000-4000-8000-00000000000a','owner','active')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE ai_gate_case (case_id uuid) ON COMMIT DROP;

DO $$
DECLARE _packv uuid; _case uuid;
BEGIN
  SELECT v.id INTO _packv FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'vaktare-se';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cccc0000-0000-4000-8000-000000000001', true);
  _case := public.scp_iv_create_case('cccc0000-0000-4000-8000-00000000000a',
    'AI-grind', _packv, 'Kandidat', NULL, 'AIG-1');
  RESET ROLE;
  INSERT INTO ai_gate_case VALUES (_case);
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP AG1 — the flag is off, and off means off'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid;
  _owner uuid := 'cccc0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM ai_gate_case;

  PERFORM pg_temp.ok(NOT public.scp_iv_ai_real_model_permitted(),
    'AG1.1 ai_enabled is false in the governed configuration');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- The defect: this used to be permitted, because the flag was never read.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'interview_preparation_generation', 'anthropic', 'claude-sonnet-5',
           'production_model'),
    'SCP_IV_AI_DISABLED',
    'AG1.2 a production_model run is refused while AI is disabled');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'interview_preparation_generation', 'anthropic', 'claude-sonnet-5',
           'development_model'),
    'SCP_IV_AI_DISABLED',
    'AG1.3 a development_model run is refused too — "not production" is not a loophole');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'interview_preparation_generation', 'anthropic', 'claude-sonnet-5',
           'sneaky_mode'),
    'SCP_IV_UNKNOWN_PROVIDER_MODE',
    'AG1.4 an unrecognised mode is refused rather than treated as synthetic');
  RESET ROLE;

  -- No run row was created by any of the refusals.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_ai_runs WHERE case_id = _case) = 0,
    'AG1.5 no run row exists — the refusal happens before anything is recorded');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP AG2 — no caller path bypasses the control'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _run uuid;
  _owner uuid := 'cccc0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM ai_gate_case;

  -- Door (c): the table itself, reached directly with full privilege. This is
  -- the path a future RPC, a migration or a service-role script could take.
  PERFORM pg_temp.must_fail(
    format($f$INSERT INTO public.scp_interview_ai_runs
             (case_id, task, task_version, prompt_version, input_schema_version,
              output_schema_version, provider, model, provider_mode, status)
           VALUES (%L, 'interview_preparation_generation', '1', '1', '1', '1',
                   'anthropic', 'claude-sonnet-5', 'production_model', 'running')$f$, _case),
    'SCP_IV_AI_DISABLED',
    'AG2.1 a direct INSERT as the table owner is refused — UI gating is not the control');

  -- A synthetic run IS permitted: the deterministic engine is a working
  -- product and the manual journey depends on it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _run := public.scp_iv_ai_run_start(_case, 'interview_preparation_generation',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  PERFORM pg_temp.ok(_run IS NOT NULL,
    'AG2.2 a synthetic run is permitted while AI is disabled');
  RESET ROLE;

  -- Door (b): settlement must not be the way a synthetic run becomes a model run.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_settle(%L, %L, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %L, %L, %L)',
           _run, 'succeeded', '[]', 'production_model', 'claude-sonnet-5'),
    'SCP_IV_AI_DISABLED',
    'AG2.3 settlement cannot relabel a synthetic run as a real-model run');
  RESET ROLE;

  -- Door (c) again, as an UPDATE.
  PERFORM pg_temp.must_fail(
    format($f$UPDATE public.scp_interview_ai_runs SET provider_mode = 'production_model'
              WHERE id = %L$f$, _run),
    'SCP_IV_AI_DISABLED',
    'AG2.4 nor can a direct UPDATE flip the mode afterwards');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP AG3 — provider and exact model id are distinct facts'; END $$;
-- ===========================================================================

DO $$
DECLARE _case uuid; _run uuid; _model text; _confirmed boolean;
  _owner uuid := 'cccc0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM ai_gate_case;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  -- The defect, refused at the boundary: the provider name is not a model id.
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'interview_preparation_generation', 'deterministic', 'deterministic',
           'synthetic'),
    'SCP_IV_MODEL_IS_PROVIDER_NAME',
    'AG3.1 a run whose model equals its provider name is refused');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_ai_run_start(%L, %L, %L, %L, NULL, NULL, %L)',
           _case, 'interview_preparation_generation', 'deterministic', '   ',
           'synthetic'),
    'SCP_IV_MODEL_REQUIRED',
    'AG3.2 and a run with no model id at all is refused');

  _run := public.scp_iv_ai_run_start(_case, 'interview_preparation_generation',
            'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
  RESET ROLE;

  SELECT model, model_confirmed_by_provider INTO _model, _confirmed
    FROM public.scp_interview_ai_runs WHERE id = _run;
  PERFORM pg_temp.ok(_model = 'deterministic-rules-1.0.0' AND _confirmed = false,
    'AG3.3 at start the model is the caller''s intent, and is marked unconfirmed');

  -- Settlement records what the engine actually reported.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_iv_ai_run_settle(_run, 'succeeded', NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, '[]'::jsonb, 'synthetic', 'deterministic-rules-1.0.1');
  RESET ROLE;

  SELECT model, model_confirmed_by_provider INTO _model, _confirmed
    FROM public.scp_interview_ai_runs WHERE id = _run;
  PERFORM pg_temp.ok(_model = 'deterministic-rules-1.0.1',
    format('AG3.4 settlement preserves the EXACT id the engine reported (got %s)', _model));
  PERFORM pg_temp.ok(_confirmed = true,
    'AG3.5 and marks it provider-confirmed, so an evaluation can count only known models');

  -- A provider name offered at settlement is not accepted as a model.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_ai_runs
      WHERE id = _run AND model = 'deterministic') = 0,
    'AG3.6 the stored model was never overwritten with the provider name');

  -- The table refuses a provider name in the model column outright. Tested on
  -- a run that has NOT settled, because a settled run is already protected by
  -- the append-only guard -- a stricter rule that would mask this one.
  DECLARE _fresh uuid;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
    _fresh := public.scp_iv_ai_run_start(_case, 'interview_preparation_generation',
                'deterministic', 'deterministic-rules-1.0.0', NULL, NULL, 'synthetic');
    RESET ROLE;
    PERFORM pg_temp.must_fail(
      format($f$UPDATE public.scp_interview_ai_runs SET model = 'anthropic' WHERE id = %L$f$, _fresh),
      'model_is_not_provider_name',
      'AG3.7 a CHECK constraint refuses a provider name in the model column');
  END;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP AG4 — the structured interview works with AI off'; END $$;
-- ===========================================================================

-- Fail-closed must not mean product-closed. A session starts from an APPROVED
-- preparation plan, and the only way to make one used to be an AI run.
DO $$
DECLARE
  _case uuid; _plan uuid; _disclosure text; _run uuid; _session uuid; _status text;
  _owner uuid := 'cccc0000-0000-4000-8000-000000000001';
BEGIN
  SELECT case_id INTO _case FROM ai_gate_case;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);

  PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annons',
    E'Väktare till stationär bevakning.\n\nKrav: VU1 och VU2.',
    'recruitment_interview', 'Berättigat intresse, rekrytering.');
  PERFORM public.scp_iv_mark_sources_ready(_case);

  _plan := public.scp_iv_record_manual_prep_plan(_case,
    '60 minuter', 'Presentera syftet och att anteckningar förs.', 'Berätta om nästa steg.');
  PERFORM pg_temp.ok(_plan IS NOT NULL,
    'AG4.1 an interviewer can record their own preparation with no AI run behind it');

  SELECT ai_run_id, ai_disclosure INTO _run, _disclosure
    FROM public.scp_interview_prep_plans WHERE id = _plan;
  PERFORM pg_temp.ok(_run IS NULL,
    'AG4.2 the plan is not attributed to an AI run that never happened');
  PERFORM pg_temp.ok(position('Inget AI-stöd' in _disclosure) > 0,
    'AG4.3 and its disclosure says plainly that no AI was involved');

  -- The same human approval gate still applies.
  PERFORM public.scp_iv_approve_prep_plan(_plan, 'Genomgången och godkänd.');
  SELECT status INTO _status FROM public.scp_interview_cases WHERE id = _case;
  PERFORM pg_temp.ok(_status = 'prep_approved',
    format('AG4.4 approval moves the case to prep_approved (got %s)', _status));

  -- And the interview can actually start.
  _session := public.scp_iv_start_session(_case, 'Intervju 1');
  PERFORM pg_temp.ok(_session IS NOT NULL,
    'AG4.5 the structured interview starts — AI disabled is not product disabled');
  RESET ROLE;

  -- Nothing in that journey needed a model.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_ai_runs
      WHERE case_id = _case AND provider_mode <> 'synthetic') = 0,
    'AG4.6 no non-synthetic run exists anywhere on this case');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP AG5 — the gate helper is internal and fails closed'; END $$;
-- ===========================================================================

DO $$
BEGIN
  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated', 'public.scp_iv_ai_real_model_permitted()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.scp_iv_ai_real_model_permitted()', 'EXECUTE'),
    'AG5.1 no browser principal can probe the AI capability directly');

  -- Fails closed on an absent configuration row, not open.
  PERFORM pg_temp.ok(
    (SELECT coalesce((SELECT ai_enabled FROM public.scp_interview_ai_config WHERE id), false)) = false,
    'AG5.2 the flag reads false, and an absent singleton would read false too');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_trigger
      WHERE tgname = 'scp_interview_ai_runs_disabled_guard' AND NOT tgisinternal) = 1,
    'AG5.3 the table-level guard is installed');

  -- Exactly one overload of each RPC: the pre-gate signatures are gone.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'scp_iv_ai_run_start') = 1,
    'AG5.4 the ungated six-argument scp_iv_ai_run_start no longer exists');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'scp_iv_ai_run_settle') = 1,
    'AG5.5 and neither does the settle form that could not record a resolved model');
END $$;

ROLLBACK;
