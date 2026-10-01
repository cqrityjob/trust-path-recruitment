-- Roll back 20261229090000_scp_delivery_answer_key_leak.
--
-- Restores scp_get_attempt_items() byte-for-byte as 20260905053344 defined it
-- (hosted md5(prosrc) 013f3860c373ea13c50288b3935ca310) and drops the
-- owner-only seeding helper. This REINSTATES THE LEAK: every served option
-- again carries its option_key, and the preferred option is keyed 'a'. It says
-- so because that is what a rollback is. Seeds the migration gave to
-- unanswered seedless attempts are NOT removed: a seed cannot be un-shown to a
-- candidate, and the shuffled order is the safer of the two either way.

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

DROP FUNCTION IF EXISTS public.scp_seed_unanswered_legacy_attempts();

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_get_attempt_items(uuid,text)'::regprocedure))
       <> '013f3860c373ea13c50288b3935ca310' THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_ROLLBACK failed: restored body differs from 20260905053344';
  END IF;
  RAISE NOTICE 'SCP_DELIVERY_KEY_ROLLBACK ok: scp_get_attempt_items restored to 20260905053344 (option_key is served again -- the leak is back)';
END $$;
