-- ===========================================================================
-- BESKT PR 5A -- the governed conduct of the BESKT interview
-- ===========================================================================
--
-- PR 3 let a candidate prepare. PR 4 bound that submitted preparation to the
-- employer's EXISTING interview case and derived the neutral topics. This
-- migration is what happens IN the interview: an authorised interviewer works
-- through those topics and records what was said, what it might mean, what
-- else it might mean, what speaks in the candidate's favour, and what still
-- needs checking -- as SEPARATE, structurally distinct facts.
--
-- ── WHAT THIS DELIBERATELY REUSES ───────────────────────────────────────
--
-- Nothing here is a second case, candidate, application, evidence or report
-- system. It builds on what exists:
--
--   scp_interview_cases        the case. Not created here, not advanced here.
--   bcp_case_links             PR 4's binding, and the snapshot it carries.
--   bcp_case_topics            PR 4's deterministic neutral topics.
--   scp_iv_can_read_case       the existing case read authority.
--   scp_iv_can_write_case      the existing case write authority, which also
--                              refuses a cancelled case and a non-active
--                              retention state.
--   bcp_events                 PR 3's append-only ledger, through
--                              bcp_record_event. The BESKT chain stays on one
--                              ledger rather than acquiring a second.
--   bcp_operation_begin        PR 3's idempotency: operation id + request hash,
--                              answered before any write.
--
-- ── WHY A SEPARATE POSITION RATHER THAN scp_interview_assessments ──────
--
-- The Interview Intelligence spine already has an independent-assessor model
-- with locking, supersede-instead-of-edit and hidden-until-revealed
-- visibility, and this migration copies that SHAPE deliberately.
--
-- It cannot reuse the TABLE. scp_interview_assessments carries `level` -- a
-- rating against a governed anchor. BESKT produces no rating: no total, no
-- risk score, no ranking, no pass/fail, no recommendation. Storing a BESKT
-- position in a table whose contract includes a level would either force a
-- meaningless value into it or leave a nullable scoring column sitting in the
-- middle of the method that forbids scoring. Either one is the place a score
-- eventually appears. So BESKT positions are their own thing, and there is
-- nowhere in them to put a number.
--
-- ── THE INFORMATION MODEL IS COLUMNS, NOT jsonb ─────────────────────────
--
-- Every element the method distinguishes -- the observable fact, the
-- candidate's own explanation, the interviewer's interpretation, the
-- alternative explanation, the protective factor, the verification need and
-- its state and source -- is its own column with its own meaning. A jsonb blob
-- would let an interpretation be filed as a fact, which is exactly the
-- conflation the method exists to prevent.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Preflight. Refuse early and by name rather than failing obscurely.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  _missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO _missing FROM unnest(ARRAY[
    'scp_interview_cases', 'bcp_case_links', 'bcp_case_topics',
    'bcp_events', 'bcp_assignments', 'bcp_responses', 'beskt_items'
  ]) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PREFLIGHT: required table(s) missing: %. '
      'PR 5A builds on PR 3 and PR 4 and cannot stand alone.', _missing;
  END IF;

  SELECT string_agg(f, ', ') INTO _missing FROM unnest(ARRAY[
    'scp_iv_can_read_case', 'scp_iv_can_write_case', 'scp_iv_case_employer',
    'bcp_record_event', 'bcp_operation_begin', 'beskt_request_hash',
    'has_employer_role'
  ]) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = f);
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PREFLIGHT: required function(s) missing: %.', _missing;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 1 · The event vocabulary learns the conduct operations.
--
-- Rebuilt in full rather than patched, and every existing member is restated,
-- because a rebuild that quietly dropped one would break PR 3 and PR 4 writes
-- with no warning at all.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
ALTER TABLE public.bcp_events
  ADD CONSTRAINT bcp_events_event_check
  CHECK (event IN (
    -- PR 3
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked',
    -- PR 4
    'case_linked', 'case_unlinked',
    -- PR 5A
    'conduct_session_started', 'conduct_entry_saved', 'conduct_entry_corrected',
    'conduct_verification_requested', 'conduct_verification_updated',
    'conduct_position_locked', 'conduct_position_reopened',
    'conduct_panel_opened', 'conduct_panel_revealed',
    'conduct_panel_resolution_recorded'));

-- ---------------------------------------------------------------------------
-- 2 · The conduct session: one BESKT working surface per live case link.
--
-- It carries the bound snapshot AGAIN, copied from the link at the moment the
-- session opened. That is not redundancy: the requirement is that the exact
-- snapshot's hash and version stay visible and bound THROUGHOUT the interview,
-- and a session that only pointed at the link would show whatever the link
-- said when it was last read.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  link_id uuid NOT NULL REFERENCES public.bcp_case_links(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE RESTRICT,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,

  -- The bound snapshot, carried so it is answerable from the session row.
  bound_response_id uuid NOT NULL REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,
  bound_response_version integer NOT NULL CHECK (bound_response_version >= 1),
  bound_method_version_id uuid NOT NULL
    REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  bound_content_hash text NOT NULL CHECK (bound_content_hash ~ '^[0-9a-f]{64}$'),
  bound_answers_content_hash text NOT NULL CHECK (bound_answers_content_hash ~ '^[0-9a-f]{64}$'),

  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'concluded')),

  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  open_operation_id uuid NOT NULL UNIQUE,

  concluded_at timestamptz,
  concluded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Compare-and-swap for every governed mutation that names this session.
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_conduct_sessions_conclude_shape CHECK (
    (state = 'open' AND concluded_at IS NULL AND concluded_by IS NULL)
    OR (state = 'concluded' AND concluded_at IS NOT NULL AND concluded_by IS NOT NULL)),

  -- One session per link. A second working surface over the same bound
  -- snapshot would be two versions of one interview.
  UNIQUE (link_id)
);

CREATE INDEX bcp_conduct_sessions_case_idx ON public.bcp_conduct_sessions (case_id);
CREATE INDEX bcp_conduct_sessions_employer_idx ON public.bcp_conduct_sessions (employer_id);
CREATE INDEX bcp_conduct_sessions_assignment_idx ON public.bcp_conduct_sessions (assignment_id);
CREATE INDEX bcp_conduct_sessions_response_idx ON public.bcp_conduct_sessions (bound_response_id);
CREATE INDEX bcp_conduct_sessions_opened_by_idx ON public.bcp_conduct_sessions (opened_by);

COMMENT ON TABLE public.bcp_conduct_sessions IS
  'The BESKT conduct surface for one linked interview case. Carries the exact '
  'bound snapshot so what is being discussed, against which submitted answers '
  'and which governed content, is answerable from the row. Creates no case and '
  'advances no case.';

-- ---------------------------------------------------------------------------
-- 3 · One position per person. Independent, lockable, never averaged.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,

  -- The person, and what they are here as. A named responsible owner records a
  -- position of their own LATER, alongside the assessors' -- never over them.
  assessor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  position_role text NOT NULL DEFAULT 'assessor'
    CHECK (position_role IN ('assessor', 'responsible_owner')),

  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'locked')),
  locked_at timestamptz,
  lock_operation_id uuid UNIQUE,

  -- A reopen is deliberate, reasoned and counted; it never erases the lock
  -- that came before it, because the ledger keeps every one.
  reopened_at timestamptz,
  reopened_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reopen_reason text,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),

  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_conduct_positions_lock_shape CHECK (
    (state = 'open' AND locked_at IS NULL AND lock_operation_id IS NULL)
    OR (state = 'locked' AND locked_at IS NOT NULL AND lock_operation_id IS NOT NULL)),
  CONSTRAINT bcp_conduct_positions_reopen_shape CHECK (
    (reopen_count = 0 AND reopened_at IS NULL AND reopened_by IS NULL AND reopen_reason IS NULL)
    OR (reopen_count > 0 AND reopened_at IS NOT NULL AND reopened_by IS NOT NULL
        AND length(btrim(coalesce(reopen_reason, ''))) >= 3)),

  -- One position per person per session.
  UNIQUE (session_id, assessor_id)
);

CREATE INDEX bcp_conduct_positions_session_idx ON public.bcp_conduct_positions (session_id);
CREATE INDEX bcp_conduct_positions_assessor_idx ON public.bcp_conduct_positions (assessor_id);

COMMENT ON TABLE public.bcp_conduct_positions IS
  'One named person''s own position in a BESKT conduct session. Carries no '
  'level, no score and no verdict -- there is nowhere in it to put one. '
  'Independent by construction: a position is invisible to the other '
  'assessors until the reader''s own position is locked.';

-- ---------------------------------------------------------------------------
-- 4 · The entry: the method's information model, one column per element.
--
-- THE WHOLE POINT OF THIS TABLE is that a fact, an explanation, an
-- interpretation, a counter-explanation and a protective factor are DIFFERENT
-- KINDS OF THING and are stored as different columns. Put them in one free
-- text field -- or one jsonb -- and an interpretation can be filed as a fact,
-- which is the conflation the method exists to prevent.
--
-- A correction never overwrites. It inserts a NEW row that supersedes the old
-- one and says why, so the history of what was believed, and when it changed,
-- survives in full.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.bcp_conduct_positions(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,

  -- ── THE INTERVIEW TOPIC AND ITS GOVERNED QUESTION BASIS ──────────────
  --
  -- Either one of PR 4's derived neutral topics, or a governed item of the
  -- pinned method version. Never free-typed: an interview subject that did not
  -- come from governed content has no basis to be asked about.
  topic_id uuid REFERENCES public.bcp_case_topics(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  item_key text NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9_]*$'),
  topic_basis text NOT NULL
    CHECK (topic_basis IN ('derived_neutral_topic', 'governed_method_item')),

  -- ── THE FIVE DISTINCT KINDS OF STATEMENT ─────────────────────────────
  observable_fact text,          -- what was observably so
  candidate_explanation text,    -- the candidate's own account, in their terms
  interviewer_interpretation text, -- what the interviewer makes of it, marked as theirs
  alternative_explanation text,  -- another reading, or what contradicts the first
  protective_factor text,        -- what speaks in the candidate's favour

  -- ── VERIFICATION ─────────────────────────────────────────────────────
  verification_need text,
  verification_state text NOT NULL DEFAULT 'not_required'
    CHECK (verification_state IN (
      'not_required', 'requested', 'in_progress',
      'verified', 'not_verified', 'inconclusive')),
  verification_source text,

  -- ── HANDLING ─────────────────────────────────────────────────────────
  sensitivity_class text NOT NULL DEFAULT 'ordinary'
    CHECK (sensitivity_class IN ('ordinary', 'sensitive', 'special_category')),

  -- ── PROVENANCE: who said this, and when ──────────────────────────────
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  save_operation_id uuid NOT NULL UNIQUE,

  -- ── CORRECTION: append, never overwrite ──────────────────────────────
  entry_version integer NOT NULL DEFAULT 1 CHECK (entry_version >= 1),
  supersedes_entry_id uuid REFERENCES public.bcp_conduct_entries(id) ON DELETE RESTRICT,
  -- DEFERRABLE on purpose. A correction must vacate the live slot BEFORE the
  -- replacement enters it, or the one-live-entry index refuses both. That
  -- means naming the successor a moment before it exists, which only a
  -- deferred check permits. The constraint still holds at commit.
  superseded_by_entry_id uuid REFERENCES public.bcp_conduct_entries(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  correction_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- A correction names what it replaces AND why; a first entry does neither.
  CONSTRAINT bcp_conduct_entries_correction_shape CHECK (
    (entry_version = 1 AND supersedes_entry_id IS NULL AND correction_reason IS NULL)
    OR (entry_version > 1 AND supersedes_entry_id IS NOT NULL
        AND length(btrim(coalesce(correction_reason, ''))) >= 3)),

  -- A verification source is named once something was actually checked.
  CONSTRAINT bcp_conduct_entries_verification_shape CHECK (
    verification_state IN ('not_required', 'requested', 'in_progress')
    OR length(btrim(coalesce(verification_source, ''))) > 0),

  -- An entry that records nothing at all is not a record.
  CONSTRAINT bcp_conduct_entries_not_empty CHECK (
    length(btrim(coalesce(observable_fact, ''))) > 0
    OR length(btrim(coalesce(candidate_explanation, ''))) > 0
    OR length(btrim(coalesce(interviewer_interpretation, ''))) > 0
    OR length(btrim(coalesce(alternative_explanation, ''))) > 0
    OR length(btrim(coalesce(protective_factor, ''))) > 0
    OR length(btrim(coalesce(verification_need, ''))) > 0),

  -- One LIVE entry per position per item. Superseded rows keep their history
  -- and step out of the slot, so the invariant is an index rather than a hope.
  live_slot uuid GENERATED ALWAYS AS
    (CASE WHEN superseded_by_entry_id IS NULL THEN position_id END) STORED,
  live_item_slot uuid GENERATED ALWAYS AS
    (CASE WHEN superseded_by_entry_id IS NULL THEN item_id END) STORED
);

CREATE UNIQUE INDEX bcp_conduct_entries_one_live_per_position_item_idx
  ON public.bcp_conduct_entries (live_slot, live_item_slot)
  WHERE live_slot IS NOT NULL;

CREATE INDEX bcp_conduct_entries_position_idx ON public.bcp_conduct_entries (position_id);
CREATE INDEX bcp_conduct_entries_session_idx ON public.bcp_conduct_entries (session_id);
CREATE INDEX bcp_conduct_entries_topic_idx ON public.bcp_conduct_entries (topic_id);
CREATE INDEX bcp_conduct_entries_item_idx ON public.bcp_conduct_entries (item_id);
CREATE INDEX bcp_conduct_entries_supersedes_idx ON public.bcp_conduct_entries (supersedes_entry_id);
CREATE INDEX bcp_conduct_entries_recorded_by_idx ON public.bcp_conduct_entries (recorded_by);

COMMENT ON TABLE public.bcp_conduct_entries IS
  'What one interviewer recorded about one governed topic: the observable '
  'fact, the candidate''s own explanation, the interviewer''s interpretation '
  'marked as theirs, the alternative explanation, the protective factor and '
  'the verification need -- each its own column, because they are different '
  'kinds of thing and conflating them is the failure this model prevents. '
  'A correction supersedes and states its reason; nothing is overwritten.';

-- ---------------------------------------------------------------------------
-- 5 · Verification history. Append-only, and separate from the entry.
--
-- On the entry, verification_state is the CURRENT answer. Here is how it got
-- there: who asked, who answered, from what source, and when. The entry stays
-- readable at a glance; the history stays complete.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.bcp_conduct_entries(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,

  seq integer NOT NULL CHECK (seq >= 1),
  previous_state text CHECK (previous_state IN (
    'not_required', 'requested', 'in_progress', 'verified', 'not_verified', 'inconclusive')),
  new_state text NOT NULL CHECK (new_state IN (
    'not_required', 'requested', 'in_progress', 'verified', 'not_verified', 'inconclusive')),
  source text,
  note text,

  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE,

  UNIQUE (entry_id, seq)
);

CREATE INDEX bcp_conduct_verifications_entry_idx ON public.bcp_conduct_verifications (entry_id);
CREATE INDEX bcp_conduct_verifications_session_idx ON public.bcp_conduct_verifications (session_id);
CREATE INDEX bcp_conduct_verifications_recorded_by_idx ON public.bcp_conduct_verifications (recorded_by);

COMMENT ON TABLE public.bcp_conduct_verifications IS
  'The history behind an entry''s verification_state: who asked, who answered, '
  'from what source, when. Append-only.';

-- ---------------------------------------------------------------------------
-- 6 · The panel. Disagreement is recorded, never resolved away.
--
-- No total, no average, no majority. Where the assessors agree, that is
-- recorded as agreement; where they do not, that is recorded as disagreement
-- WITH both readings, and it stays in the record.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,

  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'revealed', 'concluded')),

  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  open_operation_id uuid NOT NULL UNIQUE,

  revealed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revealed_at timestamptz,
  reveal_operation_id uuid UNIQUE,

  concluded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  concluded_at timestamptz,

  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bcp_conduct_panels_reveal_shape CHECK (
    (state = 'open' AND revealed_at IS NULL AND revealed_by IS NULL AND reveal_operation_id IS NULL)
    OR (state IN ('revealed', 'concluded') AND revealed_at IS NOT NULL
        AND revealed_by IS NOT NULL AND reveal_operation_id IS NOT NULL)),
  CONSTRAINT bcp_conduct_panels_conclude_shape CHECK (
    (state <> 'concluded' AND concluded_at IS NULL AND concluded_by IS NULL)
    OR (state = 'concluded' AND concluded_at IS NOT NULL AND concluded_by IS NOT NULL)),

  UNIQUE (session_id)
);

CREATE INDEX bcp_conduct_panels_session_idx ON public.bcp_conduct_panels (session_id);

CREATE TABLE public.bcp_conduct_panel_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id uuid NOT NULL REFERENCES public.bcp_conduct_panels(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,

  item_id uuid NOT NULL REFERENCES public.beskt_items(id) ON DELETE RESTRICT,
  item_key text NOT NULL CHECK (item_key ~ '^[a-z0-9][a-z0-9_]*$'),

  -- EXACTLY two outcomes, and neither is a score. "Disagreed" is a first-class
  -- recordable result, not a failure state to be averaged away.
  resolution_kind text NOT NULL CHECK (resolution_kind IN ('agreed', 'disagreed')),

  -- What the parties agree on, and -- where they do not -- what each reading
  -- was. A disagreement that did not carry both readings would be a rumour
  -- about a disagreement.
  agreed_statement text,
  divergent_statement text,
  rationale text NOT NULL CHECK (length(btrim(rationale)) >= 3),

  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE,

  CONSTRAINT bcp_conduct_panel_resolutions_shape CHECK (
    (resolution_kind = 'agreed'
     AND length(btrim(coalesce(agreed_statement, ''))) > 0
     AND divergent_statement IS NULL)
    OR (resolution_kind = 'disagreed'
        AND length(btrim(coalesce(divergent_statement, ''))) > 0)),

  UNIQUE (panel_id, item_id)
);

CREATE INDEX bcp_conduct_panel_resolutions_panel_idx
  ON public.bcp_conduct_panel_resolutions (panel_id);
CREATE INDEX bcp_conduct_panel_resolutions_session_idx
  ON public.bcp_conduct_panel_resolutions (session_id);
CREATE INDEX bcp_conduct_panel_resolutions_item_idx
  ON public.bcp_conduct_panel_resolutions (item_id);
CREATE INDEX bcp_conduct_panel_resolutions_recorded_by_idx
  ON public.bcp_conduct_panel_resolutions (recorded_by);

COMMENT ON TABLE public.bcp_conduct_panel_resolutions IS
  'What the panel agreed and what it did not, per governed item, with the '
  'reasoning. Disagreement is a recorded outcome carrying both readings -- it '
  'is never averaged, hidden or counted away, and no total is produced.';

-- ---------------------------------------------------------------------------
-- 7 · Who may see whose position.
--
-- The rule the method depends on: you may not read another assessor's position
-- until YOUR OWN is locked. Not "until they lock theirs" -- until yours is,
-- because the harm being prevented is anchoring your own view on theirs.
--
-- Kept as a function so the policy, the read models and the triggers all ask
-- the same question in the same words.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_may_see_others(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     -- my own position is locked ...
     AND EXISTS (SELECT 1 FROM public.bcp_conduct_positions me
                  WHERE me.session_id = _session_id
                    AND me.assessor_id = auth.uid()
                    AND me.state = 'locked')
     -- ... and either the panel has revealed, or nobody is still open.
     AND (
       EXISTS (SELECT 1 FROM public.bcp_conduct_panels p
                WHERE p.session_id = _session_id AND p.state IN ('revealed', 'concluded'))
       OR NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions o
                       WHERE o.session_id = _session_id AND o.state <> 'locked')
     );
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_may_see_others(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_may_see_others(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_conduct_may_see_others(uuid) IS
  'True when the caller has locked their own position AND either the panel has '
  'revealed or every position is locked. Until then an assessor sees only '
  'their own, so no one anchors on anyone else.';

-- The employer side of the question, reusing the EXISTING case authority
-- rather than inventing a second one.
CREATE OR REPLACE FUNCTION public.bcp_conduct_can_read_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.bcp_conduct_sessions s
                  WHERE s.id = _session_id
                    AND public.scp_iv_can_read_case(s.case_id));
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_can_read_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_can_read_session(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8 · Invariants that hold against a direct table write.
--
-- Repeated here as row triggers, not because the RPCs are careless, but
-- because a trigger holds against the table owner and against BYPASSRLS and
-- the RPC does not. Everything below is also enforced in the governed path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NO_DELETE: a recorded position is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assessor_id <> OLD.assessor_id THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_POSITION_REATTRIBUTED: a position keeps the person who made it.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.session_id <> OLD.session_id OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_POSITION_IMMUTABLE: a position cannot be moved.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Locked means locked. The ONLY way out is a reopen, which raises the
    -- count and states a reason; both are checked here, not merely in the RPC.
    IF OLD.state = 'locked' AND NEW.state = 'open'
       AND (NEW.reopen_count <> OLD.reopen_count + 1
            OR NEW.reopened_at IS NULL
            OR NEW.reopened_by IS NULL
            OR length(btrim(coalesce(NEW.reopen_reason, ''))) < 3) THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_REOPEN_UNACCOUNTED: reopening a locked position records who, when and why.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.state = 'locked' AND NEW.state = 'locked'
       AND NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_POSITION_RELOCKED: a locked position cannot be silently re-locked.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REVISION_SKIPPED: every change advances the revision by one.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.bcp_conduct_sessions s WHERE s.id = NEW.session_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function is reached BY THE TRIGGER, never by a caller. Postgres
-- grants EXECUTE to PUBLIC by default, and leaving that would publish an
-- invariant-checker through PostgREST to anyone signed in.
REVOKE ALL ON FUNCTION public.bcp_guard_conduct_position()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_conduct_positions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_conduct_positions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_position();

CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NO_DELETE: a recorded entry is superseded, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The ONLY permitted update is stepping out of the live slot when a
    -- correction supersedes this row. Everything the entry says is frozen.
    IF OLD.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_FROZEN: this entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.position_id <> OLD.position_id
       OR NEW.session_id <> OLD.session_id
       OR NEW.item_id <> OLD.item_id
       OR NEW.item_key <> OLD.item_key
       OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
       OR NEW.topic_basis <> OLD.topic_basis
       OR NEW.observable_fact IS DISTINCT FROM OLD.observable_fact
       OR NEW.candidate_explanation IS DISTINCT FROM OLD.candidate_explanation
       OR NEW.interviewer_interpretation IS DISTINCT FROM OLD.interviewer_interpretation
       OR NEW.alternative_explanation IS DISTINCT FROM OLD.alternative_explanation
       OR NEW.protective_factor IS DISTINCT FROM OLD.protective_factor
       OR NEW.verification_need IS DISTINCT FROM OLD.verification_need
       OR NEW.sensitivity_class <> OLD.sensitivity_class
       OR NEW.recorded_by <> OLD.recorded_by
       OR NEW.recorded_at <> OLD.recorded_at
       OR NEW.entry_version <> OLD.entry_version
       OR NEW.supersedes_entry_id IS DISTINCT FROM OLD.supersedes_entry_id
       OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_ENTRY_EDITED_IN_PLACE: correct an entry by superseding it, so what was '
        'first recorded survives. An entry that could be edited would leave no trace that it changed.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- EXACTLY TWO SHAPES OF UPDATE ARE PERMITTED, and nothing else reaches here.
    --
    -- One: a supersede, which vacates the live slot and changes nothing the
    -- entry says.
    --
    -- Two: the verification state and its source moving forward. That is the
    -- only thing on an entry that is genuinely current rather than historical,
    -- and it is permitted ONLY when the append-only history already records
    -- the move. A direct write with no history row behind it is refused, so
    -- the state on the entry can never disagree with the history that explains
    -- it.
    IF NEW.verification_state IS DISTINCT FROM OLD.verification_state
       OR NEW.verification_source IS DISTINCT FROM OLD.verification_source THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.bcp_conduct_verifications v
         WHERE v.entry_id = NEW.id
           AND v.new_state = NEW.verification_state
           AND v.seq = (SELECT max(seq) FROM public.bcp_conduct_verifications
                         WHERE entry_id = NEW.id)) THEN
        RAISE EXCEPTION
          'BCP_CONDUCT_VERIFICATION_UNRECORDED: a verification state moves only with a history row '
          'behind it, so what the entry says and what the history explains can never disagree.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.superseded_by_entry_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOOP_UPDATE: the only permitted update is a supersede.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = NEW.position_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.session_id <> NEW.session_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_MISMATCH: the position is not in this session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOTHING IS RECORDED INTO A LOCKED POSITION. Not by the RPC, not by the
  -- owner, not by a direct write.
  IF _p.state = 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The entry belongs to the person whose position it is.
  IF NEW.recorded_by <> _p.assessor_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_OWN: an entry is recorded by the assessor whose position it is.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = NEW.session_id;
  IF _s.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_CONCLUDED: this conduct session is concluded.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── THE GOVERNED BASIS IS NOT THE CALLER'S TO INVENT ────────────────
  --
  -- The item must belong to the method version the session is bound to, and
  -- the item_key must be that item's own. An interview subject with no
  -- governed question behind it has no basis to be asked about.
  IF NOT EXISTS (SELECT 1 FROM public.beskt_items i
                  WHERE i.id = NEW.item_id
                    AND i.method_version_id = _s.bound_method_version_id
                    AND i.item_key = NEW.item_key) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      NEW.item_key USING ERRCODE = 'check_violation';
  END IF;

  -- A derived topic must be one of THIS link's topics, and must name the same
  -- item. A topic borrowed from another case would carry another candidate.
  IF NEW.topic_basis = 'derived_neutral_topic' THEN
    IF NEW.topic_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_TOPIC_REQUIRED: a derived-topic entry names the topic it came from.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bcp_case_topics t
                    WHERE t.id = NEW.topic_id
                      AND t.link_id = _s.link_id
                      AND t.item_id = NEW.item_id) THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_TOPIC_NOT_IN_LINK: the topic is not one of this link''s derived topics for that item.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.topic_id IS NOT NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_TOPIC_UNEXPECTED: an entry on a governed method item does not also claim a derived topic.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A correction continues its own chain, on the same position and item.
  IF NEW.supersedes_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries WHERE id = NEW.supersedes_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> NEW.position_id OR _prev.item_id <> NEW.item_id THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_CROSSES: a correction stays on the same position and the same item.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The predecessor must not already be spoken for BY SOMEONE ELSE. It may
    -- well already name THIS row: the governed path vacates the live slot
    -- before the successor is inserted, which is the only way both can respect
    -- the one-live-entry index.
    IF _prev.superseded_by_entry_id IS NOT NULL
       AND _prev.superseded_by_entry_id <> NEW.id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.entry_version <> _prev.entry_version + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_VERSION_SKIPPED: a correction is exactly one version on.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_guard_conduct_entry()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_conduct_entries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_conduct_entries
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_entry();

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'BCP_CONDUCT_APPEND_ONLY: %.% is append-only; it is never updated or deleted.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_guard_conduct_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_conduct_verifications_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_verifications
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_append_only();

CREATE TRIGGER bcp_conduct_panel_resolutions_append_only
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_panel_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_append_only();

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_panel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_NO_DELETE: a panel is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.session_id <> OLD.session_id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PANEL_IMMUTABLE: a panel cannot be moved.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Forward only. A revealed panel cannot go back to being unrevealed --
    -- once people have seen each other's positions, un-seeing is a fiction.
    IF OLD.state = 'revealed' AND NEW.state = 'open' THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PANEL_UNREVEALED: a revealed panel cannot be closed again.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.state = 'concluded' AND NEW.state <> 'concluded' THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PANEL_REOPENED: a concluded panel stays concluded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.revealed_at IS NOT NULL AND NEW.revealed_at IS DISTINCT FROM OLD.revealed_at THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PANEL_REVEAL_REWRITTEN: when the panel revealed is a fact, not a field.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REVISION_SKIPPED: every change advances the revision by one.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- NOTHING IS REVEALED WHILE ANYONE IS STILL OPEN. This is the invariant
    -- the independence of the whole exercise rests on, so it is checked where
    -- the table owner cannot step around it.
    IF NEW.state = 'revealed' AND OLD.state = 'open' THEN
      IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
                  WHERE p.session_id = NEW.session_id AND p.state <> 'locked') THEN
        RAISE EXCEPTION
          'BCP_CONDUCT_REVEAL_TOO_EARLY: every position must be locked before any is revealed.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (SELECT count(*) FROM public.bcp_conduct_positions p
           WHERE p.session_id = NEW.session_id) < 2 THEN
        RAISE EXCEPTION
          'BCP_CONDUCT_PANEL_NEEDS_TWO: a panel compares positions, so it needs at least two.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_guard_conduct_panel()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_conduct_panels_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_conduct_panels
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_panel();

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.bcp_case_links%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NO_DELETE: a conduct session is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
       OR NEW.link_id <> OLD.link_id
       OR NEW.case_id <> OLD.case_id
       OR NEW.employer_id <> OLD.employer_id
       OR NEW.assignment_id <> OLD.assignment_id
       OR NEW.bound_response_id <> OLD.bound_response_id
       OR NEW.bound_response_version <> OLD.bound_response_version
       OR NEW.bound_method_version_id <> OLD.bound_method_version_id
       OR NEW.bound_content_hash <> OLD.bound_content_hash
       OR NEW.bound_answers_content_hash <> OLD.bound_answers_content_hash THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_SESSION_REBOUND: the bound snapshot is fixed when the session opens. '
        'A session that could be re-pointed would make every entry under it ambiguous.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.state = 'concluded' AND NEW.state = 'open' THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SESSION_RESURRECTED: a concluded session stays concluded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REVISION_SKIPPED: every change advances the revision by one.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT: the session's binding is the LINK's own, not the caller's ---
  SELECT * INTO _l FROM public.bcp_case_links WHERE id = NEW.link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_LINK_NOT_FOUND: no such case link.' USING ERRCODE = 'check_violation';
  END IF;
  IF _l.unlinked_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_LINK_NOT_LIVE: the preparation is no longer linked to this case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_id <> _l.case_id
     OR NEW.employer_id <> _l.employer_id
     OR NEW.assignment_id <> _l.assignment_id
     OR NEW.bound_response_id <> _l.bound_response_id
     OR NEW.bound_response_version <> _l.bound_response_version
     OR NEW.bound_method_version_id <> _l.bound_method_version_id
     OR NEW.bound_content_hash <> _l.bound_content_hash
     OR NEW.bound_answers_content_hash <> _l.bound_answers_content_hash THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_BINDING_MISMATCH: the session''s bound snapshot is not the link''s own.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The case must still be one that takes work: the existing case authority
  -- already refuses a cancelled case and a non-active retention state.
  IF EXISTS (SELECT 1 FROM public.scp_interview_cases c
              WHERE c.id = NEW.case_id
                AND (c.status = 'cancelled' OR c.retention_state <> 'active')) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_CASE_NOT_ACTIVE: a cancelled or retained case takes no new interview work.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_guard_conduct_session()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER bcp_conduct_sessions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bcp_conduct_sessions
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_session();

-- ---------------------------------------------------------------------------
-- 9 · Who may read. Fails closed, and the client writes nothing directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bcp_conduct_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_sessions           FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_positions          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_entries            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_verifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_verifications      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_panels             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_panels             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_panel_resolutions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_panel_resolutions  FORCE  ROW LEVEL SECURITY;

-- The session and the panel are the shared frame: any member of the case's
-- employer who may read the case may see that they exist.
CREATE POLICY bcp_conduct_sessions_member_read ON public.bcp_conduct_sessions
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id));

CREATE POLICY bcp_conduct_panels_member_read ON public.bcp_conduct_panels
  FOR SELECT TO authenticated
  USING (public.bcp_conduct_can_read_session(session_id));

-- A POSITION, AND EVERYTHING UNDER IT, IS PRIVATE UNTIL THE READER HAS LOCKED
-- THEIR OWN. This is the independence rule, expressed where the database can
-- enforce it rather than where a screen can forget it.
CREATE POLICY bcp_conduct_positions_own_or_revealed ON public.bcp_conduct_positions
  FOR SELECT TO authenticated
  USING (
    public.bcp_conduct_can_read_session(session_id)
    AND (assessor_id = auth.uid() OR public.bcp_conduct_may_see_others(session_id))
  );

CREATE POLICY bcp_conduct_entries_own_or_revealed ON public.bcp_conduct_entries
  FOR SELECT TO authenticated
  USING (
    public.bcp_conduct_can_read_session(session_id)
    AND (
      EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
               WHERE p.id = position_id AND p.assessor_id = auth.uid())
      OR public.bcp_conduct_may_see_others(session_id)
    )
  );

CREATE POLICY bcp_conduct_verifications_own_or_revealed ON public.bcp_conduct_verifications
  FOR SELECT TO authenticated
  USING (
    public.bcp_conduct_can_read_session(session_id)
    AND (
      EXISTS (SELECT 1 FROM public.bcp_conduct_entries e
               JOIN public.bcp_conduct_positions p ON p.id = e.position_id
              WHERE e.id = entry_id AND p.assessor_id = auth.uid())
      OR public.bcp_conduct_may_see_others(session_id)
    )
  );

-- A resolution exists only once the panel revealed, so it has no pre-reveal
-- visibility question: it is readable by any member who may read the session.
CREATE POLICY bcp_conduct_panel_resolutions_member_read ON public.bcp_conduct_panel_resolutions
  FOR SELECT TO authenticated
  USING (public.bcp_conduct_can_read_session(session_id));

-- ---------------------------------------------------------------------------
-- 10 · Privileges. Silence would be a grant, so everything is revoked first
--      and SELECT alone is handed back. Every write goes through a governed
--      RPC; no client role holds table DML on any of these.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.bcp_conduct_sessions          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_conduct_positions         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_conduct_entries           FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_conduct_verifications     FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_conduct_panels            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.bcp_conduct_panel_resolutions FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.bcp_conduct_sessions          TO authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_positions         TO authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_entries           TO authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_verifications     TO authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_panels            TO authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_panel_resolutions TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11 · The governed write surface.
--
-- Every one of these: authenticates, checks the EXISTING case write authority,
-- answers an idempotent replay before writing anything, takes a transaction
-- advisory lock on the session so two people pressing at once produce one
-- result, refuses a stale revision without a partial write, and records an
-- append-only event on PR 3's ledger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_start_session(
  _operation_id uuid,
  _link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _session_id uuid; _position_id uuid; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_start_session', 'link_id', _link_id);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_link_id::text, 0));

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF _l.unlinked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_LINK_NOT_LIVE: the preparation is no longer linked to this case.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority, not a second one. It already refuses a
  -- non-member, a cancelled case and a non-active retention state.
  IF NOT public.scp_iv_can_write_case(_l.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _l.assignment_id;

  INSERT INTO public.bcp_conduct_sessions
    (link_id, case_id, employer_id, assignment_id,
     bound_response_id, bound_response_version, bound_method_version_id,
     bound_content_hash, bound_answers_content_hash,
     opened_by, open_operation_id)
  VALUES
    (_l.id, _l.case_id, _l.employer_id, _l.assignment_id,
     _l.bound_response_id, _l.bound_response_version, _l.bound_method_version_id,
     _l.bound_content_hash, _l.bound_answers_content_hash,
     _caller, _operation_id)
  RETURNING id INTO _session_id;

  -- The person who opens it is an assessor in it.
  INSERT INTO public.bcp_conduct_positions (session_id, assessor_id, created_by)
  VALUES (_session_id, _caller, _caller)
  RETURNING id INTO _position_id;

  _result := jsonb_build_object(
    'session_id', _session_id,
    'position_id', _position_id,
    'link_id', _l.id,
    'case_id', _l.case_id,
    'bound_response_id', _l.bound_response_id,
    'bound_response_version', _l.bound_response_version,
    'bound_content_hash', _l.bound_content_hash,
    'bound_answers_content_hash', _l.bound_answers_content_hash,
    'produces_score', false,
    'interpretation', 'none');

  PERFORM public.bcp_record_event(
    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,
    'conduct_session_started', _a.lifecycle_state, _a.lifecycle_state, NULL,
    _l.bound_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id, 'case_id', _l.case_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_start_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_start_session(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Join an existing session as an independent assessor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_join_session(
  _operation_id uuid,
  _session_id uuid,
  _position_role text DEFAULT 'assessor')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _position_id uuid; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _position_role IS NULL OR _position_role NOT IN ('assessor', 'responsible_owner') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ROLE_UNKNOWN: "%" is not a position role.', _position_role
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_join_session',
    'session_id', _session_id, 'position_role', _position_role);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _s.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_CONCLUDED: this conduct session is concluded.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
              WHERE p.session_id = _session_id AND p.assessor_id = _caller) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_JOINED: you already hold a position in this session.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.bcp_conduct_positions (session_id, assessor_id, position_role, created_by)
  VALUES (_session_id, _caller, _position_role, _caller)
  RETURNING id INTO _position_id;

  _result := jsonb_build_object('session_id', _session_id, 'position_id', _position_id,
    'position_role', _position_role);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_session_started', NULL, NULL, NULL,
    _s.bound_content_hash, NULL, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id, 'joined', true, 'position_role', _position_role));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_join_session(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_join_session(uuid, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Save an entry, or correct one. A correction never overwrites: it inserts the
-- new version and steps the old one out of the live slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_save_entry(
  _operation_id uuid,
  _position_id uuid,
  _expected_revision integer,
  _entry jsonb,
  _corrects_entry_id uuid DEFAULT NULL,
  _correction_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _item_id uuid; _item_key text; _topic_id uuid; _basis text;
  _new_id uuid; _version integer := 1; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _entry IS NULL OR jsonb_typeof(_entry) <> 'object' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_STRUCTURED: an entry is a JSON object of named fields.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_save_entry',
    'position_id', _position_id, 'expected_revision', _expected_revision,
    'entry', _entry, 'corrects_entry_id', _corrects_entry_id,
    'correction_reason', _correction_reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;

  -- YOUR OWN POSITION ONLY. Recording into someone else's is exactly the
  -- contamination the independence rule exists to prevent.
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only record in your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  _item_key := _entry ->> 'item_key';
  _topic_id := (_entry ->> 'topic_id')::uuid;
  IF _item_key IS NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ITEM_REQUIRED: an entry names the governed item it is about.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id INTO _item_id FROM public.beskt_items i
   WHERE i.method_version_id = _s.bound_method_version_id AND i.item_key = _item_key;
  IF _item_id IS NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      _item_key USING ERRCODE = 'check_violation';
  END IF;
  _basis := CASE WHEN _topic_id IS NULL THEN 'governed_method_item' ELSE 'derived_neutral_topic' END;

  -- ---- a correction continues the chain -----------------------------------
  IF _corrects_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries
     WHERE id = _corrects_entry_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> _position_id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: that entry is not in your position.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _prev.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_correction_reason, ''))) < 3 THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_REASON_REQUIRED: say why the record changed, so the history can be read.'
        USING ERRCODE = 'check_violation';
    END IF;
    _version := _prev.entry_version + 1;
    _item_id := _prev.item_id;
    _item_key := _prev.item_key;
    _topic_id := _prev.topic_id;
    _basis := _prev.topic_basis;
  END IF;

  -- Vacate the live slot FIRST. The successor's id is generated here so the
  -- old row can name it before it exists; the deferred foreign key above is
  -- what makes that legal, and it is still checked at commit.
  _new_id := gen_random_uuid();
  IF _corrects_entry_id IS NOT NULL THEN
    UPDATE public.bcp_conduct_entries
       SET superseded_by_entry_id = _new_id
     WHERE id = _corrects_entry_id;
  END IF;

  INSERT INTO public.bcp_conduct_entries
    (id, position_id, session_id, topic_id, item_id, item_key, topic_basis,
     observable_fact, candidate_explanation, interviewer_interpretation,
     alternative_explanation, protective_factor,
     verification_need, verification_state, verification_source,
     sensitivity_class, recorded_by, save_operation_id,
     entry_version, supersedes_entry_id, correction_reason)
  VALUES
    (_new_id, _position_id, _p.session_id, _topic_id, _item_id, _item_key, _basis,
     nullif(btrim(coalesce(_entry ->> 'observable_fact', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'candidate_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'interviewer_interpretation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'alternative_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'protective_factor', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'verification_need', '')), ''),
     coalesce(_entry ->> 'verification_state', 'not_required'),
     nullif(btrim(coalesce(_entry ->> 'verification_source', '')), ''),
     coalesce(_entry ->> 'sensitivity_class', 'ordinary'),
     _caller, _operation_id,
     _version, _corrects_entry_id, nullif(btrim(coalesce(_correction_reason, '')), ''));

  UPDATE public.bcp_conduct_positions SET revision = revision + 1 WHERE id = _position_id;

  _result := jsonb_build_object(
    'entry_id', _new_id, 'position_id', _position_id, 'session_id', _p.session_id,
    'item_key', _item_key, 'entry_version', _version,
    'supersedes_entry_id', _corrects_entry_id,
    'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    CASE WHEN _corrects_entry_id IS NULL THEN 'conduct_entry_saved' ELSE 'conduct_entry_corrected' END,
    NULL, NULL, nullif(btrim(coalesce(_correction_reason, '')), ''),
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'entry_id', _new_id, 'item_key', _item_key));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_save_entry(uuid, uuid, integer, jsonb, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_save_entry(uuid, uuid, integer, jsonb, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification: request one, then update it. Both append to the history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_record_verification(
  _operation_id uuid,
  _entry_id uuid,
  _expected_revision integer,
  _new_state text,
  _source text DEFAULT NULL,
  _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _e public.bcp_conduct_entries%ROWTYPE;
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _seq integer; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _new_state IS NULL OR _new_state NOT IN (
       'not_required', 'requested', 'in_progress', 'verified', 'not_verified', 'inconclusive') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_VERIFICATION_STATE_UNKNOWN: "%" is not a verification state.', _new_state
      USING ERRCODE = 'check_violation';
  END IF;
  -- A settled verification names where it came from. "Verified" with no source
  -- is the kind of claim this whole method refuses to let anyone make.
  IF _new_state IN ('verified', 'not_verified', 'inconclusive')
     AND length(btrim(coalesce(_source, ''))) = 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_VERIFICATION_SOURCE_REQUIRED: a settled verification names its source.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_record_verification',
    'entry_id', _entry_id, 'expected_revision', _expected_revision,
    'new_state', _new_state, 'source', _source, 'note', _note);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _e FROM public.bcp_conduct_entries WHERE id = _entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_FOUND: no such entry.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_e.position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _e.position_id FOR UPDATE;
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only record in your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _e.superseded_by_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_FROZEN: that entry has been superseded; verify the current one.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(seq), 0) + 1 INTO _seq
    FROM public.bcp_conduct_verifications WHERE entry_id = _entry_id;

  INSERT INTO public.bcp_conduct_verifications
    (entry_id, session_id, seq, previous_state, new_state, source, note,
     recorded_by, operation_id)
  VALUES
    (_entry_id, _p.session_id, _seq, _e.verification_state, _new_state,
     nullif(btrim(coalesce(_source, '')), ''), nullif(btrim(coalesce(_note, '')), ''),
     _caller, _operation_id);

  -- The entry's current answer moves with it. This is the ONE field on an
  -- entry that may change in place, and only through this path -- the guard
  -- above lets nothing else through.
  UPDATE public.bcp_conduct_entries
     SET verification_state = _new_state,
         verification_source = coalesce(nullif(btrim(coalesce(_source, '')), ''), verification_source)
   WHERE id = _entry_id;

  UPDATE public.bcp_conduct_positions SET revision = revision + 1 WHERE id = _p.id;

  _result := jsonb_build_object(
    'entry_id', _entry_id, 'seq', _seq,
    'previous_state', _e.verification_state, 'new_state', _new_state,
    'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    CASE WHEN _new_state = 'requested'
         THEN 'conduct_verification_requested' ELSE 'conduct_verification_updated' END,
    _e.verification_state, _new_state, nullif(btrim(coalesce(_note, '')), ''),
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'entry_id', _entry_id, 'seq', _seq));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_record_verification(uuid, uuid, integer, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_record_verification(uuid, uuid, integer, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lock your own position; reopen it deliberately.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_lock_position(
  _operation_id uuid,
  _position_id uuid,
  _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb; _result jsonb; _entries integer;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_lock_position',
    'position_id', _position_id, 'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- Serialise on the position: two simultaneous lock attempts produce one lock
  -- and one refusal, deterministically, rather than a race.
  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only lock your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state = 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_LOCKED: this position is already locked.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _entries FROM public.bcp_conduct_entries
   WHERE position_id = _position_id AND superseded_by_entry_id IS NULL;
  IF _entries = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOTHING_TO_LOCK: a position with no record in it is not a position.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bcp_conduct_positions
     SET state = 'locked', locked_at = now(), lock_operation_id = _operation_id,
         revision = revision + 1
   WHERE id = _position_id;

  _result := jsonb_build_object('position_id', _position_id, 'session_id', _p.session_id,
    'state', 'locked', 'entry_count', _entries, 'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_position_locked', 'open', 'locked', NULL,
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'position_id', _position_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_lock_position(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_lock_position(uuid, uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_reopen_position(
  _operation_id uuid,
  _position_id uuid,
  _expected_revision integer,
  _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REOPEN_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_reopen_position',
    'position_id', _position_id, 'expected_revision', _expected_revision, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only reopen your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_LOCKED: this position is not locked.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once the panel has revealed, everyone has already read this position.
  -- Reopening it then would let a recorded view be revised in the light of
  -- other people's -- the exact dependency the whole design refuses.
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_panels p
              WHERE p.session_id = _p.session_id AND p.state IN ('revealed', 'concluded')) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_PANEL_ALREADY_REVEALED: this position has already been seen by the panel and cannot be reopened.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bcp_conduct_positions
     SET state = 'open', locked_at = NULL, lock_operation_id = NULL,
         reopened_at = now(), reopened_by = _caller, reopen_reason = _reason,
         reopen_count = reopen_count + 1, revision = revision + 1
   WHERE id = _position_id;

  _result := jsonb_build_object('position_id', _position_id, 'session_id', _p.session_id,
    'state', 'open', 'reopen_count', _p.reopen_count + 1, 'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_position_reopened', 'locked', 'open', _reason,
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'position_id', _position_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_reopen_position(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_reopen_position(uuid, uuid, integer, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The panel: open, reveal once everyone has locked, record what was agreed
-- and what was not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_open_panel(
  _operation_id uuid,
  _session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb; _panel_id uuid; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_open_panel', 'session_id', _session_id);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
                  WHERE p.session_id = _session_id AND p.assessor_id = _caller) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_A_PARTICIPANT: only someone holding a position may open the panel.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_panels p WHERE p.session_id = _session_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_EXISTS: this session already has a panel.'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF (SELECT count(*) FROM public.bcp_conduct_positions p WHERE p.session_id = _session_id) < 2 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_NEEDS_TWO: a panel compares positions, so it needs at least two.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_conduct_panels (session_id, opened_by, open_operation_id)
  VALUES (_session_id, _caller, _operation_id)
  RETURNING id INTO _panel_id;

  _result := jsonb_build_object('panel_id', _panel_id, 'session_id', _session_id, 'state', 'open');

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_panel_opened', NULL, 'open', NULL,
    _s.bound_content_hash, NULL, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id, 'panel_id', _panel_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_open_panel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_open_panel(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_reveal_panel(
  _operation_id uuid,
  _panel_id uuid,
  _expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _pan public.bcp_conduct_panels%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb; _open integer; _total integer; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_reveal_panel',
    'panel_id', _panel_id, 'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _pan FROM public.bcp_conduct_panels WHERE id = _panel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_NOT_FOUND: no such panel.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_pan.session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _pan.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
                  WHERE p.session_id = _pan.session_id AND p.assessor_id = _caller) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_A_PARTICIPANT: only someone holding a position may reveal the panel.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _pan.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the panel is at revision % but the request expected %. Reload and retry.',
      _pan.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _pan.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_ALREADY_REVEALED: this panel has already been revealed.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE p.state <> 'locked'), count(*) INTO _open, _total
    FROM public.bcp_conduct_positions p WHERE p.session_id = _pan.session_id;
  IF _open > 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REVEAL_TOO_EARLY: % position(s) are still open; every position must be locked first.', _open
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bcp_conduct_panels
     SET state = 'revealed', revealed_by = _caller, revealed_at = now(),
         reveal_operation_id = _operation_id, revision = revision + 1
   WHERE id = _panel_id;

  _result := jsonb_build_object('panel_id', _panel_id, 'session_id', _pan.session_id,
    'state', 'revealed', 'position_count', _total, 'panel_revision', _pan.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_panel_revealed', 'open', 'revealed', NULL,
    _s.bound_content_hash, NULL, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _pan.session_id, 'panel_id', _panel_id));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_reveal_panel(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_reveal_panel(uuid, uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_record_resolution(
  _operation_id uuid,
  _panel_id uuid,
  _expected_revision integer,
  _item_key text,
  _resolution_kind text,
  _agreed_statement text,
  _divergent_statement text,
  _rationale text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _pan public.bcp_conduct_panels%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _item_id uuid; _res_id uuid; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _resolution_kind IS NULL OR _resolution_kind NOT IN ('agreed', 'disagreed') THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_RESOLUTION_KIND_UNKNOWN: a panel records agreement or disagreement, and nothing else. '
      'There is no score, no average and no majority.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_rationale, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_RATIONALE_REQUIRED: a resolution says why.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _resolution_kind = 'disagreed' AND length(btrim(coalesce(_divergent_statement, ''))) = 0 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_DIVERGENCE_REQUIRED: a recorded disagreement carries what the parties actually differ on. '
      'Without it the disagreement is only a rumour that there was one.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _resolution_kind = 'agreed' AND length(btrim(coalesce(_agreed_statement, ''))) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_AGREEMENT_REQUIRED: a recorded agreement says what was agreed.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_record_resolution',
    'panel_id', _panel_id, 'expected_revision', _expected_revision, 'item_key', _item_key,
    'resolution_kind', _resolution_kind, 'agreed_statement', _agreed_statement,
    'divergent_statement', _divergent_statement, 'rationale', _rationale);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _pan FROM public.bcp_conduct_panels WHERE id = _panel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PANEL_NOT_FOUND: no such panel.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_pan.session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _pan.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions p
                  WHERE p.session_id = _pan.session_id AND p.assessor_id = _caller) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_A_PARTICIPANT: only someone holding a position may record a resolution.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _pan.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the panel is at revision % but the request expected %. Reload and retry.',
      _pan.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  -- Nothing is resolved before the positions have been seen. A "resolution"
  -- written while the positions were still hidden would be a decision taken
  -- without the material it claims to rest on.
  IF _pan.state <> 'revealed' THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_PANEL_NOT_REVEALED: resolutions are recorded after the positions are revealed.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id INTO _item_id FROM public.beskt_items i
   WHERE i.method_version_id = _s.bound_method_version_id AND i.item_key = _item_key;
  IF _item_id IS NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      _item_key USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_conduct_panel_resolutions
    (panel_id, session_id, item_id, item_key, resolution_kind,
     agreed_statement, divergent_statement, rationale, recorded_by, operation_id)
  VALUES
    (_panel_id, _pan.session_id, _item_id, _item_key, _resolution_kind,
     nullif(btrim(coalesce(_agreed_statement, '')), ''),
     nullif(btrim(coalesce(_divergent_statement, '')), ''),
     btrim(_rationale), _caller, _operation_id)
  RETURNING id INTO _res_id;

  UPDATE public.bcp_conduct_panels SET revision = revision + 1 WHERE id = _panel_id;

  _result := jsonb_build_object('resolution_id', _res_id, 'panel_id', _panel_id,
    'item_key', _item_key, 'resolution_kind', _resolution_kind,
    'panel_revision', _pan.revision + 1, 'produces_score', false);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_panel_resolution_recorded', NULL, _resolution_kind, btrim(_rationale),
    _s.bound_content_hash, NULL, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _pan.session_id, 'panel_id', _panel_id,
                       'resolution_id', _res_id, 'item_key', _item_key));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_record_resolution(
  uuid, uuid, integer, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_record_resolution(
  uuid, uuid, integer, text, text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12 · The read surface.
--
-- What an interviewer sees when they open a linked case: the bound snapshot,
-- the deterministic BESKT themes, the candidate's neutral states shown AS
-- neutral states, their own working record -- and other people's only once
-- their own is locked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_workspace(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _me public.bcp_conduct_positions%ROWTYPE;
  _reveal boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _me FROM public.bcp_conduct_positions
   WHERE session_id = _session_id AND assessor_id = _caller;
  _reveal := public.bcp_conduct_may_see_others(_session_id);

  RETURN jsonb_build_object(
    'session_id', _s.id,
    'case_id', _s.case_id,
    'link_id', _s.link_id,
    'state', _s.state,
    'session_revision', _s.revision,
    -- THE BOUND SNAPSHOT STAYS VISIBLE AND BOUND throughout the interview.
    'bound', jsonb_build_object(
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'method_version_id', _s.bound_method_version_id,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash),
    -- PR 4's deterministic themes, in their derived order, with the
    -- candidate's own state carried through NEUTRALLY and nothing added.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),
    'my_position', CASE WHEN _me.id IS NULL THEN NULL ELSE jsonb_build_object(
      'position_id', _me.id, 'state', _me.state, 'position_role', _me.position_role,
      'revision', _me.revision, 'locked_at', _me.locked_at,
      'reopen_count', _me.reopen_count) END,
    'my_entries', CASE WHEN _me.id IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', e.id, 'item_key', e.item_key, 'topic_id', e.topic_id,
          'entry_version', e.entry_version,
          'observable_fact', e.observable_fact,
          'candidate_explanation', e.candidate_explanation,
          'interviewer_interpretation', e.interviewer_interpretation,
          'alternative_explanation', e.alternative_explanation,
          'protective_factor', e.protective_factor,
          'verification_need', e.verification_need,
          'verification_state', e.verification_state,
          'verification_source', e.verification_source,
          'sensitivity_class', e.sensitivity_class,
          'recorded_at', e.recorded_at)
        ORDER BY e.item_key)
        FROM public.bcp_conduct_entries e
       WHERE e.position_id = _me.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb) END,
    -- Other people's positions: withheld until the reader has locked theirs.
    -- Absent is not empty, so the client can say WHY rather than show nothing.
    'others_visible', _reveal,
    'others', CASE WHEN NOT _reveal THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', p.id, 'assessor_id', p.assessor_id,
          'position_role', p.position_role, 'state', p.state, 'locked_at', p.locked_at,
          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id, 'item_key', e.item_key,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'verification_state', e.verification_state)
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = p.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb))
        ORDER BY p.created_at)
        FROM public.bcp_conduct_positions p
       WHERE p.session_id = _session_id AND p.assessor_id <> _caller), '[]'::jsonb) END,
    'panel', (
      SELECT jsonb_build_object('panel_id', pn.id, 'state', pn.state,
               'revision', pn.revision, 'revealed_at', pn.revealed_at,
               'resolutions', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                     'resolution_id', r.id, 'item_key', r.item_key,
                     'resolution_kind', r.resolution_kind,
                     'agreed_statement', r.agreed_statement,
                     'divergent_statement', r.divergent_statement,
                     'rationale', r.rationale, 'recorded_at', r.recorded_at)
                   ORDER BY r.recorded_at)
                   FROM public.bcp_conduct_panel_resolutions r
                  WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),
    -- Said in the payload itself, so a client cannot render a total by mistake.
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_workspace(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The correction history of one entry chain: what was recorded, what replaced
-- it, and why. Nothing is lost, so the record can be explained afterwards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_entry_history(_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e public.bcp_conduct_entries%ROWTYPE;
  _p public.bcp_conduct_positions%ROWTYPE;
  _root uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _e FROM public.bcp_conduct_entries WHERE id = _entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_FOUND: no such entry.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _e.position_id;

  IF _p.assessor_id <> auth.uid()
     AND NOT public.bcp_conduct_may_see_others(_e.session_id) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position before reading another assessor''s record.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.scp_iv_can_read_case((SELECT case_id FROM public.bcp_conduct_sessions
                                       WHERE id = _e.session_id)) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'entry_id', _entry_id,
    'item_key', _e.item_key,
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', h.id, 'entry_version', h.entry_version,
          'observable_fact', h.observable_fact,
          'candidate_explanation', h.candidate_explanation,
          'interviewer_interpretation', h.interviewer_interpretation,
          'alternative_explanation', h.alternative_explanation,
          'protective_factor', h.protective_factor,
          'verification_need', h.verification_need,
          'verification_state', h.verification_state,
          'verification_source', h.verification_source,
          'sensitivity_class', h.sensitivity_class,
          'correction_reason', h.correction_reason,
          'supersedes_entry_id', h.supersedes_entry_id,
          'superseded_by_entry_id', h.superseded_by_entry_id,
          'recorded_by', h.recorded_by, 'recorded_at', h.recorded_at)
        ORDER BY h.entry_version)
        FROM public.bcp_conduct_entries h
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb),
    'verifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'seq', v.seq, 'previous_state', v.previous_state, 'new_state', v.new_state,
          'source', v.source, 'note', v.note,
          'recorded_by', v.recorded_by, 'recorded_at', v.recorded_at)
        ORDER BY v.seq)
        FROM public.bcp_conduct_verifications v
        JOIN public.bcp_conduct_entries h ON h.id = v.entry_id
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_entry_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_entry_history(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13 · Postflight. The migration proves its own claims from the catalogue
--      before it commits, rather than asserting them in a comment.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  _t text; _fn text; _n integer;
  _tables text[] := ARRAY['bcp_conduct_sessions', 'bcp_conduct_positions',
                          'bcp_conduct_entries', 'bcp_conduct_verifications',
                          'bcp_conduct_panels', 'bcp_conduct_panel_resolutions'];
  _client_fns text[] := ARRAY['bcp_conduct_start_session', 'bcp_conduct_join_session',
                              'bcp_conduct_save_entry', 'bcp_conduct_record_verification',
                              'bcp_conduct_lock_position', 'bcp_conduct_reopen_position',
                              'bcp_conduct_open_panel', 'bcp_conduct_reveal_panel',
                              'bcp_conduct_record_resolution', 'bcp_conduct_workspace',
                              'bcp_conduct_entry_history', 'bcp_conduct_may_see_others',
                              'bcp_conduct_can_read_session'];
  _trigger_fns text[] := ARRAY['bcp_guard_conduct_session()', 'bcp_guard_conduct_position()',
                               'bcp_guard_conduct_entry()', 'bcp_guard_conduct_panel()',
                               'bcp_guard_conduct_append_only()'];
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
                      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % is missing, or missing ENABLE or FORCE ROW LEVEL SECURITY.', _t;
    END IF;
    FOREACH _fn IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('authenticated', 'public.' || _t, _fn)
         OR has_table_privilege('anon', 'public.' || _t, _fn)
         OR has_table_privilege('service_role', 'public.' || _t, _fn) THEN
        RAISE EXCEPTION 'BCP_CONDUCT_PROOF: a client role holds % on %.', _fn, _t;
      END IF;
    END LOOP;
    IF has_table_privilege('anon', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: anon can read %.', _t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = _t AND p.cmd <> 'SELECT') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % carries a write policy.', _t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = _t) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % has a SELECT grant and no policy, so the grant is dead.', _t;
    END IF;
  END LOOP;

  -- ── NO INTERPRETATION IS REPRESENTABLE ANYWHERE IN THE CONDUCT LAYER ──
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = ANY (_tables)
     AND (c.column_name ~* '(score|points|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|deception|hire|confidence|rating|grade|level)');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % forbidden column(s) exist in the conduct layer.', _n;
  END IF;

  -- The information model is COLUMNS. A jsonb anywhere here would be the place
  -- the distinctions quietly collapse back into one blob.
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = ANY (_tables) AND c.data_type = 'jsonb';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % jsonb column(s) exist in the conduct layer.', _n;
  END IF;

  -- Every element the method distinguishes really is its own column.
  FOREACH _fn IN ARRAY ARRAY['observable_fact', 'candidate_explanation',
                             'interviewer_interpretation', 'alternative_explanation',
                             'protective_factor', 'verification_need', 'verification_state',
                             'verification_source', 'sensitivity_class', 'recorded_by',
                             'recorded_at', 'correction_reason', 'supersedes_entry_id'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'bcp_conduct_entries'
                      AND c.column_name = _fn) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: the entry has no % column.', _fn;
    END IF;
  END LOOP;

  -- The panel records agreement and disagreement, and nothing else.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bcp_conduct_panel_resolutions'::regclass
                    AND pg_get_constraintdef(oid) LIKE '%resolution_kind%agreed%disagreed%') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PROOF: resolution_kind is not constrained to agreed/disagreed.';
  END IF;

  -- One live entry per position and item, by index rather than by hope.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND indexname = 'bcp_conduct_entries_one_live_per_position_item_idx') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PROOF: the one-live-entry index is missing.';
  END IF;

  -- Every new function pins its search_path; none is reachable by anon.
  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'bcp_conduct%' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = _fn::regprocedure
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % has no pinned search_path.', _fn;
    END IF;
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;

  -- The trigger functions are reachable by NO client role: PostgREST publishes
  -- anything `authenticated` may execute, and an invariant-checker is not an API.
  FOREACH _fn IN ARRAY _trigger_fns LOOP
    IF has_function_privilege('authenticated', 'public.' || _fn, 'EXECUTE')
       OR has_function_privilege('service_role', 'public.' || _fn, 'EXECUTE')
       OR has_function_privilege('anon', 'public.' || _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: trigger function % is executable by a client role.', _fn;
    END IF;
  END LOOP;

  FOREACH _fn IN ARRAY _client_fns LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: % does not exist.', _fn;
    END IF;
  END LOOP;

  -- The event vocabulary still admits everything PR 3 and PR 4 write.
  FOREACH _fn IN ARRAY ARRAY['assignment_created', 'response_submitted', 'pilot_granted',
                             'case_linked', 'case_unlinked', 'conduct_session_started',
                             'conduct_position_locked', 'conduct_panel_revealed'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.bcp_events'::regclass
                      AND pg_get_constraintdef(oid) LIKE '%' || _fn || '%') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_PROOF: the event vocabulary lost %.', _fn;
    END IF;
  END LOOP;

  -- This migration seeds nothing.
  SELECT count(*) INTO _n FROM public.bcp_conduct_sessions;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_PROOF: the migration created % session(s); it must seed none.', _n;
  END IF;

  RAISE NOTICE 'BESKT_INTERVIEW_CONDUCT_PROOF ok';
END $proof$;

COMMIT;
