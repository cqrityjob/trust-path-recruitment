-- =============================================================================
-- P1 -- a panel reviewer sees no other reviewer's assessment before the reveal
-- =============================================================================
--
-- THE DEFECT (2026-10-02 pre-launch hostile-user audit, P1-5, reproduced on
-- production inside a rolled-back transaction):
--
--   An Interview Intelligence panel exists so that each reviewer assesses
--   independently and only then sees the others (scp_iv_panel_submit refuses
--   a partial view; scp_iv_panel_reveal refuses while anyone is outstanding;
--   scp_iv_panel_visible_assessments returns only the caller's own rows until
--   the reveal). Three other reads did not apply that rule:
--
--     scp_interview_assessments  policy: scp_iv_can_read_case(case_id) only.
--                                Panel member B read A's levels and
--                                rationales with a plain SELECT.
--     scp_interview_case_events  policy: case access only; each
--                                'assessment_recorded' event carries the
--                                question and level in metadata, and
--                                'assessment_superseded' the reason.
--     scp_iv_preview_report      builds the report basis -- every live
--                                assessment -- for any case reader; and
--                                finalising would publish it.
--
-- THE INVARIANT, the BESKT conduct layer's (bcp_conduct_*_own_or_revealed):
-- while a panel on a case is in its individual phase, a reader sees only
-- their own assessments and assessment events, and no report is previewed or
-- finalised. Once the panel reveals (or concludes), and on a case with no
-- panel, nothing changes.
--
-- NOT CHANGED: scp_iv_can_read_case, the panel functions, every other event,
-- the report builder, finalise (it already refuses on any blocker), grants,
-- any row.
--
-- HOSTED: no panels exist yet (2026-10-02), so nothing is exposed today.
--
-- Rollback: supabase/rollback/20270107090000_scp_iv_panel_reveal_boundary_rollback.sql
-- Suite:    supabase/tests/scp_iv_panel_reveal_boundary_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.scp_interview_panels') IS NULL
     OR to_regprocedure('public.scp_iv_can_read_case(uuid)') IS NULL
     OR to_regprocedure('public.scp_iv_preview_report(uuid)') IS NULL
     OR to_regprocedure('public.scp_iv_report_blockers(uuid)') IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_PRECONDITION: the panel table or a report function is missing';
  END IF;
END $$;

-- ── 1. The rule ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_panel_hides_others(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.scp_interview_panels p
                  WHERE p.case_id = _case_id AND p.state = 'individual');
$function$;
COMMENT ON FUNCTION public.scp_iv_panel_hides_others(uuid) IS
  'True while a panel on the case is in its individual phase (20270107090000). '
  'Until the reveal, a reader sees only their own assessments and assessment '
  'events, and no report is previewed or finalised.';
REVOKE ALL ON FUNCTION public.scp_iv_panel_hides_others(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_panel_hides_others(uuid) TO authenticated, service_role;

-- ── 2. The table reads ───────────────────────────────────────────────────
DROP POLICY IF EXISTS scp_interview_assessments_read ON public.scp_interview_assessments;
CREATE POLICY scp_interview_assessments_read ON public.scp_interview_assessments
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id)
         AND (assessor_id = auth.uid() OR NOT public.scp_iv_panel_hides_others(case_id)));

DROP POLICY IF EXISTS scp_interview_case_events_read ON public.scp_interview_case_events;
CREATE POLICY scp_interview_case_events_read ON public.scp_interview_case_events
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id)
         AND (event NOT IN ('assessment_recorded', 'assessment_superseded')
              OR actor_id = auth.uid()
              OR NOT public.scp_iv_panel_hides_others(case_id)));

-- ── 3. The report ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_preview_report(_case_id uuid)
 RETURNS TABLE(payload jsonb, basis_hash text, content_hash text, blocker_count integer, blockers jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _p jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: previewing a report requires membership of the case''s employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270107090000: the report basis carries every reviewer's assessment, so
  -- it is not built while a panel on this case is still in its individual
  -- phase. Reveal first (scp_iv_panel_reveal).
  IF public.scp_iv_panel_hides_others(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_NOT_REVEALED: the panel has not revealed its individual assessments yet, so the report cannot be previewed.'
      USING ERRCODE = 'check_violation';
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
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_iv_preview_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_preview_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_iv_report_blockers(_case_id uuid)
 RETURNS TABLE(code text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'CASE_NOT_FOUND', 'Intervjun finns inte.';
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RETURN QUERY SELECT 'NOT_PERMITTED', 'Du saknar behörighet till den här intervjun.';
    RETURN;
  END IF;

  -- The state precondition, stated in the user's language rather than left to
  -- surface as a transition error after the button is pressed.
  IF _c.status NOT IN ('assessed', 'reported') THEN
    RETURN QUERY SELECT 'ASSESSMENT_NOT_COMPLETE',
      'Bedömningen är inte markerad som klar. Gå till Evidens och välj "Klar med bedömningen" när varje fråga har en bedömning.';
  END IF;

  -- 20270107090000: a panel still in its individual phase. The report would
  -- carry every reviewer's assessment, which the panel has not revealed.
  IF public.scp_iv_panel_hides_others(_case_id) THEN
    RETURN QUERY SELECT 'PANEL_NOT_REVEALED',
      'Panelen har inte visat de enskilda bedömningarna ännu. Visa dem när alla i panelen har lämnat sin bedömning.';
  END IF;

  RETURN QUERY
    SELECT 'QUESTION_NOT_ASSESSED',
           format('%s har ingen registrerad mänsklig bedömning.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _c.pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_assessments a
                        WHERE a.case_id = _case_id AND a.question_id = q.id
                          AND a.superseded_by IS NULL);

  -- Material confirmed AFTER the live assessment of its question. The
  -- assessment stands as it was made; it simply does not cover this material,
  -- and a report that showed both side by side would imply that it did.
  RETURN QUERY
    SELECT DISTINCT 'ASSESSMENT_PREDATES_MATERIAL',
           format('%s har fått nytt bekräftat underlag efter bedömningen. Gå igenom bedömningen igen.', q.code)
      FROM public.scp_interview_core_questions q
      JOIN public.scp_interview_assessments a
        ON a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL
     WHERE q.pack_version_id = _c.pack_version_id
       AND EXISTS (SELECT 1 FROM public.scp_interview_evidence ev
                    WHERE ev.case_id = _case_id AND ev.question_id = q.id
                      AND ev.confirmed_at > a.assessed_at);

  RETURN QUERY
    SELECT 'PROPOSALS_AWAITING_REVIEW',
           format('%s AI-förslag har inte granskats av en människa.', count(*)::text)
      FROM public.scp_interview_evidence_proposals p
     WHERE p.case_id = _case_id AND p.review_state = 'pending'
    HAVING count(*) > 0;

  RETURN;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_iv_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_blockers(uuid) TO authenticated, service_role;

-- ── 4. Postflight ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF position('scp_iv_panel_hides_others' IN (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'scp_interview_assessments' AND policyname = 'scp_interview_assessments_read')) = 0
     OR position('scp_iv_panel_hides_others' IN (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'scp_interview_case_events' AND policyname = 'scp_interview_case_events_read')) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_PROOF: a table read does not apply the reveal rule';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
        AND tablename IN ('scp_interview_assessments', 'scp_interview_case_events')
        AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
        AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) <> 2 THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_PROOF: another permissive read policy would bypass the reveal rule';
  END IF;
  IF position('SCP_IV_PANEL_NOT_REVEALED' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_preview_report(uuid)'::regprocedure)) = 0
     OR position('PANEL_NOT_REVEALED' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_report_blockers(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_PROOF: the report path does not apply the reveal rule';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_panel_hides_others(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_iv_preview_report(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_PROOF: anon may execute a reveal-rule function';
  END IF;
  RAISE NOTICE 'SCP_IV_PANEL_REVEAL_PROOF ok: before the reveal a reviewer reads only their own assessments';
END $$;
