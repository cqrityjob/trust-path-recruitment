-- ===========================================================================
-- BESKT PR 3 -- candidate preparation
-- ===========================================================================
--
-- Step 3 of the PR 1 delivery sequence
-- (docs/architecture/beskt-recruitment-method-discovery.md section 8):
--
--   "PR3 -- candidate preparation: assignment, notice/acknowledgement,
--    response versions, typed answers, idempotency, expected-revision
--    compare-and-swap, immutable submit snapshot/hash."
--
-- An authorised employer initiates a preparation from an EXISTING job
-- application. The candidate reads the governed notices, answers the
-- governed questionnaire, may omit an item or ask to take it orally, saves,
-- resumes, reviews, corrects and submits once. The employer then reads the
-- candidate's own submitted basis.
--
-- PR 3 records. It does not interpret. There is no score, no rank, no
-- pass/fail, no suitability, credibility or deception judgement, no
-- recommendation, no report and no application-status change -- not as a
-- column, not as a function and not as a code path. Section 9's postflight
-- proves it from the catalogue rather than asserting it in prose.
--
--
-- ---------------------------------------------------------------------------
-- WHY THE RUNTIME IS `bcp_` AND NOT `beskt_`
-- ---------------------------------------------------------------------------
--
-- PR #218's postflight asserts, over EVERY `beskt\_%` table, that
--
--   * no column names a candidate, applicant, application, job, case,
--     session, assignment, response, answer value or report; and
--   * no table outside the governance ledger carries a jsonb column.
--
-- Both are correct and deliberate invariants for the governed CONTENT
-- domain: a method version is a template and must never reference a person.
-- Candidate preparation is the RUNTIME, and every one of its tables has to
-- name exactly those things. Rather than weaken PR #218's proof so the
-- runtime can live under its prefix, PR 3 keeps it literally true and gives
-- the runtime its own prefix -- the same reasoning, and the same precedent,
-- by which PR #218 chose `beskt_` over `scp_` when the Security Competency
-- suite asserted that no `scp_` table carries FORCE RLS.
--
--   beskt_*  governed method CONTENT   -- templates, no person
--   bcp_*    BESKT Candidate Preparation RUNTIME -- employer, application,
--            candidate, answers
--
-- The runtime holds no content: it PINS a published method version, its
-- exposure profile and its content hash, and reads the rest through PR
-- #218's own contracts.
--
--
-- ---------------------------------------------------------------------------
-- THE RELEASE BOUNDARY -- AN EXPLICIT DECISION, NOT A SILENT WIDENING
-- ---------------------------------------------------------------------------
--
-- PR #218 published its content under `release_scope = synthetic_internal_only`
-- and gave NO employer principal and NO candidate any read path at all. PR 3
-- needs a candidate to read the items they are being asked. That is a real
-- widening, so it is made once, explicitly, here, and nowhere else:
--
--   1. `release_scope` IS NOT TOUCHED. `synthetic_internal_only` remains the
--      only representable value; this migration does not alter that CHECK.
--
--   2. Assignability is a SEPARATE, per-employer, time-boxed, revocable
--      PILOT GRANT (`bcp_pilot_grants`), minted only by a platform admin
--      through a governed RPC -- the same shape the role-interview flow
--      already uses (`scp_interview_pack_pilot_grants`). With no grant,
--      NOTHING is assignable, anywhere, production included. Fail closed is
--      the default state, not a configuration.
--
--   3. The content read widens by exactly one branch.
--      `beskt_can_read_version` is re-created as
--
--          beskt_governance_can_read_version(v)   -- PR #218's body, verbatim
--          OR bcp_party_can_read_method_version(v)
--
--      so a candidate or an authorised employer member reads a version ONLY
--      while they are party to a live assignment that pins it, and only when
--      that version is published, recruitment_support, and holds no
--      security-vetting profile or item at all. Its ONLY consequence is that
--      `beskt_resolve_item_sequence` -- PR #218's routing authority, reused
--      unchanged -- answers them.
--
--   4. The FULL governed document does NOT widen. `beskt_published_method`
--      and `beskt_readable_published_versions` are re-created to gate on
--      `beskt_governance_can_read_version`, so the new branch cannot reach
--      the method's interviewer prompts, evidence anchors, routing graph or
--      observation fields. A preparation party reads the candidate-facing
--      projection in section 7 and nothing else.
--
-- With no assignment in existence every one of these is byte-for-byte the
-- PR #218 behaviour, which is why PR #218's suite passes unchanged.
-- Security-vetting content is never candidate-readable through any of it:
-- `bcp_assignments.mode` admits `recruitment_support` alone, and the party
-- branch refuses a version that holds any security-vetting row.
--
-- Rollback: supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql
--           restores all three PR #218 functions verbatim and drops only
--           what this file adds.
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 -- The assignability gate
-- ###########################################################################
--
-- A per-employer, time-boxed, revocable grant over ONE published BESKT
-- method version. This is the whole of PR 3's release authority: there is no
-- other way for a method version to become assignable, and no code path
-- treats the absence of a grant as permission.
--
-- Authority is the privilege, not a marker: no client role -- service_role
-- included -- holds INSERT, UPDATE or DELETE here. The two SECURITY DEFINER
-- RPCs below hold the write through their owner.
-- ---------------------------------------------------------------------------

CREATE TABLE public.bcp_pilot_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,

  -- Who authorised it, and the documented decision it came from.
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),

  starts_on date NOT NULL DEFAULT current_date,
  expires_on date NOT NULL,

  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_pilot_grants_window_check CHECK (expires_on > starts_on),
  CONSTRAINT bcp_pilot_grants_revocation_check
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)
           AND (revoked_at IS NOT NULL OR revoked_reason IS NULL))
);

COMMENT ON TABLE public.bcp_pilot_grants IS
  'The ONLY thing that makes a published BESKT method version assignable to '
  'a candidate, and it is per employer, time-boxed and revocable. Absent a '
  'live grant nothing is assignable anywhere, production included. '
  'Append-only apart from revocation; no client role, service_role '
  'included, may write it.';

-- At most one live grant per (employer, version); any number of revoked ones.
CREATE UNIQUE INDEX bcp_pilot_grants_live_idx
  ON public.bcp_pilot_grants (employer_id, method_version_id) WHERE revoked_at IS NULL;
CREATE INDEX bcp_pilot_grants_version_idx ON public.bcp_pilot_grants (method_version_id);


-- ###########################################################################
-- SECTION 2 -- The runtime tables
-- ###########################################################################

-- 2.1  The assignment: one employer, one job, one application, one candidate,
--      one pinned governed method version, profile and content hash.
CREATE TABLE public.bcp_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The existing spine. No parallel employer, job, application or candidate
  -- is created anywhere in this domain.
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE RESTRICT,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- What was assigned, pinned at assignment time so a later edit or a new
  -- version cannot change what this candidate was asked.
  method_version_id uuid NOT NULL REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  exposure_profile_id uuid NOT NULL REFERENCES public.beskt_exposure_profiles(id) ON DELETE RESTRICT,

  -- PR 3 is recruitment support ONLY. security_vetting_support is not
  -- representable here: enabling it needs its own reviewed migration, its
  -- own attestation runtime and its own access model.
  mode text NOT NULL DEFAULT 'recruitment_support' CHECK (mode = 'recruitment_support'),

  pinned_content_hash text NOT NULL CHECK (pinned_content_hash ~ '^[0-9a-f]{64}$'),
  pinned_content_hash_algorithm text NOT NULL DEFAULT 'sha256'
    CHECK (pinned_content_hash_algorithm = 'sha256'),
  -- Recorded, not widened: whatever release scope admitted this assignment
  -- is on the row, so a later audit can see it.
  pinned_release_scope text NOT NULL CHECK (pinned_release_scope = 'synthetic_internal_only'),

  -- The notice the candidate must be given before answering.
  notice_version text NOT NULL CHECK (length(btrim(notice_version)) > 0),

  -- A constrained lifecycle. Forward only, and every transition is a
  -- governed RPC with an append-only event.
  lifecycle_state text NOT NULL DEFAULT 'assigned' CHECK (lifecycle_state IN (
    'assigned', 'notice_acknowledged', 'in_progress', 'submitted', 'cancelled')),

  available_from timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,

  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  acknowledged_at timestamptz,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_reason text,

  -- Compare-and-swap.
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_assignments_submitted_check
    CHECK ((lifecycle_state = 'submitted') = (submitted_at IS NOT NULL)),
  CONSTRAINT bcp_assignments_cancelled_check
    CHECK ((lifecycle_state = 'cancelled') = (cancelled_at IS NOT NULL)
           AND (cancelled_at IS NULL) = (cancelled_by IS NULL)),
  -- Nothing past 'assigned' exists without the notice having been
  -- acknowledged: the information duty is a state invariant, not a screen.
  CONSTRAINT bcp_assignments_notice_first_check
    CHECK (lifecycle_state IN ('assigned', 'cancelled') OR acknowledged_at IS NOT NULL),
  CONSTRAINT bcp_assignments_due_check CHECK (due_at IS NULL OR due_at > available_from)
);

COMMENT ON TABLE public.bcp_assignments IS
  'One BESKT candidate preparation, bound to one existing job application '
  'and the candidate who made it, pinning the published method version, its '
  'exposure profile and its content hash. Holds no answer, no observation, '
  'no interpretation and no outcome: there is no score, rank, pass/fail, '
  'suitability, credibility, recommendation or application-status column '
  'here, and there must never be one.';

-- One live preparation per application; a cancelled one may be replaced.
CREATE UNIQUE INDEX bcp_assignments_live_application_idx
  ON public.bcp_assignments (application_id) WHERE lifecycle_state <> 'cancelled';
CREATE INDEX bcp_assignments_candidate_idx ON public.bcp_assignments (candidate_user_id, assigned_at DESC);
CREATE INDEX bcp_assignments_employer_idx ON public.bcp_assignments (employer_id, assigned_at DESC);
CREATE INDEX bcp_assignments_version_idx ON public.bcp_assignments (method_version_id);


-- 2.2  The notice acknowledgement. Append-only, one row per notice version.
--
--      This is NOT consent, and is deliberately not called consent. The
--      lawful basis for the preparation is the employer's and is recorded on
--      the governed exposure profile; nothing here creates, evidences or
--      substitutes for it. The row records that the information required by
--      PR 1 section 6 was presented, in a stated language, at a stated time,
--      for an exactly identified notice.
CREATE TABLE public.bcp_notice_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notice_version text NOT NULL CHECK (length(btrim(notice_version)) > 0),
  -- SHA-256 over the governed notice descriptor the server itself builds, so
  -- a client cannot acknowledge a notice it invented.
  notice_content_hash text NOT NULL CHECK (notice_content_hash ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL CHECK (locale IN ('sv-SE', 'en-GB')),
  acknowledgement_kind text NOT NULL DEFAULT 'information_received'
    CHECK (acknowledgement_kind = 'information_received'),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, notice_version)
);

COMMENT ON TABLE public.bcp_notice_acknowledgements IS
  'Append-only record that the candidate was shown, and confirmed reading, '
  'an exactly identified version of the BESKT preparation notice. It is an '
  'information receipt, NOT GDPR consent: acknowledgement_kind admits '
  '"information_received" and nothing else, so no code can later read this '
  'row as a lawful basis it never was.';

CREATE INDEX bcp_notice_acknowledgements_assignment_idx
  ON public.bcp_notice_acknowledgements (assignment_id, acknowledged_at DESC);


-- 2.3  The versioned candidate response.
CREATE TABLE public.bcp_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  response_version integer NOT NULL CHECK (response_version >= 1),
  response_state text NOT NULL DEFAULT 'draft' CHECK (response_state IN ('draft', 'submitted')),

  -- Optimistic revision control. Every save names the revision it saw.
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),

  submitted_at timestamptz,
  -- SHA-256 over the exact submitted answers, in governed order.
  submitted_content_hash text CHECK (submitted_content_hash ~ '^[0-9a-f]{64}$'),
  -- The method content hash this response was actually answered against,
  -- copied from the assignment at submission so the two can be compared.
  submitted_method_content_hash text CHECK (submitted_method_content_hash ~ '^[0-9a-f]{64}$'),

  -- 'draft' while open, NULL once submitted: at most one open draft per
  -- assignment, enforced by the database rather than by a read-then-write.
  -- Two columns on purpose -- assignment_id alone is never unique, so
  -- PostgREST cannot read a one-to-one relation into it.
  draft_slot text GENERATED ALWAYS AS (
    CASE WHEN response_state = 'draft' THEN 'draft' END) STORED,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_responses_submitted_check
    CHECK ((response_state = 'submitted')
           = (submitted_at IS NOT NULL
              AND submitted_content_hash IS NOT NULL
              AND submitted_method_content_hash IS NOT NULL)),
  UNIQUE (assignment_id, response_version)
);

COMMENT ON TABLE public.bcp_responses IS
  'A version of one candidate''s preparation. Editable while draft; from '
  'submitted onward the row and every answer under it are frozen and carry '
  'the hash of exactly what was submitted. A draft is never visible to the '
  'employer.';

CREATE UNIQUE INDEX bcp_responses_one_draft_idx
  ON public.bcp_responses (assignment_id, draft_slot);
CREATE INDEX bcp_responses_assignment_idx
  ON public.bcp_responses (assignment_id, response_version DESC);


-- 2.4  Typed answers against governed item keys.
--
--      There is no free-form scoring object. Every answer names a governed
--      item, carries the item's declared answer type, and stores its value
--      in the ONE typed column that type admits. `omitted` and
--      `discuss_orally` are first-class, explicitly neutral states -- never
--      an answer value, never a routing condition, never negative evidence.
CREATE TABLE public.bcp_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  -- Denormalised from the governed item so the submitted projection is
  -- readable without re-reading content the reader may not be entitled to.
  item_key text NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9_]*$'),
  answer_type text NOT NULL CHECK (answer_type IN (
    'single_choice', 'multi_choice', 'boolean', 'short_text', 'long_text',
    'date', 'acknowledgement')),

  response_state text NOT NULL CHECK (response_state IN ('answered', 'omitted', 'discuss_orally')),

  value_boolean boolean,
  value_text text,
  value_date date,
  selected_option_keys text[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (response_id, item_id),

  -- A neutral state carries no value at all, so "omitted" can never be
  -- stored as, or mistaken for, a substantive answer.
  CONSTRAINT bcp_answers_neutral_is_empty_check CHECK (
    response_state = 'answered'
    OR (value_boolean IS NULL AND value_text IS NULL
        AND value_date IS NULL AND selected_option_keys IS NULL)),

  -- The typed answer contract, as a database invariant.
  CONSTRAINT bcp_answers_typed_shape_check CHECK (
    response_state <> 'answered' OR CASE answer_type
      WHEN 'boolean' THEN
        value_boolean IS NOT NULL AND value_text IS NULL AND value_date IS NULL
        AND selected_option_keys IS NULL
      WHEN 'acknowledgement' THEN
        value_boolean IS TRUE AND value_text IS NULL AND value_date IS NULL
        AND selected_option_keys IS NULL
      WHEN 'short_text' THEN
        value_text IS NOT NULL AND length(btrim(value_text)) > 0 AND length(value_text) <= 500
        AND value_boolean IS NULL AND value_date IS NULL AND selected_option_keys IS NULL
      WHEN 'long_text' THEN
        value_text IS NOT NULL AND length(btrim(value_text)) > 0 AND length(value_text) <= 4000
        AND value_boolean IS NULL AND value_date IS NULL AND selected_option_keys IS NULL
      WHEN 'date' THEN
        value_date IS NOT NULL AND value_boolean IS NULL AND value_text IS NULL
        AND selected_option_keys IS NULL
      WHEN 'single_choice' THEN
        selected_option_keys IS NOT NULL AND array_length(selected_option_keys, 1) = 1
        AND value_boolean IS NULL AND value_text IS NULL AND value_date IS NULL
      WHEN 'multi_choice' THEN
        selected_option_keys IS NOT NULL AND array_length(selected_option_keys, 1) >= 1
        AND value_boolean IS NULL AND value_text IS NULL AND value_date IS NULL
      ELSE false END)
);

COMMENT ON TABLE public.bcp_answers IS
  'One candidate answer to one governed item. Typed columns only -- there is '
  'no free-form answer document and no scoring object. "omitted" and '
  '"discuss_orally" are neutral input states with no value attached and no '
  'downstream effect: they fire no routing rule, and PR 1 section 7 forbids '
  'reading either as negative evidence.';

CREATE INDEX bcp_answers_response_idx ON public.bcp_answers (response_id, item_key);
CREATE INDEX bcp_answers_item_idx ON public.bcp_answers (item_id);


-- 2.5  The append-only lifecycle ledger, which also carries the idempotency
--      receipts. One row per governed operation.
CREATE TABLE public.bcp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  response_id uuid REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,
  employer_id uuid REFERENCES public.employers(id) ON DELETE RESTRICT,
  method_version_id uuid REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,

  event text NOT NULL CHECK (event IN (
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked')),

  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_state text,
  new_state text,
  reason text,
  content_hash text,
  revision integer,

  -- Idempotency: the operation id is unique, and the receipt is the result.
  operation_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  recorded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bcp_events IS
  'Append-only evidence of every BESKT candidate-preparation lifecycle '
  'operation, carrying the idempotency receipt for its operation id. Never '
  'updated and never deleted, by any caller, BYPASSRLS included.';

CREATE INDEX bcp_events_assignment_idx ON public.bcp_events (assignment_id, recorded_at DESC);
CREATE INDEX bcp_events_employer_idx ON public.bcp_events (employer_id, recorded_at DESC);


-- ###########################################################################
-- SECTION 3 -- Guards: append-only, immutability, constrained lifecycle
-- ###########################################################################
--
-- Row triggers, so the invariant holds against every writer -- a governed
-- RPC, service_role, a superuser and BYPASSRLS alike. RLS can be bypassed;
-- a BEFORE trigger cannot.
-- ---------------------------------------------------------------------------

-- 3.1  The ledger and the acknowledgements are append-only, full stop.
CREATE OR REPLACE FUNCTION public.bcp_guard_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'BCP_APPEND_ONLY: % is append-only; % is refused for every caller.',
    TG_TABLE_NAME, TG_OP USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;

CREATE TRIGGER bcp_events_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_events
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_append_only();

CREATE TRIGGER bcp_notice_acknowledgements_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_notice_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_append_only();


-- 3.2  Pilot grants: insert and revoke, nothing else, and only from inside
--      the two governed RPCs. The transaction-local marker is defence in
--      depth ON TOP of the privilege (no client role can write the table at
--      all); it is never the authorisation, so a caller that can set the GUC
--      itself gains nothing.
CREATE OR REPLACE FUNCTION public.bcp_guard_pilot_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('bcp.pilot_grant_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'BCP_PILOT_UNGOVERNED_WRITE: bcp_pilot_grants is written only by bcp_grant_pilot() and bcp_revoke_pilot().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_PILOT_APPEND_ONLY: a pilot grant is revoked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Revocation is the ONLY permitted change, and it happens once.
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_PILOT_ALREADY_REVOKED: this grant is already revoked.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id
       OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
       OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
       OR NEW.starts_on IS DISTINCT FROM OLD.starts_on
       OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'BCP_PILOT_IMMUTABLE: only revocation may change a pilot grant.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'BCP_PILOT_UNREVOKE: a revoked grant cannot be reinstated; mint a new one.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bcp_pilot_grants_governed
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_pilot_grants
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_pilot_grants();


-- 3.3  The assignment lifecycle. Forward only, pinned fields immutable,
--      never deleted.
CREATE OR REPLACE FUNCTION public.bcp_guard_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _permitted text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NO_DELETE: a preparation assignment is cancelled, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- What was assigned can never change. A different method version, a
    -- different profile, a different hash or a different party is a
    -- different assignment.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
       OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id
       OR NEW.exposure_profile_id IS DISTINCT FROM OLD.exposure_profile_id
       OR NEW.mode IS DISTINCT FROM OLD.mode
       OR NEW.pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash
       OR NEW.pinned_content_hash_algorithm IS DISTINCT FROM OLD.pinned_content_hash_algorithm
       OR NEW.pinned_release_scope IS DISTINCT FROM OLD.pinned_release_scope
       OR NEW.notice_version IS DISTINCT FROM OLD.notice_version
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.available_from IS DISTINCT FROM OLD.available_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: what was assigned cannot be changed; cancel and assign again.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- A submitted preparation is finished. It is not reopened, not
    -- re-answered and not silently rewound.
    IF OLD.lifecycle_state = 'submitted' AND NEW.lifecycle_state <> 'submitted' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE: a submitted preparation cannot return to an earlier state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.lifecycle_state = 'cancelled' AND NEW.lifecycle_state <> 'cancelled' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED_IMMUTABLE: a cancelled preparation cannot be revived.'
        USING ERRCODE = 'check_violation';
    END IF;

    _permitted := CASE OLD.lifecycle_state
      WHEN 'assigned'            THEN ARRAY['assigned', 'notice_acknowledged', 'cancelled']
      WHEN 'notice_acknowledged' THEN ARRAY['notice_acknowledged', 'in_progress', 'submitted', 'cancelled']
      WHEN 'in_progress'         THEN ARRAY['in_progress', 'submitted', 'cancelled']
      WHEN 'submitted'           THEN ARRAY['submitted']
      WHEN 'cancelled'           THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END;
    IF NOT (NEW.lifecycle_state = ANY (_permitted)) THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_TRANSITION: "%" -> "%" is not a permitted transition.',
        OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
    END IF;

    -- Timestamps are recorded once.
    IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the acknowledgement time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the submission time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.first_opened_at IS NOT NULL AND NEW.first_opened_at IS DISTINCT FROM OLD.first_opened_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the first-opened time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision < OLD.revision THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_REVISION: the revision never moves backwards.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bcp_assignments_guard
  BEFORE UPDATE OR DELETE ON public.bcp_assignments
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_assignment();


-- 3.4  A submitted response is immutable, and so is every answer under it.
CREATE OR REPLACE FUNCTION public.bcp_guard_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_RESPONSE_NO_DELETE: a response version is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.response_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_RESPONSE_IMMUTABLE: a submitted response is frozen; a correction is a new version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.response_version IS DISTINCT FROM OLD.response_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'BCP_RESPONSE_IMMUTABLE: a response cannot be re-parented or renumbered.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.response_state = 'draft' AND NEW.revision < OLD.revision THEN
    RAISE EXCEPTION 'BCP_RESPONSE_REVISION: the revision never moves backwards.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bcp_responses_guard
  BEFORE UPDATE OR DELETE ON public.bcp_responses
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_response();


CREATE OR REPLACE FUNCTION public.bcp_guard_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _state text;
  _old_state text;
BEGIN
  -- The owning response is locked FOR SHARE before its state is read, so a
  -- concurrent submission cannot commit between the check and the write:
  -- either the answer commits first and submission re-reads it, or
  -- submission commits first and the answer is refused as frozen.
  IF TG_OP = 'DELETE' THEN
    SELECT r.response_state INTO _state FROM public.bcp_responses r
      WHERE r.id = OLD.response_id FOR SHARE;
  ELSE
    SELECT r.response_state INTO _state FROM public.bcp_responses r
      WHERE r.id = NEW.response_id FOR SHARE;
  END IF;
  IF _state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ANSWER_FROZEN: the answers of a submitted response cannot be added to, changed or removed.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- An answer belongs to the response it was written under, for good.
    IF NEW.response_id IS DISTINCT FROM OLD.response_id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.item_key IS DISTINCT FROM OLD.item_key THEN
      RAISE EXCEPTION 'BCP_ANSWER_IMMUTABLE: an answer cannot be moved to another response or another item.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Also refuse a move OUT of an already-submitted response.
    SELECT r.response_state INTO _old_state FROM public.bcp_responses r
      WHERE r.id = OLD.response_id FOR SHARE;
    IF _old_state = 'submitted' THEN
      RAISE EXCEPTION 'BCP_ANSWER_FROZEN: the answers of a submitted response cannot be changed.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bcp_answers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_answers
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_answer();


-- 3.5  No client role may execute a guard directly. A trigger function is
--      reached only by the trigger that owns it.
REVOKE ALL ON FUNCTION public.bcp_guard_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_pilot_grants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_guard_answer() FROM PUBLIC, anon, authenticated;


-- ###########################################################################
-- SECTION 4 -- Access predicates, and the one explicit read-contract change
-- ###########################################################################

-- 4.1  Is there a live pilot grant admitting this employer to this method
--      version right now? Expiry is checked here, not at grant time, so a
--      grant stops working on its own without anybody remembering to revoke
--      it -- the same shape as scp_interview_pilot_grant_active().
CREATE OR REPLACE FUNCTION public.bcp_pilot_grant_active(_employer_id uuid, _method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bcp_pilot_grants g
     WHERE g.employer_id = _employer_id
       AND g.method_version_id = _method_version_id
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on);
$$;

REVOKE ALL ON FUNCTION public.bcp_pilot_grant_active(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_pilot_grant_active(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_pilot_grant_active(uuid, uuid) IS
  'The single entitlement decision for BESKT candidate preparation: a live, '
  'in-window, unrevoked pilot grant for exactly this employer and this '
  'method version. Absent one, nothing is assignable.';


-- 4.2  Is this method version safe to put in front of a candidate at all?
--
--      Published, recruitment support, and holding NO security-vetting
--      profile and NO security-vetting item -- checked on the rows, not
--      inferred from the version's mode. A document is refused whole; there
--      is no partial candidate view of a version that mixes the two.
CREATE OR REPLACE FUNCTION public.bcp_version_is_candidate_safe(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.beskt_method_versions v
       WHERE v.id = _method_version_id
         AND v.content_status = 'published'
         AND v.mode = 'recruitment_support')
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_exposure_profiles p
       WHERE p.method_version_id = _method_version_id
         AND (p.permitted_mode = 'security_vetting_support'
              OR p.access_class = 'authorised_security_function'
              OR p.retention_class = 'security_vetting_record'))
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_items i
       WHERE i.method_version_id = _method_version_id
         AND (i.permitted_mode = 'security_vetting_support'
              OR i.sensitivity_class = 'security_vetting_only'
              OR i.access_class = 'authorised_security_function'));
$$;

REVOKE ALL ON FUNCTION public.bcp_version_is_candidate_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_version_is_candidate_safe(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_version_is_candidate_safe(uuid) IS
  'True only for a PUBLISHED, recruitment-support method version that holds '
  'no security-vetting profile and no security-vetting item at all. PR 1 '
  'section 3''s hard boundary, evaluated on the stored rows: '
  'security-vetting content never becomes candidate-readable through PR 3.';


-- 4.3  Who is party to an assignment.
CREATE OR REPLACE FUNCTION public.bcp_is_assignment_candidate(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = _assignment_id
       AND a.candidate_user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.bcp_is_assignment_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_is_assignment_candidate(uuid) TO authenticated, service_role;


-- The employer side: an ACTIVE membership of the employer that owns the
-- assignment AND of the employer that owns the linked application. Both,
-- because the application is the thing the preparation is about, and a row
-- whose two owners ever disagreed must open nothing.
CREATE OR REPLACE FUNCTION public.bcp_employer_can_read_assignment(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.bcp_assignments a
      JOIN public.job_applications ja ON ja.id = a.application_id
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.id = _assignment_id
       AND ja.employer_id = a.employer_id
       AND j.employer_id = a.employer_id
       AND ja.applicant_user_id = a.candidate_user_id
       AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member']));
$$;

REVOKE ALL ON FUNCTION public.bcp_employer_can_read_assignment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_can_read_assignment(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_employer_can_read_assignment(uuid) IS
  'An active member of the employer that owns BOTH the assignment and the '
  'linked application and job, for a candidate who is that application''s '
  'own applicant. A member of another employer, a candidate, a roleless user '
  'and anon all get false.';


-- 4.4  THE ONE WIDENING. A preparation party -- the candidate, or an
--      authorised member of the employer -- may read the governed method
--      version their live assignment pins, and only that one, and only when
--      it is candidate-safe by 4.2. Nothing else changes.
--
--      INTERNAL: it is called from beskt_can_read_version(), which is
--      SECURITY DEFINER, so no client role needs to execute it.
CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.bcp_version_is_candidate_safe(_method_version_id)
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.has_employer_role(auth.uid(), a.employer_id,
                                          ARRAY['owner', 'admin', 'member'])));
$$;

REVOKE ALL ON FUNCTION public.bcp_party_can_read_method_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_party_can_read_method_version(uuid) TO service_role;

COMMENT ON FUNCTION public.bcp_party_can_read_method_version(uuid) IS
  'INTERNAL. The single branch by which BESKT PR 3 widens PR #218''s '
  'synthetic_internal_only read contract: a party to a live, uncancelled '
  'preparation assignment may read the candidate-safe published method '
  'version that assignment pins. With no assignment in existence this is '
  'false for everybody, which is why the PR #218 read contract behaves '
  'byte-for-byte as it did.';


-- 4.5  PR #218's read predicate, kept VERBATIM under its own name. It is
--      the governance-reader decision, and it is what the full governed
--      document (4.7, 4.8) still gates on -- so the 4.4 branch cannot reach
--      a method's interviewer prompts, evidence anchors, routing graph or
--      observation fields.
CREATE OR REPLACE FUNCTION public.beskt_governance_can_read_version(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- Governance readers: every state, both modes.
    public.scp_interview_can_read(auth.uid())
    -- Explicit internal QA: published recruitment-support content only, and
    -- only when every governed row of it lies within the classes an internal
    -- tester may read. A document is never returned in part.
    OR (public.beskt_holds_grant(auth.uid(), 'internal_qa')
        AND EXISTS (
          SELECT 1 FROM public.beskt_method_versions v
           WHERE v.id = _method_version_id
             AND v.content_status = 'published'
             AND v.mode = 'recruitment_support')
        AND NOT EXISTS (
          SELECT 1 FROM public.beskt_exposure_profiles p
           WHERE p.method_version_id = _method_version_id
             AND NOT (p.access_class = ANY (public.beskt_reader_access_classes(auth.uid()))))
        AND NOT EXISTS (
          SELECT 1 FROM public.beskt_items i
           WHERE i.method_version_id = _method_version_id
             AND NOT (i.access_class = ANY (public.beskt_reader_access_classes(auth.uid()))))));
$$;

REVOKE ALL ON FUNCTION public.beskt_governance_can_read_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_governance_can_read_version(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_governance_can_read_version(uuid) IS
  'The narrow read contract for release_scope = synthetic_internal_only. '
  'Governance readers see everything; an explicit internal-QA grantee sees '
  'published recruitment-support content whose every row is within their '
  'access classes; employer members, candidates, roleless users and anon see '
  'nothing. Nothing here makes a method startable.';


-- 4.6  The read contract, re-created: the PR #218 decision, OR a party to a
--      live assignment that pins this exact version. Its only consequence is
--      that beskt_resolve_item_sequence() -- PR #218's routing authority,
--      reused unchanged -- answers a preparation party for their own
--      version.
CREATE OR REPLACE FUNCTION public.beskt_can_read_version(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.beskt_governance_can_read_version(_method_version_id)
      OR public.bcp_party_can_read_method_version(_method_version_id);
$$;

REVOKE ALL ON FUNCTION public.beskt_can_read_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_can_read_version(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_can_read_version(uuid) IS
  'The narrow read contract for release_scope = synthetic_internal_only, '
  'plus BESKT PR 3''s one explicit widening. Governance readers see '
  'everything; an explicit internal-QA grantee sees published '
  'recruitment-support content whose every row is within their access '
  'classes; a party to a live candidate-preparation assignment sees the one '
  'candidate-safe published version that assignment pins; employer members '
  'without such an assignment, candidates without one, roleless users and '
  'anon see nothing. Nothing here makes a method startable, and the FULL '
  'governed document stays gated on beskt_governance_can_read_version().';


-- 4.7  The full governed document, re-created to gate on the GOVERNANCE
--      predicate. Byte-for-byte PR #218 apart from that one call: a
--      preparation party must not read interviewer prompts, evidence
--      anchors, the routing graph or observation fields.
CREATE OR REPLACE FUNCTION public.beskt_published_method(_method_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
BEGIN
  IF NOT public.beskt_governance_can_read_version(_method_version_id) THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHORISED: you may not read this method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHED: the read contract returns published content only; this version is "%".', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;

  RETURN jsonb_build_object(
    'method_version_id', _v.id,
    'pack_id', _p.id,
    'pack_slug', _p.slug,
    'pack_kind', _p.pack_kind,
    'name_sv', _p.name_sv,
    'name_en', _p.name_en,
    'purpose_sv', _p.purpose_sv,
    'version_number', _v.version_number,
    'content_status', _v.content_status,
    'mode', _v.mode,
    'validation_label', _v.validation_label,
    'release_scope', _v.release_scope,
    'locale_sv', _v.locale_sv,
    'locale_en', _v.locale_en,
    'source_reference', _v.source_reference,
    'source_document_version', _v.source_document_version,
    'content_provenance', _v.content_provenance,
    'summary_sv', _v.summary_sv,
    'summary_en', _v.summary_en,
    'content_hash', _v.content_hash,
    'content_hash_algorithm', _v.content_hash_algorithm,
    'revision', _v.revision,
    'exposure_profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'profile_key', p.profile_key, 'display_order', p.display_order,
          'exposure_area', p.exposure_area, 'duties_sv', p.duties_sv, 'duties_en', p.duties_en,
          'role_relevance_rationale_sv', p.role_relevance_rationale_sv,
          'role_relevance_rationale_en', p.role_relevance_rationale_en,
          'permitted_mode', p.permitted_mode, 'owning_review_role', p.owning_review_role,
          'jurisdiction_reference', p.jurisdiction_reference,
          'lawful_basis_reference', p.lawful_basis_reference,
          'retention_class', p.retention_class, 'access_class', p.access_class,
          'security_sensitive_role_attestation_reference', p.security_sensitive_role_attestation_reference,
          'content_provenance', p.content_provenance, 'source_reference', p.source_reference)
        ORDER BY p.display_order, p.profile_key)
        FROM public.beskt_exposure_profiles p WHERE p.method_version_id = _v.id), '[]'::jsonb),
    'activation_requirements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'requirement_key', a.requirement_key, 'satisfied_by_role', a.satisfied_by_role,
          'statement_sv', a.statement_sv, 'statement_en', a.statement_en)
        ORDER BY a.requirement_key)
        FROM public.beskt_activation_requirements a WHERE a.method_version_id = _v.id), '[]'::jsonb),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'display_order', s.display_order, 'phase', s.phase,
          'title_sv', s.title_sv, 'title_en', s.title_en,
          'items', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', i.item_key, 'display_order', i.display_order,
                'exposure_profile_key', pp.profile_key,
                'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
                'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
                'permitted_mode', i.permitted_mode, 'phase', i.phase,
                'answer_type', i.answer_type, 'requiredness', i.requiredness,
                'discuss_orally_allowed', i.discuss_orally_allowed,
                'sensitivity_class', i.sensitivity_class, 'access_class', i.access_class,
                'content_provenance', i.content_provenance, 'source_reference', i.source_reference,
                'prohibited_inferences', to_jsonb(i.prohibited_inferences),
                'options', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'option_key', o.option_key, 'display_order', o.display_order,
                      'label_sv', o.label_sv, 'label_en', o.label_en)
                    ORDER BY o.display_order, o.option_key)
                    FROM public.beskt_item_options o WHERE o.item_id = i.id), '[]'::jsonb))
              ORDER BY i.display_order, i.item_key)
              FROM public.beskt_items i
              JOIN public.beskt_exposure_profiles pp ON pp.id = i.exposure_profile_id
             WHERE i.section_id = s.id), '[]'::jsonb))
        ORDER BY s.display_order, s.section_key)
        FROM public.beskt_sections s WHERE s.method_version_id = _v.id), '[]'::jsonb),
    'prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key, 'display_order', pr.display_order,
          'exposure_profile_key', pp.profile_key, 'item_key', i.item_key,
          'prompt_kind', pr.prompt_kind, 'peace_stage', pr.peace_stage, 'addressee', pr.addressee,
          'question_form', pr.question_form,
          'permitted_probe_bases', to_jsonb(pr.permitted_probe_bases),
          'evaluation_template_key', pr.evaluation_template_key,
          'permitted_mode', pr.permitted_mode,
          'wording_sv', pr.wording_sv, 'wording_en', pr.wording_en,
          'content_provenance', pr.content_provenance, 'source_reference', pr.source_reference)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
        JOIN public.beskt_exposure_profiles pp ON pp.id = pr.exposure_profile_id
        LEFT JOIN public.beskt_items i ON i.id = pr.item_id
       WHERE pr.method_version_id = _v.id), '[]'::jsonb),
    'routing_rules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'rule_key', r.rule_key, 'evaluation_order', r.evaluation_order,
          'applies_mode', r.applies_mode, 'source_item_key', si.item_key,
          'condition_kind', r.condition_kind, 'condition_option_key', o.option_key,
          'condition_boolean', r.condition_boolean, 'action', r.action,
          'target_item_key', ti.item_key)
        ORDER BY r.evaluation_order, r.rule_key)
        FROM public.beskt_routing_rules r
        JOIN public.beskt_items si ON si.id = r.source_item_id
        JOIN public.beskt_items ti ON ti.id = r.target_item_id
        LEFT JOIN public.beskt_item_options o ON o.id = r.condition_option_id
       WHERE r.method_version_id = _v.id), '[]'::jsonb),
    'evidence_anchors', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'evidence_state', a.evidence_state,
          'definition_sv', a.definition_sv, 'definition_en', a.definition_en,
          'inclusion_criteria_sv', a.inclusion_criteria_sv, 'inclusion_criteria_en', a.inclusion_criteria_en,
          'exclusion_criteria_sv', a.exclusion_criteria_sv, 'exclusion_criteria_en', a.exclusion_criteria_en,
          'supporting_evidence_examples_sv', a.supporting_evidence_examples_sv,
          'supporting_evidence_examples_en', a.supporting_evidence_examples_en,
          'counter_evidence_and_protective_factors_sv', a.counter_evidence_and_protective_factors_sv,
          'counter_evidence_and_protective_factors_en', a.counter_evidence_and_protective_factors_en,
          'prohibited_inferences', to_jsonb(a.prohibited_inferences),
          'required_next_action', a.required_next_action)
        ORDER BY a.evidence_state)
        FROM public.beskt_evidence_anchors a WHERE a.method_version_id = _v.id), '[]'::jsonb),
    'observation_fields', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'field_key', f.field_key, 'ordinal', f.ordinal, 'recorded_by', f.recorded_by,
          'is_judgement', f.is_judgement, 'label_sv', f.label_sv, 'label_en', f.label_en,
          'definition_sv', f.definition_sv, 'definition_en', f.definition_en)
        ORDER BY f.ordinal)
        FROM public.beskt_observation_fields f WHERE f.method_version_id = _v.id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.beskt_published_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_published_method(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_published_method(uuid) IS
  'The narrow governed read contract for one PUBLISHED BESKT method version '
  'under release_scope = synthetic_internal_only. Refuses drafts, suspended '
  'and retired versions; refuses every caller without a governance role or '
  'an explicit internal-QA grant; refuses an internal-QA reader any version '
  'holding a row outside their access classes rather than returning a part '
  'of it. Returns no candidate, no score and no start capability.';


-- 4.8  The published-version listing, gated the same way.
CREATE OR REPLACE FUNCTION public.beskt_readable_published_versions()
RETURNS TABLE (
  method_version_id uuid,
  pack_id uuid,
  pack_slug text,
  name_sv text,
  name_en text,
  version_number integer,
  mode text,
  validation_label text,
  release_scope text,
  content_hash text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, v.version_number, v.mode,
         v.validation_label, v.release_scope, v.content_hash
    FROM public.beskt_method_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.pack_kind = 'beskt_method'
     AND v.content_status = 'published'
     AND public.beskt_governance_can_read_version(v.id)
   ORDER BY p.slug, v.version_number DESC;
$$;

REVOKE ALL ON FUNCTION public.beskt_readable_published_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_readable_published_versions() TO authenticated, service_role;

COMMENT ON FUNCTION public.beskt_readable_published_versions() IS
  'The published BESKT method versions the caller may read, and nothing '
  'else: never a draft, never a suspended or retired version, never '
  'security-vetting content to internal QA, nothing at all to an employer '
  'principal, a candidate or a roleless user. A listing, not a '
  'start selector: no scp_iv_* start path accepts a BESKT version.';


-- ###########################################################################
-- SECTION 5 -- Idempotency, the governed notice, and the canonical answer hash
-- ###########################################################################
--
-- Every client-callable mutation below:
--   * derives the actor from auth.uid();
--   * authorises itself, inside the function;
--   * takes an operation id, and where state can race an expected revision;
--   * computes a SHA-256 request hash over its exact arguments (reusing PR
--     #218's beskt_request_hash);
--   * serialises on the operation id, then answers a REPLAY (same actor,
--     same operation, same request) with the original result BEFORE the
--     compare-and-swap, so a retry after a lost response never becomes a
--     false stale-revision error;
--   * refuses the same operation id with a different request or actor;
--   * refuses a stale expected revision without writing;
--   * writes its append-only event -- carrying the receipt -- in the same
--     transaction.
-- ---------------------------------------------------------------------------

-- 5.1  The append-only event writer. No client role may execute it.
CREATE OR REPLACE FUNCTION public.bcp_record_event(
  _assignment_id uuid,
  _response_id uuid,
  _employer_id uuid,
  _method_version_id uuid,
  _event text,
  _previous_state text,
  _new_state text,
  _reason text,
  _content_hash text,
  _revision integer,
  _operation_id uuid,
  _request_hash text,
  _result jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.bcp_events
    (assignment_id, response_id, employer_id, method_version_id, event, actor_id,
     previous_state, new_state, reason, content_hash, revision,
     operation_id, request_hash, result, metadata)
  VALUES
    (_assignment_id, _response_id, _employer_id, _method_version_id, _event, auth.uid(),
     _previous_state, _new_state, _reason, _content_hash, _revision,
     _operation_id, _request_hash, _result, coalesce(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_record_event(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_record_event(uuid, uuid, uuid, uuid, text, text, text, text, text, integer, uuid, text, jsonb, jsonb)
  TO service_role;


-- 5.2  Operation begin: serialise on the operation id and answer a replay.
--      INTERNAL.
CREATE OR REPLACE FUNCTION public.bcp_operation_begin(_operation_id uuid, _request_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _receipt public.bcp_events%ROWTYPE;
BEGIN
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation carries an operation id.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Two requests with the same operation id serialise here, so the second
  -- finds the first's receipt instead of racing it.
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_operation:' || _operation_id::text, 0));

  SELECT * INTO _receipt FROM public.bcp_events e WHERE e.operation_id = _operation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF _receipt.actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BCP_OPERATION_ACTOR_MISMATCH: operation % belongs to another actor.', _operation_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _receipt.request_hash IS DISTINCT FROM _request_hash THEN
    RAISE EXCEPTION 'BCP_OPERATION_PAYLOAD_MISMATCH: operation % was recorded with a different request; a new request needs a new operation id.', _operation_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN _receipt.result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_operation_begin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_operation_begin(uuid, text) TO service_role;


-- 5.3  The governed notice.
--
--      PR 3 owns the notice's IDENTITY -- its version and the exact ordered
--      set of matters it must cover (PR 1 section 6) -- plus the governed
--      references the candidate is entitled to see. The bilingual WORDING
--      lives in the application dictionary, in Swedish and English, and
--      scripts/beskt-candidate-preparation-check.ts refuses a build where a
--      key is missing from either language.
--
--      The acknowledgement binds to the SHA-256 of this server-built
--      descriptor, so a client cannot record acknowledgement of a notice it
--      invented, and a later change to what must be disclosed changes the
--      hash and therefore cannot pass unnoticed.
CREATE OR REPLACE FUNCTION public.bcp_notice_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 'beskt-prep-notice-1'::text; $$;

REVOKE ALL ON FUNCTION public.bcp_notice_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_notice_version() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bcp_notice_sections()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Exactly the nine matters PR 1 section 6 and the PR 3 brief require,
  -- in a fixed order. Removing one changes the notice hash.
  SELECT ARRAY[
    'purpose',                 -- why the preparation is being asked for
    'use_of_information',      -- how what is written will be used
    'human_decision',          -- a human makes every recruitment decision
    'not_a_test_with_score',   -- this is not a test and produces no score
    'may_omit_questions',      -- individual questions may be left out
    'oral_discussion',         -- sensitive matters may be taken orally
    'review_and_correct',      -- review and correction before submission
    'who_can_access',          -- who can read the submitted information
    'retention']::text[];      -- retention, from the governed profile
$$;

REVOKE ALL ON FUNCTION public.bcp_notice_sections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_notice_sections() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bcp_notice_descriptor(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
BEGIN
  IF NOT (public.bcp_is_assignment_candidate(_assignment_id)
          OR public.bcp_employer_can_read_assignment(_assignment_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you are not party to this preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  RETURN jsonb_build_object(
    'notice_version', _a.notice_version,
    'sections', to_jsonb(public.bcp_notice_sections()),
    -- The governed references the candidate is entitled to. NOT consent:
    -- the lawful basis is the employer's and is stated on the profile.
    'retention_class', _p.retention_class,
    'lawful_basis_reference', _p.lawful_basis_reference,
    'jurisdiction_reference', _p.jurisdiction_reference,
    -- Who can read a submitted preparation, as data rather than as prose.
    'recipients', jsonb_build_array('employer_members_of_this_employer'),
    'decision_maker', 'accountable_employer_human',
    'produces_score', false,
    'method_content_hash', _a.pinned_content_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_notice_descriptor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_notice_descriptor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bcp_notice_hash(_assignment_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.beskt_request_hash(public.bcp_notice_descriptor(_assignment_id));
$$;

REVOKE ALL ON FUNCTION public.bcp_notice_hash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_notice_hash(uuid) TO authenticated, service_role;


-- 5.4  The canonical submitted answers, and their SHA-256.
--
--      A typed jsonb document in governed item order: one named field per
--      value, explicit JSON nulls, option keys sorted. No delimiter can move
--      content between fields or rows, so two different splits of the same
--      characters hash differently. INTERNAL: it answers for any response.
CREATE OR REPLACE FUNCTION public.bcp_canonical_answers(_response_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'schema', 'bcp_canonical_answers_v1',
    'answers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', a.item_key,
          'answer_type', a.answer_type,
          'response_state', a.response_state,
          'value_boolean', to_jsonb(a.value_boolean),
          'value_text', to_jsonb(a.value_text),
          'value_date', to_jsonb(a.value_date),
          'selected_option_keys', coalesce((
            SELECT jsonb_agg(k ORDER BY k)
              FROM unnest(coalesce(a.selected_option_keys, '{}'::text[])) AS k), '[]'::jsonb))
        ORDER BY a.item_key)
        FROM public.bcp_answers a WHERE a.response_id = _response_id), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.bcp_canonical_answers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_canonical_answers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bcp_answers_content_hash(_response_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(public.bcp_canonical_answers(_response_id)::text, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.bcp_answers_content_hash(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_answers_content_hash(uuid) TO service_role;


-- 5.5  The structured answer map the PR #218 resolver reads, built from what
--      is actually stored. An 'omitted' or 'discuss_orally' answer
--      contributes NOTHING to it, so a neutral state can never fire a
--      routing rule or open an adverse branch. INTERNAL.
CREATE OR REPLACE FUNCTION public.bcp_routing_answers(_response_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(a.item_key, CASE a.answer_type
      WHEN 'boolean' THEN jsonb_build_object('kind', 'boolean', 'value', to_jsonb(a.value_boolean))
      WHEN 'acknowledgement' THEN jsonb_build_object('kind', 'boolean', 'value', to_jsonb(a.value_boolean))
      WHEN 'single_choice' THEN jsonb_build_object('kind', 'option',
        'option_keys', to_jsonb(coalesce(a.selected_option_keys, '{}'::text[])))
      WHEN 'multi_choice' THEN jsonb_build_object('kind', 'option',
        'option_keys', to_jsonb(coalesce(a.selected_option_keys, '{}'::text[])))
      ELSE jsonb_build_object('kind', 'value')
    END), '{}'::jsonb)
    FROM public.bcp_answers a
   WHERE a.response_id = _response_id
     AND a.response_state = 'answered';
$$;

REVOKE ALL ON FUNCTION public.bcp_routing_answers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_routing_answers(uuid) TO service_role;

COMMENT ON FUNCTION public.bcp_routing_answers(uuid) IS
  'INTERNAL. The structured answers PR #218''s beskt_resolve_item_sequence() '
  'reads, built only from answers whose response_state is "answered". An '
  'omitted or discuss-orally answer is absent from the map entirely, so it '
  'fires no rule, hides no item and reveals no branch -- neutrality as a '
  'structural property rather than a convention.';


-- 5.6  The visible governed items of one assignment, resolved through PR
--      #218's routing authority against what is stored now. INTERNAL.
CREATE OR REPLACE FUNCTION public.bcp_visible_items(_assignment_id uuid, _response_id uuid)
RETURNS TABLE (sequence_position integer, item_id uuid, item_key text, section_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _a public.bcp_assignments%ROWTYPE;
BEGIN
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
    SELECT r.sequence_position, r.item_id, r.item_key, r.section_key
      FROM public.beskt_resolve_item_sequence(
             _a.method_version_id, _a.exposure_profile_id, _a.mode,
             CASE WHEN _response_id IS NULL THEN '{}'::jsonb
                  ELSE public.bcp_routing_answers(_response_id) END) r;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_visible_items(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_visible_items(uuid, uuid) TO service_role;


-- ###########################################################################
-- SECTION 6 -- The governed lifecycle RPCs
-- ###########################################################################

-- 6.1  Platform-admin pilot grants. The only way anything becomes assignable.
CREATE OR REPLACE FUNCTION public.bcp_grant_pilot(
  _operation_id uuid,
  _employer_id uuid,
  _method_version_id uuid,
  _source_reference text,
  _expires_on date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb;
  _hash text;
  _replay jsonb;
  _id uuid;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may admit an employer to BESKT candidate preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'grant_pilot', 'employer_id', _employer_id,
    'method_version_id', _method_version_id, 'source_reference', _source_reference,
    'expires_on', _expires_on);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.bcp_version_is_candidate_safe(_method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: only a published recruitment-support version holding no security-vetting content may be admitted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers e WHERE e.id = _employer_id) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('bcp.pilot_grant_write', 'on', true);
  INSERT INTO public.bcp_pilot_grants
    (employer_id, method_version_id, granted_by, source_reference, expires_on)
  VALUES (_employer_id, _method_version_id, auth.uid(), _source_reference, _expires_on)
  RETURNING id INTO _id;
  PERFORM set_config('bcp.pilot_grant_write', 'off', true);

  _result := jsonb_build_object('grant_id', _id, 'employer_id', _employer_id,
    'method_version_id', _method_version_id, 'expires_on', _expires_on, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(NULL, NULL, _employer_id, _method_version_id, 'pilot_granted',
    NULL, 'granted', _source_reference, NULL, NULL, _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_grant_pilot(uuid, uuid, uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_grant_pilot(uuid, uuid, uuid, text, date) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.bcp_revoke_pilot(
  _operation_id uuid, _employer_id uuid, _method_version_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN: only a platform administrator may revoke a BESKT preparation grant.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'revoke_pilot', 'employer_id', _employer_id,
    'method_version_id', _method_version_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT g.id INTO _id FROM public.bcp_pilot_grants g
   WHERE g.employer_id = _employer_id AND g.method_version_id = _method_version_id
     AND g.revoked_at IS NULL FOR UPDATE;
  IF _id IS NULL THEN
    RAISE EXCEPTION 'BCP_PILOT_GRANT_NOT_FOUND: there is no live grant to revoke.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('bcp.pilot_grant_write', 'on', true);
  UPDATE public.bcp_pilot_grants
     SET revoked_at = now(), revoked_by = auth.uid(), revoked_reason = _reason
   WHERE id = _id;
  PERFORM set_config('bcp.pilot_grant_write', 'off', true);

  _result := jsonb_build_object('grant_id', _id, 'employer_id', _employer_id,
    'method_version_id', _method_version_id, 'revoked', true, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(NULL, NULL, _employer_id, _method_version_id, 'pilot_revoked',
    'granted', 'revoked', _reason, NULL, NULL, _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_revoke_pilot(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_revoke_pilot(uuid, uuid, uuid, text) TO authenticated, service_role;


-- 6.2  Start a preparation from an existing job application.
CREATE OR REPLACE FUNCTION public.bcp_assign(
  _operation_id uuid,
  _application_id uuid,
  _method_version_id uuid,
  _exposure_profile_id uuid,
  _expected_content_hash text,
  _notice_version text,
  _due_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _ja public.job_applications%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'assign', 'application_id', _application_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'expected_content_hash', _expected_content_hash, 'notice_version', _notice_version,
    'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- ---- the existing spine: application, employer, job, candidate ---------
  SELECT * INTO _ja FROM public.job_applications WHERE id = _application_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_APPLICATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _ja.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting a preparation requires an active membership of the employer that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_ja.employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start preparations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ja.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_APPLICATION_WITHDRAWN: the candidate withdrew this application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _ja.applicant_user_id IS NULL THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_UNKNOWN: this application has no signed-in applicant, so there is nobody to prepare.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = _ja.job_id AND j.employer_id = _ja.employer_id) THEN
    RAISE EXCEPTION 'BCP_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---- the governed method: published, recruitment support, pinned ------
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED: this method version is "%"; only a published version may be assigned.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: BESKT PR 3 assigns recruitment-support content only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.bcp_version_is_candidate_safe(_method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: this version holds security-vetting content and can never be put in front of a candidate here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is not recruitment support.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The caller names the content it was looking at; a method edited or
  -- republished since is a different question set and is refused.
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- the explicit release gate ----------------------------------------
  IF NOT public.bcp_pilot_grant_active(_ja.employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant for this BESKT method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _notice_version IS DISTINCT FROM public.bcp_notice_version() THEN
    RAISE EXCEPTION 'BCP_NOTICE_VERSION_UNKNOWN: the current candidate notice is "%".', public.bcp_notice_version()
      USING ERRCODE = 'check_violation';
  END IF;

  -- One live preparation per application. Serialise so two members cannot
  -- both pass the check.
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_application:' || _application_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.bcp_assignments a
              WHERE a.application_id = _application_id AND a.lifecycle_state <> 'cancelled') THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_EXISTS: this application already has a live BESKT preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, candidate_user_id, method_version_id,
     exposure_profile_id, pinned_content_hash, pinned_release_scope, notice_version,
     due_at, assigned_by)
  VALUES
    (_ja.employer_id, _ja.job_id, _application_id, _ja.applicant_user_id, _method_version_id,
     _exposure_profile_id, _v.content_hash, _v.release_scope, _notice_version,
     _due_at, auth.uid())
  RETURNING id INTO _id;

  _result := jsonb_build_object(
    'assignment_id', _id, 'application_id', _application_id, 'employer_id', _ja.employer_id,
    'job_id', _ja.job_id, 'candidate_user_id', _ja.applicant_user_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'content_hash', _v.content_hash, 'notice_version', _notice_version,
    'lifecycle_state', 'assigned', 'revision', 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_id, NULL, _ja.employer_id, _method_version_id,
    'assignment_created', NULL, 'assigned', NULL, _v.content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_assign(uuid, uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assign(uuid, uuid, uuid, uuid, text, text, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_assign(uuid, uuid, uuid, uuid, text, text, timestamptz) IS
  'Starts ONE BESKT candidate preparation from an existing job application. '
  'Refuses without an active membership of the application''s own employer, '
  'an active employer, a live application with a signed-in applicant, a job '
  'of the same employer, a PUBLISHED recruitment-support method version that '
  'holds no security-vetting content, a profile of that version, the exact '
  'content hash the caller was looking at, a live pilot grant and the '
  'current notice version. Creates no user, employer, job, application or '
  'candidate record of its own.';


-- 6.3  Delivery evidence: the candidate opened the preparation.
CREATE OR REPLACE FUNCTION public.bcp_mark_opened(_operation_id uuid, _assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE; _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may open it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'mark_opened', 'assignment_id', _assignment_id);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.available_from > now() THEN
    RAISE EXCEPTION 'BCP_NOT_AVAILABLE_YET: this preparation becomes available at %.', _a.available_from
      USING ERRCODE = 'check_violation';
  END IF;

  IF _a.first_opened_at IS NULL THEN
    UPDATE public.bcp_assignments SET first_opened_at = now() WHERE id = _assignment_id;
  END IF;

  _result := jsonb_build_object('assignment_id', _assignment_id,
    'lifecycle_state', _a.lifecycle_state,
    'first_opened_at', coalesce(_a.first_opened_at, now()), 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, NULL, _a.employer_id, _a.method_version_id,
    'assignment_opened', _a.lifecycle_state, _a.lifecycle_state, NULL, _a.pinned_content_hash,
    _a.revision, _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_mark_opened(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_mark_opened(uuid, uuid) TO authenticated, service_role;


-- 6.4  The candidate acknowledges the notice. Nothing may be answered
--      before this: the information duty is enforced by the lifecycle, not
--      by a screen.
CREATE OR REPLACE FUNCTION public.bcp_acknowledge_notice(
  _operation_id uuid,
  _assignment_id uuid,
  _notice_version text,
  _notice_content_hash text,
  _locale text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE;
  _expected text; _response_id uuid; _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may acknowledge its notice.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'acknowledge_notice', 'assignment_id', _assignment_id,
    'notice_version', _notice_version, 'notice_content_hash', _notice_content_hash, 'locale', _locale);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: this preparation has been submitted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.available_from > now() THEN
    RAISE EXCEPTION 'BCP_NOT_AVAILABLE_YET: this preparation becomes available at %.', _a.available_from
      USING ERRCODE = 'check_violation';
  END IF;
  IF _notice_version IS DISTINCT FROM _a.notice_version THEN
    RAISE EXCEPTION 'BCP_NOTICE_VERSION_MISMATCH: this preparation carries notice "%".', _a.notice_version
      USING ERRCODE = 'check_violation';
  END IF;

  -- The hash is the server's own, so a client cannot acknowledge a notice
  -- it invented or an older set of disclosures.
  _expected := public.bcp_notice_hash(_assignment_id);
  IF _notice_content_hash IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'BCP_NOTICE_HASH_MISMATCH: the notice you acknowledged is not the notice this preparation carries. Reload and read it again.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _a.acknowledged_at IS NULL THEN
    INSERT INTO public.bcp_notice_acknowledgements
      (assignment_id, candidate_user_id, notice_version, notice_content_hash, locale)
    VALUES (_assignment_id, auth.uid(), _notice_version, _notice_content_hash, _locale);

    UPDATE public.bcp_assignments
       SET lifecycle_state = 'notice_acknowledged',
           acknowledged_at = now(),
           first_opened_at = coalesce(first_opened_at, now()),
           revision = revision + 1
     WHERE id = _assignment_id;
  END IF;

  -- The candidate's first draft opens here, once.
  SELECT r.id INTO _response_id FROM public.bcp_responses r
   WHERE r.assignment_id = _assignment_id AND r.response_state = 'draft';
  IF _response_id IS NULL AND NOT EXISTS (
       SELECT 1 FROM public.bcp_responses r WHERE r.assignment_id = _assignment_id) THEN
    INSERT INTO public.bcp_responses (assignment_id, response_version)
    VALUES (_assignment_id, 1) RETURNING id INTO _response_id;
  END IF;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'response_id', _response_id,
    'notice_version', _notice_version, 'notice_content_hash', _expected, 'locale', _locale,
    'lifecycle_state', 'notice_acknowledged',
    'revision', (SELECT revision FROM public.bcp_assignments WHERE id = _assignment_id),
    'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, _response_id, _a.employer_id, _a.method_version_id,
    'notice_acknowledged', _a.lifecycle_state, 'notice_acknowledged', NULL, _a.pinned_content_hash,
    (SELECT revision FROM public.bcp_assignments WHERE id = _assignment_id),
    _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_acknowledge_notice(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_acknowledge_notice(uuid, uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_acknowledge_notice(uuid, uuid, text, text, text) IS
  'Records that the candidate was shown, and confirmed reading, the exact '
  'governed notice this preparation carries, in a stated language. It is an '
  'information receipt and NOT GDPR consent; it creates no lawful basis. '
  'Opens the candidate''s first draft response in the same transaction.';


-- 6.5  Save. Partial, resumable, and refused for anything the candidate
--      cannot currently see.
--
--      Visibility is resolved from what is ALREADY stored, through PR #218's
--      beskt_resolve_item_sequence(). So a candidate may answer exactly the
--      items in front of them, and an item that a later answer hides can
--      never be written to afterwards.
CREATE OR REPLACE FUNCTION public.bcp_save_answers(
  _operation_id uuid,
  _assignment_id uuid,
  _expected_revision integer,
  _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _visible uuid[];
  _entry jsonb;
  _item public.beskt_items%ROWTYPE;
  _state text; _key text;
  _opts text[];
  _saved integer := 0;
  _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may answer it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: answers must be a JSON array of typed entries.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request := jsonb_build_object('op', 'save_answers', 'assignment_id', _assignment_id,
    'expected_revision', _expected_revision, 'answers', _answers);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.' USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: this preparation has been submitted and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the candidate notice must be read and acknowledged before any question is answered.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- compare-and-swap on the DRAFT, before any write ------------------
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: a save names the revision it was looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NO_OPEN_DRAFT: this preparation has no open draft.' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the draft is at revision % but the request expected revision %. Reload and retry.',
      _r.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  -- ---- what the candidate can currently see -----------------------------
  SELECT coalesce(array_agg(v.item_id), '{}'::uuid[]) INTO _visible
    FROM public.bcp_visible_items(_assignment_id, _r.id) v;

  FOR _entry IN SELECT jsonb_array_elements(_answers) LOOP
    IF jsonb_typeof(_entry) <> 'object' THEN
      RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: every answer entry must be a JSON object.'
        USING ERRCODE = 'check_violation';
    END IF;
    _key := _entry ->> 'item_key';
    _state := _entry ->> 'response_state';
    IF _key IS NULL OR _state IS NULL THEN
      RAISE EXCEPTION 'BCP_ANSWER_INCOMPLETE: every answer entry names an item_key and a response_state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state NOT IN ('answered', 'omitted', 'discuss_orally') THEN
      RAISE EXCEPTION 'BCP_ANSWER_STATE_UNKNOWN: "%" is not a candidate response state.', _state
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO _item FROM public.beskt_items i
     WHERE i.method_version_id = _a.method_version_id AND i.item_key = _key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_VERSION: "%" is not an item of the assigned method version.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.exposure_profile_id IS DISTINCT FROM _a.exposure_profile_id THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_PROFILE: "%" does not belong to the assigned exposure profile.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.phase <> 'candidate_preparation' THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_CANDIDATE_PHASE: "%" is not a candidate-preparation item.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.permitted_mode <> 'recruitment_support'
       OR _item.sensitivity_class = 'security_vetting_only' THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_PERMITTED: "%" is security-vetting content and is never answered here.', _key
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (_item.id = ANY (_visible)) THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_VISIBLE: "%" is not currently shown to this candidate, so it cannot be answered.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state = 'discuss_orally' AND NOT _item.discuss_orally_allowed THEN
      RAISE EXCEPTION 'BCP_ORAL_NOT_ALLOWED: "%" is not marked as one that may be taken orally.', _key
        USING ERRCODE = 'check_violation';
    END IF;

    _opts := NULL;
    IF _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice') THEN
      SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO _opts
        FROM jsonb_array_elements_text(coalesce(_entry -> 'option_keys', '[]'::jsonb)) AS k;
      IF EXISTS (
        SELECT 1 FROM unnest(_opts) AS k
         WHERE NOT EXISTS (SELECT 1 FROM public.beskt_item_options o
                            WHERE o.item_id = _item.id AND o.option_key = k)) THEN
        RAISE EXCEPTION 'BCP_OPTION_NOT_IN_ITEM: an option selected for "%" is not a governed option of that item.', _key
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.bcp_answers
      (response_id, item_id, item_key, answer_type, response_state,
       value_boolean, value_text, value_date, selected_option_keys)
    VALUES (
      _r.id, _item.id, _item.item_key, _item.answer_type, _state,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('boolean', 'acknowledgement')
           THEN (_entry ->> 'value_boolean')::boolean END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('short_text', 'long_text')
           THEN _entry ->> 'value_text' END,
      CASE WHEN _state = 'answered' AND _item.answer_type = 'date'
           THEN (_entry ->> 'value_date')::date END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice')
           THEN _opts END)
    ON CONFLICT (response_id, item_id) DO UPDATE SET
      answer_type = EXCLUDED.answer_type,
      response_state = EXCLUDED.response_state,
      value_boolean = EXCLUDED.value_boolean,
      value_text = EXCLUDED.value_text,
      value_date = EXCLUDED.value_date,
      selected_option_keys = EXCLUDED.selected_option_keys;
    _saved := _saved + 1;
  END LOOP;

  UPDATE public.bcp_responses SET revision = revision + 1 WHERE id = _r.id;
  IF _a.lifecycle_state = 'notice_acknowledged' THEN
    UPDATE public.bcp_assignments
       SET lifecycle_state = 'in_progress', revision = revision + 1 WHERE id = _assignment_id;
  END IF;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'response_id', _r.id,
    'revision', _r.revision + 1, 'saved', _saved,
    'lifecycle_state', (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'response_saved', _a.lifecycle_state,
    (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    NULL, _a.pinned_content_hash, _r.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('items_saved', _saved));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_save_answers(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_save_answers(uuid, uuid, integer, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_save_answers(uuid, uuid, integer, jsonb) IS
  'Saves a partial, resumable set of typed candidate answers against '
  'governed item keys. Refuses an item the candidate cannot currently see, '
  'an item of another profile, phase or mode, an option the governed item '
  'does not offer, "discuss orally" where the item does not allow it, a '
  'stale revision (without writing) and any answer before the notice has '
  'been acknowledged. Stores no score and computes no judgement.';


-- 6.6  Submit. One transaction, once.
CREATE OR REPLACE FUNCTION public.bcp_submit(
  _operation_id uuid, _assignment_id uuid, _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _visible uuid[];
  _missing text[];
  _stale integer := 0;
  _content_hash text;
  _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may submit it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'submit', 'assignment_id', _assignment_id,
    'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.' USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: this preparation has already been submitted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the candidate notice must be acknowledged before submission.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: a submission names the revision it was looking at.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NO_OPEN_DRAFT: this preparation has no open draft to submit.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _r.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the draft is at revision % but the request expected revision %. Reload and retry.',
      _r.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  -- The method must still be exactly what was assigned.
  IF (SELECT v.content_hash FROM public.beskt_method_versions v WHERE v.id = _a.method_version_id)
       IS DISTINCT FROM _a.pinned_content_hash THEN
    RAISE EXCEPTION 'BCP_METHOD_CONTENT_MOVED: the assigned method version no longer matches the pinned content hash.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(v.item_id), '{}'::uuid[]) INTO _visible
    FROM public.bcp_visible_items(_assignment_id, _r.id) v;

  -- A stored answer to an item the final routing no longer shows has NO
  -- downstream effect: it is removed inside this transaction, so the frozen
  -- response holds exactly what was on screen and nothing else.
  WITH gone AS (
    DELETE FROM public.bcp_answers a
     WHERE a.response_id = _r.id AND NOT (a.item_id = ANY (_visible))
    RETURNING 1)
  SELECT count(*) INTO _stale FROM gone;

  SELECT coalesce(array_agg(i.item_key ORDER BY i.item_key), '{}'::text[]) INTO _missing
    FROM public.beskt_items i
   WHERE i.id = ANY (_visible)
     AND NOT EXISTS (SELECT 1 FROM public.bcp_answers a
                      WHERE a.response_id = _r.id AND a.item_id = i.id);
  IF coalesce(array_length(_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'BCP_INCOMPLETE: every question shown must be answered, skipped or marked for oral discussion first; outstanding: %.',
      array_to_string(_missing, ', ') USING ERRCODE = 'check_violation';
  END IF;

  _content_hash := public.bcp_answers_content_hash(_r.id);

  UPDATE public.bcp_responses
     SET response_state = 'submitted',
         submitted_at = now(),
         submitted_content_hash = _content_hash,
         submitted_method_content_hash = _a.pinned_content_hash,
         revision = revision + 1
   WHERE id = _r.id;

  UPDATE public.bcp_assignments
     SET lifecycle_state = 'submitted', submitted_at = now(), revision = revision + 1
   WHERE id = _assignment_id;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'response_id', _r.id,
    'response_version', _r.response_version, 'lifecycle_state', 'submitted',
    'submitted_content_hash', _content_hash,
    'submitted_method_content_hash', _a.pinned_content_hash,
    'revision', _r.revision + 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'response_submitted', _a.lifecycle_state, 'submitted', NULL, _content_hash,
    _r.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('stale_hidden_answers_removed', _stale,
                       'visible_items', coalesce(array_length(_visible, 1), 0)));
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_submit(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_submit(uuid, uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_submit(uuid, uuid, integer) IS
  'Freezes the candidate''s draft into an immutable submitted response in ONE '
  'transaction: removes any stored answer the final routing no longer shows, '
  'requires every shown question to have been answered, skipped or marked '
  'oral, hashes the exact submitted answers and the pinned method content, '
  'and moves the assignment to submitted. Idempotent by operation id; a '
  'second submission is refused. Produces no score, ranking or verdict.';


-- 6.7  Cancel. Employer-side lifecycle only; it changes no application
--      status and interprets nothing.
CREATE OR REPLACE FUNCTION public.bcp_cancel(
  _operation_id uuid, _assignment_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE; _result jsonb;
BEGIN
  IF NOT public.bcp_employer_can_read_assignment(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: cancelling a preparation requires an active membership of its employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'cancel', 'assignment_id', _assignment_id, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: a submitted preparation cannot be cancelled; the candidate''s basis stands.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation is already cancelled.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bcp_assignments
     SET lifecycle_state = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancelled_reason = _reason, revision = revision + 1
   WHERE id = _assignment_id;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'lifecycle_state', 'cancelled',
    'revision', _a.revision + 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, NULL, _a.employer_id, _a.method_version_id,
    'assignment_cancelled', _a.lifecycle_state, 'cancelled', _reason, _a.pinned_content_hash,
    _a.revision + 1, _operation_id, _hash, _result);
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_cancel(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_cancel(uuid, uuid, text) TO authenticated, service_role;


-- ###########################################################################
-- SECTION 7 -- Deterministic read models
-- ###########################################################################
--
-- Four reads, each answering exactly one principal about exactly one thing.
-- None of them returns, derives or implies a score, a level, a ranking, a
-- suitability or credibility judgement, a recommendation or an application
-- status.
-- ---------------------------------------------------------------------------

-- 7.1  What an employer may start a preparation with right now. Empty for a
--      non-member, for an inactive employer, and -- crucially -- for an
--      employer holding no live grant, which in production is every
--      employer. The screen and the create call share this decision, so a
--      method offered here is a method bcp_assign() accepts.
CREATE OR REPLACE FUNCTION public.bcp_assignable_method_versions(_employer_id uuid)
RETURNS TABLE (
  method_version_id uuid,
  pack_id uuid,
  pack_slug text,
  name_sv text,
  name_en text,
  purpose_sv text,
  version_number integer,
  mode text,
  validation_label text,
  release_scope text,
  content_hash text,
  summary_sv text,
  summary_en text,
  grant_expires_on date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, g.expires_on
      FROM public.beskt_method_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      JOIN public.bcp_pilot_grants g
        ON g.method_version_id = v.id AND g.employer_id = _employer_id
     WHERE p.pack_kind = 'beskt_method'
       AND v.content_status = 'published'
       AND v.mode = 'recruitment_support'
       AND public.bcp_version_is_candidate_safe(v.id)
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on
     ORDER BY p.name_sv, v.version_number DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_assignable_method_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assignable_method_versions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_assignable_method_versions(uuid) IS
  'The BESKT methods this employer may start a candidate preparation with '
  'right now: published, recruitment support, candidate safe, and covered by '
  'a live pilot grant. Returns no rows for a non-member, an inactive '
  'employer, a candidate, and any employer without a grant -- which, until a '
  'governed method is published and admitted, is every employer. An honest '
  'empty state is the product state, not a bug.';


-- 7.1b The role-exposure profiles of one assignable method version. The
--      employer chooses WHICH documented role relevance the preparation is
--      for; every governed question hangs off exactly one of these, which is
--      what makes the questions answerable for "why am I being asked this?".
--      Gated on the same live grant as the listing above.
CREATE OR REPLACE FUNCTION public.bcp_assignable_exposure_profiles(
  _employer_id uuid, _method_version_id uuid)
RETURNS TABLE (
  exposure_profile_id uuid,
  profile_key text,
  display_order integer,
  exposure_area text,
  duties_sv text,
  duties_en text,
  role_relevance_rationale_sv text,
  role_relevance_rationale_en text,
  retention_class text,
  candidate_item_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false)
     OR NOT public.bcp_pilot_grant_active(_employer_id, _method_version_id)
     OR NOT public.bcp_version_is_candidate_safe(_method_version_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.profile_key, p.display_order, p.exposure_area,
           p.duties_sv, p.duties_en,
           p.role_relevance_rationale_sv, p.role_relevance_rationale_en,
           p.retention_class,
           (SELECT count(*)::integer FROM public.beskt_items i
             WHERE i.exposure_profile_id = p.id
               AND i.phase = 'candidate_preparation'
               AND i.permitted_mode = 'recruitment_support')
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = 'recruitment_support'
     ORDER BY p.display_order, p.profile_key;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_assignable_exposure_profiles(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assignable_exposure_profiles(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_assignable_exposure_profiles(uuid, uuid) IS
  'The documented role-exposure profiles an admitted employer may start a '
  'preparation against, with the number of candidate-preparation questions '
  'each one carries. Empty for a non-member, an inactive employer, an '
  'employer without a live grant, and any version holding security-vetting '
  'content. Returns no candidate and no answer.';

-- 7.2  The candidate's own preparations, for My Career. Theirs only.
CREATE OR REPLACE FUNCTION public.bcp_candidate_assignments()
RETURNS TABLE (
  assignment_id uuid,
  application_id uuid,
  job_id uuid,
  job_title_sv text,
  job_title_en text,
  employer_id uuid,
  employer_name text,
  method_name_sv text,
  method_name_en text,
  lifecycle_state text,
  available_from timestamptz,
  due_at timestamptz,
  assigned_at timestamptz,
  submitted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.employer_id, e.name,
         p.name_sv, p.name_en, a.lifecycle_state, a.available_from, a.due_at,
         a.assigned_at, a.submitted_at
    FROM public.bcp_assignments a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.employers e ON e.id = a.employer_id
    JOIN public.beskt_method_versions v ON v.id = a.method_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE auth.uid() IS NOT NULL
     AND a.candidate_user_id = auth.uid()
     AND a.lifecycle_state <> 'cancelled'
   ORDER BY a.assigned_at DESC;
$$;

REVOKE ALL ON FUNCTION public.bcp_candidate_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_candidate_assignments() TO authenticated, service_role;


-- 7.3  The candidate's preparation itself: the method, its purpose, the
--      notice, the currently visible governed questions in governed order,
--      and their own saved answers. Nobody else's, ever.
CREATE OR REPLACE FUNCTION public.bcp_candidate_preparation(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
  _prof public.beskt_exposure_profiles%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: this preparation does not belong to you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _a.method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;
  SELECT * INTO _prof FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  -- The latest response: the open draft while there is one, otherwise the
  -- submitted version the candidate may re-read but not change.
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id
   ORDER BY response_version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'assignment_id', _a.id,
    'application_id', _a.application_id,
    'job_id', _a.job_id,
    'employer_id', _a.employer_id,
    'lifecycle_state', _a.lifecycle_state,
    'available_from', _a.available_from,
    'due_at', _a.due_at,
    'submitted_at', _a.submitted_at,
    'read_only', _a.lifecycle_state IN ('submitted', 'cancelled'),
    'method', jsonb_build_object(
      'method_version_id', _v.id, 'pack_slug', _p.slug,
      'name_sv', _p.name_sv, 'name_en', _p.name_en, 'purpose_sv', _p.purpose_sv,
      'version_number', _v.version_number, 'mode', _v.mode,
      'validation_label', _v.validation_label, 'release_scope', _v.release_scope,
      'summary_sv', _v.summary_sv, 'summary_en', _v.summary_en,
      'content_hash', _a.pinned_content_hash,
      'content_hash_algorithm', _a.pinned_content_hash_algorithm),
    'exposure_profile', jsonb_build_object(
      'profile_key', _prof.profile_key, 'exposure_area', _prof.exposure_area,
      'duties_sv', _prof.duties_sv, 'duties_en', _prof.duties_en,
      'role_relevance_rationale_sv', _prof.role_relevance_rationale_sv,
      'role_relevance_rationale_en', _prof.role_relevance_rationale_en,
      'retention_class', _prof.retention_class,
      'lawful_basis_reference', _prof.lawful_basis_reference,
      'jurisdiction_reference', _prof.jurisdiction_reference),
    'notice', jsonb_build_object(
      'notice_version', _a.notice_version,
      'notice_content_hash', public.bcp_notice_hash(_assignment_id),
      'acknowledged_at', _a.acknowledged_at,
      'descriptor', public.bcp_notice_descriptor(_assignment_id)),
    'response', CASE WHEN _r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'response_id', _r.id, 'response_version', _r.response_version,
      'response_state', _r.response_state, 'revision', _r.revision,
      'submitted_at', _r.submitted_at,
      'submitted_content_hash', _r.submitted_content_hash) END,
    -- The governed questions currently in front of this candidate, in
    -- governed order, resolved through PR #218's routing authority.
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'sequence_position', vis.sequence_position,
          'item_key', i.item_key, 'section_key', vis.section_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'answer_type', i.answer_type, 'requiredness', i.requiredness,
          'discuss_orally_allowed', i.discuss_orally_allowed,
          'options', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'option_key', o.option_key, 'display_order', o.display_order,
                'label_sv', o.label_sv, 'label_en', o.label_en)
              ORDER BY o.display_order, o.option_key)
              FROM public.beskt_item_options o WHERE o.item_id = i.id), '[]'::jsonb),
          'answer', (
            SELECT jsonb_build_object(
                'response_state', an.response_state,
                'value_boolean', to_jsonb(an.value_boolean),
                'value_text', to_jsonb(an.value_text),
                'value_date', to_jsonb(an.value_date),
                'option_keys', to_jsonb(coalesce(an.selected_option_keys, '{}'::text[])))
              FROM public.bcp_answers an
             WHERE an.response_id = _r.id AND an.item_id = i.id))
        ORDER BY vis.sequence_position)
        FROM public.bcp_visible_items(_assignment_id, _r.id) vis
        JOIN public.beskt_items i ON i.id = vis.item_id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_candidate_preparation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_candidate_preparation(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_candidate_preparation(uuid) IS
  'Everything the candidate needs for their OWN preparation and nothing '
  'else: the method and its purpose, the governed notice, the questions '
  'currently shown to them in governed order with their own saved answers. '
  'Never another candidate''s, never the interviewer prompts, the evidence '
  'anchors, the routing graph or any security-vetting content, and never a '
  'score, progress judgement or suitability statement -- there is no such '
  'field to return.';


-- 7.4  The employer's list of preparations for their own employer.
CREATE OR REPLACE FUNCTION public.bcp_employer_assignments(_employer_id uuid)
RETURNS TABLE (
  assignment_id uuid,
  application_id uuid,
  job_id uuid,
  job_title_sv text,
  job_title_en text,
  candidate_user_id uuid,
  method_name_sv text,
  method_name_en text,
  method_version_number integer,
  content_hash text,
  lifecycle_state text,
  assigned_at timestamptz,
  due_at timestamptz,
  submitted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.candidate_user_id,
           p.name_sv, p.name_en, v.version_number, a.pinned_content_hash,
           a.lifecycle_state, a.assigned_at, a.due_at, a.submitted_at
      FROM public.bcp_assignments a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.beskt_method_versions v ON v.id = a.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE a.employer_id = _employer_id
     ORDER BY a.assigned_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_employer_assignments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_assignments(uuid) TO authenticated, service_role;


-- 7.5  The employer readback. Status always; the candidate's own submitted
--      basis only once it has been submitted.
--
--      A DRAFT IS NEVER RETURNED. PR 1 section 6: candidate drafts remain
--      private until submission, and "answers" is absent -- not empty, not
--      partial -- until then.
--
--      What comes back is the candidate's own words and explicit states,
--      plus the governed topics the interview still needs to cover because
--      the candidate skipped them or asked to take them orally. That is a
--      restatement of what the candidate said, not an interpretation of it:
--      there is no observation, evidence grade, assessor conclusion, panel
--      resolution, recommendation, report or application-status change here,
--      and PR 3 must not add one.
CREATE OR REPLACE FUNCTION public.bcp_employer_readback(_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
  _prof public.beskt_exposure_profiles%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
BEGIN
  IF NOT public.bcp_employer_can_read_assignment(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you may not read this preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _a.method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;
  SELECT * INTO _prof FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'assignment_id', _a.id,
    'application_id', _a.application_id,
    'job_id', _a.job_id,
    'employer_id', _a.employer_id,
    'candidate_user_id', _a.candidate_user_id,
    'lifecycle_state', _a.lifecycle_state,
    'assigned_at', _a.assigned_at,
    'due_at', _a.due_at,
    'submitted_at', _a.submitted_at,
    'is_submitted', _r.id IS NOT NULL,
    'method', jsonb_build_object(
      'method_version_id', _v.id, 'pack_slug', _p.slug,
      'name_sv', _p.name_sv, 'name_en', _p.name_en,
      'version_number', _v.version_number, 'mode', _v.mode,
      'validation_label', _v.validation_label, 'release_scope', _v.release_scope,
      'content_hash', _a.pinned_content_hash,
      'content_hash_algorithm', _a.pinned_content_hash_algorithm,
      'exposure_profile_key', _prof.profile_key,
      'exposure_area', _prof.exposure_area,
      'retention_class', _prof.retention_class),
    'submitted_response', CASE WHEN _r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'response_id', _r.id, 'response_version', _r.response_version,
      'submitted_at', _r.submitted_at,
      'submitted_content_hash', _r.submitted_content_hash,
      'submitted_method_content_hash', _r.submitted_method_content_hash) END,
    -- Absent entirely while unsubmitted.
    'answers', CASE WHEN _r.id IS NULL THEN NULL ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'answer_type', an.answer_type,
          'response_state', an.response_state,
          'value_boolean', to_jsonb(an.value_boolean),
          'value_text', to_jsonb(an.value_text),
          'value_date', to_jsonb(an.value_date),
          'option_keys', to_jsonb(coalesce(an.selected_option_keys, '{}'::text[])),
          'option_labels', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'option_key', o.option_key, 'label_sv', o.label_sv, 'label_en', o.label_en)
              ORDER BY o.display_order, o.option_key)
              FROM public.beskt_item_options o
             WHERE o.item_id = an.item_id
               AND o.option_key = ANY (coalesce(an.selected_option_keys, '{}'::text[]))), '[]'::jsonb))
        ORDER BY s.display_order, i.display_order, an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE an.response_id = _r.id), '[]'::jsonb) END,
    -- The governed topics still to cover in the interview, because the
    -- candidate skipped them or asked for them orally. Neutral by
    -- construction: it is a list of questions, carries no judgement of the
    -- candidate, and an omission is never evidence of anything.
    'topics_for_interview', CASE WHEN _r.id IS NULL THEN NULL ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'reason', an.response_state,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY s.display_order, i.display_order, an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE an.response_id = _r.id
         AND an.response_state IN ('omitted', 'discuss_orally')), '[]'::jsonb) END);
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_employer_readback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_employer_readback(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_employer_readback(uuid) IS
  'What an authorised member of the assignment''s own employer may read: the '
  'status, the submission time, the method version and content hash used, '
  'and -- only once submitted -- the candidate''s own answers with their '
  'explicit omitted / discuss-orally states and the governed topics the '
  'interview still needs to cover. An unsubmitted draft is never returned, '
  'not even in part. It interprets nothing: no observation, evidence grade, '
  'assessor conclusion, panel resolution, recommendation, report or '
  'application-status change exists on this path.';


-- ###########################################################################
-- SECTION 8 -- RLS, revokes, grants and policies
-- ###########################################################################
--
-- Every PR 3 table: ENABLE and FORCE ROW LEVEL SECURITY, revoked to zero for
-- PUBLIC, anon and authenticated (Supabase's default privileges grant both
-- the full set on every new table -- silence would be a grant), then SELECT
-- re-granted to authenticated behind ONE narrow party policy.
--
-- There is NO INSERT, UPDATE or DELETE grant and NO write policy for any
-- client role, service_role included: every write goes through the governed
-- SECURITY DEFINER RPCs above, which hold the privilege through their owner.
-- service_role is therefore not, and cannot become, a user-facing
-- authorisation mechanism here -- it is SELECT-only on all six tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.bcp_pilot_grants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_pilot_grants              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_assignments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_assignments               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_notice_acknowledgements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_notice_acknowledgements   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_responses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_responses                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_answers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_answers                   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_events                    FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.bcp_pilot_grants            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_assignments             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_notice_acknowledgements FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_responses               FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_answers                 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_events                  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.bcp_pilot_grants            TO authenticated, service_role;
GRANT SELECT ON public.bcp_assignments             TO authenticated, service_role;
GRANT SELECT ON public.bcp_notice_acknowledgements TO authenticated, service_role;
GRANT SELECT ON public.bcp_responses               TO authenticated, service_role;
GRANT SELECT ON public.bcp_answers                 TO authenticated, service_role;
GRANT SELECT ON public.bcp_events                  TO authenticated, service_role;


-- A pilot grant is visible to the employer it admits and to platform
-- administrators. No other employer learns who is in the pilot.
CREATE POLICY bcp_pilot_grants_party_read ON public.bcp_pilot_grants
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid())
         OR public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member']));

-- An assignment is visible to its own candidate and to active members of its
-- own employer. Nobody else, in any tenant.
CREATE POLICY bcp_assignments_party_read ON public.bcp_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL
         AND (candidate_user_id = auth.uid()
              OR public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member'])));

CREATE POLICY bcp_notice_acknowledgements_party_read ON public.bcp_notice_acknowledgements
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = assignment_id
       AND (a.candidate_user_id = auth.uid()
            OR public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member']))));

-- THE DRAFT BOUNDARY, as a row policy as well as a read model: the
-- candidate sees their own response at every state; the employer sees a
-- response ONLY once it has been submitted.
CREATE POLICY bcp_responses_party_read ON public.bcp_responses
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_assignments a
     WHERE a.id = assignment_id
       AND (a.candidate_user_id = auth.uid()
            OR (bcp_responses.response_state = 'submitted'
                AND public.has_employer_role(auth.uid(), a.employer_id,
                                             ARRAY['owner', 'admin', 'member'])))));

CREATE POLICY bcp_answers_party_read ON public.bcp_answers
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bcp_responses r
      JOIN public.bcp_assignments a ON a.id = r.assignment_id
     WHERE r.id = response_id
       AND (a.candidate_user_id = auth.uid()
            OR (r.response_state = 'submitted'
                AND public.has_employer_role(auth.uid(), a.employer_id,
                                             ARRAY['owner', 'admin', 'member'])))));

CREATE POLICY bcp_events_party_read ON public.bcp_events
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL
         AND (public.is_platform_admin(auth.uid())
              OR (assignment_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.bcp_assignments a
                     WHERE a.id = assignment_id
                       AND (a.candidate_user_id = auth.uid()
                            OR public.has_employer_role(auth.uid(), a.employer_id,
                                                        ARRAY['owner', 'admin', 'member']))))));


-- ###########################################################################
-- SECTION 9 -- Postflight catalogue assertions
-- ###########################################################################
--
-- The migration refuses to complete unless the database it leaves behind has
-- the properties this PR claims. Inspected from the catalogue, not assumed.
-- ---------------------------------------------------------------------------

DO $proof$
DECLARE
  _tables text[] := ARRAY['bcp_pilot_grants', 'bcp_assignments',
    'bcp_notice_acknowledgements', 'bcp_responses', 'bcp_answers', 'bcp_events'];
  _t text;
  _n integer;
  _fn text;
  _src text;
  _priv text;
  _role text;
BEGIN
  -- 9.1  Every PR 3 table exists with ENABLE and FORCE RLS, zero client
  --      write privilege, nothing for anon or PUBLIC, and no write policy.
  FOREACH _t IN ARRAY _tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
                      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'BCP_PROOF: % is missing or does not carry ENABLE and FORCE ROW LEVEL SECURITY.', _t;
    END IF;
    FOREACH _priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      FOREACH _role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF has_table_privilege(_role, 'public.' || _t, _priv) THEN
          RAISE EXCEPTION 'BCP_PROOF: % holds % on %; every write must go through a governed RPC.', _role, _priv, _t;
        END IF;
      END LOOP;
    END LOOP;
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'BCP_PROOF: anon can read %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public' AND g.table_name = _t AND g.grantee = 'PUBLIC') THEN
      RAISE EXCEPTION 'BCP_PROOF: PUBLIC holds a grant on %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t AND p.cmd <> 'SELECT') THEN
      RAISE EXCEPTION 'BCP_PROOF: % carries a write policy; no client writer may exist.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t
                  AND (p.qual IS NULL OR p.qual = 'true')) THEN
      RAISE EXCEPTION 'BCP_PROOF: % carries an unconditional policy.', _t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = _t) THEN
      RAISE EXCEPTION 'BCP_PROOF: % has FORCE RLS but no policy, so its SELECT grant is dead.', _t;
    END IF;
  END LOOP;

  -- 9.2  No interpretation can hide in a column: no score, level, weight,
  --      threshold, total, rank, pass/fail, suitability, credibility,
  --      truthfulness, recommendation, risk, verdict, probability,
  --      sentiment, emotion, deception or hiring column anywhere in the
  --      candidate-preparation runtime.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'bcp\_%' ESCAPE '\'
     AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire)'
          OR c.column_name = 'points');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: % forbidden column(s) exist in the candidate-preparation runtime.', _n;
  END IF;

  -- 9.3  The answers are TYPED. No jsonb column outside the event ledger, so
  --      no ungoverned free-form scoring object can be stored as an answer.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name LIKE 'bcp\_%' ESCAPE '\'
     AND c.data_type = 'jsonb' AND c.table_name <> 'bcp_events';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: a candidate-preparation table carries a jsonb column; answers must be typed.';
  END IF;

  -- 9.4  The three explicit candidate response states exist, and only those.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bcp_answers'::regclass
       AND pg_get_constraintdef(oid) LIKE '%''answered''%'
       AND pg_get_constraintdef(oid) LIKE '%''omitted''%'
       AND pg_get_constraintdef(oid) LIKE '%''discuss_orally''%') THEN
    RAISE EXCEPTION 'BCP_PROOF: the answered / omitted / discuss_orally response states are not constrained.';
  END IF;

  -- 9.5  Security-vetting support is NOT representable on an assignment.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bcp_assignments'::regclass
       AND pg_get_constraintdef(oid) LIKE '%mode = ''recruitment_support''%') THEN
    RAISE EXCEPTION 'BCP_PROOF: bcp_assignments.mode does not admit recruitment_support alone.';
  END IF;

  -- 9.6  Every bcp_ function pins its search_path, is unreachable by anon,
  --      and -- if it is a trigger function -- unreachable by authenticated.
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'bcp\_%' ESCAPE '\' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'BCP_PROOF: % has no pinned search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_PROOF: anon can execute %.', _fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                  AND p.prorettype = 'pg_catalog.trigger'::regtype)
       AND has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_PROOF: trigger function % is executable by authenticated.', _fn;
    END IF;
  END LOOP;

  -- 9.7  The internal helpers are unreachable by authenticated.
  FOREACH _fn IN ARRAY ARRAY[
      'public.bcp_record_event(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,uuid,text,jsonb,jsonb)',
      'public.bcp_operation_begin(uuid,text)',
      'public.bcp_canonical_answers(uuid)',
      'public.bcp_answers_content_hash(uuid)',
      'public.bcp_routing_answers(uuid)',
      'public.bcp_visible_items(uuid,uuid)',
      'public.bcp_party_can_read_method_version(uuid)'] LOOP
    IF has_function_privilege('authenticated', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_PROOF: internal function % is executable by authenticated.', _fn;
    END IF;
  END LOOP;

  -- 9.8  Append-only and immutability triggers exist and cover what they claim.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'bcp_events_append_only'
                  AND NOT t.tgisinternal AND (t.tgtype & 16) = 16 AND (t.tgtype & 8) = 8) THEN
    RAISE EXCEPTION 'BCP_PROOF: the event ledger is not append-only for both UPDATE and DELETE.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'bcp_notice_acknowledgements_append_only'
                  AND NOT t.tgisinternal AND (t.tgtype & 16) = 16 AND (t.tgtype & 8) = 8) THEN
    RAISE EXCEPTION 'BCP_PROOF: the notice acknowledgements are not append-only for both UPDATE and DELETE.';
  END IF;
  FOREACH _t IN ARRAY ARRAY['bcp_pilot_grants_governed', 'bcp_assignments_guard',
                            'bcp_responses_guard', 'bcp_answers_guard'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = _t AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'BCP_PROOF: guard trigger % is missing.', _t;
    END IF;
  END LOOP;

  -- 9.9  The idempotency receipt is unique, so a replay cannot become a
  --      second write.
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
                  WHERE c.relname = 'bcp_events' AND i.indisunique
                    AND (SELECT attname FROM pg_attribute
                          WHERE attrelid = i.indrelid AND attnum = i.indkey[0]) = 'operation_id') THEN
    RAISE EXCEPTION 'BCP_PROOF: bcp_events.operation_id is not unique.';
  END IF;

  -- 9.10 The ONE explicit read-contract change, exactly as documented, and
  --      no more. The full governed document must still gate on the
  --      GOVERNANCE predicate.
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_can_read_version';
  IF position('beskt_governance_can_read_version' in _src) = 0
     OR position('bcp_party_can_read_method_version' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: beskt_can_read_version is not the documented governance-or-party decision.';
  END IF;

  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_governance_can_read_version';
  IF position('scp_interview_can_read' in _src) = 0 OR position('internal_qa' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: the governance read predicate is not PR #218''s own decision.';
  END IF;
  IF position('bcp_' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: the governance read predicate was contaminated with the preparation branch.';
  END IF;

  FOREACH _fn IN ARRAY ARRAY['beskt_published_method', 'beskt_readable_published_versions'] LOOP
    SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    IF position('beskt_governance_can_read_version' in _src) = 0 THEN
      RAISE EXCEPTION 'BCP_PROOF: % does not gate on the governance read predicate, so a preparation party could read the full governed document.', _fn;
    END IF;
    IF _src ~ 'beskt_can_read_version' THEN
      RAISE EXCEPTION 'BCP_PROOF: % still gates on the widened predicate.', _fn;
    END IF;
  END LOOP;

  -- 9.11 release_scope was NOT widened: synthetic_internal_only remains the
  --      only representable value on a method version.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.beskt_method_versions'::regclass
       AND pg_get_constraintdef(oid) LIKE '%release_scope = ''synthetic_internal_only''%') THEN
    RAISE EXCEPTION 'BCP_PROOF: the synthetic_internal_only release scope was altered.';
  END IF;

  -- 9.12 PR #218's routing authority is reused, not forked.
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_resolve_item_sequence';
  IF position('BESKT_ROUTE_NOT_ORDERED' in _src) = 0 OR position('r.evaluation_order' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: the PR #218 resolver was altered.';
  END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'beskt_resolve_item_sequence';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'BCP_PROOF: the resolver must exist exactly once; PR 3 must not fork it.';
  END IF;
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_visible_items';
  IF position('beskt_resolve_item_sequence' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: candidate visibility does not come from the PR #218 resolver.';
  END IF;

  -- 9.13 A neutral response state contributes nothing to routing.
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_routing_answers';
  IF position('a.response_state = ''answered''' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_PROOF: omitted and discuss-orally answers are not excluded from routing.';
  END IF;

  -- 9.14 No candidate-preparation runtime data was seeded, and no BESKT
  --      method content exists in this migration either. Production stays
  --      honest: with nothing published and nothing granted, nothing is
  --      assignable.
  SELECT count(*) INTO _n FROM public.bcp_assignments;
  IF _n <> 0 THEN RAISE EXCEPTION 'BCP_PROOF: % assignment(s) were seeded.', _n; END IF;
  SELECT count(*) INTO _n FROM public.bcp_pilot_grants;
  IF _n <> 0 THEN RAISE EXCEPTION 'BCP_PROOF: % pilot grant(s) were seeded; a grant is an owner decision.', _n; END IF;
  SELECT count(*) INTO _n FROM public.bcp_responses;
  IF _n <> 0 THEN RAISE EXCEPTION 'BCP_PROOF: % response(s) were seeded.', _n; END IF;

  RAISE NOTICE 'BESKT_CANDIDATE_PREPARATION_PROOF ok';
END
$proof$;
