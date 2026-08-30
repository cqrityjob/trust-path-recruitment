-- The presentation column now holds a PERSON's words too. Say so.
--
-- ══ WHAT CHANGED, AND WHY IT IS ONLY A COMMENT ═══════════════════════════
--
-- 20261010090000 described `cv_documents.presentation` as "AI-written
-- wording only". That was accurate for a release in which nothing could be
-- edited. It stopped being accurate the moment saved CVs became editable:
-- once somebody rewrites a drafted sentence, the column holds their
-- sentence, and it carries a small authorship record saying so.
--
-- Nothing structural is needed for that. `presentation` is jsonb precisely
-- so the document contract can grow without DDL, and the application half
-- validates the shape it stores (`storedPresentationSchema`). So this file
-- changes NO column, NO constraint, NO policy and NO grant.
--
-- It introduces no object, which is why it does not gate the application
-- release that accompanies it: scripts/schema-first-release-check.ts blocks
-- code that depends on an unapplied OBJECT, and there is none here. The
-- release it belongs to is gated by 20261010090000 instead -- the migration
-- that created the table.
--
-- ══ WHY BOTHER AT ALL ════════════════════════════════════════════════════
--
-- Because the comment is the contract the next reader trusts, and a wrong
-- one is worse than none: somebody reading "AI-written wording only" would
-- reasonably conclude that everything in this column can be regenerated and
-- is therefore disposable. It cannot. Half of it may be the only copy of
-- something a person wrote about their own career.
--
-- Reversible: supabase/rollback/20261011090000_cv_documents_editing_provenance_rollback.sql
-- Idempotent: COMMENT ON is idempotent by nature.

COMMENT ON COLUMN public.cv_documents.presentation IS
  'The document''s WORDING and ORDER -- never its facts. Holds a headline, a '
  'summary, bullet lines keyed by an employment source id, an emphasis '
  'ordering, a tailoring rationale, and a per-field authorship record '
  '("ai" or "person") so a sentence somebody rewrote stops being labelled as '
  'machine-written. Employer names, role titles, dates and credential titles '
  'are NOT stored here, are not fields the generator is given, and are not '
  'fields the editor can write -- which is what makes an invented or '
  'silently-corrected employer structurally impossible rather than merely '
  'detectable. Facts live in source_bundle and are rendered from there.';

COMMENT ON COLUMN public.cv_documents.origin IS
  'Whether drafted wording from a language model is STILL on the page. A '
  'person who rewrote every drafted line owns the document outright and it '
  'stops claiming otherwise. Never inferred from presentation being '
  'non-empty -- a purely factual CV has a presentation too.';

COMMENT ON COLUMN public.cv_documents.title IS
  'What the person called this CV, for their own list. Never shown on the '
  'document itself and never sent anywhere.';
