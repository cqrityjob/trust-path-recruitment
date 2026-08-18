-- A reviewer can see what they are being asked to judge.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- Found by completing a real 18-item Väktare run in a browser and then opening
-- the queue as the reviewer who has to adjudicate it. Thirteen reviews were
-- waiting, and every card showed the same four things: a trigger label, the
-- first eight characters of a subject UUID, the participant's free text, and a
-- decision control.
--
-- Nothing said which assessment the text came from, what the participant had
-- actually been ASKED, which organisation the run belongs to, what the run was
-- for, or that the whole thing is a closed test running on unvalidated content.
-- A reviewer given only an answer cannot judge it: "Jag håller avstånd till
-- fönstret och larmar LC" is either a correct first action or a serious
-- omission depending entirely on the scenario it answers, and the scenario was
-- not on the page.
--
-- Worse, twelve of those thirteen reviews COULD NOT BE COMPLETED at all. They
-- are safety-critical, scp_complete_human_review refuses a safety-critical
-- review without a severity, and the queue had no severity control and no
-- column saying which reviews needed one. The reviewer's only possible outcome
-- was a generic failure message.
--
-- ── WHY AN RPC AND NOT MORE COLUMNS ON THE VIEW ─────────────────────────
--
-- scp_rm_review_queue is security_invoker, which is right for the tables a
-- reviewer already holds: scp_item_versions and scp_item_texts are gated on
-- scp_can_author(), so joining them keeps the property that a non-reviewer
-- reads zero rows.
--
-- `employers` is not. A CQrityjob reviewer is deliberately NOT a member of any
-- employer — that separation is what stops an employer adjudicating its own
-- candidate — so employer rows are invisible to them and an inner join would
-- silently empty the queue, while a left join would show the organisation as
-- blank forever.
--
-- So the queue becomes a SECURITY DEFINER function that opens with the same
-- capability check and RETURNs nothing without it. Zero rows stays the correct
-- answer for someone with no capability; what changes is that the reviewer's
-- context is assembled in ONE audited place instead of being reassembled by
-- whatever surface happens to render a card.
--
-- ── WHAT IS DELIBERATELY NOT RETURNED ───────────────────────────────────
--
-- No scoring key, no option correctness, no rubric weight, no model rationale.
-- A reviewer judges the response against the scenario, and a key on the page
-- would turn an independent judgement into an agreement exercise. The columns
-- are absent from the return type, not filtered in the caller.
--
-- That constraint is why the chosen-option columns return the LABEL only.
-- scp_item_options carries score_value, is_preferred, is_best_key, is_worst_key
-- and scoring_rationale on the same row as the text, so the join reaches
-- through scp_item_option_texts and selects `label` and nothing else. A
-- reviewer sees what the participant picked, never what the key says about it.
--
-- No participant name or email either. `participant_ref` is a short stable
-- pseudonym derived from the subject id, which is enough to tell two
-- participants apart and to talk about a case, and not enough to know whose
-- career is being discussed. Blind adjudication is the fairer default and the
-- employer — who already knows the person — is the one who sees the identity.
--
-- Reversible: DROP FUNCTION public.scp_review_queue(text). The view
-- scp_rm_review_queue is left exactly as it was; nothing that reads it changes.

DROP FUNCTION IF EXISTS public.scp_review_queue(text);

CREATE OR REPLACE FUNCTION public.scp_review_queue(_language text DEFAULT 'sv-SE')
RETURNS TABLE(
  review_id uuid,
  attempt_id uuid,
  trigger_reason text,
  opened_at timestamptz,
  participant_ref text,
  organisation_name text,
  assessment_name text,
  assessment_slug text,
  governance_mode public.scp_governance_mode,
  validation_status_at_assignment text,
  purpose_code text,
  item_display_order integer,
  item_scenario text,
  item_prompt text,
  is_safety_critical boolean,
  severity_required boolean,
  item_format text,
  response_text text,
  chosen_label text,
  chosen_best_label text,
  chosen_worst_label text,
  outstanding_in_attempt integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- The capability, checked once. Without it this returns no rows rather than
  -- raising: a queue that is empty because you are not a reviewer must look
  -- exactly like a queue that is empty because there is no work.
  IF NOT public.scp_can_author(auth.uid()) THEN
    RETURN;
  END IF;

  IF _language NOT IN ('sv-SE', 'en-GB') THEN
    _language := 'sv-SE';
  END IF;

  RETURN QUERY
  SELECT
    hr.id,
    at.id,
    hr.trigger_reason,
    hr.opened_at,
    -- Stable, pseudonymous, and obviously not a name.
    upper(substr(replace(at.subject_id::text, '-', ''), 1, 6)),
    e.name,
    CASE WHEN _language = 'en-GB' THEN d.name_en ELSE d.name_sv END,
    d.slug,
    at.governance_mode,
    at.validation_status_at_assignment,
    pv.purpose_code,
    fi.display_order,
    -- Fall back to the other language rather than showing an empty card: a
    -- missing adaptation must not cost the reviewer the scenario.
    coalesce(itx.scenario, itx_any.scenario),
    coalesce(itx.prompt, itx_any.prompt),
    iv.is_safety_critical,
    -- Stated by the queue rather than inferred by the UI, so the control that
    -- collects severity and the function that requires it agree by
    -- construction.
    iv.is_safety_critical,
    iv.item_format,
    r.response_text,
    -- The participant's own choice, in words. Twelve of the thirteen reviews
    -- this function was written for are safety-critical SJT items with no free
    -- text at all: without these the reviewer was asked to judge a
    -- safety-critical decision while being shown nothing the participant did.
    chosen.label,
    chosen_best.label,
    chosen_worst.label,
    (SELECT count(*)::int
       FROM public.scp_human_reviews hr2
       JOIN public.scp_candidate_responses r2 ON r2.id = hr2.response_id
      WHERE r2.attempt_id = at.id AND hr2.review_status = 'pending')
  FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
  JOIN public.scp_attempts at ON at.id = r.attempt_id
  JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
  LEFT JOIN public.scp_form_items fi
         ON fi.form_id = at.form_id AND fi.item_version_id = iv.id
  LEFT JOIN public.scp_item_texts itx
         ON itx.item_version_id = iv.id AND itx.language = _language
  LEFT JOIN LATERAL (
    SELECT t.scenario, t.prompt
      FROM public.scp_item_texts t
     WHERE t.item_version_id = iv.id
     ORDER BY t.language = 'sv-SE' DESC
     LIMIT 1
  ) itx_any ON true
  LEFT JOIN LATERAL (
    SELECT ot.label
      FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.selected_option_id
     ORDER BY ot.language = _language DESC
     LIMIT 1
  ) chosen ON true
  LEFT JOIN LATERAL (
    SELECT ot.label
      FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.best_option_id
     ORDER BY ot.language = _language DESC
     LIMIT 1
  ) chosen_best ON true
  LEFT JOIN LATERAL (
    SELECT ot.label
      FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.worst_option_id
     ORDER BY ot.language = _language DESC
     LIMIT 1
  ) chosen_worst ON true
  LEFT JOIN public.employers e ON e.id = at.issuer_organization_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
  WHERE hr.review_status = 'pending'
  ORDER BY hr.opened_at, fi.display_order;
END;
$function$;

-- Hosted Postgres grants EXECUTE on new public functions to every role by
-- default. A reviewer queue is not anonymous-readable; the in-body capability
-- check would hold, but an anon principal should not be able to call it at all.
REVOKE ALL ON FUNCTION public.scp_review_queue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_review_queue(text) TO authenticated;
