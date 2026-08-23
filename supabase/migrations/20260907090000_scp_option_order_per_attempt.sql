-- Make option randomisation real.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- scp_form_items.randomise_options has existed since 20260727120000 and is
-- authored as `true` on every scenario item in the recruitment flagship. It
-- has never been honoured by anything. The single delivery path,
-- scp_get_attempt_items, orders options by o.display_order and nothing else,
-- so every candidate has always seen every item in the order it was written.
--
-- Combined with the answer mechanics the Assessment Foundation audit found --
-- the preferred option first in 102 of 102 authored keyed items -- that made
-- "pick the first option" a winning strategy on the whole bank. The content
-- side of that is repaired in 20260907093000. This migration repairs the
-- mechanism, so a future item bank cannot reintroduce the same defect merely
-- by being authored in a predictable order.
--
-- ── THE ORDER ───────────────────────────────────────────────────────────────
--
-- One integer on the attempt, exactly like cd_sessions.option_order_seed
-- (20260730090000) which solved the same problem for Career Discovery v3.1.
-- The seed is assigned once at attempt creation and is immutable afterwards.
-- The displayed permutation is then a pure function of
--
--     (seed, item_version_id, option_id)
--
-- so it is stable for the life of the attempt without storing a row per
-- option: a refresh, a resumed session after logout, and a re-read by the
-- reviewer all recompute the same order. Two different attempts carry
-- different seeds and therefore generally see different orders.
--
-- Nothing about scoring changes, and nothing needed to: scp_submit_attempt
-- has always read scp_candidate_responses.selected_option_id, which is the
-- option's own identity, never its position on screen.
--
-- ── WHAT IS NEVER SHUFFLED ──────────────────────────────────────────────────
--
-- A frequency scale runs from one end to the other and shuffling it makes it
-- unreadable. Those items are already authored with randomise_options = false,
-- but relying on an author to remember that is the same class of mistake this
-- migration exists to remove, so the ordered formats are refused structurally:
-- biq_frequency and sjt_rate_effectiveness keep their authored order whatever
-- the flag says. sjt_best_worst IS shuffled -- the candidate names two options
-- by identity and neither answer depends on where they appeared.
--
-- Reversible: drop the column, its trigger and its two functions, and restore
-- scp_get_attempt_items from 20260830091000.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The seed
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_attempts
  ADD COLUMN IF NOT EXISTS option_order_seed integer;

COMMENT ON COLUMN public.scp_attempts.option_order_seed IS
  'Per-attempt seed for randomised option order. Assigned at attempt creation, '
  'immutable thereafter, so the same attempt always renders the same order. '
  'NULL only on attempts created before 20260907090000, which fall back to the '
  'authored order.';

-- Assigned by the database, not by a caller: every path that creates an
-- attempt (scp_employer_assign, scp_start_learning_attempt, scp_start_training_module,
-- and the fixtures) gets a seed without being changed, and no caller can
-- choose one that suits them.
CREATE OR REPLACE FUNCTION public.scp_assign_option_order_seed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.option_order_seed IS NULL THEN
    -- 1..2147483646. Positive, so the value reads as an opaque identifier
    -- rather than something with a sign that might mean anything.
    NEW.option_order_seed := 1 + floor(random() * 2147483646)::integer;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.scp_assign_option_order_seed() IS
  'Assigns scp_attempts.option_order_seed at INSERT when the caller left it null.';

REVOKE ALL ON FUNCTION public.scp_assign_option_order_seed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_attempts_assign_option_seed ON public.scp_attempts;
CREATE TRIGGER scp_attempts_assign_option_seed
  BEFORE INSERT ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_assign_option_order_seed();

-- Immutable once set. A seed that could change mid-attempt would silently
-- reorder options under a candidate who refreshed the page, and would make a
-- completed attempt unreproducible for the reviewer who reads it later.
CREATE OR REPLACE FUNCTION public.scp_guard_option_order_seed_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.option_order_seed IS NOT NULL
     AND NEW.option_order_seed IS DISTINCT FROM OLD.option_order_seed THEN
    RAISE EXCEPTION 'SCP_OPTION_SEED_IMMUTABLE: option_order_seed is fixed at '
      'attempt start so a run stays reproducible.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.scp_guard_option_order_seed_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_attempts_option_seed_immutable ON public.scp_attempts;
CREATE TRIGGER scp_attempts_option_seed_immutable
  BEFORE UPDATE ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_option_order_seed_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The permutation
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A sort key, not a shuffle. hashtextextended is deterministic for a given
-- input within a major version and is not affected by collation, locale or
-- planner choices, which a random()-based ordering would be. Ordering by it
-- is a permutation of the options; the authored display_order breaks any tie,
-- so the result is a total order even in the impossible case of a collision.

CREATE OR REPLACE FUNCTION public.scp_option_order_key(
  _seed            integer,
  _item_version_id uuid,
  _option_id       uuid
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT hashtextextended(
           coalesce(_seed, 0)::text || ':' ||
           _item_version_id::text   || ':' ||
           _option_id::text, 0);
$$;

COMMENT ON FUNCTION public.scp_option_order_key(integer, uuid, uuid) IS
  'Deterministic sort key for one option within one attempt. Pure function of '
  'the attempt seed and the two identities, so the displayed order is stable '
  'across refresh and resume without persisting a row per option.';

REVOKE ALL     ON FUNCTION public.scp_option_order_key(integer, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_option_order_key(integer, uuid, uuid) TO authenticated;

-- Whether an item's options may be shuffled at all. Kept as its own function
-- so the delivery path and the test suite ask the same question.
CREATE OR REPLACE FUNCTION public.scp_item_order_is_meaningful(_item_format text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- A frequency scale and an effectiveness rating are ordered scales. Their
  -- sequence carries meaning, so it survives regardless of randomise_options.
  SELECT _item_format IN ('biq_frequency', 'sjt_rate_effectiveness');
$$;

COMMENT ON FUNCTION public.scp_item_order_is_meaningful(text) IS
  'True for item formats whose authored option order is part of the item -- '
  'ordered scales, which are never shuffled even if randomise_options is set.';

REVOKE ALL     ON FUNCTION public.scp_item_order_is_meaningful(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_item_order_is_meaningful(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Delivery honours it
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The return type is unchanged, deliberately: 20260808090000 asserts on this
-- function's own result signature that delivery exposes no key, score,
-- rationale or feedback column, and that assertion is re-run at the end of
-- this file.

DROP FUNCTION IF EXISTS public.scp_get_attempt_items(uuid, text);

CREATE OR REPLACE FUNCTION public.scp_get_attempt_items(
  _attempt_id uuid,
  _language   text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  item_version_id    uuid,
  display_order      integer,
  block_key          text,
  item_format        text,
  scenario           text,
  prompt             text,
  is_safety_critical boolean,
  options            jsonb,
  saved_option_id    uuid,
  saved_best_id      uuid,
  saved_worst_id     uuid,
  saved_text         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _form_id uuid; _seed integer;
BEGIN
  -- The attempt must belong to the caller. Not "an" attempt -- THIS caller's.
  SELECT a.form_id, a.option_order_seed INTO _form_id, _seed
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id
     AND si.user_id = auth.uid();
  IF _form_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    iv.id,
    fi.display_order,
    fi.block_key,
    iv.item_format,
    it.scenario,
    it.prompt,
    iv.is_safety_critical,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'option_id', o.id,
                'option_key', o.option_key,
                'label', ot.label)
              ORDER BY
                -- Shuffled only when the form asks for it, the attempt carries
                -- a seed, and the format has no meaningful order of its own.
                CASE WHEN fi.randomise_options
                      AND _seed IS NOT NULL
                      AND NOT public.scp_item_order_is_meaningful(iv.item_format)
                     THEN public.scp_option_order_key(_seed, iv.id, o.id)
                END NULLS FIRST,
                o.display_order)
         FROM public.scp_item_options o
         JOIN public.scp_item_option_texts ot
           ON ot.item_option_id = o.id AND ot.language = _language
        WHERE o.item_version_id = iv.id),
      '[]'::jsonb),
    r.selected_option_id,
    r.best_option_id,
    r.worst_option_id,
    r.response_text
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_item_texts it
    ON it.item_version_id = iv.id AND it.language = _language
  LEFT JOIN public.scp_candidate_responses r
    ON r.attempt_id = _attempt_id AND r.item_version_id = iv.id
  WHERE fi.form_id = _form_id
  ORDER BY fi.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_get_attempt_items(uuid, text) IS
  'One participant''s own attempt, as they see it: scenario, prompt and option '
  'labels, plus whatever they have already answered. Returns no key, no score '
  'and no rationale. Option order is the attempt''s own stable permutation '
  'when the form asks for randomisation; authored order otherwise.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _a uuid; _b uuid; _iv uuid; _o uuid;
BEGIN
  -- The delivery projection still exposes no answer key. Same predicate as
  -- 20260830091000, which is the one that accounts for block_key: that column
  -- names a section of the form, not an answer, and matching a bare "key"
  -- would flag it. option_key and answer_key are named explicitly instead.
  SELECT count(*) INTO _n
    FROM unnest(string_to_array(
           pg_get_function_result('public.scp_get_attempt_items(uuid, text)'::regprocedure),
           ',')) AS c(col)
   WHERE col ILIKE '%score%' OR col ILIKE '%is_preferred%' OR col ILIKE '%rationale%'
      OR col ILIKE '%is_best_key%' OR col ILIKE '%is_worst_key%'
      OR col ILIKE '%option_key%'  OR col ILIKE '%answer_key%'
      OR col ILIKE '%learning_feedback%' OR col ILIKE '%distractor%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_DELIVERY_LEAKS: the delivery projection exposes % scoring column(s)', _n;
  END IF;

  -- ...and the section key survived the rewrite (20260830091000).
  IF pg_get_function_result('public.scp_get_attempt_items(uuid, text)'::regprocedure)
       NOT ILIKE '%block_key%' THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_LOST_BLOCK: block_key did not survive the rewrite.';
  END IF;

  -- The order key is a pure function: the same inputs give the same answer.
  _iv := '11111111-1111-1111-1111-111111111111';
  _o  := '22222222-2222-2222-2222-222222222222';
  IF public.scp_option_order_key(42, _iv, _o) IS DISTINCT FROM
     public.scp_option_order_key(42, _iv, _o) THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_NOT_STABLE: the order key is not deterministic';
  END IF;

  -- ...and a different seed generally moves it.
  IF public.scp_option_order_key(42, _iv, _o) =
     public.scp_option_order_key(43, _iv, _o) THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_SEED_IGNORED: the seed does not affect the order key';
  END IF;

  -- Ordered scales are excluded structurally, not by authoring convention.
  IF NOT public.scp_item_order_is_meaningful('biq_frequency')
     OR NOT public.scp_item_order_is_meaningful('sjt_rate_effectiveness')
     OR public.scp_item_order_is_meaningful('sjt_best_response')
     OR public.scp_item_order_is_meaningful('sjt_best_worst') THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_FORMAT_RULE: the ordered-format exclusion is wrong';
  END IF;

  -- The seed trigger is installed on the only table that creates attempts.
  SELECT count(*) INTO _n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'scp_attempts_assign_option_seed';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_OPTION_SEED_TRIGGER_MISSING';
  END IF;
  SELECT count(*) INTO _n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'scp_attempts_option_seed_immutable';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_OPTION_SEED_IMMUTABILITY_TRIGGER_MISSING';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-option-order-per-attempt', 'created',
  'randomise_options is now honoured by the delivery path. Per-attempt seed, '
  'deterministic permutation, stable across refresh and resume, ordered scales '
  'excluded structurally. Scoring was already position-independent.',
  jsonb_build_object(
    'migration', '20260907090000_scp_option_order_per_attempt',
    'seed_column', 'scp_attempts.option_order_seed',
    'never_shuffled', jsonb_build_array('biq_frequency', 'sjt_rate_effectiveness'))
);
