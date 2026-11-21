-- Rollback for 20270327090000_security_work_context_missions_collaboration.sql.
-- Pre-adoption only: refuses while any operating profile, preference, mission
-- or invitation exists. Memberships created by accepted invitations are
-- ordinary memberships and are never touched. Remove dependent application
-- code before executing it.
BEGIN;
LOCK TABLE public.sw_workspaces IN SHARE ROW EXCLUSIVE MODE;
DO $preserve$
DECLARE t text; adopted boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['sw_operating_profiles', 'sw_member_preferences', 'sw_missions', 'sw_invitations'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO adopted;
    IF adopted THEN RAISE EXCEPTION 'SW_CONTEXT_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE = '23514'; END IF;
  END LOOP;
END $preserve$;
DROP FUNCTION public.sw_list_members(uuid);
DROP FUNCTION sw_private.list_members(uuid);
DROP FUNCTION public.sw_set_member_role(uuid, uuid, text, boolean, boolean);
DROP FUNCTION sw_private.set_member_role(uuid, uuid, text, boolean, boolean);
DROP FUNCTION public.sw_revoke_invitation(uuid, uuid);
DROP FUNCTION sw_private.revoke_invitation(uuid, uuid);
DROP FUNCTION public.sw_accept_invitation(text);
DROP FUNCTION sw_private.accept_invitation(text);
DROP FUNCTION public.sw_create_invitation(uuid, uuid, text, text, boolean);
DROP FUNCTION sw_private.create_invitation(uuid, uuid, text, text, boolean);
DROP TABLE public.sw_invitations;
DROP FUNCTION public.sw_set_mission_member(uuid, uuid, uuid, boolean);
DROP FUNCTION sw_private.set_mission_member(uuid, uuid, uuid, boolean);
DROP TABLE public.sw_mission_events;
DROP TABLE public.sw_mission_links;
DROP TABLE public.sw_mission_members;
DROP TABLE public.sw_missions;
DROP FUNCTION sw_private.guard_mission_link();
DROP FUNCTION sw_private.record_mission_event();
DROP FUNCTION sw_private.guard_mission();
DROP FUNCTION sw_private.can_see_mission(uuid, uuid);
DROP TABLE public.sw_member_preferences;
DROP TABLE public.sw_operating_profiles;
DROP FUNCTION sw_private.guard_operating_profile();
DROP FUNCTION sw_private.can_manage(uuid);
COMMENT ON TABLE public.sw_workspace_memberships IS 'Explicit Security Work membership only. Personal workspace bootstrap creates one owner with approval; no invitation or membership-write API in PR A.';
COMMIT;
