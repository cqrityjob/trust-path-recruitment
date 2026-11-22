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
--    record follows it: controls, citations, asset links, evidence links and
--    version snapshots. A scoped risk cannot join an assessment (whose
--    revision copies risks). Ordinary records (access_mission_id NULL) behave
--    exactly as before. An OPEN mission's records are workspace-visible like
--    any other; the scope only bites while (and as soon as) the mission is
--    restricted.
-- 1a. Audit events carry the scope they were written with (mission_scope,
--    computed by the protected writer from the row, OLD on delete), so a
--    deleted citation or link never makes its history workspace-readable.
-- 1b. Copies that leave the record: a management report and an assistant job
--    or suggestion carry the missions whose records they used (a report's
--    list only grows). A restricted mission's records are refused as their
--    input; when a mission becomes restricted later, those copies become
--    need-to-know with it and stay so when the facts are refreshed.
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

-- Durable scope of copies. Before this migration no record could carry a
-- scope (the columns above are new), so every existing audit event and report
-- is correctly unscoped: '{}' is exact for them, not an assumption.
ALTER TABLE public.sw_audit_events ADD COLUMN mission_scope uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.sw_management_reports ADD COLUMN mission_scope uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.sw_audit_events.mission_scope IS 'Missions whose records the event is about, fixed by sw_private.record_change when the event is written (from OLD on delete). The event is visible exactly as all of them are.';
COMMENT ON COLUMN public.sw_management_reports.mission_scope IS 'Missions whose risks/actions the report has ever had in its facts, kept by the database and only ever extended (narrative and decisions may still carry what a dropped fact said). The report is visible exactly as all of them are; a restricted mission''s records are refused unless the report already belongs to its circle.';

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

-- Every mission in the list is visible to the caller (an empty list is).
CREATE FUNCTION sw_private.can_see_scopes(_workspace_id uuid, _missions uuid[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(coalesce(_missions, '{}')) m WHERE NOT sw_private.can_see_scope(_workspace_id, m));
$$;

-- Restricted now (live). A mission that cannot be found counts as restricted.
CREATE FUNCTION sw_private.scope_is_restricted(_workspace_id uuid, _mission_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _mission_id IS NOT NULL AND coalesce(
    (SELECT m.restricted FROM public.sw_missions m WHERE m.workspace_id = _workspace_id AND m.id = _mission_id), true);
$$;

-- The missions a referenced record carries: a risk, action, control or
-- citation through record_scope; a management report through its own list.
CREATE FUNCTION sw_private.ref_scopes(_workspace_id uuid, _kind text, _id text) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN _kind IN ('management_report', 'sw_management_reports') THEN
      CASE WHEN _id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        coalesce((SELECT r.mission_scope FROM public.sw_management_reports r WHERE r.workspace_id = _workspace_id AND r.id = _id::uuid), '{}') ELSE '{}' END
    ELSE array_remove(ARRAY[sw_private.record_scope(_workspace_id, _kind, _id)], NULL)
  END;
$$;

-- The missions behind a context plus a list of {table, id} sources.
CREATE FUNCTION sw_private.refs_scopes(_workspace_id uuid, _kind text, _id text, _sources jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT s), '{}') FROM (
    SELECT unnest(sw_private.ref_scopes(_workspace_id, _kind, _id)) AS s
    UNION ALL
    SELECT unnest(sw_private.ref_scopes(_workspace_id, e->>'table', e->>'id'))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_sources) = 'array' THEN _sources ELSE '[]' END) e
  ) x WHERE s IS NOT NULL;
$$;

-- Whether the caller may see everything a context plus sources drew on.
CREATE FUNCTION sw_private.can_see_refs(_workspace_id uuid, _kind text, _id text, _sources jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.can_see_scopes(_workspace_id, sw_private.refs_scopes(_workspace_id, _kind, _id, _sources));
$$;

-- The scope an audit event is written with, from the row itself (OLD on
-- delete), never from a later lookup of a record that may be gone. Children
-- reach their risk or target, which cannot be deleted while they exist.
CREATE FUNCTION sw_private.audit_scope(_table text, _row jsonb) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN _table IN ('sw_risks', 'sw_actions') THEN array_remove(ARRAY[(_row->>'access_mission_id')::uuid], NULL)
    WHEN _table IN ('sw_controls', 'sw_citations', 'sw_risk_assets') THEN
      array_remove(ARRAY[sw_private.record_scope((_row->>'workspace_id')::uuid, 'risk', _row->>'risk_id')], NULL)
    WHEN _table = 'sw_evidence_links' THEN
      array_remove(ARRAY[sw_private.record_scope((_row->>'workspace_id')::uuid, _row->>'target_kind', _row->>'target_id')], NULL)
    WHEN _table = 'sw_management_reports' THEN
      coalesce(ARRAY(SELECT jsonb_array_elements_text(_row->'mission_scope'))::uuid[], '{}')
    WHEN _table = 'sw_ai_suggestions' THEN
      sw_private.refs_scopes((_row->>'workspace_id')::uuid, _row->>'context_kind', _row->>'context_id', _row->'source_records')
    ELSE '{}'::uuid[]
  END;
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

-- A restricted mission's records never go to the assistant, whose results the
-- workspace reads. An open mission's records may; the job and its suggestion
-- then follow those missions (policies below) if one is restricted later.
CREATE FUNCTION sw_private.guard_assistant_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.kind = 'assistant' AND EXISTS (
       SELECT 1 FROM unnest(sw_private.refs_scopes(NEW.workspace_id, NEW.input_manifest->>'contextKind',
                                                   NEW.input_manifest->>'contextId', NEW.input_manifest->'sources')) m
        WHERE sw_private.scope_is_restricted(NEW.workspace_id, m)) THEN
    RAISE EXCEPTION 'SW_RESTRICTED_CONTEXT' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_06_assistant_scope BEFORE INSERT ON public.sw_processing_jobs FOR EACH ROW EXECUTE FUNCTION sw_private.guard_assistant_scope();

-- A management report's mission list is the database's, never the client's,
-- and it only grows. On every facts change it becomes the previous list plus
-- the missions of the risks and actions now in the facts: a refresh can drop a
-- record from the facts, but the narrative, decisions and earlier versions may
-- still carry what it said, so the report stays as need-to-know as anything it
-- ever drew on. A restricted mission's records never enter a report that did
-- not already belong to that mission's circle.
CREATE FUNCTION sw_private.guard_report_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _previous uuid[] := CASE WHEN TG_OP = 'UPDATE' THEN OLD.mission_scope ELSE '{}' END;
        _sources uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.facts IS NOT DISTINCT FROM OLD.facts THEN
    NEW.mission_scope := OLD.mission_scope;
    RETURN NEW;
  END IF;
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO _sources FROM (
    SELECT r.access_mission_id AS s
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.facts->'risks') = 'array' THEN NEW.facts->'risks' ELSE '[]' END) e
      JOIN public.sw_risks r ON r.workspace_id = NEW.workspace_id AND r.id::text = e->>'id'
    UNION ALL
    SELECT a.access_mission_id
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.facts->'actions') = 'array' THEN NEW.facts->'actions' ELSE '[]' END) e
      JOIN public.sw_actions a ON a.workspace_id = NEW.workspace_id AND a.id::text = e->>'id'
  ) x WHERE s IS NOT NULL;
  IF EXISTS (SELECT 1 FROM unnest(_sources) m WHERE NOT m = ANY(_previous) AND sw_private.scope_is_restricted(NEW.workspace_id, m)) THEN
    RAISE EXCEPTION 'SW_RESTRICTED_IN_REPORT' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT m ORDER BY m), '{}') INTO NEW.mission_scope
    FROM unnest(_previous || _sources) m;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_05_report_scope BEFORE INSERT OR UPDATE ON public.sw_management_reports FOR EACH ROW EXECUTE FUNCTION sw_private.guard_report_scope();

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
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_scopes(workspace_id, mission_scope));

-- Copies follow the missions they drew on.
DROP POLICY sw_member_read ON public.sw_management_reports;
DROP POLICY sw_editor_update ON public.sw_management_reports;
CREATE POLICY sw_member_read ON public.sw_management_reports FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_scopes(workspace_id, mission_scope));
CREATE POLICY sw_editor_update ON public.sw_management_reports FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_scopes(workspace_id, mission_scope))
  WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_ai_suggestions;
CREATE POLICY sw_member_read ON public.sw_ai_suggestions FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id)
    AND sw_private.can_see_refs(workspace_id, context_kind, context_id::text, source_records));
DROP POLICY sw_member_read ON public.sw_processing_jobs;
CREATE POLICY sw_member_read ON public.sw_processing_jobs FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND (kind <> 'assistant'
    OR sw_private.can_see_refs(workspace_id, input_manifest->>'contextKind', input_manifest->>'contextId', input_manifest->'sources')));
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

-- The protected log writer (20261210090000), unchanged except that each event
-- is written with its scope (sw_private.audit_scope, from OLD on delete).
CREATE OR REPLACE FUNCTION sw_private.record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE _row jsonb; _workspace uuid; _entity uuid; _snapshot jsonb; _details jsonb := '{}';
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'DELETE' THEN _row := to_jsonb(OLD); ELSE _row := to_jsonb(NEW); END IF;
  _workspace := CASE WHEN TG_TABLE_NAME = 'sw_workspaces' THEN (_row->>'id')::uuid ELSE (_row->>'workspace_id')::uuid END;
  _entity := coalesce((_row->>'id')::uuid, (_row->>'user_id')::uuid);
  IF TG_TABLE_NAME = 'sw_workspace_memberships' THEN
    _details := jsonb_build_object(
      'before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('role', OLD.role, 'active', OLD.active, 'can_approve', OLD.can_approve) END,
      'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('role', NEW.role, 'active', NEW.active, 'can_approve', NEW.can_approve) END);
  ELSIF TG_TABLE_NAME = 'sw_intelligence_items' THEN
    -- Preserve each attributed decision when triage moves to another state.
    -- Rationale is byte-bounded so both sides fit the audit details limit.
    _details := jsonb_build_object(
      'before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('status', OLD.status, 'rationale', OLD.human_rationale, 'decided_by', OLD.decided_by, 'decided_at', OLD.decided_at) END,
      'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('status', NEW.status, 'rationale', NEW.human_rationale, 'decided_by', NEW.decided_by, 'decided_at', NEW.decided_at) END);
  END IF;
  INSERT INTO public.sw_audit_events (workspace_id, actor_user_id, entity_table, entity_id, operation, old_status, new_status, record_version, details, mission_scope)
    VALUES (_workspace, auth.uid(), TG_TABLE_NAME, _entity, TG_OP, to_jsonb(OLD)->>'status', to_jsonb(NEW)->>'status', (_row->>'version')::integer, _details,
            sw_private.audit_scope(TG_TABLE_NAME, _row));
  IF TG_TABLE_NAME IN ('sw_assessments', 'sw_risks', 'sw_actions', 'sw_reports') THEN
    -- Snapshot includes exact approved citation rows, never dynamic foreign data.
    _snapshot := _row;
    IF TG_TABLE_NAME <> 'sw_actions' THEN
      SELECT _row || jsonb_build_object('citations', coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at, c.id), '[]'::jsonb)) INTO _snapshot
        FROM public.sw_citations c WHERE c.workspace_id = _workspace
          AND CASE TG_TABLE_NAME WHEN 'sw_assessments' THEN c.assessment_id = _entity WHEN 'sw_risks' THEN c.risk_id = _entity ELSE c.report_id = _entity END;
    END IF;
    IF TG_TABLE_NAME = 'sw_risks' THEN
      SELECT _snapshot || jsonb_build_object('controls', coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at, c.id), '[]'::jsonb)) INTO _snapshot
        FROM public.sw_controls c WHERE c.workspace_id = _workspace AND c.risk_id = _entity;
    END IF;
    INSERT INTO public.sw_record_versions (workspace_id, assessment_id, risk_id, action_id, report_id, version, snapshot, actor_user_id)
    VALUES (_workspace,
      CASE WHEN TG_TABLE_NAME = 'sw_assessments' THEN _entity END,
      CASE WHEN TG_TABLE_NAME = 'sw_risks' THEN _entity END,
      CASE WHEN TG_TABLE_NAME = 'sw_actions' THEN _entity END,
      CASE WHEN TG_TABLE_NAME = 'sw_reports' THEN _entity END,
      (_row->>'version')::integer, _snapshot, auth.uid());
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION sw_private.can_see_scope(uuid, uuid), sw_private.can_see_record(uuid, text, uuid), sw_private.record_scope(uuid, text, text),
  sw_private.guard_record_scope(), sw_private.guard_assistant_scope(), sw_private.guard_report_scope(),
  sw_private.can_see_scopes(uuid, uuid[]), sw_private.scope_is_restricted(uuid, uuid), sw_private.ref_scopes(uuid, text, text),
  sw_private.refs_scopes(uuid, text, text, jsonb), sw_private.can_see_refs(uuid, text, text, jsonb), sw_private.audit_scope(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
-- Policy expressions run as the caller: only the visibility helpers they name.
GRANT EXECUTE ON FUNCTION sw_private.can_see_scope(uuid, uuid), sw_private.can_see_record(uuid, text, uuid),
  sw_private.can_see_scopes(uuid, uuid[]), sw_private.can_see_refs(uuid, text, text, jsonb) TO authenticated;

COMMIT;
