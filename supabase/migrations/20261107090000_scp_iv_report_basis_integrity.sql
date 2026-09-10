-- =============================================================================
-- The employer final report: a provable basis, and a governed readback.
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
-- the unresolved findings. Three things it did not do:
--
--   1. THE HASH WAS md5. A content hash is the thing a reader points at to say
--      "this is the report that was finalised". md5 is not a defensible
--      integrity claim in 2026, and a reader could not even tell WHICH
--      algorithm produced the stored value.
--
--   2. THE BASIS DID NOT NAME THE RECRUITMENT. The payload carried the case
--      title and the candidate's display name -- an INTERNAL title, not the
--      advertised role -- and nothing at all about the application, the advert
--      or the assessment material the process ran on. A report that cannot say
--      which vacancy it belongs to is not auditable.
--
--   3. EVIDENCE WAS NOT DISTINGUISHED BY WHAT KIND OF THING IT IS. A sentence
--      the candidate said, a sentence an interviewer observed, and a line from
--      a verified Passport disclosure all rendered identically. A reader
--      deciding about a person must be able to tell those apart.
--
-- ── WHY sha256() AND NOT pgcrypto's digest() ───────────────────────────
--
-- 20260811100000 and 20260817150000 are both scar tissue from exactly one
-- mistake: pgcrypto lives in the `extensions` schema on the hosted project,
-- every SECURITY DEFINER function here correctly pins its search_path, and so
-- gen_random_bytes()/digest() could not resolve at all. Finalising a report is
-- a CORE path -- if it fails, the product's canonical output cannot be
-- produced -- so it must not depend on an extension being installed in a
-- particular schema.
--
-- sha256(bytea) is CORE Postgres (11+) and lives in pg_catalog, which is on
-- every search_path implicitly. No extension, no widened search_path, no
-- allowlist entry. The dependency is removed rather than accommodated, which
-- is the same answer 20260811100000 reached for gen_random_bytes().
--
-- ── WHY EXISTING REPORTS ARE NOT BACKFILLED ────────────────────────────
--
-- scp_iv_guard_report_immutable refuses every UPDATE of a finalised report
-- except the supersede transition. An UPDATE that stamped an algorithm onto
-- already-finalised rows would be blocked by that trigger -- correctly. A
-- finalised report is never edited, not even to annotate it.
--
-- So content_hash_algorithm is NULLABLE and NULL MEANS md5: the report was
-- finalised before the algorithm was recorded. The readback below says so in
-- as many words rather than leaving a reader to guess.
--
-- ADDITIVE. One nullable column, one CHECK, one CREATE OR REPLACE of the
-- finalise function, one new read. No existing row is written. No existing
-- function other than scp_iv_finalise_report changes. No table is dropped.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Which algorithm produced the stored hash.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.scp_interview_reports
  ADD COLUMN IF NOT EXISTS content_hash_algorithm text;

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

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Finalisation: the same contract, a fuller basis, a real hash.
--
--     Byte-identical to 20261020090000's version except for the payload
--     additions, the hash, and the algorithm column. Every guard it already
--     had is kept in place and in order: the case lock, the owner/admin
--     requirement, the blocker sweep, idempotency on an unchanged payload,
--     supersede-don't-edit, the status transition, the event, and the
--     provenance edges.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
  _latest_id uuid; _latest_payload jsonb; _hash text;
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

    -- WHICH RECRUITMENT THIS IS. Persisted identifiers and the advert's own
    -- titles -- never the case's internal title, which is what a recruiter
    -- typed for themselves and is not the advertised role.
    'recruitment', jsonb_build_object(
      'application_id', _c.application_id,
      'job_id', _c.job_id,
      -- The advert's own titles, from `jobs`, exactly as 20260921090000
      -- already resolves the role elsewhere in this schema. Null when the
      -- case is standalone or the advert has gone: a null here says "this
      -- case names no advertised role", which is a different statement from
      -- the case's internal title and must never be filled in with it.
      'advertised_role_sv', (SELECT j.title_sv FROM public.jobs j WHERE j.id = _c.job_id),
      'advertised_role_en', (SELECT j.title_en FROM public.jobs j WHERE j.id = _c.job_id)),

    -- THE ASSESSMENT MATERIAL THE PROCESS RAN ON, by IDENTITY ONLY.
    --
    -- Neither the assessment's name nor its release state is copied here.
    -- TR12.3 forbids any scp_iv_ function from so much as naming the
    -- assessment snapshot table, and it is right to: Interview Intelligence
    -- and the assessment report are separate governed domains, and a snapshot
    -- that quietly mirrored the other domain's state would be a second,
    -- staler copy of it. What belongs in an audit trail is WHICH attempt this
    -- process ran on; the assessment domain answers everything else through
    -- its own reads, which is what the report page already uses.
    'assessment_material', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'attempt_id', at.id,
               'assignment_id', asg.id,
               'assessment_version_id', at.assessment_version_id,
               'attempt_status', at.status)
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
                          'was_corrected', ev.original_excerpt IS NOT NULL,
                          -- WHAT KIND OF THING THIS IS. Derived only from the
                          -- identifiers the row already carries: which note it
                          -- came from, or which source passage, and that
                          -- source's own governed kind. Nothing is inferred
                          -- from the text, and an item with neither link is
                          -- reported as unattributed rather than guessed at.
                          'classification',
                          CASE
                            -- The LINK's existence, not the note's contents.
                            -- ER5.8 forbids this builder from reading the note
                            -- table at all, and it is right to: a report is
                            -- built from confirmed evidence, and a note an
                            -- interviewer edits afterwards must not be able to
                            -- change what a locked report was built from. The
                            -- fact that this excerpt was confirmed FROM a note
                            -- is already on the evidence row.
                            WHEN ev.note_id IS NOT NULL THEN 'interviewer_observation'
                            WHEN ev.source_passage_id IS NOT NULL THEN (
                              SELECT CASE s.source_kind
                                       WHEN 'transcript'           THEN 'candidate_statement'
                                       WHEN 'candidate_cv'         THEN 'candidate_supplied_document'
                                       WHEN 'application_answers'  THEN 'candidate_supplied_document'
                                       WHEN 'passport_disclosure'  THEN 'verified_material'
                                       WHEN 'interviewer_notes'    THEN 'interviewer_observation'
                                       WHEN 'job_description'      THEN 'employer_supplied_material'
                                       WHEN 'employer_requirements' THEN 'employer_supplied_material'
                                       ELSE 'unclassified' END
                                FROM public.scp_interview_source_passages sp
                                JOIN public.scp_interview_case_sources s ON s.id = sp.source_id
                               WHERE sp.id = ev.source_passage_id)
                            ELSE 'unattributed'
                          END))
                   FROM public.scp_interview_evidence ev
                  WHERE ev.case_id = _case_id AND ev.question_id = q.id), '[]'::jsonb),
               'assessment', (
                 SELECT jsonb_build_object(
                          'level', a.level, 'rationale', a.rationale,
                          'uncertainty', a.uncertainty_note,
                          'assessor_id', a.assessor_id, 'assessed_at', a.assessed_at,
                          'anchor', an.anchor_sv,
                          'level_meaning', an.label_sv,
                          'counts_toward_aggregation', an.counts_toward_aggregation,
                          -- Named for what it is. A level and its rationale are
                          -- a HUMAN INTERPRETATION of the evidence above, not a
                          -- further fact about the person.
                          'kind', 'human_interpretation')
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
               'state', f.resolution_state,
               -- The sixth category the reader needs: what is NOT known.
               'category', 'missing_or_contradictory') ORDER BY f.created_at)
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

  -- Deterministic: jsonb normalises key order, so the same basis always
  -- produces the same bytes and therefore the same digest.
  _hash := encode(sha256(_payload::text::bytea), 'hex');

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
     content_hash_algorithm, pack_version_id, pack_content_hash, role_version_id,
     finalised_by, finalised_at)
  VALUES (_case_id, _next, 'final', _draft_run_id, _payload,
          _hash, 'sha256', _c.pack_version_id, _c.pack_content_hash,
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
                       'content_hash', _hash, 'content_hash_algorithm', 'sha256'));

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

-- ─────────────────────────────────────────────────────────────────────────
-- 2b · A superseded version is history, and history is not editable either.
--
--     Found by this migration's own suite, not by a user. The immutability
--     guard opened with
--
--         IF OLD.status <> 'final' THEN RETURN NEW; END IF;
--
--     which is right about drafts -- a draft is worked on -- and wrong about
--     superseded versions. Once version 2 exists, version 1 is the record of
--     what a recruitment owner actually finalised and used. "Any later
--     correction must create a new version while PRESERVING the previous one"
--     is not preserved by a rule that lets the previous one be rewritten in
--     place afterwards.
--
--     No client can reach it today: scp_interview_reports has a SELECT policy
--     and no INSERT or UPDATE policy, so writes only ever happen inside the
--     definer functions. This closes the hole at the level where the claim is
--     made rather than relying on that staying true.
--
--     The one transition a final report may still make is the one
--     finalisation itself performs: final -> superseded, payload and hash
--     untouched.
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
-- 3 · The governed readback.
--
--     "The system must provide governed readback proving which report version
--     was finalised." Reading the table directly tells you what a row SAYS.
--     It does not tell you whether the stored hash still matches the stored
--     payload -- and a report whose integrity claim nobody ever checks is a
--     claim, not a proof.
--
--     So this read RECOMPUTES the digest from the stored payload and returns
--     the verdict beside it. For a sha256 report that is a real check. For a
--     legacy md5 report it recomputes md5 and says so through
--     content_hash_algorithm, so a reader is never told a weaker guarantee is
--     a stronger one.
--
--     Employer-side only, and deliberately so: the employer final report is
--     never shared with the candidate. Access is exactly scp_iv_can_read_case,
--     which is the same tenant rule the table's own RLS policy uses -- the
--     candidate is not a member of the employer and cannot reach either.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scp_iv_final_report(_case_id uuid)
RETURNS TABLE(
  report_id uuid,
  case_id uuid,
  version_number integer,
  status text,
  finalised_at timestamptz,
  finalised_by uuid,
  content_hash text,
  content_hash_algorithm text,
  recomputed_hash text,
  hash_verified boolean,
  payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.case_id, r.version_number, r.status,
         r.finalised_at, r.finalised_by,
         r.content_hash,
         coalesce(r.content_hash_algorithm, 'md5'),
         CASE coalesce(r.content_hash_algorithm, 'md5')
           WHEN 'sha256' THEN encode(sha256(r.payload::text::bytea), 'hex')
           ELSE md5(r.payload::text)
         END,
         r.content_hash IS NOT NULL AND r.content_hash =
           CASE coalesce(r.content_hash_algorithm, 'md5')
             WHEN 'sha256' THEN encode(sha256(r.payload::text::bytea), 'hex')
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

-- Every finalised version, newest first, so a reader can see that a correction
-- created a NEW version and did not overwrite the old one. Facts and identity
-- only: no payload, because listing history is not reading every report.
CREATE OR REPLACE FUNCTION public.scp_iv_report_versions(_case_id uuid)
RETURNS TABLE(
  report_id uuid,
  version_number integer,
  status text,
  finalised_at timestamptz,
  finalised_by uuid,
  content_hash text,
  content_hash_algorithm text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.version_number, r.status, r.finalised_at, r.finalised_by,
         r.content_hash, coalesce(r.content_hash_algorithm, 'md5')
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
-- 4 · Apply-time proof. If any of this is not true, the migration does not
--     apply -- the failure is loud, at deploy time, rather than the first
--     time a recruitment owner tries to finalise a report.
-- ─────────────────────────────────────────────────────────────────────────

DO $proof$
DECLARE _src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='scp_interview_reports'
                    AND column_name='content_hash_algorithm') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: content_hash_algorithm is missing';
  END IF;

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='scp_iv_finalise_report';
  IF _src IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: scp_iv_finalise_report is missing';
  END IF;

  -- The hash is sha256, from pg_catalog, and md5 is gone from the write path.
  IF position('sha256(' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation does not use sha256';
  END IF;
  IF position('md5(' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation still writes an md5 hash';
  END IF;
  -- No pgcrypto dependency: digest() is what 20260817150000 had to repair.
  IF position('digest(' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation depends on pgcrypto digest()';
  END IF;

  -- The basis names the recruitment and the assessment material.
  IF position('advertised_role_sv' in _src) = 0
     OR position('application_id' in _src) = 0
     OR position('assessment_material' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the snapshot does not name the recruitment it belongs to';
  END IF;

  -- Evidence is distinguished by kind, and a human level is named as an
  -- interpretation rather than as a further fact.
  IF position('classification' in _src) = 0
     OR position('human_interpretation' in _src) = 0
     OR position('unattributed' in _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: evidence is not distinguished by kind';
  END IF;

  -- Still no automated judgement anywhere in the write path.
  IF _src ~* '\m(recommend|ranking|pass_fail|total_score|suitab)' THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the report write path names an automated judgement';
  END IF;

  -- The proposals table is still not readable from finalisation: an AI
  -- proposal a human never accepted must not reach a finalised report.
  IF position('scp_interview_evidence_proposals' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation reads unaccepted AI proposals';
  END IF;

  -- ER5.8, restated where it is enforced rather than only where it is tested.
  -- The report is built from CONFIRMED EVIDENCE. Reading live application,
  -- Passport, CV or interviewer-note rows would let material nobody confirmed
  -- into evidence become part of a finalised report -- and would let an edit
  -- made after finalisation change what the report was built from.
  IF position('job_applications' in _src) > 0
     OR position('sp_claims' in _src) > 0
     OR position('cv_documents' in _src) > 0
     OR position('session_notes' in _src) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: finalisation reads a live application, Passport, CV or note table';
  END IF;

  -- The readback exists, verifies, and is not reachable by anon.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='scp_iv_final_report') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: scp_iv_final_report is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='scp_iv_report_versions') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: scp_iv_report_versions is missing';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_final_report(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: anon may execute the report readback';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_report_versions(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: anon may execute the version history';
  END IF;

  -- The immutability trigger is still attached. Everything above is worthless
  -- if a finalised report can be edited in place.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'scp_interview_reports_immutable'
                    AND tgrelid = 'public.scp_interview_reports'::regclass
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SCP_IV_BASIS: the report immutability trigger is not attached';
  END IF;

  RAISE NOTICE 'SCP_IV_REPORT_BASIS_PROOF ok';
END $proof$;
