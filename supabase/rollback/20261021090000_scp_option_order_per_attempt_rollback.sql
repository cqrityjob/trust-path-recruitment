-- Rollback for 20261021090000_scp_option_order_per_attempt.sql
--
-- Removes per-attempt option randomisation and restores scp_get_attempt_items
-- byte-for-byte to the definition 20260830091000 gave it (authored
-- display_order only), then drops the two triggers, the four functions and
-- the seed column.
--
-- ── WHAT REVERTING COSTS ───────────────────────────────────────────────
--
--   * Every attempt returns to the authored option order. For the Väktare
--     recruitment flagship that is the order in which the preferred option
--     is authored first on all 22 scenario items, so "always pick the first
--     option" becomes a winning strategy again.
--   * An attempt that is IN PROGRESS at the moment of rollback is reordered
--     underneath the candidate: they started with their attempt's own
--     permutation and finish in the authored order. Their saved answers are
--     untouched -- a response names an option by id, never by position --
--     but the screen changes. This is the one thing the forward migration
--     exists to prevent, which is why the rollback is the last resort.
--   * A submitted attempt can no longer be re-rendered in the order the
--     candidate saw, because the seed that determined it is dropped.
--
-- No response, evidence, review or report row is touched. Scoring never read
-- the seed, so nothing about any recorded result changes.
--
-- Prefer fixing forward.

BEGIN;

DROP TRIGGER IF EXISTS scp_attempts_option_seed_immutable ON public.scp_attempts;
DROP TRIGGER IF EXISTS scp_attempts_assign_option_seed    ON public.scp_attempts;

-- The delivery function exactly as 20260830091000 wrote it.
CREATE OR REPLACE FUNCTION public.scp_get_attempt_items(
  _attempt_id uuid,
  _language   text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  item_version_id uuid,
  display_order   integer,
  block_key       text,
  item_format     text,
  scenario        text,
  prompt          text,
  is_safety_critical boolean,
  options         jsonb,
  saved_option_id uuid,
  saved_best_id   uuid,
  saved_worst_id  uuid,
  saved_text      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _form_id uuid;
BEGIN
  -- The attempt must belong to the caller. Not "an" attempt -- THIS caller's.
  SELECT a.form_id INTO _form_id
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
              ORDER BY o.display_order)
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
  'return type.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.scp_option_order_key(integer, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_item_order_is_meaningful(text);
DROP FUNCTION IF EXISTS public.scp_assign_option_order_seed();
DROP FUNCTION IF EXISTS public.scp_guard_option_order_seed_immutable();

ALTER TABLE public.scp_attempts DROP COLUMN IF EXISTS option_order_seed;

-- Postflight: the delivery path no longer names the seed, and nothing of the
-- forward migration survives.
DO $$
DECLARE _n int;
BEGIN
  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'scp_get_attempt_items')
     ILIKE '%option_order%' THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: scp_get_attempt_items still references option ordering';
  END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('scp_option_order_key','scp_item_order_is_meaningful',
                       'scp_assign_option_order_seed','scp_guard_option_order_seed_immutable');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: % option-order function(s) survive', _n;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'scp_attempts'
                AND column_name = 'option_order_seed') THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: scp_attempts.option_order_seed survives';
  END IF;
END $$;

COMMIT;
