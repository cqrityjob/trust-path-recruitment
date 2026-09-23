-- Rollback for 20261210090000_security_work_foundation.sql.
-- Pre-adoption stand-down only. Never silently discard professional work:
-- if any workspace exists, stop and require a separately reviewed preservation
-- migration. Revert dependent application code before standing this schema down.
-- No object in Career, Recruitment, Passport, Storage or auth is removed.
BEGIN;
LOCK TABLE public.sw_workspaces IN ACCESS EXCLUSIVE MODE;
DO $preserve$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sw_workspaces) THEN
    RAISE EXCEPTION 'SW_ROLLBACK_DATA_PRESENT: preserve adopted work through a separately reviewed migration' USING ERRCODE = '23514';
  END IF;
END;
$preserve$;

DROP FUNCTION public.sw_create_personal_workspace(text);
ALTER TABLE public.sw_intelligence_items DROP CONSTRAINT sw_intelligence_ai_run_fk;
DROP TABLE public.sw_record_versions;
DROP TABLE public.sw_audit_events;
DROP TABLE public.sw_ai_runs;
DROP TABLE public.sw_citations;
DROP TABLE public.sw_actions;
DROP TABLE public.sw_controls;
DROP TABLE public.sw_risks;
DROP TABLE public.sw_reports;
DROP TABLE public.sw_assessments;
DROP TABLE public.sw_intelligence_items;
DROP TABLE public.sw_source_items;
DROP TABLE public.sw_sources;
DROP TABLE public.sw_intelligence_requirements;
DROP TABLE public.sw_monitoring_profiles;
DROP TABLE public.sw_workspace_memberships;
DROP TABLE public.sw_workspaces;

DROP FUNCTION sw_private.reject_history_change();
DROP FUNCTION sw_private.record_change();
DROP FUNCTION sw_private.guard_citation();
DROP FUNCTION sw_private.guard_lifecycle();
DROP FUNCTION sw_private.guard_record();
DROP FUNCTION sw_private.create_personal_workspace(text);
DROP FUNCTION sw_private.can_approve(uuid);
DROP FUNCTION sw_private.can_edit(uuid);
DROP FUNCTION sw_private.can_read(uuid);
DROP FUNCTION sw_private.is_human();
DROP SCHEMA sw_private;
COMMIT;
