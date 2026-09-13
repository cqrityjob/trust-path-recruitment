-- BESKT PR 4 — THE BRIDGE FROM A SUBMITTED CANDIDATE PREPARATION TO THE
-- INTERVIEW CASE THAT ALREADY EXISTS.
--
-- ── WHAT THIS IS, IN ONE SENTENCE ───────────────────────────────────────
--
-- A submitted BESKT preparation becomes a named, hash-bound SOURCE on the
-- employer's existing Interview Intelligence case, together with a list of
-- the questions the candidate chose not to answer in writing.
--
-- ── WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────────
--
-- It is NOT a second case system. `scp_interview_cases` is the case spine and
-- stays the case spine; `scp_interview_case_sources` is how a case learns
-- about material it did not generate, and this migration adds one member to
-- its governed vocabulary rather than a parallel table of its own. Nothing
-- here creates a case, changes a case's status, or writes to any scp_ table
-- other than that one source row.
--
-- It produces NO score, level, ranking, threshold, pass/fail, suitability,
-- credibility, truthfulness, risk or recommendation, and no AI reads anything.
-- There is no column for any of it, the proof block at the end refuses the
-- migration if one appears, and the only derived artefact is a list of
-- QUESTIONS carrying the candidate's own explicit state.
--
-- ── THE TWO THINGS THAT MUST BE TRUE ────────────────────────────────────
--
-- 1. ONLY A SUBMITTED SNAPSHOT. The employer may never see a draft, and the
--    bridge may never be built from one. `bcp_link_preparation_to_case`
--    refuses unless a submitted response exists, and it binds that response's
--    own id, version and revision along with the pinned method content hash
--    and the acknowledged notice version, hash and locale. Every one of those
--    is stored on the link, so "which exact words did the candidate answer,
--    having been shown which exact notice" is answerable years later from the
--    row rather than reconstructed.
--
-- 2. THE CASE AND THE PREPARATION ARE ABOUT THE SAME PERSON AND THE SAME
--    APPLICATION. Not "the same employer" — the same employer, the same job
--    application, and the same candidate account. A case that matches on
--    tenancy alone would let one candidate's preparation be attached to
--    another candidate's interview, which is the worst failure this domain
--    has available. It is checked in the RPC and again by a row trigger, so
--    it holds against a caller that bypasses the RPC and against BYPASSRLS.
--
-- ── NEUTRALITY OF THE DERIVED TOPICS ────────────────────────────────────
--
-- `bcp_case_topics` carries one row per question the candidate left `omitted`
-- or marked `discuss_orally`. The reason column admits exactly those two
-- values and nothing else: there is no "refused", no "evasive", no "gap". A
-- voluntary omission is not evidence of anything, and PR 1 section 7 forbids
-- reading it as such, so the schema gives nowhere to record that reading.
--
-- The list is MATERIALISED at link time rather than computed on read. That is
-- deliberate: it is derived from one immutable submitted snapshot, and
-- freezing it means the interview's agenda cannot drift if anything
-- downstream ever changes. The topics are append-only and carry the response
-- id they came from, so the derivation is checkable after the fact.
--
-- ── AUTHORISATION ───────────────────────────────────────────────────────
--
-- Linking is an EMPLOYER action. The candidate is not a party to it and
-- cannot perform it: they submitted their preparation, and what the employer
-- does with their own interview case is not a candidate mutation. The
-- candidate keeps the read they already had — their own preparation — and
-- gains no read of the employer's case.
--
-- Every table here is ENABLE + FORCE RLS with one SELECT policy and no client
-- write path at all. Writes happen only inside the SECURITY DEFINER RPCs
-- below, which re-check authorisation on every call.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · The governed source vocabulary learns one new member.
-- ---------------------------------------------------------------------------
--
-- `scp_interview_case_sources.source_kind` is a closed CHECK list, which is
-- why a BESKT preparation could not be registered as a source at all. The
-- constraint is looked up by catalogue rather than by name: it was created
-- inline, so its name is generated, and hard-coding a generated name is how a
-- migration breaks on a database that generated a different one.
DO $$
DECLARE
  _conname text;
BEGIN
  SELECT c.conname INTO _conname
    FROM pg_constraint c
   WHERE c.conrelid = 'public.scp_interview_case_sources'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%source_kind%'
   ORDER BY c.conname
   LIMIT 1;

  IF _conname IS NULL THEN
    RAISE EXCEPTION
      'BCP_BRIDGE: no source_kind check constraint found on scp_interview_case_sources.';
  END IF;

  EXECUTE format('ALTER TABLE public.scp_interview_case_sources DROP CONSTRAINT %I', _conname);
END $$;

ALTER TABLE public.scp_interview_case_sources
  ADD CONSTRAINT scp_interview_case_sources_source_kind_check
  CHECK (source_kind IN (
    'job_description',
    'employer_requirements',
    'candidate_cv',
    'application_answers',
    'interviewer_notes',
    'transcript',
    'passport_disclosure',
    -- NEW. A submitted BESKT candidate preparation, registered as a source of
    -- the case rather than copied into it: the row carries a label and the
    -- governed purpose, and the answers stay where they were written.
    'beskt_preparation'));

-- ---------------------------------------------------------------------------
-- 2 · The event vocabulary learns the two operations this migration adds.
-- ---------------------------------------------------------------------------
--
-- The BESKT ledger is append-only and its `event` column is a closed list, so
-- a new governed operation has to be admitted here before it can be recorded.
-- Reusing the ledger rather than starting a second one is the point: one
-- assignment has one history.
ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
ALTER TABLE public.bcp_events
  ADD CONSTRAINT bcp_events_event_check
  CHECK (event IN (
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked',
    'case_linked', 'case_unlinked'));

-- ---------------------------------------------------------------------------
-- 3 · The link itself.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_case_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The two things being joined, and the tenancy that must hold for both.
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE RESTRICT,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE RESTRICT,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- ── THE BOUND SNAPSHOT ──────────────────────────────────────────────
  --
  -- Not a pointer that could be re-read differently later: the exact identity
  -- of what was submitted, copied onto the link at the moment it was made.
  bound_response_id uuid NOT NULL REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,
  bound_response_version integer NOT NULL CHECK (bound_response_version >= 1),
  bound_assignment_revision integer NOT NULL CHECK (bound_assignment_revision >= 1),
  bound_method_version_id uuid NOT NULL
    REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  bound_content_hash text NOT NULL CHECK (bound_content_hash ~ '^[0-9a-f]{64}$'),
  bound_answers_content_hash text NOT NULL CHECK (bound_answers_content_hash ~ '^[0-9a-f]{64}$'),

  -- The notice the candidate actually read, in the locale they read it in.
  -- PR 3A made acknowledgement per-locale precisely so this could be true.
  bound_notice_version text NOT NULL CHECK (length(btrim(bound_notice_version)) > 0),
  bound_notice_content_hash text NOT NULL CHECK (bound_notice_content_hash ~ '^[0-9a-f]{64}$'),
  bound_notice_locale text NOT NULL CHECK (length(btrim(bound_notice_locale)) > 0),

  -- The source row this link created on the case. Deleting the source would
  -- orphan the link, so it is RESTRICT and the unlink path below marks rather
  -- than removes.
  source_id uuid NOT NULL
    REFERENCES public.scp_interview_case_sources(id) ON DELETE RESTRICT,

  -- Provenance, both directions.
  linked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  link_operation_id uuid NOT NULL UNIQUE,

  unlinked_at timestamptz,
  unlinked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  unlinked_reason text,
  unlink_operation_id uuid UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- A live link is one with no unlink; an unlinked one carries all three
  -- unlink columns or none of them.
  CONSTRAINT bcp_case_links_unlink_shape CHECK (
    (unlinked_at IS NULL AND unlinked_by IS NULL AND unlinked_reason IS NULL
     AND unlink_operation_id IS NULL)
    OR (unlinked_at IS NOT NULL AND unlinked_by IS NOT NULL
        AND unlink_operation_id IS NOT NULL
        AND length(btrim(coalesce(unlinked_reason, ''))) >= 3)),

  -- A generated slot, so "one live link" is an INDEX rather than a trigger a
  -- concurrent transaction could race past.
  live_slot uuid GENERATED ALWAYS AS (CASE WHEN unlinked_at IS NULL THEN assignment_id END) STORED,
  live_case_slot uuid GENERATED ALWAYS AS (CASE WHEN unlinked_at IS NULL THEN case_id END) STORED
);

-- One live link per preparation, and one live link per case. Both are partial
-- unique indexes on generated columns, so the database enforces them under
-- concurrency rather than a read-then-write in a function.
CREATE UNIQUE INDEX bcp_case_links_one_live_per_assignment_idx
  ON public.bcp_case_links (live_slot) WHERE live_slot IS NOT NULL;
CREATE UNIQUE INDEX bcp_case_links_one_live_per_case_idx
  ON public.bcp_case_links (live_case_slot) WHERE live_case_slot IS NOT NULL;

CREATE INDEX bcp_case_links_assignment_idx ON public.bcp_case_links (assignment_id);
CREATE INDEX bcp_case_links_case_idx ON public.bcp_case_links (case_id);
CREATE INDEX bcp_case_links_employer_idx ON public.bcp_case_links (employer_id);
CREATE INDEX bcp_case_links_application_idx ON public.bcp_case_links (application_id);
CREATE INDEX bcp_case_links_candidate_idx ON public.bcp_case_links (candidate_user_id);
CREATE INDEX bcp_case_links_response_idx ON public.bcp_case_links (bound_response_id);
CREATE INDEX bcp_case_links_method_version_idx ON public.bcp_case_links (bound_method_version_id);
CREATE INDEX bcp_case_links_source_idx ON public.bcp_case_links (source_id);
CREATE INDEX bcp_case_links_linked_by_idx ON public.bcp_case_links (linked_by);
CREATE INDEX bcp_case_links_unlinked_by_idx ON public.bcp_case_links (unlinked_by);

COMMENT ON TABLE public.bcp_case_links IS
  'One submitted BESKT preparation, bound to one existing interview case for '
  'the same employer, application and candidate. Carries the exact snapshot '
  'identity -- response, version, revision, method content hash, and the '
  'notice version, hash and locale the candidate acknowledged -- so what was '
  'answered, against what content, having been shown what notice, is '
  'answerable from the row. Append-only in effect: unlinking marks, never '
  'deletes.';

-- ---------------------------------------------------------------------------
-- 4 · The deterministic topics.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_case_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.bcp_case_links(id) ON DELETE RESTRICT,

  -- The response the topic was derived FROM, carried so the derivation can be
  -- re-checked against the same immutable snapshot later.
  derived_from_response_id uuid NOT NULL
    REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,

  item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  item_key text NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9_]*$'),

  -- EXACTLY the candidate's own two explicit states. There is no third value
  -- and there is deliberately nowhere to put one: 'refused', 'evasive', 'gap'
  -- and every other reading of a voluntary omission is forbidden by PR 1
  -- section 7, and a schema that could store it would be the place it
  -- eventually appeared.
  topic_reason text NOT NULL CHECK (topic_reason IN ('omitted', 'discuss_orally')),

  display_order integer NOT NULL CHECK (display_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (link_id, item_id)
);

CREATE INDEX bcp_case_topics_link_idx ON public.bcp_case_topics (link_id);
CREATE INDEX bcp_case_topics_response_idx ON public.bcp_case_topics (derived_from_response_id);
CREATE INDEX bcp_case_topics_item_idx ON public.bcp_case_topics (item_id);

COMMENT ON TABLE public.bcp_case_topics IS
  'The questions a candidate chose not to answer in writing, derived once '
  'from the bound submitted snapshot and frozen. A list of QUESTIONS carrying '
  'the candidate''s own explicit state -- omitted or discuss_orally -- and '
  'nothing else. It is not a finding, not a gap, not evidence, and carries no '
  'judgement of the candidate.';

-- ---------------------------------------------------------------------------
-- 5 · Invariants that hold against a direct table write.
-- ---------------------------------------------------------------------------
--
-- Everything below is enforced inside the governed RPCs too. It is repeated
-- here as a row trigger because a trigger holds against the database owner
-- and against BYPASSRLS, and the RPC does not.

CREATE OR REPLACE FUNCTION public.bcp_guard_case_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _src public.scp_interview_case_sources%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NO_DELETE: a link is unlinked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The only permitted change is an unlink, once, and nothing else may move
    -- with it. A link that could be re-pointed would break the binding this
    -- table exists to provide.
    IF OLD.unlinked_at IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: this link is already unlinked.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.assignment_id <> OLD.assignment_id
       OR NEW.case_id <> OLD.case_id
       OR NEW.employer_id <> OLD.employer_id
       OR NEW.application_id <> OLD.application_id
       OR NEW.candidate_user_id <> OLD.candidate_user_id
       OR NEW.bound_response_id <> OLD.bound_response_id
       OR NEW.bound_response_version <> OLD.bound_response_version
       OR NEW.bound_assignment_revision <> OLD.bound_assignment_revision
       OR NEW.bound_method_version_id <> OLD.bound_method_version_id
       OR NEW.bound_content_hash <> OLD.bound_content_hash
       OR NEW.bound_answers_content_hash <> OLD.bound_answers_content_hash
       OR NEW.bound_notice_version <> OLD.bound_notice_version
       OR NEW.bound_notice_content_hash <> OLD.bound_notice_content_hash
       OR NEW.bound_notice_locale <> OLD.bound_notice_locale
       OR NEW.source_id <> OLD.source_id
       OR NEW.linked_by <> OLD.linked_by
       OR NEW.linked_at <> OLD.linked_at
       OR NEW.link_operation_id <> OLD.link_operation_id THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: only the unlink columns may change.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.unlinked_at IS NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_UNLINK_ONLY: an update must be an unlink.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ONLY A SUBMITTED SNAPSHOT. Checked here, not only in the RPC, because a
  -- draft reaching an employer's case is the failure this whole domain is
  -- arranged to prevent.
  SELECT * INTO _r FROM public.bcp_responses WHERE id = NEW.bound_response_id;
  IF NOT FOUND OR _r.assignment_id <> NEW.assignment_id THEN
    RAISE EXCEPTION 'BCP_RESPONSE_NOT_IN_ASSIGNMENT: the bound response is not this preparation''s.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _r.response_state <> 'submitted' OR _r.submitted_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: the preparation is in state %, not submitted.', _a.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  -- The bound identity must be the snapshot's own, not a caller's assertion.
  IF NEW.bound_response_version <> _r.response_version
     OR NEW.bound_assignment_revision <> _a.revision
     OR NEW.bound_method_version_id <> _a.method_version_id
     OR NEW.bound_content_hash <> _a.pinned_content_hash
     OR NEW.bound_answers_content_hash <> _r.submitted_content_hash
     OR NEW.bound_notice_version <> _a.notice_version
     OR NEW.application_id <> _a.application_id
     OR NEW.employer_id <> _a.employer_id
     OR NEW.candidate_user_id <> _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_BOUND_SNAPSHOT_MISMATCH: the bound identity is not the preparation''s own.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The acknowledged notice, in the locale it was acknowledged in.
  IF NOT EXISTS (
    SELECT 1 FROM public.bcp_notice_acknowledgements ack
     WHERE ack.assignment_id = NEW.assignment_id
       AND ack.notice_version = NEW.bound_notice_version
       AND ack.notice_content_hash = NEW.bound_notice_content_hash
       AND ack.locale = NEW.bound_notice_locale) THEN
    RAISE EXCEPTION 'BCP_NOTICE_BINDING_UNKNOWN: no acknowledgement matches the bound notice.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── SAME EMPLOYER, SAME APPLICATION, SAME CANDIDATE ──────────────────
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.employer_id <> NEW.employer_id
     OR _c.application_id IS DISTINCT FROM NEW.application_id
     OR _c.candidate_user_id IS DISTINCT FROM NEW.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case and the preparation are not about the same application and candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source row must be this case's, and must be the governed kind.
  SELECT * INTO _src FROM public.scp_interview_case_sources WHERE id = NEW.source_id;
  IF NOT FOUND OR _src.case_id <> NEW.case_id OR _src.source_kind <> 'beskt_preparation' THEN
    RAISE EXCEPTION 'BCP_SOURCE_MISMATCH: the source row is not a beskt_preparation source of this case.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- A trigger function is reached BY THE TRIGGER, never by a caller. Postgres
-- grants EXECUTE to PUBLIC on a new function by default, and leaving that in
-- place would publish an invariant-checker as a callable API -- through
-- PostgREST, to anyone signed in. It is revoked from everyone, including
-- service_role: the trigger runs as the table owner regardless.
REVOKE ALL ON FUNCTION public.bcp_guard_case_link() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_case_links_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_case_links
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_case_link();

CREATE OR REPLACE FUNCTION public.bcp_guard_case_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.bcp_case_links%ROWTYPE;
  _state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BCP_CASE_TOPIC_APPEND_ONLY: a derived topic is never updated or deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = NEW.link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.derived_from_response_id <> _l.bound_response_id THEN
    RAISE EXCEPTION 'BCP_TOPIC_NOT_FROM_BOUND_SNAPSHOT: a topic must come from the link''s own bound response.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE DERIVATION IS NOT THE CALLER'S TO ASSERT. The reason recorded has to
  -- be the reason the candidate actually gave, read from the submitted answer
  -- itself. Without this, a caller could write 'omitted' against a question
  -- the candidate answered in full.
  SELECT an.response_state INTO _state
    FROM public.bcp_answers an
   WHERE an.response_id = _l.bound_response_id
     AND an.item_id = NEW.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_TOPIC_ITEM_NOT_ANSWERED: the item is not in the bound snapshot.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _state <> NEW.topic_reason THEN
    RAISE EXCEPTION 'BCP_TOPIC_REASON_MISMATCH: the snapshot records % for this item, not %.',
      _state, NEW.topic_reason USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_guard_case_topic() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_case_topics_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_case_topics
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_case_topic();

-- ---------------------------------------------------------------------------
-- 6 · Who may read.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bcp_case_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_case_links  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_case_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_case_topics FORCE  ROW LEVEL SECURITY;

-- The employer's own members, and the candidate the preparation belongs to.
--
-- The candidate reads the LINK -- they are entitled to know that their
-- submitted preparation has been attached to an interview -- and the topics
-- derived from their own answers. They gain nothing about the case beyond its
-- id: no status, no notes, no other source, no assessment. Those live in
-- scp_ tables whose own policies have never admitted a candidate and are not
-- touched here.
CREATE POLICY bcp_case_links_party_read ON public.bcp_case_links
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member'])
    OR candidate_user_id = auth.uid());

CREATE POLICY bcp_case_topics_party_read ON public.bcp_case_topics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bcp_case_links l
     WHERE l.id = link_id
       AND (public.has_employer_role(auth.uid(), l.employer_id, ARRAY['owner', 'admin', 'member'])
            OR l.candidate_user_id = auth.uid())));

-- No client writes anywhere, service_role included. Every write goes through a
-- SECURITY DEFINER RPC that re-checks the caller.
REVOKE ALL ON public.bcp_case_links  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_case_topics FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bcp_case_links  TO authenticated, service_role;
GRANT SELECT ON public.bcp_case_topics TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7 · Link a submitted preparation to an existing case.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_link_preparation_to_case(
  _operation_id uuid,
  _assignment_id uuid,
  _case_id uuid,
  _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _ack public.bcp_notice_acknowledgements%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _source_id uuid;
  _link_id uuid;
  _topics integer := 0;
  _label text;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_link_preparation_to_case',
    'assignment_id', _assignment_id,
    'case_id', _case_id,
    'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);

  -- Replay BEFORE any write, so a retried request is answered rather than
  -- repeated. The same operation id with a different payload is refused.
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- Serialise against the preparation, so two members of the same employer
  -- pressing the button at once produce one link and one refusal rather than
  -- two links or a torn write.
  PERFORM pg_advisory_xact_lock(hashtextextended(_assignment_id::text, 0));

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- AUTHORISATION: an employer action. The candidate is not a party to it.
  IF NOT public.has_employer_role(_caller, _a.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the preparation is at revision % but the request expected %. Reload and retry.',
      _a.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: a cancelled preparation cannot be linked.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: this preparation has no submitted response.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _ack FROM public.bcp_notice_acknowledgements
   WHERE assignment_id = _assignment_id
   ORDER BY acknowledged_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the preparation carries no acknowledgement.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Same employer, same application, same candidate. Tenancy alone is not
  -- enough: it would admit another candidate's case at the same employer.
  IF _c.employer_id <> _a.employer_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case belongs to another employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.application_id IS DISTINCT FROM _a.application_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this job application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.candidate_user_id IS DISTINCT FROM _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE assignment_id = _assignment_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this preparation is already linked to a case.'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE case_id = _case_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this case already has a linked preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- The source row on the EXISTING case. A pointer, not a copy: the answers
  -- stay in bcp_answers, and the label says what this is in plain words.
  _label := 'BESKT-förberedelse, inskickad ' || to_char(_r.submitted_at, 'YYYY-MM-DD');
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, linked_application_id,
     purpose_code, lawful_basis_note, provided_by, origin)
  VALUES
    (_case_id, 'beskt_preparation', _label, NULL, _a.application_id,
     'recruitment_interview',
     'Kandidatens egen inskickade BESKT-förberedelse för denna ansökan. '
     'Underlaget är kandidatens egna ord; det innehåller ingen poäng, '
     'rangordning eller bedömning.',
     _caller, 'candidate_application')
  RETURNING id INTO _source_id;

  INSERT INTO public.bcp_case_links
    (assignment_id, case_id, employer_id, application_id, candidate_user_id,
     bound_response_id, bound_response_version, bound_assignment_revision,
     bound_method_version_id, bound_content_hash, bound_answers_content_hash,
     bound_notice_version, bound_notice_content_hash, bound_notice_locale,
     source_id, linked_by, link_operation_id)
  VALUES
    (_assignment_id, _case_id, _a.employer_id, _a.application_id, _a.candidate_user_id,
     _r.id, _r.response_version, _a.revision,
     _a.method_version_id, _a.pinned_content_hash, _r.submitted_content_hash,
     _ack.notice_version, _ack.notice_content_hash, _ack.locale,
     _source_id, _caller, _operation_id)
  RETURNING id INTO _link_id;

  -- ── THE DETERMINISTIC DERIVATION ────────────────────────────────────
  --
  -- One row per question the candidate left omitted or asked to take orally,
  -- in the governed content's own order. Nothing is selected, weighted or
  -- prioritised: the set is exactly the submitted answers in those two states,
  -- and the order is the order the questions were asked in.
  INSERT INTO public.bcp_case_topics
    (link_id, derived_from_response_id, item_id, item_key, topic_reason, display_order)
  SELECT _link_id, _r.id, an.item_id, an.item_key, an.response_state,
         row_number() OVER (ORDER BY s.display_order, i.display_order, an.item_key)
    FROM public.bcp_answers an
    JOIN public.beskt_items i ON i.id = an.item_id
    JOIN public.beskt_sections s ON s.id = i.section_id
   WHERE an.response_id = _r.id
     AND an.response_state IN ('omitted', 'discuss_orally');
  GET DIAGNOSTICS _topics = ROW_COUNT;

  _result := jsonb_build_object(
    'link_id', _link_id,
    'case_id', _case_id,
    'source_id', _source_id,
    'topic_count', _topics,
    'bound_response_id', _r.id,
    'bound_response_version', _r.response_version,
    'bound_assignment_revision', _a.revision,
    'bound_content_hash', _a.pinned_content_hash,
    'bound_answers_content_hash', _r.submitted_content_hash,
    'bound_notice_version', _ack.notice_version,
    'bound_notice_content_hash', _ack.notice_content_hash,
    'bound_notice_locale', _ack.locale);

  PERFORM public.bcp_record_event(
    _assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'case_linked', _a.lifecycle_state, _a.lifecycle_state, NULL,
    _a.pinned_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _case_id, 'link_id', _link_id, 'topic_count', _topics));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_link_preparation_to_case(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_link_preparation_to_case(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_link_preparation_to_case(uuid, uuid, uuid, integer) IS
  'Bind a SUBMITTED BESKT preparation to an existing interview case for the '
  'same employer, application and candidate, register it as a governed source '
  'of that case, and derive the neutral interview topics from the bound '
  'snapshot. Employer members only; a draft is refused; the case is neither '
  'created nor advanced.';

-- ---------------------------------------------------------------------------
-- 8 · Unlink. Marks; never deletes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_unlink_preparation_from_case(
  _operation_id uuid,
  _link_id uuid,
  _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_unlink_preparation_from_case',
    'link_id', _link_id,
    'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(_caller, _l.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _l.unlinked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_ALREADY_UNLINKED: this link is already unlinked.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_l.assignment_id::text, 0));

  UPDATE public.bcp_case_links
     SET unlinked_at = now(), unlinked_by = _caller, unlinked_reason = _reason,
         unlink_operation_id = _operation_id
   WHERE id = _link_id;

  -- The source row on the case is marked erased rather than removed: the case
  -- keeps the fact that material was once attached, which is what an audit of
  -- the interview would need to see.
  UPDATE public.scp_interview_case_sources
     SET retention_state = 'erased', erased_at = now(), content_text = NULL
   WHERE id = _l.source_id AND retention_state <> 'erased';

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _l.assignment_id;

  _result := jsonb_build_object('link_id', _link_id, 'case_id', _l.case_id, 'unlinked', true);

  PERFORM public.bcp_record_event(
    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,
    'case_unlinked', _a.lifecycle_state, _a.lifecycle_state, _reason,
    _l.bound_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _l.case_id, 'link_id', _link_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_unlink_preparation_from_case(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_unlink_preparation_from_case(uuid, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9 · Read models.
-- ---------------------------------------------------------------------------
--
-- Which existing cases this submitted preparation could be linked to. It
-- answers with the employer's OWN cases for this application and candidate
-- only, so the screen cannot offer a case that the RPC would refuse.
CREATE OR REPLACE FUNCTION public.bcp_linkable_interview_cases(_assignment_id uuid)
RETURNS TABLE (
  case_id uuid,
  title text,
  status text,
  created_at timestamptz,
  already_linked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.status, c.created_at,
         EXISTS (SELECT 1 FROM public.bcp_case_links l
                  WHERE l.case_id = c.id AND l.unlinked_at IS NULL)
    FROM public.bcp_assignments a
    JOIN public.scp_interview_cases c
      ON c.employer_id = a.employer_id
     AND c.application_id IS NOT DISTINCT FROM a.application_id
     AND c.candidate_user_id IS NOT DISTINCT FROM a.candidate_user_id
   WHERE a.id = _assignment_id
     AND a.lifecycle_state = 'submitted'
     AND c.status <> 'cancelled'
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member'])
   ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.bcp_linkable_interview_cases(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_linkable_interview_cases(uuid) TO authenticated, service_role;

-- What the interview may read: the bound snapshot's identity, the candidate's
-- submitted answers, and the neutral topics. Never a draft -- the link cannot
-- exist without a submitted response, so there is no path from here to one.
CREATE OR REPLACE FUNCTION public.bcp_case_preparation_basis(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links
   WHERE case_id = _case_id AND unlinked_at IS NULL;
  IF NOT FOUND THEN
    -- Absent, not empty: a case with no linked preparation has none, and
    -- saying so is different from refusing.
    RETURN jsonb_build_object('case_id', _case_id, 'linked', false);
  END IF;

  IF NOT public.has_employer_role(_caller, _l.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'case_id', _case_id,
    'linked', true,
    'link_id', _l.id,
    'assignment_id', _l.assignment_id,
    'application_id', _l.application_id,
    'linked_at', _l.linked_at,
    'bound', jsonb_build_object(
      'response_id', _l.bound_response_id,
      'response_version', _l.bound_response_version,
      'assignment_revision', _l.bound_assignment_revision,
      'method_version_id', _l.bound_method_version_id,
      'content_hash', _l.bound_content_hash,
      'answers_content_hash', _l.bound_answers_content_hash,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'notice_locale', _l.bound_notice_locale),
    -- The candidate's own words, exactly as submitted.
    'answers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY s.display_order, i.display_order, an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE an.response_id = _l.bound_response_id), '[]'::jsonb),
    -- The frozen topics, in their derived order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _l.id), '[]'::jsonb),
    'produces_score', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_case_preparation_basis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_case_preparation_basis(uuid) TO authenticated, service_role;

-- The candidate's own view of the link: that it exists, and when. Nothing
-- about the employer's case beyond its existence.
CREATE OR REPLACE FUNCTION public.bcp_my_preparation_link(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.bcp_case_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: this preparation does not belong to you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links
   WHERE assignment_id = _assignment_id AND unlinked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('assignment_id', _assignment_id, 'linked', false);
  END IF;

  RETURN jsonb_build_object(
    'assignment_id', _assignment_id,
    'linked', true,
    'linked_at', _l.linked_at,
    'topic_count', (SELECT count(*) FROM public.bcp_case_topics t WHERE t.link_id = _l.id));
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_my_preparation_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_my_preparation_link(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10 · Postflight. The migration refuses itself if any of this is untrue.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  _t text;
  _n integer;
  _fn text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['bcp_case_links', 'bcp_case_topics'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
                      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: % is missing ENABLE or FORCE ROW LEVEL SECURITY.', _t;
    END IF;
    FOREACH _fn IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('authenticated', 'public.' || _t, _fn)
         OR has_table_privilege('anon', 'public.' || _t, _fn)
         OR has_table_privilege('service_role', 'public.' || _t, _fn) THEN
        RAISE EXCEPTION 'BCP_BRIDGE_PROOF: a role holds % on %.', _fn, _t;
      END IF;
    END LOOP;
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: anon can read %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t AND p.cmd <> 'SELECT') THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: % carries a write policy.', _t;
    END IF;
  END LOOP;

  -- No interpretation anywhere in the bridge.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name IN ('bcp_case_links', 'bcp_case_topics')
     AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire|confidence)'
          OR c.column_name = 'points');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: % forbidden column(s) exist in the bridge.', _n;
  END IF;

  -- The topic reason admits exactly the candidate's own two states.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bcp_case_topics'::regclass
       AND pg_get_constraintdef(oid) LIKE '%topic_reason%omitted%discuss_orally%') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: topic_reason is not constrained to the two neutral states.';
  END IF;

  -- One live link per preparation and per case, by index rather than by hope.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND indexname = 'bcp_case_links_one_live_per_assignment_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                     AND indexname = 'bcp_case_links_one_live_per_case_idx') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: the one-live-link indexes are missing.';
  END IF;

  -- Every new function pins its search_path and is unreachable by anon.
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('bcp_link_preparation_to_case',
                                  'bcp_unlink_preparation_from_case',
                                  'bcp_linkable_interview_cases',
                                  'bcp_case_preparation_basis',
                                  'bcp_my_preparation_link',
                                  'bcp_guard_case_link',
                                  'bcp_guard_case_topic') LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: % has no pinned search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;

  -- The two trigger functions are reachable by no client role at all.
  FOREACH _fn IN ARRAY ARRAY['bcp_guard_case_link()', 'bcp_guard_case_topic()'] LOOP
    IF has_function_privilege('authenticated', 'public.' || _fn, 'EXECUTE')
       OR has_function_privilege('service_role', 'public.' || _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_BRIDGE_PROOF: trigger function % is executable by a client role.', _fn;
    END IF;
  END LOOP;

  -- The governed vocabularies really did learn their new members.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.scp_interview_case_sources'::regclass
                    AND pg_get_constraintdef(oid) LIKE '%beskt_preparation%') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: the source vocabulary does not admit beskt_preparation.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bcp_events'::regclass
                    AND pg_get_constraintdef(oid) LIKE '%case_linked%case_unlinked%') THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: the event vocabulary does not admit the link operations.';
  END IF;

  -- This migration seeds nothing.
  SELECT count(*) INTO _n FROM public.bcp_case_links;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_BRIDGE_PROOF: the migration created % link row(s); it must seed none.', _n;
  END IF;

  RAISE NOTICE 'BESKT_INTERVIEW_CASE_BRIDGE_PROOF ok';
END $proof$;

COMMIT;
