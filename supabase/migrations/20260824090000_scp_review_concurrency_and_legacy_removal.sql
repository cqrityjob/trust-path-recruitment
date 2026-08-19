-- F1 and F2 from the independent pre-pilot red-team review. Nothing else.
--
-- ── F1 — REVIEW COMPLETION, MADE SAFE AT THE RIGHT LAYER ────────────────
--
-- scp_complete_human_review checked `review_status = 'pending'` in its opening
-- lookup and then completed the review with an UPDATE carrying no status
-- predicate and no row lock. Two concurrent callers both passed that lookup.
--
-- A CORRECTION TO THE REVIEW THAT PROMPTED THIS. The red-team finding claimed
-- the loser would then write a second competency evidence row. It would not,
-- and this was verified by restoring the pre-fix function and racing two real
-- connections against it. scp_guard_review_immutable_once_done -- a trigger
-- that has existed since 20260804061750 -- refuses any UPDATE of a completed
-- review, and the UPDATE precedes the evidence INSERT, so the losing
-- transaction always aborted and rolled back. The ledger was never at risk.
-- The finding overstated the consequence; the fix is kept because what it does
-- fix is real and was also verified by racing two connections:
--
--   * The SJT loser used to fail with SCP_REVIEW_COMPLETED_IMMUTABLE -- "open a
--     new review instead of editing this one" -- which is advice for somebody
--     editing an old review, not for somebody who just lost a race and whose
--     reasoning has been discarded. It now fails with SCP_REVIEW_NOT_PENDING
--     and a message that says the work was not saved and to reload.
--
--   * The CONSTRUCTED-RESPONSE loser was worse: rubric levels are inserted
--     BEFORE the review row is touched, so it died on a raw 23505 unique
--     violation on scp_review_rubric_scores, which ReviewQueue maps to the
--     generic "could not be saved". Confirmed against the pre-fix function.
--     Locking at the lookup makes it fail by name before writing anything.
--
--   * And the property stops depending on a trigger on another table firing at
--     the right moment. A function that decides who may complete a review
--     should assert that itself.
--
-- Two changes: the opening lookup takes FOR UPDATE OF hr, so the loser blocks
-- there and re-reads after the winner commits; and the UPDATE carries
-- AND review_status = 'pending' with a named error when it matches nothing.
--
-- ── ON THE UNIQUE INDEX, WHICH IS DELIBERATELY NOT ADDED ────────────────
--
-- A partial unique index on (source_ref) WHERE provenance_type = 'human_review'
-- was evaluated as defence in depth and REJECTED as semantically wrong for
-- existing lineage.
--
-- Supersession is a first-class modelled path: a correction INSERTS a new
-- evidence row and then points the old one at it through superseded_by, so two
-- rows legitimately share source_ref and provenance_type. Narrowing the index
-- with `AND superseded_by IS NULL` does not save it either -- between the
-- insert of the replacement and the update of the original, both rows are
-- non-superseded, so the index would refuse the correction at exactly the
-- moment somebody was trying to fix a competence record.
--
-- The lock plus the guarded UPDATE close the race completely and cost nothing.
-- An index that forbids supersession would be a worse defect than the one it
-- guards against.
--
-- ── F2 — THE TRANSITION SURFACE IS REMOVED ──────────────────────────────
--
-- The deprecated five-argument overload and the severity_required queue alias
-- existed for one deploy window. The new build is live and smoke-verified, so
-- they now only create risk: a stale reviewer tab could still complete a
-- safety-critical review through the legacy signature, whose vocabulary cannot
-- express 'no_concern' and therefore silently records `low` on a clean answer.
-- That is the exact over-flagging defect the governed model exists to remove,
-- re-enterable through one un-refreshed browser.
--
-- After this migration a stale client fails loudly (PostgREST resolves no such
-- function) instead of writing a finding nobody made.
--
-- Forward-only. Remediation: restore both objects from 20260823090000.

-- ═══════════════════════════════════════════════════════════════════════════
-- F1 — the governed review path, made concurrency-safe
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_complete_human_review(
  _review_id      uuid,
  _outcome        text,
  _rationale      text,
  _safety_finding text    DEFAULT NULL,
  _rubric_levels  jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _resp record; _a public.scp_attempts%ROWTYPE; _evidence_id uuid; _outstanding int;
  _rubric_version_id uuid; _dim record; _expected int; _supplied int;
  _contribution numeric; _max numeric; _basis jsonb; _severity text;
  _level int; _sum int := 0; _n int := 0; _levels jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.scp_can_author(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_NOT_A_REVIEWER: completing a review requires the '
      'content-review capability.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _outcome NOT IN ('upheld','adjusted','overturned') THEN
    RAISE EXCEPTION 'SCP_BAD_REVIEW_OUTCOME: "%" is not a review outcome.', _outcome
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_rationale),'') = '' THEN
    RAISE EXCEPTION 'SCP_REVIEW_WITHOUT_RATIONALE: a review decision must state '
      'its reasons.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT hr.id AS review_id, r.id AS response_id, r.attempt_id,
         r.selected_option_id, r.best_option_id, r.worst_option_id,
         iv.id AS item_version_id, iv.item_format,
         iv.primary_behaviour_id, iv.is_safety_critical
    INTO _resp
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE hr.id = _review_id AND hr.review_status = 'pending'
     -- F1. Lock the review row here, before ANYTHING is written. Two concurrent
     -- callers both used to pass this lookup, and the loser then inserted a
     -- second evidence row for the same response into an append-only ledger.
     -- With the lock the loser blocks here, re-reads after the winner commits,
     -- finds no pending row and raises below -- before the rubric insert, so a
     -- constructed response fails by name rather than on a unique violation.
     FOR UPDATE OF hr;

  IF _resp.review_id IS NULL THEN
    RAISE EXCEPTION 'SCP_REVIEW_NOT_PENDING: no pending review with that id.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── The safety conclusion ───────────────────────────────────────────────
  --
  -- Still mandatory on a safety-critical item, still never inferred from a
  -- score, and still refused on an item that never claimed to be safety-
  -- critical. What changed is that 'no_concern' is now one of the answers, so a
  -- reviewer looking at a correct response is no longer forced to grade its
  -- severity.
  IF _resp.is_safety_critical THEN
    IF _safety_finding IS NULL THEN
      RAISE EXCEPTION
        'SCP_SAFETY_FINDING_REQUIRED: this item is safety-critical, so the '
        'review must state what it found in THIS response: no_concern, low, '
        'medium, high or critical.' USING ERRCODE = 'check_violation';
    END IF;
    IF _safety_finding NOT IN ('no_concern','low','medium','high','critical') THEN
      RAISE EXCEPTION
        'SCP_BAD_SAFETY_FINDING: "%" is not a finding. Use no_concern, low, '
        'medium, high or critical.', _safety_finding USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _safety_finding IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_FINDING_ON_NON_SAFETY_ITEM: this item is not safety-critical, so a '
      'safety finding would make the evidence say something the item never '
      'claimed.' USING ERRCODE = 'check_violation';
  END IF;

  _severity := CASE WHEN _safety_finding IN ('low','medium','high','critical')
                    THEN _safety_finding ELSE NULL END;

  -- ── The rubric, for a constructed response ──────────────────────────────
  IF _resp.item_format = 'constructed_response' THEN
    SELECT rv.id INTO _rubric_version_id
      FROM public.scp_rubric_versions rv
     WHERE rv.item_version_id = _resp.item_version_id
     ORDER BY rv.version_number DESC LIMIT 1;

    IF _rubric_version_id IS NULL THEN
      RAISE EXCEPTION
        'SCP_NO_RUBRIC: this constructed response has no rubric, so no governed '
        'contribution can be derived for it.' USING ERRCODE = 'check_violation';
    END IF;

    IF _rubric_levels IS NULL OR jsonb_typeof(_rubric_levels) <> 'object' THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_LEVELS_REQUIRED: a constructed response is scored against '
        'its rubric. Supply a level 0-4 for every dimension.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _expected FROM public.scp_rubric_dimensions d
     WHERE d.rubric_version_id = _rubric_version_id;
    SELECT count(*) INTO _supplied FROM jsonb_object_keys(_rubric_levels);

    -- Every dimension, and nothing that is not a dimension. A missing one is a
    -- judgement the reviewer did not make; an unknown one is a judgement about
    -- something this rubric does not measure.
    IF EXISTS (
      SELECT 1 FROM public.scp_rubric_dimensions d
       WHERE d.rubric_version_id = _rubric_version_id
         AND NOT (_rubric_levels ? d.dimension_key))
    THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_DIMENSION_MISSING: every rubric dimension needs an explicit '
        'level. Expected % dimension(s), got %.', _expected, _supplied
        USING ERRCODE = 'check_violation';
    END IF;
    IF _supplied <> _expected THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_DIMENSION_UNKNOWN: % level(s) supplied for a rubric with % '
        'dimension(s).', _supplied, _expected USING ERRCODE = 'check_violation';
    END IF;

    FOR _dim IN
      SELECT d.id, d.dimension_key, d.assesses_writing_quality
        FROM public.scp_rubric_dimensions d
       WHERE d.rubric_version_id = _rubric_version_id
       ORDER BY d.display_order
    LOOP
      IF jsonb_typeof(_rubric_levels -> _dim.dimension_key) <> 'number' THEN
        RAISE EXCEPTION
          'SCP_RUBRIC_LEVEL_NOT_A_LEVEL: dimension "%" needs a level 0-4.',
          _dim.dimension_key USING ERRCODE = 'check_violation';
      END IF;
      _level := (_rubric_levels ->> _dim.dimension_key)::int;
      IF _level < 0 OR _level > 4 THEN
        RAISE EXCEPTION
          'SCP_RUBRIC_LEVEL_OUT_OF_RANGE: dimension "%" got level %, which is '
          'not on the 0-4 scale.', _dim.dimension_key, _level
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.scp_review_rubric_scores
        (review_id, rubric_dimension_id, level, scored_by)
      VALUES (_review_id, _dim.id, _level, auth.uid());

      _levels := _levels || jsonb_build_object(_dim.dimension_key, _level);

      -- Only construct-bearing dimensions move the number. The rubric marks the
      -- style dimension with assesses_writing_quality, the scoring prompt says
      -- simple language must score equally to polished, and the anchors carry a
      -- deliberate polished-but-empty example. Letting it contribute here would
      -- contradict all three.
      IF NOT _dim.assesses_writing_quality THEN
        _sum := _sum + _level;
        _n   := _n + 1;
      END IF;
    END LOOP;

    IF _n = 0 THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_ALL_STYLE: this rubric has no construct-bearing dimension, '
        'so it cannot produce a contribution.' USING ERRCODE = 'check_violation';
    END IF;

    _contribution := round((_sum::numeric / _n) / 4.0, 3);
    _basis := jsonb_build_object(
      'method', 'governed_rubric_mean',
      'rubric_version_id', _rubric_version_id,
      'levels', _levels,
      'contributing_dimensions', _n,
      'scale_max', 4);

  ELSIF _rubric_levels IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_LEVELS_ON_NON_RUBRIC_ITEM: only a constructed response is '
      'scored against a rubric.' USING ERRCODE = 'check_violation';

  -- ── The governed item score, for an SJT ────────────────────────────────
  --
  -- Identical arithmetic to the deterministic branch of scp_submit_attempt.
  -- These items reached a human because a safety-critical observation needs a
  -- human conclusion, not because their score was unknown.
  ELSIF _resp.item_format = 'sjt_best_worst' THEN
    SELECT (COALESCE((SELECT CASE WHEN o.is_best_key  THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = _resp.best_option_id), 0)
          + COALESCE((SELECT CASE WHEN o.is_worst_key THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = _resp.worst_option_id), 0))
           / 2.0
      INTO _contribution;
    _basis := jsonb_build_object(
      'method', 'governed_best_worst_keys',
      'best_option_matched',
        COALESCE((SELECT o.is_best_key FROM public.scp_item_options o
                   WHERE o.id = _resp.best_option_id), false),
      'worst_option_matched',
        COALESCE((SELECT o.is_worst_key FROM public.scp_item_options o
                   WHERE o.id = _resp.worst_option_id), false),
      'scale_max', 1);

  ELSE
    SELECT max(o.score_value) INTO _max
      FROM public.scp_item_options o WHERE o.item_version_id = _resp.item_version_id;
    SELECT COALESCE(
             (SELECT o.score_value FROM public.scp_item_options o
               WHERE o.id = _resp.selected_option_id), 0)
           / NULLIF(_max, 0)
      INTO _contribution;
    _basis := jsonb_build_object(
      'method', 'governed_item_score',
      'selected_score',
        COALESCE((SELECT o.score_value FROM public.scp_item_options o
                   WHERE o.id = _resp.selected_option_id), 0),
      'item_max_score', _max);
  END IF;

  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _resp.attempt_id;

  UPDATE public.scp_human_reviews
     SET review_status = 'completed', outcome = _outcome,
         reviewer_actor_id = auth.uid(), reviewer_rationale = _rationale,
         completed_at = now()
   WHERE id = _review_id
     AND review_status = 'pending';

  -- Belt and braces with the lock above. If the row is no longer pending the
  -- transaction stops here, before any evidence is written.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_REVIEW_NOT_PENDING: this review was completed by '
      'someone else while you were working on it. Nothing you entered has been '
      'saved. Reload the queue.' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Evidence, only when the governed reading stands ─────────────────────
  --
  -- adjusted/overturned means the reviewer disputes the reading and there is no
  -- governed alternative to replace it with. Writing the participant's original
  -- number here would record it as accepted; writing a made-up one would be
  -- worse. So nothing is written, and the competency stays a follow-up case --
  -- scp_attempt_evidence_state finds it through the review rather than through
  -- an evidence row.
  IF _outcome <> 'upheld' THEN
    SELECT count(*) INTO _outstanding
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
     WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';
    IF _outstanding = 0 THEN
      UPDATE public.scp_attempts
         SET status = 'scored', scored_at = now()
       WHERE id = _resp.attempt_id AND status = 'submitted';
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO public.scp_competency_evidence (
    subject_id, behaviour_version_id, source_type, source_ref,
    provenance_type, provenance_ref, created_by_service, assessor_actor_id,
    issuer_organization_id, jurisdiction_id, purpose_version_id, role_version_id,
    context_type, context_ref, contribution, confidence,
    is_safety_critical, safety_severity, safety_finding, derivation_basis,
    review_status, disclosure_class, observed_at)
  VALUES (
    _a.subject_id, _resp.primary_behaviour_id, 'assessment_response', _resp.response_id,
    'human_review', _review_id, 'scp_complete_human_review', auth.uid(),
    _a.issuer_organization_id, _a.jurisdiction_id, _a.purpose_version_id,
    _a.role_version_id, 'assessment_form', _a.form_id,
    round(greatest(0, least(1, COALESCE(_contribution, 0))), 3), 1.000,
    _resp.is_safety_critical, _severity, _safety_finding, _basis,
    'upheld', 'internal_employer', now())
  RETURNING id INTO _evidence_id;

  SELECT count(*) INTO _outstanding
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';

  IF _outstanding = 0 THEN
    UPDATE public.scp_attempts
       SET status = 'scored', scored_at = now()
     WHERE id = _resp.attempt_id AND status = 'submitted';
  END IF;

  RETURN _evidence_id;
END; $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- F2 — the transition surface, removed
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, numeric, text);

-- The queue loses `severity_required`. Return type changes, so this is a drop
-- and recreate and the ACL has to be restated.
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
  finding_required boolean,
  item_format text,
  response_text text,
  chosen_label text,
  chosen_best_label text,
  chosen_worst_label text,
  rubric jsonb,
  outstanding_in_attempt integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
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
    upper(substr(replace(at.subject_id::text, '-', ''), 1, 6)),
    e.name,
    CASE WHEN _language = 'en-GB' THEN d.name_en ELSE d.name_sv END,
    d.slug,
    at.governance_mode,
    at.validation_status_at_assignment,
    pv.purpose_code,
    fi.display_order,
    coalesce(itx.scenario, itx_any.scenario),
    coalesce(itx.prompt, itx_any.prompt),
    iv.is_safety_critical,
    iv.is_safety_critical,   -- finding_required
    iv.item_format,
    r.response_text,
    chosen.label,
    chosen_best.label,
    chosen_worst.label,
    rub.dimensions,
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
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'dimension_key', d.dimension_key,
             'name', CASE WHEN _language = 'en-GB' THEN d.name_en ELSE d.name_sv END,
             'criterion', CASE WHEN _language = 'en-GB'
                               THEN d.observable_criteria_en ELSE d.observable_criteria_sv END,
             'style_only', d.assesses_writing_quality,
             'levels', (SELECT jsonb_agg(jsonb_build_object(
                                 'level', l.level,
                                 'descriptor', CASE WHEN _language = 'en-GB'
                                                    THEN l.descriptor_en ELSE l.descriptor_sv END)
                                ORDER BY l.level)
                          FROM public.scp_rubric_levels l
                         WHERE l.rubric_dimension_id = d.id))
             ORDER BY d.display_order) AS dimensions
      FROM public.scp_rubric_dimensions d
     WHERE iv.item_format = 'constructed_response'
       AND d.rubric_version_id = (
         SELECT rv.id FROM public.scp_rubric_versions rv
          WHERE rv.item_version_id = iv.id
          ORDER BY rv.version_number DESC LIMIT 1)
  ) rub ON true
  LEFT JOIN public.employers e ON e.id = at.issuer_organization_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
  WHERE hr.review_status = 'pending'
  ORDER BY hr.opened_at, fi.display_order;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_review_queue(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_queue(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text; _n int;
BEGIN
  _def := pg_get_functiondef(
    'public.scp_complete_human_review(uuid,text,text,text,jsonb)'::regprocedure);

  IF _def NOT LIKE '%FOR UPDATE OF hr%' THEN
    RAISE EXCEPTION 'SCP_F1_NO_LOCK: the review lookup does not lock the review row';
  END IF;
  IF _def NOT LIKE '%AND review_status = ''pending''%' THEN
    RAISE EXCEPTION 'SCP_F1_UNGUARDED_UPDATE: the completion UPDATE is not guarded';
  END IF;
  IF _def NOT LIKE '%IF NOT FOUND THEN%' THEN
    RAISE EXCEPTION 'SCP_F1_NO_NOT_FOUND: a lost race would pass silently';
  END IF;

  -- Exactly one overload survives, and it is the governed one.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_complete_human_review';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_F2_OVERLOAD_REMAINS: % overload(s) of scp_complete_human_review', _n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'scp_complete_human_review'
                AND pg_get_function_identity_arguments(p.oid) LIKE '%numeric%') THEN
    RAISE EXCEPTION 'SCP_F2_LEGACY_LIVES: the deprecated overload is still callable';
  END IF;

  -- The alias is gone; the honest column is not.
  IF EXISTS (SELECT 1 FROM information_schema.parameters p
               JOIN information_schema.routines r ON r.specific_name = p.specific_name
              WHERE r.routine_schema = 'public' AND r.routine_name = 'scp_review_queue'
                AND p.parameter_name = 'severity_required') THEN
    RAISE EXCEPTION 'SCP_F2_ALIAS_LIVES: severity_required is still returned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.parameters p
                   JOIN information_schema.routines r ON r.specific_name = p.specific_name
                  WHERE r.routine_schema = 'public' AND r.routine_name = 'scp_review_queue'
                    AND p.parameter_name = 'finding_required') THEN
    RAISE EXCEPTION 'SCP_F2_FINDING_MISSING: finding_required was lost with the alias';
  END IF;

  -- ACLs survive the drop and recreate. Hosted grants EXECUTE on new public
  -- functions to every role by default, so this is not decoration.
  IF has_function_privilege('anon', 'public.scp_review_queue(text)', 'EXECUTE')
     OR has_function_privilege('anon',
          'public.scp_complete_human_review(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_F2_ANON_EXECUTE: a function is anon-callable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.scp_review_queue(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_F2_REVIEWER_LOCKED_OUT: reviewers cannot read the queue';
  END IF;

  -- Nothing about governance moved.
  IF EXISTS (SELECT 1 FROM public.scp_test_grants
              WHERE purpose = 'closed_test' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'SCP_F_BOUNDARY: a closed_test grant exists';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-review-concurrency-and-legacy-removal', 'updated',
  'Pre-pilot maintenance, F1 and F2 from the independent red-team review. F1: scp_complete_human_review checked pending in its lookup but completed with an UPDATE carrying no status predicate and no row lock. The red-team finding claimed this let two concurrent reviewers write duplicate evidence; verified against the pre-fix function with two real connections, it did not -- scp_guard_review_immutable_once_done has refused the second UPDATE since 20260804061750 and the UPDATE precedes the evidence INSERT. What was real, and also verified by racing two connections: the SJT loser got SCP_REVIEW_COMPLETED_IMMUTABLE (advice for editing an old review, not for losing a race), and the constructed-response loser died on a raw 23505 rubric unique violation because rubric levels are written before the review row. The lookup now takes FOR UPDATE on the review row and the UPDATE is guarded by review_status = pending with a named error, so the loser fails by name before writing anything. A partial unique index on human-review evidence was evaluated and rejected: supersession legitimately creates a second row with the same source_ref, so the index would refuse corrections. F2: the deprecated five-argument overload and the severity_required queue alias are removed now the new build is live, because a stale tab using the legacy signature cannot express no_concern and would silently record a low safety finding on a correct answer.',
  jsonb_build_object(
    'migration', '20260824090000_scp_review_concurrency_and_legacy_removal',
    'f1_review_row_locked', true,
    'f1_guarded_update', true,
    'f1_unique_index_added', false,
    'f1_unique_index_rejected_because', 'supersession legitimately shares source_ref',
    'f2_legacy_overload_removed', true,
    'f2_severity_required_alias_removed', true,
    'closed_test_granted', false));
