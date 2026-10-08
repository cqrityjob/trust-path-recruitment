-- Recruiter Intelligence v0.3: additive, AI-off interview foundation.
-- Created by `supabase migration new` as 20261007184438; only the filename
-- moved to the next canonical slot after 20270305090000. No hosted write.
-- Existing role questions, hashes, approvals, reports and privileges survive.
-- Schema first; dependent application code must wait for hosted verification.

ALTER TABLE public.scp_interview_findings
  ADD COLUMN origin text CHECK (origin IN ('human', 'ai')),
  ADD COLUMN neutral_question text,
  ADD COLUMN source_label text,
  ADD COLUMN responsible_label text,
  ADD COLUMN next_action text,
  ADD COLUMN due_on date,
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN operation_id uuid,
  ADD COLUMN creation_request_hash text,
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- NULL origin means the old row was not reclassified by this migration.
-- A person's clarification is neither a model inference nor method content.
ALTER TABLE public.scp_interview_findings
  DROP CONSTRAINT scp_interview_findings_claim_class_check,
  ADD CONSTRAINT scp_interview_findings_claim_class_check CHECK
    (claim_class IN ('source_grounded', 'governed_content', 'ai_inference', 'human_clarification')),
  ADD CONSTRAINT scp_interview_findings_manual_shape CHECK
    (origin IS DISTINCT FROM 'human' OR
     (ai_run_id IS NULL AND operation_id IS NOT NULL AND creation_request_hash IS NOT NULL
      AND coalesce(length(btrim(neutral_question)),0) > 0 AND coalesce(length(btrim(next_action)),0) > 0
      AND (source_passage_id IS NOT NULL OR coalesce(length(btrim(source_label)),0) > 0)
      AND claim_class IN ('source_grounded', 'human_clarification'))),
  ADD CONSTRAINT scp_interview_findings_human_class CHECK
    (claim_class <> 'human_clarification' OR origin IS NOT DISTINCT FROM 'human');
CREATE UNIQUE INDEX scp_interview_findings_manual_operation_idx
  ON public.scp_interview_findings (case_id, created_by, operation_id)
  WHERE origin = 'human';

COMMENT ON COLUMN public.scp_interview_findings.responsible_label IS
  'Human-entered follow-up responsibility; grants no membership or case access.';
COMMENT ON COLUMN public.scp_interview_findings.origin IS
  'Explicit provenance for new manual points. NULL preserves unclassified historical rows.';

DO $$
DECLARE _check text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _check FROM pg_constraint
    WHERE conrelid='public.scp_interview_case_events'::regclass
      AND conname='scp_interview_case_events_event_check';
  IF _check IS NULL THEN RAISE EXCEPTION 'SCP_IV_FOUNDATION_EVENT_PRECONDITION'; END IF;
  ALTER TABLE public.scp_interview_case_events DROP CONSTRAINT scp_interview_case_events_event_check;
  EXECUTE 'ALTER TABLE public.scp_interview_case_events ADD CONSTRAINT scp_interview_case_events_event_check CHECK ('
    || substring(_check FROM 8 FOR length(_check)-8) || ' OR event = ''session_process_saved'')';
END $$;

CREATE OR REPLACE FUNCTION public.scp_iv_guard_finding_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _status text;
BEGIN
  -- Finalisation locks this same case before reading the report basis.
  SELECT status INTO _status FROM public.scp_interview_cases
    WHERE id = NEW.case_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.origin = 'human' AND _status = 'reported' THEN
      RAISE EXCEPTION 'SCP_IV_FINDING_REPORTED: create follow-up before finalising the report'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- A physical no-op is not a new human review. Preserve deterministic
  -- report bases when maintenance rewrites heap tuples without changing data.
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF OLD.origin = 'human' AND
     ROW(NEW.id, NEW.case_id, NEW.ai_run_id, NEW.origin, NEW.operation_id,
         NEW.creation_request_hash, NEW.created_at, NEW.statement,
         NEW.finding_kind, NEW.claim_class, NEW.question_id, NEW.source_passage_id,
         NEW.source_label, NEW.neutral_question, NEW.rationale)
       IS DISTINCT FROM
     ROW(OLD.id, OLD.case_id, OLD.ai_run_id, OLD.origin, OLD.operation_id,
         OLD.creation_request_hash, OLD.created_at, OLD.statement,
         OLD.finding_kind, OLD.claim_class, OLD.question_id, OLD.source_passage_id,
         OLD.source_label, OLD.neutral_question, OLD.rationale) THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_ORIGINAL_IMMUTABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.origin = 'human' AND NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_ORIGINAL_IMMUTABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_guard_finding_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scp_interview_findings_revision
  BEFORE INSERT OR UPDATE ON public.scp_interview_findings
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_finding_revision();

CREATE OR REPLACE FUNCTION public.scp_iv_save_session_process(
  _session_id uuid, _reflection text, _deviations text, _expected_updated_at timestamptz)
RETURNS TABLE(session_id uuid, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _case_id uuid; _status text; _session public.scp_interview_sessions%ROWTYPE;
BEGIN
  SELECT s.case_id INTO _case_id FROM public.scp_interview_sessions s WHERE s.id = _session_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT c.status INTO _status FROM public.scp_interview_cases c WHERE c.id = _case_id FOR UPDATE;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _status = 'reported' THEN
    RAISE EXCEPTION 'SCP_IV_SESSION_PROCESS_REPORTED' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _session FROM public.scp_interview_sessions s WHERE s.id = _session_id FOR UPDATE;
  IF _expected_updated_at IS NULL OR _session.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'SCP_IV_SESSION_PROCESS_STALE' USING ERRCODE = 'serialization_failure';
  END IF;
  IF length(coalesce(_reflection, '')) > 20000 OR length(coalesce(_deviations, '')) > 20000 THEN
    RAISE EXCEPTION 'SCP_IV_SESSION_PROCESS_TOO_LONG' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.scp_interview_sessions s
     SET process_reflection = nullif(btrim(_reflection), ''),
         protocol_deviations = nullif(btrim(_deviations), ''),
         last_autosave_at = clock_timestamp(),
         updated_at = greatest(clock_timestamp(), s.updated_at + interval '1 microsecond')
   WHERE s.id = _session_id;
  PERFORM public.scp_iv_record_event(_case_id, 'session_process_saved', 'human', NULL,
    NULL, NULL, NULL, jsonb_build_object('session_id', _session_id));
  RETURN QUERY SELECT s.id, s.updated_at FROM public.scp_interview_sessions s WHERE s.id = _session_id;
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_save_session_process(uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_save_session_process(uuid,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_iv_create_manual_finding(
  _case_id uuid, _operation_id uuid, _finding_kind text, _statement text,
  _neutral_question text, _question_id uuid, _source_passage_id uuid,
  _source_label text, _responsible_label text, _next_action text, _due_on date)
RETURNS TABLE(finding_id uuid, revision bigint, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _case public.scp_interview_cases%ROWTYPE; _request_hash text;
        _old public.scp_interview_findings%ROWTYPE; _id uuid;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _case FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL OR _finding_kind IS NULL
     OR _finding_kind NOT IN ('gap','unclear','contradiction','verification')
     OR coalesce(length(btrim(_statement)),0) NOT BETWEEN 1 AND 3000
     OR coalesce(length(btrim(_neutral_question)),0) NOT BETWEEN 1 AND 3000
     OR coalesce(length(btrim(_next_action)),0) NOT BETWEEN 1 AND 2000
     OR length(coalesce(_source_label,'')) > 1000
     OR length(coalesce(_responsible_label,'')) > 300
     OR (_source_passage_id IS NULL AND coalesce(length(btrim(_source_label)),0) = 0) THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_INVALID_INPUT' USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := encode(sha256(convert_to(jsonb_build_array(_finding_kind,btrim(_statement),
    btrim(_neutral_question),_question_id,_source_passage_id,nullif(btrim(_source_label),''),
    nullif(btrim(_responsible_label),''),btrim(_next_action),_due_on)::text,'UTF8')),'hex');
  SELECT * INTO _old FROM public.scp_interview_findings f
    WHERE f.case_id = _case_id AND f.created_by = auth.uid()
      AND f.operation_id = _operation_id AND f.origin = 'human';
  IF FOUND THEN
    IF _old.creation_request_hash <> _request_hash THEN
      RAISE EXCEPTION 'SCP_IV_FINDING_OPERATION_REUSED' USING ERRCODE = 'check_violation';
    END IF;
    RETURN QUERY SELECT _old.id, _old.revision, _old.updated_at;
    RETURN;
  END IF;
  IF _case.status = 'reported' THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_REPORTED' USING ERRCODE = 'check_violation';
  END IF;
  -- Existing triggers enforce that question and quoted passage belong to
  -- this case and its exact pack. A label denotes a reference, not a copy.
  INSERT INTO public.scp_interview_findings
    (case_id,origin,ai_run_id,finding_kind,statement,neutral_question,question_id,
     source_passage_id,source_label,responsible_label,next_action,due_on,claim_class,
     human_state,human_actor_id,human_actor_at,created_by,operation_id,creation_request_hash)
  VALUES (_case_id,'human',NULL,_finding_kind,btrim(_statement),btrim(_neutral_question),_question_id,
    _source_passage_id,nullif(btrim(_source_label),''),nullif(btrim(_responsible_label),''),
    btrim(_next_action),_due_on,
    CASE WHEN _source_passage_id IS NULL THEN 'human_clarification' ELSE 'source_grounded' END,
    'confirmed',auth.uid(),clock_timestamp(),auth.uid(),_operation_id,_request_hash)
  RETURNING id INTO _id;
  PERFORM public.scp_iv_record_event(_case_id, 'finding_recorded', 'human', NULL,
    NULL, NULL, NULL, jsonb_build_object('finding_id',_id,'origin','human','operation_id',_operation_id));
  RETURN QUERY SELECT f.id,f.revision,f.updated_at FROM public.scp_interview_findings f WHERE f.id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_iv_review_manual_finding(
  _finding_id uuid, _expected_revision bigint, _resolution_state text,
  _human_note text, _responsible_label text, _next_action text, _due_on date)
RETURNS TABLE(finding_id uuid, revision bigint, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _case_id uuid; _employer_id uuid; _f public.scp_interview_findings%ROWTYPE;
BEGIN
  SELECT f.case_id INTO _case_id FROM public.scp_interview_findings f WHERE f.id = _finding_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT c.employer_id INTO _employer_id FROM public.scp_interview_cases c WHERE c.id = _case_id FOR UPDATE;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_employer_role(auth.uid(),_employer_id,ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_REVIEW_ROLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _f FROM public.scp_interview_findings f WHERE f.id = _finding_id FOR UPDATE;
  IF _f.origin IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_NOT_MANUAL' USING ERRCODE = 'check_violation';
  END IF;
  IF _expected_revision IS NULL OR _f.revision <> _expected_revision THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_STALE' USING ERRCODE = 'serialization_failure';
  END IF;
  IF _resolution_state IS NULL OR _resolution_state NOT IN
       ('open','needs_verification','corrected_by_candidate','unresolved_difference','resolved','not_relevant')
     OR coalesce(length(btrim(_human_note)),0) NOT BETWEEN 1 AND 3000
     OR coalesce(length(btrim(_next_action)),0) NOT BETWEEN 1 AND 2000
     OR length(coalesce(_responsible_label,'')) > 300 THEN
    RAISE EXCEPTION 'SCP_IV_FINDING_INVALID_INPUT' USING ERRCODE = 'check_violation';
  END IF;
  -- Following up after finalisation changes the case's current work only.
  -- The final report's JSON, hash and readback remain immutable.
  UPDATE public.scp_interview_findings f SET resolution_state=_resolution_state,
    human_state='confirmed',human_note=btrim(_human_note),human_actor_id=auth.uid(),human_actor_at=clock_timestamp(),
    responsible_label=nullif(btrim(_responsible_label),''),next_action=btrim(_next_action),due_on=_due_on
    WHERE f.id=_finding_id;
  PERFORM public.scp_iv_record_event(_case_id,'finding_resolved','human',NULL,NULL,NULL,
    btrim(_human_note),jsonb_build_object('finding_id',_finding_id,'from_state',_f.resolution_state,
      'to_state',_resolution_state,'previous_revision',_f.revision));
  RETURN QUERY SELECT f.id,f.revision,f.updated_at FROM public.scp_interview_findings f WHERE f.id=_finding_id;
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_iv_manual_finding_capabilities(_case_id uuid)
RETURNS TABLE(may_create boolean, may_review boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN QUERY SELECT public.scp_iv_can_write_case(_case_id) AND c.status <> 'reported',
    public.scp_iv_can_write_case(_case_id)
      AND public.has_employer_role(auth.uid(),c.employer_id,ARRAY['owner','admin'])
    FROM public.scp_interview_cases c WHERE c.id=_case_id;
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_manual_finding_capabilities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_manual_finding_capabilities(uuid) TO authenticated;

-- A read-only observation of today's exact case-pinned content. This is not
-- approval and not a historical snapshot until stored in a final report.
-- Keep the old MD5 function intact; this separate digest covers ALL language
-- fields, child rows and instructions, including currently untranslated NULLs.
CREATE OR REPLACE FUNCTION scp_private.interview_content_manifest(_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _c public.scp_interview_cases%ROWTYPE; _content jsonb; _stored text; _actual text;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id=_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT v.content_hash INTO _stored FROM public.scp_interview_pack_versions v WHERE v.id=_c.pack_version_id;
  _actual := public.scp_interview_pack_content_hash(_c.pack_version_id);
  SELECT jsonb_build_object(
    'pack', (SELECT to_jsonb(p)-ARRAY['created_by','created_at','updated_at']
      FROM public.scp_interview_packs p JOIN public.scp_interview_pack_versions v ON v.pack_id=p.id WHERE v.id=_c.pack_version_id),
    'pack_version', (SELECT to_jsonb(v)-ARRAY['created_by','created_at','updated_at','content_hash',
      'content_status','validation_label','published_at','published_by','retired_at','retired_by','pilot_availability']
      FROM public.scp_interview_pack_versions v WHERE v.id=_c.pack_version_id),
    'competencies',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_pack_competencies x WHERE x.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'competency_map',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.id)
      FROM public.scp_interview_pack_competency_map x JOIN public.scp_interview_pack_competencies c ON c.id=x.pack_competency_id
      WHERE c.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'questions',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_core_questions x WHERE x.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'question_competencies',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.question_id,x.pack_competency_id)
      FROM public.scp_interview_question_competencies x JOIN public.scp_interview_core_questions q ON q.id=x.question_id
      WHERE q.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'probes',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_approved_probes x WHERE x.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'dimensions',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.question_id,x.display_order,x.id)
      FROM public.scp_interview_evidence_dimensions x JOIN public.scp_interview_core_questions q ON q.id=x.question_id
      WHERE q.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'anchors',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.id)
      FROM public.scp_interview_rating_anchors x LEFT JOIN public.scp_interview_core_questions q ON q.id=x.question_id
      LEFT JOIN public.scp_interview_pack_competencies c ON c.id=x.pack_competency_id
      WHERE coalesce(q.pack_version_id,c.pack_version_id)=_c.pack_version_id),'[]'::jsonb),
    'verification_rules',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_verification_rules x WHERE x.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'prohibited_areas',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_prohibited_areas x WHERE x.pack_version_id=_c.pack_version_id),'[]'::jsonb),
    'method', (SELECT to_jsonb(x)-ARRAY['created_by','created_at','updated_at','approval_state','approved_by','approved_at']
      FROM public.scp_interview_methods x WHERE x.id=_c.trust_method_id),
    'method_practices',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_method_practices x WHERE x.method_id=_c.trust_method_id),'[]'::jsonb),
    'conduct_steps',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.ordinal,x.id)
      FROM public.scp_interview_conduct_steps x WHERE x.method_id=_c.trust_method_id),'[]'::jsonb),
    'conduct_prohibitions',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_conduct_prohibitions x WHERE x.method_id=_c.trust_method_id),'[]'::jsonb),
    'conduct_guidance',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.display_order,x.id)
      FROM public.scp_interview_conduct_guidance x WHERE x.method_id=_c.trust_method_id),'[]'::jsonb),
    'trust_stages',coalesce((SELECT jsonb_agg(to_jsonb(x)-ARRAY['created_at','methodological_basis'] ORDER BY x.ordinal,x.id)
      FROM public.scp_trust_stages x WHERE x.method_id=_c.trust_method_id),'[]'::jsonb),
    'trust_prohibitions',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at' ORDER BY x.id)
      FROM public.scp_trust_stage_prohibitions x JOIN public.scp_trust_stages s ON s.id=x.stage_id
      WHERE s.method_id=_c.trust_method_id),'[]'::jsonb)
  ) INTO _content;
  RETURN jsonb_build_object('manifest_version',1,'observation','current_case_pinned_content',
    'content_hash_algorithm','sha256-jsonb-v1',
    'manifest_hash',encode(sha256(convert_to(_content::text,'UTF8')),'hex'),
    'pack_version_id',_c.pack_version_id,'method_id',_c.trust_method_id,
    'case_stored_pack_hash',_c.pack_content_hash,'stored_pack_hash',_stored,
    'recomputed_pack_hash',_actual,'pack_hash_matches',_stored IS NOT DISTINCT FROM _actual,
    'pack_content_status',(SELECT content_status FROM public.scp_interview_pack_versions WHERE id=_c.pack_version_id),
    'pack_validation_label',(SELECT validation_label FROM public.scp_interview_pack_versions WHERE id=_c.pack_version_id),
    'method_approval_state',(SELECT approval_state FROM public.scp_interview_methods WHERE id=_c.trust_method_id),
    'content',_content);
END; $$;
REVOKE ALL ON FUNCTION scp_private.interview_content_manifest(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_case_content_manifest(_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN scp_private.interview_content_manifest(_case_id);
END; $$;
REVOKE ALL ON FUNCTION public.scp_iv_case_content_manifest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_content_manifest(uuid) TO authenticated;

-- Extend the existing builder in place, preserving its identity/ACL and all
-- report rules. Only future previews/finalisations get the additional data.
DO $$
DECLARE _definition text; _old text := '''category'', ''missing_or_contradictory'')';
BEGIN
  SELECT pg_get_functiondef('public.scp_iv_build_report_basis(uuid)'::regprocedure) INTO _definition;
  -- The full-history test runner restores this extension after exercising
  -- older report rollback/replay contracts. Applying an existing extension
  -- again must not append duplicate keys or change the function.
  IF position('''interview_foundation_version''' IN _definition)>0 THEN RETURN; END IF;
  IF position(_old IN _definition)=0 OR position('RETURN _payload;' IN _definition)=0 THEN
    RAISE EXCEPTION 'SCP_IV_FOUNDATION_REPORT_PRECONDITION';
  END IF;
  _definition := replace(_definition,_old,
    '''category'', ''missing_or_contradictory'', ''origin'', f.origin,
      ''neutral_question'', f.neutral_question, ''source_passage_id'', f.source_passage_id,
      ''source_label'', f.source_label, ''responsible_label'', f.responsible_label,
      ''next_action'', f.next_action, ''due_on'', f.due_on,
      ''human_note'', f.human_note, ''human_actor_id'', f.human_actor_id,
      ''human_actor_at'', f.human_actor_at, ''revision'', f.revision)');
  _definition := replace(_definition,'RETURN _payload;',
    'RETURN _payload || jsonb_build_object(''interview_foundation_version'', 1,
      ''content_manifest'', scp_private.interview_content_manifest(_case_id),
      ''ai_disclosure'', (_payload -> ''ai_disclosure'') || jsonb_build_object(''statement'',
        CASE WHEN jsonb_array_length(_payload #> ''{ai_disclosure,runs}'') > 0
          THEN ''AI-stöd har använts enligt de dokumenterade körningarna. Underlag och bedömningar granskas av människor. AI fattar inget urvals- eller anställningsbeslut.''
          ELSE ''Inget AI-stöd har använts för detta intervjuunderlag. Bedömningsunderlag och bedömningar har registrerats av människor. Inget automatiskt urvals- eller anställningsbeslut ingår.'' END));');
  EXECUTE _definition;
END $$;

-- No broad UPDATE/INSERT grant is added. Existing owner/admin review policy
-- and its three-column privilege remain exactly as before.
DO $$
DECLARE _fn regprocedure;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.scp_iv_save_session_process(uuid,text,text,timestamptz)'::regprocedure,
    'public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date)'::regprocedure,
    'public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date)'::regprocedure,
    'public.scp_iv_case_content_manifest(uuid)'::regprocedure,
    'public.scp_iv_manual_finding_capabilities(uuid)'::regprocedure] LOOP
    IF has_function_privilege('anon',_fn,'EXECUTE') OR NOT has_function_privilege('authenticated',_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_IV_FOUNDATION_ACL: %',_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.scp_interview_findings','UPDATE')
     OR has_column_privilege('authenticated','public.scp_interview_findings','next_action','UPDATE') THEN
    RAISE EXCEPTION 'SCP_IV_FOUNDATION_BROAD_WRITE';
  END IF;
END $$;
