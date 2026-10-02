-- Rollback for 20270111090000_interview_beskt_active_employer.
--
-- Restores the nineteen functions and two policies exactly as hosted before
-- (md5(prosrc) pinned below). This REOPENS that part of P1-B of the
-- 2026-10-02 re-audit: a SUSPENDED (or pending) organisation can again read
-- and work its Interview Intelligence cases and its BESKT assignments.
-- has_active_employer_role (20270108090000) is left in place. No row is
-- touched.

CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL)
     AND public.bcp_case_access_ok(_case_id);
$function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_can_write_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id),
                                  ARRAY['owner','admin','member'])
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active')
     AND public.bcp_case_access_ok(_case_id);
$function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_case_row_visible(_case_id uuid, _employer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, NULL::text[])
     AND (NOT public.bcp_case_vetting_restricted(_case_id)
          OR public.bcp_is_security_officer(_employer_id, auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_is_security_officer(_employer_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL
     AND public.has_employer_role(_user_id, _employer_id, ARRAY['owner', 'admin', 'member'])
     AND EXISTS (SELECT 1 FROM public.bcp_security_officers o
                  WHERE o.employer_id = _employer_id AND o.user_id = _user_id
                    AND o.revoked_at IS NULL);
$function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_confirm_transcript_basis(_case_id uuid, _statement text, _candidate_informed_statement text DEFAULT NULL::text, _purpose_code text DEFAULT NULL::text, _retain_until date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CONFIRM_ROLE: confirming a lawful basis for transcript processing requires an employer owner or admin, not any member.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20261203090000: a security vetting's case is the appointed security
  -- function's alone (bcp_case_access_ok, 20261130090000). Being the
  -- employer's owner or admin is not that.
  IF NOT public.bcp_case_access_ok(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: this case belongs to the security function.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _statement IS NULL OR btrim(_statement) = '' THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_STATEMENT_REQUIRED: state the lawful basis in writing.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _candidate_informed_statement IS NULL OR btrim(_candidate_informed_statement) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CANDIDATE_NOT_INFORMED: state separately what the candidate was told about the recording, when and how. A lawful basis is not the same obligation as informing the person.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _purpose_code IS NULL OR btrim(_purpose_code) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_PURPOSE_REQUIRED: name the permitted purpose. A transcript processed for an unstated purpose can be used for any purpose later.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Retention has to be a decision someone made, not a field left blank. An
  -- open-ended retention period is indistinguishable from keeping it forever.
  IF _retain_until IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_REQUIRED: set a date after which this material is no longer kept.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _retain_until <= current_date THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_IN_PAST: the retention date must be in the future.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases
     SET transcript_lawful_basis_confirmed_at = now(),
         transcript_lawful_basis_confirmed_by = auth.uid(),
         transcript_lawful_basis_statement = btrim(_statement),
         candidate_informed_confirmed_at = now(),
         candidate_informed_confirmed_by = auth.uid(),
         candidate_informed_statement = btrim(_candidate_informed_statement),
         transcript_purpose_code = btrim(_purpose_code),
         retain_until = _retain_until,
         retention_set_by = auth.uid(),
         retention_set_at = now(),
         updated_at = now()
   WHERE id = _case_id;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  PERFORM public.scp_iv_record_event(_case_id, 'transcript_authorised', 'human', NULL, NULL, NULL,
    btrim(_statement),
    jsonb_build_object('candidate_informed', true,
                       'purpose_code', btrim(_purpose_code),
                       'retain_until', _retain_until));
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_erase_source(_source_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _case_id uuid; _passages integer; _proposals integer;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_case_sources WHERE id = _source_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_SOURCE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_ERASE_ROLE: erasing candidate material requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_IV_ERASE_REASON_REQUIRED: state why this material is being erased.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);

  UPDATE public.scp_interview_source_passages
     SET content = ''
   WHERE source_id = _source_id AND content <> '';
  GET DIAGNOSTICS _passages = ROW_COUNT;

  UPDATE public.scp_interview_evidence_proposals
     SET excerpt = '', relevance_rationale = '[raderat]'
   WHERE source_passage_id IN (
     SELECT id FROM public.scp_interview_source_passages WHERE source_id = _source_id);
  GET DIAGNOSTICS _proposals = ROW_COUNT;

  UPDATE public.scp_interview_case_sources
     SET content_text = '', retention_state = 'erased', erased_at = now()
   WHERE id = _source_id;

  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  -- The fourth argument is _ai_run_id, not a generic subject. An erasure has no
  -- AI run behind it, so it is NULL and the source is named in the metadata.
  PERFORM public.scp_iv_record_event(_case_id, 'source_erased', 'human', NULL, NULL, NULL,
    btrim(_reason),
    jsonb_build_object('source_id', _source_id,
                       'passages_cleared', _passages,
                       'proposals_cleared', _proposals,
                       'confirmed_evidence_kept', true,
                       'reports_kept', true));
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_finalise_previewed_report(_case_id uuid, _expected_basis_hash text, _draft_run_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
  _latest_id uuid; _latest_payload jsonb; _latest_basis text;
  _basis text; _hash text;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', code, message), E'\n')
    INTO _n, _blockers FROM public.scp_iv_report_blockers(_case_id);
  IF _n > 0 THEN
    RAISE EXCEPTION E'SCP_IV_REPORT_BLOCKED: this case is not ready for a report.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same builder the preview used, so the two cannot drift.
  _payload := public.scp_iv_build_report_basis(_case_id);
  _basis := public.scp_iv_basis_hash(_payload);
  _hash := public.scp_iv_content_hash(_payload);

  -- What is finalised must be what was read.
  IF _expected_basis_hash IS NULL OR btrim(_expected_basis_hash) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_PREVIEW_REQUIRED: finalising requires the basis hash of a preview. Preview the report, then finalise exactly that.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _expected_basis_hash <> _basis THEN
    RAISE EXCEPTION
      'SCP_IV_STALE_PREVIEW: the basis changed since it was previewed. Preview the report again and finalise what you read.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_reports WHERE case_id = _case_id;

  -- Unchanged since the last final report: return that report. Two clicks on
  -- "complete the report" are one report, and a retry after a lost response
  -- finds the report it already made. Compared on the basis identity, which
  -- excludes case.status_at_report by construction.
  SELECT id, payload, basis_hash INTO _latest_id, _latest_payload, _latest_basis
    FROM public.scp_interview_reports
   WHERE case_id = _case_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;
  IF _latest_id IS NOT NULL
     AND coalesce(_latest_basis, public.scp_iv_basis_hash(_latest_payload)) = _basis THEN
    RETURN _latest_id;
  END IF;

  INSERT INTO public.scp_interview_reports
    (case_id, version_number, status, draft_ai_run_id, payload, content_hash,
     content_hash_algorithm, basis_hash, pack_version_id, pack_content_hash, role_version_id,
     finalised_by, finalised_at)
  VALUES (_case_id, _next, 'final', _draft_run_id, _payload,
          _hash, 'sha256', _basis, _c.pack_version_id, _c.pack_content_hash,
          _c.role_version_id, auth.uid(), now())
  RETURNING id INTO _report_id;

  UPDATE public.scp_interview_reports
     SET status = 'superseded'
   WHERE case_id = _case_id AND id <> _report_id AND status = 'final';

  IF _c.status <> 'reported' THEN
    PERFORM public.scp_iv_set_case_status(_case_id, 'reported');
  END IF;
  PERFORM public.scp_iv_record_event(_case_id, 'report_finalised', 'human', NULL,
    _c.status, 'reported', NULL,
    jsonb_build_object('report_id', _report_id, 'version', _next,
                       'content_hash', _hash, 'content_hash_algorithm', 'sha256',
                       'basis_hash', _basis));

  -- Complete the provenance chain in the graph, tenant-scoped: this report now
  -- carries these confirmed evidence items and these human assessments.
  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'confirmed_evidence', ev.id, 'reported_in', 'report_conclusion', _report_id,
         _c.employer_id, 'Confirmed evidence included in the finalised report.'
    FROM public.scp_interview_evidence ev WHERE ev.case_id = _case_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'human_assessment', a.id, 'assessed_against', 'rating_anchor', a.anchor_id,
         _c.employer_id, 'Human judgement recorded against a governed anchor.'
    FROM public.scp_interview_assessments a
   WHERE a.case_id = _case_id AND a.superseded_by IS NULL
  ON CONFLICT DO NOTHING;

  RETURN _report_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
  _latest_id uuid; _latest_payload jsonb;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', code, message), E'\n')
    INTO _n, _blockers FROM public.scp_iv_report_blockers(_case_id);
  IF _n > 0 THEN
    RAISE EXCEPTION E'SCP_IV_REPORT_BLOCKED: this case is not ready for a report.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_reports WHERE case_id = _case_id;

  -- The snapshot. Built ONLY from confirmed evidence and recorded human
  -- assessments: the proposals table is not read here, and cannot be.
  SELECT jsonb_build_object(
    'case', jsonb_build_object(
      'title', _c.title,
      'candidate', _c.candidate_display_name,
      'employer_id', _c.employer_id,
      'status_at_report', _c.status),
    'pinned', jsonb_build_object(
      'pack_version_id', _c.pack_version_id,
      'pack_content_hash', _c.pack_content_hash,
      'role_version_id', _c.role_version_id),
    'sources', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', s.source_kind, 'label', s.label,
               'purpose', s.purpose_code, 'origin', s.origin) ORDER BY s.created_at)
        FROM public.scp_interview_case_sources s
       WHERE s.case_id = _case_id), '[]'::jsonb),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'code', q.code, 'order', q.display_order, 'prompt', q.prompt_sv,
               'evidence', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'excerpt', ev.excerpt, 'origin', ev.origin,
                          'confirmed_by', ev.confirmed_by, 'confirmed_at', ev.confirmed_at,
                          'was_corrected', ev.original_excerpt IS NOT NULL))
                   FROM public.scp_interview_evidence ev
                  WHERE ev.case_id = _case_id AND ev.question_id = q.id), '[]'::jsonb),
               'assessment', (
                 SELECT jsonb_build_object(
                          'level', a.level, 'rationale', a.rationale,
                          'uncertainty', a.uncertainty_note,
                          'assessor_id', a.assessor_id, 'assessed_at', a.assessed_at,
                          'anchor', an.anchor_sv,
                          'level_meaning', an.label_sv,
                          'counts_toward_aggregation', an.counts_toward_aggregation)
                   FROM public.scp_interview_assessments a
                   JOIN public.scp_interview_rating_anchors an ON an.id = a.anchor_id
                  WHERE a.case_id = _case_id AND a.question_id = q.id
                    AND a.superseded_by IS NULL LIMIT 1)
             ) ORDER BY q.display_order)
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _c.pack_version_id), '[]'::jsonb),
    'unresolved', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', f.finding_kind, 'statement', f.statement,
               'state', f.resolution_state) ORDER BY f.created_at)
        FROM public.scp_interview_findings f
       WHERE f.case_id = _case_id
         AND f.resolution_state IN ('open','needs_verification','unresolved_difference')), '[]'::jsonb),
    'ai_disclosure', jsonb_build_object(
      'runs', coalesce((
        SELECT jsonb_agg(DISTINCT jsonb_build_object(
                 'task', r.task, 'task_version', r.task_version,
                 'prompt_version', r.prompt_version, 'policy_version', r.policy_version,
                 'provider', r.provider, 'model', r.model))
          FROM public.scp_interview_ai_runs r
         WHERE r.case_id = _case_id AND r.status = 'succeeded'), '[]'::jsonb),
      'statement',
      'AI har förberett, extraherat och föreslagit. Varje uppgift i denna rapport är bekräftad av en namngiven människa. AI har inte poängsatt, rangordnat eller rekommenderat, och AI har inte fattat anställningsbeslutet.'),
    'decision_boundary',
    'Denna rapport är beslutsstöd. Anställningsbeslutet fattas av behörig människa hos arbetsgivaren och dokumenteras utanför detta underlag.'
  ) INTO _payload;

  -- Unchanged since the last final report: return that report. Two clicks on
  -- "complete the report" are one report, and a retry after a lost response
  -- finds the report it already made.
  SELECT id, payload INTO _latest_id, _latest_payload
    FROM public.scp_interview_reports
   WHERE case_id = _case_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;
  IF _latest_id IS NOT NULL
     AND (_latest_payload #- '{case,status_at_report}') = (_payload #- '{case,status_at_report}') THEN
    RETURN _latest_id;
  END IF;

  INSERT INTO public.scp_interview_reports
    (case_id, version_number, status, draft_ai_run_id, payload, content_hash,
     pack_version_id, pack_content_hash, role_version_id, finalised_by, finalised_at)
  VALUES (_case_id, _next, 'final', _draft_run_id, _payload,
          md5(_payload::text), _c.pack_version_id, _c.pack_content_hash,
          _c.role_version_id, auth.uid(), now())
  RETURNING id INTO _report_id;

  UPDATE public.scp_interview_reports
     SET status = 'superseded'
   WHERE case_id = _case_id AND id <> _report_id AND status = 'final';

  IF _c.status <> 'reported' THEN
    PERFORM public.scp_iv_set_case_status(_case_id, 'reported');
  END IF;
  PERFORM public.scp_iv_record_event(_case_id, 'report_finalised', 'human', NULL,
    _c.status, 'reported', NULL,
    jsonb_build_object('report_id', _report_id, 'version', _next,
                       'content_hash', md5(_payload::text)));

  -- Complete the provenance chain in the graph, tenant-scoped: this report now
  -- carries these confirmed evidence items and these human assessments.
  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'confirmed_evidence', ev.id, 'reported_in', 'report_conclusion', _report_id,
         _c.employer_id, 'Confirmed evidence included in the finalised report.'
    FROM public.scp_interview_evidence ev WHERE ev.case_id = _case_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'human_assessment', a.id, 'assessed_against', 'rating_anchor', a.anchor_id,
         _c.employer_id, 'Human judgement recorded against a governed anchor.'
    FROM public.scp_interview_assessments a
   WHERE a.case_id = _case_id AND a.superseded_by IS NULL
  ON CONFLICT DO NOTHING;

  RETURN _report_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_panel_open(_case_id uuid, _member_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _panel uuid; _employer uuid; _m uuid;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(array_length(_member_ids, 1), 0) < 2 THEN
    RAISE EXCEPTION
      'SCP_IV_PANEL_TOO_SMALL: a panel needs at least two reviewers. One person assessing alone is an assessment, and the product already supports that.'
      USING ERRCODE = 'check_violation';
  END IF;

  _employer := public.scp_iv_case_employer(_case_id);

  INSERT INTO public.scp_interview_panels (case_id, opened_by)
  VALUES (_case_id, auth.uid())
  ON CONFLICT (case_id) DO NOTHING
  RETURNING id INTO _panel;
  IF _panel IS NULL THEN
    SELECT id INTO _panel FROM public.scp_interview_panels WHERE case_id = _case_id;
  END IF;

  FOREACH _m IN ARRAY _member_ids LOOP
    -- Every reviewer must be a member of THIS employer. A panel is not a way
    -- to show a candidate's interview to somebody outside the organisation.
    IF NOT public.has_employer_role(_m, _employer, NULL) THEN
      RAISE EXCEPTION
        'SCP_IV_PANEL_MEMBER_NOT_EMPLOYER: every panel reviewer must belong to this employer.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO public.scp_interview_panel_members (panel_id, user_id, added_by)
    VALUES (_panel, _m, auth.uid())
    ON CONFLICT (panel_id, user_id) DO NOTHING;
  END LOOP;

  PERFORM public.scp_iv_record_event(_case_id, 'panel_opened', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('members', coalesce(array_length(_member_ids, 1), 0)));
  RETURN _panel;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_start_choices(_employer_id uuid, _assessment_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(role_group text, role_profile text, environment text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.role_group, p.role_profile, l.environment
    FROM public.scp_recruitment_content_links l
    JOIN public.scp_recruitment_role_profiles p ON p.role_profile = l.role_profile
   WHERE auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions(_employer_id) s
                   JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
                  WHERE v.pack_id = l.interview_pack_id)
     AND (_assessment_assignment_id IS NULL
          OR l.assessment_definition_id = (
               SELECT av.definition_id FROM public.assessment_assignments aa
                 JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
                WHERE aa.id = _assessment_assignment_id AND aa.employer_id = _employer_id))
   ORDER BY p.role_group, p.role_profile, l.environment;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_iv_start_interview(_employer_id uuid, _application_id uuid, _source_kind text, _source_id uuid, _method text, _pack_version_id uuid DEFAULT NULL::uuid, _role_group text DEFAULT NULL::text, _role_profile text DEFAULT NULL::text, _environment text DEFAULT NULL::text, _title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _app public.job_applications%ROWTYPE;
  _ba public.bcp_assignments%ROWTYPE;
  _profile public.scp_recruitment_role_profiles%ROWTYPE;
  _link public.scp_recruitment_content_links%ROWTYPE;
  _g text := _role_group; _r text := _role_profile; _e text := _environment;
  _record_test_setup boolean := false;
  _need_setup boolean := false;
  _test_def uuid;
  _pack uuid := _pack_version_id;
  _key text;
  _live record;
  _case uuid;
  _candidate uuid;
  _job uuid;
  _name text;
  _case_title text;
  _job_title text;
  _requirements text;
  _advert text;
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _method IS NULL OR _method NOT IN ('trust', 'beskt')
     OR _source_kind IS NULL
     OR _source_kind NOT IN ('assessment_assignment', 'beskt_assignment', 'chosen_setup')
     OR (_source_kind = 'chosen_setup') <> (_source_id IS NULL)
     OR (_source_kind = 'assessment_assignment' AND _method <> 'trust')
     OR (_source_kind = 'beskt_assignment' AND _method <> 'beskt')
     OR (_source_kind = 'chosen_setup' AND _method <> 'trust')
     -- Only an accepted BESKT invitation starts without an application.
     OR (_application_id IS NULL AND _source_kind <> 'beskt_assignment')
     OR (_title IS NOT NULL AND (length(btrim(_title)) = 0 OR length(_title) > 300)) THEN
    RAISE EXCEPTION 'SCP_START_INVALID: that combination of method and source is not a start.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller works here, and the application is this employer's. The same
  -- answer for "not yours" and "does not exist".
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'SCP_START_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL THEN
    SELECT * INTO _app FROM public.job_applications
     WHERE id = _application_id AND employer_id = _employer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_START_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ---- the source, and the setup that belongs to it -------------------------
  IF _source_kind = 'assessment_assignment' THEN
    SELECT av.definition_id INTO _test_def
      FROM public.assessment_assignments aa
      JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
     WHERE aa.id = _source_id AND aa.employer_id = _employer_id
       AND aa.application_id = _application_id
       AND aa.cancelled_at IS NULL
       AND aa.recipient_user_id IS NOT DISTINCT FROM _app.applicant_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_START_SOURCE_MISMATCH: that test does not belong to this application and its candidate.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scp_attempts t
                    WHERE t.assignment_id = _source_id
                      AND t.status IN ('submitted', 'scored', 'released')) THEN
      RAISE EXCEPTION 'SCP_START_TEST_NOT_COMPLETE: the candidate has not submitted this test.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT s.role_group, s.role_profile, s.environment INTO _g, _r, _e
      FROM public.scp_assessment_setups s WHERE s.assessment_assignment_id = _source_id;
    IF NOT FOUND THEN
      _g := _role_group; _r := _role_profile; _e := _environment;
      _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
      _record_test_setup := true;    -- recorded after every check has passed
    ELSIF _role_group IS NOT NULL
          AND (_g, _r, _e) IS DISTINCT FROM (_role_group, _role_profile, _environment) THEN
      RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this test was sent with a different setup.'
        USING ERRCODE = 'check_violation';
    END IF;
    _key := 'assessment:' || _source_id::text;

  ELSIF _source_kind = 'beskt_assignment' THEN
    SELECT * INTO _ba FROM public.bcp_assignments b
     WHERE b.id = _source_id AND b.employer_id = _employer_id;
    -- A security vetting's employer party is the security function alone
    -- (bcp_employer_party), so a plain member is refused here.
    IF NOT FOUND OR _ba.lifecycle_state = 'cancelled' OR NOT public.bcp_employer_party(_ba.id)
       OR (_application_id IS NULL
           AND (_ba.application_id IS NOT NULL OR _ba.invitation_id IS NULL))
       OR (_application_id IS NOT NULL
           AND (_ba.application_id IS DISTINCT FROM _application_id
                OR _ba.candidate_user_id IS DISTINCT FROM _app.applicant_user_id)) THEN
      RAISE EXCEPTION 'SCP_START_SOURCE_MISMATCH: that BESKT assignment is not one you may carry into an interview.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT s.role_group, s.role_profile, s.environment INTO _g, _r, _e
      FROM public.scp_recruitment_setups s WHERE s.beskt_assignment_id = _source_id;
    IF FOUND THEN
      IF _role_group IS NOT NULL
         AND (_g, _r, _e) IS DISTINCT FROM (_role_group, _role_profile, _environment) THEN
        RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this BESKT assignment has a different setup.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      _g := _role_group; _r := _role_profile; _e := _environment;
      _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
    END IF;
    _key := 'beskt:' || _source_id::text;

  ELSE
    _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
  END IF;

  -- No setup from the source and none chosen: an explicitly chosen GUIDE
  -- names its role through its one general-environment content link.
  -- Anything else -- no guide, or a guide linked more than once -- is an
  -- explicit choice the employer still has to make. Nothing is guessed.
  IF _need_setup THEN
    IF _pack_version_id IS NOT NULL THEN
      SELECT count(*) INTO _n
        FROM public.scp_recruitment_content_links l
        JOIN public.scp_interview_pack_versions v ON v.pack_id = l.interview_pack_id
       WHERE v.id = _pack_version_id AND l.environment = 'general';
    END IF;
    IF _pack_version_id IS NULL OR _n <> 1 THEN
      RAISE EXCEPTION 'SCP_START_SETUP_REQUIRED: there is no setup for this start; choose one explicitly.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT p.role_group, p.role_profile, l.environment INTO _g, _r, _e
      FROM public.scp_recruitment_content_links l
      JOIN public.scp_recruitment_role_profiles p ON p.role_profile = l.role_profile
      JOIN public.scp_interview_pack_versions v ON v.pack_id = l.interview_pack_id
     WHERE v.id = _pack_version_id AND l.environment = 'general';
  END IF;
  IF _source_kind = 'chosen_setup' THEN
    _key := format('setup:%s:%s:%s:%s:%s', _application_id, _method, _g, _r, _e);
  END IF;

  -- ---- the setup against the content model, before any write -----------------
  SELECT * INTO _profile FROM public.scp_recruitment_role_profiles WHERE role_profile = _r;
  IF NOT FOUND OR _profile.role_group <> _g THEN
    RAISE EXCEPTION 'SCP_START_SETUP_INCOMPATIBLE: that role profile is not a role of that role group.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _link FROM public.scp_recruitment_content_links
   WHERE role_profile = _r AND environment = _e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_START_NO_CONTENT: there is no interview content for that role in that environment.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _source_kind = 'assessment_assignment'
     AND _link.assessment_definition_id IS DISTINCT FROM _test_def THEN
    RAISE EXCEPTION 'SCP_START_TEST_MISMATCH: the test the candidate took is not the test of that role.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _pack_version_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.scp_interview_pack_versions v
        WHERE v.id = _pack_version_id AND v.pack_id = _link.interview_pack_id) THEN
    RAISE EXCEPTION 'SCP_START_GUIDE_MISMATCH: that interview guide is not the guide of this setup.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- serialise on the start itself --------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended('scp_iv_start:' || _employer_id::text || ':' || _key, 0));

  SELECT s.id, s.interview_case_id, c.cancelled_at, c.status INTO _live
    FROM public.scp_interview_starts s
    JOIN public.scp_interview_cases c ON c.id = s.interview_case_id
   WHERE s.employer_id = _employer_id AND s.start_key = _key AND s.superseded_at IS NULL;
  IF FOUND THEN
    IF _live.cancelled_at IS NULL THEN
      -- Never reveal a case the caller may not read; never replace it either.
      IF NOT public.scp_iv_can_read_case(_live.interview_case_id) THEN
        RAISE EXCEPTION 'SCP_START_NOT_PERMITTED: this start belongs to a case you may not open.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN public.scp_iv_start_result(_live.interview_case_id, false, _method, _g, _r, _e);
    END IF;
    -- A cancelled case releases its start; its row is kept, superseded.
    PERFORM set_config('scp.interview_start_write', 'on', true);
    UPDATE public.scp_interview_starts
       SET superseded_at = now(), superseded_reason = 'case_cancelled'
     WHERE id = _live.id;
    PERFORM set_config('scp.interview_start_write', 'off', true);
  END IF;

  IF _source_kind = 'beskt_assignment' THEN
    -- The case this preparation is already linked to is the safe existing
    -- link: adopted after the read check, never duplicated or replaced.
    SELECT l.case_id AS interview_case_id, c.cancelled_at INTO _live
      FROM public.bcp_case_links l
      JOIN public.scp_interview_cases c ON c.id = l.case_id
     WHERE l.assignment_id = _source_id AND l.unlinked_at IS NULL;
    IF NOT FOUND THEN
      -- A case carried from the assignment before starts existed (20261201).
      SELECT rs.interview_case_id, c.cancelled_at INTO _live
        FROM public.scp_recruitment_setups rs
        JOIN public.scp_interview_cases c ON c.id = rs.interview_case_id
       WHERE rs.beskt_assignment_id = _source_id;
    END IF;
    IF FOUND THEN
      IF _live.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'SCP_START_BESKT_ALREADY_CARRIED: this BESKT assignment was carried into a case that is cancelled.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT public.scp_iv_can_read_case(_live.interview_case_id) THEN
        RAISE EXCEPTION 'SCP_START_NOT_PERMITTED: this start belongs to a case you may not open.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      PERFORM set_config('scp.interview_start_write', 'on', true);
      INSERT INTO public.scp_interview_starts
        (employer_id, application_id, start_key, source_kind, source_id, interview_case_id, created_by)
      VALUES (_employer_id, _application_id, _key, _source_kind, _source_id, _live.interview_case_id, auth.uid());
      PERFORM set_config('scp.interview_start_write', 'off', true);
      RETURN public.scp_iv_start_result(_live.interview_case_id, false, _method, _g, _r, _e);
    END IF;
    -- A new BESKT case is created WITH its governed link, so a security
    -- vetting's case is restricted from the moment it exists.
    IF _ba.lifecycle_state <> 'submitted' THEN
      RAISE EXCEPTION 'SCP_START_BESKT_NOT_SUBMITTED: the candidate has not submitted this preparation yet.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ---- the guide version ---------------------------------------------------
  IF _pack IS NULL THEN
    SELECT s.pack_version_id INTO _pack
      FROM public.scp_iv_startable_pack_versions(_employer_id) s
      JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
     WHERE v.pack_id = _link.interview_pack_id
     ORDER BY v.version_number DESC
     LIMIT 1;
    IF _pack IS NULL THEN
      RAISE EXCEPTION 'SCP_START_NO_GUIDE_AVAILABLE: the guide of this setup is not available to this employer.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ---- create: case, setup, material and link, in this one transaction ------
  IF _record_test_setup THEN
    PERFORM public.scp_record_assessment_setup(_employer_id, _source_id, _g, _r, _e);
  END IF;

  IF _application_id IS NOT NULL THEN
    SELECT c.display_name, c.job_title_sv INTO _name, _job_title
      FROM public.scp_application_candidate(_application_id) c;
    _candidate := _app.applicant_user_id;
    _job := _app.job_id;
  ELSE
    -- An accepted invitation: the account that accepted it, and the name
    -- and role the employer invited under. No application is invented.
    SELECT i.candidate_display_name INTO _name
      FROM public.bcp_invitations i WHERE i.id = _ba.invitation_id;
    _job_title := _ba.role_title;
    _candidate := _ba.candidate_user_id;
    _job := NULL;
  END IF;
  _name := coalesce(nullif(btrim(coalesce(_name, '')), ''), 'Kandidat');
  _case_title := coalesce(nullif(btrim(coalesce(_title, '')), ''),
                          concat_ws(' — ', nullif(btrim(coalesce(_job_title, '')), ''), _name));

  _case := public.scp_iv_create_case(
    _employer_id, _case_title, _pack, _name,
    _candidate,
    CASE WHEN _candidate IS NULL THEN 'APP-' || _application_id::text END,
    _job, _application_id);

  PERFORM public.scp_record_recruitment_setup(
    _employer_id, _method, _g, _r, _e, _case,
    CASE WHEN _source_kind = 'beskt_assignment' THEN _source_id END);

  SELECT string_agg(concat_ws(E'\n', c.code || ' ' || c.name_sv, c.definition_sv), E'\n\n'
                    ORDER BY c.display_order)
    INTO _requirements
    FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id = _pack;
  IF _requirements IS NOT NULL THEN
    PERFORM public.scp_iv_add_source(_case, 'employer_requirements', 'Rollens krav (ur intervjuguiden)',
      _requirements, 'recruitment_interview',
      'Inga personuppgifter: den styrda kravprofilen ur intervjuguiden / No personal data: the guide''s governed requirement profile.',
      'employer_supplied', NULL);
  END IF;
  IF _job IS NOT NULL THEN
    SELECT nullif(concat_ws(E'\n\n', j.title_sv, j.description_sv,
             (SELECT string_agg(x, E'\n') FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(j.responsibilities) = 'array' THEN j.responsibilities ELSE '[]'::jsonb END) x),
             j.requirements_sv), '')
      INTO _advert FROM public.jobs j WHERE j.id = _job AND j.employer_id = _employer_id;
    IF _advert IS NOT NULL THEN
      PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annonsen', _advert,
        'recruitment_interview',
        'Inga personuppgifter: arbetsgivarens publicerade annons / No personal data: the employer''s published advert.',
        'employer_supplied', NULL);
    END IF;
  END IF;

  -- The governed BESKT link: the submitted preparation bound to this case by
  -- the same function the manual link uses -- a pointer to the candidate's
  -- answers, never a copy of them. Its operation id is derived from the case,
  -- so it is this start's and no other's.
  IF _source_kind = 'beskt_assignment' THEN
    PERFORM public.bcp_link_preparation_to_case(
      md5('scp_iv_start_link:' || _case::text)::uuid, _source_id, _case,
      (SELECT revision FROM public.bcp_assignments WHERE id = _source_id));
  END IF;

  PERFORM set_config('scp.interview_start_write', 'on', true);
  INSERT INTO public.scp_interview_starts
    (employer_id, application_id, start_key, source_kind, source_id, interview_case_id, created_by)
  VALUES (_employer_id, _application_id, _key, _source_kind, _source_id, _case, auth.uid());
  PERFORM set_config('scp.interview_start_write', 'off', true);

  RETURN public.scp_iv_start_result(_case, true, _method, _g, _r, _e);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_employer_assignments(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, candidate_user_id uuid, method_name_sv text, method_name_en text, method_version_number integer, content_hash text, lifecycle_state text, assigned_at timestamp with time zone, due_at timestamp with time zone, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.candidate_user_id,
           p.name_sv, p.name_en, v.version_number, a.pinned_content_hash,
           a.lifecycle_state, a.assigned_at, a.due_at, a.submitted_at
      FROM public.bcp_assignments a
      LEFT JOIN public.jobs j ON j.id = a.job_id
      JOIN public.beskt_method_versions v ON v.id = a.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE a.employer_id = _employer_id
       AND (a.mode = 'recruitment_support'
            OR public.bcp_is_security_officer(_employer_id, auth.uid()))
     ORDER BY a.assigned_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_employer_beskt_assignments(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, mode text, application_id uuid, invitation_id uuid, role_title text, candidate_display_name text, method_name_sv text, method_name_en text, lifecycle_state text, assigned_at timestamp with time zone, submitted_at timestamp with time zone, responsible_interviewer_id uuid, case_id uuid, report_finalised boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.mode, a.application_id, a.invitation_id,
         coalesce(a.role_title, j.title_sv),
         coalesce(inv.candidate_display_name,
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)::text,
         p.name_sv, p.name_en, a.lifecycle_state, a.assigned_at, a.submitted_at,
         a.responsible_interviewer_id, l.case_id,
         EXISTS (SELECT 1 FROM public.bcp_conduct_reports r
                  JOIN public.bcp_conduct_sessions s ON s.id = r.session_id
                 WHERE s.assignment_id = a.id AND r.status = 'final')
    FROM public.bcp_assignments a
    LEFT JOIN public.jobs j ON j.id = a.job_id
    LEFT JOIN public.bcp_invitations inv ON inv.id = a.invitation_id
    JOIN auth.users u ON u.id = a.candidate_user_id
    JOIN public.beskt_method_versions v ON v.id = a.method_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
    LEFT JOIN public.bcp_case_links l ON l.assignment_id = a.id AND l.unlinked_at IS NULL
   WHERE a.employer_id = _employer_id
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND (a.mode = 'recruitment_support' OR public.bcp_is_security_officer(_employer_id, auth.uid()))
   ORDER BY a.assigned_at DESC, a.id;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_employer_invitations(_employer_id uuid)
 RETURNS TABLE(invitation_id uuid, invited_email text, candidate_display_name text, role_title text, mode text, state text, created_at timestamp with time zone, expires_at timestamp with time zone, accepted_at timestamp with time zone, assignment_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.invited_email, i.candidate_display_name, i.role_title, i.mode, i.state,
         i.created_at, i.expires_at, i.accepted_at, i.assignment_id
    FROM public.bcp_invitations i
   WHERE i.employer_id = _employer_id
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND (i.mode = 'recruitment_support' OR public.bcp_is_security_officer(_employer_id, auth.uid()))
   ORDER BY i.created_at DESC, i.id;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_employer_party(_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = _assignment_id
       AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member'])
       AND (a.mode = 'recruitment_support'
            OR public.bcp_is_security_officer(a.employer_id, auth.uid())));
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_employer_people(_employer_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, email text, employer_role text, is_security_officer boolean, officer_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)::text,
         u.email::text, m.role,
         o.id IS NOT NULL, o.id
    FROM public.employer_memberships m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.bcp_security_officers o
      ON o.employer_id = m.employer_id AND o.user_id = m.user_id AND o.revoked_at IS NULL
   WHERE m.employer_id = _employer_id
     AND m.status = 'active'
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
   ORDER BY 2, 1;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_internal_test_activations_for(_employer_id uuid DEFAULT NULL::uuid, _method_version_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(activation_id uuid, employer_id uuid, employer_name text, method_version_id uuid, pinned_content_hash text, decision_reference text, decided_by uuid, decided_at timestamp with time zone, expires_on date, revoked_at timestamp with time zone, revoke_reason text, is_live boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.employer_id, e.name, t.method_version_id, t.pinned_content_hash,
         t.decision_reference, t.decided_by, t.decided_at, t.expires_on, t.revoked_at,
         t.revoke_reason,
         public.bcp_internal_test_activation_active(t.employer_id, t.method_version_id)
           AND t.revoked_at IS NULL
    FROM public.bcp_internal_test_activations t
    JOIN public.employers e ON e.id = t.employer_id
   WHERE auth.uid() IS NOT NULL
     AND (_employer_id IS NULL OR t.employer_id = _employer_id)
     AND (_method_version_id IS NULL OR t.method_version_id = _method_version_id)
     AND (public.is_platform_admin(auth.uid())
          OR public.has_employer_role(auth.uid(), t.employer_id, ARRAY['owner', 'admin', 'member'])
          OR EXISTS (SELECT 1 FROM public.bcp_assignments a
                      WHERE a.employer_id = t.employer_id
                        AND a.method_version_id = t.method_version_id
                        AND a.candidate_user_id = auth.uid()))
   ORDER BY t.decided_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.bcp_revoke_invitation(_operation_id uuid, _invitation_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _i public.bcp_invitations%ROWTYPE; _request jsonb; _hash text; _replay jsonb; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_revoke_invitation', 'invitation_id', _invitation_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;
  SELECT * INTO _i FROM public.bcp_invitations WHERE id = _invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _i.employer_id, ARRAY['owner', 'admin', 'member'])
     OR (_i.mode = 'security_vetting_support' AND NOT public.bcp_is_security_officer(_i.employer_id, auth.uid())) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you may not change this invitation.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _i.state <> 'pending' THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_PENDING: this invitation is %.', _i.state USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('bcp.invitation_write', 'on', true);
  UPDATE public.bcp_invitations SET state = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = btrim(_reason) WHERE id = _invitation_id;
  PERFORM set_config('bcp.invitation_write', 'off', true);
  _result := jsonb_build_object('invitation_id', _invitation_id, 'state', 'revoked');
  PERFORM public.bcp_record_event(NULL, NULL, _i.employer_id, _i.method_version_id, 'invitation_revoked',
    'pending', 'revoked', btrim(_reason), _i.pinned_content_hash, NULL, _operation_id, _hash, _result);
  RETURN _result;
END $function$
;

CREATE OR REPLACE FUNCTION public.bcp_conduct_may_record_stance(_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.bcp_conduct_sessions s
      JOIN public.bcp_assignments a ON a.id = s.assignment_id
     WHERE s.id = _session_id
       AND public.scp_iv_can_write_case(s.case_id)
       AND (auth.uid() IN (a.responsible_interviewer_id, a.security_owner_id)
            OR public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin'])));
$function$
;

ALTER POLICY scp_iv_corrections_employer ON public.scp_interview_candidate_corrections
  USING (EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = scp_interview_candidate_corrections.case_id
                    AND public.has_employer_role(auth.uid(), c.employer_id, NULL::text[])));

ALTER POLICY bcp_ita_party_read ON public.bcp_internal_test_activations
  USING (public.is_platform_admin(auth.uid())
         OR public.has_employer_role(auth.uid(), employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_read_case(uuid)'::regprocedure));
  IF _m <> '0407b86c8467b224ddece07781d80fa1' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_can_read_case is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_write_case(uuid)'::regprocedure));
  IF _m <> '26ba3211992ff064f33bddaed8601992' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_can_write_case is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_case_row_visible(uuid,uuid)'::regprocedure));
  IF _m <> '545523b2c45f9aa395b5573a18abeb59' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_case_row_visible is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_is_security_officer(uuid,uuid)'::regprocedure));
  IF _m <> 'ab47910593d1e6a343678d387e92af4e' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_is_security_officer is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)'::regprocedure));
  IF _m <> 'eb9c745d2b7745299c41289c385e9e36' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_confirm_transcript_basis is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_erase_source(uuid,text)'::regprocedure));
  IF _m <> '6f6baf75be4ac14afb8f62799259875f' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_erase_source is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_finalise_previewed_report(uuid,text,uuid)'::regprocedure));
  IF _m <> '4752cbc703b76fb3bae5b5311e2551ec' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_finalise_previewed_report is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_finalise_report(uuid,uuid)'::regprocedure));
  IF _m <> '8e124e8eed46c0365ae3bb45cd44a276' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_finalise_report is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_panel_open(uuid,uuid[])'::regprocedure));
  IF _m <> 'e4036c66903437b1db31e7fbc94fa1f6' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_panel_open is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_start_choices(uuid,uuid)'::regprocedure));
  IF _m <> 'd4d4409834020fc8c0e3f2b8b1cbc03d' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_start_choices is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_start_interview(uuid,uuid,text,uuid,text,uuid,text,text,text,text)'::regprocedure));
  IF _m <> '10a54ca6d5c3487fa94f55d0c4671817' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: scp_iv_start_interview is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_employer_assignments(uuid)'::regprocedure));
  IF _m <> '5ee6d3db3ea731e620699f320bd18d12' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_employer_assignments is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_employer_beskt_assignments(uuid)'::regprocedure));
  IF _m <> '778e1e315eaf326dae586cadd42a9a27' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_employer_beskt_assignments is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_employer_invitations(uuid)'::regprocedure));
  IF _m <> '079ee10bd035e3f853e5f02e7b042e6d' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_employer_invitations is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_employer_party(uuid)'::regprocedure));
  IF _m <> 'aed5c74f73735006cb781e2053518de2' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_employer_party is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_employer_people(uuid)'::regprocedure));
  IF _m <> '084356e474e33a23e21b5db97fa96e22' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_employer_people is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_internal_test_activations_for(uuid,uuid)'::regprocedure));
  IF _m <> 'cc78f125a15599da60fb8ddf14d6eec6' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_internal_test_activations_for is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_revoke_invitation(uuid,uuid,text)'::regprocedure));
  IF _m <> 'ecf9ed3199fb5f81bd8576e5013d12bb' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_revoke_invitation is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_conduct_may_record_stance(uuid)'::regprocedure));
  IF _m <> 'a1e043d6da3c46aa7308a0fb3ba149df' THEN
    RAISE EXCEPTION 'INTERVIEW_BESKT_ACTIVE_ROLLBACK: bcp_conduct_may_record_stance is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'INTERVIEW_BESKT_ACTIVE_ROLLBACK ok: hosted pre-fix bodies in place';
END $$;
