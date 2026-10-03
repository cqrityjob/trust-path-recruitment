-- =============================================================================
-- Who may read what an organisation learned about a person: an owner or admin, a
-- reviewer for the use case, the vacancy's responsible recruiter -- not "every member"
-- =============================================================================
--
-- THE DEFECT (docs/release/2026-10-03-report-access-security-finding.md, main
-- ff2a5b3 review, confirmed on the migration chain): the employer branch of
-- scp_report_snapshot_readable, and every function and policy beside it, admit
-- ANY active member of the organisation -- an ordinary colleague reads every
-- candidate's released report, decisions, notes, progress, the participant and
-- pipeline lists, the invitation list, the assignment rows and the counts of
-- reviews waiting. No role beyond membership, no reviewer grant, no relation to
-- the case. The reviewer grant (scp_employer_reviewers) gates review WORK and
-- never a read. A member who is the SUBJECT reads the employer-audience document
-- about themselves.
--
-- THE MODEL (docs/release/2026-10-03-employer-report-access-design.md): the
-- caller must hold an active membership of an active organisation, must not be
-- the subject, and must be (R1) owner or admin, or (R2) hold an active reviewer
-- grant for the use case of the item, or (R3) for a recruitment item be the
-- named responsible recruiter of its vacancy. An item with no known use case is
-- owner/admin only. An ordinary member with none of these reads NOTHING: no
-- rows, no counts. Release and finalise stay owner/admin only; platform admin
-- behaviour is unchanged; the content-role *_author_read policies (finding c)
-- are NOT touched.
--
-- ONE DEFINITION. employer_reports_readable(...) holds the rule and nothing else
-- does. scp_attempt_reports_readable(attempt) resolves an attempt's use case,
-- vacancy and subject and asks it; the interview case gates (20270204090000)
-- resolve a case and ask it. Every function and policy below calls one of the two.
--
-- EXPAND ONLY. No function the application calls changes its signature and no
-- column or grant is removed. The one new function the application calls is
-- employer_report_access(), which returns the CALLER's own facts so the
-- screen can say "you do not have access to results here" instead of showing an
-- empty list; an application that does not call it, or one that calls it before
-- this migration exists (it then reads the answer as unknown), keeps working. An
-- application written for the old model simply receives what the new model
-- returns: no rows, an empty result, "not found" -- for an ordinary member.
--
-- Each existing body below is the LATEST body in the chain (source named in the
-- design document, section 3.2) with only the marked lines changed
-- ("20270203090000"). Every function keeps its grants; every new one is revoked from
-- PUBLIC and anon explicitly (a hosted project grants anon by default).
--
-- NOT CHANGED: release and finalise; scp_resolve_participant_identity; the
-- participant document and scp_report_issuer_admin; scp_employer_report_v3 (it
-- reads through scp_employer_report); scp_employer_person_assessments (it reads
-- through the pipeline); job_applications and the rec_* model; scp_assessment_
-- setups; sp_* and bcp_* objects; any row.
--
-- Rollback: supabase/rollback/20270203090000_employer_report_access_model_rollback.sql
-- Suite:    supabase/tests/employer_report_access_model_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY[    'public.scp_report_snapshot_readable(text,uuid,uuid)',
    'public.scp_employer_report(uuid)',
    'public.scp_employer_report_identity(uuid)',
    'public.scp_subject_progress(uuid)',
    'public.scp_development_recommendations(uuid)',
    'public.scp_employer_decisions(uuid)',
    'public.scp_interview_notes(uuid)',
    'public.scp_employer_participants(uuid)',
    'public.scp_employer_assessment_pipeline(uuid)',
    'public.scp_employer_person_overview(uuid,uuid)',
    'public.scp_application_assessments(uuid)',
    'public.scp_employer_invitations(uuid)',
    'public.scp_employer_review_board(uuid)',
    'public.scp_employer_review_pressure(uuid)',
    'public.scp_employer_training_status(uuid)',
    'public.scp_can_review_for(uuid,uuid,text)',
    'public.has_active_employer_role(uuid,uuid,text[])',
    'public.scp_employer_person_assessments(uuid,uuid)',
    'public.scp_employer_report_v3(uuid)',
    'public.scp_participant_report(uuid)'] LOOP
    IF to_regprocedure(_s) IS NULL THEN
      RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PRECONDITION: % is missing', _s;
    END IF;
  END LOOP;
  FOREACH _s IN ARRAY ARRAY['public.scp_employer_reviewers', 'public.recruitment_settings',
                            'public.job_applications', 'public.scp_interview_panels',
                            'public.scp_interview_panel_members', 'public.scp_subject_identities'] LOOP
    IF to_regclass(_s) IS NULL THEN
      RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PRECONDITION: table % is missing', _s;
    END IF;
  END LOOP;
END $$;

-- ── 1. The one definition, and its two resolvers ─────────────────────────
CREATE OR REPLACE FUNCTION public.employer_reports_readable(_employer_id uuid, _use_case text DEFAULT NULL::text, _job_id uuid DEFAULT NULL::uuid, _application_id uuid DEFAULT NULL::uuid, _subject_users uuid[] DEFAULT NULL::uuid[], _case_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- THE one definition of who may read what an organisation learned about a
  -- person through an assessment or an interview. Everything that gates an
  -- employer-audience read asks this, directly or through scp_attempt_reports_
  -- readable (attempts) or the three scp_iv_ case gates (interview cases).
  -- Answers for the CALLER (auth.uid()) only.
  --   _use_case          'workforce' | 'recruitment' | NULL (unknown)
  --   _job_id            the vacancy the item belongs to, if the item names it
  --   _application_id    the application it belongs to; its job is the vacancy
  --                      when _job_id is NULL
  --   _subject_users     the accounts of the person(s) the item is ABOUT
  --   _case_id           an interview case: its creator and its panel qualify
  -- Never NULL: an unknown use case, a NULL organisation or a NULL subject list
  -- is a plain false.
  SELECT coalesce(
     auth.uid() IS NOT NULL
     AND _employer_id IS NOT NULL
     -- 2. Not the subject: a person never reads the employer-audience document
     --    about themselves through membership. They keep their participant one.
     AND NOT coalesce(auth.uid() = ANY (_subject_users), false)
     -- 1. Standing: an ACTIVE member of an ACTIVE organisation.
     AND public.has_active_employer_role(auth.uid(), _employer_id)
     AND (
       -- R1: owner or admin
       public.has_active_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin'])
       -- R2: an active reviewer grant for THIS use case. An unknown use case
       --     is not reachable through a grant.
       OR (_use_case IN ('workforce', 'recruitment')
           AND public.scp_can_review_for(auth.uid(), _employer_id, _use_case))
       -- R3: for a recruitment item, the named responsible recruiter of its vacancy
       OR (_use_case = 'recruitment'
           AND EXISTS (
             SELECT 1
               FROM (SELECT coalesce(_job_id,
                                     (SELECT a.job_id FROM public.job_applications a
                                       WHERE a.id = _application_id AND a.employer_id = _employer_id)) AS job_id) v
               JOIN public.recruitment_settings s ON s.job_id = v.job_id AND s.employer_id = _employer_id
               JOIN public.jobs j ON j.id = s.job_id AND j.employer_id = _employer_id
              WHERE s.responsible_user_id = auth.uid()))
       -- R4: the creator of the interview case, or a member of its panel
       OR (_case_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.scp_interview_cases c
              WHERE c.id = _case_id AND c.employer_id = _employer_id
                AND (c.created_by = auth.uid()
                     OR EXISTS (SELECT 1
                                  FROM public.scp_interview_panels p
                                  JOIN public.scp_interview_panel_members pm ON pm.panel_id = p.id
                                 WHERE p.case_id = c.id AND pm.user_id = auth.uid()))))
     ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.scp_attempt_reports_readable(_attempt_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Resolves what an attempt is (issuer, the use case and vacancy of its
  -- assignment, the account of its subject) and asks employer_reports_readable.
  -- It decides nothing itself. An attempt with no assignment has no use case,
  -- so it is owner/admin only.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_attempts a
      LEFT JOIN public.assessment_assignments aa ON aa.id = a.assignment_id
     WHERE a.id = _attempt_id
       AND a.issuer_organization_id IS NOT NULL
       AND public.employer_reports_readable(
             a.issuer_organization_id, aa.use_case, aa.job_id, aa.application_id,
             ARRAY(SELECT si.user_id FROM public.scp_subject_identities si
                    WHERE si.subject_id = a.subject_id),
             NULL::uuid));
$function$
;

CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable(_audience text, _subject_id uuid, _issuer_organization_id uuid, _attempt_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The audience rule as a function (20260904134520), now naming the attempt.
  -- A participant reads their OWN participant document. For the employer
  -- document the attempt decides: its use case and vacancy are what a reviewer
  -- grant or a responsible recruiter is read against. Without an attempt the
  -- use case is unknown and only an owner or admin reads. Anything else,
  -- including an unknown audience, is false.
  SELECT CASE _audience
    WHEN 'participant' THEN EXISTS (
      SELECT 1 FROM public.scp_subject_identities si
       WHERE si.subject_id = _subject_id
         AND si.user_id = auth.uid())
    WHEN 'employer' THEN
      _issuer_organization_id IS NOT NULL
      AND CASE WHEN _attempt_id IS NULL
               THEN public.employer_reports_readable(
                      _issuer_organization_id, NULL, NULL, NULL,
                      ARRAY(SELECT si.user_id FROM public.scp_subject_identities si
                             WHERE si.subject_id = _subject_id),
                      NULL::uuid)
               ELSE EXISTS (SELECT 1 FROM public.scp_attempts a
                             WHERE a.id = _attempt_id
                               AND a.issuer_organization_id = _issuer_organization_id
                               AND a.subject_id = _subject_id)
                    AND public.scp_attempt_reports_readable(_attempt_id)
          END
    ELSE false
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.employer_report_access(_employer_id uuid)
 RETURNS TABLE(is_member boolean, owner_or_admin boolean, readable_use_cases text[], responsible_job_ids uuid[], case_access boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The CALLER's own facts about one organisation, so the application can say
  -- what is true ("you do not have access to results here -- ask an owner or an
  -- administrator") instead of showing an empty list that reads as "no
  -- candidates". Read-only, about nobody else, and NOT an authorisation: every
  -- read is decided by employer_reports_readable and the functions and policies
  -- that ask it. Always exactly one row (a caller with nothing gets false and
  -- empty arrays), so a missing function is the only way to be "unknown".
  SELECT public.has_active_employer_role(auth.uid(), _employer_id),
         public.employer_reports_readable(_employer_id),
         ARRAY(SELECT uc FROM unnest(ARRAY['recruitment', 'workforce']) AS uc
                WHERE public.employer_reports_readable(_employer_id, uc) ORDER BY uc),
         ARRAY(SELECT s.job_id FROM public.recruitment_settings s
                WHERE s.employer_id = _employer_id
                  AND s.responsible_user_id = auth.uid()
                  AND public.employer_reports_readable(_employer_id, 'recruitment', s.job_id)
                ORDER BY s.job_id),
         (public.employer_reports_readable(_employer_id)
          OR EXISTS (SELECT 1 FROM public.scp_interview_cases c
                      WHERE c.employer_id = _employer_id AND public.scp_iv_can_read_case(c.id)));
$function$
;

REVOKE ALL ON FUNCTION public.employer_reports_readable(uuid, text, uuid, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_reports_readable(uuid, text, uuid, uuid, uuid[], uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.scp_attempt_reports_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_attempt_reports_readable(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.employer_report_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_report_access(uuid) TO authenticated;

COMMENT ON FUNCTION public.employer_reports_readable(uuid, text, uuid, uuid, uuid[], uuid) IS
  'The one definition of who may read what an organisation learned about a person (design: docs/release/2026-10-03-employer-report-access-design.md). The caller only (auth.uid()).';

-- ── 2. The reads that name an attempt, a use case or a vacancy ───────────
CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable(_audience text, _subject_id uuid, _issuer_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270203090000: the same rule as the overload below, asked WITHOUT naming an
  -- attempt. A caller that cannot say which attempt it means has no use case
  -- and no vacancy, so the employer branch is owner/admin only. Participant
  -- branch unchanged.
  SELECT public.scp_report_snapshot_readable(_audience, _subject_id, _issuer_organization_id, NULL::uuid);
$function$
;

REVOKE ALL ON FUNCTION public.scp_report_snapshot_readable(text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_report_snapshot_readable(text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_report(_attempt_id uuid)
 RETURNS TABLE(id uuid, attempt_id uuid, subject_id uuid, audience text, released_at timestamp with time zone, payload jsonb, brief jsonb, safety_flags jsonb, context jsonb, limitations_sv text[], limitations_en text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The employer document as released, minus what is internal: no
  -- derivation_input, no mean/spread on any area, and each human finding as
  -- {finding, severity, observed_at} -- the behaviour_version_id the release
  -- function stored beside it is traceability for the private manifest
  -- (PR-R1), not employer report data. subject_id is the pseudonymous
  -- subject, as the row has always carried it; resolving it to a person still
  -- needs scp_resolve_participant_identity. Zero rows for any other
  -- organisation or for a non-member.
  --
  -- LEFT JOIN for the same reason as the participant contract above.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'finding',     f.value -> 'finding',
                    'severity',    f.value -> 'severity',
                    'observed_at', f.value -> 'observed_at')
                  ORDER BY f.ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(s.safety_flags) WITH ORDINALITY f),
         s.context,
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     -- 20270203090000: the attempt names the use case and the vacancy
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id, s.attempt_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_report_identity(_attempt_id uuid)
 RETURNS TABLE(snapshot_id uuid, report_version_id uuid, released_at timestamp with time zone, scoring_model_version text, threshold_version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.report_version_id, s.released_at, s.scoring_model_version, s.threshold_version
    FROM public.scp_report_snapshots s
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     -- 20270203090000: the attempt names the use case and the vacancy
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id, s.attempt_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_report_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_report_identity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
 RETURNS TABLE(released_at timestamp with time zone, attempt_id uuid, competency_code text, competency_name_sv text, competency_name_en text, evidence_state text, observations integer, safety_flag_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _audience text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_subject_identities si
              WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    _audience := 'participant';
  ELSIF EXISTS (SELECT 1 FROM public.scp_attempts a
                 WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL
                   -- 20270203090000: an attempt the caller may read (standing, not the
                   -- subject, and owner/admin, use-case reviewer or the vacancy's
                   -- responsible recruiter)
                   AND public.scp_attempt_reports_readable(a.id)) THEN
    _audience := 'employer';
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'evidence_state', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
     AND s.audience = _audience
     -- 20270102090000: only snapshots the caller could read directly. For the
     -- employer audience that is the caller's own organisations' documents;
     -- another employer's report never leaves through this function.
     AND public.scp_report_snapshot_readable(s.audience, s.subject_id, s.issuer_organization_id, s.attempt_id)
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_development_recommendations(_subject_id uuid)
 RETURNS TABLE(module_version_id uuid, module_name_sv text, module_name_en text, summary_sv text, summary_en text, estimated_minutes integer, addresses_competency_sv text, addresses_competency_en text, maturity_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- NULL: the participant, who reads all of their own evidence. Otherwise the
  -- organisations whose evidence an employer caller may build on.
  _issuers uuid[];
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    -- 20270104090000: an employer caller reads only what its own
    -- organisations issued -- the organisations it is an active member of
    -- that have a released attempt for this subject. Another employer's
    -- evidence neither selects a row nor moves a maturity level.
    SELECT array_agg(DISTINCT a.issuer_organization_id) INTO _issuers
      FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL
       -- 20270203090000: an attempt the caller may read -- and only in an
       -- organisation where EVERY released attempt of this subject is one they
       -- may read. Maturity is computed per issuing organisation and cannot be
       -- split by attempt, so a reader of one use case or one vacancy gets
       -- nothing rather than a blend that includes an attempt they may not read.
       AND public.scp_attempt_reports_readable(a.id)
       AND NOT EXISTS (SELECT 1 FROM public.scp_attempts b
                        WHERE b.subject_id = a.subject_id
                          AND b.issuer_organization_id = a.issuer_organization_id
                          AND b.released_at IS NOT NULL
                          AND NOT public.scp_attempt_reports_readable(b.id));
    IF _issuers IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (mv.id)
    mv.id, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, cv.name_sv, cv.name_en,
    lvl.maturity
  FROM public.scp_competency_evidence e
  JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
  JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
  JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
  JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
  JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
  JOIN public.scp_modules m ON m.id = mv.module_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN _issuers IS NULL
                THEN public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
                ELSE public.scp_compute_maturity_for_issuers(_subject_id, cv.id, 'v1', now(), _issuers)
           END AS maturity) lvl
  WHERE e.subject_id = _subject_id
    AND e.superseded_by IS NULL
    AND (_issuers IS NULL OR e.issuer_organization_id = ANY (_issuers))
    -- #47: recommend only content that could actually be delivered. A draft or
    -- retired module is not a development option, it is an authoring artefact.
    AND mv.content_status = 'published'
    AND mv.retired_at IS NULL
    -- And never recommend another employer's private content.
    AND m.owner_employer_id IS NULL
    AND lvl.maturity IN ('no_evidence','limited_evidence','developing_evidence')
  ORDER BY mv.id, mv.display_order;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_development_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_development_recommendations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_decisions(_attempt_id uuid)
 RETURNS TABLE(id uuid, decided_at timestamp with time zone, decided_by_email text, action text, reason_code text, reason_note text, next_step text, next_step_owner text, supersedes_id uuid, is_current boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _emp uuid;
BEGIN
  SELECT a.issuer_organization_id INTO _emp
    FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _emp IS NULL THEN RETURN; END IF;

  -- 20270203090000: an attempt the caller may read
  IF NOT public.scp_attempt_reports_readable(_attempt_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.id, d.decided_at, u.email::text, d.action, d.reason_code, d.reason_note,
         d.next_step, d.next_step_owner, d.supersedes_id,
         -- Current means nothing supersedes it.
         NOT EXISTS (SELECT 1 FROM public.scp_employer_report_decisions s
                      WHERE s.supersedes_id = d.id)
    FROM public.scp_employer_report_decisions d
    JOIN auth.users u ON u.id = d.decided_by
   WHERE d.attempt_id = _attempt_id
   ORDER BY d.decided_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_decisions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_decisions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_interview_notes(_attempt_id uuid)
 RETURNS TABLE(id uuid, area_code text, outcome text, note text, recorded_by_email text, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270203090000: an attempt the caller may read
  IF NOT public.scp_attempt_reports_readable(_attempt_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.id, n.area_code, n.outcome, n.note,
         u.email::text, n.recorded_at
    FROM public.scp_interview_notes n
    LEFT JOIN auth.users u ON u.id = n.recorded_by
   WHERE n.attempt_id = _attempt_id
   ORDER BY n.recorded_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_interview_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_interview_notes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_participants(_employer_id uuid)
 RETURNS TABLE(subject_id uuid, attempt_id uuid, assignment_id uuid, programme_name_sv text, programme_name_en text, attempt_status text, answered integer, total_items integer, reviews_outstanding integer, deadline timestamp with time zone, started_at timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, identity_resolvable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.subject_id, a.id, a.assignment_id, d.name_sv, d.name_en, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    -- A count, never the responses themselves.
    COALESCE((SELECT count(*)::int FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses r ON r.id = hr.response_id
               WHERE r.attempt_id = a.id AND hr.review_status = 'pending'), 0),
    asg.expires_at, a.started_at, a.submitted_at, a.scored_at, a.released_at,
    (a.released_at IS NOT NULL)
  FROM public.scp_attempts a
  LEFT JOIN public.assessment_assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  WHERE a.issuer_organization_id = _employer_id
    AND a.mode = 'assessment'
    -- 20270203090000: only the attempts the caller may read
    AND public.scp_attempt_reports_readable(a.id)
  ORDER BY a.started_at DESC;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_assessment_pipeline(_employer_id uuid)
 RETURNS TABLE(attempt_id uuid, assignment_id uuid, subject_id uuid, employee_id uuid, participant_ref text, participant_name text, assessment_slug text, assessment_name_sv text, assessment_name_en text, purpose_code text, use_case text, governance_mode scp_governance_mode, lifecycle_state text, invited_at timestamp with time zone, started_at timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, deadline timestamp with time zone, answered integer, total_items integer, reviews_total integer, reviews_open integer, identity_resolvable boolean, can_release boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  -- 20270108090000: an active member of an ACTIVE organisation
  IF _role IS NULL OR NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT at.id AS attempt_id, at.assignment_id, at.subject_id, aa.employee_id,
           at.status AS attempt_status, at.form_id,
           d.slug, d.name_sv, d.name_en, pv.purpose_code,
           coalesce(aa.use_case, 'workforce') AS use_case,
           at.governance_mode, aa.invited_at,
           -- The participant's first answer: the only evidence of engagement
           -- this schema actually records.
           (SELECT min(cr.created_at) FROM public.scp_candidate_responses cr
             WHERE cr.attempt_id = at.id) AS first_answer_at,
           at.submitted_at, at.scored_at, at.released_at, aa.expires_at,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id) AS rev_total,
           (SELECT count(*)::int FROM public.scp_human_reviews hr
              JOIN public.scp_candidate_responses r ON r.id = hr.response_id
             WHERE r.attempt_id = at.id AND hr.review_status = 'pending') AS rev_open,
           e.first_name, e.last_name
      FROM public.scp_attempts at
      LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
      LEFT JOIN public.employees e ON e.id = aa.employee_id
      LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
      LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
      LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
     WHERE at.issuer_organization_id = _employer_id
       AND at.mode = 'assessment'
       -- 20270203090000: only the attempts the caller may read
       AND public.scp_attempt_reports_readable(at.id)
  )
  SELECT r.attempt_id, r.assignment_id, r.subject_id, r.employee_id,
         upper(substr(replace(r.subject_id::text, '-', ''), 1, 6)),
         CASE WHEN r.employee_id IS NOT NULL
              THEN nullif(btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), '')
              ELSE NULL END,
         r.slug, r.name_sv, r.name_en, r.purpose_code, r.use_case, r.governance_mode,
         public.scp_attempt_lifecycle_state(
           r.attempt_status, r.first_answer_at, r.submitted_at,
           r.scored_at, r.released_at, r.rev_open),
         r.invited_at, r.first_answer_at, r.submitted_at, r.scored_at,
         r.released_at, r.expires_at,
         coalesce((SELECT count(*)::int FROM public.scp_candidate_responses cr
                    WHERE cr.attempt_id = r.attempt_id), 0),
         coalesce((SELECT count(*)::int FROM public.scp_form_items fi
                    WHERE fi.form_id = r.form_id), 0),
         r.rev_total, r.rev_open,
         (r.released_at IS NOT NULL),
         (r.scored_at IS NOT NULL AND r.released_at IS NULL AND _role IN ('owner','admin'))
    FROM rows r
   ORDER BY coalesce(r.released_at, r.scored_at, r.submitted_at,
                     r.first_answer_at, r.invited_at) DESC NULLS LAST;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_assessment_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_assessment_pipeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_person_overview(_employer_id uuid, _subject_id uuid)
 RETURNS TABLE(row_kind text, row_id uuid, title_sv text, title_en text, status text, use_case text, application_id uuid, job_id uuid, attempt_id uuid, released_at timestamp with time zone, report_available boolean, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

  -- Applications this person made to THIS employer. Reached through the
  -- subject's account links rather than through an email string.
  RETURN QUERY
  SELECT 'application'::text, a.id,
         j.title_sv, coalesce(j.title_en, j.title_sv),
         a.status, 'recruitment'::text,
         a.id, a.job_id, NULL::uuid, NULL::timestamptz, false, a.created_at
    FROM public.job_applications a
    JOIN public.scp_subject_identities si ON si.user_id = a.applicant_user_id
    LEFT JOIN public.jobs j ON j.id = a.job_id
   WHERE a.employer_id = _employer_id AND si.subject_id = _subject_id;

  -- Assessments this employer commissioned for this person.
  RETURN QUERY
  SELECT 'assessment'::text, at.id,
         coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
         at.status, asg.use_case,
         asg.application_id, asg.job_id, at.id, at.released_at,
         EXISTS (SELECT 1 FROM public.scp_report_snapshots s
                  WHERE s.attempt_id = at.id AND s.audience = 'employer'),
         coalesce(at.started_at, asg.invited_at)
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments asg ON asg.id = at.assignment_id
    LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE at.subject_id = _subject_id
     AND at.issuer_organization_id = _employer_id
     AND at.mode = 'assessment'
     -- 20270203090000: only the attempts the caller may read
     AND public.scp_attempt_reports_readable(at.id);

  -- Interview evidence recorded by this organisation.
  RETURN QUERY
  SELECT 'interview_note'::text, n.id,
         n.area_code, n.area_code, n.outcome, NULL::text,
         NULL::uuid, NULL::uuid, n.attempt_id, NULL::timestamptz, false, n.recorded_at
    FROM public.scp_interview_notes n
    JOIN public.scp_attempts at2 ON at2.id = n.attempt_id
   WHERE n.employer_id = _employer_id AND at2.subject_id = _subject_id
     -- 20270203090000: only notes on attempts the caller may read
     AND public.scp_attempt_reports_readable(n.attempt_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_person_overview(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_person_overview(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_application_assessments(_application_id uuid)
 RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid, assessment_slug text, name_sv text, name_en text, designed_for text, use_case text, governance_mode scp_governance_mode, attempt_status text, answered integer, total_items integer, reviews_outstanding integer, invited_at timestamp with time zone, deadline timestamp with time zone, submitted_at timestamp with time zone, scored_at timestamp with time zone, released_at timestamp with time zone, report_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL THEN RETURN; END IF;

  -- Membership of THIS organisation, checked before anything is read. An
  -- application id is guessable; membership is not.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                    AND m.status = 'active')
     -- 20270105090000: and the organisation itself is active, as the
     -- job_applications RLS policy and the rec_* read paths require.
     OR NOT coalesce(public.employer_is_active_status(_employer), false) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    asg.id, at.id, at.subject_id,
    d.slug, coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
    d.designed_for, asg.use_case, at.governance_mode, at.status,
    coalesce((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = at.id), 0),
    coalesce((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = at.form_id), 0),
    coalesce((SELECT count(*)::int FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses r ON r.id = hr.response_id
               WHERE r.attempt_id = at.id AND hr.review_status <> 'completed'), 0),
    asg.invited_at, asg.expires_at,
    at.submitted_at, at.scored_at, at.released_at,
    EXISTS (SELECT 1 FROM public.scp_report_snapshots s
             WHERE s.attempt_id = at.id AND s.audience = 'employer')
  FROM public.assessment_assignments asg
  JOIN public.scp_attempts at ON at.assignment_id = asg.id
  LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  WHERE asg.application_id = _application_id
    AND asg.employer_id = _employer
    -- 20270203090000: only the attempts the caller may read
    AND public.scp_attempt_reports_readable(at.id)
  ORDER BY asg.invited_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_application_assessments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_application_assessments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_invitations(_employer_id uuid)
 RETURNS TABLE(invitation_id uuid, email text, invited_name text, name_sv text, name_en text, use_case text, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, status text, closed_reason text, invited_at timestamp with time zone, expires_at timestamp with time zone, bound_assignment_id uuid, bound_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.email, i.invited_name,
         coalesce(d.display_name_sv, d.name_sv), coalesce(d.display_name_en, d.name_en),
         i.use_case, i.application_id, i.job_id,
         j.title_sv, coalesce(j.title_en, j.title_sv),
         i.status, i.closed_reason, i.invited_at, i.expires_at,
         i.bound_assignment_id, i.bound_at
    FROM public.scp_assessment_invitations i
    LEFT JOIN public.scp_assessment_versions av ON av.id = i.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    LEFT JOIN public.jobs j ON j.id = i.job_id
   WHERE i.employer_id = _employer_id
     -- 20270203090000: only the invitations of a use case or a vacancy the caller may read
     AND public.employer_reports_readable(i.employer_id, i.use_case, i.job_id, i.application_id, NULL, NULL)
   ORDER BY i.invited_at DESC;
END;
$function$
;

REVOKE ALL ON FUNCTION public.scp_employer_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_invitations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_review_board(_employer_id uuid)
 RETURNS TABLE(attempt_id uuid, responses_open integer, my_basis text, my_disclosure text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Same entry gate as scp_employer_review_pressure: an active member of this
  -- organisation, and nobody else. A non-member gets zero rows, not an error --
  -- an error would confirm the organisation exists.
  -- 20270108090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT at.id,
         count(hr.id)::int,
         public.scp_review_authorisation(auth.uid(), at.id),
         public.scp_review_conflict_disclosure(auth.uid(), at.id)
    FROM public.scp_attempts at
    JOIN public.scp_candidate_responses r ON r.attempt_id = at.id
    JOIN public.scp_human_reviews hr ON hr.response_id = r.id
   WHERE at.issuer_organization_id = _employer_id
     AND hr.review_status = 'pending'
     -- 20270203090000: only the attempts the caller may read
     AND public.scp_attempt_reports_readable(at.id)
   GROUP BY at.id
   ORDER BY at.id;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_review_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_review_board(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_review_pressure(_employer_id uuid)
 RETURNS TABLE(awaiting_review integer, attempts_blocked integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270203090000: an owner or admin, or somebody who may read at least one
  -- attempt of the organisation. A member with no basis gets NO row -- not even
  -- a row of zeros.
  IF NOT (public.employer_reports_readable(_employer_id)
          OR EXISTS (SELECT 1 FROM public.scp_attempts a
                      WHERE a.issuer_organization_id = _employer_id
                        AND public.scp_attempt_reports_readable(a.id))) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT count(*)::int,
         count(DISTINCT at.id)::int
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_attempts at ON at.id = r.attempt_id
   WHERE hr.review_status = 'pending'
     AND at.issuer_organization_id = _employer_id
     -- 20270203090000: only the attempts the caller may read -- no rows, no counts
     AND public.scp_attempt_reports_readable(at.id);
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_review_pressure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_review_pressure(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_employer_training_status(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, subject_id uuid, programme_name_sv text, programme_name_en text, version_number integer, status text, modules_total integer, modules_completed integer, assigned_at timestamp with time zone, due_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, language text, identity_resolvable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270203090000: workforce material the caller may read
  IF NOT public.employer_reports_readable(_employer_id, 'workforce') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ta.id, ta.subject_id, pv.name_sv, pv.name_en, pv.version_number, ta.status,
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id),
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id AND mp.status = 'completed'),
    ta.assigned_at, ta.due_at, ta.started_at, ta.completed_at, ta.language,
    EXISTS (SELECT 1 FROM public.scp_subject_identities si
             WHERE si.subject_id = ta.subject_id)
  FROM public.scp_training_assignments ta
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  WHERE ta.employer_id = _employer_id
  ORDER BY ta.assigned_at DESC;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_employer_training_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_training_status(uuid) TO authenticated;

-- ── 3. The row policies ──────────────────────────────────────────────────
ALTER POLICY "scp_report_snapshots_employer" ON public.scp_report_snapshots
  USING (((audience = 'employer'::text) AND scp_report_snapshot_readable(audience, subject_id, issuer_organization_id, attempt_id)));

ALTER POLICY "scp_employer_decisions_member_read" ON public.scp_employer_report_decisions
  USING (scp_attempt_reports_readable(attempt_id));

ALTER POLICY "scp_interview_notes_employer_read" ON public.scp_interview_notes
  USING (scp_attempt_reports_readable(attempt_id));

ALTER POLICY "scp_assessment_invitations_employer_read" ON public.scp_assessment_invitations
  USING (employer_reports_readable(employer_id, use_case, job_id, application_id, NULL::uuid[], NULL::uuid));

ALTER POLICY "assignments_employer_select" ON public.assessment_assignments
  USING ((employer_reports_readable(employer_id, use_case, job_id, application_id, NULL::uuid[], NULL::uuid) AND employer_members_can_edit(employer_id)));

ALTER POLICY "scp_training_assignments_read" ON public.scp_training_assignments
  USING ((employer_reports_readable(employer_id, 'workforce'::text) OR (EXISTS ( SELECT 1
   FROM scp_subject_identities si
  WHERE ((si.subject_id = scp_training_assignments.subject_id) AND (si.user_id = auth.uid()))))));

ALTER POLICY "scp_training_progress_read" ON public.scp_training_module_progress
  USING ((EXISTS ( SELECT 1
   FROM scp_training_assignments ta
  WHERE ((ta.id = scp_training_module_progress.assignment_id) AND (employer_reports_readable(ta.employer_id, 'workforce'::text) OR (EXISTS ( SELECT 1
           FROM scp_subject_identities si
          WHERE ((si.subject_id = ta.subject_id) AND (si.user_id = auth.uid())))))))));

-- ── 4. Apply-time proof ──────────────────────────────────────────────────
DO $$
DECLARE _s text; _src text;
BEGIN
  -- Every changed body asks one of the two entry points and nothing else decides.
  FOREACH _s IN ARRAY ARRAY[    'public.scp_employer_report(uuid)',
    'public.scp_employer_report_identity(uuid)',
    'public.scp_subject_progress(uuid)',
    'public.scp_development_recommendations(uuid)',
    'public.scp_employer_decisions(uuid)',
    'public.scp_interview_notes(uuid)',
    'public.scp_employer_participants(uuid)',
    'public.scp_employer_assessment_pipeline(uuid)',
    'public.scp_employer_person_overview(uuid,uuid)',
    'public.scp_application_assessments(uuid)',
    'public.scp_employer_invitations(uuid)',
    'public.scp_employer_review_board(uuid)',
    'public.scp_employer_review_pressure(uuid)',
    'public.scp_employer_training_status(uuid)'] LOOP
    _src := (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure);
    IF position('20270203090000' IN _src) = 0
       OR (position('scp_attempt_reports_readable' IN _src) = 0 AND position('employer_reports_readable' IN _src) = 0
           AND position('scp_report_snapshot_readable' IN _src) = 0) THEN
      RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PROOF: % does not ask the one definition', _s;
    END IF;
  END LOOP;
  -- Nothing that reads for the employer audience still lets membership alone decide.
  FOREACH _s IN ARRAY ARRAY['public.scp_employer_decisions(uuid)', 'public.scp_interview_notes(uuid)'] LOOP
    _src := (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure);
    IF position('has_active_employer_role' IN _src) > 0 THEN
      RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PROOF: % still decides on membership', _s;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
        AND policyname IN ('scp_report_snapshots_employer', 'scp_employer_decisions_member_read',
                           'scp_interview_notes_employer_read', 'scp_assessment_invitations_employer_read',
                           'assignments_employer_select', 'scp_training_assignments_read', 'scp_training_progress_read')
        AND (qual ~ 'employer_reports_readable' OR qual ~ 'scp_attempt_reports_readable'
             OR qual ~ 'scp_report_snapshot_readable\(audience, subject_id, issuer_organization_id, attempt_id\)')) <> 7 THEN
    RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PROOF: a row policy does not ask the one definition';
  END IF;
  -- Grants.
  IF has_function_privilege('anon', 'public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_attempt_reports_readable(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.employer_report_access(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.employer_report_access(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_attempt_reports_readable(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PROOF: grants of the new functions are wrong';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('employer_reports_readable', 'scp_attempt_reports_readable', 'employer_report_access')
        AND (NOT p.prosecdef OR p.proconfig IS NULL)) <> 0 THEN
    RAISE EXCEPTION 'EMPLOYER_REPORT_ACCESS_PROOF: a helper is not SECURITY DEFINER with a pinned search_path';
  END IF;
  RAISE NOTICE 'EMPLOYER_REPORT_ACCESS_PROOF ok: % functions and 7 policies ask the one definition; membership alone no longer reads',
    14;
END $$;
