-- Security Career Discovery v3.1 -- content v4: context/intent separation.
--
-- ONE COLUMN, ONE ROW:
--
--   cd_definition_versions.content_version: 'v3.1-draft-4' -> 'v3.1-draft-5'
--
-- Nothing else. No new item, no item removed, no option, no option VALUE, no
-- option order, no loading, no weight, no profile, no scoring_version, no
-- pattern_definition_version, no lifecycle change, no grant, no policy.
--
-- ── WHAT CHANGED IN THE PRODUCT ───────────────────────────────────────
--
-- C1 asks about the candidate's SITUATION; C2 asks what they want out of
-- Career Discovery. One C1 option had drifted across that line: it read
-- "I am a manager and want to understand my strengths better", welding a
-- situation to a goal whose wording was, word for word, one of C2's own
-- options. A candidate met the same statement twice, two questions apart.
-- It now reads "I lead others within security". `exploring_security` gained
-- the transition case explicitly ("new to it, or coming from another
-- industry"), which people were reading past.
--
-- Labels only. See src/lib/career-discovery/context-items.ts.
--
-- ── WHY A MIGRATION IS NEEDED AT ALL FOR A WORDING CHANGE ─────────────
--
-- Exactly the reason 20260910091000 set out and this file will not restate
-- in full: candidate-facing wording lives only in TypeScript, but the
-- version STAMP does not. cd_report_snapshots.content_version is written by
-- cd_guard_snapshot_derive_versions() (BEFORE INSERT, 20260728182219) from
-- the session's parent cd_definition_versions row, while the payload carries
-- version.ts's CONTENT_VERSION. Bump the constant without this UPDATE and
-- every subsequent report is stamped 'v3.1-draft-4' in its column while its
-- own payload says 'v3.1-draft-5' -- a row that disagrees with itself about
-- which wording the candidate actually read.
--
-- ── EXISTING REPORTS, AND IN-PROGRESS SESSIONS ────────────────────────
--
-- Every cd_report_snapshots row freezes its OWN content_version at
-- generation time and is never re-derived from this parent row, so reports
-- issued under draft-4 stay stamped draft-4 and stay exactly interpretable
-- against the wording that produced them. The new content version applies
-- prospectively, which is the intent.
--
-- A session started before this migration and completed after it is stamped
-- draft-5 although some answers were given against draft-4 wording. Same
-- unavoidable exposure every in-place content version carries, and smaller
-- here than draft-3 -> draft-4: no item is added or removed, and every item
-- id, option id and response value means exactly what it meant before -- so
-- a part-old, part-new session scores identically either way, proven
-- per-field by scripts/career-discovery-v32-equivalence-check.ts. Anonymous
-- in-progress runs need no reasoning at all: v31-public-buffer.ts discards a
-- buffer whose contentVersion no longer matches, so those restart cleanly.
--
-- SCORING IS UNTOUCHED, AND THAT IS ASSERTED, NOT ASSUMED. scoring_version
-- stays 'v3.1-draft-3' on the same row; the block below fails the migration
-- if this statement moved it. Independently, with the new wording in place
-- and CONTENT_VERSION temporarily held at 'v3.1-draft-4',
-- scripts/career-discovery-v31-check.ts passed all 601 checks on the
-- PREVIOUS frozen persona hashes -- which isolates the whole delta to the
-- version string.
--
-- Reversible: supabase/rollback/20260913090000_cd_v31_content_v4_context_intent_separation_rollback.sql

UPDATE public.cd_definition_versions
SET content_version = 'v3.1-draft-5'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.1.0'
  AND content_version = 'v3.1-draft-4';

-- =========================================================================
-- Self-verification
-- =========================================================================
--
-- A no-op UPDATE is the failure mode that matters: if the WHERE clause
-- matched nothing (already migrated, or the row is not where this migration
-- believes it is), the statement succeeds silently and the stamp never moves.

DO $$
DECLARE _content text; _scoring text;
BEGIN
  SELECT content_version, scoring_version
    INTO _content, _scoring
    FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
     AND definition_version = '2026-scd-v3.1.0';

  IF _content IS NULL THEN
    RAISE EXCEPTION 'CD_V4_NO_DEFINITION_ROW: 2026-scd-v3.1.0 is not registered';
  END IF;

  IF _content <> 'v3.1-draft-5' THEN
    RAISE EXCEPTION 'CD_V4_CONTENT_VERSION_NOT_APPLIED: content_version is %, expected v3.1-draft-5', _content;
  END IF;

  IF _scoring <> 'v3.1-draft-3' THEN
    RAISE EXCEPTION 'CD_V4_SCORING_VERSION_MOVED: scoring_version is %, expected v3.1-draft-3 (a wording change must never move it)', _scoring;
  END IF;
END $$;
