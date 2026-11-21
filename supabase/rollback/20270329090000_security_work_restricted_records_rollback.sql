-- Rollback for 20270329090000_security_work_restricted_records.sql.
-- Restores the installed definitions of 20270327090000 (guard_mission) and
-- 20270328090000 (apply_change_brief) and the workspace-wide policies.
-- REFUSES while any risk or action carries a mission scope, or any mission
-- review acceptance is recorded: dropping the scope would make restricted
-- content readable to the whole workspace. Remove dependent application code
-- before executing it.
BEGIN;
LOCK TABLE public.sw_risks, public.sw_actions, public.sw_missions IN SHARE ROW EXCLUSIVE MODE;
DO $preserve$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sw_risks WHERE access_mission_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.sw_actions WHERE access_mission_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.sw_missions WHERE review_accepted_by IS NOT NULL) THEN
    RAISE EXCEPTION 'SW_RESTRICTED_RECORDS_ROLLBACK_DATA_PRESENT: scoped records or recorded acceptances exist' USING ERRCODE = '23514';
  END IF;
END $preserve$;

DROP POLICY sw_member_read ON public.sw_risks; CREATE POLICY sw_member_read ON public.sw_risks FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_risks; CREATE POLICY sw_editor_insert ON public.sw_risks FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_update ON public.sw_risks; CREATE POLICY sw_editor_update ON public.sw_risks FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_actions; CREATE POLICY sw_member_read ON public.sw_actions FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_actions; CREATE POLICY sw_editor_insert ON public.sw_actions FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_update ON public.sw_actions; CREATE POLICY sw_editor_update ON public.sw_actions FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_controls; CREATE POLICY sw_member_read ON public.sw_controls FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_controls; CREATE POLICY sw_editor_insert ON public.sw_controls FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_update ON public.sw_controls; CREATE POLICY sw_editor_update ON public.sw_controls FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_citations; CREATE POLICY sw_member_read ON public.sw_citations FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_citations; CREATE POLICY sw_editor_insert ON public.sw_citations FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_delete ON public.sw_citations; CREATE POLICY sw_editor_delete ON public.sw_citations FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_risk_assets; CREATE POLICY sw_member_read ON public.sw_risk_assets FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_risk_assets; CREATE POLICY sw_editor_insert ON public.sw_risk_assets FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_delete ON public.sw_risk_assets; CREATE POLICY sw_editor_delete ON public.sw_risk_assets FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_evidence_links; CREATE POLICY sw_member_read ON public.sw_evidence_links FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_editor_insert ON public.sw_evidence_links; CREATE POLICY sw_editor_insert ON public.sw_evidence_links FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
DROP POLICY sw_editor_delete ON public.sw_evidence_links; CREATE POLICY sw_editor_delete ON public.sw_evidence_links FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id));
DROP POLICY sw_member_read ON public.sw_audit_events; CREATE POLICY sw_member_read ON public.sw_audit_events FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
DROP POLICY sw_member_read ON public.sw_record_versions; CREATE POLICY sw_member_read ON public.sw_record_versions FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));

DROP TRIGGER sw_06_assistant_scope ON public.sw_processing_jobs;
DROP TRIGGER sw_04_scope ON public.sw_risks;
DROP TRIGGER sw_04_scope ON public.sw_actions;
CREATE OR REPLACE FUNCTION sw_private.apply_change_brief(_workspace_id uuid, _brief_id uuid, _expected_version integer, _request_id uuid, _apply jsonb)
 RETURNS sw_change_brief_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    INSERT INTO public.sw_risks(workspace_id, title, description, threat_scenario, source_kind)
    VALUES (_workspace_id, _apply->'risk'->>'title', coalesce(_apply->'risk'->>'description', ''), coalesce(_apply->'risk'->>'threatScenario', ''), 'monitoring')
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
    INSERT INTO public.sw_actions(workspace_id, risk_id, source_kind, title, description, priority, status, due_date)
    VALUES (_workspace_id, _risk, CASE WHEN _risk IS NULL THEN 'manual' ELSE 'risk' END, _item->>'title', coalesce(_item->>'description', ''),
            coalesce(_item->>'priority', 'medium'), 'open', (_item->>'dueDate')::date)
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

CREATE OR REPLACE FUNCTION sw_private.guard_mission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE _allowed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.execution_state <> 'created' OR NEW.review_state <> 'not_started' THEN
      RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF NEW.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.owner_id AND m.active) THEN
      RAISE EXCEPTION 'SW_ACTIVE_OWNER_REQUIRED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.execution_state IN ('completed', 'cancelled', 'failed', 'outcome_unknown') AND
     (to_jsonb(NEW) - ARRAY['version', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['version', 'updated_at']) THEN
    RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
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

DROP FUNCTION sw_private.guard_assistant_scope();
DROP FUNCTION sw_private.guard_record_scope();
DROP FUNCTION sw_private.can_see_record(uuid, text, uuid);
DROP FUNCTION sw_private.record_scope(uuid, text, text);
DROP FUNCTION sw_private.can_see_scope(uuid, uuid);
ALTER TABLE public.sw_missions DROP CONSTRAINT sw_missions_completed_needs_acceptance;
ALTER TABLE public.sw_missions DROP COLUMN review_accepted_at, DROP COLUMN review_accepted_by;
DROP INDEX public.sw_actions_access_mission_idx;
DROP INDEX public.sw_risks_access_mission_idx;
ALTER TABLE public.sw_actions DROP CONSTRAINT sw_actions_access_mission_fkey, DROP COLUMN access_mission_id;
ALTER TABLE public.sw_risks DROP CONSTRAINT sw_risks_access_mission_fkey, DROP COLUMN access_mission_id;

COMMIT;
