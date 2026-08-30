-- SCHEMA HALF: a private home for saved CV documents.
--
-- ══ THIS FILE SHIPS WITHOUT ITS CALLER, ON PURPOSE ═══════════════════════
--
-- Nothing in `src/` names `cv_documents`. That is not an oversight; it is
-- this repository's schema-first release contract
-- (scripts/schema-first-release-check.ts) doing exactly what it was built
-- to do:
--
--   Lovable rebuilds the application from `origin/main` the moment a PR
--   merges. Canonical migrations do NOT run then; they run when somebody
--   applies them. Between those two events, deployed code can be asking
--   the database for a table it has never heard of. On 2026-08-25 that
--   took down all job publishing.
--
-- So the order is fixed and nobody has to remember it:
--
--   1. THIS RELEASE      the table, its policies, its grants, its tests.
--                        Safe to merge with the current application
--                        running: adding a table breaks nothing.
--   2. apply + verify    the Supabase GitHub integration applies it, the
--                        hosted schema is checked, release-state.json
--                        records `applied` WITH evidence.
--   3. NEXT RELEASE      the save/load code, now unblocked.
--
-- Until step 3, the CV feature generates and exports without persisting.
-- That is a smaller product, not a broken one -- and an unsaved CV is
-- private by construction, which is the default this table has to work
-- to reproduce.
--
-- ══ WHAT A CV DOCUMENT IS ═══════════════════════════════════════════════
--
-- A PRESENTATION of facts that live somewhere else. It is not a profile,
-- it is not evidence, and it is not a second home for anything.
--
--   the facts        security_career_profiles (canonical self-reported),
--                    sp_experience_periods, sp_claims, profiles. Owned
--                    there, edited there, verified there.
--   this table       which of those facts a person chose to present, in
--                    what order, with what wording, for what purpose.
--
-- ══ WHY THE FACTS ARE SNAPSHOTTED INTO source_bundle ════════════════════
--
-- A saved CV must not silently change when the underlying profile does.
-- Somebody who exported a CV in March and reopens it in June has to see
-- what they sent, not a document quietly rewritten by an edit they made in
-- between -- the same historical-snapshot semantics a submitted job
-- application already has, and for the same reason.
--
-- Regenerating is therefore an explicit act that writes a new row or
-- replaces this one's contents deliberately. It is never a side effect of
-- reading.
--
-- ══ THE VERIFICATION FIELD IN THAT SNAPSHOT IS NOT EVIDENCE ═════════════
--
-- `source_bundle` contains a `verified` boolean per credential, copied from
-- what the Passport said at generation time. It exists so a saved document
-- renders the way it rendered. It is a COPY OF A DISPLAY DECISION and it
-- must never be read as authorisation, as proof, or as a substitute for
-- sp_claims.assertion_level. The column comment says so, and no policy,
-- function or view in this file or anywhere else reads it.
--
-- Nothing here can create verification either: this migration writes no
-- assertion_level, no lifecycle_state, no verified_at and no
-- verified_by_user_id, and none of those identifiers appears in a write
-- position anywhere in the file.
--
-- ══ PRIVATE BY DEFAULT, AND NOT SHAREABLE AT ALL YET ════════════════════
--
-- There is no share token, no public-access column, no expiry, no
-- recipient table and no anon grant. A CV is readable by exactly one
-- person: the one whose auth.uid() owns the row.
--
-- The Career Card's public-sharing semantics are deliberately NOT reused.
-- A Career Card carries three profession matches and an optional first
-- name; a CV carries employment history, employer names, dates and
-- credentials. Those are different disclosures and the second one needs
-- its own access model, designed on purpose, when somebody asks for it --
-- not inherited by accident because the mechanism was already lying
-- around.
--
-- Reversible: supabase/rollback/20261010090000_cv_documents_rollback.sql
-- Idempotent: safe to replay from an empty database or over itself.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cv_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The one person who may read this row. ON DELETE CASCADE because a CV
  -- has no meaning without its subject and no other party has an interest
  -- in it -- unlike a Passport claim, which somebody else may have acted on.
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the person called it. "CV for Nordic Security" is theirs to write.
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),

  locale text NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv', 'en')),

  -- A general CV, or one arranged against a specific role. Stored because
  -- it changes what the document IS, not merely how it was made.
  purpose text NOT NULL DEFAULT 'general' CHECK (purpose IN ('general', 'targeted')),

  -- Which application-side contract wrote this row. A stored document and a
  -- recomputed one disagreeing is not a bug when the version changed in
  -- between -- it IS a bug if nobody can tell which happened.
  document_version text NOT NULL DEFAULT 'cv-document-v1',
  bundle_version text NOT NULL DEFAULT 'cv-source-bundle-v1',

  -- Whether a language model contributed wording. Provenance, shown on the
  -- document itself, never inferred from the presentation being non-empty.
  origin text NOT NULL DEFAULT 'factual' CHECK (origin IN ('factual', 'ai_assisted')),

  -- The facts, as they stood when this document was made. See the header.
  source_bundle jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The AI-written half, and ONLY that half: headline, summary, per-
  -- employment bullet lines keyed by a source id, an emphasis ordering and
  -- a one-sentence rationale. No employer name, no role title and no date
  -- is ever stored here -- those live in source_bundle, are rendered from
  -- there, and are not fields the generator is given.
  presentation jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Which engine, if any. NULL for a document nothing generated.
  provider_mode text CHECK (provider_mode IN ('synthetic', 'development_model', 'production_model')),
  -- The EXACT model identifier, never a vendor name -- "anthropic" is not a
  -- model, "claude-sonnet-5" is. Same rule the AI run ledger already keeps.
  model_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cv_documents IS
  'PRIVATE, owner-only CV documents. Presentation over facts that live in '
  'security_career_profiles, sp_experience_periods, sp_claims and profiles '
  '-- never a second home for any of them. Snapshots the facts it was built '
  'from so a saved CV does not silently change when the profile does. No '
  'sharing mechanism exists: a CV carries employment history and credentials '
  'and needs its own access model, not the Career Card''s.';

COMMENT ON COLUMN public.cv_documents.source_bundle IS
  'The facts as they stood at generation time. Its per-credential "verified" '
  'flag is a COPY OF A DISPLAY DECISION taken from the Passport at that '
  'moment. It is NOT evidence, NOT authorisation, and must never be read in '
  'place of sp_claims.assertion_level.';

COMMENT ON COLUMN public.cv_documents.presentation IS
  'AI-written wording only: headline, summary, bullets keyed by a source id, '
  'an emphasis ordering and a rationale. Employer names, role titles, dates '
  'and credential titles are NOT stored here and are not fields the '
  'generator is given -- which is what makes an invented employer '
  'structurally impossible rather than merely detectable.';

-- A person's own list, newest first. The only access pattern this table has.
CREATE INDEX IF NOT EXISTS cv_documents_owner_recent_idx
  ON public.cv_documents (owner_user_id, updated_at DESC);

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Privileges
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── SILENCE IS A GRANT HERE ──────────────────────────────────────────
--
-- This project runs with Supabase's default privileges, under which a newly
-- created table arrives ALREADY GRANTED to `anon` and `authenticated` --
-- INSERT, DELETE and TRUNCATE included, and TRUNCATE is not something RLS
-- constrains. A migration that only ADDS the grants it wants therefore
-- ships every grant it did not think about.
--
-- So the table is stripped first and then given exactly what is intended,
-- to exactly one role. `anon` gets nothing at all: there is no public CV,
-- no share token and no unauthenticated path to this table.

REVOKE ALL ON public.cv_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_documents TO authenticated;
GRANT ALL ON public.cv_documents TO service_role;

ALTER TABLE public.cv_documents ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Row-level security — one owner, four verbs, no exceptions
-- ═════════════════════════════════════════════════════════════════════════
--
-- Four separate policies rather than one FOR ALL, because FOR ALL cannot
-- express a WITH CHECK that differs from its USING and reads as a single
-- rule when it is four. Every one of them is the same predicate, stated
-- where it applies:
--
--   USING       which existing rows this statement may see or touch
--   WITH CHECK  what the row is allowed to look like afterwards
--
-- The WITH CHECK on INSERT and UPDATE is what stops somebody creating a row
-- owned by another person, or re-assigning one of their own to somebody
-- else. A policy with USING and no WITH CHECK permits exactly that, which
-- is the mistake this table cannot afford: the payload is an employment
-- history.
--
-- There is deliberately NO employer, recruiter, reviewer or platform-admin
-- read policy. A recruiter who needs a candidate's CV receives it through
-- the application/disclosure machinery that already exists and already
-- records who saw what. Adding a second, quieter route here would be a
-- disclosure nobody logged.

DROP POLICY IF EXISTS "own cv select" ON public.cv_documents;
CREATE POLICY "own cv select"
  ON public.cv_documents
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "own cv insert" ON public.cv_documents;
CREATE POLICY "own cv insert"
  ON public.cv_documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "own cv update" ON public.cv_documents;
CREATE POLICY "own cv update"
  ON public.cv_documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- A CV is a draft of a person's own presentation of themselves. Unlike a
-- Passport entry -- which is a record other people act on, and is therefore
-- withdrawn rather than deleted -- nobody else has ever seen this row, so
-- deleting it destroys no evidence and there is nothing to preserve.
DROP POLICY IF EXISTS "own cv delete" ON public.cv_documents;
CREATE POLICY "own cv delete"
  ON public.cv_documents
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_user_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 4. updated_at
-- ═════════════════════════════════════════════════════════════════════════
--
-- The existing shared trigger function, unchanged. "When did I last touch
-- this CV" is the only ordering the list has.

DROP TRIGGER IF EXISTS cv_documents_set_updated_at ON public.cv_documents;
CREATE TRIGGER cv_documents_set_updated_at
  BEFORE UPDATE ON public.cv_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
