-- Security Work: the supplier cycle (technical vision plan v1, stages A-B).
-- Forward migration on the installed 20270329090000; nothing earlier is edited.
--
-- From an observation to a verified improvement, on the existing objects:
-- 1. A supplier is an asset of category 'suppliers' with a profile (internal
--    owner, contact route, services, active/ended). Typed, FK-safe relations
--    between assets (supplied by, depends on, located at, runs on) carry who
--    confirmed them. A risk-asset link records whether the impact is
--    confirmed, unconfirmed or ruled out.
-- 2. Contracts are immutable versions; a change is a new version. An
--    obligation names a contract clause (or an internal basis); a human with
--    the approval right confirms it. Nothing becomes a binding requirement by
--    being uploaded or suggested.
-- 3. Decisions are append-only: investigate, remediate, defer (with a review
--    date), accept risk, no action, scope/cost (amount, currency, scope,
--    mandate), temporary protection, close with deviation. Risk acceptance,
--    scope/cost and closing with a deviation need the approval right.
-- 4. A supplier request is the communication and verification part of an
--    existing action, never a second action. Its basis is explicit:
--    information, a confirmed contract obligation, a deviation, or a change
--    order that needs a scope/cost decision. Every state change goes through
--    one SECURITY DEFINER command that checks the right, the expected
--    version, the state and the basis, writes an append-only event and is
--    idempotent per operation id:
--      draft -> ready_to_send (external sharing right approves an exact,
--      minimised share version) -> awaiting_response (a recorded dispatch) ->
--      in_progress -> awaiting_verification (the supplier says done) ->
--      accepted | needs_revision; withdrawn with a reason; an approver may
--      reopen an accepted request into a new cycle, keeping the earlier one.
--    Requested, supplier-proposed and agreed dates are separate; a date change
--    needs a reason and keeps the earlier date. An objection is recorded,
--    never rewrites history. Changing shared content marks the share stale.
-- 5. The action cannot be completed while a request on it is neither
--    accepted nor withdrawn, unless an approver documents a deviation.
-- 6. Visibility follows the action (#502): requests, events, shares,
--    responses, verifications, decisions and their audit are need-to-know
--    exactly as the action is. Supplier reviews store only human text; their
--    figures are computed live from what the reader may see.
--
-- Rollback: supabase/rollback/20270330090000_security_work_supplier_cycle_rollback.sql
-- (refuses while any supplier-cycle data exists).
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Rights
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_workspace_memberships ADD COLUMN can_share_external boolean NOT NULL DEFAULT false;
ALTER TABLE public.sw_workspace_memberships ADD CONSTRAINT sw_memberships_share_role
  CHECK (NOT can_share_external OR role IN ('owner', 'editor'));
COMMENT ON COLUMN public.sw_workspace_memberships.can_share_external IS 'Explicit right to approve a version of a record for an external recipient. Granted by a workspace owner; never implied by editing.';

CREATE FUNCTION sw_private.can_share(_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.is_human() AND EXISTS (
    SELECT 1 FROM public.sw_workspace_memberships m
    WHERE m.workspace_id = _workspace_id AND m.user_id = auth.uid() AND m.active AND m.can_share_external AND m.role IN ('owner', 'editor'));
$$;

CREATE FUNCTION sw_private.set_member_sharing(_workspace_id uuid, _user_id uuid, _allowed boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT sw_private.can_manage(_workspace_id) THEN RAISE EXCEPTION 'SW_OWNER_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.sw_workspace_memberships SET can_share_external = _allowed, updated_at = now()
   WHERE workspace_id = _workspace_id AND user_id = _user_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'SW_MEMBER_NOT_FOUND' USING ERRCODE = '23514'; END IF;
  RETURN _allowed;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Impact on an asset is confirmed, unconfirmed or ruled out
-- -----------------------------------------------------------------------------
-- Existing links were made deliberately by a person: they stay 'confirmed'.
ALTER TABLE public.sw_risk_assets
  ADD COLUMN impact_status text NOT NULL DEFAULT 'confirmed' CHECK (impact_status IN ('unconfirmed', 'confirmed', 'ruled_out')),
  ADD COLUMN impact_note text NOT NULL DEFAULT '' CHECK (char_length(impact_note) <= 2000),
  ADD COLUMN impact_checked_by uuid REFERENCES auth.users(id),
  ADD COLUMN impact_checked_at timestamptz;

CREATE FUNCTION sw_private.stamp_risk_asset_impact() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.impact_status = 'unconfirmed' THEN
    NEW.impact_checked_by := NULL; NEW.impact_checked_at := NULL;
  ELSE
    NEW.impact_checked_by := auth.uid(); NEW.impact_checked_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_30_impact_stamp BEFORE INSERT ON public.sw_risk_assets FOR EACH ROW EXECUTE FUNCTION sw_private.stamp_risk_asset_impact();

CREATE FUNCTION sw_private.set_asset_impact(_workspace_id uuid, _link_id uuid, _status text, _note text) RETURNS public.sw_risk_assets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.sw_risk_assets;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.sw_risk_assets WHERE workspace_id = _workspace_id AND id = _link_id FOR UPDATE;
  IF l.id IS NULL OR NOT sw_private.can_see_record(_workspace_id, 'risk', l.risk_id) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('unconfirmed', 'confirmed', 'ruled_out') THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  IF _status <> 'unconfirmed' AND btrim(coalesce(_note, '')) = '' THEN RAISE EXCEPTION 'SW_IMPACT_NOTE_REQUIRED' USING ERRCODE = '23514'; END IF;
  UPDATE public.sw_risk_assets SET impact_status = _status, impact_note = coalesce(_note, ''),
         impact_checked_by = CASE WHEN _status = 'unconfirmed' THEN NULL ELSE auth.uid() END,
         impact_checked_at = CASE WHEN _status = 'unconfirmed' THEN NULL ELSE now() END
   WHERE workspace_id = _workspace_id AND id = _link_id RETURNING * INTO l;
  RETURN l;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Supplier profile and asset relations
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_supplier_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  asset_id uuid NOT NULL,
  internal_owner_id uuid,
  contact_route text NOT NULL DEFAULT '' CHECK (char_length(contact_route) <= 1000),
  services text NOT NULL DEFAULT '' CHECK (char_length(services) <= 4000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, asset_id),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, asset_id) REFERENCES public.sw_protected_assets(workspace_id, id),
  FOREIGN KEY (workspace_id, internal_owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);
COMMENT ON TABLE public.sw_supplier_profiles IS 'The supplier side of an asset of category suppliers. One supplier identity: the asset.';

CREATE FUNCTION sw_private.guard_supplier_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sw_protected_assets a WHERE a.workspace_id = NEW.workspace_id AND a.id = NEW.asset_id AND a.category = 'suppliers') THEN
    RAISE EXCEPTION 'SW_SUPPLIER_ASSET_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.internal_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.internal_owner_id AND m.active) THEN
    RAISE EXCEPTION 'SW_ACTIVE_OWNER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.asset_id IS DISTINCT FROM OLD.asset_id THEN
    RAISE EXCEPTION 'SW_IMMUTABLE_FIELD: asset_id' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.sw_asset_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  from_asset_id uuid NOT NULL,
  to_asset_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('supplied_by', 'depends_on', 'located_at', 'runs_on')),
  source_note text NOT NULL DEFAULT '' CHECK (char_length(source_note) <= 2000),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  last_verified_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, from_asset_id, to_asset_id, relation),
  CHECK (from_asset_id <> to_asset_id),
  FOREIGN KEY (workspace_id, from_asset_id) REFERENCES public.sw_protected_assets(workspace_id, id),
  FOREIGN KEY (workspace_id, to_asset_id) REFERENCES public.sw_protected_assets(workspace_id, id)
);
COMMENT ON TABLE public.sw_asset_dependencies IS 'Typed relation between two assets of one workspace. Unconfirmed until a person confirms it; the stamp is the database''s.';

-- Confirmation and its stamps belong to the database; the source and relation never move.
CREATE FUNCTION sw_private.guard_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.from_asset_id, NEW.to_asset_id, NEW.relation) IS DISTINCT FROM (OLD.from_asset_id, OLD.to_asset_id, OLD.relation) THEN
    RAISE EXCEPTION 'SW_IMMUTABLE_FIELD: relation' USING ERRCODE = '23514';
  END IF;
  IF NEW.confirmed AND (TG_OP = 'INSERT' OR NOT OLD.confirmed OR NEW.last_verified_at IS DISTINCT FROM OLD.last_verified_at) THEN
    NEW.confirmed_by := auth.uid(); NEW.confirmed_at := now(); NEW.last_verified_at := now();
  ELSIF NEW.confirmed THEN
    NEW.confirmed_by := OLD.confirmed_by; NEW.confirmed_at := OLD.confirmed_at; NEW.last_verified_at := OLD.last_verified_at;
  ELSE
    NEW.confirmed_by := NULL; NEW.confirmed_at := NULL; NEW.last_verified_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Contracts (immutable versions) and obligations (confirmed by a person)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_supplier_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  supplier_asset_id uuid NOT NULL,
  contract_key text NOT NULL CHECK (char_length(btrim(contract_key)) BETWEEN 1 AND 120),
  contract_version integer NOT NULL CHECK (contract_version > 0),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  valid_from date,
  valid_to date,
  document_ref text NOT NULL DEFAULT '' CHECK (char_length(document_ref) <= 1000),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 8000),
  owner_id uuid,
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, contract_key, contract_version),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  FOREIGN KEY (workspace_id, supplier_asset_id) REFERENCES public.sw_supplier_profiles(workspace_id, asset_id),
  FOREIGN KEY (workspace_id, owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);
COMMENT ON TABLE public.sw_supplier_contracts IS 'One immutable version of a supplier contract. A change is a new version; only the verification stamp is ever added later, by an approver.';

CREATE FUNCTION sw_private.guard_contract() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_edit(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'SW_CREATOR_MISMATCH' USING ERRCODE = '42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('sw_contract:' || NEW.workspace_id::text || ':' || NEW.contract_key));
    IF EXISTS (SELECT 1 FROM public.sw_supplier_contracts c WHERE c.workspace_id = NEW.workspace_id AND c.contract_key = NEW.contract_key AND c.supplier_asset_id <> NEW.supplier_asset_id) THEN
      RAISE EXCEPTION 'SW_CONTRACT_KEY_IN_USE' USING ERRCODE = '23514';
    END IF;
    NEW.contract_version := coalesce((SELECT max(c.contract_version) FROM public.sw_supplier_contracts c WHERE c.workspace_id = NEW.workspace_id AND c.contract_key = NEW.contract_key), 0) + 1;
    NEW.created_at := now();
    IF NEW.verified THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      NEW.verified_by := auth.uid(); NEW.verified_at := now();
    ELSE
      NEW.verified_by := NULL; NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['verified', 'verified_by', 'verified_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['verified', 'verified_by', 'verified_at'])
     OR OLD.verified OR NOT NEW.verified THEN
    RAISE EXCEPTION 'SW_CONTRACT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
  NEW.verified_by := auth.uid(); NEW.verified_at := now();
  RETURN NEW;
END $$;

CREATE TABLE public.sw_supplier_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  supplier_asset_id uuid NOT NULL,
  contract_id uuid,
  clause text NOT NULL DEFAULT '' CHECK (char_length(clause) <= 200),
  basis_note text NOT NULL DEFAULT '' CHECK (char_length(basis_note) <= 4000),
  scope text NOT NULL CHECK (char_length(btrim(scope)) BETWEEN 1 AND 4000),
  expected_result text NOT NULL CHECK (char_length(btrim(expected_result)) BETWEEN 1 AND 4000),
  verification_method text NOT NULL CHECK (char_length(btrim(verification_method)) BETWEEN 1 AND 4000),
  time_rule text NOT NULL DEFAULT '' CHECK (char_length(time_rule) <= 1000),
  response_days integer CHECK (response_days BETWEEN 1 AND 365),
  completion_days integer CHECK (completion_days BETWEEN 1 AND 3650),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  CHECK ((contract_id IS NOT NULL AND btrim(clause) <> '') OR (contract_id IS NULL AND btrim(basis_note) <> '')),
  FOREIGN KEY (workspace_id, supplier_asset_id) REFERENCES public.sw_supplier_profiles(workspace_id, asset_id),
  FOREIGN KEY (workspace_id, contract_id) REFERENCES public.sw_supplier_contracts(workspace_id, id)
);
COMMENT ON TABLE public.sw_supplier_obligations IS 'A requirement on a supplier: a contract clause (contract version + clause) or an internal basis. Binding only once a person with the approval right confirms clause, interpretation and time rule; then immutable except retirement.';

CREATE FUNCTION sw_private.guard_obligation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_edit(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_supplier_contracts c WHERE c.workspace_id = NEW.workspace_id AND c.id = NEW.contract_id AND c.supplier_asset_id = NEW.supplier_asset_id) THEN
    RAISE EXCEPTION 'SW_CONTRACT_OF_ANOTHER_SUPPLIER' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'SW_CREATOR_MISMATCH' USING ERRCODE = '42501'; END IF;
    NEW.created_at := now(); NEW.updated_at := now();
    IF NEW.confirmed THEN
      IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
      NEW.confirmed_by := auth.uid(); NEW.confirmed_at := now();
    ELSE
      NEW.confirmed_by := NULL; NEW.confirmed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.confirmed THEN
    -- A confirmed requirement is history: only retirement is possible.
    IF (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
      RAISE EXCEPTION 'SW_OBLIGATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.confirmed THEN
    IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
    NEW.confirmed_by := auth.uid(); NEW.confirmed_at := now();
  ELSE
    NEW.confirmed_by := NULL; NEW.confirmed_at := NULL;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.supplier_asset_id IS DISTINCT FROM OLD.supplier_asset_id THEN
    RAISE EXCEPTION 'SW_IMMUTABLE_FIELD' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Decisions (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('intelligence_item', 'change_brief', 'risk', 'action', 'supplier_request')),
  subject_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('investigate', 'remediate', 'defer', 'accept_risk', 'no_action', 'scope_cost', 'temporary_protection', 'close_with_deviation')),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 4000),
  review_at date,
  amount numeric(14, 2) CHECK (amount IS NULL OR amount >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  cost_scope text CHECK (cost_scope IS NULL OR char_length(cost_scope) <= 4000),
  mandate text CHECK (mandate IS NULL OR char_length(mandate) <= 1000),
  supersedes_id uuid,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  CHECK (decision <> 'defer' OR review_at IS NOT NULL),
  CHECK (decision <> 'scope_cost' OR (amount IS NOT NULL AND currency IS NOT NULL AND btrim(coalesce(cost_scope, '')) <> '' AND btrim(coalesce(mandate, '')) <> '')),
  FOREIGN KEY (workspace_id, supersedes_id) REFERENCES public.sw_decisions(workspace_id, id)
);
COMMENT ON TABLE public.sw_decisions IS 'Append-only human decisions on an observation, risk, action or supplier request. A scope/cost decision records amount, currency, scope and mandate; it buys nothing.';

-- -----------------------------------------------------------------------------
-- 6. Supplier requests and their history
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_supplier_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  reference text NOT NULL CHECK (reference ~ '^LB-[0-9]{4}-[0-9]{4,}$'),
  action_id uuid NOT NULL,
  supplier_asset_id uuid NOT NULL,
  basis_kind text NOT NULL CHECK (basis_kind IN ('information', 'contract_obligation', 'deviation', 'change_order')),
  obligation_id uuid,
  basis_note text NOT NULL DEFAULT '' CHECK (char_length(basis_note) <= 4000),
  change_decision_id uuid,
  internal_owner_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  task text NOT NULL CHECK (char_length(btrim(task)) BETWEEN 1 AND 8000),
  expected_result text NOT NULL CHECK (char_length(btrim(expected_result)) BETWEEN 1 AND 4000),
  response_instruction text NOT NULL DEFAULT '' CHECK (char_length(response_instruction) <= 2000),
  verification_criteria text NOT NULL CHECK (char_length(btrim(verification_criteria)) BETWEEN 1 AND 4000),
  requested_due date NOT NULL,
  supplier_proposed_due date,
  agreed_due date,
  requires_separate_verifier boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_to_send', 'awaiting_response', 'in_progress', 'awaiting_verification', 'needs_revision', 'accepted', 'withdrawn')),
  cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0),
  share_version integer CHECK (share_version > 0),
  share_stale boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, reference),
  CHECK (basis_kind <> 'contract_obligation' OR obligation_id IS NOT NULL),
  CHECK (basis_kind <> 'deviation' OR btrim(basis_note) <> ''),
  CHECK (basis_kind <> 'change_order' OR change_decision_id IS NOT NULL),
  FOREIGN KEY (workspace_id, action_id) REFERENCES public.sw_actions(workspace_id, id),
  FOREIGN KEY (workspace_id, supplier_asset_id) REFERENCES public.sw_supplier_profiles(workspace_id, asset_id),
  FOREIGN KEY (workspace_id, obligation_id) REFERENCES public.sw_supplier_obligations(workspace_id, id),
  FOREIGN KEY (workspace_id, change_decision_id) REFERENCES public.sw_decisions(workspace_id, id),
  FOREIGN KEY (workspace_id, internal_owner_id) REFERENCES public.sw_workspace_memberships(workspace_id, user_id)
);
CREATE INDEX sw_supplier_requests_action_idx ON public.sw_supplier_requests(workspace_id, action_id);
CREATE INDEX sw_supplier_requests_supplier_idx ON public.sw_supplier_requests(workspace_id, supplier_asset_id);
COMMENT ON TABLE public.sw_supplier_requests IS 'The communication and verification part of an existing action. Written only by the sw_* supplier request commands; visible exactly as its action is.';

CREATE TABLE public.sw_supplier_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  request_id uuid NOT NULL,
  cycle integer NOT NULL,
  event text NOT NULL CHECK (event IN ('created', 'edited', 'share_approved', 'dispatched', 'response_recorded', 'objection_recorded', 'verified', 'needs_revision', 'reopened', 'withdrawn', 'due_changed')),
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 16384),
  operation_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, operation_id),
  FOREIGN KEY (workspace_id, request_id) REFERENCES public.sw_supplier_requests(workspace_id, id)
);
CREATE INDEX sw_supplier_request_events_request_idx ON public.sw_supplier_request_events(workspace_id, request_id, created_at);

CREATE TABLE public.sw_supplier_request_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  request_id uuid NOT NULL,
  share_version integer NOT NULL CHECK (share_version > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536),
  recipient text NOT NULL CHECK (char_length(btrim(recipient)) BETWEEN 1 AND 300),
  purpose text NOT NULL CHECK (char_length(btrim(purpose)) BETWEEN 1 AND 1000),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, request_id, share_version),
  FOREIGN KEY (workspace_id, request_id) REFERENCES public.sw_supplier_requests(workspace_id, id)
);
COMMENT ON TABLE public.sw_supplier_request_shares IS 'The exact, minimised external version approved for one recipient and purpose. Built by the database from the request; never the internal case.';

CREATE TABLE public.sw_supplier_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  request_id uuid NOT NULL,
  cycle integer NOT NULL,
  seq integer NOT NULL CHECK (seq > 0),
  kind text NOT NULL CHECK (kind IN ('acknowledged', 'plan', 'question', 'objection', 'done')),
  author_name text NOT NULL CHECK (char_length(btrim(author_name)) BETWEEN 1 AND 200),
  origin text NOT NULL CHECK (origin IN ('email', 'phone', 'meeting', 'letter', 'other')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  claimed_done_at timestamptz,
  received_at timestamptz NOT NULL,
  proposed_due date,
  evidence_source_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_source_ids) <= 20),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, request_id, seq),
  FOREIGN KEY (workspace_id, request_id) REFERENCES public.sw_supplier_requests(workspace_id, id)
);
COMMENT ON TABLE public.sw_supplier_responses IS 'A supplier response received outside the platform and registered by a member (recorded_by). author_name is what the response says; the platform does not authenticate the supplier.';

CREATE TABLE public.sw_supplier_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  request_id uuid NOT NULL,
  response_id uuid NOT NULL,
  cycle integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'needs_revision')),
  criteria_checked text NOT NULL CHECK (char_length(btrim(criteria_checked)) BETWEEN 1 AND 4000),
  checked_evidence text NOT NULL DEFAULT '' CHECK (char_length(checked_evidence) <= 4000),
  remaining_deviation text NOT NULL DEFAULT '' CHECK (char_length(remaining_deviation) <= 4000),
  verified_by uuid NOT NULL REFERENCES auth.users(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, request_id) REFERENCES public.sw_supplier_requests(workspace_id, id),
  FOREIGN KEY (workspace_id, response_id) REFERENCES public.sw_supplier_responses(workspace_id, id)
);
-- At most one accepted outcome per request cycle, whatever runs concurrently.
CREATE UNIQUE INDEX sw_supplier_verifications_one_acceptance ON public.sw_supplier_verifications(workspace_id, request_id, cycle) WHERE outcome = 'accepted';

CREATE TABLE public.sw_supplier_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  supplier_asset_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  findings text NOT NULL DEFAULT '' CHECK (char_length(findings) <= 8000),
  decisions_text text NOT NULL DEFAULT '' CHECK (char_length(decisions_text) <= 8000),
  requirement_changes text NOT NULL DEFAULT '' CHECK (char_length(requirement_changes) <= 8000),
  next_review_at date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  CHECK (period_end >= period_start),
  FOREIGN KEY (workspace_id, supplier_asset_id) REFERENCES public.sw_supplier_profiles(workspace_id, asset_id)
);
COMMENT ON TABLE public.sw_supplier_reviews IS 'A periodic supplier review: human findings, decisions and requirement changes. Its figures are computed live from what the reader may see, never stored.';

CREATE FUNCTION sw_private.guard_supplier_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
  IF NEW.status = 'approved' THEN
    IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
  ELSE
    NEW.approved_by := NULL; NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Visibility: everything follows the action (#502)
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.can_see_supplier_request(_workspace_id uuid, _request_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.sw_supplier_requests r
                  WHERE r.workspace_id = _workspace_id AND r.id = _request_id
                    AND sw_private.can_read(_workspace_id) AND sw_private.can_see_record(_workspace_id, 'action', r.action_id));
$$;

-- The mission scope a decision subject carries (durable: risk/action scopes are immutable).
CREATE FUNCTION sw_private.subject_scope(_workspace_id uuid, _kind text, _id uuid) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE _kind
    WHEN 'risk' THEN array_remove(ARRAY[sw_private.record_scope(_workspace_id, 'risk', _id::text)], NULL)
    WHEN 'action' THEN array_remove(ARRAY[sw_private.record_scope(_workspace_id, 'action', _id::text)], NULL)
    WHEN 'supplier_request' THEN array_remove(ARRAY[(SELECT sw_private.record_scope(_workspace_id, 'action', r.action_id::text) FROM public.sw_supplier_requests r WHERE r.workspace_id = _workspace_id AND r.id = _id)], NULL)
    WHEN 'change_brief' THEN array_remove(ARRAY[(SELECT b.mission_id FROM public.sw_change_briefs b WHERE b.workspace_id = _workspace_id AND b.id = _id)], NULL)
    ELSE '{}'::uuid[]
  END;
$$;

CREATE FUNCTION sw_private.can_see_subject(_workspace_id uuid, _kind text, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.can_read(_workspace_id) AND CASE _kind
    WHEN 'risk' THEN EXISTS (SELECT 1 FROM public.sw_risks r WHERE r.workspace_id = _workspace_id AND r.id = _id) AND sw_private.can_see_record(_workspace_id, 'risk', _id)
    WHEN 'action' THEN EXISTS (SELECT 1 FROM public.sw_actions a WHERE a.workspace_id = _workspace_id AND a.id = _id) AND sw_private.can_see_record(_workspace_id, 'action', _id)
    WHEN 'supplier_request' THEN sw_private.can_see_supplier_request(_workspace_id, _id)
    WHEN 'change_brief' THEN EXISTS (SELECT 1 FROM public.sw_change_briefs b WHERE b.workspace_id = _workspace_id AND b.id = _id) AND sw_private.can_see_brief(_workspace_id, _id)
    WHEN 'intelligence_item' THEN EXISTS (SELECT 1 FROM public.sw_intelligence_items i WHERE i.workspace_id = _workspace_id AND i.id = _id)
    ELSE false
  END;
$$;

CREATE FUNCTION sw_private.guard_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_edit(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_see_subject(NEW.workspace_id, NEW.subject_kind, NEW.subject_id) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NEW.decision IN ('accept_risk', 'scope_cost', 'close_with_deviation') AND NOT sw_private.can_approve(NEW.workspace_id) THEN
    RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sw_decisions d WHERE d.workspace_id = NEW.workspace_id AND d.id = NEW.supersedes_id
                                                     AND d.subject_kind = NEW.subject_kind AND d.subject_id = NEW.subject_id) THEN
    RAISE EXCEPTION 'SW_SUPERSEDES_ANOTHER_SUBJECT' USING ERRCODE = '23514';
  END IF;
  NEW.decided_by := auth.uid(); NEW.decided_at := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Commands
-- -----------------------------------------------------------------------------
-- Idempotency: one operation id is one event. A retry of the same command on
-- the same request returns the request; reusing it for anything else fails.
CREATE FUNCTION sw_private.supplier_replayed(_workspace_id uuid, _operation_id uuid, _request_id uuid, _event text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.sw_supplier_request_events;
BEGIN
  IF _operation_id IS NULL THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  -- A concurrent repeat of the same operation waits here for the first to
  -- finish, then sees its event and replays instead of conflicting.
  PERFORM pg_advisory_xact_lock(hashtextextended('sw_supplier_op:' || _workspace_id::text || ':' || _operation_id::text, 0));
  SELECT * INTO e FROM public.sw_supplier_request_events WHERE workspace_id = _workspace_id AND operation_id = _operation_id;
  IF e.id IS NULL THEN RETURN NULL; END IF;
  IF e.event <> _event OR (_request_id IS NOT NULL AND e.request_id <> _request_id) OR e.actor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  -- A replay returns the request as it is NOW, so the caller must still hold
  -- every right the command needs, now: an active membership, sight of the
  -- action (a restricted mission's circle) and the command's own right.
  IF NOT sw_private.can_edit(_workspace_id)
     OR NOT sw_private.can_see_supplier_request(_workspace_id, e.request_id)
     OR (_event = 'share_approved' AND NOT sw_private.can_share(_workspace_id))
     OR (_event IN ('verified', 'needs_revision', 'reopened') AND NOT sw_private.can_approve(_workspace_id)) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN e.request_id;
END $$;

CREATE FUNCTION sw_private.supplier_request_locked(_workspace_id uuid, _request_id uuid, _expected_version integer) RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests;
BEGIN
  SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _request_id FOR UPDATE;
  -- A request out of reach answers exactly like one that does not exist.
  IF r.id IS NULL OR NOT sw_private.can_read(_workspace_id) OR NOT sw_private.can_see_record(_workspace_id, 'action', r.action_id) THEN
    RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _expected_version IS NOT NULL AND r.version <> _expected_version THEN
    RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = '40001';
  END IF;
  RETURN r;
END $$;

CREATE FUNCTION sw_private.supplier_event(_r public.sw_supplier_requests, _event text, _from text, _details jsonb, _operation_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.sw_supplier_request_events(workspace_id, request_id, cycle, event, from_status, to_status, details, operation_id, actor_user_id)
  VALUES (_r.workspace_id, _r.id, _r.cycle, _event, _from, _r.status, coalesce(_details, '{}'), _operation_id, auth.uid());
$$;

-- What leaves the platform: reference, task, expected result, instruction,
-- requested date and the basis as text. Never the risk, the internal owner,
-- the verification criteria, notes or anything of another supplier.
CREATE FUNCTION sw_private.supplier_share_content(_r public.sw_supplier_requests) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'reference', _r.reference, 'title', _r.title, 'task', _r.task, 'expectedResult', _r.expected_result,
    'responseInstruction', _r.response_instruction, 'requestedDue', _r.requested_due, 'basisKind', _r.basis_kind,
    'contract', (SELECT jsonb_build_object('title', c.title, 'version', c.contract_version, 'clause', o.clause)
                   FROM public.sw_supplier_obligations o JOIN public.sw_supplier_contracts c ON c.workspace_id = o.workspace_id AND c.id = o.contract_id
                  WHERE o.workspace_id = _r.workspace_id AND o.id = _r.obligation_id),
    'supplier', (SELECT a.name FROM public.sw_protected_assets a WHERE a.workspace_id = _r.workspace_id AND a.id = _r.supplier_asset_id));
$$;

CREATE FUNCTION sw_private.check_supplier_basis(_r public.sw_supplier_requests) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _r.basis_kind = 'contract_obligation' AND NOT EXISTS (
       SELECT 1 FROM public.sw_supplier_obligations o JOIN public.sw_supplier_contracts c ON c.workspace_id = o.workspace_id AND c.id = o.contract_id
        WHERE o.workspace_id = _r.workspace_id AND o.id = _r.obligation_id AND o.supplier_asset_id = _r.supplier_asset_id
          AND o.confirmed AND o.status = 'active' AND c.verified) THEN
    RAISE EXCEPTION 'SW_CONFIRMED_OBLIGATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF _r.basis_kind <> 'contract_obligation' AND _r.obligation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.sw_supplier_obligations o WHERE o.workspace_id = _r.workspace_id AND o.id = _r.obligation_id AND o.supplier_asset_id = _r.supplier_asset_id) THEN
    RAISE EXCEPTION 'SW_OBLIGATION_OF_ANOTHER_SUPPLIER' USING ERRCODE = '23514';
  END IF;
  IF _r.basis_kind = 'change_order' AND NOT EXISTS (
       SELECT 1 FROM public.sw_decisions d WHERE d.workspace_id = _r.workspace_id AND d.id = _r.change_decision_id AND d.decision = 'scope_cost'
          AND ((d.subject_kind = 'action' AND d.subject_id = _r.action_id) OR (d.subject_kind = 'supplier_request' AND d.subject_id IN (
                SELECT x.id FROM public.sw_supplier_requests x WHERE x.workspace_id = _r.workspace_id AND x.action_id = _r.action_id)))) THEN
    RAISE EXCEPTION 'SW_SCOPE_COST_DECISION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sw_supplier_profiles p WHERE p.workspace_id = _r.workspace_id AND p.asset_id = _r.supplier_asset_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'SW_ACTIVE_SUPPLIER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sw_workspace_memberships m WHERE m.workspace_id = _r.workspace_id AND m.user_id = _r.internal_owner_id AND m.active AND m.role IN ('owner', 'editor')) THEN
    RAISE EXCEPTION 'SW_ACTIVE_OWNER_REQUIRED' USING ERRCODE = '23514';
  END IF;
END $$;

-- Create a draft (no _request_id) or edit content. Editing approved content
-- sends a ready request back to draft and marks an earlier share stale.
CREATE FUNCTION sw_private.save_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _fields jsonb)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; old public.sw_supplier_requests; _replayed uuid; _action public.sw_actions; _seq integer; _from text; _changed text[];
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _fields IS NULL OR jsonb_typeof(_fields) <> 'object' THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, CASE WHEN _request_id IS NULL THEN 'created' ELSE 'edited' END);
  IF _replayed IS NOT NULL THEN
    SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed;
    RETURN r;
  END IF;
  IF _request_id IS NULL THEN
    SELECT * INTO _action FROM public.sw_actions WHERE workspace_id = _workspace_id AND id = (_fields->>'actionId')::uuid FOR SHARE;
    IF _action.id IS NULL OR NOT sw_private.can_see_record(_workspace_id, 'action', _action.id) THEN
      RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
    IF _action.status IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'SW_ACTION_CLOSED' USING ERRCODE = '23514'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('sw_supplier_reference:' || _workspace_id::text));
    SELECT coalesce(max(substring(x.reference FROM '[0-9]+$')::integer), 0) + 1 INTO _seq
      FROM public.sw_supplier_requests x WHERE x.workspace_id = _workspace_id AND x.reference LIKE 'LB-' || to_char(now(), 'YYYY') || '-%';
    INSERT INTO public.sw_supplier_requests(workspace_id, reference, action_id, supplier_asset_id, basis_kind, obligation_id, basis_note, change_decision_id,
        internal_owner_id, title, task, expected_result, response_instruction, verification_criteria, requested_due, requires_separate_verifier, created_by)
    VALUES (_workspace_id, 'LB-' || to_char(now(), 'YYYY') || '-' || lpad(_seq::text, 4, '0'), _action.id, (_fields->>'supplierAssetId')::uuid,
        _fields->>'basisKind', (_fields->>'obligationId')::uuid, coalesce(_fields->>'basisNote', ''), (_fields->>'changeDecisionId')::uuid,
        (_fields->>'internalOwnerId')::uuid, _fields->>'title', _fields->>'task', _fields->>'expectedResult', coalesce(_fields->>'responseInstruction', ''),
        _fields->>'verificationCriteria', (_fields->>'requestedDue')::date, coalesce((_fields->>'requiresSeparateVerifier')::boolean, false), auth.uid())
    RETURNING * INTO r;
    PERFORM sw_private.check_supplier_basis(r);
    PERFORM sw_private.supplier_event(r, 'created', NULL, jsonb_build_object('reference', r.reference), _operation_id);
    RETURN r;
  END IF;
  old := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF old.status IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
  -- Once a request needs a separate verifier it keeps that requirement, and
  -- its internal owner, for good: an ordinary edit can neither lower it nor
  -- move ownership away so the former owner could verify their own work.
  -- This version has no exception path.
  IF old.requires_separate_verifier AND (
       (_fields->>'requiresSeparateVerifier')::boolean IS FALSE
       OR ((_fields->>'internalOwnerId')::uuid IS NOT NULL AND (_fields->>'internalOwnerId')::uuid <> old.internal_owner_id)) THEN
    RAISE EXCEPTION 'SW_SEPARATE_VERIFIER_LOCKED' USING ERRCODE = '23514';
  END IF;
  UPDATE public.sw_supplier_requests SET
      title = coalesce(_fields->>'title', title), task = coalesce(_fields->>'task', task), expected_result = coalesce(_fields->>'expectedResult', expected_result),
      response_instruction = coalesce(_fields->>'responseInstruction', response_instruction),
      verification_criteria = coalesce(_fields->>'verificationCriteria', verification_criteria),
      internal_owner_id = coalesce((_fields->>'internalOwnerId')::uuid, internal_owner_id),
      basis_kind = CASE WHEN old.status = 'draft' THEN coalesce(_fields->>'basisKind', basis_kind) ELSE basis_kind END,
      obligation_id = CASE WHEN old.status = 'draft' AND _fields ? 'obligationId' THEN (_fields->>'obligationId')::uuid ELSE obligation_id END,
      basis_note = CASE WHEN old.status = 'draft' THEN coalesce(_fields->>'basisNote', basis_note) ELSE basis_note END,
      change_decision_id = CASE WHEN old.status = 'draft' AND _fields ? 'changeDecisionId' THEN (_fields->>'changeDecisionId')::uuid ELSE change_decision_id END,
      requested_due = CASE WHEN old.status = 'draft' THEN coalesce((_fields->>'requestedDue')::date, requested_due) ELSE requested_due END,
      requires_separate_verifier = coalesce((_fields->>'requiresSeparateVerifier')::boolean, requires_separate_verifier),
      updated_at = now(), version = version + 1
    WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.check_supplier_basis(r);
  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO _changed FROM jsonb_each(to_jsonb(r) - ARRAY['updated_at', 'version']) n(k, v)
   WHERE v IS DISTINCT FROM to_jsonb(old)->k;
  -- Content the recipient would see changed: an approval or share no longer covers it.
  IF (sw_private.supplier_share_content(r) - 'supplier') IS DISTINCT FROM (sw_private.supplier_share_content(old) - 'supplier') THEN
    _from := r.status;
    UPDATE public.sw_supplier_requests SET status = CASE WHEN status = 'ready_to_send' THEN 'draft' ELSE status END,
           share_stale = share_version IS NOT NULL
     WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  END IF;
  PERFORM sw_private.supplier_event(r, 'edited', old.status, jsonb_build_object('fields', to_jsonb(_changed)), _operation_id);
  RETURN r;
END $$;

-- Only the explicit sharing right approves what leaves the platform: an exact,
-- minimised version for one recipient and purpose.
CREATE FUNCTION sw_private.approve_supplier_share(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _recipient text, _purpose text)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text;
BEGIN
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, 'share_approved');
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF NOT sw_private.can_share(_workspace_id) THEN RAISE EXCEPTION 'SW_SHARE_RIGHT_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT (r.status = 'draft' OR (r.share_stale AND r.status IN ('awaiting_response', 'in_progress', 'needs_revision', 'awaiting_verification'))) THEN
    RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
  END IF;
  PERFORM sw_private.check_supplier_basis(r);
  _from := r.status;
  INSERT INTO public.sw_supplier_request_shares(workspace_id, request_id, share_version, content, recipient, purpose, approved_by)
  VALUES (_workspace_id, r.id, coalesce(r.share_version, 0) + 1, sw_private.supplier_share_content(r), _recipient, _purpose, auth.uid());
  UPDATE public.sw_supplier_requests SET share_version = coalesce(share_version, 0) + 1, share_stale = false,
         status = CASE WHEN status = 'draft' THEN 'ready_to_send' ELSE status END, updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, 'share_approved', _from, jsonb_build_object('shareVersion', r.share_version, 'recipient', _recipient, 'purpose', _purpose), _operation_id);
  RETURN r;
END $$;

-- Sent through the customer's own channel; recorded here. Sent is not read,
-- and not accepted.
CREATE FUNCTION sw_private.record_supplier_dispatch(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _channel text, _recipient text, _sent_at timestamptz)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text; _last integer;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, 'dispatched');
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF _channel NOT IN ('email', 'letter', 'phone', 'meeting', 'other') OR btrim(coalesce(_recipient, '')) = '' OR char_length(_recipient) > 300
     OR _sent_at IS NULL OR _sent_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF r.share_version IS NULL OR r.share_stale THEN RAISE EXCEPTION 'SW_APPROVED_SHARE_REQUIRED' USING ERRCODE = '23514'; END IF;
  SELECT max((e.details->>'shareVersion')::integer) INTO _last FROM public.sw_supplier_request_events e
   WHERE e.workspace_id = _workspace_id AND e.request_id = r.id AND e.event = 'dispatched';
  IF NOT (r.status = 'ready_to_send' OR (r.status IN ('awaiting_response', 'in_progress', 'needs_revision') AND coalesce(_last, 0) < r.share_version)) THEN
    RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
  END IF;
  _from := r.status;
  UPDATE public.sw_supplier_requests SET status = CASE WHEN status = 'ready_to_send' THEN 'awaiting_response' ELSE status END, updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, 'dispatched', _from, jsonb_build_object('channel', _channel, 'recipient', _recipient, 'sentAt', _sent_at, 'shareVersion', r.share_version), _operation_id);
  RETURN r;
END $$;

-- A response received outside the platform, registered by a member.
CREATE FUNCTION sw_private.record_supplier_response(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _response jsonb)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text; _kind text; _seq integer; _evidence uuid[]; _resp public.sw_supplier_responses; _proposed date;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _response IS NULL OR jsonb_typeof(_response) <> 'object' THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  _kind := _response->>'kind';
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, CASE WHEN _kind = 'objection' THEN 'objection_recorded' ELSE 'response_recorded' END);
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF r.status NOT IN ('awaiting_response', 'in_progress', 'needs_revision', 'awaiting_verification') THEN
    RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(array_agg(x::uuid), '{}') INTO _evidence FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_response->'evidenceSourceIds') = 'array' THEN _response->'evidenceSourceIds' ELSE '[]' END) x;
  IF EXISTS (SELECT 1 FROM unnest(_evidence) s WHERE NOT EXISTS (SELECT 1 FROM public.sw_sources src WHERE src.workspace_id = _workspace_id AND src.id = s)) THEN
    RAISE EXCEPTION 'SW_EVIDENCE_NOT_IN_WORKSPACE' USING ERRCODE = '23514';
  END IF;
  _proposed := (_response->>'proposedDue')::date;
  SELECT coalesce(max(seq), 0) + 1 INTO _seq FROM public.sw_supplier_responses WHERE workspace_id = _workspace_id AND request_id = r.id;
  INSERT INTO public.sw_supplier_responses(workspace_id, request_id, cycle, seq, kind, author_name, origin, body, claimed_done_at, received_at, proposed_due, evidence_source_ids, recorded_by)
  VALUES (_workspace_id, r.id, r.cycle, _seq, _kind, _response->>'authorName', _response->>'origin', _response->>'body',
          (_response->>'claimedDoneAt')::timestamptz, coalesce((_response->>'receivedAt')::timestamptz, now()), _proposed, _evidence, auth.uid())
  RETURNING * INTO _resp;
  IF _resp.received_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514'; END IF;
  _from := r.status;
  UPDATE public.sw_supplier_requests SET
      status = CASE
        WHEN _kind = 'done' THEN 'awaiting_verification'
        WHEN _kind IN ('acknowledged', 'plan', 'question') AND status IN ('awaiting_response', 'needs_revision') THEN 'in_progress'
        ELSE status END,
      supplier_proposed_due = coalesce(_proposed, supplier_proposed_due),
      updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, CASE WHEN _kind = 'objection' THEN 'objection_recorded' ELSE 'response_recorded' END, _from,
          jsonb_build_object('responseId', _resp.id, 'kind', _kind, 'seq', _seq), _operation_id);
  RETURN r;
END $$;

-- Only the verifier right accepts, and only the latest "done" of the current
-- cycle. Concurrent verifiers: the row lock and expected version let one win;
-- the unique index allows one acceptance per cycle in any case.
CREATE FUNCTION sw_private.verify_supplier_response(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _response_id uuid,
    _outcome text, _criteria_checked text, _checked_evidence text, _remaining_deviation text)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text; _resp public.sw_supplier_responses;
BEGIN
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, CASE WHEN _outcome = 'accepted' THEN 'verified' ELSE 'needs_revision' END);
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'awaiting_verification' OR _outcome NOT IN ('accepted', 'needs_revision') THEN RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514'; END IF;
  SELECT * INTO _resp FROM public.sw_supplier_responses WHERE workspace_id = _workspace_id AND request_id = r.id AND cycle = r.cycle AND kind = 'done'
   ORDER BY seq DESC LIMIT 1;
  IF _resp.id IS NULL OR _resp.id <> _response_id THEN RAISE EXCEPTION 'SW_LATEST_DONE_RESPONSE_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF r.requires_separate_verifier AND (auth.uid() = r.internal_owner_id OR auth.uid() = _resp.recorded_by OR auth.uid() = r.created_by) THEN
    RAISE EXCEPTION 'SW_SEPARATE_VERIFIER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.sw_supplier_verifications(workspace_id, request_id, response_id, cycle, outcome, criteria_checked, checked_evidence, remaining_deviation, verified_by)
  VALUES (_workspace_id, r.id, _resp.id, r.cycle, _outcome, _criteria_checked, coalesce(_checked_evidence, ''), coalesce(_remaining_deviation, ''), auth.uid());
  _from := r.status;
  UPDATE public.sw_supplier_requests SET status = CASE WHEN _outcome = 'accepted' THEN 'accepted' ELSE 'needs_revision' END, updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, CASE WHEN _outcome = 'accepted' THEN 'verified' ELSE 'needs_revision' END, _from,
          jsonb_build_object('responseId', _resp.id, 'outcome', _outcome), _operation_id);
  RETURN r;
END $$;

-- An approver reopens an accepted request into a new cycle; the earlier
-- acceptance stays on record.
CREATE FUNCTION sw_private.reopen_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _reason text)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text; _action_status text;
BEGIN
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, 'reopened');
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  -- Nothing is locked for a caller who may not reopen this request.
  IF NOT sw_private.can_see_supplier_request(_workspace_id, _request_id) THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
  -- Lock order everywhere: the action, then its requests. Completing the
  -- action (sw_27_supplier_work) takes the same order, so a reopen and a
  -- completion serialise: one waits and then sees the other's result.
  SELECT a.status INTO _action_status FROM public.sw_actions a
   WHERE a.workspace_id = _workspace_id AND a.id = (SELECT x.action_id FROM public.sw_supplier_requests x WHERE x.workspace_id = _workspace_id AND x.id = _request_id)
   FOR UPDATE;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF NOT sw_private.can_approve(_workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'accepted' THEN RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514'; END IF;
  IF btrim(coalesce(_reason, '')) = '' OR char_length(_reason) > 2000 THEN RAISE EXCEPTION 'SW_REASON_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF _action_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'SW_ACTION_CLOSED' USING ERRCODE = '23514';
  END IF;
  _from := r.status;
  UPDATE public.sw_supplier_requests SET status = 'in_progress', cycle = cycle + 1, updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, 'reopened', _from, jsonb_build_object('reason', _reason), _operation_id);
  RETURN r;
END $$;

CREATE FUNCTION sw_private.withdraw_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _reason text)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _from text;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, 'withdrawn');
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF r.status IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514'; END IF;
  IF btrim(coalesce(_reason, '')) = '' OR char_length(_reason) > 2000 THEN RAISE EXCEPTION 'SW_REASON_REQUIRED' USING ERRCODE = '23514'; END IF;
  _from := r.status;
  UPDATE public.sw_supplier_requests SET status = 'withdrawn', updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, 'withdrawn', _from, jsonb_build_object('reason', _reason), _operation_id);
  RETURN r;
END $$;

-- A date change needs a reason; the earlier date stays in the history. A new
-- requested date is external content: an earlier share becomes stale.
CREATE FUNCTION sw_private.change_supplier_due(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _which text, _due date, _reason text)
RETURNS public.sw_supplier_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_supplier_requests; _replayed uuid; _old date;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  _replayed := sw_private.supplier_replayed(_workspace_id, _operation_id, _request_id, 'due_changed');
  IF _replayed IS NOT NULL THEN SELECT * INTO r FROM public.sw_supplier_requests WHERE workspace_id = _workspace_id AND id = _replayed; RETURN r; END IF;
  r := sw_private.supplier_request_locked(_workspace_id, _request_id, _expected_version);
  IF r.status IN ('accepted', 'withdrawn') OR _which NOT IN ('requested', 'agreed') OR (_which = 'requested' AND _due IS NULL) THEN
    RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
  END IF;
  IF btrim(coalesce(_reason, '')) = '' OR char_length(_reason) > 2000 THEN RAISE EXCEPTION 'SW_REASON_REQUIRED' USING ERRCODE = '23514'; END IF;
  _old := CASE _which WHEN 'requested' THEN r.requested_due ELSE r.agreed_due END;
  UPDATE public.sw_supplier_requests SET
      requested_due = CASE WHEN _which = 'requested' THEN _due ELSE requested_due END,
      agreed_due = CASE WHEN _which = 'agreed' THEN _due ELSE agreed_due END,
      share_stale = CASE WHEN _which = 'requested' AND share_version IS NOT NULL THEN true ELSE share_stale END,
      status = CASE WHEN _which = 'requested' AND status = 'ready_to_send' THEN 'draft' ELSE status END,
      updated_at = now(), version = version + 1
   WHERE workspace_id = _workspace_id AND id = _request_id RETURNING * INTO r;
  PERFORM sw_private.supplier_event(r, 'due_changed', r.status, jsonb_build_object('which', _which, 'from', _old, 'to', _due, 'reason', _reason), _operation_id);
  RETURN r;
END $$;

-- -----------------------------------------------------------------------------
-- 9. The action is not done until its supplier work is verified
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.guard_action_supplier_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    -- The action row is locked by this UPDATE; take its requests next (the
    -- same order as reopen), so a concurrent reopen finishes first or waits.
    PERFORM 1 FROM public.sw_supplier_requests r WHERE r.workspace_id = NEW.workspace_id AND r.action_id = NEW.id FOR SHARE;
  END IF;
  IF NEW.status = 'completed' AND OLD.status <> 'completed'
     AND EXISTS (SELECT 1 FROM public.sw_supplier_requests r WHERE r.workspace_id = NEW.workspace_id AND r.action_id = NEW.id AND r.status NOT IN ('accepted', 'withdrawn'))
     AND NOT EXISTS (SELECT 1 FROM public.sw_decisions d WHERE d.workspace_id = NEW.workspace_id AND d.subject_kind = 'action' AND d.subject_id = NEW.id AND d.decision = 'close_with_deviation') THEN
    RAISE EXCEPTION 'SW_SUPPLIER_VERIFICATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_27_supplier_work BEFORE UPDATE ON public.sw_actions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_action_supplier_work();

-- -----------------------------------------------------------------------------
-- 10. Audit scope for the new records (durable, from the row)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sw_private.audit_scope(_table text, _row jsonb) RETURNS uuid[]
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
    WHEN _table = 'sw_supplier_requests' THEN
      array_remove(ARRAY[sw_private.record_scope((_row->>'workspace_id')::uuid, 'action', _row->>'action_id')], NULL)
    WHEN _table = 'sw_decisions' THEN
      sw_private.subject_scope((_row->>'workspace_id')::uuid, _row->>'subject_kind', (_row->>'subject_id')::uuid)
    ELSE '{}'::uuid[]
  END;
$$;

-- -----------------------------------------------------------------------------
-- 11. Triggers, policies, privileges
-- -----------------------------------------------------------------------------
CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_supplier_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_15_supplier BEFORE INSERT OR UPDATE ON public.sw_supplier_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.guard_supplier_profile();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE OR DELETE ON public.sw_supplier_profiles FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_asset_dependencies FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_15_dependency BEFORE INSERT OR UPDATE ON public.sw_asset_dependencies FOR EACH ROW EXECUTE FUNCTION sw_private.guard_dependency();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE OR DELETE ON public.sw_asset_dependencies FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

CREATE TRIGGER sw_15_contract BEFORE INSERT OR UPDATE ON public.sw_supplier_contracts FOR EACH ROW EXECUTE FUNCTION sw_private.guard_contract();
CREATE TRIGGER sw_00_immutable BEFORE DELETE ON public.sw_supplier_contracts FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE ON public.sw_supplier_contracts FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

CREATE TRIGGER sw_15_obligation BEFORE INSERT OR UPDATE ON public.sw_supplier_obligations FOR EACH ROW EXECUTE FUNCTION sw_private.guard_obligation();
CREATE TRIGGER sw_00_immutable BEFORE DELETE ON public.sw_supplier_obligations FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE ON public.sw_supplier_obligations FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

CREATE TRIGGER sw_15_decision BEFORE INSERT ON public.sw_decisions FOR EACH ROW EXECUTE FUNCTION sw_private.guard_decision();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_decisions FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_90_audit AFTER INSERT ON public.sw_decisions FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE ON public.sw_supplier_requests FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();
CREATE TRIGGER sw_00_immutable BEFORE DELETE ON public.sw_supplier_requests FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_supplier_request_events FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_supplier_request_shares FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_supplier_responses FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_supplier_verifications FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();

CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_supplier_reviews FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_15_review BEFORE INSERT OR UPDATE ON public.sw_supplier_reviews FOR EACH ROW EXECUTE FUNCTION sw_private.guard_supplier_review();
CREATE TRIGGER sw_00_immutable BEFORE DELETE ON public.sw_supplier_reviews FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE ON public.sw_supplier_reviews FOR EACH ROW EXECUTE FUNCTION sw_private.record_change();

DO $privileges$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['sw_supplier_profiles', 'sw_asset_dependencies', 'sw_supplier_contracts', 'sw_supplier_obligations', 'sw_decisions',
      'sw_supplier_requests', 'sw_supplier_request_events', 'sw_supplier_request_shares', 'sw_supplier_responses', 'sw_supplier_verifications', 'sw_supplier_reviews'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', _table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', _table);
  END LOOP;
END $privileges$;
-- Direct writes only where a guard owns every stamp; the request lifecycle is command-only.
GRANT INSERT (id, workspace_id, asset_id, internal_owner_id, contact_route, services, status, created_by), UPDATE (internal_owner_id, contact_route, services, status)
  ON public.sw_supplier_profiles TO authenticated;
GRANT INSERT (id, workspace_id, from_asset_id, to_asset_id, relation, source_note, confirmed, created_by), UPDATE (source_note, confirmed, last_verified_at), DELETE
  ON public.sw_asset_dependencies TO authenticated;
GRANT INSERT (id, workspace_id, supplier_asset_id, contract_key, title, valid_from, valid_to, document_ref, summary, owner_id, verified, created_by), UPDATE (verified)
  ON public.sw_supplier_contracts TO authenticated;
GRANT INSERT (id, workspace_id, supplier_asset_id, contract_id, clause, basis_note, scope, expected_result, verification_method, time_rule, response_days, completion_days, confirmed, created_by),
      UPDATE (clause, basis_note, scope, expected_result, verification_method, time_rule, response_days, completion_days, confirmed, status)
  ON public.sw_supplier_obligations TO authenticated;
GRANT INSERT (id, workspace_id, subject_kind, subject_id, decision, rationale, review_at, amount, currency, cost_scope, mandate, supersedes_id)
  ON public.sw_decisions TO authenticated;
GRANT INSERT (id, workspace_id, supplier_asset_id, period_start, period_end, findings, decisions_text, requirement_changes, next_review_at, status, created_by),
      UPDATE (findings, decisions_text, requirement_changes, next_review_at, status)
  ON public.sw_supplier_reviews TO authenticated;

CREATE POLICY sw_member_read ON public.sw_supplier_profiles FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_supplier_profiles FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_editor_update ON public.sw_supplier_profiles FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));

CREATE POLICY sw_member_read ON public.sw_asset_dependencies FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_asset_dependencies FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_editor_update ON public.sw_asset_dependencies FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_editor_delete ON public.sw_asset_dependencies FOR DELETE TO authenticated USING (sw_private.can_edit(workspace_id));

CREATE POLICY sw_member_read ON public.sw_supplier_contracts FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_supplier_contracts FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_approver_update ON public.sw_supplier_contracts FOR UPDATE TO authenticated USING (sw_private.can_approve(workspace_id)) WITH CHECK (sw_private.can_approve(workspace_id));

CREATE POLICY sw_member_read ON public.sw_supplier_obligations FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_supplier_obligations FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_editor_update ON public.sw_supplier_obligations FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));

CREATE POLICY sw_member_read ON public.sw_decisions FOR SELECT TO authenticated USING (sw_private.can_see_subject(workspace_id, subject_kind, subject_id));
CREATE POLICY sw_editor_insert ON public.sw_decisions FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_subject(workspace_id, subject_kind, subject_id));

CREATE POLICY sw_member_read ON public.sw_supplier_requests FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND sw_private.can_see_record(workspace_id, 'action', action_id));
CREATE POLICY sw_member_read ON public.sw_supplier_request_events FOR SELECT TO authenticated USING (sw_private.can_see_supplier_request(workspace_id, request_id));
CREATE POLICY sw_member_read ON public.sw_supplier_request_shares FOR SELECT TO authenticated USING (sw_private.can_see_supplier_request(workspace_id, request_id));
CREATE POLICY sw_member_read ON public.sw_supplier_responses FOR SELECT TO authenticated USING (sw_private.can_see_supplier_request(workspace_id, request_id));
CREATE POLICY sw_member_read ON public.sw_supplier_verifications FOR SELECT TO authenticated USING (sw_private.can_see_supplier_request(workspace_id, request_id));

CREATE POLICY sw_member_read ON public.sw_supplier_reviews FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id));
CREATE POLICY sw_editor_insert ON public.sw_supplier_reviews FOR INSERT TO authenticated WITH CHECK (sw_private.can_edit(workspace_id));
CREATE POLICY sw_editor_update ON public.sw_supplier_reviews FOR UPDATE TO authenticated USING (sw_private.can_edit(workspace_id)) WITH CHECK (sw_private.can_edit(workspace_id));

-- Public commands: thin SQL wrappers, as sw_apply_change_brief.
CREATE FUNCTION public.sw_set_member_sharing(_workspace_id uuid, _user_id uuid, _allowed boolean) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.set_member_sharing(_workspace_id, _user_id, _allowed) $$;
CREATE FUNCTION public.sw_set_asset_impact(_workspace_id uuid, _link_id uuid, _status text, _note text) RETURNS public.sw_risk_assets
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.set_asset_impact(_workspace_id, _link_id, _status, _note) $$;
CREATE FUNCTION public.sw_save_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _fields jsonb) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.save_supplier_request(_workspace_id, _operation_id, _request_id, _expected_version, _fields) $$;
CREATE FUNCTION public.sw_approve_supplier_share(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _recipient text, _purpose text) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.approve_supplier_share(_workspace_id, _operation_id, _request_id, _expected_version, _recipient, _purpose) $$;
CREATE FUNCTION public.sw_record_supplier_dispatch(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _channel text, _recipient text, _sent_at timestamptz) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.record_supplier_dispatch(_workspace_id, _operation_id, _request_id, _expected_version, _channel, _recipient, _sent_at) $$;
CREATE FUNCTION public.sw_record_supplier_response(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _response jsonb) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.record_supplier_response(_workspace_id, _operation_id, _request_id, _expected_version, _response) $$;
CREATE FUNCTION public.sw_verify_supplier_response(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _response_id uuid, _outcome text, _criteria_checked text, _checked_evidence text, _remaining_deviation text) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.verify_supplier_response(_workspace_id, _operation_id, _request_id, _expected_version, _response_id, _outcome, _criteria_checked, _checked_evidence, _remaining_deviation) $$;
CREATE FUNCTION public.sw_reopen_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _reason text) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.reopen_supplier_request(_workspace_id, _operation_id, _request_id, _expected_version, _reason) $$;
CREATE FUNCTION public.sw_withdraw_supplier_request(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _reason text) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.withdraw_supplier_request(_workspace_id, _operation_id, _request_id, _expected_version, _reason) $$;
CREATE FUNCTION public.sw_change_supplier_due(_workspace_id uuid, _operation_id uuid, _request_id uuid, _expected_version integer, _which text, _due date, _reason text) RETURNS public.sw_supplier_requests
LANGUAGE sql SET search_path = '' AS $$ SELECT sw_private.change_supplier_due(_workspace_id, _operation_id, _request_id, _expected_version, _which, _due, _reason) $$;

REVOKE ALL ON FUNCTION
  sw_private.can_share(uuid), sw_private.set_member_sharing(uuid, uuid, boolean), sw_private.stamp_risk_asset_impact(), sw_private.set_asset_impact(uuid, uuid, text, text),
  sw_private.guard_supplier_profile(), sw_private.guard_dependency(), sw_private.guard_contract(), sw_private.guard_obligation(), sw_private.guard_supplier_review(),
  sw_private.can_see_supplier_request(uuid, uuid), sw_private.subject_scope(uuid, text, uuid), sw_private.can_see_subject(uuid, text, uuid), sw_private.guard_decision(),
  sw_private.supplier_replayed(uuid, uuid, uuid, text), sw_private.supplier_request_locked(uuid, uuid, integer),
  sw_private.supplier_event(public.sw_supplier_requests, text, text, jsonb, uuid), sw_private.supplier_share_content(public.sw_supplier_requests),
  sw_private.check_supplier_basis(public.sw_supplier_requests),
  sw_private.save_supplier_request(uuid, uuid, uuid, integer, jsonb), sw_private.approve_supplier_share(uuid, uuid, uuid, integer, text, text),
  sw_private.record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz), sw_private.record_supplier_response(uuid, uuid, uuid, integer, jsonb),
  sw_private.verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text), sw_private.reopen_supplier_request(uuid, uuid, uuid, integer, text),
  sw_private.withdraw_supplier_request(uuid, uuid, uuid, integer, text), sw_private.change_supplier_due(uuid, uuid, uuid, integer, text, date, text),
  sw_private.guard_action_supplier_work(),
  public.sw_set_member_sharing(uuid, uuid, boolean), public.sw_set_asset_impact(uuid, uuid, text, text),
  public.sw_save_supplier_request(uuid, uuid, uuid, integer, jsonb), public.sw_approve_supplier_share(uuid, uuid, uuid, integer, text, text),
  public.sw_record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz), public.sw_record_supplier_response(uuid, uuid, uuid, integer, jsonb),
  public.sw_verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text), public.sw_reopen_supplier_request(uuid, uuid, uuid, integer, text),
  public.sw_withdraw_supplier_request(uuid, uuid, uuid, integer, text), public.sw_change_supplier_due(uuid, uuid, uuid, integer, text, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
-- Policy helpers and the commands (each checks its own right) for authenticated only.
GRANT EXECUTE ON FUNCTION
  sw_private.can_see_supplier_request(uuid, uuid), sw_private.can_see_subject(uuid, text, uuid),
  sw_private.set_member_sharing(uuid, uuid, boolean), sw_private.set_asset_impact(uuid, uuid, text, text),
  sw_private.save_supplier_request(uuid, uuid, uuid, integer, jsonb), sw_private.approve_supplier_share(uuid, uuid, uuid, integer, text, text),
  sw_private.record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz), sw_private.record_supplier_response(uuid, uuid, uuid, integer, jsonb),
  sw_private.verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text), sw_private.reopen_supplier_request(uuid, uuid, uuid, integer, text),
  sw_private.withdraw_supplier_request(uuid, uuid, uuid, integer, text), sw_private.change_supplier_due(uuid, uuid, uuid, integer, text, date, text),
  public.sw_set_member_sharing(uuid, uuid, boolean), public.sw_set_asset_impact(uuid, uuid, text, text),
  public.sw_save_supplier_request(uuid, uuid, uuid, integer, jsonb), public.sw_approve_supplier_share(uuid, uuid, uuid, integer, text, text),
  public.sw_record_supplier_dispatch(uuid, uuid, uuid, integer, text, text, timestamptz), public.sw_record_supplier_response(uuid, uuid, uuid, integer, jsonb),
  public.sw_verify_supplier_response(uuid, uuid, uuid, integer, uuid, text, text, text, text), public.sw_reopen_supplier_request(uuid, uuid, uuid, integer, text),
  public.sw_withdraw_supplier_request(uuid, uuid, uuid, integer, text), public.sw_change_supplier_due(uuid, uuid, uuid, integer, text, date, text)
  TO authenticated;

COMMIT;
