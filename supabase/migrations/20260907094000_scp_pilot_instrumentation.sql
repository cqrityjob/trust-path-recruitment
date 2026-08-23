-- Minimum pilot instrumentation.
--
-- ── WHAT THE MODEL ALREADY SUPPORTS ─────────────────────────────────────────
--
-- Most of what a pilot needs is already recorded and needs no new column:
--
--   option distribution per item   scp_candidate_responses.selected_option_id
--   total completion time          scp_attempts.started_at -> submitted_at
--   completion / drop-off by block scp_candidate_responses joined to
--                                  scp_form_items.block_key
--   item difficulty                mean scp_item_options.score_value of the
--                                  chosen option, per item
--   item discrimination            that same per-item score against the
--                                  attempt total -- an item-total correlation,
--                                  computable whenever the sample supports it
--   reviewer agreement             scp_human_reviews and
--                                  scp_review_rubric_scores per response
--   response-pattern flags         straight-lining and completion speed, from
--                                  the response timestamps below
--
-- ── THE TWO THINGS THAT WERE MISSING ────────────────────────────────────────
--
-- 1. WHERE THE CHOSEN OPTION APPEARED.
--
--    scp_candidate_responses.display_order has existed since Phase 1b and has
--    never been written by anything -- it is NULL on every row. Before
--    20260907090000 that hardly mattered, because the order was the authored
--    order for everyone. Now that each attempt gets its own permutation, the
--    displayed position is the single measurement that shows whether the
--    randomisation actually removed the position bias, or whether candidates
--    still favour whatever sits first on the screen.
--
--    It is computed here from the attempt's own seed, not accepted from the
--    client, so it cannot be misreported by the caller.
--
-- 2. WHEN THE ANSWER WAS FIRST GIVEN.
--
--    responded_at is overwritten on every re-save, so it records the last
--    edit. Time-per-item needs the first. One column, set on insert and never
--    updated, gives both: first_responded_at for timing, responded_at for
--    revision behaviour, and the difference between them for how much a
--    candidate reconsidered.
--
-- ── WHAT THIS DELIBERATELY IS NOT ───────────────────────────────────────────
--
-- No dashboard, no analytics tables, no aggregation jobs, no psychometric
-- service. Two columns and a read view. Building the analysis product before
-- there is a single pilot response would be building against a guess.
--
-- Reversible: drop the view, the two columns, and restore scp_save_response
-- from 20260810090000.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The two data points
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_candidate_responses
  ADD COLUMN IF NOT EXISTS first_responded_at timestamptz;

COMMENT ON COLUMN public.scp_candidate_responses.first_responded_at IS
  'When this item was first answered. Set once, never updated -- responded_at '
  'records the most recent edit, and the pair is what time-per-item and '
  'revision-rate analysis need.';

COMMENT ON COLUMN public.scp_candidate_responses.display_order IS
  'The 1-based position the chosen option occupied on screen for THIS attempt, '
  'under the attempt''s own option permutation. Computed server-side from the '
  'attempt seed, never supplied by the caller. NULL for constructed responses '
  'and for attempts created before 20260907090000.';

-- Backfill: the column has never been written, so every existing row is NULL
-- and there is nothing to preserve. Existing rows stay NULL rather than being
-- given a fabricated position -- a made-up measurement is worse than a missing
-- one, and the pilot analysis has to be able to tell them apart.
UPDATE public.scp_candidate_responses
   SET first_responded_at = responded_at
 WHERE first_responded_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Saving records both
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_save_response(
  _attempt_id         uuid,
  _item_version_id    uuid,
  _selected_option_id uuid DEFAULT NULL,
  _best_option_id     uuid DEFAULT NULL,
  _worst_option_id    uuid DEFAULT NULL,
  _response_text      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _status text; _form_id uuid; _id uuid; _seed integer;
  _scored uuid; _pos integer; _randomised boolean; _format text;
BEGIN
  SELECT a.status, a.form_id, a.option_order_seed
    INTO _status, _form_id, _seed
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid();

  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'SCP_ATTEMPT_NOT_YOURS: no attempt of yours with that id.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Answers are accepted while a run is open, and never afterwards. Submission
  -- is the boundary between "the participant is answering" and "this is
  -- evidence", and it has to be one-way for the evidence to mean anything.
  IF _status <> 'in_progress' THEN
    RAISE EXCEPTION
      'SCP_ATTEMPT_NOT_OPEN: this attempt is "%" -- answers can only be saved '
      'while it is in_progress.', _status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The item must actually be on this attempt's form. Otherwise a participant
  -- could answer items from a form they were never served.
  SELECT fi.randomise_options, iv.item_format INTO _randomised, _format
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form_id AND fi.item_version_id = _item_version_id;
  IF _format IS NULL THEN
    RAISE EXCEPTION 'SCP_ITEM_NOT_ON_FORM: that item is not part of this attempt.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Where the chosen option actually appeared, under this attempt's own order.
  -- Recomputed rather than trusted, and using exactly the expression
  -- scp_get_attempt_items ordered by, so the two can never disagree.
  _scored := COALESCE(_selected_option_id, _best_option_id);
  IF _scored IS NOT NULL THEN
    SELECT rn INTO _pos FROM (
      SELECT o.id,
             row_number() OVER (
               ORDER BY
                 CASE WHEN _randomised
                       AND _seed IS NOT NULL
                       AND NOT public.scp_item_order_is_meaningful(_format)
                      THEN public.scp_option_order_key(_seed, _item_version_id, o.id)
                 END NULLS FIRST,
                 o.display_order)::int AS rn
        FROM public.scp_item_options o
       WHERE o.item_version_id = _item_version_id) s
     WHERE s.id = _scored;
  END IF;

  INSERT INTO public.scp_candidate_responses
    (attempt_id, item_version_id, selected_option_id, best_option_id,
     worst_option_id, response_text, display_order, first_responded_at)
  VALUES
    (_attempt_id, _item_version_id, _selected_option_id, _best_option_id,
     _worst_option_id, nullif(btrim(coalesce(_response_text,'')), ''), _pos, now())
  ON CONFLICT (attempt_id, item_version_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        best_option_id     = EXCLUDED.best_option_id,
        worst_option_id    = EXCLUDED.worst_option_id,
        response_text      = EXCLUDED.response_text,
        display_order      = EXCLUDED.display_order,
        -- Never moved: this is the first answer, not the latest one.
        first_responded_at = public.scp_candidate_responses.first_responded_at,
        responded_at       = now()
  RETURNING id INTO _id;

  RETURN _id;
END $$;

COMMENT ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) IS
  'Saves one answer on the caller''s own open attempt, and records where the '
  'chosen option appeared on screen and when the item was first answered.';

REVOKE ALL     ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. One read model, for authors only
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Per item: how the options were chosen, where they sat when chosen, and how
-- long the item took. Authors only -- this is content quality data, and it
-- must never be reachable from an employer or candidate surface.

CREATE OR REPLACE VIEW public.scp_item_pilot_stats
WITH (security_invoker = true) AS
SELECT
  i.slug                                    AS item_slug,
  iv.id                                     AS item_version_id,
  f.slug                                    AS form_slug,
  o.option_key,
  o.score_value,
  o.is_preferred,
  count(r.id)                               AS times_chosen,
  -- Where it sat when it was chosen. On a randomised item this should be
  -- roughly flat; a spike is the position bias the shuffle was meant to remove.
  avg(r.display_order)                      AS mean_display_position,
  avg(EXTRACT(epoch FROM (r.responded_at - r.first_responded_at)))
                                            AS mean_seconds_to_last_edit
  FROM public.scp_form_items fi
  JOIN public.scp_forms f            ON f.id = fi.form_id
  JOIN public.scp_item_versions iv   ON iv.id = fi.item_version_id
  JOIN public.scp_items i            ON i.id = iv.item_id
  JOIN public.scp_item_options o     ON o.item_version_id = iv.id
  LEFT JOIN public.scp_candidate_responses r
    ON r.item_version_id = iv.id
   AND r.selected_option_id = o.id
 GROUP BY i.slug, iv.id, f.slug, o.option_key, o.score_value, o.is_preferred,
          o.display_order
 ORDER BY f.slug, i.slug, o.display_order;

COMMENT ON VIEW public.scp_item_pilot_stats IS
  'Per-option pilot statistics: how often each option was chosen, the mean '
  'screen position it occupied when chosen, and how long the item took. '
  'security_invoker, so the caller''s own RLS on scp_candidate_responses '
  'applies -- in practice authors and nobody else.';

REVOKE ALL    ON public.scp_item_pilot_stats FROM PUBLIC, anon;
GRANT  SELECT ON public.scp_item_pilot_stats TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_candidate_responses'
     AND column_name IN ('display_order', 'first_responded_at');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_INSTRUMENTATION_COLUMNS: expected both timing columns, found %', _n;
  END IF;

  -- Saving must record the position, or the randomisation cannot be audited.
  IF pg_get_functiondef('public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure)
       NOT LIKE '%scp_option_order_key%' THEN
    RAISE EXCEPTION 'SCP_INSTRUMENTATION_POSITION_NOT_RECORDED: scp_save_response '
      'does not compute the displayed position of the chosen option.';
  END IF;

  -- ...and it must compute it, not accept it. The function takes six
  -- arguments, none of them a position.
  SELECT pronargs INTO _n FROM pg_proc
   WHERE oid = 'public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure;
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_INSTRUMENTATION_POSITION_FROM_CLIENT: scp_save_response '
      'takes % arguments; the displayed position must not be one of them.', _n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_views
                  WHERE schemaname = 'public' AND viewname = 'scp_item_pilot_stats') THEN
    RAISE EXCEPTION 'SCP_INSTRUMENTATION_VIEW_MISSING';
  END IF;

  -- The view must not be reachable anonymously.
  IF has_table_privilege('anon', 'public.scp_item_pilot_stats', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_INSTRUMENTATION_VIEW_PUBLIC: pilot statistics are readable by anon.';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-pilot-instrumentation', 'created',
  'Two data points added: the screen position the chosen option occupied under '
  'the attempt''s own permutation, and when an item was first answered. '
  'Everything else a pilot needs was already recorded and is documented in the '
  'migration header. No dashboards, no analytics tables.',
  jsonb_build_object(
    'migration', '20260907094000_scp_pilot_instrumentation',
    'added', jsonb_build_array('scp_candidate_responses.first_responded_at',
                               'scp_candidate_responses.display_order (now written)'),
    'read_model', 'scp_item_pilot_stats')
);
