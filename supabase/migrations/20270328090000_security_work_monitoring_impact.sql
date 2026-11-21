-- =============================================================================
-- Security Work Release B: monitoring to a reviewed risk/action.
-- Permitted source -> signed fetch -> story cluster -> customer-specific
-- impact brief -> human review -> risk/actions -> follow-up and export.
-- =============================================================================
--
-- Next canonical ledger slot after 20270327090000. Schema only. NO feed host is
-- approved by this file (sw_feed_hosts is empty), no worker key is created and
-- no schedule exists: after installation nothing can be fetched until the
-- owner approves a host and provisions the worker key, exactly as for
-- extraction. Manual sources keep working as before.
--
-- 1. sw_feed_hosts: the platform allowlist of official feed hosts (publisher,
--    terms reference). Read-only for members, written only by a reviewed
--    migration or the owner's out-of-band process.
-- 2. sw_sources gains source_type 'official_feed' with feed_url (https, host on
--    the allowlist) and an optional poll target. Health columns (last success,
--    last check, failure, validators) change only inside a signed fetch.
-- 3. sw_record_fetch: the worker's signed receipt for one fetch run (HMAC with
--    the existing worker key, kind 'fetch'). One run id = one run (idempotent).
--    New items are deduplicated per source, stored as retrieval_status
--    'fetched' (impossible to forge outside this function), clustered by story
--    and queued for triage. A copy of the same text does not count as an
--    independent source. New evidence in a cluster cited by an approved brief
--    raises a review flag; it never edits the approved brief.
-- 4. sw_change_briefs: the customer-specific impact brief. Its evidence is
--    built by the database from the cited source items (title, publisher, URL,
--    publication/observation/retrieval times, excerpt), never accepted from the
--    client. draft -> in_review -> approved | rejected (approval needs an
--    approver); approved briefs are immutable; a new revision supersedes.
-- 5. sw_apply_change_brief: from an approved brief, create the reviewed risk
--    and actions, link them to the mission and the evidence sources, in one
--    transaction, once per brief; a retry of the same request returns the
--    receipt; anything else is a conflict.
--
-- Rollback: supabase/rollback/20270328090000_security_work_monitoring_impact_rollback.sql
-- Suite:    supabase/tests/security_work_monitoring_impact_test.sql
BEGIN;

DO $precondition$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sw_sources'::regclass AND conname = 'sw_sources_source_type_check'
                 AND pg_get_constraintdef(oid) LIKE '%''manual''::text, ''url_reference''::text, ''document''::text%')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sw_source_items'::regclass AND conname = 'sw_source_items_retrieval_status_check'
                 AND pg_get_constraintdef(oid) LIKE '%''manual''::text, ''extracted''::text%') THEN
    RAISE EXCEPTION 'SW_MONITORING_PRECONDITION: source constraints differ from 20261211090000';
  END IF;
END
$precondition$;

-- -----------------------------------------------------------------------------
-- 1. Approved feed hosts (platform, empty)
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_feed_hosts (
  host text PRIMARY KEY CHECK (host = lower(host) AND host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$' AND position('.' IN host) > 0),
  publisher text NOT NULL CHECK (char_length(btrim(publisher)) BETWEEN 1 AND 200),
  terms_reference text NOT NULL CHECK (char_length(btrim(terms_reference)) BETWEEN 1 AND 2000),
  approval_note text NOT NULL CHECK (char_length(btrim(approval_note)) BETWEEN 1 AND 2000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Official feed sources and protected health
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_sources
  DROP CONSTRAINT sw_sources_source_type_check,
  ADD CONSTRAINT sw_sources_source_type_check CHECK (source_type IN ('manual', 'url_reference', 'document', 'official_feed')),
  ADD COLUMN feed_url text CHECK (feed_url IS NULL OR (feed_url ~ '^https://[^[:space:]]+$' AND char_length(feed_url) <= 2048)),
  ADD COLUMN poll_target_minutes integer CHECK (poll_target_minutes IS NULL OR poll_target_minutes BETWEEN 15 AND 10080),
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN feed_etag text CHECK (feed_etag IS NULL OR char_length(feed_etag) <= 500),
  ADD COLUMN feed_last_modified text CHECK (feed_last_modified IS NULL OR char_length(feed_last_modified) <= 100),
  ADD CONSTRAINT sw_sources_feed_url_required CHECK (source_type <> 'official_feed' OR feed_url IS NOT NULL);

ALTER TABLE public.sw_source_items
  DROP CONSTRAINT sw_source_items_retrieval_status_check,
  ADD CONSTRAINT sw_source_items_retrieval_status_check CHECK (retrieval_status IN ('manual', 'extracted', 'fetched')),
  ADD COLUMN observed_at timestamptz,
  ADD COLUMN content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$');

CREATE TABLE sw_private.fetch_intents (
  source_id uuid PRIMARY KEY,
  transaction_id bigint NOT NULL
);
ALTER TABLE sw_private.fetch_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sw_private.fetch_intents FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION sw_private.feed_host(_url text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(substring(_url FROM '^https://([^/:?#]+)'))
$$;

CREATE FUNCTION sw_private.guard_feed_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _in_fetch boolean;
BEGIN
  _in_fetch := EXISTS (SELECT 1 FROM sw_private.fetch_intents i WHERE i.source_id = NEW.id AND i.transaction_id = txid_current());
  IF NEW.source_type = 'official_feed' AND (TG_OP = 'INSERT' OR NEW.feed_url IS DISTINCT FROM OLD.feed_url OR NEW.source_type IS DISTINCT FROM OLD.source_type) THEN
    IF NOT EXISTS (SELECT 1 FROM public.sw_feed_hosts h WHERE h.host = sw_private.feed_host(NEW.feed_url) AND h.active) THEN
      RAISE EXCEPTION 'SW_FEED_HOST_NOT_APPROVED' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- Coverage cannot be claimed: health moves only inside a signed fetch.
  IF NOT _in_fetch AND (
       (TG_OP = 'INSERT' AND (NEW.last_success_at IS NOT NULL OR NEW.last_failure_at IS NOT NULL OR NEW.last_failure IS NOT NULL
                              OR NEW.last_checked_at IS NOT NULL OR NEW.feed_etag IS NOT NULL OR NEW.feed_last_modified IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (NEW.last_success_at IS DISTINCT FROM OLD.last_success_at OR NEW.last_failure_at IS DISTINCT FROM OLD.last_failure_at
                              OR NEW.last_failure IS DISTINCT FROM OLD.last_failure OR NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at
                              OR NEW.feed_etag IS DISTINCT FROM OLD.feed_etag OR NEW.feed_last_modified IS DISTINCT FROM OLD.feed_last_modified))) THEN
    RAISE EXCEPTION 'SW_FETCH_HEALTH_PROTECTED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_09_feed_source BEFORE INSERT OR UPDATE ON public.sw_sources FOR EACH ROW EXECUTE FUNCTION sw_private.guard_feed_source();

CREATE FUNCTION sw_private.guard_fetched_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.retrieval_status = 'fetched' OR NEW.content_hash IS NOT NULL) AND NOT EXISTS (
       SELECT 1 FROM sw_private.fetch_intents i WHERE i.source_id = NEW.source_id AND i.transaction_id = txid_current()) THEN
    RAISE EXCEPTION 'SW_FETCH_PROVENANCE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_07_fetched_item BEFORE INSERT ON public.sw_source_items FOR EACH ROW EXECUTE FUNCTION sw_private.guard_fetched_item();

-- -----------------------------------------------------------------------------
-- 3. Fetch runs, story clusters, review flags
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_fetch_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  source_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'not_modified', 'failed')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  items_seen integer NOT NULL DEFAULT 0 CHECK (items_seen BETWEEN 0 AND 500),
  items_new integer NOT NULL DEFAULT 0 CHECK (items_new BETWEEN 0 AND 500),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, source_id) REFERENCES public.sw_sources(workspace_id, id),
  CHECK ((status = 'failed') = (error_code IS NOT NULL))
);
CREATE INDEX sw_fetch_runs_source ON public.sw_fetch_runs(workspace_id, source_id, created_at DESC);

CREATE TABLE public.sw_story_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  story_key text NOT NULL CHECK (story_key ~ '^[0-9a-f]{32}$'),
  title text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  latest_item_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL DEFAULT 0,
  -- Distinct publishers after collapsing identical text: copies are not corroboration.
  independent_sources integer NOT NULL DEFAULT 0,
  has_copies boolean NOT NULL DEFAULT false,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, story_key)
);
CREATE TABLE public.sw_cluster_items (
  workspace_id uuid NOT NULL,
  cluster_id uuid NOT NULL,
  source_item_id uuid NOT NULL,
  PRIMARY KEY (cluster_id, source_item_id),
  UNIQUE (workspace_id, source_item_id),
  FOREIGN KEY (workspace_id, cluster_id) REFERENCES public.sw_story_clusters(workspace_id, id),
  FOREIGN KEY (workspace_id, source_item_id) REFERENCES public.sw_source_items(workspace_id, id)
);

-- -----------------------------------------------------------------------------
-- 4. Impact briefs
-- -----------------------------------------------------------------------------
CREATE TABLE public.sw_change_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.sw_workspaces(id),
  mission_id uuid,
  requirement_id uuid,
  cluster_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  what_changed text NOT NULL DEFAULT '' CHECK (char_length(what_changed) <= 8000),
  known text NOT NULL DEFAULT '' CHECK (char_length(known) <= 8000),
  why_it_matters text NOT NULL DEFAULT '' CHECK (char_length(why_it_matters) <= 8000),
  uncertain text NOT NULL DEFAULT '' CHECK (char_length(uncertain) <= 8000),
  proposed_actions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(proposed_actions) = 'array' AND jsonb_array_length(proposed_actions) <= 10 AND octet_length(proposed_actions::text) <= 16384),
  relevance jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(relevance) = 'object' AND octet_length(relevance::text) <= 8192),
  evidence_item_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_item_ids) <= 50),
  evidence jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(evidence) = 'array'),
  operating_profile_version integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'superseded')),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 2000),
  supersedes_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, mission_id) REFERENCES public.sw_missions(workspace_id, id),
  FOREIGN KEY (workspace_id, requirement_id) REFERENCES public.sw_intelligence_requirements(workspace_id, id),
  FOREIGN KEY (workspace_id, cluster_id) REFERENCES public.sw_story_clusters(workspace_id, id),
  FOREIGN KEY (workspace_id, operating_profile_version) REFERENCES public.sw_operating_profiles(workspace_id, profile_version),
  FOREIGN KEY (workspace_id, supersedes_id) REFERENCES public.sw_change_briefs(workspace_id, id),
  CHECK ((status IN ('approved', 'rejected', 'superseded')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX sw_one_open_revision ON public.sw_change_briefs(workspace_id, supersedes_id) WHERE supersedes_id IS NOT NULL AND status IN ('draft', 'in_review');

CREATE TABLE public.sw_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  brief_id uuid NOT NULL,
  source_item_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('new_evidence_in_cited_story')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note text NOT NULL DEFAULT '' CHECK (char_length(resolution_note) <= 2000),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (brief_id, source_item_id),
  FOREIGN KEY (workspace_id, brief_id) REFERENCES public.sw_change_briefs(workspace_id, id),
  FOREIGN KEY (workspace_id, source_item_id) REFERENCES public.sw_source_items(workspace_id, id),
  CHECK ((status = 'resolved') = (resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND btrim(resolution_note) <> ''))
);

CREATE TABLE public.sw_change_brief_applications (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  brief_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  risk_id uuid,
  action_ids uuid[] NOT NULL DEFAULT '{}',
  applied_by uuid NOT NULL REFERENCES auth.users(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, brief_id) REFERENCES public.sw_change_briefs(workspace_id, id)
);

-- Briefs: evidence is built here from the cited items; the client never supplies it.
CREATE FUNCTION sw_private.guard_change_brief() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _ids uuid[]; _evidence jsonb; _found integer; _kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.submitted_by IS NOT NULL OR NEW.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'SW_INITIAL_STATE_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.status IN ('approved', 'rejected', 'superseded') THEN
      -- The only change to a decided brief: approved -> superseded by its approved revision.
      IF NOT (OLD.status = 'approved' AND NEW.status = 'superseded'
              AND (to_jsonb(NEW) - ARRAY['status', 'version', 'updated_at']) = (to_jsonb(OLD) - ARRAY['status', 'version', 'updated_at'])
              AND EXISTS (SELECT 1 FROM public.sw_change_briefs r WHERE r.workspace_id = OLD.workspace_id AND r.supersedes_id = OLD.id AND r.status = 'approved')) THEN
        RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'SW_DECISION_STAMP_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id THEN RAISE EXCEPTION 'SW_IMMUTABLE_FIELD: supersedes_id' USING ERRCODE = '23514'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT ((OLD.status = 'draft' AND NEW.status = 'in_review') OR (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved', 'rejected'))) THEN
        RAISE EXCEPTION 'SW_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      -- A decision is about exactly the content that was submitted.
      IF OLD.status = 'in_review' AND NEW.status IN ('approved', 'rejected')
         AND (to_jsonb(NEW) - ARRAY['status', 'decision_note', 'approved_by', 'approved_at', 'version', 'updated_at'])
             IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'decision_note', 'approved_by', 'approved_at', 'version', 'updated_at']) THEN
        RAISE EXCEPTION 'SW_REVIEW_CONTENT_FROZEN' USING ERRCODE = '23514';
      END IF;
      IF NEW.status = 'in_review' THEN NEW.submitted_by := auth.uid(); NEW.submitted_at := now(); END IF;
      IF NEW.status IN ('approved', 'rejected') THEN
        IF NOT sw_private.can_approve(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_APPROVER_REQUIRED' USING ERRCODE = '42501'; END IF;
        IF NEW.status = 'approved' AND (btrim(NEW.what_changed) = '' OR btrim(NEW.why_it_matters) = '' OR cardinality(NEW.evidence_item_ids) = 0) THEN
          RAISE EXCEPTION 'SW_BRIEF_INCOMPLETE' USING ERRCODE = '23514';
        END IF;
        IF NEW.status = 'rejected' AND btrim(NEW.decision_note) = '' THEN RAISE EXCEPTION 'SW_DECISION_NOTE_REQUIRED' USING ERRCODE = '23514'; END IF;
        NEW.approved_by := auth.uid(); NEW.approved_at := now();
      END IF;
      IF NEW.status = 'draft' THEN NEW.submitted_by := NULL; NEW.submitted_at := NULL; END IF;
    ELSIF OLD.status = 'in_review' AND (to_jsonb(NEW) - ARRAY['decision_note', 'version', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['decision_note', 'version', 'updated_at']) THEN
      -- Content under review is frozen; send it back to draft to change it.
      RAISE EXCEPTION 'SW_REVIEW_CONTENT_FROZEN' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.mission_id IS NOT NULL THEN
    SELECT m.kind INTO _kind FROM public.sw_missions m WHERE m.workspace_id = NEW.workspace_id AND m.id = NEW.mission_id;
    IF _kind IS DISTINCT FROM 'monitoring_impact' THEN RAISE EXCEPTION 'SW_MONITORING_MISSION_REQUIRED' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND TG_OP = 'INSERT' AND NOT EXISTS (
       SELECT 1 FROM public.sw_change_briefs o WHERE o.workspace_id = NEW.workspace_id AND o.id = NEW.supersedes_id AND o.status = 'approved') THEN
    RAISE EXCEPTION 'SW_REVISION_OF_APPROVED_REQUIRED' USING ERRCODE = '23514';
  END IF;
  -- Build the evidence from the cited items as the caller may read them.
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO _ids FROM unnest(NEW.evidence_item_ids) x;
  NEW.evidence_item_ids := _ids;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'sourceItemId', i.id, 'sourceId', i.source_id, 'title', i.original_title, 'publisher', i.publisher,
           'url', i.canonical_url, 'publishedAt', i.published_at, 'observedAt', i.observed_at, 'retrievedAt', i.retrieved_at,
           'retrievalStatus', i.retrieval_status, 'excerpt', left(i.factual_extract, 600))
           ORDER BY i.published_at NULLS LAST, i.id), '[]'::jsonb)
    INTO _found, _evidence
    FROM public.sw_source_items i WHERE i.workspace_id = NEW.workspace_id AND i.id = ANY(_ids);
  IF _found <> cardinality(_ids) THEN RAISE EXCEPTION 'SW_EVIDENCE_NOT_FOUND' USING ERRCODE = '23514'; END IF;
  NEW.evidence := _evidence;
  RETURN NEW;
END $$;

CREATE FUNCTION sw_private.supersede_previous_brief() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.sw_change_briefs SET status = 'superseded' WHERE workspace_id = NEW.workspace_id AND id = NEW.supersedes_id AND status = 'approved';
    UPDATE public.sw_review_flags SET status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
           resolution_note = 'Superseded by an approved revision'
     WHERE workspace_id = NEW.workspace_id AND brief_id = NEW.supersedes_id AND status = 'open';
  END IF;
  RETURN NULL;
END $$;

-- A flag, an application receipt and a brief's history are need-to-know
-- exactly like the brief they belong to: a restricted mission's circle only,
-- whatever the person's workspace role (an owner outside the circle included).
CREATE FUNCTION sw_private.can_see_brief(_workspace_id uuid, _brief_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sw_private.can_read(_workspace_id) AND EXISTS (
    SELECT 1 FROM public.sw_change_briefs b
    WHERE b.workspace_id = _workspace_id AND b.id = _brief_id
      AND (b.mission_id IS NULL OR sw_private.can_see_mission(_workspace_id, b.mission_id)));
$$;

-- The workspace audit feed is readable by every member, so a brief inside a
-- mission records its history as mission events, which carry the mission's
-- own visibility (as Release A does for missions themselves).
CREATE FUNCTION sw_private.record_brief_mission_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT coalesce(sw_private.is_human(), false) THEN RAISE EXCEPTION 'SW_HUMAN_REQUIRED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.sw_mission_events(workspace_id, mission_id, actor_user_id, event, from_value, to_value, record_version)
  VALUES (NEW.workspace_id, NEW.mission_id, auth.uid(), 'impact_brief_changed',
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, NEW.version);
  RETURN NULL;
END $$;

CREATE FUNCTION sw_private.guard_review_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT sw_private.can_edit(NEW.workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT sw_private.can_see_brief(NEW.workspace_id, NEW.brief_id) THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF OLD.status = 'resolved' THEN RAISE EXCEPTION 'SW_RECORD_FINAL' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'resolution_note', 'resolved_by', 'resolved_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'resolution_note', 'resolved_by', 'resolved_at']) THEN
    RAISE EXCEPTION 'SW_FLAG_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'resolved' THEN NEW.resolved_by := auth.uid(); NEW.resolved_at := now(); END IF;
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- The signed fetch receipt
-- -----------------------------------------------------------------------------
-- A story is the first five words of its normalised headline: explainable,
-- deterministic, and it keeps follow-ups and copies of a headline together.
CREATE FUNCTION sw_private.story_key(_title text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT md5(array_to_string((regexp_split_to_array(btrim(regexp_replace(regexp_replace(lower(coalesce(_title, '')),
    '[^[:alnum:][:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ' '))[1:5], ' '))
$$;

CREATE FUNCTION sw_private.record_fetch(_workspace_id uuid, _run_id uuid, _source_id uuid, _key_id text, _payload text, _signature text) RETURNS public.sw_fetch_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sw_fetch_runs; s public.sw_sources; body jsonb; item jsonb; outcome text; _new integer := 0; _seen integer := 0;
        _item uuid; _cluster uuid; _key text; _guid text; _url text; _hash text; _title text;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _payload IS NULL OR octet_length(_payload) > 1048576 THEN RAISE EXCEPTION 'SW_PAYLOAD_TOO_LARGE' USING ERRCODE = '23514'; END IF;
  PERFORM sw_private.check_receipt('fetch', _run_id, _source_id, _key_id, _payload, _signature);
  SELECT * INTO r FROM public.sw_fetch_runs WHERE id = _run_id;
  IF FOUND THEN
    IF r.workspace_id <> _workspace_id OR r.source_id <> _source_id OR r.payload_hash <> sw_private.hash_text(_payload) THEN
      RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN r;
  END IF;
  SELECT * INTO s FROM public.sw_sources WHERE workspace_id = _workspace_id AND id = _source_id FOR UPDATE;
  IF s.id IS NULL OR s.source_type <> 'official_feed' OR NOT s.active
     OR NOT EXISTS (SELECT 1 FROM public.sw_feed_hosts h WHERE h.host = sw_private.feed_host(s.feed_url) AND h.active) THEN
    RAISE EXCEPTION 'SW_FEED_NOT_PERMITTED' USING ERRCODE = '42501';
  END IF;
  body := _payload::jsonb; outcome := body->>'status';
  IF jsonb_typeof(body) <> 'object' OR outcome NOT IN ('succeeded', 'not_modified', 'failed')
     OR (outcome = 'succeeded' AND jsonb_typeof(body->'items') IS DISTINCT FROM 'array')
     OR jsonb_array_length(coalesce(body->'items', '[]')) > 200 THEN
    RAISE EXCEPTION 'SW_FETCH_PAYLOAD_INVALID' USING ERRCODE = '23514';
  END IF;
  INSERT INTO sw_private.fetch_intents VALUES (_source_id, txid_current());
  IF outcome = 'succeeded' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(body->'items') LOOP
      _seen := _seen + 1;
      _title := left(btrim(coalesce(item->>'title', '')), 500);
      _url := CASE WHEN item->>'url' ~ '^https://[^[:space:]]+$' AND char_length(item->>'url') <= 2048 THEN item->>'url' END;
      _guid := left(coalesce(nullif(btrim(item->>'guid'), ''), _url, _title), 2000);
      _hash := item->>'contentHash';
      IF _title = '' OR btrim(coalesce(item->>'text', '')) = '' OR _hash IS NULL OR _hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SW_FETCH_ITEM_INVALID' USING ERRCODE = '23514';
      END IF;
      _key := 'feed:' || sw_private.hash_text(_guid);
      IF EXISTS (SELECT 1 FROM public.sw_source_items WHERE workspace_id = _workspace_id AND source_id = _source_id AND deduplication_key = _key) THEN
        CONTINUE;
      END IF;
      INSERT INTO public.sw_source_items(workspace_id, source_id, deduplication_key, original_title, publisher, canonical_url,
                                         published_at, observed_at, factual_extract, language, retrieval_status, content_hash)
      VALUES (_workspace_id, _source_id, _key, _title, s.publisher, _url,
              (item->>'publishedAt')::timestamptz, (item->>'observedAt')::timestamptz,
              left(btrim(item->>'text'), 8000), s.language, 'fetched', _hash)
      RETURNING id INTO _item;
      _new := _new + 1;
      INSERT INTO public.sw_story_clusters(workspace_id, story_key, title) VALUES (_workspace_id, sw_private.story_key(_title), _title)
      ON CONFLICT (workspace_id, story_key) DO UPDATE SET latest_item_at = now()
      RETURNING id INTO _cluster;
      INSERT INTO public.sw_cluster_items(workspace_id, cluster_id, source_item_id) VALUES (_workspace_id, _cluster, _item);
      UPDATE public.sw_story_clusters c SET
        item_count = (SELECT count(*) FROM public.sw_cluster_items ci WHERE ci.cluster_id = c.id),
        -- Deterministic and conservative: a copy adds no source (it shares the
        -- text) and one publisher counts once however many texts it has.
        independent_sources = (SELECT least(count(DISTINCT si.publisher), count(DISTINCT si.content_hash))
              FROM public.sw_cluster_items ci JOIN public.sw_source_items si ON si.workspace_id = ci.workspace_id AND si.id = ci.source_item_id
             WHERE ci.cluster_id = c.id),
        has_copies = EXISTS (SELECT 1 FROM public.sw_cluster_items a JOIN public.sw_source_items sa ON sa.id = a.source_item_id
                             JOIN public.sw_cluster_items b ON b.cluster_id = a.cluster_id AND b.source_item_id <> a.source_item_id
                             JOIN public.sw_source_items sb ON sb.id = b.source_item_id
                             WHERE a.cluster_id = c.id AND sa.content_hash = sb.content_hash)
      WHERE c.id = _cluster;
      INSERT INTO public.sw_intelligence_items(workspace_id, source_item_id, title) VALUES (_workspace_id, _item, _title);
      -- New evidence in a story an approved brief relied on: flag it, never edit it.
      INSERT INTO public.sw_review_flags(workspace_id, brief_id, source_item_id, reason)
      SELECT DISTINCT b.workspace_id, b.id, _item, 'new_evidence_in_cited_story'
        FROM public.sw_change_briefs b
       WHERE b.workspace_id = _workspace_id AND b.status = 'approved'
         AND EXISTS (SELECT 1 FROM public.sw_cluster_items ci WHERE ci.cluster_id = _cluster AND ci.source_item_id = ANY(b.evidence_item_ids))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  UPDATE public.sw_sources SET
    last_checked_at = now(),
    last_success_at = CASE WHEN outcome IN ('succeeded', 'not_modified') THEN now() ELSE last_success_at END,
    last_failure_at = CASE WHEN outcome = 'failed' THEN now() ELSE last_failure_at END,
    last_failure = CASE WHEN outcome = 'failed' THEN left(body->>'errorCode', 100) ELSE NULL END,
    feed_etag = CASE WHEN outcome = 'succeeded' THEN left(body->>'etag', 500) ELSE feed_etag END,
    feed_last_modified = CASE WHEN outcome = 'succeeded' THEN left(body->>'lastModified', 100) ELSE feed_last_modified END
   WHERE id = _source_id;
  DELETE FROM sw_private.fetch_intents WHERE source_id = _source_id;
  INSERT INTO public.sw_fetch_runs(id, workspace_id, source_id, status, http_status, error_code, items_seen, items_new, payload_hash)
  VALUES (_run_id, _workspace_id, _source_id, outcome, (body->>'httpStatus')::integer,
          CASE WHEN outcome = 'failed' THEN coalesce(left(body->>'errorCode', 100), 'unknown') END, _seen, _new, sw_private.hash_text(_payload))
  RETURNING * INTO r;
  RETURN r;
END $$;
CREATE FUNCTION public.sw_record_fetch(_workspace_id uuid, _run_id uuid, _source_id uuid, _key_id text, _payload text, _signature text) RETURNS public.sw_fetch_runs
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.record_fetch(_workspace_id, _run_id, _source_id, _key_id, _payload, _signature)$$;

-- -----------------------------------------------------------------------------
-- 5. Approved brief -> risk and actions, once
-- -----------------------------------------------------------------------------
CREATE FUNCTION sw_private.apply_change_brief(_workspace_id uuid, _brief_id uuid, _expected_version integer, _request_id uuid, _apply jsonb) RETURNS public.sw_change_brief_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
END $$;
CREATE FUNCTION public.sw_apply_change_brief(_workspace_id uuid, _brief_id uuid, _expected_version integer, _request_id uuid, _apply jsonb) RETURNS public.sw_change_brief_applications
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.apply_change_brief(_workspace_id, _brief_id, _expected_version, _request_id, _apply)$$;

-- -----------------------------------------------------------------------------
-- 6. Privileges, policies, triggers
-- -----------------------------------------------------------------------------
DO $security$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['sw_feed_hosts', 'sw_fetch_runs', 'sw_story_clusters', 'sw_cluster_items', 'sw_change_briefs', 'sw_review_flags', 'sw_change_brief_applications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', _table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', _table);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['sw_fetch_runs', 'sw_story_clusters', 'sw_cluster_items', 'sw_review_flags', 'sw_change_brief_applications'] LOOP
    EXECUTE format('CREATE INDEX %I ON public.%I (workspace_id)', _table || '_scope_idx', _table);
  END LOOP;
  -- Feeds, runs and stories are workspace-level: every member may read them.
  FOREACH _table IN ARRAY ARRAY['sw_fetch_runs', 'sw_story_clusters', 'sw_cluster_items'] LOOP
    EXECUTE format('CREATE POLICY sw_member_read ON public.%I FOR SELECT TO authenticated USING (sw_private.can_read(workspace_id))', _table);
  END LOOP;
END
$security$;
CREATE POLICY sw_active_hosts ON public.sw_feed_hosts FOR SELECT TO authenticated USING (active);

-- A brief tied to a restricted mission is need-to-know like the mission itself.
CREATE INDEX sw_change_briefs_scope_idx ON public.sw_change_briefs(workspace_id, status, updated_at DESC);
GRANT INSERT, UPDATE ON public.sw_change_briefs TO authenticated;
CREATE POLICY sw_brief_read ON public.sw_change_briefs FOR SELECT TO authenticated
  USING (sw_private.can_read(workspace_id) AND (mission_id IS NULL OR sw_private.can_see_mission(workspace_id, mission_id)));
CREATE POLICY sw_brief_insert ON public.sw_change_briefs FOR INSERT TO authenticated
  WITH CHECK (sw_private.can_edit(workspace_id) AND (mission_id IS NULL OR sw_private.can_see_mission(workspace_id, mission_id)));
CREATE POLICY sw_brief_update ON public.sw_change_briefs FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND (mission_id IS NULL OR sw_private.can_see_mission(workspace_id, mission_id)))
  WITH CHECK (sw_private.can_edit(workspace_id) AND (mission_id IS NULL OR sw_private.can_see_mission(workspace_id, mission_id)));
CREATE TRIGGER sw_10_guard BEFORE INSERT OR UPDATE ON public.sw_change_briefs FOR EACH ROW EXECUTE FUNCTION sw_private.guard_record();
CREATE TRIGGER sw_20_brief BEFORE INSERT OR UPDATE ON public.sw_change_briefs FOR EACH ROW EXECUTE FUNCTION sw_private.guard_change_brief();
CREATE TRIGGER sw_80_supersede AFTER UPDATE ON public.sw_change_briefs FOR EACH ROW EXECUTE FUNCTION sw_private.supersede_previous_brief();
CREATE TRIGGER sw_90_audit AFTER INSERT OR UPDATE ON public.sw_change_briefs FOR EACH ROW WHEN (NEW.mission_id IS NULL) EXECUTE FUNCTION sw_private.record_change();
CREATE TRIGGER sw_91_mission_audit AFTER INSERT OR UPDATE ON public.sw_change_briefs FOR EACH ROW WHEN (NEW.mission_id IS NOT NULL) EXECUTE FUNCTION sw_private.record_brief_mission_event();
ALTER TABLE public.sw_mission_events DROP CONSTRAINT sw_mission_events_event_check;
ALTER TABLE public.sw_mission_events ADD CONSTRAINT sw_mission_events_event_check CHECK (event IN ('created', 'state_changed', 'review_changed', 'brief_changed', 'member_added', 'member_removed', 'link_added', 'link_removed', 'restriction_changed', 'owner_changed', 'impact_brief_changed'));

CREATE POLICY sw_flag_read ON public.sw_review_flags FOR SELECT TO authenticated USING (sw_private.can_see_brief(workspace_id, brief_id));
CREATE POLICY sw_application_read ON public.sw_change_brief_applications FOR SELECT TO authenticated USING (sw_private.can_see_brief(workspace_id, brief_id));
GRANT UPDATE (status, resolution_note) ON public.sw_review_flags TO authenticated;
CREATE POLICY sw_flag_resolve ON public.sw_review_flags FOR UPDATE TO authenticated
  USING (sw_private.can_edit(workspace_id) AND sw_private.can_see_brief(workspace_id, brief_id))
  WITH CHECK (sw_private.can_edit(workspace_id) AND sw_private.can_see_brief(workspace_id, brief_id));
CREATE TRIGGER sw_20_flag BEFORE UPDATE ON public.sw_review_flags FOR EACH ROW EXECUTE FUNCTION sw_private.guard_review_flag();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_fetch_runs FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();
CREATE TRIGGER sw_00_immutable BEFORE UPDATE OR DELETE ON public.sw_change_brief_applications FOR EACH ROW EXECUTE FUNCTION sw_private.reject_history_change();

REVOKE ALL ON FUNCTION sw_private.feed_host(text), sw_private.guard_feed_source(), sw_private.guard_fetched_item(), sw_private.guard_change_brief(),
  sw_private.supersede_previous_brief(), sw_private.guard_review_flag(), sw_private.story_key(text),
  sw_private.can_see_brief(uuid, uuid), sw_private.record_brief_mission_event(),
  sw_private.record_fetch(uuid, uuid, uuid, text, text, text), sw_private.apply_change_brief(uuid, uuid, integer, uuid, jsonb),
  public.sw_record_fetch(uuid, uuid, uuid, text, text, text), public.sw_apply_change_brief(uuid, uuid, integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sw_private.record_fetch(uuid, uuid, uuid, text, text, text), sw_private.apply_change_brief(uuid, uuid, integer, uuid, jsonb),
  sw_private.can_see_brief(uuid, uuid),
  public.sw_record_fetch(uuid, uuid, uuid, text, text, text), public.sw_apply_change_brief(uuid, uuid, integer, uuid, jsonb)
  TO authenticated;

COMMENT ON TABLE public.sw_feed_hosts IS 'Platform allowlist of official feed hosts with their terms reference. Empty until the owner approves a host; nothing can be fetched before that.';
COMMENT ON TABLE public.sw_fetch_runs IS 'One signed fetch run (worker HMAC, kind fetch). A failed or empty run is coverage information, never evidence that nothing happened.';
COMMENT ON TABLE public.sw_story_clusters IS 'Fetched items grouped by story. independent_sources collapses identical text, so copies are not corroboration.';
COMMENT ON TABLE public.sw_change_briefs IS 'Customer-specific impact brief. Evidence is built by the database from cited source items. Approved briefs are immutable; new evidence raises sw_review_flags and a revision supersedes.';
COMMENT ON TABLE public.sw_change_brief_applications IS 'The one application of an approved brief: the risk and actions it created, in one transaction.';

COMMIT;
