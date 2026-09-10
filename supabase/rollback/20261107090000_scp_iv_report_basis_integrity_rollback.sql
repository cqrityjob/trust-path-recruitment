-- Rollback for 20261107090000_scp_iv_report_basis_integrity.
--
-- Returns finalisation to the 20261020090000 contract, VERBATIM: the
-- two-argument scp_iv_finalise_report(uuid, uuid) with its md5 hash and its
-- single-assessor snapshot, and the immutability guard as 20260920090000
-- defined it. Drops the builder, the preview, the three readbacks, the two
-- hash rules and the assessment-domain identity projection this migration
-- added.
--
-- WHAT THIS DOES NOT DO, AND MUST NOT: it does not drop content_hash_algorithm
-- or basis_hash and it does not touch a single finalised report. Reports
-- finalised under this migration carry a real sha256 digest, and the column is
-- how a reader knows that. Dropping it would leave a sha256 hash that every
-- reader would then interpret as md5 -- turning a correct integrity claim into
-- a false one. Both columns are additive and nullable, so leaving them costs
-- nothing and removing them destroys evidence.
--
-- Run inside the caller's transaction.

DROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_preview_report(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_build_report_basis(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_final_report(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_version(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_versions(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_content_hash(jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_basis_hash(jsonb);
DROP FUNCTION IF EXISTS public.scp_employer_report_identity(uuid);

-- ── scp_iv_finalise_report, exactly as 20261020090000 defined it ──────────
CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) TO authenticated, service_role;

-- ── scp_iv_guard_report_immutable, exactly as 20260920090000 defined it ───
CREATE OR REPLACE FUNCTION public.scp_iv_guard_report_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'final' THEN RETURN NEW; END IF;
  -- A final report may only be superseded by a later version.
  IF NEW.status = 'superseded' AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'SCP_IV_REPORT_IMMUTABLE: a finalised report is never edited. Create a new report version instead.'
    USING ERRCODE = 'check_violation';
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_report_immutable() FROM PUBLIC, anon, authenticated;

DO $rb$
DECLARE _fn text; _src text;
BEGIN
  FOR _fn IN SELECT unnest(ARRAY['scp_iv_preview_report','scp_iv_build_report_basis',
      'scp_iv_final_report','scp_iv_report_version','scp_iv_report_versions',
      'scp_iv_content_hash','scp_iv_basis_hash','scp_employer_report_identity']) LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname=_fn) THEN
      RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: % survived', _fn;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report' AND p.pronargs = 3) THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the three-argument finalisation survived';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report' AND p.pronargs = 2;
  IF _src IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the two-argument finalisation was not restored';
  END IF;
  -- Restored means the OLD contract, byte for byte in the parts that matter:
  -- md5, status_at_report idempotency, no preview requirement.
  IF position('md5(_payload::text)' in _src) = 0 OR position('status_at_report' in _src) = 0
     OR position('SCP_IV_STALE_PREVIEW' in _src) > 0 OR position('scp_iv_build_report_basis' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the restored finalisation is not the 20261020090000 contract';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_guard_report_immutable';
  IF _src ~ 'OLD\.status = ''superseded''' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the guard was not restored to its 20260920090000 body';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='scp_interview_reports'
                    AND column_name='content_hash_algorithm') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS_ROLLBACK: the algorithm column was dropped, which would misread every sha256 report as md5';
  END IF;
  RAISE NOTICE 'SCP_IV_REPORT_BASIS_ROLLBACK ok';
END $rb$;
