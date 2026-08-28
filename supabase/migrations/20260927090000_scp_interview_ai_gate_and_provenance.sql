-- ============================================================================
-- AI EXECUTION GATE + MODEL PROVENANCE
-- ============================================================================
--
-- Two confirmed defects, both fixed at the authoritative boundary rather than
-- in the UI that happens to call it.
--
-- ── 1. ai_enabled was documented as the gate and enforced nowhere ───────────
--
-- scp_interview_ai_config.ai_enabled decides whether the orchestrator may
-- reach a real language model. scp_iv_ai_run_start() checked case membership,
-- task activation and the TRUST stage binding -- but never the flag. Any
-- caller reaching the RPC could therefore open a run against a real model
-- while the governed configuration said AI was off.
--
-- The fix keeps the distinction the flag was always about. ai_enabled = false
-- does NOT mean "no runs": the deterministic rule-based engine is a working
-- product and must keep running, because the manual interview journey depends
-- on it. It means NO REAL MODEL. So the intended provider mode now travels
-- into run_start, and a non-synthetic mode is refused when the flag is off.
--
-- Enforced in three places, because a gate with one door is a gate with one
-- bug:
--   a. scp_iv_ai_run_start()  -- refuses to open the run at all
--   b. scp_iv_ai_run_settle() -- refuses to relabel a synthetic run as a real
--                                model run after the fact
--   c. a trigger on scp_interview_ai_runs -- refuses the row even if some
--      future caller bypasses both RPCs
--
-- ── 2. provider name was being stored as the model id ───────────────────────
--
-- The run row carries `provider` and `model` as separate columns, and the
-- application filled BOTH from provider.name for real-model runs. "anthropic"
-- is not a model id. Six months from now, "which model produced this reading
-- of a candidate" must be answerable exactly, including the dated point
-- release -- an evaluation that cannot name its model is not evidence.
--
-- Fixed by making settlement able to record the model the provider actually
-- reported, distinctly from the provider, and by recording whether the stored
-- id was confirmed by the provider or is still the caller's intent.
--
-- ── What this migration does NOT do ─────────────────────────────────────────
--
-- It does not enable AI. ai_enabled stays false, no credential is configured,
-- and after this migration a real-model run is refused by the database rather
-- than merely unconfigured. Nothing here touches transcription, TRUST
-- methodology, the entitlement rules, or any prohibition guard.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. Provenance columns. Separate fields for separate facts.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_ai_runs
  ADD COLUMN model_confirmed_by_provider boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scp_interview_ai_runs.model IS
  'The EXACT model identifier, never the provider name. At run start this is '
  'the caller''s intent; settlement overwrites it with what the provider '
  'actually reported, and sets model_confirmed_by_provider. For a synthetic '
  'run it names the deterministic engine and its version.';

COMMENT ON COLUMN public.scp_interview_ai_runs.provider IS
  'The vendor or engine family (e.g. "anthropic", "deterministic"). Distinct '
  'from model: a provider name in the model column makes the run '
  'unreproducible, which is why they are two columns.';

COMMENT ON COLUMN public.scp_interview_ai_runs.model_confirmed_by_provider IS
  'True when the stored model id is what the provider reported at settlement, '
  'false when it is only what the caller intended at start. A shadow '
  'evaluation may only count runs where this is true.';

-- A provider name must not be parked in the model column. Names the two we
-- actually ship; a new provider adds itself here deliberately.
ALTER TABLE public.scp_interview_ai_runs
  ADD CONSTRAINT scp_interview_ai_runs_model_is_not_provider_name
  CHECK (model NOT IN ('anthropic', 'openai', 'mock', 'deterministic'));


-- ────────────────────────────────────────────────────────────────────────────
-- S2. The gate decision, in one place.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_ai_real_model_permitted()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Fails closed twice over: a missing singleton row is not permission, and
  -- NULL is not permission.
  SELECT coalesce((SELECT ai_enabled FROM public.scp_interview_ai_config WHERE id), false);
$$;

-- INTERNAL. The answer reaches a browser through the surfaces that already
-- decide what to render, never as a directly callable capability probe.
REVOKE ALL ON FUNCTION public.scp_iv_ai_real_model_permitted() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_real_model_permitted() TO service_role;

COMMENT ON FUNCTION public.scp_iv_ai_real_model_permitted() IS
  'INTERNAL: may a run reach a real language model right now? The governed '
  'scp_interview_ai_config.ai_enabled flag, read fail-closed (absent row or '
  'NULL = false). Synthetic runs never consult it -- the deterministic engine '
  'is a working product and the manual journey depends on it.';


-- ────────────────────────────────────────────────────────────────────────────
-- S3. Door (c) first: the table itself refuses, whatever the caller is.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_guard_ai_disabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.provider_mode IS DISTINCT FROM 'synthetic'
     AND NOT public.scp_iv_ai_real_model_permitted() THEN
    RAISE EXCEPTION
      'SCP_IV_AI_DISABLED: AI is not enabled in the governed configuration, so a "%" run cannot exist. Enabling AI is an owner decision recorded in scp_interview_ai_config.',
      NEW.provider_mode USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_ai_disabled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_ai_runs_disabled_guard ON public.scp_interview_ai_runs;
CREATE TRIGGER scp_interview_ai_runs_disabled_guard
  BEFORE INSERT OR UPDATE ON public.scp_interview_ai_runs
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_ai_disabled();

COMMENT ON FUNCTION public.scp_iv_guard_ai_disabled() IS
  'The last door: no row on scp_interview_ai_runs may claim a real-model '
  'provider_mode while ai_enabled is false, regardless of which RPC or role '
  'wrote it. UI gating is not a control; this is.';


-- ────────────────────────────────────────────────────────────────────────────
-- S4. Door (a): run start. The intended mode now travels in, so the refusal
--     happens before a run row exists rather than at settlement.
--
--     Identical to the 20260923 definition (membership, task activation, the
--     five TRUST stage checks) with the AI gate added and the mode recorded.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_start(
  _case_id uuid, _task text, _provider text, _model text,
  _raw_request jsonb DEFAULT NULL, _input_hash text DEFAULT NULL,
  _provider_mode text DEFAULT 'synthetic')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _t public.scp_ai_tasks%ROWTYPE;
  _method uuid;
  _stage text;
  _stage_id uuid;
  _stage_name text;
  _permitted boolean;
  _elsewhere text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _provider_mode IS NULL
     OR _provider_mode NOT IN ('synthetic', 'development_model', 'production_model') THEN
    RAISE EXCEPTION 'SCP_IV_UNKNOWN_PROVIDER_MODE: "%" is not a recognised provider mode.',
      _provider_mode USING ERRCODE = 'check_violation';
  END IF;

  -- THE GATE. Before the task lookup, before TRUST, before a row exists.
  IF _provider_mode <> 'synthetic' AND NOT public.scp_iv_ai_real_model_permitted() THEN
    RAISE EXCEPTION
      'SCP_IV_AI_DISABLED: AI is not enabled in the governed configuration, so no run may reach a real language model. The structured interview works without it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A provider name is not a model id, at the boundary as well as in the CHECK.
  IF _model IS NULL OR btrim(_model) = '' THEN
    RAISE EXCEPTION 'SCP_IV_MODEL_REQUIRED: a run must name the exact model or deterministic engine it uses.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF lower(btrim(_model)) = lower(coalesce(btrim(_provider), '')) THEN
    RAISE EXCEPTION
      'SCP_IV_MODEL_IS_PROVIDER_NAME: "%" is the provider, not a model identifier. Record the exact model id.',
      _model USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _t FROM public.scp_ai_tasks
   WHERE task_key = _task AND activation_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'SCP_IV_TASK_NOT_ACTIVE: AI task "%" has no active registry version. Activation is a governed act.',
      _task USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT trust_method_id INTO _method FROM public.scp_interview_cases WHERE id = _case_id;
  IF _method IS NULL THEN
    RAISE EXCEPTION
      'SCP_TRUST_NO_PINNED_METHOD: this case has no pinned TRUST method version, so there is nothing that says which AI tasks it permits. Refusing to run.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _stage := public.scp_trust_case_stage(_case_id);
  IF _stage IS NULL THEN
    RAISE EXCEPTION
      'SCP_TRUST_NO_STAGE: this case is in no TRUST stage (cancelled, or in a state the method does not cover). Refusing to run.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.id, s.name_sv INTO _stage_id, _stage_name
    FROM public.scp_trust_stages s
   WHERE s.method_id = _method AND s.stage_key = _stage;
  IF _stage_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_TRUST_STAGE_UNDEFINED: the pinned method version defines no stage "%". Refusing to run.',
      _stage USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks t
                  WHERE t.stage_id = _stage_id AND t.ai_task_id = _t.id)
    INTO _permitted;

  IF NOT _permitted THEN
    SELECT string_agg(DISTINCT s2.name_sv, ', ')
      INTO _elsewhere
      FROM public.scp_trust_stage_ai_tasks t2
      JOIN public.scp_trust_stages s2 ON s2.id = t2.stage_id
     WHERE t2.ai_task_id = _t.id AND s2.method_id = _method;

    IF _elsewhere IS NULL THEN
      RAISE EXCEPTION
        'SCP_TRUST_TASK_UNBOUND: the pinned TRUST method binds AI task "%" to no stage at all, so it may never run under it.',
        _task USING ERRCODE = 'insufficient_privilege';
    ELSE
      RAISE EXCEPTION
        'SCP_TRUST_TASK_WRONG_STAGE: AI task "%" is not permitted in the stage this case is in ("%"). The method permits it in: %.',
        _task, _stage_name, _elsewhere USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO public.scp_interview_ai_runs
    (case_id, task, task_version, prompt_version, policy_version,
     input_schema_version, output_schema_version, eval_set_version, ai_task_id,
     provider, model, provider_mode, model_confirmed_by_provider,
     status, raw_request, input_hash, requires_human_review, started_by)
  VALUES
    (_case_id, _task, _t.task_version, _t.prompt_version, _t.policy_version,
     _t.input_schema_version, _t.output_schema_version, _t.evaluation_set_version, _t.id,
     _provider, btrim(_model), _provider_mode, false,
     'running', _raw_request, _input_hash, _t.requires_human_review, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'ai_run_started', 'ai', _id, NULL, NULL, NULL,
    jsonb_build_object('task', _task, 'provider', _provider, 'model', btrim(_model),
                       'provider_mode', _provider_mode,
                       'trust_stage', _stage));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text, text) IS
  'Opens a governed AI run. Refuses, in order: a non-member; an unrecognised '
  'provider mode; a real-model run while ai_enabled is false; a model id that '
  'is missing or is merely the provider name; an inactive AI task; a case '
  'with no pinned TRUST method, no stage, an undefined stage, or a task the '
  'pinned method does not permit in that stage. Every refusal happens before '
  'a run row exists.';

-- The six-argument form is what the previous release exposed. Drop it so no
-- caller can reach a run start that predates the AI gate.
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text);


-- ────────────────────────────────────────────────────────────────────────────
-- S5. Door (b): settlement. Preserves the exact model the provider reported,
--     and refuses to relabel a run as real-model while AI is off.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_settle(
  _run_id uuid, _status text, _failure_reason text DEFAULT NULL,
  _abstention_reason text DEFAULT NULL, _raw_response jsonb DEFAULT NULL,
  _input_tokens integer DEFAULT NULL, _output_tokens integer DEFAULT NULL,
  _latency_ms integer DEFAULT NULL, _cost_micros integer DEFAULT NULL,
  _withheld_passages jsonb DEFAULT '[]'::jsonb,
  _provider_mode text DEFAULT 'synthetic',
  _resolved_model text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id uuid; _withheld integer; _mode text; _run public.scp_interview_ai_runs%ROWTYPE;
BEGIN
  SELECT * INTO _run FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_RUN_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  _case_id := _run.case_id;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _mode := coalesce(_provider_mode, 'synthetic');

  -- Settlement must not become the way a synthetic run is relabelled as a
  -- model run once the gate at start has been passed.
  IF _mode <> 'synthetic' AND NOT public.scp_iv_ai_real_model_permitted() THEN
    RAISE EXCEPTION
      'SCP_IV_AI_DISABLED: AI is not enabled in the governed configuration, so this run cannot be settled as a "%" run.',
      _mode USING ERRCODE = 'insufficient_privilege';
  END IF;

  _withheld := jsonb_array_length(coalesce(_withheld_passages, '[]'::jsonb));

  UPDATE public.scp_interview_ai_runs
     SET status = _status,
         failure_reason = _failure_reason,
         abstention_reason = _abstention_reason,
         raw_response = _raw_response,
         input_tokens = _input_tokens,
         output_tokens = _output_tokens,
         latency_ms = _latency_ms,
         cost_micros = _cost_micros,
         withheld_passages = coalesce(_withheld_passages, '[]'::jsonb),
         provider_mode = _mode,
         -- The provider's own answer wins over the caller's intent, and only
         -- then is the id marked confirmed. A provider name is never accepted.
         model = CASE
           WHEN _resolved_model IS NOT NULL AND btrim(_resolved_model) <> ''
                AND lower(btrim(_resolved_model)) <> lower(coalesce(btrim(model), ''))
                AND lower(btrim(_resolved_model)) <> lower(coalesce(btrim(provider), ''))
             THEN btrim(_resolved_model)
           ELSE model
         END,
         model_confirmed_by_provider = (
           _resolved_model IS NOT NULL AND btrim(_resolved_model) <> ''
           AND lower(btrim(_resolved_model)) <> lower(coalesce(btrim(provider), ''))),
         finished_at = now()
   WHERE id = _run_id;

  PERFORM public.scp_iv_record_event(_case_id,
    CASE WHEN _status = 'succeeded' THEN 'ai_run_succeeded' ELSE 'ai_run_failed' END,
    'ai', _run_id, NULL, NULL, coalesce(_failure_reason, _abstention_reason),
    jsonb_build_object('status', _status,
                       'provider_mode', _mode,
                       'model', (SELECT model FROM public.scp_interview_ai_runs WHERE id = _run_id),
                       'model_confirmed_by_provider',
                         (SELECT model_confirmed_by_provider FROM public.scp_interview_ai_runs WHERE id = _run_id),
                       'withheld_passages', _withheld));

  IF _withheld > 0 THEN
    PERFORM public.scp_iv_record_event(_case_id, 'source_passage_withheld', 'system',
      _run_id, NULL, NULL,
      'Underlag undanhölls AI-stödet: text riktad till systemet i stället för information om kandidaten.',
      jsonb_build_object('withheld_passages', _withheld,
                         'reasons', (SELECT jsonb_agg(DISTINCT p->>'reason')
                                       FROM jsonb_array_elements(_withheld_passages) p)));
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text, text) IS
  'Closes a governed AI run. Preserves the EXACT model the provider reported '
  '(_resolved_model) over the caller''s start-time intent, marks whether the '
  'id was provider-confirmed, and refuses to settle a run as a real-model run '
  'while ai_enabled is false.';

-- Retire the eleven-argument form: it could settle without the resolved model
-- and without the disabled-AI check.
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text);


-- ────────────────────────────────────────────────────────────────────────────
-- S6. Self-check. A migration that claims to close a gate should prove it did.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _n integer;
BEGIN
  IF public.scp_iv_ai_real_model_permitted() THEN
    RAISE EXCEPTION 'SCP_IV_AI_GATE: ai_enabled is TRUE at migration time; this migration must not be the thing that enables AI.';
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_ai_run_start';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_AI_GATE: expected exactly one scp_iv_ai_run_start overload, found %.', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_ai_run_settle';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_AI_GATE: expected exactly one scp_iv_ai_run_settle overload, found %.', _n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'scp_interview_ai_runs_disabled_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SCP_IV_AI_GATE: the disabled-AI table guard is not installed.';
  END IF;

  RAISE NOTICE 'SCP_IV_AI_GATE: ai_enabled enforced at start, settle and table; model provenance separated from provider.';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- S7. The manual preparation path.
--
--     A session starts from an APPROVED preparation plan, and the only way to
--     create one was scp_iv_record_prep_plan(_run_id, ...) -- which needs an
--     AI run. With AI disabled that left the structured interview unreachable:
--     no run, no plan, no approval, no session. The manual journey is the one
--     the pilot actually uses, so it cannot depend on the engine being on.
--
--     prep_plans.ai_run_id was already nullable. This adds the governed way to
--     use that: a human records their own preparation, with a disclosure that
--     says plainly that no AI was involved.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_record_manual_prep_plan(
  _case_id uuid,
  _time_plan text DEFAULT NULL,
  _opening_guidance text DEFAULT NULL,
  _closing_guidance text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan_id uuid; _next integer; _status text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO _status FROM public.scp_interview_cases WHERE id = _case_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _status <> 'sources_ready' THEN
    RAISE EXCEPTION
      'SCP_IV_SOURCES_NOT_READY: preparation is recorded once the sources are marked ready. This case is "%".',
      _status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_prep_plans
     SET status = 'superseded', updated_at = now()
   WHERE case_id = _case_id AND status = 'draft';

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_prep_plans WHERE case_id = _case_id;

  INSERT INTO public.scp_interview_prep_plans
    (case_id, ai_run_id, version_number, status, time_plan,
     opening_guidance, closing_guidance, ai_disclosure)
  VALUES
    (_case_id, NULL, _next, 'draft', _time_plan,
     _opening_guidance, _closing_guidance,
     'Inget AI-stöd har använts för det här underlaget. Intervjuaren har förberett '
     'intervjun själv utifrån det styrda rollpaketet. Frågor, godkända följdfrågor '
     'och beteendeexempel kommer oförändrade från paketversionen.')
  RETURNING id INTO _plan_id;

  -- Same status transition as the AI path, so the case reaches the human
  -- approval gate the identical way whichever produced the plan.
  PERFORM public.scp_iv_set_case_status(_case_id, 'prep_generated');
  PERFORM public.scp_iv_record_event(_case_id, 'prep_generated', 'human', NULL,
    'sources_ready', 'prep_generated',
    'Manuell förberedelse utan AI-stöd.',
    jsonb_build_object('plan_id', _plan_id, 'version_number', _next, 'ai_assisted', false));

  RETURN _plan_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_manual_prep_plan(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_manual_prep_plan(uuid, text, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_record_manual_prep_plan(uuid, text, text, text) IS
  'Records a preparation plan the interviewer wrote themselves, with no AI run '
  'behind it, so the structured interview is reachable while AI is disabled. '
  'The plan still goes through the same human approval gate before a session '
  'can start, and its disclosure states plainly that no AI was involved.';


-- Self-check: the manual journey must not depend on the engine.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_iv_record_manual_prep_plan') THEN
    RAISE EXCEPTION 'SCP_IV_AI_GATE: the manual preparation path is missing.';
  END IF;
  RAISE NOTICE 'SCP_IV_AI_GATE: the structured interview is reachable with AI disabled.';
END $$;
