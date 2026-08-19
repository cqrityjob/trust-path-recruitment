-- The governed evidence model: contribution is derived, safety is a finding.
--
-- ── WHAT THIS CLOSES ────────────────────────────────────────────────────
--
-- Two defects that would have written permanent, misleading rows into an
-- append-only ledger the moment a closed test opened.
--
-- 1. THE CONSTANT. `ReviewQueue.tsx` sent `contribution: 0.5` as a literal,
--    `completeReview` re-declared it as a zod default, and
--    scp_complete_human_review accepted it as `_contribution numeric DEFAULT
--    0.5`. Thirteen of the eighteen Security Guard items route to human review,
--    and five of the eight competencies are composed ENTIRELY of such rows. So
--    for 72% of a pilot's evidence the number recorded was a constant, and a
--    reviewer who overturned a dangerous answer wrote exactly what a reviewer
--    who upheld an exemplary one wrote.
--
-- 2. THE CONFLATED BOOLEAN. scp_competency_evidence.is_safety_critical carried
--    two different claims at once: "the ITEM was classified safety-critical"
--    and "THIS RESPONSE is a safety concern". Because the constraint
--    scp_evidence_safety_is_specified demanded a severity from
--    (low, medium, high, critical) whenever the flag was set, and twelve items
--    are classified safety-critical, every participant -- including one who
--    answered all twelve correctly -- generated twelve permanent safety-flagged
--    rows carrying a severity a reviewer had to invent, and was then told in
--    their own report that their answers had triggered safety-critical review.
--    A signal that fires for everyone carries no information, and it is the
--    genuine `critical` that gets waved through.
--
-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────
--
-- The client never submits a competency contribution again: the parameter is
-- GONE from the signature, so a caller that still tries fails loudly instead of
-- silently supplying a constant. Contribution is derived server-side from the
-- item's own governed scoring -- the same sources the deterministic path in
-- scp_submit_attempt already reads.
--
-- Deriving it here rather than in the client is also strictly better for the
-- trust boundary: score_value, is_preferred, is_best_key and is_worst_key never
-- have to be projected into a reviewer payload. scp_review_queue still returns
-- no scoring data at all.
--
-- Item classification and response finding are separated into two columns that
-- are never collapsed. is_safety_critical keeps its meaning exactly -- the item
-- was classified -- and stays available for audit. safety_finding is the
-- reviewer's conclusion about the response, and it may be 'no_concern'.
--
-- ── WHAT REVIEW OUTCOME DOES, AND DOES NOT, DO ──────────────────────────
--
-- There is deliberately NO upheld=1 / adjusted=0.5 / overturned=0 mapping.
-- Review outcome and evidence contribution are different concepts. An SJT
-- response is a single option choice: there is nothing for a reviewer to
-- re-measure, only a reading to confirm or dispute.
--
--   upheld              -> the governed contribution is written.
--   adjusted/overturned -> NO competency contribution is written at all.
--
-- The second case is the important one. The reviewer is saying the governed
-- reading does not fit this response, and there is no governed ALTERNATIVE
-- reading to put in its place. Inventing one, or quietly writing the
-- participant's original number as though the reviewer had accepted it, would
-- both be lies. So the review row, its rationale, its outcome, the provenance
-- and the participant's response are all preserved, and the competency remains
-- a follow-up case -- which scp_attempt_evidence_state now reports even when
-- the disputed review left no evidence row behind to find it by.
--
-- ── FORWARD ONLY ────────────────────────────────────────────────────────
--
-- No applied migration is edited. No existing evidence row is rewritten: the
-- append-only guard forbids it and that guard is correct. The four fixture rows
-- keep their NULL derivation_basis, which is honest -- nothing recorded how
-- their numbers were produced, and one of them is the 0.500 constant itself.
--
-- Rollback-forward: restore scp_complete_human_review from 20260819120000,
-- scp_review_queue from 20260819140000, the maturity/state functions from
-- 20260802090000 / 20260820100000 / 20260820130000, the view from
-- 20260804061230, restore the original CHECK, and drop safety_finding,
-- derivation_basis and scp_review_rubric_scores. Safe only while no row carries
-- safety_finding = 'no_concern'; after a pilot starts, rollback means accepting
-- that those rows would violate the restored constraint.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Evidence carries its derivation and the response-level finding
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_competency_evidence
  ADD COLUMN IF NOT EXISTS derivation_basis jsonb,
  ADD COLUMN IF NOT EXISTS safety_finding text
    CHECK (safety_finding IS NULL OR safety_finding IN
      ('no_concern', 'low', 'medium', 'high', 'critical'));

COMMENT ON COLUMN public.scp_competency_evidence.derivation_basis IS
  'How this contribution was produced, recorded with the row so it can be '
  'explained later without joining to a scoring key the reader may not be '
  'permitted to see. NULL on rows written before derivation was recorded.';

COMMENT ON COLUMN public.scp_competency_evidence.safety_finding IS
  'The reviewer''s conclusion about THIS RESPONSE: no_concern, low, medium, '
  'high or critical. Distinct from is_safety_critical, which records that the '
  'ITEM was classified safety-critical and is kept for audit. A safety-critical '
  'item answered well is a no_concern finding, not a safety flag.';

-- The original constraint demanded a severity whenever the item was classified
-- safety-critical, which is what forced a reviewer to invent one for a correct
-- answer. The replacement demands a CONCLUSION instead -- still mandatory,
-- still never inferred, but 'no_concern' is now sayable. It is strictly weaker
-- than the constraint it replaces, so no existing row can violate it.
ALTER TABLE public.scp_competency_evidence
  DROP CONSTRAINT IF EXISTS scp_evidence_safety_is_specified;
ALTER TABLE public.scp_competency_evidence
  ADD CONSTRAINT scp_evidence_safety_is_specified CHECK (
    NOT is_safety_critical OR safety_finding IS NOT NULL);

-- safety_severity is retained so every existing reader keeps working, and is
-- pinned TO the finding so the two can never drift apart. One concept, two
-- columns, and the derived one cannot be set independently.
ALTER TABLE public.scp_competency_evidence
  DROP CONSTRAINT IF EXISTS scp_evidence_severity_matches_finding;
ALTER TABLE public.scp_competency_evidence
  ADD CONSTRAINT scp_evidence_severity_matches_finding CHECK (
    (safety_finding IS NULL     AND safety_severity IS NULL)
    OR (safety_finding = 'no_concern' AND safety_severity IS NULL)
    OR (safety_finding IN ('low','medium','high','critical')
        AND safety_severity = safety_finding));

-- Both new columns join the immutable set. A finding that could be edited after
-- the fact is not a finding, and a derivation that could be rewritten explains
-- nothing.
CREATE OR REPLACE FUNCTION public.scp_guard_evidence_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_APPEND_ONLY: evidence is never deleted; supersede it, or '
      'unlink the subject identity if erasure is required.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_ALREADY_SUPERSEDED: evidence % is already superseded and is immutable.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.subject_id             IS DISTINCT FROM OLD.subject_id
     OR NEW.behaviour_version_id   IS DISTINCT FROM OLD.behaviour_version_id
     OR NEW.source_type           IS DISTINCT FROM OLD.source_type
     OR NEW.source_ref            IS DISTINCT FROM OLD.source_ref
     OR NEW.source_snapshot_hash  IS DISTINCT FROM OLD.source_snapshot_hash
     OR NEW.provenance_type       IS DISTINCT FROM OLD.provenance_type
     OR NEW.provenance_ref        IS DISTINCT FROM OLD.provenance_ref
     OR NEW.scoring_model_version IS DISTINCT FROM OLD.scoring_model_version
     OR NEW.created_by_service    IS DISTINCT FROM OLD.created_by_service
     OR NEW.assessor_actor_id     IS DISTINCT FROM OLD.assessor_actor_id
     OR NEW.issuer_organization_id IS DISTINCT FROM OLD.issuer_organization_id
     OR NEW.jurisdiction_id       IS DISTINCT FROM OLD.jurisdiction_id
     OR NEW.purpose_version_id    IS DISTINCT FROM OLD.purpose_version_id
     OR NEW.context_type          IS DISTINCT FROM OLD.context_type
     OR NEW.context_ref           IS DISTINCT FROM OLD.context_ref
     OR NEW.role_version_id       IS DISTINCT FROM OLD.role_version_id
     OR NEW.contribution          IS DISTINCT FROM OLD.contribution
     OR NEW.confidence            IS DISTINCT FROM OLD.confidence
     OR NEW.is_safety_critical    IS DISTINCT FROM OLD.is_safety_critical
     OR NEW.safety_severity       IS DISTINCT FROM OLD.safety_severity
     OR NEW.safety_finding        IS DISTINCT FROM OLD.safety_finding
     OR NEW.derivation_basis      IS DISTINCT FROM OLD.derivation_basis
     OR NEW.disclosure_class      IS DISTINCT FROM OLD.disclosure_class
     OR NEW.observed_at           IS DISTINCT FROM OLD.observed_at
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'SCP_EVIDENCE_IMMUTABLE: only superseded_by/_reason/_at/_by_actor_id, '
      'review_status, requires_human_review and valid_until may change.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — The reviewer's rubric judgement, persisted per dimension
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A constructed response has no governed numeric until a human applies the
-- rubric. Storing only the derived mean would throw away the judgement and keep
-- the arithmetic; this keeps the judgement, so the mean can be re-derived,
-- audited, or recalculated under a different rule after the pilot without
-- asking anybody to score anything twice.

CREATE TABLE IF NOT EXISTS public.scp_review_rubric_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id           uuid NOT NULL
    REFERENCES public.scp_human_reviews(id) ON DELETE RESTRICT,
  rubric_dimension_id uuid NOT NULL
    REFERENCES public.scp_rubric_dimensions(id) ON DELETE RESTRICT,
  level               integer NOT NULL CHECK (level BETWEEN 0 AND 4),
  scored_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, rubric_dimension_id)
);

COMMENT ON TABLE public.scp_review_rubric_scores IS
  'One reviewer level (0-4) per rubric dimension per human review. Append-only: '
  'the reviewer''s judgement is the evidence, and evidence that can be edited '
  'afterwards is not evidence. The contribution is derived from these rows, '
  'never typed by a reviewer.';

CREATE INDEX IF NOT EXISTS scp_review_rubric_scores_review_idx
  ON public.scp_review_rubric_scores (review_id);

CREATE OR REPLACE FUNCTION public.scp_guard_rubric_score_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_RUBRIC_SCORE_APPEND_ONLY: a recorded rubric level is not editable. '
    'Open a new review if the judgement has to change.'
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS scp_review_rubric_scores_append_only
  ON public.scp_review_rubric_scores;
CREATE TRIGGER scp_review_rubric_scores_append_only
  BEFORE UPDATE OR DELETE ON public.scp_review_rubric_scores
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_rubric_score_append_only();

ALTER TABLE public.scp_review_rubric_scores ENABLE ROW LEVEL SECURITY;

-- Read-only for reviewers, exactly like the four policies Phase 8.5A narrowed.
-- The only writer is scp_complete_human_review, which is SECURITY DEFINER and
-- therefore not subject to this policy at all. There is deliberately no write
-- policy: a direct PostgREST INSERT would bypass every validation the function
-- performs.
DROP POLICY IF EXISTS scp_review_rubric_scores_author_read
  ON public.scp_review_rubric_scores;
CREATE POLICY scp_review_rubric_scores_author_read
  ON public.scp_review_rubric_scores
  FOR SELECT TO authenticated USING (public.scp_can_author(auth.uid()));

-- `authenticated` is revoked EXPLICITLY, not just PUBLIC and anon. Supabase
-- ships ALTER DEFAULT PRIVILEGES granting ALL on new public tables to
-- authenticated, so a table created here starts out INSERT/UPDATE/DELETE-able
-- by every signed-in user and the RLS policy below is the only thing standing
-- in the way. Caught by the assertion at the bottom of this file on the first
-- clean replay, which is exactly what that assertion is for.
REVOKE ALL  ON public.scp_review_rubric_scores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_review_rubric_scores TO authenticated;
GRANT ALL    ON public.scp_review_rubric_scores TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2b — The delivery fixture's constructed response gets a rubric
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Surfaced by this migration rather than designed with it: fixture-e2e-04 is a
-- constructed_response with requires_human_review = true and ZERO rubric
-- versions. Under the old model that was invisible, because the reviewer's
-- number was a constant and no rubric was ever consulted. Under this one the
-- function refuses -- correctly, because a constructed response with no rubric
-- has no governed way to be scored, and refusing is better than inventing.
--
-- The fixture is internal development content, so it gets the smallest honest
-- rubric that exercises the path: one construct-bearing dimension and one
-- style dimension, so the fixture suites prove that writing quality is excluded
-- from the derived contribution rather than merely that a number came out.
--
-- The wider gap this exposes -- that an item may be authored as a constructed
-- response with no rubric at all, and nothing refuses it until scoring time --
-- is left alone here. It wants an authoring guard, which is a separate concern
-- from the evidence model.

INSERT INTO public.scp_rubrics (slug) VALUES ('fixture-e2e-04-response')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_rubric_versions
  (rubric_id, item_version_id, version_number, content_status, name_sv, name_en, must_not_infer)
SELECT r.id, iv.id, 1, 'draft', 'Fixtursvar', 'Fixture response',
  ARRAY['personlighet','ärlighet','motivation','avsikt']
  FROM public.scp_rubrics r
  CROSS JOIN public.scp_item_versions iv
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE r.slug = 'fixture-e2e-04-response'
   AND i.slug = 'fixture-e2e-04'
   AND iv.item_format = 'constructed_response'
ON CONFLICT (rubric_id, version_number) DO NOTHING;

INSERT INTO public.scp_rubric_dimensions
  (rubric_version_id, dimension_key, display_order, name_sv, name_en,
   observable_criteria_sv, observable_criteria_en, assesses_writing_quality)
SELECT rv.id, v.k, v.ord, v.sv, v.en, v.csv, v.cen, v.style
  FROM (VALUES
    ('decision_quality', 1, 'Beslutskvalitet', 'Decision quality',
     'Åtgärden är rimlig och inom mandat.', 'The action is reasonable and within mandate.', false),
    ('clarity', 2, 'Tydlighet', 'Clarity',
     'Svaret går att följa. Språklig elegans påverkar inte poängen.',
     'The response can be followed. Linguistic polish does not affect the score.', true)
  ) AS v(k, ord, sv, en, csv, cen, style)
  JOIN public.scp_rubrics r ON r.slug = 'fixture-e2e-04-response'
  JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id AND rv.version_number = 1
ON CONFLICT (rubric_version_id, dimension_key) DO NOTHING;

INSERT INTO public.scp_rubric_levels (rubric_dimension_id, level, descriptor_sv, descriptor_en)
SELECT d.id, l.lvl, l.sv, l.en
  FROM public.scp_rubric_dimensions d
  JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
  JOIN public.scp_rubrics r ON r.id = rv.rubric_id AND r.slug = 'fixture-e2e-04-response'
  CROSS JOIN (VALUES
    (0,'Inget underlag i svaret för denna dimension.','No evidence in the response for this dimension.'),
    (1,'Enstaka relevant inslag, men väsentligt saknas.','An isolated relevant element, but essentials are missing.'),
    (2,'Delvis uppfyllt; minst en väsentlig brist kvarstår.','Partly met; at least one material gap remains.'),
    (3,'Uppfyllt i allt väsentligt utan allvarliga brister.','Met in all essentials with no serious gaps.'),
    (4,'Uppfyllt genomgående och med tydlig prioritering.','Met throughout, with clear prioritisation.')
  ) AS l(lvl, sv, en)
ON CONFLICT (rubric_dimension_id, level) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — The review function: no client number, no invented severity
-- ═══════════════════════════════════════════════════════════════════════════

-- Dropped so the replacement is a clean definition rather than a body swap.
-- SECTION 3b then RE-creates this exact signature as a deprecated, delegating
-- compatibility wrapper that ignores the contribution, so the currently
-- deployed application keeps working across the deploy window. Both live in
-- this one migration on purpose: splitting them would leave a moment where the
-- signature the running application calls does not exist.
DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, numeric, text);

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
   WHERE hr.id = _review_id AND hr.review_status = 'pending';

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
   WHERE id = _review_id;

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

COMMENT ON FUNCTION public.scp_complete_human_review(uuid, text, text, text, jsonb) IS
  'Records a reviewer''s judgement. The reviewer never supplies a number: the '
  'contribution is derived server-side from the item''s own governed scoring, '
  'or for a constructed response from the rubric levels they selected. A '
  'safety-critical item requires an explicit finding about the RESPONSE, which '
  'may be no_concern. Only an upheld outcome writes competency evidence; a '
  'disputed reading leaves the review, its rationale and the response, and no '
  'invented contribution.';

-- A dropped-and-recreated function loses its ACL, and hosted Postgres grants
-- EXECUTE on new public functions to every role by default.
REVOKE ALL     ON FUNCTION public.scp_complete_human_review(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_human_review(uuid, text, text, text, jsonb)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3b — DEPRECATED — TRANSITION COMPATIBILITY ONLY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────
--
-- A database migration and an application deploy are not atomic with respect
-- to each other, and either order breaks something without this:
--
--   database first     the deployed application still calls the five-argument
--                      signature with `_contribution`, PostgREST finds no such
--                      function, and every review fails until the new build is
--                      out.
--   application first  the new build calls `_safety_finding` / `_rubric_levels`
--                      against a database that has neither.
--
-- So the old signature stays resolvable for one deployment window. PostgREST
-- resolves an RPC overload by ARGUMENT NAME, which is why the parameter names
-- here are exactly the ones the currently deployed client sends. Renaming even
-- one of them would defeat the entire purpose of this function.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────
--
-- `_contribution` is accepted and IGNORED. Completely. It is never read, never
-- passed on, never stored, and it reaches no evidence row, no scoring, no
-- maturity computation, no report and no derivation_basis. The parameter exists
-- so an HTTP call from the old build still resolves -- that is transport
-- compatibility, not client control. The number this function actually writes
-- is derived by the governed path below, exactly as it is for a new client.
--
-- The distinction matters and is worth stating plainly: the forbidden thing was
-- never the existence of an argument. It was a client deciding what somebody's
-- competence record says.
--
-- No scoring key, governed score or preference reaches the caller either. This
-- function returns what the new one returns: an evidence id, or NULL.
--
-- ── CONSTRUCTED RESPONSES ARE REFUSED, DELIBERATELY ─────────────────────
--
-- The old build has no rubric controls, so it cannot send rubric levels, and
-- there is no governed way to score a constructed response without them. The
-- options were to invent a number or to refuse. This refuses.
--
-- It refuses BEFORE anything is written, so the review stays pending, its row
-- is untouched, no evidence is created and nothing is corrupted -- the reviewer
-- can complete the same review from the updated workspace a moment later. What
-- is lost is the text still sitting in the old browser form, which the error
-- message tells the reviewer to copy before reloading. Storing that text onto a
-- still-pending review row was considered and rejected: a half-completed review
-- is a new state for every queue and report reader to get right, in exchange
-- for a convenience that lasts one deploy.
--
-- SJT reviews -- 12 of the 13 in a Security Guard run -- keep working
-- throughout, because their governed score derives from the stored response
-- and needs nothing from the client.
--
-- ── REMOVAL ─────────────────────────────────────────────────────────────
--
-- Removed by a separate forward maintenance migration AFTER the hosted
-- migration is applied, the new application is deployed, and live smoke tests
-- confirm the new contract. Not here.

CREATE OR REPLACE FUNCTION public.scp_complete_human_review(
  _review_id      uuid,
  _outcome        text,
  _rationale      text,
  _contribution   numeric,
  _safety_severity text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _fmt text;
BEGIN
  -- DEPRECATED — TRANSITION COMPATIBILITY ONLY.
  -- `_contribution` is not read anywhere in this body. That is the point of it.

  -- Capability FIRST, before anything is looked up. Duplicated with the
  -- function this delegates to, deliberately: without it, an employer or the
  -- candidate themselves could call this and learn from the error message
  -- whether a review they may not see is a constructed response. Caught by
  -- VJ12.8, which asked for SCP_NOT_A_REVIEWER and got the item format instead.
  IF NOT public.scp_can_author(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_NOT_A_REVIEWER: completing a review requires the '
      'content-review capability.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT iv.item_format INTO _fmt
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE hr.id = _review_id AND hr.review_status = 'pending';

  IF _fmt = 'constructed_response' THEN
    RAISE EXCEPTION
      'SCP_LEGACY_CLIENT_CANNOT_SCORE_RUBRIC: this reviewer workspace is from '
      'before rubric scoring and cannot score a constructed response. Nothing '
      'has been saved and the review is still open. Copy your reasoning, '
      'reload the workspace, and complete it there.'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  -- Straight through to the one governed derivation path. The old vocabulary
  -- maps onto the new one unchanged: a reviewer who said 'low' meant 'low'.
  -- An old client cannot express 'no_concern', so it keeps the old
  -- over-triggering behaviour for the length of the window -- which is one more
  -- reason for the window to be short.
  RETURN public.scp_complete_human_review(
    _review_id, _outcome, _rationale, _safety_severity::text, NULL::jsonb);
END; $function$;

COMMENT ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text) IS
  'DEPRECATED -- TRANSITION COMPATIBILITY ONLY. Exists so the previously '
  'deployed application keeps working across the deploy window. _contribution '
  'is accepted and IGNORED: it never reaches evidence, scoring, maturity, a '
  'report or derivation_basis. The contribution is derived server-side by the '
  '(uuid,text,text,text,jsonb) overload, which this delegates to. Constructed '
  'responses are refused rather than scored without rubric levels. Remove in a '
  'separate forward migration once the new application is deployed and smoke '
  'tested.';

REVOKE ALL     ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Every downstream reader asks about the FINDING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These four keep their signatures, so CREATE OR REPLACE preserves the ACLs
-- Phase 8.5A set: all four are revoked from `authenticated` and reachable only
-- through the definer functions that call them. Nothing here re-grants.

CREATE OR REPLACE FUNCTION public.scp_compute_maturity(
  _subject_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _concern boolean;
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
  ),
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(safety_finding IN ('low','medium','high','critical')), false)
    INTO _obs, _ctx, _srcs, _mean, _concern
    FROM best;

  IF _obs = 0 THEN
    RETURN 'no_evidence';
  END IF;

  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  -- The cap now depends on what a reviewer FOUND, not on how the item was
  -- classified. A safety-critical item answered well no longer holds a
  -- competency down, and a real concern still does.
  IF _concern AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END; $$;

CREATE OR REPLACE FUNCTION public.scp_attempt_maturity(
  _attempt_id uuid,
  _competency_version_id uuid,
  _threshold_version text DEFAULT 'v1',
  _at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _obs int; _ctx int; _srcs int; _mean numeric; _concern boolean;
  _level text := 'no_evidence';
  _t record;
BEGIN
  WITH live AS (
    SELECT e.*,
           CASE e.provenance_type
             WHEN 'human_review'   THEN 3
             WHEN 'ai_scoring_run' THEN 2
             ELSE 1
           END AS rank
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = e.behaviour_version_id
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.valid_until IS NULL OR e.valid_until > _at)
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ),
  best AS (
    SELECT DISTINCT ON (source_type, source_ref, behaviour_version_id) *
      FROM live
     ORDER BY source_type, source_ref, behaviour_version_id, rank DESC, observed_at DESC
  )
  SELECT count(*),
         count(DISTINCT coalesce(
           context_type || ':' || coalesce(context_ref::text, ''),
           behaviour_version_id::text)),
         count(DISTINCT source_type),
         coalesce(sum(contribution * confidence) / nullif(sum(confidence), 0), 0),
         coalesce(bool_or(safety_finding IN ('low','medium','high','critical')), false)
    INTO _obs, _ctx, _srcs, _mean, _concern
    FROM best;

  IF _obs = 0 THEN RETURN 'no_evidence'; END IF;

  FOR _t IN
    SELECT * FROM public.scp_maturity_thresholds
     WHERE threshold_version = _threshold_version AND is_active
     ORDER BY min_mean_contribution ASC, min_observations ASC
  LOOP
    IF _mean >= _t.min_mean_contribution
       AND _obs  >= _t.min_observations
       AND _ctx  >= _t.min_contexts
       AND _srcs >= _t.min_source_types
    THEN
      _level := _t.level;
    END IF;
  END LOOP;

  IF _concern AND _level IN ('consistent_evidence', 'strong_evidence') THEN
    _level := 'developing_evidence';
  END IF;

  RETURN _level;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scp_display_evidence_state(
  _subject_id uuid,
  _competency_version_id uuid,
  _maturity text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _needs_action boolean; _reviewer_flagged boolean;
BEGIN
  -- A real finding from a human, or a review still open on a safety-critical
  -- item. `is_safety_critical` alone is no longer enough: it says what the ITEM
  -- was, not what the response showed.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.safety_finding IN ('high','critical')
         OR (e.is_safety_critical AND e.review_status IN ('pending','in_review')))
  ) INTO _needs_action;

  IF _needs_action THEN RETURN 'critical_follow_up'; END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
      JOIN public.scp_human_reviews hr ON hr.id = e.provenance_ref
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND e.provenance_type = 'human_review'
       AND hr.outcome IN ('adjusted','overturned')
  ) INTO _reviewer_flagged;

  IF _reviewer_flagged THEN RETURN 'follow_up'; END IF;

  RETURN CASE _maturity
    WHEN 'strong_evidence'     THEN 'strongly_shown'
    WHEN 'consistent_evidence' THEN 'shown'
    WHEN 'no_evidence'         THEN 'not_yet_shown'
    ELSE 'follow_up'
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scp_attempt_evidence_state(
  _attempt_id uuid,
  _competency_version_id uuid,
  _maturity text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _needs_action boolean; _reviewer_flagged boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
     WHERE m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND (e.safety_finding IN ('high','critical')
         OR (e.is_safety_critical AND e.review_status IN ('pending','in_review')))
       AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                             WHERE r.attempt_id = _attempt_id)
  ) INTO _needs_action;

  IF _needs_action THEN RETURN 'critical_follow_up'; END IF;

  -- A disputed review now counts whether or not it left an evidence row. Before
  -- this migration adjusted/overturned always wrote one, so joining through
  -- evidence found every case; now it deliberately writes none, and joining
  -- only through evidence would lose exactly the case the owner asked to keep
  -- visible as a follow-up.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_behaviour_competency_map m
        ON m.behaviour_version_id = iv.primary_behaviour_id
     WHERE r.attempt_id = _attempt_id
       AND m.competency_version_id = _competency_version_id
       AND hr.review_status = 'completed'
       AND hr.outcome IN ('adjusted','overturned')
  ) INTO _reviewer_flagged;

  IF _reviewer_flagged THEN RETURN 'follow_up'; END IF;

  RETURN CASE _maturity
    WHEN 'strong_evidence'     THEN 'strongly_shown'
    WHEN 'consistent_evidence' THEN 'shown'
    WHEN 'no_evidence'         THEN 'not_yet_shown'
    ELSE 'follow_up'
  END;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — The contract read model
-- ═══════════════════════════════════════════════════════════════════════════
--
-- has_safety_flag is a claim about the person's evidence, so it has to mean "a
-- reviewer found something", not "one of the items was in the safety-critical
-- category". Contract v1 keeps the same field name, type and position; only the
-- predicate behind it becomes the truthful one.

CREATE OR REPLACE VIEW public.scp_rm_competency_profile
WITH (security_invoker = true) AS
SELECT
  e.subject_id,
  m.competency_version_id,
  cv.competency_id,
  cv.name_sv,
  cv.name_en,
  public.scp_compute_maturity(e.subject_id, m.competency_version_id) AS maturity_level,
  count(*) FILTER (WHERE e.superseded_by IS NULL)                      AS live_evidence_count,
  count(DISTINCT e.source_type) FILTER (WHERE e.superseded_by IS NULL) AS source_type_count,
  bool_or(e.safety_finding IN ('low','medium','high','critical'))
    FILTER (WHERE e.superseded_by IS NULL)                             AS has_safety_flag,
  bool_or(e.requires_human_review AND e.review_status IN ('pending','in_review'))
    FILTER (WHERE e.superseded_by IS NULL)                             AS has_open_review,
  max(e.observed_at)                                                   AS last_observed_at
FROM public.scp_competency_evidence e
JOIN public.scp_behaviour_competency_map m
  ON m.behaviour_version_id = e.behaviour_version_id
JOIN public.scp_competency_versions cv
  ON cv.id = m.competency_version_id
GROUP BY e.subject_id, m.competency_version_id, cv.competency_id, cv.name_sv, cv.name_en;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — The reviewer queue carries the rubric it asks to be applied
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Return type changes, so this is a drop and recreate rather than a replace,
-- and the ACL has to be restated afterwards.
--
-- `finding_required` replaces `severity_required` as the name the new build
-- reads: the reviewer is asked what they FOUND, and 'no concern' is one of the
-- answers. Keeping only the old name would leave the control and the function
-- disagreeing about what is being collected, which is how the original defect
-- read to everyone who saw it. `severity_required` is retained beside it as a
-- deprecated alias so the currently deployed build keeps working across the
-- deploy window — see the column comment below.
--
-- `rubric` is NULL for every format except constructed_response. It carries the
-- dimension, its criterion, its five level descriptors and whether it is
-- style-only -- and no score_value, no key, no rationale. The trust boundary is
-- unchanged: a reviewer still cannot see which option was preferred.

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
  -- DEPRECATED — TRANSITION COMPATIBILITY ONLY. Same value as finding_required.
  -- The previously deployed reviewer workspace reads `severity_required`, and
  -- a rename alone would have made it render no safety control at all, submit a
  -- NULL finding, and be refused on 12 of the 13 reviews in a Security Guard
  -- run. Additive, so both builds work; removed with the deprecated RPC
  -- overload in the same maintenance migration.
  severity_required boolean,
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
    iv.is_safety_critical,   -- severity_required (deprecated alias)
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
-- SECTION 7 — The report stops alerting on a category
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two changes to the release function, both narrow.
--
-- 1. safety_flags is built from real findings, so an employer no longer sees a
--    safety section populated for every participant who ever sat the form.
-- 2. The competency spine is seeded from evidence UNION the competencies a
--    disputed review reached, so a competency whose only review was overturned
--    still appears -- as follow_up, with zero observations -- instead of
--    silently vanishing from the report.
--
-- Everything else is untouched: allowlists, context freezing, snapshot
-- immutability, template selection, the participant/employer split.

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
RETURNS TABLE(participant_snapshot uuid, employer_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _flags jsonb; _emp_payload jsonb; _par_payload jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid; _derivation jsonb;
  _emp_ctx jsonb; _par_ctx jsonb;
  _org text; _purpose text; _slug text; _name_sv text; _name_en text;
  _version int; _lang text; _person text; _ref text;
  _rev_total int; _rev_done int; _obs int; _ctx int; _concerns int;
  _pv_key text; _ev_key text; _pv_num int; _ev_num int;
  _state_version constant text := 'des-v2';
  _scope_version constant text := 'attempt-v1';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  CREATE TEMP TABLE _scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
   WHERE e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  SELECT e.name INTO _org FROM public.employers e WHERE e.id = _a.issuer_organization_id;
  SELECT pv2.purpose_code INTO _purpose
    FROM public.scp_purpose_versions pv2 WHERE pv2.id = _a.purpose_version_id;
  SELECT d.slug, d.name_sv, d.name_en, av.version_number
    INTO _slug, _name_sv, _name_en, _version
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _a.assessment_version_id;
  SELECT aa.language,
         CASE WHEN aa.employee_id IS NOT NULL OR aa.use_case = 'workforce'
              THEN 'employee' ELSE 'candidate' END
    INTO _lang, _person
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  _ref := upper(substr(replace(_a.subject_id::text, '-', ''), 1, 6));

  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope);

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  -- How many reviewers actually found something. Drives the participant-facing
  -- statement, which must not tell somebody they raised a safety concern when
  -- every reviewer concluded no_concern.
  SELECT count(*) INTO _concerns
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  WITH scope_comp AS (
    -- Competencies this attempt produced evidence for ...
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = e.behaviour_version_id
     WHERE e.id IN (SELECT id FROM _scope)
    UNION
    -- ... plus the ones a disputed review reached but deliberately left no
    -- evidence for. Without this the line disappears rather than reading
    -- "needs a follow-up", which is the opposite of what a disputed reading
    -- should communicate.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = iv.primary_behaviour_id
     WHERE r.attempt_id = _attempt_id
       AND hr.review_status = 'completed'
       AND hr.outcome IN ('adjusted','overturned')
  ), lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now()) AS maturity,
           count(e.id) AS observations,
           coalesce(array_agg(DISTINCT e.source_type)
                      FILTER (WHERE e.source_type IS NOT NULL), ARRAY[]::text[]) AS source_types,
           string_agg(DISTINCT bv.statement_sv, ' ') AS behaviour_sv,
           string_agg(DISTINCT bv.statement_en, ' ') AS behaviour_en,
           coalesce(bool_or(e.provenance_type = 'human_review'), false) AS human_reviewed
      FROM scope_comp sc
      JOIN public.scp_competency_versions cv ON cv.id = sc.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
      LEFT JOIN public.scp_behaviour_competency_map bcm
             ON bcm.competency_version_id = cv.id
      LEFT JOIN public.scp_competency_evidence e
             ON e.behaviour_version_id = bcm.behaviour_version_id
            AND e.id IN (SELECT id FROM _scope)
      LEFT JOIN public.scp_behaviour_versions bv ON bv.id = bcm.behaviour_version_id
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_attempt_evidence_state(_attempt_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'followup_sv',        fpe.prompt_sv,
      'followup_en',        fpe.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'human_reviewed',     s.human_reviewed,
      'reflection_sv',      fpp.prompt_sv,
      'reflection_en',      fpp.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code', s.competency_code,
      'maturity_level',  s.maturity,
      'threshold_version', 'v1'
    ) ORDER BY s.competency_code)
    INTO _emp_payload, _par_payload, _derivation
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fpe
           ON fpe.competency_id = cv2.competency_id AND fpe.audience = 'employer'
          AND fpe.content_status = 'published'
    LEFT JOIN public.scp_followup_prompts fpp
           ON fpp.competency_id = cv2.competency_id AND fpp.audience = 'participant'
          AND fpp.content_status = 'published';

  -- Real findings only. A safety-critical item that a reviewer cleared is not a
  -- flag, and an alert that fires for everybody is not an alert.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'finding', e.safety_finding,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  SELECT id, report_key, version_number INTO _pv, _pv_key, _pv_num
    FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id, report_key, version_number INTO _ev, _ev_key, _ev_num
    FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  _emp_ctx := jsonb_build_object(
    'participant_ref', _ref, 'person_context', _person,
    'organisation_name', _org, 'purpose_code', _purpose,
    'assessment_slug', _slug, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'started_at', _a.started_at,
    'submitted_at', _a.submitted_at, 'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total, 'reviews_completed', _rev_done,
    'safety_concerns', _concerns,
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'report_key', _ev_key, 'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'evidence_scope_version', _scope_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  _par_ctx := jsonb_build_object(
    'person_context', _person, 'organisation_name', _org,
    'purpose_code', _purpose, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'safety_concern_present', (_concerns > 0),
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'report_key', _pv_key, 'report_version', _pv_num,
    'evidence_scope_version', _scope_version);

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context, evidence_scope_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
          'participant', COALESCE(_par_payload,'[]'::jsonb),
          '[]'::jsonb, _a.scoring_model_version, _state_version,
          _derivation, _par_ctx, _scope_version)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input, context, evidence_scope_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
          'employer', COALESCE(_emp_payload,'[]'::jsonb), _flags,
          _a.scoring_model_version, _state_version,
          _derivation, _emp_ctx, _scope_version)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  DROP TABLE IF EXISTS _scope;
  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text; _n int;
BEGIN
  -- The governed overload accepts no contribution at all.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'scp_complete_human_review'
       AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text, jsonb'
       AND pg_get_functiondef(p.oid) LIKE '%_contribution%')
  THEN
    RAISE EXCEPTION 'SCP_GEM_CONTRIBUTION_STILL_ACCEPTED: the governed overload '
      'still mentions a contribution parameter';
  END IF;

  -- The deprecated overload exists for transport compatibility and MUST ignore
  -- the value. Asserted as a property of the body, not of the signature: the
  -- forbidden thing is a client controlling the number, not the existence of a
  -- parameter the function throws away.
  _def := pg_get_functiondef(
    'public.scp_complete_human_review(uuid,text,text,numeric,text)'::regprocedure);
  IF _def NOT LIKE '%DEPRECATED%'
     OR coalesce(obj_description(
          'public.scp_complete_human_review(uuid,text,text,numeric,text)'::regprocedure,
          'pg_proc'), '') NOT LIKE '%DEPRECATED%' THEN
    RAISE EXCEPTION 'SCP_GEM_COMPAT_UNMARKED: the compatibility overload is not '
      'marked deprecated in its body and its COMMENT';
  END IF;
  -- Outside comments, `_contribution` may appear on exactly one line: the
  -- parameter declaration. A second executable mention is the value being read,
  -- which is the whole thing this overload must not do.
  SELECT count(*) INTO _n FROM (
    SELECT l FROM regexp_split_to_table(_def, E'\n') AS l
     WHERE l LIKE '%_contribution%' AND btrim(l) NOT LIKE '--%') x;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_GEM_COMPAT_USES_CONTRIBUTION: the deprecated overload '
      'references _contribution on % executable line(s); it must accept the '
      'argument and never read it', _n;
  END IF;
  IF _def NOT LIKE '%SCP_LEGACY_CLIENT_CANNOT_SCORE_RUBRIC%' THEN
    RAISE EXCEPTION 'SCP_GEM_COMPAT_FABRICATES_CR: the deprecated overload does '
      'not refuse constructed responses';
  END IF;

  _def := pg_get_functiondef('public.scp_complete_human_review(uuid,text,text,text,jsonb)'::regprocedure);
  IF _def LIKE '%0.5%' THEN
    RAISE EXCEPTION 'SCP_GEM_MAGIC_CONSTANT: the review function still contains 0.5';
  END IF;
  IF _def NOT LIKE '%governed_item_score%'
     OR _def NOT LIKE '%governed_best_worst_keys%'
     OR _def NOT LIKE '%governed_rubric_mean%' THEN
    RAISE EXCEPTION 'SCP_GEM_DERIVATION_MISSING: not all three derivations are present';
  END IF;
  IF _def NOT LIKE '%SCP_SAFETY_FINDING_REQUIRED%' THEN
    RAISE EXCEPTION 'SCP_GEM_FINDING_OPTIONAL: a safety finding is not required';
  END IF;

  -- no_concern must be storable, and severity must not be invented alongside it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'scp_evidence_severity_matches_finding')
  THEN
    RAISE EXCEPTION 'SCP_GEM_SEVERITY_UNPINNED: severity is not pinned to the finding';
  END IF;

  -- The two claims stay separate: the item classification column survives.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'scp_competency_evidence'
       AND column_name = 'is_safety_critical')
  THEN
    RAISE EXCEPTION 'SCP_GEM_CLASSIFICATION_LOST: item classification was collapsed away';
  END IF;

  -- Every safety reader asks about the finding, not the category.
  FOR _def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('scp_compute_maturity','scp_attempt_maturity')
  LOOP
    IF _def LIKE '%bool_or(is_safety_critical)%' THEN
      RAISE EXCEPTION 'SCP_GEM_CAP_ON_CATEGORY: a maturity cap still keys on the '
        'item classification';
    END IF;
  END LOOP;

  -- Phase 8.5A revoked these from `authenticated`; CREATE OR REPLACE preserves
  -- an ACL, but this migration must not have re-granted one by accident.
  IF has_function_privilege('authenticated',
       'public.scp_compute_maturity(uuid, uuid, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.scp_attempt_maturity(uuid, uuid, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.scp_display_evidence_state(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.scp_attempt_evidence_state(uuid, uuid, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'SCP_GEM_REGRANTED: a maturity function became executable again';
  END IF;

  -- The recreated ones must not be anon-callable.
  IF has_function_privilege('anon',
       'public.scp_complete_human_review(uuid, text, text, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.scp_complete_human_review(uuid, text, text, numeric, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_review_queue(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'SCP_GEM_ANON_EXECUTE: a recreated function is anon-callable';
  END IF;

  -- The rubric score store is reviewer-read-only and has no write policy.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'scp_review_rubric_scores';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_GEM_RUBRIC_POLICIES: expected exactly one read policy, found %', _n;
  END IF;
  IF has_table_privilege('authenticated', 'public.scp_review_rubric_scores', 'INSERT')
     OR has_table_privilege('anon', 'public.scp_review_rubric_scores', 'SELECT')
  THEN
    RAISE EXCEPTION 'SCP_GEM_RUBRIC_WRITABLE: the rubric score store is directly writable';
  END IF;

  -- Nothing here published content, granted a pilot or enabled a provider.
  IF EXISTS (SELECT 1 FROM public.scp_assessment_versions av
               JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
              WHERE av.content_status = 'published' AND NOT d.is_test_fixture)
     OR EXISTS (SELECT 1 FROM public.scp_test_grants
                 WHERE purpose = 'closed_test' AND revoked_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers
                 WHERE is_enabled AND code <> 'null_provider')
  THEN
    RAISE EXCEPTION 'SCP_GEM_BOUNDARY_BREACHED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-governed-evidence-model', 'updated',
  'The governed evidence model. The client can no longer submit a competency contribution: the parameter is gone from scp_complete_human_review, and the number is derived server-side from the item''s governed scoring, or for a constructed response from rubric levels the reviewer selected per dimension and which are persisted append-only. Review outcome and contribution stay separate concepts: only an upheld reading writes evidence, and a disputed one leaves the review, its rationale and the response without inventing a number, remaining a follow-up case. Safety-critical ITEM classification and safety concern IN THIS RESPONSE are now two columns that are never collapsed: a reviewer may conclude no_concern, and every downstream reader -- maturity caps, display state, the contract read model and the report''s safety section -- asks about the finding rather than the category.',
  jsonb_build_object(
    'migration', '20260823090000_scp_governed_evidence_model',
    'client_supplied_contribution', false,
    'safety_finding_vocabulary', jsonb_build_array('no_concern','low','medium','high','critical'),
    'evidence_state_version', 'des-v2',
    'content_published', false,
    'closed_test_granted', false));
