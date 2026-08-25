-- Security Career Discovery v3.1 -- content v3: question refinement (v3.2).
--
-- CQrityjob Career Discovery Question Refinement v3.2. ONE COLUMN, ONE ROW:
--
--   cd_definition_versions.content_version: 'v3.1-draft-3' -> 'v3.1-draft-4'
--
-- Nothing else. No new items, no item removed, no option, no loading, no
-- weight, no profile, no scoring_version, no pattern_definition_version, no
-- lifecycle change, no grant, no policy.
--
-- ── WHY A MIGRATION IS NEEDED AT ALL FOR A WORDING CHANGE ──────────────
--
-- Candidate-facing wording lives only in TypeScript -- cd_definition_items
-- stores item_id, item_version, item_kind, evidence_class, is_scored,
-- section_id and display_order, and no stem text at all (see
-- 20260728130000 and 20260816150000). So the rephrasing itself needs no
-- SQL.
--
-- What needs SQL is the version STAMP. cd_report_snapshots.content_version
-- is not written by the client: cd_guard_snapshot_derive_versions() (a
-- BEFORE INSERT trigger, 20260728182219) overwrites whatever is supplied
-- with the value on the session's parent cd_definition_versions row. The
-- report payload, by contrast, carries version.ts's CONTENT_VERSION. Bump
-- the constant without this UPDATE and every report generated afterwards is
-- stamped 'v3.1-draft-3' in its column while its own payload says
-- 'v3.1-draft-4' -- a row that disagrees with itself about which wording
-- the candidate actually read. That is precisely the ambiguity the version
-- tuple exists to prevent, so the two are moved together.
--
-- ── WHY THE UPDATE IS IN PLACE, AND WHY EXISTING REPORTS ARE SAFE ──────
--
-- Same reasoning 20260816150000_cd_v31_content_v2_compliance_dimension.sql
-- set out at length and this migration deliberately does not restate in
-- full: cd_definition_versions is unique on (assessment_id,
-- definition_version); definition_version stays '2026-scd-v3.1.0' because
-- this is a same-generation content change, not a new product-level
-- instrument (version.ts, DEFINITION_VERSION); and every
-- cd_report_snapshots row freezes its OWN content_version at generation
-- time and is never re-derived from this parent row
-- (20260730090000_career_discovery_v3_1_schema.sql; the
-- cd_v31_stored_reports view exists specifically to demonstrate that a
-- stored report joins no definition table at all). Reports already issued
-- under 'v3.1-draft-3' therefore stay stamped 'v3.1-draft-3' and stay
-- exactly interpretable against the wording that produced them. The new
-- content version applies prospectively, which is the intent.
--
-- IN-PROGRESS SESSIONS. A session started before this migration and
-- completed after it will be stamped 'v3.1-draft-4' although some answers
-- were given against draft-3 wording. That is unavoidable for any in-place
-- content version and is the same exposure draft-1 -> draft-3 carried; it
-- is also far smaller here, because draft-3 -> draft-4 adds and removes no
-- item. Every item id, option id and response value means exactly what it
-- meant before, so a part-old, part-new session scores identically either
-- way -- proven per-field by
-- scripts/career-discovery-v32-equivalence-check.ts. Anonymous in-progress
-- runs need no reasoning at all: v31-public-buffer.ts already discards a
-- buffered session whose contentVersion no longer matches, so those restart
-- cleanly rather than mixing.
--
-- SCORING IS UNTOUCHED, AND THAT IS ASSERTED, NOT ASSUMED. scoring_version
-- stays 'v3.1-draft-3' on the same row. The self-verification block below
-- fails the migration if this statement moved it.
--
-- Reversible: supabase/rollback/20260910091000_cd_v31_content_v3_question_refinement_rollback.sql

UPDATE public.cd_definition_versions
SET content_version = 'v3.1-draft-4'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.1.0'
  AND content_version = 'v3.1-draft-3';

-- =========================================================================
-- Self-verification
-- =========================================================================
--
-- A no-op UPDATE is the failure mode that matters here: if the WHERE clause
-- matched nothing (already migrated, or the row is not where this migration
-- believes), the statement succeeds silently and the stamp never moves.

-- NOTE ON WHAT IS *NOT* CHECKED HERE. cd_definition_versions carries only
-- definition_version, content_version, scoring_version and taxonomy_version
-- (20260728120000_career_discovery_v3_phase1.sql). There is no
-- pattern_definition_version column on this table and no
-- option_matrix_version either -- those live per-row on
-- cd_report_snapshots and on cd_option_loadings respectively. So the code
-- constants PATTERN_DEFINITION_VERSION and OPTION_MATRIX_VERSION cannot be
-- asserted from here; they are asserted in TypeScript instead, by
-- scripts/career-discovery-v32-equivalence-check.ts (section 3) and
-- scripts/career-discovery-v31-check.ts (9.6/9.7).

DO $$
DECLARE _content text; _scoring text;
BEGIN
  SELECT content_version, scoring_version
    INTO _content, _scoring
    FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
     AND definition_version = '2026-scd-v3.1.0';

  IF _content IS NULL THEN
    RAISE EXCEPTION 'CD_V32_NO_DEFINITION_ROW: 2026-scd-v3.1.0 is not registered';
  END IF;

  IF _content <> 'v3.1-draft-4' THEN
    RAISE EXCEPTION 'CD_V32_CONTENT_VERSION_NOT_APPLIED: content_version is %, expected v3.1-draft-4', _content;
  END IF;

  IF _scoring <> 'v3.1-draft-3' THEN
    RAISE EXCEPTION 'CD_V32_SCORING_VERSION_MOVED: scoring_version is %, expected v3.1-draft-3 (a wording change must never move it)', _scoring;
  END IF;
END $$;
