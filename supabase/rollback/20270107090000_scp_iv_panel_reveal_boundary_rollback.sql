-- Rollback for 20270107090000_scp_iv_panel_reveal_boundary.
--
-- Restores the two read policies (case access only), scp_iv_preview_report
-- and scp_iv_report_blockers exactly as hosted before (md5(prosrc) pinned
-- below), and drops scp_iv_panel_hides_others. This REOPENS P1-5 of the
-- 2026-10-02 audit: a panel reviewer can again read the others' assessments
-- and assessment events, and preview the report, before the reveal. No row is
-- touched.

DROP POLICY IF EXISTS scp_interview_assessments_read ON public.scp_interview_assessments;
CREATE POLICY scp_interview_assessments_read ON public.scp_interview_assessments
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id));

DROP POLICY IF EXISTS scp_interview_case_events_read ON public.scp_interview_case_events;
CREATE POLICY scp_interview_case_events_read ON public.scp_interview_case_events
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id));

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

DROP FUNCTION IF EXISTS public.scp_iv_panel_hides_others(uuid);

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_preview_report(uuid)'::regprocedure)) <> '22114e6e583b480010ba7f1e9f9744d6'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_report_blockers(uuid)'::regprocedure)) <> '35a96d5bf530b214ed0be9ea69093136'
     OR to_regprocedure('public.scp_iv_panel_hides_others(uuid)') IS NOT NULL
     OR (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_interview_assessments'
           AND policyname = 'scp_interview_assessments_read') <> 'scp_iv_can_read_case(case_id)'
     OR (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_interview_case_events'
           AND policyname = 'scp_interview_case_events_read') <> 'scp_iv_can_read_case(case_id)' THEN
    RAISE EXCEPTION 'SCP_IV_PANEL_REVEAL_ROLLBACK: the pre-20270107090000 state was not restored';
  END IF;
  RAISE NOTICE 'SCP_IV_PANEL_REVEAL_ROLLBACK ok: pre-20270107090000 policies and bodies restored';
END $$;
