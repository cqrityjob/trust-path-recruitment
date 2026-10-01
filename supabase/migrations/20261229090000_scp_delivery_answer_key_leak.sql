-- =============================================================================
-- Release-blocking: the delivery payload leaked the answer key
-- =============================================================================
--
-- THE DEFECT (2026-10-01 pre-release security audit, verified on hosted
-- production read-only):
--
--   scp_get_attempt_items() -- the only path that serves assessment items to
--   a participant -- returned, inside its `options` jsonb, each option's
--   `option_key` next to its id and label. The authored content keys the
--   preferred option as 'a'/'A': on hosted production that is the top-scoring
--   option on 200 of 200 sjt_best_response items and the best key on 8 of 8
--   sjt_best_worst items. The per-attempt shuffle (20260905053344) moves the
--   option's POSITION, but the key travelled with it, so anyone reading the
--   network response could pick the full-credit answer on every scenario item
--   whatever order the screen showed. No UI reads option_key (the Academy
--   delivery maps it and never renders or uses it).
--
--   20260905053344's own postflight meant to forbid exactly this ("option_key
--   and answer_key are named explicitly"), but it inspected only the column
--   names of the RETURN TABLE; the key sat one level down, inside `options`.
--
--   A second, narrower gap: an attempt created before 20260905053344 has no
--   option_order_seed, and compatibility rule A serves it in the AUTHORED
--   order -- which is key-first. Hosted production has exactly one such
--   attempt still open on a form that asks for randomisation
--   (security-officer-recruitment-form-a, started 2026-08-25), and it has no
--   saved answer yet.
--
-- THE FIX:
--
--   1. The served option is {option_id, label} and nothing else. The function
--      is otherwise byte-for-byte 20260905053344's: same ownership check, same
--      per-attempt permutation, same ordered-scale exemption, same resume
--      columns.
--
--   2. scp_seed_unanswered_legacy_attempts() gives a seed to every attempt
--      that is in_progress, has NO seed, has NO saved response, and whose form
--      asks for randomisation on an item whose format has no meaningful order.
--      Such a candidate has seen at most the authored order and answered
--      nothing, so they are moved onto the shuffled contract before their
--      first answer; nobody is ever reordered mid-attempt (AC14 and rule A for
--      ANSWERED attempts are untouched). It is the only path that may set a
--      seed after INSERT: it suspends the immutability guard for its single
--      UPDATE inside this transaction and re-enables it. It is owner-only and
--      runs once here; on a fresh replay it changes nothing.
--
--   Not changed: scoring, any stored response, any seed already set, any
--   attempt with an answer, randomise_options on any form item (T6.5: the
--   flag is honoured in both directions), ordered scales (T6), learning
--   feedback, grants.
--
-- Rollback: supabase/rollback/20261229090000_scp_delivery_answer_key_leak_rollback.sql
-- Suite:    supabase/tests/scp_delivery_answer_key_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.scp_get_attempt_items(uuid,text)') IS NULL
     OR to_regprocedure('public.scp_option_order_key(integer,uuid,uuid)') IS NULL
     OR to_regprocedure('public.scp_item_order_is_meaningful(text)') IS NULL THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PRECONDITION: 20260905053344 (per-attempt option order) is not applied';
  END IF;
END $$;

-- ── 1. The served option carries its id and its label, nothing else ─────
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
      -- 20261229090000: id and label only. The authored option_key is part of
      -- the answer key (the preferred option is keyed 'a'), so it never
      -- leaves the database.
      (SELECT jsonb_agg(jsonb_build_object(
                'option_id', o.id,
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
  'The ONLY delivery path. Returns item text, section key and, per option, '
  'ONLY its id and label, for an attempt the caller owns, plus any answers '
  'already saved so a run can be resumed. Never returns a score, option key, '
  'answer key, rationale, preference flag or learning feedback -- neither as a '
  'column nor inside the options payload (20261229090000). Option order is the '
  'attempt''s own stable permutation when the form asks for randomisation and '
  'the attempt carries a seed; authored order otherwise, and always for ordered scales.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

-- ── 2. Unanswered seedless attempts move onto the shuffled contract ──────
CREATE OR REPLACE FUNCTION public.scp_seed_unanswered_legacy_attempts()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE _n integer;
BEGIN
  -- The immutability guard exists so a candidate is never reordered mid-run.
  -- An attempt with no saved response has no run to disturb, so it is the one
  -- case where giving it a seed is safe; the guard is suspended for this one
  -- statement, inside the caller's transaction, and restored.
  ALTER TABLE public.scp_attempts DISABLE TRIGGER scp_attempts_option_seed_immutable;
  UPDATE public.scp_attempts a
     SET option_order_seed = 1 + floor(random() * 2147483646)::integer
   WHERE a.status = 'in_progress'
     AND a.option_order_seed IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.scp_candidate_responses r WHERE r.attempt_id = a.id)
     AND EXISTS (SELECT 1 FROM public.scp_form_items fi
                   JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                  WHERE fi.form_id = a.form_id
                    AND fi.randomise_options
                    AND NOT public.scp_item_order_is_meaningful(iv.item_format));
  GET DIAGNOSTICS _n = ROW_COUNT;
  ALTER TABLE public.scp_attempts ENABLE TRIGGER scp_attempts_option_seed_immutable;
  RETURN _n;
END $$;

COMMENT ON FUNCTION public.scp_seed_unanswered_legacy_attempts() IS
  'Owner-only, run by 20261229090000. Seeds in_progress attempts that have no '
  'seed, no saved response, and a form asking for randomisation of an unordered '
  'format, so a pre-seed attempt that has not started answering is never '
  'served the key-first authored order. Never touches an answered attempt.';

REVOKE ALL ON FUNCTION public.scp_seed_unanswered_legacy_attempts() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE _n integer;
BEGIN
  _n := public.scp_seed_unanswered_legacy_attempts();
  RAISE NOTICE 'SCP_DELIVERY_KEY: % unanswered seedless attempt(s) moved onto the per-attempt order', _n;
END $$;

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _n int;
BEGIN
  -- The payload, not just the column list: no key-like field may be built.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_get_attempt_items(uuid,text)'::regprocedure)
       ~* '''(option_key|answer_key|is_best_key|is_worst_key|score_value|is_preferred|scoring_rationale|learning_feedback)''' THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PROOF: scp_get_attempt_items still builds a key-bearing field into its payload';
  END IF;
  SELECT count(*) INTO _n
    FROM unnest(string_to_array(
           pg_get_function_result('public.scp_get_attempt_items(uuid, text)'::regprocedure), ',')) AS c(col)
   WHERE col ILIKE '%score%' OR col ILIKE '%is_preferred%' OR col ILIKE '%rationale%'
      OR col ILIKE '%is_best_key%' OR col ILIKE '%is_worst_key%'
      OR col ILIKE '%option_key%'  OR col ILIKE '%answer_key%'
      OR col ILIKE '%learning_feedback%' OR col ILIKE '%distractor%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PROOF: the delivery projection exposes % scoring column(s)', _n;
  END IF;
  IF has_function_privilege('anon', 'public.scp_get_attempt_items(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_seed_unanswered_legacy_attempts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PROOF: a grant is wider than intended';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scp_attempts_option_seed_immutable'
               AND tgrelid = 'public.scp_attempts'::regclass AND tgenabled = 'D') THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PROOF: the seed immutability guard was left disabled';
  END IF;
  SELECT count(*) INTO _n FROM public.scp_attempts a
   WHERE a.status = 'in_progress' AND a.option_order_seed IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.scp_candidate_responses r WHERE r.attempt_id = a.id)
     AND EXISTS (SELECT 1 FROM public.scp_form_items fi
                   JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                  WHERE fi.form_id = a.form_id AND fi.randomise_options
                    AND NOT public.scp_item_order_is_meaningful(iv.item_format));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_DELIVERY_KEY_PROOF: % unanswered seedless attempt(s) would still be served key-first', _n;
  END IF;
  RAISE NOTICE 'SCP_DELIVERY_KEY_PROOF ok: a served option is {option_id, label}; no unanswered attempt on a randomised form is served the authored order';
END $$;
