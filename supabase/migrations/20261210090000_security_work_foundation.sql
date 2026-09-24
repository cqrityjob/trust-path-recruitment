-- Created by `supabase migration new security_work_foundation` as
-- 20260923194418_security_work_foundation.sql; moved to the next canonical
-- ledger slot under docs/release/release-sequence.md (the ledger leads clock).
-- Security Intelligence PR A: isolated, human-authored, manual-source foundation.
-- No network retrieval, AI execution, Storage, invitations or external sharing.

BEGIN;

CREATE SCHEMA sw_private;
REVOKE ALL ON SCHEMA sw_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sw_private TO authenticated;

CREATE TABLE public.sw_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'organisation')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  language text NOT NULL DEFAULT 'sv' CHECK (language IN ('sv', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX sw_one_personal_workspace ON public.sw_workspaces(owner_user_id) WHERE kind = 'personal';

CREATE TABLE public.sw_workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  active boolean NOT NULL DEFAULT true,
  can_approve boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CHECK (NOT can_approve OR role IN ('owner', 'editor'))
);
CREATE INDEX sw_memberships_user_active ON public.sw_workspace_memberships(user_id, workspace_id) WHERE active;

CREATE TABLE public.sw_monitoring_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.sw_workspaces(id),
  sector text NOT NULL DEFAULT '',
  countries text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  important_locations text[] NOT NULL DEFAULT '{}',
  important_functions text[] NOT NULL DEFAULT '{}',
  critical_operations text[] NOT NULL DEFAULT '{}',
  assets text[] NOT NULL DEFAULT '{}',
  threat_categories text[] NOT NULL DEFAULT '{}',
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'manual')),
  decisions_supported text NOT NULL DEFAULT '',
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

CREATE TABLE public.sw_intelligence_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 2000),
  decision_supported text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  horizon_days integer NOT NULL DEFAULT 30 CHECK (horizon_days BETWEEN 1 AND 365),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id)
);

CREATE TABLE public.sw_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  publisher text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'url_reference')),
  canonical_url text CHECK (canonical_url IS NULL OR (canonical_url ~ '^https://[^[:space:]]+$' AND char_length(canonical_url) <= 2048)),
  language text NOT NULL DEFAULT 'sv' CHECK (char_length(language) BETWEEN 2 AND 20),
  geography text[] NOT NULL DEFAULT '{}',
  topics text[] NOT NULL DEFAULT '{}',
  reliability_category text NOT NULL DEFAULT 'unverified' CHECK (reliability_category IN ('official', 'professional', 'observation', 'unverified')),
  active boolean NOT NULL DEFAULT true,
  usage_notes text NOT NULL DEFAULT '',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK (source_type <> 'url_reference' OR canonical_url IS NOT NULL)
);
COMMENT ON COLUMN public.sw_sources.canonical_url IS 'Reference only. No retrieval is enabled. A future fetcher requires DNS/redirect/private-network validation; this format constraint is not an SSRF defence.';

CREATE TABLE public.sw_source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_id uuid NOT NULL,
  deduplication_key text NOT NULL CHECK (char_length(btrim(deduplication_key)) BETWEEN 1 AND 200),
  original_title text NOT NULL CHECK (char_length(btrim(original_title)) BETWEEN 1 AND 500),
  publisher text NOT NULL DEFAULT '',
  canonical_url text CHECK (canonical_url IS NULL OR (canonical_url ~ '^https://[^[:space:]]+$' AND char_length(canonical_url) <= 2048)),
  author text,
  published_at timestamptz,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  factual_extract text NOT NULL CHECK (char_length(btrim(factual_extract)) BETWEEN 1 AND 65536),
  language text NOT NULL DEFAULT 'sv' CHECK (char_length(language) BETWEEN 2 AND 20),
  geography text[] NOT NULL DEFAULT '{}',
  retrieval_status text NOT NULL DEFAULT 'manual' CHECK (retrieval_status = 'manual'),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_id, deduplication_key),
  FOREIGN KEY (workspace_id, source_id) REFERENCES public.sw_sources(workspace_id, id)
);
COMMENT ON TABLE public.sw_source_items IS 'Append-only source facts. Source text is untrusted data, never an instruction or executable markup.';

CREATE TABLE public.sw_intelligence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_item_id uuid NOT NULL,
  requirement_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'relevant', 'dismissed', 'promoted')),
  urgency text NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'soon', 'urgent')),
  human_rationale text NOT NULL DEFAULT '' CHECK (octet_length(human_rationale) <= 2000),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_item_id),
  FOREIGN KEY (workspace_id, source_item_id) REFERENCES public.sw_source_items(workspace_id, id),
  FOREIGN KEY (workspace_id, requirement_id) REFERENCES public.sw_intelligence_requirements(workspace_id, id),
  CHECK (status = 'pending' OR btrim(human_rationale) <> ''),
  CHECK ((status = 'pending' AND decided_by IS NULL AND decided_at IS NULL) OR
         (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE public.sw_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  intelligence_item_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  situation text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT '',
  affected_activity text NOT NULL DEFAULT '',
  assets text NOT NULL DEFAULT '',
  threat text NOT NULL DEFAULT '',
  vulnerability text NOT NULL DEFAULT '',
  existing_controls text NOT NULL DEFAULT '',
  likelihood smallint CHECK (likelihood BETWEEN 1 AND 5),
  consequence smallint CHECK (consequence BETWEEN 1 AND 5),
  uncertainty text NOT NULL DEFAULT '',
  assumptions text NOT NULL DEFAULT '',
  proposed_measures text NOT NULL DEFAULT '',
  professional_conclusion text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'archived')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, intelligence_item_id) REFERENCES public.sw_intelligence_items(workspace_id, id),
  CHECK ((status IN ('draft', 'in_review') AND approved_by IS NULL AND approved_at IS NULL) OR
         (status IN ('approved', 'archived') AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.sw_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  assessment_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '',
  affected_assets text NOT NULL DEFAULT '',
  likelihood smallint NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  consequence smallint NOT NULL CHECK (consequence BETWEEN 1 AND 5),
  uncertainty text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'closed')),
  decision_rationale text NOT NULL DEFAULT '',
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, assessment_id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  CHECK ((status = 'proposed' AND accepted_by IS NULL AND accepted_at IS NULL) OR
         (status IN ('accepted', 'closed') AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE TABLE public.sw_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  risk_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '',
  effectiveness text NOT NULL DEFAULT 'unknown' CHECK (effectiveness IN ('unknown', 'limited', 'adequate', 'strong')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, risk_id) REFERENCES public.sw_risks(workspace_id, id)
);

CREATE TABLE public.sw_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  assessment_id uuid NOT NULL,
  risk_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  description text NOT NULL DEFAULT '',
  assignee_user_id uuid,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  decision_rationale text NOT NULL DEFAULT '',
  completion_evidence text NOT NULL DEFAULT '',
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, risk_id, assessment_id) REFERENCES public.sw_risks(workspace_id, id, assessment_id),
  FOREIGN KEY (workspace_id, assignee_user_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id),
  CHECK ((status IN ('open', 'in_progress', 'blocked') AND closed_by IS NULL AND closed_at IS NULL) OR
         (status IN ('completed', 'cancelled') AND closed_by IS NOT NULL AND closed_at IS NOT NULL))
);

CREATE TABLE public.sw_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  assessment_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  report_type text NOT NULL DEFAULT 'security_assessment' CHECK (report_type IN ('briefing', 'security_assessment', 'risk_report')),
  language text NOT NULL DEFAULT 'sv' CHECK (language IN ('sv', 'en')),
  executive_summary text NOT NULL DEFAULT '',
  overall_description text NOT NULL DEFAULT '',
  risk_assessment text NOT NULL DEFAULT '',
  identified_risks text NOT NULL DEFAULT '',
  security_arrangement text NOT NULL DEFAULT '',
  preparedness_incident_management text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  contacts text NOT NULL DEFAULT '',
  uncertainty text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'exported', 'archived')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  CHECK ((status = 'draft' AND approved_by IS NULL AND approved_at IS NULL) OR
         (status IN ('approved', 'exported', 'archived') AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.sw_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_item_id uuid NOT NULL,
  intelligence_item_id uuid,
  assessment_id uuid,
  risk_id uuid,
  report_id uuid,
  claim text NOT NULL CHECK (char_length(btrim(claim)) BETWEEN 1 AND 4000),
  excerpt text NOT NULL CHECK (char_length(btrim(excerpt)) BETWEEN 1 AND 8000),
  locator text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  CHECK (num_nonnulls(intelligence_item_id, assessment_id, risk_id, report_id) = 1),
  FOREIGN KEY (workspace_id, source_item_id) REFERENCES public.sw_source_items(workspace_id, id),
  FOREIGN KEY (workspace_id, intelligence_item_id) REFERENCES public.sw_intelligence_items(workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, risk_id) REFERENCES public.sw_risks(workspace_id, id),
  FOREIGN KEY (workspace_id, report_id) REFERENCES public.sw_reports(workspace_id, id)
);

CREATE TABLE public.sw_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  purpose text NOT NULL CHECK (purpose IN ('summarise', 'explain_relevance', 'compare_sources', 'identify_uncertainty', 'draft_assessment', 'suggest_actions', 'draft_report', 'quality_review')),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 160),
  template_version text NOT NULL CHECK (char_length(template_version) BETWEEN 1 AND 80),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  source_item_id uuid,
  assessment_id uuid,
  report_id uuid,
  structured_output jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cost_usd numeric(12,6) CHECK (cost_usd >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  CHECK (num_nonnulls(source_item_id, assessment_id, report_id) >= 1),
  CHECK (structured_output IS NULL OR (jsonb_typeof(structured_output) = 'object' AND octet_length(structured_output::text) <= 131072)),
  FOREIGN KEY (workspace_id, source_item_id) REFERENCES public.sw_source_items(workspace_id, id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, report_id) REFERENCES public.sw_reports(workspace_id, id),
  FOREIGN KEY (workspace_id, requested_by) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);
COMMENT ON TABLE public.sw_ai_runs IS 'Provenance contract only. No app or service writes in PR A. Future activation requires a narrow validated draft-only adapter, quota enforcement and provider review.';
ALTER TABLE public.sw_intelligence_items ADD COLUMN ai_run_id uuid;
ALTER TABLE public.sw_intelligence_items ADD CONSTRAINT sw_intelligence_ai_run_fk FOREIGN KEY (workspace_id, ai_run_id) REFERENCES public.sw_ai_runs(workspace_id, id);

CREATE TABLE public.sw_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_status text,
  new_status text,
  record_version integer,
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sw_audit_events IS 'Trigger-owned append-only event metadata, not a polymorphic authorisation or content join. Scope is always its own workspace_id.';

CREATE TABLE public.sw_record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  assessment_id uuid,
  risk_id uuid,
  action_id uuid,
  report_id uuid,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 262144),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(assessment_id, risk_id, action_id, report_id) = 1),
  UNIQUE (workspace_id, assessment_id, version),
  UNIQUE (workspace_id, risk_id, version),
  UNIQUE (workspace_id, action_id, version),
  UNIQUE (workspace_id, report_id, version),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES public.sw_assessments(workspace_id, id),
  FOREIGN KEY (workspace_id, risk_id) REFERENCES public.sw_risks(workspace_id, id),
  FOREIGN KEY (workspace_id, action_id) REFERENCES public.sw_actions(workspace_id, id),
  FOREIGN KEY (workspace_id, report_id) REFERENCES public.sw_reports(workspace_id, id)
);

-- Definer predicates read protected memberships without recursive RLS. No caller-
-- supplied user identity and no career/employer/Passport relationship is consulted.
CREATE FUNCTION sw_private.is_human() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND auth.jwt()->>'role' = 'authenticated'
    AND coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
    AND coalesce(current_setting('role', true), '') <> 'service_role'
    AND EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
        AND coalesce(to_jsonb(u)->>'is_anonymous', 'false') = 'false'
        AND (to_jsonb(u)->>'deleted_at') IS NULL
        AND ((to_jsonb(u)->>'banned_until') IS NULL OR (to_jsonb(u)->>'banned_until')::timestamptz <= now())
    );
$$;
CREATE FUNCTION sw_private.can_read(_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.is_human() AND EXISTS (
    SELECT 1 FROM public.sw_workspace_memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid() AND m.active
  );
$$;
CREATE FUNCTION sw_private.can_edit(_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.is_human() AND EXISTS (
    SELECT 1 FROM public.sw_workspace_memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid() AND m.active AND m.role IN ('owner', 'editor')
  );
$$;
CREATE FUNCTION sw_private.can_approve(_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.is_human() AND EXISTS (
    SELECT 1 FROM public.sw_workspace_memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid() AND m.active AND m.can_approve AND m.role IN ('owner', 'editor')
  );
$$;

CREATE FUNCTION sw_private.create_personal_workspace(_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _workspace uuid;
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN
    RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'SW_WORKSPACE_NAME_REQUIRED' USING ERRCODE = '23514';
  END IF;
  -- Serialises same-user first-run requests; the unique index is the backstop.
  PERFORM 1 FROM auth.users u WHERE u.id = auth.uid() FOR UPDATE;
  SELECT w.id INTO _workspace FROM public.sw_workspaces w
    WHERE w.owner_user_id = auth.uid() AND w.kind = 'personal';
  IF _workspace IS NOT NULL THEN
    IF NOT sw_private.can_read(_workspace) THEN
      RAISE EXCEPTION 'SW_MEMBERSHIP_INACTIVE' USING ERRCODE = '42501';
    END IF;
    RETURN _workspace;
  END IF;
  INSERT INTO public.sw_workspaces (owner_user_id, name) VALUES (auth.uid(), btrim(_name)) RETURNING id INTO _workspace;
  INSERT INTO public.sw_workspace_memberships (workspace_id, user_id, role, can_approve)
    VALUES (_workspace, auth.uid(), 'owner', true);
  RETURN _workspace;
END;
$$;
CREATE FUNCTION public.sw_create_personal_workspace(_name text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT sw_private.create_personal_workspace(_name);
$$;

-- Ownership, creator, source and parent identities cannot be reassigned. Writes
-- are human-only, including when a future backend is granted draft privileges.
CREATE FUNCTION sw_private.guard_record() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _new jsonb; _old jsonb; _field text; _workspace uuid; _risk_status text;
BEGIN
  _new := to_jsonb(NEW); _old := to_jsonb(OLD);
  _workspace := CASE WHEN TG_TABLE_NAME = 'sw_workspaces' THEN (_new->>'id')::uuid ELSE (_new->>'workspace_id')::uuid END;
  IF NOT coalesce(sw_private.is_human(), false) THEN
    RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME <> 'sw_workspaces' AND NOT sw_private.can_edit(_workspace) THEN
    RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF octet_length(_new::text) > 131072 THEN
    RAISE EXCEPTION 'SW_RECORD_TOO_LARGE' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'sw_controls' THEN
    SELECT r.status INTO _risk_status FROM public.sw_risks r
      WHERE r.workspace_id = _workspace AND r.id = NEW.risk_id FOR UPDATE;
    IF _risk_status IS DISTINCT FROM 'proposed' THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTROLS_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF _new ? 'created_by' THEN
      IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'SW_CREATOR_MISMATCH' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF _new ? 'version' THEN NEW.version := 1; END IF;
    NEW.created_at := now();
  ELSE
    FOREACH _field IN ARRAY ARRAY['id', 'workspace_id', 'owner_user_id', 'kind', 'created_by', 'created_at', 'source_item_id', 'source_id', 'intelligence_item_id', 'assessment_id', 'risk_id', 'report_id', 'ai_run_id'] LOOP
      IF _new->_field IS DISTINCT FROM _old->_field THEN
        RAISE EXCEPTION 'SW_IMMUTABLE_FIELD: %', _field USING ERRCODE = '23514';
      END IF;
    END LOOP;
    IF _new ? 'version' THEN NEW.version := OLD.version + 1; END IF;
  END IF;
  IF _new ? 'updated_at' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION sw_private.guard_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _before text; _after text; _changed boolean; _old jsonb; _new jsonb;
BEGIN
  _after := NEW.status; _new := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'sw_actions' THEN
    IF NEW.assignee_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.assignee_user_id AND m.active) THEN
      RAISE EXCEPTION 'SW_ACTIVE_ASSIGNEE_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF _after <> (CASE TG_TABLE_NAME WHEN 'sw_intelligence_items' THEN 'pending' WHEN 'sw_risks' THEN 'proposed' WHEN 'sw_actions' THEN 'open' ELSE 'draft' END) THEN
      RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  _before := OLD.status; _old := to_jsonb(OLD); _changed := _after IS DISTINCT FROM _before;
  -- Stamp fields are never caller-editable, even on an otherwise valid transition.
  IF _new->'approved_by' IS DISTINCT FROM _old->'approved_by' OR _new->'approved_at' IS DISTINCT FROM _old->'approved_at'
      OR _new->'accepted_by' IS DISTINCT FROM _old->'accepted_by' OR _new->'accepted_at' IS DISTINCT FROM _old->'accepted_at'
      OR _new->'closed_by' IS DISTINCT FROM _old->'closed_by' OR _new->'closed_at' IS DISTINCT FROM _old->'closed_at'
      OR _new->'decided_by' IS DISTINCT FROM _old->'decided_by' OR _new->'decided_at' IS DISTINCT FROM _old->'decided_at' THEN
      RAISE EXCEPTION 'SW_DECISION_STAMP_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'sw_intelligence_items' THEN
    IF _changed AND NOT ((_before = 'pending' AND _after IN ('relevant', 'dismissed')) OR (_before = 'relevant' AND _after IN ('dismissed', 'promoted')) OR (_before = 'dismissed' AND _after = 'relevant')) THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    IF _before = 'promoted' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF NOT _changed AND _before <> 'pending' AND NEW.human_rationale IS DISTINCT FROM OLD.human_rationale THEN
      RAISE EXCEPTION 'SW_DECISION_RATIONALE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF _changed THEN
      IF btrim(NEW.human_rationale) = '' THEN RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514'; END IF;
      IF _after = 'promoted' AND NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.intelligence_item_id = NEW.id) THEN
        RAISE EXCEPTION 'SW_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      NEW.decided_by := auth.uid(); NEW.decided_at := now();
    END IF;
  ELSIF TG_TABLE_NAME IN ('sw_assessments', 'sw_reports') THEN
    IF _before IN ('approved', 'exported', 'archived') AND NOT _changed THEN
      RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
    END IF;
    IF _before IN ('approved', 'exported', 'archived') AND
      (_new - ARRAY['status', 'version', 'updated_at']) IS DISTINCT FROM (_old - ARRAY['status', 'version', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'sw_assessments' THEN
      IF _changed AND NOT ((_before = 'draft' AND _after = 'in_review') OR (_before = 'in_review' AND _after IN ('draft', 'approved')) OR (_before = 'approved' AND _after = 'archived')) THEN
        RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF _changed AND NOT ((_before = 'draft' AND _after = 'approved') OR (_before = 'approved' AND _after IN ('exported', 'archived')) OR (_before = 'exported' AND _after = 'archived')) THEN
        RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF _before = 'archived' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed AND _after IN ('approved', 'exported', 'archived') AND NOT sw_private.can_approve(NEW.workspace_id) THEN
      RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF _changed AND _after = 'approved' THEN
      IF TG_TABLE_NAME = 'sw_assessments' THEN
        IF btrim(NEW.professional_conclusion) = '' OR NEW.likelihood IS NULL OR NEW.consequence IS NULL THEN
          RAISE EXCEPTION 'SW_ASSESSMENT_CONCLUSION_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_citations c WHERE c.workspace_id = NEW.workspace_id AND c.assessment_id = NEW.id) THEN
          RAISE EXCEPTION 'SW_CITATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF btrim(NEW.executive_summary) = '' OR btrim(NEW.conclusion) = '' OR
          (NEW.report_type <> 'briefing' AND (btrim(NEW.overall_description) = '' OR btrim(NEW.risk_assessment) = '' OR btrim(NEW.identified_risks) = '' OR btrim(NEW.security_arrangement) = '' OR btrim(NEW.preparedness_incident_management) = '' OR btrim(NEW.contacts) = '')) THEN
          RAISE EXCEPTION 'SW_REPORT_SECTIONS_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.assessment_id AND a.status = 'approved') THEN
          RAISE EXCEPTION 'SW_APPROVED_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sw_citations c WHERE c.workspace_id = NEW.workspace_id AND c.report_id = NEW.id) THEN
          RAISE EXCEPTION 'SW_CITATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
      END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    END IF;
  ELSIF TG_TABLE_NAME = 'sw_risks' THEN
    IF _changed AND NOT ((_before = 'proposed' AND _after = 'accepted') OR (_before = 'accepted' AND _after = 'closed')) THEN
      RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    IF _before IN ('accepted', 'closed') AND (_new - ARRAY['status', 'decision_rationale', 'version', 'updated_at']) IS DISTINCT FROM (_old - ARRAY['status', 'decision_rationale', 'version', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF _before = 'closed' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      IF btrim(NEW.decision_rationale) = '' THEN RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514'; END IF;
      IF _after = 'accepted' THEN
        IF NOT EXISTS (SELECT 1 FROM public.sw_assessments a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.assessment_id AND a.status = 'approved') THEN
          RAISE EXCEPTION 'SW_APPROVED_ASSESSMENT_REQUIRED' USING ERRCODE = '23514';
        END IF;
        NEW.accepted_by := auth.uid(); NEW.accepted_at := now();
      END IF;
    ELSIF _before = 'accepted' AND NEW.decision_rationale IS DISTINCT FROM OLD.decision_rationale THEN
      RAISE EXCEPTION 'SW_APPROVED_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    ELSIF _before = 'accepted' THEN
      RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'sw_actions' THEN
    IF _before IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
    IF _changed AND _after IN ('completed', 'cancelled', 'blocked') AND btrim(NEW.decision_rationale) = '' THEN
      RAISE EXCEPTION 'SW_DECISION_RATIONALE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF _changed AND _after = 'completed' AND btrim(NEW.completion_evidence) = '' THEN
      RAISE EXCEPTION 'SW_COMPLETION_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF _changed AND _after IN ('completed', 'cancelled') THEN NEW.closed_by := auth.uid(); NEW.closed_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Parent row locks serialize citation mutation against approval, so a concurrent
-- delete cannot remove the last citation after the approval check has passed.
CREATE FUNCTION sw_private.guard_citation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _row public.sw_citations; _status text; _extract text;
BEGIN
  IF TG_OP = 'DELETE' THEN _row := OLD; ELSE _row := NEW; END IF;
  IF NOT sw_private.can_edit(_row.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _row.assessment_id IS NOT NULL THEN
    SELECT a.status INTO _status FROM public.sw_assessments a WHERE a.workspace_id = _row.workspace_id AND a.id = _row.assessment_id FOR UPDATE;
    IF _status IN ('approved', 'archived') THEN RAISE EXCEPTION 'SW_APPROVED_CITATIONS_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  ELSIF _row.report_id IS NOT NULL THEN
    SELECT r.status INTO _status FROM public.sw_reports r WHERE r.workspace_id = _row.workspace_id AND r.id = _row.report_id FOR UPDATE;
    IF _status IN ('approved', 'exported', 'archived') THEN RAISE EXCEPTION 'SW_APPROVED_CITATIONS_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  ELSIF _row.risk_id IS NOT NULL THEN
    SELECT r.status INTO _status FROM public.sw_risks r WHERE r.workspace_id = _row.workspace_id AND r.id = _row.risk_id FOR UPDATE;
    IF _status IN ('accepted', 'closed') THEN RAISE EXCEPTION 'SW_APPROVED_CITATIONS_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  ELSE
    SELECT i.status INTO _status FROM public.sw_intelligence_items i WHERE i.workspace_id = _row.workspace_id AND i.id = _row.intelligence_item_id FOR UPDATE;
    IF _status = 'promoted' THEN RAISE EXCEPTION 'SW_APPROVED_CITATIONS_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  END IF;
  IF _status IS NULL THEN RAISE EXCEPTION 'SW_CITATION_TARGET_REQUIRED' USING ERRCODE = '23503'; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT s.factual_extract INTO _extract FROM public.sw_source_items s WHERE s.workspace_id = _row.workspace_id AND s.id = _row.source_item_id;
    IF _extract IS NULL OR position(_row.excerpt IN _extract) = 0 THEN
      RAISE EXCEPTION 'SW_CITATION_EXCERPT_NOT_IN_SOURCE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN _row;
END;
$$;

-- Protected log writer: definer is required because callers may not append,
-- rewrite or remove audit/version rows. It is not exposed or executable by them.
CREATE FUNCTION sw_private.record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  INSERT INTO public.sw_audit_events (workspace_id, actor_user_id, entity_table, entity_id, operation, old_status, new_status, record_version, details)
    VALUES (_workspace, auth.uid(), TG_TABLE_NAME, _entity, TG_OP, to_jsonb(OLD)->>'status', to_jsonb(NEW)->>'status', (_row->>'version')::integer, _details);
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
$$;

CREATE FUNCTION sw_private.reject_history_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'SW_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

-- Privileges are explicit; Supabase default grants must not activate service AI.
DO $security$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['sw_workspaces', 'sw_workspace_memberships', 'sw_monitoring_profiles', 'sw_intelligence_requirements', 'sw_sources', 'sw_source_items', 'sw_intelligence_items', 'sw_assessments', 'sw_risks', 'sw_controls', 'sw_actions', 'sw_reports', 'sw_citations', 'sw_ai_runs', 'sw_audit_events', 'sw_record_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', _table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', _table);
    EXECUTE format('CREATE POLICY sw_member_read ON public.%I FOR SELECT TO authenticated USING (sw_private.can_read(%I))', _table, CASE WHEN _table = 'sw_workspaces' THEN 'id' ELSE 'workspace_id' END);
    EXECUTE format('CREATE INDEX %I ON public.%I (%I)', _table || '_scope_idx', _table, CASE WHEN _table = 'sw_workspaces' THEN 'owner_user_id' ELSE 'workspace_id' END);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_monitoring_profiles', 'sw_intelligence_requirements', 'sw_sources', 'sw_source_items', 'sw_intelligence_items', 'sw_assessments', 'sw_risks', 'sw_controls', 'sw_actions', 'sw_reports', 'sw_citations'] LOOP
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO authenticated', _table);
    EXECUTE format('CREATE POLICY sw_editor_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id))', _table);
    IF _table NOT IN ('sw_source_items', 'sw_citations') THEN
      EXECUTE format('GRANT UPDATE ON TABLE public.%I TO authenticated', _table);
      EXECUTE format('CREATE POLICY sw_editor_update ON public.%I FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id))', _table);
    END IF;
    EXECUTE format('CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record()', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_intelligence_requirements', 'sw_citations'] LOOP
    EXECUTE format('GRANT DELETE ON TABLE public.%I TO authenticated', _table);
    EXECUTE format('CREATE POLICY sw_editor_delete ON public.%I FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id))', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_intelligence_items', 'sw_assessments', 'sw_risks', 'sw_actions', 'sw_reports'] LOOP
    EXECUTE format('CREATE TRIGGER sw_20_lifecycle BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.guard_lifecycle()', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_workspaces', 'sw_workspace_memberships', 'sw_monitoring_profiles', 'sw_intelligence_requirements', 'sw_sources', 'sw_source_items', 'sw_intelligence_items', 'sw_assessments', 'sw_risks', 'sw_controls', 'sw_actions', 'sw_reports', 'sw_citations'] LOOP
    EXECUTE format('CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.record_change()', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_source_items', 'sw_audit_events', 'sw_record_versions'] LOOP
    EXECUTE format('CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change()', _table);
  END LOOP;
END;
$security$;
CREATE TRIGGER sw_20_citation BEFORE INSERT OR UPDATE OR DELETE ON public.sw_citations FOR EACH ROW EXECUTE FUNCTION sw_private.guard_citation();
CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_workspaces FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
GRANT UPDATE (name, language) ON public.sw_workspaces TO authenticated;
CREATE POLICY sw_owner_update ON public.sw_workspaces FOR UPDATE TO authenticated
  USING (sw_private.can_edit(id) AND owner_user_id = (SELECT auth.uid()))
  WITH CHECK (sw_private.can_edit(id) AND owner_user_id = (SELECT auth.uid()));

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sw_private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sw_private.is_human(), sw_private.can_read(uuid), sw_private.can_edit(uuid), sw_private.can_approve(uuid), sw_private.create_personal_workspace(text) TO authenticated;
REVOKE ALL ON FUNCTION public.sw_create_personal_workspace(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sw_create_personal_workspace(text) TO authenticated;

COMMENT ON TABLE public.sw_workspaces IS 'Security Work boundary. No employer, candidate, application, Career or Passport relationship grants access.';
COMMENT ON TABLE public.sw_workspace_memberships IS 'Explicit Security Work membership only. Personal workspace bootstrap creates one owner with approval; no invitation or membership-write API in PR A.';
COMMENT ON TABLE public.sw_reports IS 'Eight formal-report sections are persisted human work. Approved content/citations are immutable; exports must use the exact approved snapshot. No distribution endpoint.';

COMMIT;
