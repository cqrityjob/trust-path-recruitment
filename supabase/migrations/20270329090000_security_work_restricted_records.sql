-- Security Work: restricted-mission confidentiality for derived records, and
-- authorised mission-review acceptance. Forward fix on the installed
-- 20270327090000 and 20270328090000 (never edited).
--
-- 1. A risk or action created from an impact brief keeps the brief's mission
--    scope (access_mission_id). It is set by the database, never changes, is
--    inherited by an action from its risk, and is read through
--    sw_private.can_see_mission, so a restricted mission's circle - and only
--    it - reads or changes the record, a workspace owner outside it included.
--    Removing a mission link does not change it. Everything hanging off such a
--    record follows it: controls, citations, asset links, evidence links,
--    audit events and version snapshots. A scoped risk cannot join an
--    assessment (whose revision copies risks), and the assistant refuses a
--    scoped record as context, because its results are workspace-readable.
--    Ordinary records (access_mission_id NULL) behave exactly as before.
-- 2. Accepting a mission review requires an approver; the database stamps who
--    accepted, completion requires that stamp, and changing the reviewed
--    brief withdraws the acceptance.
--
-- Rollback: supabase/rollback/20270329090000_security_work_restricted_records_rollback.sql
-- (refuses while any scoped record or recorded acceptance exists).
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Scope columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_risks ADD COLUMN access_mission_id uuid;
ALTER TABLE public.sw_actions ADD COLUMN access_mission_id uuid;
ALTER TABLE public.sw_risks ADD CONSTRAINT sw_risks_access_mission_fkey FOREIGN KEY (workspace_id, access_mission_id) REFERENCES public.sw_missions(workspace_id, id);
ALTER TABLE public.sw_actions ADD CONSTRAINT sw_actions_access_mission_fkey FOREIGN KEY (workspace_id, access_mission_id) REFERENCES public.sw_missions(workspace_id, id);
CREATE INDEX sw_risks_access_mission_idx ON public.sw_risks(access_mission_id) WHERE access_mission_id IS NOT NULL;
CREATE INDEX sw_actions_access_mission_idx ON public.sw_actions(access_mission_id) WHERE access_mission_id IS NOT NULL;
COMMENT ON COLUMN public.sw_risks.access_mission_id IS 'Set by the database when the risk derives from a mission''s impact brief; immutable. The risk is visible exactly as that mission is.';
COMMENT ON COLUMN public.sw_actions.access_mission_id IS 'Set by the database (or inherited from the risk); immutable. The action is visible exactly as that mission is.';

ALTER TABLE public.sw_missions ADD COLUMN review_accepted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sw_missions ADD COLUMN review_accepted_at timestamptz;
ALTER TABLE public.sw_missions ADD CONSTRAINT sw_missions_completed_needs_acceptance
  CHECK (execution_state <> 'completed' OR review_accepted_by IS NOT NULL) NOT VALID;

-- -----------------------------------------------------------------------------
-- 2. Visibility helpers (policy expressions; callable like can_see_mission)
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.can_see_scope(_workspace_id uuid, _mission_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _mission_id IS NULL OR sw_private.can_see_mission(_workspace_id, _mission_id);
$$;

-- The mission scope of a risk or action, or of a control or citation through
-- its risk (NULL for ordinary records, other kinds and ids that are not
-- well-formed or point at nothing).
CREATE FUNCTION sw_private.record_scope(_workspace_id uuid, _kind text, _id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN _id IS NULL OR _id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL
    WHEN _kind IN ('risk', 'sw_risks') THEN (SELECT r.access_mission_id FROM public.sw_risks r WHERE r.workspace_id = _workspace_id AND r.id = _id::uuid)
    WHEN _kind IN ('action', 'sw_actions') THEN (SELECT a.access_mission_id FROM public.sw_actions a WHERE a.workspace_id = _workspace_id AND a.id = _id::uuid)
    -- Audited children of a risk carry its scope in the workspace history.
    WHEN _kind = 'sw_controls' THEN (SELECT r.access_mission_id FROM public.sw_controls c JOIN public.sw_risks r ON r.workspace_id = c.workspace_id AND r.id = c.risk_id WHERE c.workspace_id = _workspace_id AND c.id = _id::uuid)
    WHEN _kind = 'sw_citations' THEN (SELECT r.access_mission_id FROM public.sw_citations c JOIN public.sw_risks r ON r.workspace_id = c.workspace_id AND r.id = c.risk_id WHERE c.workspace_id = _workspace_id AND c.id = _id::uuid)
  END;
$$;

-- A risk's or action's visibility, for the rows that point at it. Other kinds,
-- and ids that point at nothing, are governed by their own table's policy.
CREATE FUNCTION sw_private.can_see_record(_workspace_id uuid, _kind text, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.can_see_scope(_workspace_id, sw_private.record_scope(_workspace_id, _kind, _id::text));
$$;

-- -----------------------------------------------------------------------------
-- 3. The scope is persisted, inherited and immutable
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.guard_record_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _risk_scope uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.access_mission_id IS DISTINCT FROM OLD.access_mission_id THEN
    RAISE EXCEPTION 'SW_ACCESS_SCOPE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'sw_actions' THEN
    -- Nested: NEW.risk_id exists on actions only.
    IF NEW.risk_id IS NOT NULL THEN
      SELECT r.access_mission_id INTO _risk_scope FROM public.sw_risks r WHERE r.workspace_id = NEW.workspace_id AND r.id = NEW.risk_id;
      IF TG_OP = 'INSERT' AND NEW.access_mission_id IS NULL THEN NEW.access_mission_id := _risk_scope; END IF;
      IF _risk_scope IS NOT NULL AND NEW.access_mission_id IS DISTINCT FROM _risk_scope THEN
        RAISE EXCEPTION 'SW_ACCESS_SCOPE_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  -- A scoped risk never joins an assessment: revising one copies its risks unscoped.
  IF TG_TABLE_NAME = 'sw_risks' THEN
    IF NEW.access_mission_id IS NOT NULL AND NEW.assessment_id IS NOT NULL THEN
      RAISE EXCEPTION 'SW_SCOPED_RISK_OUTSIDE_ASSESSMENT' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.access_mission_id IS NOT NULL AND NOT sw_private.can_see_mission(NEW.workspace_id, NEW.access_mission_id) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_04_scope BEFORE INSERT OR UPDATE ON public.sw_risks FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record_scope();
CREATE TRIGGER sw_04_scope BEFORE INSERT OR UPDATE ON public.sw_actions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record_scope();

-- The assistant's result is workspace-readable, so a scoped record is never its context.
CREATE FUNCTION sw_private.guard_assistant_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.kind = 'assistant' AND (
       sw_private.record_scope(NEW.workspace_id, NEW.input_manifest->>'contextKind', NEW.input_manifest->>'contextId') IS NOT NULL
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.input_manifest->'sources') = 'array' THEN NEW.input_manifest->'sources' ELSE '[]' END) s
                   WHERE sw_private.record_scope(NEW.workspace_id, s->>'table', s->>'id') IS NOT NULL)) THEN
    RAISE EXCEPTION 'SW_RESTRICTED_CONTEXT' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_06_assistant_scope BEFORE INSERT ON public.sw_processing_jobs FOR EACH ROW EXECUTE FUNCTION sw_private.guard_assistant_scope();

-- -----------------------------------------------------------------------------
-- 4. Policies: scoped records and everything that points at them
-- -----------------------------------------------------------------------------
DROP POLICY sw_member_read ON public.sw_risks;
DROP POLICY sw_editor_insert ON public.sw_risks;
DROP POLICY sw_editor_update ON public.sw_risks;
CREATE POLICY sw_member_read ON public.sw_risks FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));
CREATE POLICY sw_editor_insert ON public.sw_risks FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));
CREATE POLICY sw_editor_update ON public.sw_risks FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id))
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));
DROP POLICY sw_member_read ON public.sw_actions;
DROP POLICY sw_editor_insert ON public.sw_actions;
DROP POLICY sw_editor_update ON public.sw_actions;
CREATE POLICY sw_member_read ON public.sw_actions FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));
CREATE POLICY sw_editor_insert ON public.sw_actions FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));
CREATE POLICY sw_editor_update ON public.sw_actions FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id))
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_scope(workspace_id, access_mission_id));

DROP POLICY sw_member_read ON public.sw_controls;
DROP POLICY sw_editor_insert ON public.sw_controls;
DROP POLICY sw_editor_update ON public.sw_controls;
CREATE POLICY sw_member_read ON public.sw_controls FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_insert ON public.sw_controls FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_update ON public.sw_controls FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id))
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));

DROP POLICY sw_member_read ON public.sw_citations;
DROP POLICY sw_editor_insert ON public.sw_citations;
DROP POLICY sw_editor_delete ON public.sw_citations;
CREATE POLICY sw_member_read ON public.sw_citations FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_insert ON public.sw_citations FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_delete ON public.sw_citations FOR DELETE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));

DROP POLICY sw_member_read ON public.sw_risk_assets;
DROP POLICY sw_editor_insert ON public.sw_risk_assets;
DROP POLICY sw_editor_delete ON public.sw_risk_assets;
CREATE POLICY sw_member_read ON public.sw_risk_assets FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_insert ON public.sw_risk_assets FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));
CREATE POLICY sw_editor_delete ON public.sw_risk_assets FOR DELETE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id));

DROP POLICY sw_member_read ON public.sw_evidence_links;
DROP POLICY sw_editor_insert ON public.sw_evidence_links;
DROP POLICY sw_editor_delete ON public.sw_evidence_links;
CREATE POLICY sw_member_read ON public.sw_evidence_links FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, target_kind, target_id));
CREATE POLICY sw_editor_insert ON public.sw_evidence_links FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, target_kind, target_id));
CREATE POLICY sw_editor_delete ON public.sw_evidence_links FOR DELETE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_record(workspace_id, target_kind, target_id));

DROP POLICY sw_member_read ON public.sw_audit_events;
CREATE POLICY sw_member_read ON public.sw_audit_events FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, entity_table, entity_id));
DROP POLICY sw_member_read ON public.sw_record_versions;
CREATE POLICY sw_member_read ON public.sw_record_versions FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, 'risk', risk_id) AND sw_private.can_see_record(workspace_id, 'action', action_id));

-- -----------------------------------------------------------------------------
-- 5. Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sw_private.guard_mission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE _allowed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.execution_state <> 'created' OR NEW.review_state <> 'not_started' THEN
      RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.review_accepted_by := NULL; NEW.review_accepted_at := NULL;
    IF NEW.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.owner_id AND m.active) THEN
      RAISE EXCEPTION 'SW_ACTIVE_OWNER_REQUIRED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.execution_state IN ('completed', 'cancelled', 'failed', 'outcome_unknown') AND
     (to_jsonb(NEW) - ARRAY['version', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['version', 'updated_at']) THEN
    RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
  END IF;
  -- The acceptance stamp is the database's alone.
  NEW.review_accepted_by := OLD.review_accepted_by; NEW.review_accepted_at := OLD.review_accepted_at;
  -- Changing what was reviewed withdraws the acceptance; it is never kept silently.
  IF OLD.review_state = 'accepted' AND NEW.review_state = 'accepted'
     AND (NEW.brief IS DISTINCT FROM OLD.brief OR NEW.title IS DISTINCT FROM OLD.title OR NEW.kind IS DISTINCT FROM OLD.kind) THEN
    NEW.review_state := 'changes_requested';
  END IF;
  IF NEW.execution_state IS DISTINCT FROM OLD.execution_state THEN
    _allowed := CASE OLD.execution_state
      WHEN 'created' THEN ARRAY['collecting', 'waiting_for_input', 'ready', 'cancelled']
      WHEN 'collecting' THEN ARRAY['waiting_for_input', 'ready', 'failed', 'cancelled']
      WHEN 'waiting_for_input' THEN ARRAY['collecting', 'ready', 'cancelled']
      WHEN 'ready' THEN ARRAY['running', 'needs_review', 'collecting', 'waiting_for_input', 'cancelled']
      WHEN 'running' THEN ARRAY['needs_review', 'failed', 'outcome_unknown', 'waiting_for_input']
      WHEN 'needs_review' THEN ARRAY['completed', 'collecting', 'ready', 'cancelled']
      ELSE ARRAY[]::text[] END;
    IF NOT NEW.execution_state = ANY(_allowed) THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION: % -> %', OLD.execution_state, NEW.execution_state USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.review_state IS DISTINCT FROM OLD.review_state THEN
    IF NOT ((OLD.review_state IN ('not_started', 'changes_requested') AND NEW.review_state = 'in_review')
         OR (OLD.review_state = 'in_review' AND NEW.review_state IN ('accepted', 'changes_requested'))
         OR (OLD.review_state = 'accepted' AND NEW.review_state = 'changes_requested' AND NEW.execution_state <> 'completed')) THEN
      RAISE EXCEPTION 'SW_INVALID_REVIEW_TRANSITION' USING ERRCODE = '23514';
    END IF;
    -- Accepting a review is an approval: an editor prepares and submits, an approver accepts.
    IF NEW.review_state = 'accepted' THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      NEW.review_accepted_by := auth.uid(); NEW.review_accepted_at := now();
    ELSE
      NEW.review_accepted_by := NULL; NEW.review_accepted_at := NULL;
    END IF;
  END IF;
  IF NEW.execution_state = 'completed' AND OLD.execution_state <> 'completed'
     AND (NEW.review_state <> 'accepted' OR NEW.review_accepted_by IS NULL) THEN
    RAISE EXCEPTION 'SW_ACCEPTANCE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.owner_id AND m.active) THEN
    RAISE EXCEPTION 'SW_ACTIVE_OWNER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  -- Ownership administers the circle (set_mission_member), so editing a mission
  -- never confers it: only the creator, the current owner or a workspace owner
  -- may transfer it, and in a restricted mission only to someone already in it.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF auth.uid() IS DISTINCT FROM OLD.created_by AND auth.uid() IS DISTINCT FROM OLD.owner_id
       AND NOT sw_private.can_manage(NEW.workspace_id) THEN
      RAISE EXCEPTION 'SW_MISSION_OWNER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NEW.restricted AND NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM NEW.created_by AND NOT EXISTS (
         SELECT 1 FROM public.sw_mission_members mm WHERE mm.mission_id = NEW.id AND mm.user_id = NEW.owner_id) THEN
      RAISE EXCEPTION 'SW_OWNER_OUTSIDE_CIRCLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- Only the creator or a workspace owner may open or close a mission's circle.
  IF NEW.restricted IS DISTINCT FROM OLD.restricted AND OLD.created_by IS DISTINCT FROM auth.uid() AND NOT sw_private.can_manage(NEW.workspace_id) THEN
    RAISE EXCEPTION 'SW_RESTRICTION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION sw_private.apply_change_brief(_workspace_id uuid, _brief_id uuid, _expected_version integer, _request_id uuid, _apply jsonb)
RETURNS public.sw_change_brief_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE b public.sw_change_briefs; a public.sw_change_brief_applications; _hash text; _risk uuid; _actions uuid[] := '{}'; _id uuid; _item jsonb; _source uuid;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _request_id IS NULL OR _apply IS NULL OR jsonb_typeof(_apply) <> 'object'
     OR (_apply ? 'risk' AND jsonb_typeof(_apply->'risk') NOT IN ('object', 'null'))
     OR jsonb_typeof(coalesce(_apply->'actions', '[]')) <> 'array' OR jsonb_array_length(coalesce(_apply->'actions', '[]')) > 10
     OR (jsonb_typeof(_apply->'risk') IS DISTINCT FROM 'object' AND jsonb_array_length(coalesce(_apply->'actions', '[]')) = 0) THEN
    RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
  END IF;
  _hash := sw_private.hash_text(jsonb_build_object('brief', _brief_id, 'version', _expected_version, 'apply', _apply)::text);
  SELECT * INTO b FROM public.sw_change_briefs WHERE workspace_id = _workspace_id AND id = _brief_id FOR UPDATE;
  IF b.id IS NULL OR (b.mission_id IS NOT NULL AND NOT sw_private.can_see_mission(_workspace_id, b.mission_id)) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.sw_change_brief_applications WHERE workspace_id = _workspace_id AND brief_id = _brief_id;
  IF FOUND THEN
    IF a.id = _request_id AND a.request_hash = _hash AND a.applied_by = auth.uid() THEN RETURN a; END IF;
    RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF b.status <> 'approved' OR b.version <> _expected_version THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;
  IF jsonb_typeof(_apply->'risk') = 'object' THEN
    INSERT INTO public.sw_risks(workspace_id, title, description, threat_scenario, source_kind, access_mission_id)
    VALUES (_workspace_id, _apply->'risk'->>'title', coalesce(_apply->'risk'->>'description', ''), coalesce(_apply->'risk'->>'threatScenario', ''), 'monitoring', b.mission_id)
    RETURNING id INTO _risk;
    FOR _source IN SELECT DISTINCT (e->>'sourceId')::uuid FROM jsonb_array_elements(b.evidence) e LOOP
      INSERT INTO public.sw_evidence_links(workspace_id, source_id, target_kind, target_id, note)
      VALUES (_workspace_id, _source, 'risk', _risk, 'Impact brief ' || b.id::text) ON CONFLICT DO NOTHING;
    END LOOP;
    IF b.mission_id IS NOT NULL THEN
      INSERT INTO public.sw_mission_links(workspace_id, mission_id, target_kind, target_id) VALUES (_workspace_id, b.mission_id, 'risk', _risk);
    END IF;
  END IF;
  FOR _item IN SELECT value FROM jsonb_array_elements(coalesce(_apply->'actions', '[]')) LOOP
    IF jsonb_typeof(_item->'title') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.sw_actions(workspace_id, risk_id, source_kind, title, description, priority, status, due_date, access_mission_id)
    VALUES (_workspace_id, _risk, CASE WHEN _risk IS NULL THEN 'manual' ELSE 'risk' END, _item->>'title', coalesce(_item->>'description', ''),
            coalesce(_item->>'priority', 'medium'), 'open', (_item->>'dueDate')::date, b.mission_id)
    RETURNING id INTO _id;
    _actions := _actions || _id;
    IF b.mission_id IS NOT NULL THEN
      INSERT INTO public.sw_mission_links(workspace_id, mission_id, target_kind, target_id) VALUES (_workspace_id, b.mission_id, 'action', _id);
    END IF;
  END LOOP;
  INSERT INTO public.sw_change_brief_applications(id, workspace_id, brief_id, request_hash, risk_id, action_ids, applied_by)
  VALUES (_request_id, _workspace_id, _brief_id, _hash, _risk, _actions, auth.uid())
  RETURNING * INTO a;
  RETURN a;
END $function$;

REVOKE ALL ON FUNCTION sw_private.can_see_scope(uuid, uuid), sw_private.can_see_record(uuid, text, uuid), sw_private.record_scope(uuid, text, text),
  sw_private.guard_record_scope(), sw_private.guard_assistant_scope() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sw_private.can_see_scope(uuid, uuid), sw_private.can_see_record(uuid, text, uuid) TO authenticated;

COMMIT;
