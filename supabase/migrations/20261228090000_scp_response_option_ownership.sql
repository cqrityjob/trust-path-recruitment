-- =============================================================================
-- P0 -- an answer's option must belong to the item it answers
-- =============================================================================
--
-- THE DEFECT (found by the 2026-10-01 pre-release security audit, verified
-- against hosted production function bodies):
--
--   scp_save_response() -- the ONLY writer of scp_candidate_responses; clients
--   hold SELECT only on the table -- checked that the attempt is the caller's,
--   that it is in_progress, and that the item is on the attempt's form. It never
--   checked that _selected_option_id, _best_option_id or _worst_option_id
--   belong to _item_version_id. The three single-column foreign keys only
--   require the option to exist SOMEWHERE in scp_item_options, and the shape
--   trigger scp_guard_response_matches_format checks presence, not ownership.
--
--   scp_submit_attempt() then scores an option by id alone:
--     score_value(option the candidate named) / max(score_value of THIS item)
--   and, for best/worst, is_best_key / is_worst_key of whichever option ids the
--   candidate named. So any option id carrying the top score -- or a best/worst
--   key -- scores full marks on every item that shares the scale, and becomes
--   deterministic employer-facing evidence.
--
-- THE INVARIANT this migration makes true, in two independent layers:
--
--   A candidate can only store an answer whose every option belongs to the
--   exact item version being answered, on an item of their own open attempt.
--
--   1. scp_save_response() refuses any non-null option id that is not an option
--      of _item_version_id, with ONE error for "another item's option", "another
--      assessment's option" and "an option that does not exist", so the error
--      is not an oracle. Everything else in the function is byte-for-byte the
--      definition from 20260808090000.
--
--   2. scp_candidate_responses carries composite foreign keys
--      (item_version_id, selected_option_id | best_option_id | worst_option_id)
--      -> scp_item_options (item_version_id, id). A mismatched row cannot exist
--      at all -- whoever writes it, through whatever function, now or later --
--      so scp_submit_attempt can never read one, and is left untouched. NULL
--      option columns are not checked (MATCH SIMPLE), which is exactly the
--      constructed-response and half-answered best/worst shape.
--
-- RESPONSE FORMATS, mapped before the fix (hosted: 310 option-bearing item
-- versions on a common 0..3 scale, 31 constructed):
--   sjt_best_response, sjt_rate_effectiveness, biq_frequency -> selected_option_id
--   sjt_best_worst  -> best_option_id and/or worst_option_id (saved one side at
--                      a time while in_progress; both required at submission)
--   constructed_response -> response_text only, no option (shape trigger)
-- Every legitimate answer names options of its own item, so no supported format
-- changes behaviour. Idempotent re-saves (ON CONFLICT ... DO UPDATE) unchanged.
--
-- HISTORICAL DATA: the migration refuses to apply if any stored response names
-- an option of another item, and changes no stored row. Hosted read-only check
-- on 2026-10-01: 682 responses, 0 mismatched.
--
-- Rollback: supabase/rollback/20261228090000_scp_response_option_ownership_rollback.sql
-- Suite:    supabase/tests/scp_response_option_ownership_test.sql
-- =============================================================================

-- ── 0. Precondition: no stored answer already violates the invariant ─────
DO $$
DECLARE _bad bigint;
BEGIN
  IF to_regprocedure('public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PRECONDITION: scp_save_response(uuid,uuid,uuid,uuid,uuid,text) is missing';
  END IF;
  SELECT count(*) INTO _bad
    FROM public.scp_candidate_responses r
   WHERE EXISTS (SELECT 1 FROM public.scp_item_options o
                  WHERE o.id IN (r.selected_option_id, r.best_option_id, r.worst_option_id)
                    AND o.item_version_id <> r.item_version_id);
  IF _bad > 0 THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PRECONDITION: % stored response(s) name an option of another item. This migration does not rewrite evidence; resolve them deliberately first.', _bad;
  END IF;
END $$;

-- ── 1. The referential target: (item_version_id, id) is unique ───────────
-- id is already the primary key, so this cannot reject a row; it exists so the
-- pair can be referenced.
ALTER TABLE public.scp_item_options
  ADD CONSTRAINT scp_item_options_item_version_option_key UNIQUE (item_version_id, id);

-- ── 2. The table-level invariant ─────────────────────────────────────────
ALTER TABLE public.scp_candidate_responses
  ADD CONSTRAINT scp_candidate_responses_selected_option_on_item_fkey
    FOREIGN KEY (item_version_id, selected_option_id)
    REFERENCES public.scp_item_options (item_version_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT scp_candidate_responses_best_option_on_item_fkey
    FOREIGN KEY (item_version_id, best_option_id)
    REFERENCES public.scp_item_options (item_version_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT scp_candidate_responses_worst_option_on_item_fkey
    FOREIGN KEY (item_version_id, worst_option_id)
    REFERENCES public.scp_item_options (item_version_id, id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT scp_candidate_responses_selected_option_on_item_fkey
  ON public.scp_candidate_responses IS
  'P0 2026-10-01: an answer''s option must be an option of the answered item. '
  'Without it scp_submit_attempt scored a foreign option''s score_value against '
  'this item''s maximum. See 20261228090000.';

-- ── 3. The save path refuses it first, with one non-oracular error ───────
CREATE OR REPLACE FUNCTION public.scp_save_response(
  _attempt_id uuid,
  _item_version_id uuid,
  _selected_option_id uuid DEFAULT NULL,
  _best_option_id uuid DEFAULT NULL,
  _worst_option_id uuid DEFAULT NULL,
  _response_text text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _status text; _form_id uuid; _id uuid;
BEGIN
  SELECT a.status, a.form_id INTO _status, _form_id
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
  IF NOT EXISTS (SELECT 1 FROM public.scp_form_items
                  WHERE form_id = _form_id AND item_version_id = _item_version_id) THEN
    RAISE EXCEPTION 'SCP_ITEM_NOT_ON_FORM: that item is not part of this attempt.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- P0 2026-10-01 (20261228090000): every option named must be an option of
  -- THIS item. One error for a foreign, a cross-assessment and a fabricated
  -- id, so the refusal reveals nothing about which ids exist.
  IF EXISTS (SELECT 1
               FROM unnest(ARRAY[_selected_option_id, _best_option_id, _worst_option_id]) AS named(option_id)
              WHERE named.option_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.scp_item_options o
                                 WHERE o.id = named.option_id
                                   AND o.item_version_id = _item_version_id)) THEN
    RAISE EXCEPTION 'SCP_OPTION_NOT_ON_ITEM: that option is not an option of this item.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_candidate_responses
    (attempt_id, item_version_id, selected_option_id, best_option_id,
     worst_option_id, response_text)
  VALUES
    (_attempt_id, _item_version_id, _selected_option_id, _best_option_id,
     _worst_option_id, nullif(btrim(coalesce(_response_text,'')), ''))
  ON CONFLICT (attempt_id, item_version_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        best_option_id     = EXCLUDED.best_option_id,
        worst_option_id    = EXCLUDED.worst_option_id,
        response_text      = EXCLUDED.response_text,
        responded_at       = now()
  RETURNING id INTO _id;

  RETURN _id;
END; $$;

-- CREATE OR REPLACE keeps the ACL; restated so the grant is explicit here.
REVOKE ALL ON FUNCTION public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text) TO authenticated;

-- ── 4. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid = 'public.scp_candidate_responses'::regclass AND contype = 'f' AND convalidated
     AND conname IN ('scp_candidate_responses_selected_option_on_item_fkey',
                     'scp_candidate_responses_best_option_on_item_fkey',
                     'scp_candidate_responses_worst_option_on_item_fkey');
  IF _n <> 3 THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PROOF: expected 3 validated item-option foreign keys, found %', _n;
  END IF;
  IF position('SCP_OPTION_NOT_ON_ITEM' IN
       (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PROOF: scp_save_response does not carry the ownership check';
  END IF;
  IF has_function_privilege('anon', 'public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PROOF: anon may execute scp_save_response';
  END IF;
  -- The function is the only client write path: RLS is on and no policy lets
  -- a client role INSERT or UPDATE. (Asserted on policies, not grants: a
  -- Supabase stack's default privileges grant table writes that RLS refuses.)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scp_candidate_responses'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'scp_candidate_responses'
                   AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                   AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_PROOF: a client role can write scp_candidate_responses directly';
  END IF;
  RAISE NOTICE 'SCP_OPTION_OWNERSHIP_PROOF ok: an answer can name only options of its own item, at the save path and in the table';
END $$;
