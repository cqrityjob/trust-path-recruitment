-- Väktare option-order integrity: randomise_options is honoured per attempt.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- scp_form_items.randomise_options has existed since 20260727120000 and the
-- Väktare recruitment flagship (20260830094000) authors it as `true` on every
-- one of its 22 scenario items. Nothing has ever honoured it. The single
-- delivery path, scp_get_attempt_items, orders options by o.display_order and
-- nothing else, so every candidate has always seen every item in the order it
-- was written -- and in that bank the preferred option is authored first on
-- all 22 scenario items. "Always pick the first option" was a winning
-- strategy. The Väktare baseline audit of 2026-09-02 named this the first
-- MUST blocker.
--
-- This migration repairs the MECHANISM only. It rewrites no stem, no option
-- label, no score, no preferred-option identity, no competency mapping and no
-- report. The 50-item pack is byte-identical before and after.
--
-- ── THE ORDER ───────────────────────────────────────────────────────────────
--
-- One integer on the attempt, exactly like cd_sessions.option_order_seed
-- (20260730090000), which solved the same problem for Career Discovery. The
-- seed is assigned by the database at attempt creation and is immutable
-- afterwards. The displayed permutation is then a pure function of
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
-- option's own identity, never its position on screen. The option-order
-- integrity suite proves a fixed set of chosen option ids scores identically
-- under two different permutations.
--
-- ── WHAT IS NEVER SHUFFLED ──────────────────────────────────────────────────
--
-- A frequency scale runs from one end to the other and shuffling it makes it
-- unreadable. The 24 self-report items are authored with
-- randomise_options = false already, but relying on an author to remember
-- that is the same class of mistake this migration exists to remove, so the
-- ordered formats are refused STRUCTURALLY: biq_frequency and
-- sjt_rate_effectiveness keep their authored order whatever the flag says.
-- constructed_response has no options. sjt_best_worst IS eligible: the
-- candidate names two options by identity and neither answer depends on
-- where they appeared.
--
-- ── ATTEMPTS THAT ALREADY EXIST (compatibility rule: option A) ──────────────
--
-- An attempt created before this migration has option_order_seed = NULL and
-- keeps the authored order PERMANENTLY. No backfill, and no seeding at first
-- post-migration read. Reasons:
--
--   * a candidate who has started answering must never have the options
--     move underneath them; there is no reliable way to tell "opened but not
--     yet answered" from "answered on paper, about to enter", so no attempt
--     that exists today is reordered at all;
--   * a submitted attempt has to stay reproducible for the reviewer who
--     reads it later, and the order they see must be the order the candidate
--     saw;
--   * the delivery function is STABLE, so it could not write a seed on read
--     even if that were wanted.
--
-- Every attempt created from now on gets a seed from the trigger below,
-- through every existing creation path (scp_employer_assign,
-- scp_start_training_module and the fixtures), none of which is changed.
--
-- Reversible: supabase/rollback/20261021090000_scp_option_order_per_attempt_rollback.sql
-- drops the column, the two triggers and the four functions, and restores
-- scp_get_attempt_items byte-for-byte from 20260830091000.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The seed
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_attempts
  ADD COLUMN IF NOT EXISTS option_order_seed integer;

COMMENT ON COLUMN public.scp_attempts.option_order_seed IS
  'Per-attempt seed for randomised option order. Assigned by trigger at attempt '
  'creation, immutable thereafter, so the same attempt always renders the same '
  'order. NULL only on attempts created before 20261021090000, which keep the '
  'authored order permanently.';

-- Assigned by the database, not by a caller: every path that creates an
-- attempt gets a seed without being changed, and no caller can choose one
-- that suits them. A caller-supplied value is honoured only so that the test
-- suite can pin two attempts to known, different seeds; no product path
-- supplies one, and a candidate has no INSERT policy on this table at all.
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
-- A NULL seed stays NULL for the same reason: an attempt that started in the
-- authored order finishes in it.
CREATE OR REPLACE FUNCTION public.scp_guard_option_order_seed_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.option_order_seed IS DISTINCT FROM OLD.option_order_seed THEN
    RAISE EXCEPTION 'SCP_OPTION_SEED_IMMUTABLE: option_order_seed is fixed at '
      'attempt start so a run stays reproducible.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.scp_guard_option_order_seed_immutable() IS
  'Refuses any change to scp_attempts.option_order_seed after INSERT, including NULL -> value.';

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
-- input and is not affected by collation, locale or planner choices, which a
-- random()-based ordering would be. Ordering by it is a permutation of the
-- options; the authored display_order breaks any tie, so the result is a
-- total order even in the practically impossible case of a collision.
--
-- Neither helper is SECURITY DEFINER and neither is reachable by a client
-- role: the only caller is scp_get_attempt_items, which runs as its owner.

CREATE OR REPLACE FUNCTION public.scp_option_order_key(
  _seed            integer,
  _item_version_id uuid,
  _option_id       uuid
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.scp_option_order_key(integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Whether an item's options may be shuffled at all. Its own function so the
-- delivery path and the test suite ask the same question.
CREATE OR REPLACE FUNCTION public.scp_item_order_is_meaningful(_item_format text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  -- A frequency scale and an effectiveness rating are ordered scales. Their
  -- sequence carries meaning, so it survives regardless of randomise_options.
  SELECT _item_format IN ('biq_frequency', 'sjt_rate_effectiveness');
$$;

COMMENT ON FUNCTION public.scp_item_order_is_meaningful(text) IS
  'True for item formats whose authored option order is part of the item -- '
  'ordered scales, which are never shuffled even if randomise_options is set.';

REVOKE ALL ON FUNCTION public.scp_item_order_is_meaningful(text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Delivery honours it
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Signature and return type are unchanged from 20260830091000, deliberately:
-- 20260808090000 and the Väktare journey suite assert on this function's own
-- result signature that delivery exposes no key, score, rationale or feedback
-- column, and that assertion is re-run at the end of this file. CREATE OR
-- REPLACE, so the existing grants survive and nothing depending on the
-- function is disturbed.

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
                -- Otherwise the key is NULL for every option and the authored
                -- display_order decides alone.
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
  'The ONLY delivery path. Returns item text, section key and option LABELS for '
  'an attempt the caller owns, plus any answers already saved so a run can be '
  'resumed. Structurally incapable of returning a score, key, rationale, '
  'preference flag or learning feedback: those columns are absent from the '
  'return type. Option order is the attempt''s own stable permutation when the '
  'form asks for randomisation and the attempt carries a seed; authored order '
  'otherwise, and always for ordered scales.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it, in the migration itself
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _iv uuid; _o uuid;
BEGIN
  -- The delivery projection still exposes no answer key. Same predicate as
  -- 20260830091000: block_key names a section of the form, not an answer,
  -- so option_key and answer_key are named explicitly instead of bare "key".
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

  -- Both triggers are installed on the only table that creates attempts.
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

  -- No client role can reach the helpers; anon cannot reach delivery.
  IF has_function_privilege('anon', 'public.scp_option_order_key(integer, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_option_order_key(integer, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_item_order_is_meaningful(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_item_order_is_meaningful(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_get_attempt_items(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_OPTION_ORDER_GRANTS: a client role can execute an ordering helper or anon can execute delivery';
  END IF;

  -- Nothing about the content moved: the Väktare form still carries exactly
  -- 50 items and 22 randomisable scenario items. Only asserted when the form
  -- exists (it always does on the canonical path; this keeps the file
  -- replayable on a bare schema).
  IF EXISTS (SELECT 1 FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a') THEN
    SELECT count(*) INTO _n
      FROM public.scp_form_items fi
      JOIN public.scp_forms f ON f.id = fi.form_id
     WHERE f.slug = 'security-officer-recruitment-form-a';
    IF _n <> 50 THEN
      RAISE EXCEPTION 'SCP_OPTION_ORDER_ITEM_COUNT: expected 50 Väktare items, found %', _n;
    END IF;
    SELECT count(*) INTO _n
      FROM public.scp_form_items fi
      JOIN public.scp_forms f ON f.id = fi.form_id
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE f.slug = 'security-officer-recruitment-form-a'
       AND fi.randomise_options
       AND NOT public.scp_item_order_is_meaningful(iv.item_format);
    IF _n <> 22 THEN
      RAISE EXCEPTION 'SCP_OPTION_ORDER_SCENARIO_COUNT: expected 22 randomisable scenario items, found %', _n;
    END IF;
  END IF;
END $$;
