-- CQrity TRUST — owner review corrections (PR #123).
--
-- Three defects, all introduced by 20260922090000. Each is a case of the
-- product describing a control it did not have.
--
--   1. Three TRUST tables granted SELECT to every `authenticated` identity with
--      USING (true). A candidate is authenticated. The candidate route carries
--      a comment saying it "should not be able to reach that table at all" --
--      and the Data API could. A comment is not a policy.
--
--   2. The stage/task table was read for display only. scp_iv_ai_run_start
--      still permitted any active task on any writable case, so "Understand
--      permits zero AI tasks" was a fact about a table rather than about
--      execution. The test proved the data and not the behaviour.
--
--   3. Version pinning was not merely unsafe, it was impossible: a
--      single-column UNIQUE(slug) sat alongside UNIQUE(slug, version_number),
--      so a v2 row could never be inserted. Stage lookups were by stage_key
--      alone, ignoring the pinned method entirely, and creation auto-selected
--      the highest version regardless of governance state.
--
-- Nothing here redesigns the product. The five stages, the UX, the boundaries
-- and the human decision line are unchanged.
-- ---------------------------------------------------------------------------


-- ###########################################################################
-- 1 — Close the candidate and direct-API disclosure
-- ###########################################################################

DROP POLICY IF EXISTS scp_trust_stages_read ON public.scp_trust_stages;
DROP POLICY IF EXISTS scp_trust_stage_ai_tasks_read ON public.scp_trust_stage_ai_tasks;
DROP POLICY IF EXISTS scp_trust_stage_prohibitions_read ON public.scp_trust_stage_prohibitions;

-- No direct SELECT for anybody. Employers reach the stage through a
-- case-scoped projection; platform admins reach the internals through their own
-- policy. Revoking the grant as well as dropping the policy means the table is
-- closed even if a future migration adds a permissive policy by accident.
REVOKE SELECT ON TABLE public.scp_trust_stages FROM authenticated;
REVOKE SELECT ON TABLE public.scp_trust_stage_ai_tasks FROM authenticated;
REVOKE SELECT ON TABLE public.scp_trust_stage_prohibitions FROM authenticated;
REVOKE ALL ON TABLE public.scp_trust_stages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.scp_trust_stage_ai_tasks FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.scp_trust_stage_prohibitions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.scp_trust_stage_claims FROM PUBLIC, anon, authenticated;

-- Platform admins may read the internals, including the methodological basis
-- and the stage-to-claim links. That is where the research argument belongs.
DROP POLICY IF EXISTS scp_trust_stages_admin ON public.scp_trust_stages;
CREATE POLICY scp_trust_stages_admin ON public.scp_trust_stages
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS scp_trust_stage_ai_tasks_admin ON public.scp_trust_stage_ai_tasks;
CREATE POLICY scp_trust_stage_ai_tasks_admin ON public.scp_trust_stage_ai_tasks
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS scp_trust_stage_prohibitions_admin ON public.scp_trust_stage_prohibitions;
CREATE POLICY scp_trust_stage_prohibitions_admin ON public.scp_trust_stage_prohibitions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- The grant is what makes the policy reachable. Without it the platform-admin
-- policy is dead code that looks like a control: an admin is refused at the
-- privilege layer before RLS is ever consulted. All four tables are granted and
-- then restricted by policy, so there is one mechanism rather than two.
GRANT SELECT ON TABLE public.scp_trust_stages TO authenticated;
GRANT SELECT ON TABLE public.scp_trust_stage_ai_tasks TO authenticated;
GRANT SELECT ON TABLE public.scp_trust_stage_prohibitions TO authenticated;
GRANT SELECT ON TABLE public.scp_trust_stage_claims TO authenticated;

COMMENT ON TABLE public.scp_trust_stages IS
  'The five CQrity TRUST stages. NOT directly readable by employers or '
  'candidates: employers receive a case-scoped projection through '
  'scp_trust_stage_for_case(), which returns only the fields the banner needs '
  'and never methodological_basis. Direct SELECT is platform-admin only.';


-- ---------------------------------------------------------------------------
-- 1.1  The case-scoped safe projection.
--
-- Scoped by CASE, not by stage key: the caller must already be able to read the
-- case, and what comes back is the stage that case is in under the method that
-- case pinned. There is no way to enumerate stages, and no way to ask about a
-- case you cannot see.
--
-- methodological_basis is absent from the return type entirely. Not filtered in
-- the caller -- absent, so no future caller can select it by accident.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scp_trust_stage_for_case(_case_id uuid)
RETURNS TABLE (
  stage_key text,
  letter text,
  ordinal integer,
  name_sv text,
  name_en text,
  purpose_sv text,
  purpose_en text,
  human_responsibility_sv text,
  method_version integer,
  permits_ai boolean,
  prohibitions text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _stage text; _method uuid; _version integer;
BEGIN
  -- Readable case only. A candidate cannot read an interview case, so a
  -- candidate gets nothing here -- the same answer they get from the table.
  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RETURN;
  END IF;

  SELECT c.trust_method_id, m.version_number
    INTO _method, _version
    FROM public.scp_interview_cases c
    LEFT JOIN public.scp_interview_methods m ON m.id = c.trust_method_id
   WHERE c.id = _case_id;

  _stage := public.scp_trust_case_stage(_case_id);
  IF _stage IS NULL OR _method IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT s.stage_key, s.letter, s.ordinal, s.name_sv, s.name_en,
           s.purpose_sv, s.purpose_en, s.human_responsibility_sv,
           _version,
           EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks a WHERE a.stage_id = s.id),
           coalesce(
             (SELECT array_agg(p.statement_sv ORDER BY p.display_order)
                FROM public.scp_trust_stage_prohibitions p WHERE p.stage_id = s.id),
             ARRAY[]::text[])
      FROM public.scp_trust_stages s
     -- Scoped by the case's PINNED method, never by stage_key alone.
     WHERE s.method_id = _method AND s.stage_key = _stage;
END; $$;

REVOKE ALL ON FUNCTION public.scp_trust_stage_for_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_trust_stage_for_case(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_trust_stage_for_case(uuid) IS
  'The employer-safe projection of a case''s current TRUST stage. Returns '
  'nothing for a case the caller cannot read, and never returns '
  'methodological_basis or claim links -- those are not in the return type at '
  'all, so no caller can select them by mistake. Scoped by the case''s pinned '
  'method version, so a v1 case keeps rendering v1 after v2 exists.';


-- ###########################################################################
-- 3 — Make method version pinning real
--
-- Taken before enforcement, because enforcement has to resolve the pinned
-- method and there was no way to have two versions to resolve between.
-- ###########################################################################

-- 3.1  The single-column UNIQUE made a second version impossible.
--
-- UNIQUE(slug) and UNIQUE(slug, version_number) contradicted each other: the
-- second says "a slug may have many versions" and the first says it may not.
-- Inserting cqrity-trust v2 would have failed on the slug index before the
-- versioned one was consulted, so the ON CONFLICT (slug, version_number) clause
-- in the seed could never fire. Versioned identity is the one that survives.
ALTER TABLE public.scp_interview_methods
  DROP CONSTRAINT IF EXISTS scp_interview_methods_slug_key;
DROP INDEX IF EXISTS public.scp_interview_methods_slug_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE tablename = 'scp_interview_methods'
                    AND indexname = 'scp_interview_methods_slug_version_number_key') THEN
    ALTER TABLE public.scp_interview_methods
      ADD CONSTRAINT scp_interview_methods_slug_version_number_key
      UNIQUE (slug, version_number);
  END IF;
END $$;


-- 3.2  The two pinned columns could disagree.
--
-- trust_method_id and trust_method_version were independent, so an UPDATE to
-- one left the other describing a different version. The version is now DERIVED
-- from the pinned row rather than stored twice: one fact, one place, nothing to
-- drift.
--
-- The column is dropped rather than constrained. A generated column would also
-- work, but a redundant column that is right today is still a column somebody
-- will write to tomorrow.
ALTER TABLE public.scp_interview_cases
  DROP COLUMN IF EXISTS trust_method_version;

CREATE OR REPLACE FUNCTION public.scp_trust_case_method_version(_case_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.version_number
    FROM public.scp_interview_cases c
    JOIN public.scp_interview_methods m ON m.id = c.trust_method_id
   WHERE c.id = _case_id AND public.scp_iv_can_read_case(_case_id);
$$;

REVOKE ALL ON FUNCTION public.scp_trust_case_method_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_trust_case_method_version(uuid)
  TO authenticated, service_role;


-- 3.3  Release eligibility, stated as a rule rather than "the highest number".
--
-- Two rules, and the difference between them is the whole point:
--
--   NORMAL USE requires an approved method. Nothing is approved today, so
--   normal use currently selects nothing and fails closed. That is correct:
--   TRUST is a design hypothesis awaiting method review, and a product that
--   silently ran the newest draft would be treating "newest" as "governed".
--
--   INTERNAL QA AND PILOT may use the newest DRAFT, deliberately, which is
--   what makes the product usable today under the pilot-grant regime that
--   already gates unpublished packs.
--
-- Auto-selecting the highest version regardless of state is gone in both.
CREATE OR REPLACE FUNCTION public.scp_trust_eligible_method(
  _usage_mode text DEFAULT 'production')
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _usage_mode NOT IN ('production', 'internal_qa') THEN
    RAISE EXCEPTION
      'SCP_TRUST_UNKNOWN_USAGE_MODE: "%" is not a recognised usage mode.', _usage_mode
      USING ERRCODE = 'check_violation';
  END IF;

  IF _usage_mode = 'production' THEN
    -- Approved only. Highest approved version, not highest version.
    SELECT id INTO _id FROM public.scp_interview_methods
     WHERE slug = 'cqrity-trust' AND approval_state = 'approved'
     ORDER BY version_number DESC LIMIT 1;
    IF _id IS NULL THEN
      RAISE EXCEPTION
        'SCP_TRUST_NO_APPROVED_METHOD: no approved CQrity TRUST version exists. TRUST is a research-grounded design hypothesis awaiting method review; production use is not available until a version is approved.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN _id;
  END IF;

  -- internal_qa: the newest version that is at least a draft, and retired
  -- versions are excluded so withdrawing one actually withdraws it.
  SELECT id INTO _id FROM public.scp_interview_methods
   WHERE slug = 'cqrity-trust' AND approval_state IN ('draft', 'in_review', 'approved')
   ORDER BY version_number DESC LIMIT 1;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'SCP_TRUST_NO_METHOD: no usable CQrity TRUST version exists.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_trust_eligible_method(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_trust_eligible_method(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_trust_eligible_method(text) IS
  'Which TRUST version a NEW case may pin. production requires an approved '
  'version and currently fails closed, because none is approved. internal_qa '
  'permits the newest non-retired version, which is what makes the draft method '
  'usable under the existing pilot-grant regime. Never "highest version '
  'regardless of state".';


-- 3.4  Creation pins deliberately.
--
-- A case created against an unpublished pack is by definition pilot or QA work
-- -- the pilot grant already established that -- so it pins under the
-- internal_qa rule and the audit event records which rule applied. A case
-- against a published pack is normal use and requires an approved method.
CREATE OR REPLACE FUNCTION public.scp_iv_create_case(
  _employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,
  _candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,
  _job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _usable boolean;
  _method_id uuid;
  _usage text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  _usable := _pack.content_status = 'published'
          OR public.scp_interview_pilot_grant_active(_employer_id, _pack_version_id, auth.uid());
  IF NOT _usable THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and this employer holds no live, in-window pilot grant covering you for it.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _usage := CASE WHEN _pack.content_status = 'published' THEN 'production' ELSE 'internal_qa' END;
  _method_id := public.scp_trust_eligible_method(_usage);

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title,
     created_by, trust_method_id)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid(), _method_id)
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'trust_method_version',
                         (SELECT version_number FROM public.scp_interview_methods WHERE id = _method_id),
                       'trust_usage_mode', _usage,
                       'used_pilot_grant', _pack.content_status <> 'published'));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid)
  TO authenticated, service_role;


-- 3.5  A case's pinned method never moves.
CREATE OR REPLACE FUNCTION public.scp_trust_guard_pin_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.trust_method_id IS NOT NULL
     AND NEW.trust_method_id IS DISTINCT FROM OLD.trust_method_id THEN
    RAISE EXCEPTION
      'SCP_TRUST_PIN_IMMUTABLE: an interview was conducted under one method version and stays under it. Repinning would rewrite what the interview was.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_trust_guard_pin_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_interview_cases_trust_pin_immutable ON public.scp_interview_cases;
CREATE TRIGGER scp_interview_cases_trust_pin_immutable
  BEFORE UPDATE ON public.scp_interview_cases
  FOR EACH ROW EXECUTE FUNCTION public.scp_trust_guard_pin_immutable();


-- ###########################################################################
-- 2 — Enforce stage→task permission at execution
--
-- The binding table was read for display. An AI run could still start any
-- active task on any writable case, so "Understand permits zero AI tasks" was a
-- statement about a table rather than about what the product does. The check
-- now happens where the run is created, and fails closed in every direction.
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.scp_iv_ai_run_start(
  _case_id uuid, _task text, _provider text, _model text,
  _raw_request jsonb DEFAULT NULL, _input_hash text DEFAULT NULL)
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

  SELECT * INTO _t FROM public.scp_ai_tasks
   WHERE task_key = _task AND activation_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'SCP_IV_TASK_NOT_ACTIVE: AI task "%" has no active registry version. Activation is a governed act.',
      _task USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---- The TRUST gate -----------------------------------------------------
  --
  -- Resolved from the case's PINNED method, not from the newest one: a v1 case
  -- is governed by v1's bindings for its whole life, including after v2 exists.
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

  SELECT EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks a
                  WHERE a.stage_id = _stage_id AND a.ai_task_id = _t.id)
    INTO _permitted;

  IF NOT _permitted THEN
    -- Name the stage the task DOES belong to, when it belongs to one. The
    -- difference between "this task runs later" and "this task is not part of
    -- the method" is the whole of what the operator needs to know.
    SELECT string_agg(s2.name_sv, ', ' ORDER BY s2.ordinal) INTO _elsewhere
      FROM public.scp_trust_stage_ai_tasks a2
      JOIN public.scp_trust_stages s2 ON s2.id = a2.stage_id
     WHERE a2.ai_task_id = _t.id AND s2.method_id = _method;

    IF _elsewhere IS NULL THEN
      RAISE EXCEPTION
        'SCP_TRUST_TASK_UNBOUND: AI task "%" is bound to no stage of the pinned TRUST method. An unbound task is one nobody decided when it may run.',
        _task USING ERRCODE = 'insufficient_privilege';
    END IF;

    RAISE EXCEPTION
      'SCP_TRUST_TASK_WRONG_STAGE: AI task "%" is not permitted in "%". The method permits it in: %.',
      _task, _stage_name, _elsewhere USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- ---- end of the TRUST gate ---------------------------------------------

  INSERT INTO public.scp_interview_ai_runs
    (case_id, task, task_version, prompt_version, policy_version,
     input_schema_version, output_schema_version, eval_set_version, ai_task_id,
     provider, model, status, raw_request, input_hash,
     requires_human_review, started_by)
  VALUES
    (_case_id, _task, _t.task_version, _t.prompt_version, _t.policy_version,
     _t.input_schema_version, _t.output_schema_version, _t.evaluation_set_version, _t.id,
     _provider, _model, 'running', _raw_request, _input_hash,
     _t.requires_human_review, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'ai_run_started', 'ai', _id, NULL, NULL, NULL,
    jsonb_build_object('task', _task, 'task_version', _t.task_version,
                       'prompt_version', _t.prompt_version, 'provider', _provider,
                       'model', _model, 'trust_stage', _stage));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text) IS
  'Starts a governed AI run. Fails closed when the task is not active, the case '
  'pins no TRUST method, the case is in no stage, the pinned method defines no '
  'such stage, the task is bound to no stage, or the task belongs to a '
  'different stage. The refusal happens BEFORE the run row exists, so a '
  'rejected attempt leaves no run and no ledger event.';


-- ---------------------------------------------------------------------------
-- Assertions.
-- ---------------------------------------------------------------------------
DO $trust_fix$
DECLARE _n integer;
BEGIN
  -- 1. No permissive policy remains on the internal tables.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename LIKE 'scp_trust%' AND qual = 'true';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: % TRUST policy/policies still use USING (true).', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename LIKE 'scp_trust%' AND qual NOT ILIKE '%is_platform_admin%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: % TRUST policy/policies are not platform-admin scoped.', _n;
  END IF;

  -- 2. The single-column slug uniqueness is gone and versioned identity remains.
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE tablename = 'scp_interview_methods'
                AND indexname = 'scp_interview_methods_slug_key') THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: UNIQUE(slug) still makes a second method version impossible.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE tablename = 'scp_interview_methods'
                    AND indexname = 'scp_interview_methods_slug_version_number_key') THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: versioned identity UNIQUE(slug, version_number) is missing.';
  END IF;

  -- 3. The redundant version column is gone.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'scp_interview_cases' AND column_name = 'trust_method_version') THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: trust_method_version still stored alongside trust_method_id.';
  END IF;

  -- 4. Enforcement is in the run-start path, not only in the display path.
  IF position('SCP_TRUST_TASK_WRONG_STAGE' in
       pg_get_functiondef('public.scp_iv_ai_run_start(uuid,text,text,text,jsonb,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_FIX: scp_iv_ai_run_start does not enforce the stage binding.';
  END IF;

  RAISE NOTICE 'SCP_TRUST_FIX: disclosure closed, stage enforcement live, versioning made possible.';
END
$trust_fix$;
