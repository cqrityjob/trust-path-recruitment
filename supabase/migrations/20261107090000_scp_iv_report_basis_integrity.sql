-- =============================================================================
-- The employer final report: a provable, deterministic basis; preview that
-- equals finalisation; every assessor; and a governed readback.
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────
--
-- The employer final report is the canonical output of the assessment and
-- interview process. An authorised recruitment owner reviews it, explicitly
-- finalises it, and uses it as DECISION SUPPORT. It is never an automatic
-- recommendation, ranking, total score, pass/fail or employment decision, and
-- it is never automatically shared with the candidate.
--
-- The snapshot already froze the reviewed evidence, the human assessments and
-- the unresolved findings. What it did not do, and what this migration does:
--
--   1. EVERY ASSESSOR, IN A FIXED ORDER. The builder picked a human
--      assessment with LIMIT 1 and no ORDER BY: on a two-person panel, which
--      judgement reached the report depended on physical row order. Every
--      live assessment now travels, ordered by (assessor, moment, id), with
--      the panel's own concluded statement beside them and disagreement stated
--      rather than resolved by accident. No assessment is inferred from
--      insertion order or timestamp; none is promoted over another.
--
--   2. A DETERMINISTIC PAYLOAD. jsonb normalises object keys, not array
--      order. Every aggregate now carries a complete ORDER BY with an
--      immutable tie-breaker, so the same basis produces the same bytes, the
--      same digest, and no extra version -- whatever order rows were written
--      or rewritten in. The suite proves it by reordering the heap.
--
--   3. NO FALSE VERIFICATION. A Passport passage was classified
--      verified_material by virtue of the source kind alone. The interview
--      side does not persist which claim a passage came from, and the builder
--      must not read the Passport claim table (ER5.8), so verification cannot
--      be proven per item and is not claimed: the classification is the
--      neutral passport_disclosure. A self-declared and a verified claim in
--      the same disclosure classify identically, and the suite proves it.
--
--   4. THE ASSESSMENT RESULT, NOT JUST ITS ID. An attempt id and a status say
--      the assessment happened, not what it found. The report now carries the
--      released employer document for each attempt on the application through
--      the assessment domain's OWN governed projection, bound to the exact
--      snapshot id, report version and a sha256 of the projected content.
--      TR12.3 is respected: no scp_iv_ function names the snapshot table.
--
--   5. A REAL HASH, NAMED. Core sha256 instead of md5, with the algorithm
--      recorded beside it. Existing rows are not rewritten -- the immutability
--      guard forbids it -- so NULL means md5 and the readback says so.
--
--   6. PREVIEW EQUALS FINALISATION. One builder serves both. Preview returns
--      the complete payload with the basis hash; finalisation REQUIRES that
--      hash and refuses with SCP_IV_STALE_PREVIEW when the basis has moved,
--      so the owner finalises exactly what they read.
--
--   7. THE ACTOR, BY NAME. The readback resolves the finalising actor to a
--      display name and account address rather than a bare uuid.
--
-- ── WHY sha256() AND NOT pgcrypto's digest() ───────────────────────────
--
-- 20260811100000 and 20260817150000 are both scar tissue from one mistake:
-- pgcrypto lives in the `extensions` schema on the hosted project, every
-- SECURITY DEFINER function here pins its search_path, and digest() could not
-- resolve. Finalising a report is a CORE path. sha256(bytea) is core Postgres
-- in pg_catalog: no extension, no widened search_path, no allowlist entry.
--
-- ── WHY EXISTING REPORTS ARE NOT BACKFILLED ────────────────────────────
--
-- scp_iv_guard_report_immutable refuses every UPDATE of a finalised report
-- except the supersede transition. A finalised report is never edited, not
-- even to annotate it. content_hash_algorithm and basis_hash are NULLABLE and
-- NULL means "finalised before this was recorded".
--
-- ADDITIVE, except that scp_iv_finalise_report(uuid, uuid) is REPLACED by a
-- signature that requires the previewed basis hash. The rollback restores the
-- 20261020090000 function and guard verbatim.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Which algorithm produced the stored hash, and the basis that was
--     previewed.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.scp_interview_reports
  ADD COLUMN IF NOT EXISTS content_hash_algorithm text;
ALTER TABLE public.scp_interview_reports
  ADD COLUMN IF NOT EXISTS basis_hash text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'scp_interview_reports_hash_algorithm') THEN
    ALTER TABLE public.scp_interview_reports
      ADD CONSTRAINT scp_interview_reports_hash_algorithm
      CHECK (content_hash_algorithm IS NULL
             OR content_hash_algorithm IN ('md5', 'sha256'));
  END IF;
END $$;

COMMENT ON COLUMN public.scp_interview_reports.content_hash_algorithm IS
  'Algorithm behind content_hash. NULL means md5: finalised before the algorithm was recorded, and never rewritten because a finalised report is immutable.';
COMMENT ON COLUMN public.scp_interview_reports.basis_hash IS
  'sha256 of the payload with case.status_at_report removed: the identity the owner previewed and then finalised. NULL on reports finalised before preview was required.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · A superseded version is history, and history is not editable either.
--
--     Found by this migration's own suite. The guard opened with
--     `IF OLD.status <> 'final' THEN RETURN NEW`, right about drafts and
--     wrong about superseded versions: once version 2 exists, version 1 is
--     the record of what a recruitment owner actually finalised and used.
--     "A correction creates a new version while PRESERVING the previous one"
--     is not preserved by a rule that lets the previous one be rewritten.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_guard_report_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION
      'SCP_IV_REPORT_IMMUTABLE: a superseded report version is the record of what was finalised. It is never edited.'
      USING ERRCODE = 'check_violation';
  END IF;
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

-- ─────────────────────────────────────────────────────────────────────────
-- 2b · A finding can be recorded again.
--
--     Found by the E4 browser-evidence fixture. The origin guard from
--     20261020090000 is attached to scp_interview_findings as well as to the
--     two evidence tables, and opens with `IF NEW.note_id IS NOT NULL` --
--     a column findings do not have. plpgsql resolves the field when the
--     statement runs, so EVERY insert or update on scp_interview_findings
--     has raised "record new has no field note_id" since that migration:
--     scp_iv_record_findings cannot write, and the report's `unresolved`
--     section could only ever be empty. No suite inserted a finding, so
--     nothing noticed.
--
--     The note branch is now entered only for the two tables that carry the
--     column, exactly as the dimension and competency branches already were.
--     Nothing else in the guard changes. This is a defect fix and the
--     rollback leaves it in place.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_guard_evidence_origin_in_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _note_case uuid; _passage_case uuid; _dim_question uuid;
  _comp_pack uuid; _case_pack uuid;
BEGIN
  -- Findings carry no note link. plpgsql resolves the record's note field
  -- when the statement first runs, so the branch is entered only for the two
  -- tables that have the column; on scp_interview_findings it would raise
  -- "record new has no field" for every row, whatever its content.
  IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN
    IF NEW.note_id IS NOT NULL THEN
      SELECT s.case_id INTO _note_case
        FROM public.scp_interview_session_notes n
        JOIN public.scp_interview_sessions s ON s.id = n.session_id
       WHERE n.id = NEW.note_id;
      IF _note_case IS NULL OR _note_case <> NEW.case_id THEN
        RAISE EXCEPTION
          'SCP_IV_EVIDENCE_ORIGIN_MISMATCH: the cited interview note belongs to a different case. Evidence never travels between interviews.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.source_passage_id IS NOT NULL THEN
    SELECT src.case_id INTO _passage_case
      FROM public.scp_interview_source_passages p
      JOIN public.scp_interview_case_sources src ON src.id = p.source_id
     WHERE p.id = NEW.source_passage_id;
    IF _passage_case IS NULL OR _passage_case <> NEW.case_id THEN
      RAISE EXCEPTION
        'SCP_IV_EVIDENCE_ORIGIN_MISMATCH: the cited source passage belongs to a different case. Evidence never travels between interviews.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Findings carry a question and a passage but no dimension or competency.
  IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN
    IF NEW.evidence_dimension_id IS NOT NULL THEN
      SELECT d.question_id INTO _dim_question
        FROM public.scp_interview_evidence_dimensions d WHERE d.id = NEW.evidence_dimension_id;
      IF _dim_question IS NULL OR _dim_question <> NEW.question_id THEN
        RAISE EXCEPTION
          'SCP_IV_EVIDENCE_DIMENSION_MISMATCH: the evidence dimension belongs to a different question.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.pack_competency_id IS NOT NULL THEN
      SELECT c.pack_version_id INTO _comp_pack
        FROM public.scp_interview_pack_competencies c WHERE c.id = NEW.pack_competency_id;
      SELECT pack_version_id INTO _case_pack
        FROM public.scp_interview_cases WHERE id = NEW.case_id;
      IF _comp_pack IS NULL OR _case_pack IS NULL OR _comp_pack <> _case_pack THEN
        RAISE EXCEPTION
          'SCP_IV_EVIDENCE_COMPETENCY_MISMATCH: the requirement belongs to a pack this case did not pin.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · The hash rules, written once.
-- ─────────────────────────────────────────────────────────────────────────

-- Over the whole stored payload: what a reader recomputes to prove the row.
CREATE OR REPLACE FUNCTION public.scp_iv_content_hash(_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');
$$;

-- Over the basis alone: the payload minus the one field that is not basis,
-- the case status at the moment of finalisation. This is the identity a
-- preview hands to the owner and finalisation demands back, and the identity
-- idempotency compares. Two previews of the same material yield the same
-- basis hash whatever the case status happens to be.
CREATE OR REPLACE FUNCTION public.scp_iv_basis_hash(_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT encode(sha256(convert_to((_payload #- '{case,status_at_report}')::text, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.scp_iv_content_hash(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scp_iv_basis_hash(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_content_hash(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scp_iv_basis_hash(jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3b · A narrow, domain-owned identity projection for a released employer
--      document. Named in the ASSESSMENT domain (scp_, not scp_iv_) because it
--      is that domain's fact: which snapshot, which report version, when.
--      scp_employer_report returns the content; it does not return the
--      identifiers a binding needs. Gated by exactly the predicate every other
--      audience read uses, so it discloses nothing scp_employer_report would
--      not. Zero rows for a non-member, another organisation, or an attempt
--      that has not been released.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_employer_report_identity(_attempt_id uuid)
RETURNS TABLE (
  snapshot_id uuid,
  report_version_id uuid,
  released_at timestamptz,
  scoring_model_version text,
  threshold_version text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.report_version_id, s.released_at, s.scoring_model_version, s.threshold_version
    FROM public.scp_report_snapshots s
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$$;

REVOKE ALL ON FUNCTION public.scp_employer_report_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_report_identity(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · The builder. One function, called by preview AND by finalisation, so
--     what the owner reads is what the owner locks.
--
--     Not client-executable. It is reached only through scp_iv_preview_report
--     (anyone who may read the case) and scp_iv_finalise_report (owner or
--     admin), both SECURITY DEFINER.
--
--     Every jsonb_agg carries an ORDER BY ending in an immutable id. jsonb
--     normalises object keys; it does NOT normalise array order, and a
--     payload whose arrays follow heap order is a payload whose digest
--     changes when nothing did.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_build_report_basis(_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _payload jsonb;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- Built ONLY from confirmed evidence and recorded human assessments. The
  -- proposals table is not read here, and cannot be.
  SELECT jsonb_build_object(
    'case', jsonb_build_object(
      'title', _c.title,
      'candidate', _c.candidate_display_name,
      'employer_id', _c.employer_id,
      'status_at_report', _c.status,
      -- The interview method, by name, in both languages, so the locked
      -- document can say what it was built with without a live lookup.
      'pack_name_sv', (SELECT p.name_sv FROM public.scp_interview_pack_versions v
                         JOIN public.scp_interview_packs p ON p.id = v.pack_id
                        WHERE v.id = _c.pack_version_id),
      'pack_name_en', (SELECT p.name_en FROM public.scp_interview_pack_versions v
                         JOIN public.scp_interview_packs p ON p.id = v.pack_id
                        WHERE v.id = _c.pack_version_id),
      'pack_version_number', (SELECT v.version_number FROM public.scp_interview_pack_versions v
                               WHERE v.id = _c.pack_version_id),
      'pack_validation_label', (SELECT v.validation_label FROM public.scp_interview_pack_versions v
                                 WHERE v.id = _c.pack_version_id)),

    -- WHICH RECRUITMENT THIS IS: persisted identifiers and the advert's own
    -- titles. Never the case's internal title, which is what a recruiter
    -- typed for themselves. Null when the case is standalone: a null says
    -- "this case names no advertised role", which must never be filled in.
    'recruitment', jsonb_build_object(
      'application_id', _c.application_id,
      'job_id', _c.job_id,
      'advertised_role_sv', (SELECT j.title_sv FROM public.jobs j WHERE j.id = _c.job_id),
      'advertised_role_en', (SELECT j.title_en FROM public.jobs j WHERE j.id = _c.job_id)),

    -- WHEN THE CONVERSATION HAPPENED AND WHO HELD IT, from the session
    -- record. The interviewer names are the free-text field the session
    -- carries; no note content travels.
    'interview', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'session_id', s.id,
               'status', s.status,
               'started_at', s.started_at,
               'completed_at', s.completed_at,
               'interviewer_names', s.interviewer_names)
             ORDER BY s.started_at NULLS LAST, s.id)
        FROM public.scp_interview_sessions s
       WHERE s.case_id = _case_id), '[]'::jsonb),

    -- THE ASSESSMENT MATERIAL THE PROCESS RAN ON, AND WHAT IT FOUND.
    --
    -- Identity from the assignment and attempt rows; the RESULT through the
    -- assessment domain's own governed employer projection, exactly as the
    -- employer already reads it: per-competency maturity, the audience brief
    -- with every internal mean and spread removed, the human findings, the
    -- context and the template limitations. That projection carries no
    -- aggregate judgement of any kind, and none is added here.
    --
    -- Bound to the exact document: snapshot id, report version id, release
    -- moment, and a sha256 over the projected content, so a later re-release
    -- of the assessment cannot silently change what this report was built on.
    -- Null, and said to be null, when nothing has been released or the caller
    -- may not read it -- never an empty object pretending to be a result.
    'assessment_material', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'attempt_id', at.id,
               'assignment_id', asg.id,
               'assessment_version_id', at.assessment_version_id,
               'attempt_status', at.status,
               'employer_report', (
                 SELECT jsonb_build_object(
                          'snapshot_id', er.id,
                          'report_version_id', ident.report_version_id,
                          'released_at', ident.released_at,
                          'scoring_model_version', ident.scoring_model_version,
                          'threshold_version', ident.threshold_version,
                          'competencies', er.payload,
                          'brief', er.brief,
                          'findings', er.safety_flags,
                          'context', er.context,
                          'limitations_sv', to_jsonb(er.limitations_sv),
                          'limitations_en', to_jsonb(er.limitations_en),
                          'snapshot_hash', encode(sha256(convert_to(jsonb_build_object(
                              'competencies', er.payload,
                              'brief', er.brief,
                              'findings', er.safety_flags,
                              'context', er.context)::text, 'UTF8')), 'hex'))
                   FROM public.scp_employer_report(at.id) er
                   JOIN public.scp_employer_report_identity(at.id) ident ON ident.snapshot_id = er.id
                  ORDER BY er.id
                  LIMIT 1))
             ORDER BY at.id)
        FROM public.assessment_assignments asg
        JOIN public.scp_attempts at ON at.assignment_id = asg.id
       WHERE _c.application_id IS NOT NULL
         AND asg.application_id = _c.application_id
         AND asg.employer_id = _c.employer_id), '[]'::jsonb),

    'pinned', jsonb_build_object(
      'pack_version_id', _c.pack_version_id,
      'pack_content_hash', _c.pack_content_hash,
      'role_version_id', _c.role_version_id),

    'sources', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', s.source_kind, 'label', s.label,
               'purpose', s.purpose_code, 'origin', s.origin,
               'disclosure_backed', s.disclosure_id IS NOT NULL)
             ORDER BY s.created_at, s.id)
        FROM public.scp_interview_case_sources s
       WHERE s.case_id = _case_id), '[]'::jsonb),

    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', q.id,
               'code', q.code, 'order', q.display_order,
               'prompt_sv', q.prompt_sv, 'prompt_en', q.prompt_en,
               -- The role requirement this question is FOR, primary first,
               -- so the document assesses against requirements rather than
               -- listing questions.
               'requirement', (
                 SELECT jsonb_build_object('code', pc.code, 'name_sv', pc.name_sv, 'name_en', pc.name_en)
                   FROM public.scp_interview_question_competencies qc
                   JOIN public.scp_interview_pack_competencies pc ON pc.id = qc.pack_competency_id
                  WHERE qc.question_id = q.id
                  ORDER BY qc.is_primary DESC, pc.display_order, pc.code, qc.id
                  LIMIT 1),
               'evidence', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', ev.id,
                          'excerpt', ev.excerpt, 'origin', ev.origin,
                          'confirmed_by', ev.confirmed_by, 'confirmed_at', ev.confirmed_at,
                          'was_corrected', ev.original_excerpt IS NOT NULL,
                          -- WHAT KIND OF THING THIS IS, from the identifiers
                          -- the row already carries and nothing else. The
                          -- link's existence, not the note's contents: this
                          -- builder must not read the note table, so that a
                          -- note edited afterwards cannot change what a
                          -- locked report was built from.
                          --
                          -- A Passport passage is classified NEUTRALLY. The
                          -- interview side does not persist which claim a
                          -- passage came from, and this builder must not read
                          -- the Passport claim table, so verification cannot
                          -- be proven per item and is not claimed.
                          'classification',
                          CASE
                            WHEN ev.note_id IS NOT NULL THEN 'interviewer_observation'
                            WHEN ev.source_passage_id IS NOT NULL THEN (
                              SELECT CASE s.source_kind
                                       WHEN 'transcript'            THEN 'candidate_statement'
                                       WHEN 'candidate_cv'          THEN 'candidate_supplied_document'
                                       WHEN 'application_answers'   THEN 'candidate_supplied_document'
                                       WHEN 'passport_disclosure'   THEN 'passport_disclosure'
                                       WHEN 'interviewer_notes'     THEN 'interviewer_observation'
                                       WHEN 'job_description'       THEN 'employer_supplied_material'
                                       WHEN 'employer_requirements' THEN 'employer_supplied_material'
                                       ELSE 'unclassified' END
                                FROM public.scp_interview_source_passages sp
                                JOIN public.scp_interview_case_sources s ON s.id = sp.source_id
                               WHERE sp.id = ev.source_passage_id)
                            ELSE 'unattributed'
                          END)
                        ORDER BY ev.confirmed_at, ev.id)
                   FROM public.scp_interview_evidence ev
                  WHERE ev.case_id = _case_id AND ev.question_id = q.id), '[]'::jsonb),
               -- EVERY live human assessment, not one of them. Ordered by
               -- assessor, then moment, then id: fixed, and meaning nothing.
               -- A level and its rationale are a HUMAN INTERPRETATION of the
               -- evidence above, and are named as such.
               'assessments', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', a.id,
                          'level', a.level, 'rationale', a.rationale,
                          'uncertainty', a.uncertainty_note,
                          'assessor_id', a.assessor_id, 'assessed_at', a.assessed_at,
                          'anchor_sv', an.anchor_sv, 'anchor_en', an.anchor_en,
                          'level_meaning_sv', an.label_sv, 'level_meaning_en', an.label_en,
                          'counts_toward_aggregation', an.counts_toward_aggregation,
                          'kind', 'human_interpretation')
                        ORDER BY a.assessor_id, a.assessed_at, a.id)
                   FROM public.scp_interview_assessments a
                   JOIN public.scp_interview_rating_anchors an ON an.id = a.anchor_id
                  WHERE a.case_id = _case_id AND a.question_id = q.id
                    AND a.superseded_by IS NULL), '[]'::jsonb),
               'assessor_count', (
                 SELECT count(*) FROM public.scp_interview_assessments a
                  WHERE a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL),
               -- Disagreement is stated, never averaged away.
               'levels_agree', (
                 SELECT count(DISTINCT a.level) <= 1 FROM public.scp_interview_assessments a
                  WHERE a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL)
             ) ORDER BY q.display_order, q.code, q.id)
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _c.pack_version_id), '[]'::jsonb),

    -- The panel's own concluded statement: the only persisted, authorised
    -- consolidation that exists, and it is prose by a named human. There is
    -- no numeric conclusion, no average and no vote, by design.
    'panel', (
      SELECT jsonb_build_object(
               'state', p.state,
               'conclusion', p.conclusion,
               'concluded_by', p.concluded_by,
               'concluded_at', p.concluded_at,
               'member_count', (SELECT count(*) FROM public.scp_interview_panel_members m
                                 WHERE m.panel_id = p.id))
        FROM public.scp_interview_panels p WHERE p.case_id = _case_id),

    'unresolved', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id,
               'kind', f.finding_kind, 'statement', f.statement,
               'state', f.resolution_state,
               'category', 'missing_or_contradictory')
             ORDER BY f.created_at, f.id)
        FROM public.scp_interview_findings f
       WHERE f.case_id = _case_id
         AND f.resolution_state IN ('open','needs_verification','unresolved_difference')), '[]'::jsonb),

    'ai_disclosure', jsonb_build_object(
      'runs', coalesce((
        SELECT jsonb_agg(r ORDER BY r ->> 'task', r ->> 'task_version', r ->> 'prompt_version',
                                    r ->> 'policy_version', r ->> 'provider', r ->> 'model')
          FROM (
            SELECT DISTINCT jsonb_build_object(
                     'task', r.task, 'task_version', r.task_version,
                     'prompt_version', r.prompt_version, 'policy_version', r.policy_version,
                     'provider', r.provider, 'model', r.model) AS r
              FROM public.scp_interview_ai_runs r
             WHERE r.case_id = _case_id AND r.status = 'succeeded') runs), '[]'::jsonb),
      'statement',
      'AI har förberett, extraherat och föreslagit. Varje uppgift i denna rapport är bekräftad av en namngiven människa. AI har inte poängsatt, rangordnat eller rekommenderat, och AI har inte fattat anställningsbeslutet.'),
    'decision_boundary',
    'Denna rapport är beslutsstöd. Anställningsbeslutet fattas av behörig människa hos arbetsgivaren och dokumenteras utanför detta underlag.'
  ) INTO _payload;

  RETURN _payload;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_build_report_basis(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Preview: the complete payload, its basis identity, and its digest.
--     Anyone who may read the case may preview. Writes nothing, records
--     nothing: a preview that recorded having happened would be one step
--     from a consent the product collected without asking.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_preview_report(_case_id uuid)
RETURNS TABLE(
  payload jsonb,
  basis_hash text,
  content_hash text,
  blocker_count integer,
  blockers jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: previewing a report requires membership of the case''s employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _p := public.scp_iv_build_report_basis(_case_id);
  RETURN QUERY
    SELECT _p,
           public.scp_iv_basis_hash(_p),
           public.scp_iv_content_hash(_p),
           (SELECT count(*)::integer FROM public.scp_iv_report_blockers(_case_id)),
           coalesce((SELECT jsonb_agg(jsonb_build_object('code', b.code, 'message', b.message)
                                      ORDER BY b.code, b.message)
                       FROM public.scp_iv_report_blockers(_case_id) b), '[]'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_preview_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_preview_report(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6 · Finalisation. Requires the basis hash the owner previewed.
--
--     The two-argument signature is REPLACED, not overloaded: an overload
--     that finalised without a preview would be a way to finalise what was
--     never read. The guards travel in the same order as before -- the case
--     lock, the owner/admin requirement, the blocker sweep -- and the preview
--     check sits after them, so a member learns nothing about a case's
--     readiness or basis by probing this call.
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, uuid);

CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(
  _case_id uuid, _expected_basis_hash text, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_finalise_report(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_finalise_report(uuid, text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7 · The governed readback.
--
--     Reading the table tells you what a row SAYS. These reads RECOMPUTE the
--     digest from the stored payload and return the verdict beside it, so
--     integrity is proved rather than claimed. They resolve the finalising
--     actor to a name and account address: a uuid is an identity, not an
--     answer to "who did this".
--
--     Employer-side only: access is exactly scp_iv_can_read_case, the same
--     tenant rule the table's own RLS policy uses. The candidate is not a
--     member of the employer and reaches neither.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_final_report(_case_id uuid)
RETURNS TABLE(
  report_id uuid,
  case_id uuid,
  version_number integer,
  status text,
  finalised_at timestamptz,
  finalised_by uuid,
  finalised_by_name text,
  finalised_by_email text,
  content_hash text,
  content_hash_algorithm text,
  basis_hash text,
  recomputed_hash text,
  hash_verified boolean,
  payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.case_id, r.version_number, r.status,
         r.finalised_at, r.finalised_by,
         (SELECT p.display_name FROM public.profiles p WHERE p.id = r.finalised_by),
         (SELECT u.email::text FROM auth.users u WHERE u.id = r.finalised_by),
         r.content_hash,
         coalesce(r.content_hash_algorithm, 'md5'),
         r.basis_hash,
         CASE coalesce(r.content_hash_algorithm, 'md5')
           WHEN 'sha256' THEN public.scp_iv_content_hash(r.payload)
           ELSE md5(r.payload::text)
         END,
         r.content_hash IS NOT NULL AND r.content_hash =
           CASE coalesce(r.content_hash_algorithm, 'md5')
             WHEN 'sha256' THEN public.scp_iv_content_hash(r.payload)
             ELSE md5(r.payload::text)
           END,
         r.payload
    FROM public.scp_interview_reports r
   WHERE r.case_id = _case_id
     AND r.status = 'final'
     AND public.scp_iv_can_read_case(r.case_id)
   ORDER BY r.version_number DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.scp_iv_final_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_final_report(uuid) TO authenticated;

-- One specific finalised-or-superseded version, by id: how an authorised
-- reader opens what was finalised in March after a correction in April.
CREATE OR REPLACE FUNCTION public.scp_iv_report_version(_report_id uuid)
RETURNS TABLE(
  report_id uuid,
  case_id uuid,
  version_number integer,
  status text,
  finalised_at timestamptz,
  finalised_by uuid,
  finalised_by_name text,
  finalised_by_email text,
  content_hash text,
  content_hash_algorithm text,
  basis_hash text,
  recomputed_hash text,
  hash_verified boolean,
  payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.case_id, r.version_number, r.status,
         r.finalised_at, r.finalised_by,
         (SELECT p.display_name FROM public.profiles p WHERE p.id = r.finalised_by),
         (SELECT u.email::text FROM auth.users u WHERE u.id = r.finalised_by),
         r.content_hash,
         coalesce(r.content_hash_algorithm, 'md5'),
         r.basis_hash,
         CASE coalesce(r.content_hash_algorithm, 'md5')
           WHEN 'sha256' THEN public.scp_iv_content_hash(r.payload)
           ELSE md5(r.payload::text)
         END,
         r.content_hash IS NOT NULL AND r.content_hash =
           CASE coalesce(r.content_hash_algorithm, 'md5')
             WHEN 'sha256' THEN public.scp_iv_content_hash(r.payload)
             ELSE md5(r.payload::text)
           END,
         r.payload
    FROM public.scp_interview_reports r
   WHERE r.id = _report_id
     AND r.status IN ('final', 'superseded')
     AND r.finalised_at IS NOT NULL
     AND public.scp_iv_can_read_case(r.case_id);
$$;

REVOKE ALL ON FUNCTION public.scp_iv_report_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_version(uuid) TO authenticated;

-- Every finalised version, newest first: a correction created a NEW version
-- and did not overwrite the old one. Facts and identity only, no payload.
CREATE OR REPLACE FUNCTION public.scp_iv_report_versions(_case_id uuid)
RETURNS TABLE(
  report_id uuid,
  version_number integer,
  status text,
  finalised_at timestamptz,
  finalised_by uuid,
  finalised_by_name text,
  finalised_by_email text,
  content_hash text,
  content_hash_algorithm text,
  basis_hash text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.version_number, r.status, r.finalised_at, r.finalised_by,
         (SELECT p.display_name FROM public.profiles p WHERE p.id = r.finalised_by),
         (SELECT u.email::text FROM auth.users u WHERE u.id = r.finalised_by),
         r.content_hash, coalesce(r.content_hash_algorithm, 'md5'), r.basis_hash
    FROM public.scp_interview_reports r
   WHERE r.case_id = _case_id
     AND r.status IN ('final', 'superseded')
     AND r.finalised_at IS NOT NULL
     AND public.scp_iv_can_read_case(r.case_id)
   ORDER BY r.version_number DESC;
$$;

REVOKE ALL ON FUNCTION public.scp_iv_report_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_versions(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8 · Apply-time proof. If any of this is not true, the migration does not
--     apply -- the failure is loud, at deploy time, rather than the first
--     time a recruitment owner tries to finalise a report.
-- ─────────────────────────────────────────────────────────────────────────

DO $proof$
DECLARE _src text; _build text; _preview text; _fn text; _i int;
BEGIN
  FOR _fn IN SELECT unnest(ARRAY['content_hash_algorithm','basis_hash']) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='scp_interview_reports'
                      AND column_name=_fn) THEN
      RAISE EXCEPTION 'SCP_IV_BASIS: % is missing', _fn;
    END IF;
  END LOOP;

  -- The two-argument finalisation is GONE: there is no way to finalise what
  -- was never previewed.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report' AND p.pronargs = 2) THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the preview-less finalisation still exists';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report' AND p.pronargs = 3;
  IF _src IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: scp_iv_finalise_report(uuid, text, uuid) is missing';
  END IF;
  SELECT p.prosrc INTO _build FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_build_report_basis';
  SELECT p.prosrc INTO _preview FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_preview_report';
  IF _build IS NULL OR _preview IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder or the preview is missing';
  END IF;

  -- One builder for both: finalisation and preview each call it, and
  -- finalisation builds nothing of its own.
  IF position('scp_iv_build_report_basis(' in _src) = 0
     OR position('scp_iv_build_report_basis(' in _preview) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: preview and finalisation do not share one builder';
  END IF;
  -- Finalisation builds nothing of its own: the only jsonb it assembles is
  -- the event it records, so a second jsonb_build_object would be a second
  -- basis.
  IF (SELECT count(*) FROM regexp_matches(_src, 'jsonb_build_object\(', 'g')) <> 1 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation assembles a basis of its own';
  END IF;
  -- Finalisation demands the previewed identity and refuses a stale one.
  IF position('SCP_IV_PREVIEW_REQUIRED' in _src) = 0 OR position('SCP_IV_STALE_PREVIEW' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation does not require the previewed basis hash';
  END IF;
  -- And the role check precedes everything a member could learn from.
  IF position('SCP_IV_FINALISE_ROLE' in _src) = 0
     OR position('SCP_IV_FINALISE_ROLE' in _src) > position('SCP_IV_REPORT_BLOCKED' in _src)
     OR position('SCP_IV_REPORT_BLOCKED' in _src) > position('SCP_IV_STALE_PREVIEW' in _src) THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the role check does not precede the blocker and preview checks';
  END IF;

  -- The hash is sha256 from pg_catalog; md5 and pgcrypto are gone from the
  -- write path. (The readback still recomputes md5 for a legacy row, which
  -- is how it tells the truth about that row.)
  IF position('scp_iv_content_hash(' in _src) = 0 OR position('md5(' in _src) > 0 OR position('digest(' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation does not hash with core sha256';
  END IF;

  -- The builder: every assessor, in a fixed order, and no arbitrary one.
  IF position('''assessments''' in _build) = 0 OR position('levels_agree' in _build) = 0
     OR position('assessor_count' in _build) = 0 OR position('''panel''' in _build) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder does not carry every assessor and the panel conclusion';
  END IF;
  IF _build ~ 'superseded_by IS NULL\s*LIMIT 1' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder still selects one assessor arbitrarily';
  END IF;
  -- Deterministic: every aggregate is ordered on an immutable key. Eight
  -- aggregates -- interview, assessment material, sources, questions,
  -- evidence, assessments, unresolved, AI runs -- and the DISTINCT form that
  -- cannot carry an ORDER BY is not used. The per-aggregate proof that each
  -- call's ORDER BY sits inside its own parentheses is made by
  -- employer-final-report-check with a real parenthesis parse, which a
  -- regex cannot do.
  IF (SELECT count(*) FROM regexp_matches(_build, 'jsonb_agg\(', 'g')) <> 8 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder does not carry the eight ordered aggregates';
  END IF;
  IF position('jsonb_agg(DISTINCT' in _build) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder uses jsonb_agg(DISTINCT ...), whose order is not declared';
  END IF;
  -- No LIMIT 1 anywhere in the builder without an ORDER BY immediately
  -- above it: a LIMIT over an undeclared order is the heap choosing.
  FOR _i IN 1 .. array_length(regexp_split_to_array(_build, 'LIMIT 1'), 1) - 1 LOOP
    IF right((regexp_split_to_array(_build, 'LIMIT 1'))[_i], 400) !~ 'ORDER BY' THEN
      RAISE EXCEPTION 'SCP_IV_BASIS: a LIMIT 1 in the builder has no ORDER BY above it';
    END IF;
  END LOOP;
  -- The basis names the recruitment, the interview, and the assessment
  -- RESULT through the assessment domain's own governed projection, bound
  -- to the exact snapshot and version.
  IF position('advertised_role_sv' in _build) = 0 OR position('''application_id''' in _build) = 0
     OR position('assessment_material' in _build) = 0 OR position('''interview''' in _build) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the snapshot does not name the recruitment it belongs to';
  END IF;
  IF position('scp_employer_report(' in _build) = 0 OR position('scp_employer_report_identity(' in _build) = 0
     OR position('snapshot_hash' in _build) = 0 OR position('report_version_id' in _build) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the assessment result is not bound to its snapshot, version and digest';
  END IF;
  -- Evidence is distinguished by kind; a human level is an interpretation;
  -- a Passport passage is NOT presented as verified.
  IF position('''classification''' in _build) = 0 OR position('human_interpretation' in _build) = 0
     OR position('''unattributed''' in _build) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: evidence is not distinguished by kind';
  END IF;
  IF position('verified_material' in _build) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder claims verification it cannot prove';
  END IF;
  IF _build !~ 'WHEN ''passport_disclosure''\s+THEN ''passport_disclosure''' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: a Passport passage is not classified neutrally';
  END IF;

  -- Still no automated judgement anywhere in the write path.
  IF (_build || _src) ~* '\m(recommend|ranking|pass_fail|total_score|suitab)' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the report write path names an automated judgement';
  END IF;

  -- ER5.8 and the proposal rule, restated where they are enforced: the
  -- basis is CONFIRMED EVIDENCE. Live application, Passport, CV or note rows
  -- and unaccepted AI proposals must not reach a finalised report.
  IF (_build || _src || _preview) ~ '(job_applications|sp_claims|cv_documents|session_notes|scp_interview_evidence_proposals)' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the report path reads a live application, Passport, CV, note or proposal table';
  END IF;
  -- TR12.3: no scp_iv_ function names the assessment snapshot table.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname LIKE 'scp_iv_%'
                AND p.prosrc ILIKE '%scp_report_snapshots%') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: an scp_iv_ function names the assessment snapshot table';
  END IF;

  -- The builder is not client-executable; preview and finalise are the doors.
  IF has_function_privilege('authenticated', 'public.scp_iv_build_report_basis(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the builder is directly executable by a client';
  END IF;
  FOR _fn IN SELECT unnest(ARRAY[
      'public.scp_iv_preview_report(uuid)', 'public.scp_iv_finalise_report(uuid, text, uuid)',
      'public.scp_iv_final_report(uuid)', 'public.scp_iv_report_version(uuid)',
      'public.scp_iv_report_versions(uuid)', 'public.scp_employer_report_identity(uuid)']) LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_IV_BASIS: anon may execute %', _fn;
    END IF;
    IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_IV_BASIS: authenticated cannot execute %', _fn;
    END IF;
  END LOOP;

  -- The readbacks recompute and name the actor.
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_final_report';
  IF position('scp_iv_content_hash(r.payload)' in _src) = 0 OR position('display_name' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the readback does not recompute the digest and name the actor';
  END IF;

  -- The immutability trigger is still attached, and now protects history.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'scp_interview_reports_immutable'
                    AND tgrelid = 'public.scp_interview_reports'::regclass
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the report immutability trigger is not attached';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_guard_report_immutable';
  IF _src !~ 'IF OLD\.status = ''superseded'' THEN' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: a superseded version is still editable';
  END IF;

  -- 2b: the origin guard no longer reads a column findings do not have.
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_guard_evidence_origin_in_case';
  IF position('NEW.note_id' in _src) < position('TG_TABLE_NAME IN (''scp_interview_evidence_proposals'', ''scp_interview_evidence'')' in _src)
     OR position('TG_TABLE_NAME IN (''scp_interview_evidence_proposals'', ''scp_interview_evidence'')' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the origin guard still reads NEW.note_id on scp_interview_findings';
  END IF;

  RAISE NOTICE 'SCP_IV_REPORT_BASIS_PROOF ok';
END $proof$;
