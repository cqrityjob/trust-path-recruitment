-- =============================================================================
-- Security Work Release A: versioned operating profile, missions with
-- need-to-know, and minimum team collaboration.
-- =============================================================================
--
-- Next canonical ledger slot after 20270326090000. Schema only. No provider,
-- connector, schedule, e-mail or external message is created. No existing row
-- is rewritten. Plan: docs/security-intelligence/security-work-runtime-map.md.
--
-- 1. sw_operating_profiles: the workspace's operating context, append-only and
--    versioned (profile_version = previous + 1, enforced). Unknown schema
--    versions fail closed. Provenance per field is stored beside the content
--    so a prefilled value is visibly "from the mandate, confirmed by X".
--    sw_member_preferences holds a person's presentation choice (role focus).
--    It is read and written only by that person and grants nothing.
-- 2. sw_missions (+ members, links, events): an assignment with a brief, an
--    owner and a next action. Execution state, review state and the lifecycle
--    of the business records it links to are separate columns/tables. A
--    restricted mission is visible ONLY to its members (the creator is one);
--    this is enforced by RLS on the mission and on everything hanging off it,
--    not by the UI. Its history is mission-scoped (sw_mission_events), so a
--    restricted mission does not leak through the workspace-wide audit feed.
-- 3. Collaboration: an owner invites by e-mail with a one-time code that the
--    owner hands over themselves (nothing is sent), stored only as a hash and
--    valid for at most 14 days. The invitee accepts while signed in with that
--    e-mail address. Owners change roles and deactivate members; the last
--    active owner can never be removed. Every membership change is audited by
--    the existing trigger.
--
-- Rollback: supabase/rollback/20270327090000_security_work_context_missions_collaboration_rollback.sql
-- Suite:    supabase/tests/security_work_context_missions_test.sql
BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.can_manage(_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.is_human() AND EXISTS (
    SELECT 1 FROM public.sw_workspace_memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid() AND m.active AND m.role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. Operating profile (append-only) and personal presentation preference
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_operating_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  profile_version integer NOT NULL CHECK (profile_version > 0),
  schema_version text NOT NULL CHECK (schema_version IN ('sw-operating-profile-1')),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 65536),
  provenance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object' AND octet_length(provenance::text) <= 16384),
  change_note text NOT NULL DEFAULT '' CHECK (char_length(change_note) <= 2000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, profile_version)
);

CREATE FUNCTION sw_private.guard_operating_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'SW_PROFILE_VERSION_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  -- The next version only: a stale editor gets a conflict, never a fork.
  IF NEW.profile_version IS DISTINCT FROM coalesce((SELECT max(p.profile_version) FROM public.sw_operating_profiles p WHERE p.workspace_id = NEW.workspace_id), 0) + 1 THEN
    RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.sw_member_preferences (
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  role_focus text NOT NULL DEFAULT 'combined' CHECK (role_focus IN ('corporate_security', 'ciso', 'coordinator', 'event_lead', 'combined')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 2. Missions
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  -- Only the families that work end to end. Later packs add values here
  -- when they ship; nothing presents an inactive placeholder.
  kind text NOT NULL CHECK (kind IN ('monitoring_impact', 'risk_assessment', 'event_security')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  brief jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(brief) = 'object' AND octet_length(brief::text) <= 32768),
  execution_state text NOT NULL DEFAULT 'created' CHECK (execution_state IN ('created', 'collecting', 'waiting_for_input', 'ready', 'running', 'needs_review', 'completed', 'cancelled', 'failed', 'outcome_unknown')),
  review_state text NOT NULL DEFAULT 'not_started' CHECK (review_state IN ('not_started', 'in_review', 'accepted', 'changes_requested')),
  restricted boolean NOT NULL DEFAULT false,
  owner_id uuid,
  next_action text NOT NULL DEFAULT '' CHECK (char_length(next_action) <= 500),
  due_date date,
  operating_profile_version integer CHECK (operating_profile_version IS NULL OR operating_profile_version > 0),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, operating_profile_version) REFERENCES public.sw_operating_profiles(workspace_id, profile_version),
  -- A saved draft is not a completed mission: completion needs accepted review.
  CHECK (execution_state <> 'completed' OR review_state = 'accepted')
);
CREATE INDEX sw_missions_open ON public.sw_missions(workspace_id, execution_state, updated_at DESC);

CREATE TABLE public.sw_mission_members (
  workspace_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  user_id uuid NOT NULL,
  added_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, user_id),
  FOREIGN KEY (workspace_id, mission_id) REFERENCES public.sw_missions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, user_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);

CREATE FUNCTION sw_private.can_see_mission(_workspace_id uuid, _mission_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.can_read(_workspace_id) AND EXISTS (
    SELECT 1 FROM public.sw_missions m
    WHERE m.workspace_id = _workspace_id AND m.id = _mission_id
      AND (NOT m.restricted OR m.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.sw_mission_members mm WHERE mm.mission_id = m.id AND mm.user_id = auth.uid()))
  );
$$;

CREATE TABLE public.sw_mission_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('asset', 'risk', 'action', 'gap', 'source', 'source_item', 'assessment', 'report', 'management_report', 'requirement')),
  target_id uuid NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (mission_id, target_kind, target_id),
  FOREIGN KEY (workspace_id, mission_id) REFERENCES public.sw_missions(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE public.sw_mission_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  event text NOT NULL CHECK (event IN ('created', 'state_changed', 'review_changed', 'brief_changed', 'member_added', 'member_removed', 'link_added', 'link_removed', 'restriction_changed', 'owner_changed')),
  from_value text,
  to_value text,
  record_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, mission_id) REFERENCES public.sw_missions(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX sw_mission_events_mission ON public.sw_mission_events(mission_id, id);

-- Lifecycle and need-to-know rules for a mission row.
CREATE FUNCTION sw_private.guard_mission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  -- Only the creator or a workspace owner may open or close a mission's circle.
  IF NEW.restricted IS DISTINCT FROM OLD.restricted AND OLD.created_by IS DISTINCT FROM auth.uid() AND NOT sw_private.can_manage(NEW.workspace_id) THEN
    RAISE EXCEPTION 'SW_RESTRICTION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sw_private.record_mission_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'sw_missions' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.sw_mission_members(workspace_id, mission_id, user_id, added_by) VALUES (NEW.workspace_id, NEW.id, NEW.created_by, NEW.created_by);
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, to_value, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'created', NEW.execution_state, NEW.version);
      RETURN NULL;
    END IF;
    IF NEW.execution_state IS DISTINCT FROM OLD.execution_state THEN
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, from_value, to_value, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'state_changed', OLD.execution_state, NEW.execution_state, NEW.version);
    END IF;
    IF NEW.review_state IS DISTINCT FROM OLD.review_state THEN
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, from_value, to_value, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'review_changed', OLD.review_state, NEW.review_state, NEW.version);
    END IF;
    IF NEW.brief IS DISTINCT FROM OLD.brief OR NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'brief_changed', NEW.version);
    END IF;
    IF NEW.restricted IS DISTINCT FROM OLD.restricted THEN
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, from_value, to_value, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'restriction_changed', OLD.restricted::text, NEW.restricted::text, NEW.version);
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, record_version) VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'owner_changed', NEW.version);
    END IF;
  ELSIF TG_TABLE_NAME = 'sw_mission_links' THEN
    INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, to_value)
    VALUES (coalesce(NEW.workspace_id, OLD.workspace_id), coalesce(NEW.mission_id, OLD.mission_id), auth.uid(),
            CASE TG_OP WHEN 'INSERT' THEN 'link_added' ELSE 'link_removed' END, coalesce(NEW.target_kind, OLD.target_kind));
  END IF;
  RETURN NULL;
END $$;

-- A link must point at a record of that kind in the same workspace.
CREATE FUNCTION sw_private.guard_mission_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _exists boolean;
BEGIN
  IF NOT sw_private.can_edit(NEW.workspace_id) OR NOT sw_private.can_see_mission(NEW.workspace_id, NEW.mission_id) THEN
    RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE workspace_id = $1 AND id = $2)',
    CASE NEW.target_kind WHEN 'asset' THEN 'sw_protected_assets' WHEN 'risk' THEN 'sw_risks' WHEN 'action' THEN 'sw_actions'
      WHEN 'gap' THEN 'sw_gaps' WHEN 'source' THEN 'sw_sources' WHEN 'source_item' THEN 'sw_source_items'
      WHEN 'assessment' THEN 'sw_assessments' WHEN 'report' THEN 'sw_reports' WHEN 'management_report' THEN 'sw_management_reports'
      ELSE 'sw_intelligence_requirements' END)
    INTO _exists USING NEW.workspace_id, NEW.target_id;
  IF NOT _exists THEN RAISE EXCEPTION 'SW_LINK_TARGET_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'SW_CREATOR_MISMATCH' USING ERRCODE = '42501'; END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

-- Circle management: the creator, the mission owner or a workspace owner.
CREATE FUNCTION sw_private.set_mission_member(_workspace_id uuid, _mission_id uuid, _user_id uuid, _member boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.sw_missions;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.sw_missions WHERE workspace_id = _workspace_id AND id = _mission_id FOR UPDATE;
  IF m.id IS NULL OR NOT sw_private.can_see_mission(_workspace_id, _mission_id) THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF m.created_by IS DISTINCT FROM auth.uid() AND m.owner_id IS DISTINCT FROM auth.uid() AND NOT sw_private.can_manage(_workspace_id) THEN
    RAISE EXCEPTION 'SW_MISSION_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _member THEN
    IF NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships w WHERE w.workspace_id = _workspace_id AND w.user_id = _user_id AND w.active) THEN
      RAISE EXCEPTION 'SW_ACTIVE_MEMBER_REQUIRED' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.sw_mission_members(workspace_id, mission_id, user_id) VALUES (_workspace_id, _mission_id, _user_id) ON CONFLICT DO NOTHING;
    IF FOUND THEN INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event) VALUES (_workspace_id, _mission_id, auth.uid(), 'member_added'); END IF;
  ELSE
    IF _user_id = m.created_by THEN RAISE EXCEPTION 'SW_CREATOR_REMAINS_MEMBER' USING ERRCODE = '23514'; END IF;
    DELETE FROM public.sw_mission_members WHERE mission_id = _mission_id AND user_id = _user_id;
    IF FOUND THEN INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event) VALUES (_workspace_id, _mission_id, auth.uid(), 'member_removed'); END IF;
  END IF;
  RETURN _member;
END $$;
CREATE FUNCTION public.sw_set_mission_member(_workspace_id uuid, _mission_id uuid, _user_id uuid, _member boolean) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.set_mission_member(_workspace_id, _mission_id, _user_id, _member)$$;

-- -----------------------------------------------------------------------------
-- 3. Collaboration
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_invitations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1),
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  can_approve boolean NOT NULL DEFAULT false CHECK (NOT can_approve OR role = 'editor'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (workspace_id, id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX sw_one_open_invitation ON public.sw_invitations(workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Returns the code exactly once. The request id makes a retry safe: it gets the
-- same invitation back, but never the code again (only its hash is stored).
CREATE FUNCTION sw_private.create_invitation(_workspace_id uuid, _request_id uuid, _email text, _role text, _can_approve boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _code text; i public.sw_invitations; _normal text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF NOT sw_private.can_manage(_workspace_id) THEN RAISE EXCEPTION 'SW_OWNER_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.sw_invitations WHERE id = _request_id;
  IF FOUND THEN
    IF i.workspace_id <> _workspace_id OR i.email <> _normal OR i.role <> _role OR i.can_approve <> _can_approve OR i.invited_by <> auth.uid() THEN
      RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('id', i.id, 'code', NULL, 'expires_at', i.expires_at);
  END IF;
  IF EXISTS (SELECT 1 FROM public.sw_workspace_memberships m JOIN auth.users u ON u.id = m.user_id
             WHERE m.workspace_id = _workspace_id AND m.active AND lower(u.email) = _normal) THEN
    RAISE EXCEPTION 'SW_ALREADY_MEMBER' USING ERRCODE = '23514';
  END IF;
  _code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.sw_invitations(id, workspace_id, email, role, can_approve, token_hash, invited_by, expires_at)
  VALUES (_request_id, _workspace_id, _normal, _role, coalesce(_can_approve, false), sw_private.hash_text(_code), auth.uid(), now() + interval '7 days')
  RETURNING * INTO i;
  RETURN jsonb_build_object('id', i.id, 'code', _code, 'expires_at', i.expires_at);
END $$;
CREATE FUNCTION public.sw_create_invitation(_workspace_id uuid, _request_id uuid, _email text, _role text, _can_approve boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.create_invitation(_workspace_id, _request_id, _email, _role, _can_approve)$$;

-- Accepting: a signed-in person whose account e-mail is the invited address.
-- Every failure is the same answer, so a guessed code learns nothing.
CREATE FUNCTION sw_private.accept_invitation(_code text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE i public.sw_invitations; _email text;
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO i FROM public.sw_invitations WHERE token_hash = sw_private.hash_text(coalesce(_code, '')) FOR UPDATE;
  IF i.id IS NULL OR i.email IS DISTINCT FROM _email OR i.revoked_at IS NOT NULL
     OR (i.accepted_at IS NULL AND i.expires_at <= now())
     OR (i.accepted_by IS NOT NULL AND i.accepted_by <> auth.uid()) THEN
    RAISE EXCEPTION 'SW_INVITATION_INVALID' USING ERRCODE = '42501';
  END IF;
  IF i.accepted_by = auth.uid() THEN RETURN i.workspace_id; END IF;
  INSERT INTO public.sw_workspace_memberships(workspace_id, user_id, role, can_approve, active)
  VALUES (i.workspace_id, auth.uid(), i.role, i.can_approve, true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, can_approve = EXCLUDED.can_approve, active = true, updated_at = now()
  WHERE public.sw_workspace_memberships.role <> 'owner';
  UPDATE public.sw_invitations SET accepted_by = auth.uid(), accepted_at = now() WHERE id = i.id;
  RETURN i.workspace_id;
END $$;
CREATE FUNCTION public.sw_accept_invitation(_code text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.accept_invitation(_code)$$;

CREATE FUNCTION sw_private.revoke_invitation(_workspace_id uuid, _invitation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT sw_private.can_manage(_workspace_id) THEN RAISE EXCEPTION 'SW_OWNER_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.sw_invitations SET revoked_at = now()
   WHERE workspace_id = _workspace_id AND id = _invitation_id AND accepted_at IS NULL AND revoked_at IS NULL;
  RETURN FOUND;
END $$;
CREATE FUNCTION public.sw_revoke_invitation(_workspace_id uuid, _invitation_id uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.revoke_invitation(_workspace_id, _invitation_id)$$;

-- Roles and deactivation. A presentation choice never reaches here.
CREATE FUNCTION sw_private.set_member_role(_workspace_id uuid, _user_id uuid, _role text, _can_approve boolean, _active boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT sw_private.can_manage(_workspace_id) THEN RAISE EXCEPTION 'SW_OWNER_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _role NOT IN ('owner', 'editor', 'viewer') OR (_can_approve AND _role = 'viewer') THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  -- Serialise owner changes so two owners cannot demote each other at once.
  PERFORM 1 FROM public.sw_workspaces WHERE id = _workspace_id FOR UPDATE;
  UPDATE public.sw_workspace_memberships SET role = _role, can_approve = _can_approve, active = _active, updated_at = now()
   WHERE workspace_id = _workspace_id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships WHERE workspace_id = _workspace_id AND role = 'owner' AND active) THEN
    RAISE EXCEPTION 'SW_LAST_OWNER' USING ERRCODE = '23514';
  END IF;
  RETURN true;
END $$;
CREATE FUNCTION public.sw_set_member_role(_workspace_id uuid, _user_id uuid, _role text, _can_approve boolean, _active boolean) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.set_member_role(_workspace_id, _user_id, _role, _can_approve, _active)$$;

-- Members see who else is in the workspace (e-mail, role); owners also see
-- open invitations. No other auth.users field is exposed.
CREATE FUNCTION sw_private.list_members(_workspace_id uuid) RETURNS TABLE (user_id uuid, email text, role text, active boolean, can_approve boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id, u.email::text, m.role, m.active, m.can_approve
  FROM public.sw_workspace_memberships m JOIN auth.users u ON u.id = m.user_id
  WHERE m.workspace_id = _workspace_id AND sw_private.can_read(_workspace_id)
    AND (m.active OR sw_private.can_manage(_workspace_id))
  ORDER BY m.role, u.email;
$$;
CREATE FUNCTION public.sw_list_members(_workspace_id uuid) RETURNS TABLE (user_id uuid, email text, role text, active boolean, can_approve boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$SELECT * FROM sw_private.list_members(_workspace_id)$$;

-- -----------------------------------------------------------------------------
-- 4. Privileges, policies, triggers
-- -----------------------------------------------------------------------------
DO $security$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['sw_operating_profiles', 'sw_member_preferences', 'sw_missions', 'sw_mission_members', 'sw_mission_links', 'sw_mission_events', 'sw_invitations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', _table);
    EXECUTE format('CREATE INDEX %I ON public.%I (workspace_id)', _table || '_scope_idx', _table);
  END LOOP;
END
$security$;

GRANT SELECT, INSERT ON public.sw_operating_profiles TO authenticated;
CREATE POLICY sw_member_read ON public.sw_operating_profiles FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_operating_profiles FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE TRIGGER sw_10_guard BEFORE INSERT ON public.sw_operating_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_20_profile BEFORE INSERT OR UPDATE OR DELETE ON public.sw_operating_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.guard_operating_profile();
CREATE TRIGGER sw_90_audit AFTER INSERT ON public.sw_operating_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

GRANT SELECT, INSERT, UPDATE (role_focus, updated_at) ON public.sw_member_preferences TO authenticated;
CREATE POLICY sw_own_preferences ON public.sw_member_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND sw_private.can_read(workspace_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND sw_private.can_read(workspace_id));

GRANT SELECT, INSERT, UPDATE ON public.sw_missions TO authenticated;
CREATE POLICY sw_mission_read ON public.sw_missions FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND (NOT restricted OR created_by = (SELECT auth.uid()) OR sw_private.can_see_mission(workspace_id, id)));
CREATE POLICY sw_mission_insert ON public.sw_missions FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_mission_update ON public.sw_missions FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_mission(workspace_id, id))
  WITH CHECK (sw_private.can_edit(workspace_id));
CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_missions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_20_mission BEFORE INSERT OR UPDATE ON public.sw_missions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_mission();
CREATE TRIGGER sw_80_events AFTER INSERT OR UPDATE ON public.sw_missions FOR EACH ROW EXECUTE FUNCTION sw_private.record_mission_event();

GRANT SELECT ON public.sw_mission_members TO authenticated;
CREATE POLICY sw_mission_member_read ON public.sw_mission_members FOR SELECT TO authenticated USING (sw_private.can_see_mission(workspace_id, mission_id));

GRANT SELECT, INSERT, DELETE ON public.sw_mission_links TO authenticated;
CREATE POLICY sw_mission_link_read ON public.sw_mission_links FOR SELECT TO authenticated USING (sw_private.can_see_mission(workspace_id, mission_id));
CREATE POLICY sw_mission_link_insert ON public.sw_mission_links FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_mission(workspace_id, mission_id));
CREATE POLICY sw_mission_link_delete ON public.sw_mission_links FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_mission(workspace_id, mission_id));
CREATE TRIGGER sw_10_link BEFORE INSERT ON public.sw_mission_links FOR EACH ROW EXECUTE FUNCTION sw_private.guard_mission_link();
CREATE TRIGGER sw_80_events AFTER INSERT OR DELETE ON public.sw_mission_links FOR EACH ROW EXECUTE FUNCTION sw_private.record_mission_event();

GRANT SELECT ON public.sw_mission_events TO authenticated;
CREATE POLICY sw_mission_event_read ON public.sw_mission_events FOR SELECT TO authenticated USING (sw_private.can_see_mission(workspace_id, mission_id));
CREATE TRIGGER sw_00_immutable BEFORE UPDATE ON public.sw_mission_events FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();

-- Owners read invitations without the code hash; nobody writes them directly.
GRANT SELECT (id, workspace_id, email, role, can_approve, invited_by, created_at, expires_at, accepted_by, accepted_at, revoked_at) ON public.sw_invitations TO authenticated;
CREATE POLICY sw_owner_read ON public.sw_invitations FOR SELECT TO authenticated USING (sw_private.can_manage(workspace_id));

REVOKE ALL ON FUNCTION sw_private.can_manage(uuid), sw_private.guard_operating_profile(), sw_private.can_see_mission(uuid, uuid),
  sw_private.guard_mission(), sw_private.record_mission_event(), sw_private.guard_mission_link(),
  sw_private.set_mission_member(uuid, uuid, uuid, boolean), sw_private.create_invitation(uuid, uuid, text, text, boolean),
  sw_private.accept_invitation(text), sw_private.revoke_invitation(uuid, uuid), sw_private.set_member_role(uuid, uuid, text, boolean, boolean),
  sw_private.list_members(uuid),
  public.sw_set_mission_member(uuid, uuid, uuid, boolean), public.sw_create_invitation(uuid, uuid, text, text, boolean),
  public.sw_accept_invitation(text), public.sw_revoke_invitation(uuid, uuid), public.sw_set_member_role(uuid, uuid, text, boolean, boolean),
  public.sw_list_members(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sw_private.can_manage(uuid), sw_private.can_see_mission(uuid, uuid),
  sw_private.set_mission_member(uuid, uuid, uuid, boolean), sw_private.create_invitation(uuid, uuid, text, text, boolean),
  sw_private.accept_invitation(text), sw_private.revoke_invitation(uuid, uuid), sw_private.set_member_role(uuid, uuid, text, boolean, boolean),
  sw_private.list_members(uuid),
  public.sw_set_mission_member(uuid, uuid, uuid, boolean), public.sw_create_invitation(uuid, uuid, text, text, boolean),
  public.sw_accept_invitation(text), public.sw_revoke_invitation(uuid, uuid), public.sw_set_member_role(uuid, uuid, text, boolean, boolean),
  public.sw_list_members(uuid)
  TO authenticated;

COMMENT ON TABLE public.sw_operating_profiles IS 'Append-only operating context. profile_version = previous + 1; unknown schema versions refused. Provenance per field beside the content.';
COMMENT ON TABLE public.sw_member_preferences IS 'A person''s presentation choice (role focus). Read and written only by that person; grants no permission.';
COMMENT ON TABLE public.sw_missions IS 'An assignment. Execution state, review state and linked business-record lifecycles are separate. restricted = visible to members only (RLS).';
COMMENT ON TABLE public.sw_mission_events IS 'Mission history, scoped by mission visibility so a restricted mission does not leak through the workspace audit feed.';
COMMENT ON TABLE public.sw_invitations IS 'Owner-issued invitations. The one-time code is shown once to the owner and stored only as a hash; nothing is sent by the system.';
COMMENT ON TABLE public.sw_workspace_memberships IS 'Explicit Security Work membership. Owners invite (sw_create_invitation / sw_accept_invitation) and change roles (sw_set_member_role); the last active owner cannot be removed. Every change is audited.';

COMMIT;
