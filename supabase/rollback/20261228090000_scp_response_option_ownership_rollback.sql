-- Roll back 20261228090000_scp_response_option_ownership.
--
-- Drops the three composite foreign keys and the (item_version_id, id) unique
-- constraint, and restores scp_save_response() exactly as 20260808090000
-- defined it. This REINSTATES THE P0: a candidate can again store, and
-- scp_submit_attempt will again score, an option belonging to another item.
-- It says so because that is what a rollback is. No stored row is touched.
ALTER TABLE public.scp_candidate_responses
  DROP CONSTRAINT IF EXISTS scp_candidate_responses_selected_option_on_item_fkey,
  DROP CONSTRAINT IF EXISTS scp_candidate_responses_best_option_on_item_fkey,
  DROP CONSTRAINT IF EXISTS scp_candidate_responses_worst_option_on_item_fkey;
ALTER TABLE public.scp_item_options
  DROP CONSTRAINT IF EXISTS scp_item_options_item_version_option_key;

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

REVOKE ALL ON FUNCTION public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname IN ('scp_candidate_responses_selected_option_on_item_fkey',
                                'scp_candidate_responses_best_option_on_item_fkey',
                                'scp_candidate_responses_worst_option_on_item_fkey',
                                'scp_item_options_item_version_option_key')) THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_ROLLBACK failed: a constraint survived';
  END IF;
  IF position('SCP_OPTION_NOT_ON_ITEM' IN
       (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_save_response(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'SCP_OPTION_OWNERSHIP_ROLLBACK failed: the ownership check survived';
  END IF;
  RAISE NOTICE 'SCP_OPTION_OWNERSHIP_ROLLBACK ok: scp_save_response restored to 20260808090000 and the item-option keys dropped (the P0 is open again)';
END $$;
