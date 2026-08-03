-- Phase 2h — the two corrections required before staging.
--
-- ADDITIVE ONLY, except for one deliberate data correction on DRAFT content,
-- explained in Section 1.

-- =========================================================================
-- SECTION 1 — Learning feedback must not exist on Assessment Mode options
-- =========================================================================
--
-- ── WHAT WENT WRONG ────────────────────────────────────────────────────
--
-- Phase 1G authored Learning-counterpart feedback directly onto the real
-- Security Guard ASSESSMENT item options: 60 rows across sg-b-01..15, each
-- carrying prose that names and justifies the preferred response.
--
-- No payload exposes it today. scp_get_attempt_items does not select the
-- column, scp_get_learning_feedback refuses any item whose mode is not
-- 'learning', and no participant has a read policy on scp_item_options. So this
-- is not a leak that happened -- it is a leak that only ever needed one
-- convenience field to happen.
--
-- ── WHY A NULLING UPDATE IS THE SAFE CORRECTION HERE ───────────────────
--
-- Every affected row belongs to a DRAFT item version. Draft content is
-- explicitly mutable: that is the entire distinction the content_status
-- vocabulary draws, and scp_guard_published_immutable enforces it. Creating new
-- item versions to carry the correction would fork the review state of fifteen
-- items that are mid-review, and would leave the old rows -- with the feedback
-- still on them -- in the bank anyway.
--
-- So the versioning guarantee that matters is preserved precisely because
-- nothing published is touched. The UPDATE below is scoped to draft rows, and
-- the assertion after it proves no published row was affected.
--
-- The text is not lost: it is recorded verbatim in scp_content_events before
-- removal, so a content author can reinstate it on the LEARNING counterparts
-- where it belongs.

-- 1a. Preserve the authored text before removing it.
INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
SELECT
  'item_version',
  i.slug || ':' || o.option_key,
  'updated',
  'Phase 2h: learning feedback removed from an ASSESSMENT MODE option. The text is preserved in this event so it can be reinstated on the item''s Learning Mode counterpart, where feedback belongs. Assessment content must never carry an explanation that names the preferred response.',
  jsonb_build_object(
    'migration', '20260810090000_scp_phase2h_staging_corrections',
    'item_slug', i.slug,
    'option_key', o.option_key,
    'item_content_status', iv.content_status,
    'removed_learning_feedback_sv', o.learning_feedback_sv,
    'removed_learning_feedback_en', o.learning_feedback_en)
FROM public.scp_item_options o
JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
JOIN public.scp_items i ON i.id = iv.item_id
WHERE iv.mode = 'assessment'
  AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);

-- 1b. Remove it. Draft rows only -- a published row would be refused by
--     scp_guard_published_immutable anyway, and the assertion below proves
--     none was in scope.
UPDATE public.scp_item_options o
   SET learning_feedback_sv = NULL,
       learning_feedback_en = NULL
  FROM public.scp_item_versions iv
 WHERE iv.id = o.item_version_id
   AND iv.mode = 'assessment'
   AND iv.content_status = 'draft'
   AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);

-- 1c. Make it impossible to reintroduce.
--
-- This is the actual fix. Clearing the rows corrects today; the trigger is what
-- stops the next content author doing exactly what Phase 1G did, and it is why
-- the regression assertion can be a statement about the schema rather than a
-- headcount that has to be maintained.
CREATE OR REPLACE FUNCTION public.scp_guard_no_learning_feedback_on_assessment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _mode text;
BEGIN
  IF NEW.learning_feedback_sv IS NULL AND NEW.learning_feedback_en IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT iv.mode INTO _mode
    FROM public.scp_item_versions iv WHERE iv.id = NEW.item_version_id;

  IF _mode = 'assessment' THEN
    RAISE EXCEPTION
      'SCP_LEARNING_FEEDBACK_ON_ASSESSMENT_ITEM: option "%" belongs to an '
      'assessment-mode item. Learning feedback names the preferred response and '
      'may only exist on a separate learning-mode item version.', NEW.option_key
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

COMMENT ON FUNCTION public.scp_guard_no_learning_feedback_on_assessment() IS
  'Assessment Mode content may never carry Learning Mode feedback. Phase 1G '
  'authored exactly that on 60 real options; no payload exposed it, but it was '
  'one convenience field away from being served. NULL mode is permitted -- PR-A '
  'rows predate the Academy and are not assessment content.';

DROP TRIGGER IF EXISTS scp_item_options_no_learning_feedback ON public.scp_item_options;
CREATE TRIGGER scp_item_options_no_learning_feedback
  BEFORE INSERT OR UPDATE ON public.scp_item_options
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_no_learning_feedback_on_assessment();

-- =========================================================================
-- SECTION 2 — The programme-version link
-- =========================================================================
--
-- ── WHAT WENT WRONG ────────────────────────────────────────────────────
--
-- scp_employer_library resolved the programme with:
--
--     LEFT JOIN LATERAL (SELECT ... FROM scp_program_versions
--                         ORDER BY created_at LIMIT 1) pv ON true
--
-- There was no join condition at all. Every row in the library received the
-- SAME programme's purpose and does_not_measure text -- and because the oldest
-- programme version is the real Security Guard one, the library was attributing
-- the real programme's boundary statements to the test fixtures.
--
-- That is worse than a cosmetic mismatch. "Does not measure: personality,
-- suitability for employment" is a claim about a specific programme, and
-- showing it under the wrong one is how an employer ends up believing a
-- boundary applies when it does not.
--
-- ── THE FIX: AN EXPLICIT LINK, NOT A CLEVERER GUESS ────────────────────
--
-- The relationship could be inferred by walking items to behaviours to modules
-- to programmes, but an inferred link is ambiguous the moment two programmes
-- share a behaviour, and it would silently pick one. An assessment version
-- belongs to at most one programme version, so that is modelled directly --
-- mirroring scp_attempts.program_version_id, which already exists.
--
-- Nullable on purpose: an unlinked assessment version returns NULL programme
-- text rather than borrowing somebody else's.

ALTER TABLE public.scp_assessment_versions
  ADD COLUMN IF NOT EXISTS program_version_id uuid
    REFERENCES public.scp_program_versions(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_assessment_versions.program_version_id IS
  'The development programme this assessment version belongs to, if any. '
  'Explicit rather than inferred through the behaviour graph, because an '
  'inferred link becomes ambiguous as soon as two programmes share a behaviour '
  'and would then silently pick one. NULL means "no programme", and the library '
  'shows no programme text rather than another programme''s.';

-- Link the existing content, EXPLICITLY.
--
-- ── WHY NOT INFER IT FROM THE GRAPH ────────────────────────────────────
--
-- The obvious backfill is to walk items to behaviours to modules to
-- programmes and take the best overlap. I wrote that first and it linked the
-- test fixture to the REAL Security Guard programme -- because the fixture
-- items deliberately reuse a real observable behaviour, and the real modules
-- address that behaviour too.
--
-- That is precisely the ambiguity this column exists to remove, so inferring it
-- here would have reintroduced the defect while appearing to fix it. The three
-- known assessment versions are therefore named.
--
-- ── WHY THE IMMUTABILITY TRIGGER COMES OFF FOR THESE STATEMENTS ────────
--
-- scp_guard_published_immutable refuses any column change on a published
-- version, and it is right to. But this is not a content change: the column did
-- not EXIST when these versions were published, so nothing a reviewer approved
-- is being altered. Giving a newly added column its first value is a backfill,
-- and a backfill is the one thing an immutability guard cannot express.
--
-- The guard is disabled for exactly these statements and restored immediately.
-- It is NOT added to the allowlist, so from here on a published version's
-- programme link is frozen like everything else -- link it before publishing.
ALTER TABLE public.scp_assessment_versions DISABLE TRIGGER USER;

-- The real Security Guard baseline belongs to the real Security Guard
-- programme. Both stay draft.
UPDATE public.scp_assessment_versions av
   SET program_version_id = (
     SELECT pv.id FROM public.scp_program_versions pv
       JOIN public.scp_programs p ON p.id = pv.program_id
      WHERE p.slug = 'security-guard-operational-development'
      ORDER BY pv.version_number DESC LIMIT 1)
  FROM public.scp_assessment_definitions d
 WHERE d.id = av.definition_id
   AND d.slug = 'sg-operational-baseline'
   AND av.program_version_id IS NULL;

-- The fixtures belong to the fixture development track.
UPDATE public.scp_assessment_versions av
   SET program_version_id = (
     SELECT pv.id FROM public.scp_program_versions pv
       JOIN public.scp_programs p ON p.id = pv.program_id
      WHERE p.slug = 'fixture-learning-programme'
      ORDER BY pv.version_number DESC LIMIT 1)
  FROM public.scp_assessment_definitions d
 WHERE d.id = av.definition_id
   AND d.slug IN ('fixture-delivery-e2e', 'fixture-learning-e2e')
   AND av.program_version_id IS NULL;

ALTER TABLE public.scp_assessment_versions ENABLE TRIGGER USER;

-- Anything still unlinked is left unlinked deliberately. Guessing here is what
-- created the defect in the first place.

CREATE OR REPLACE FUNCTION public.scp_employer_library(_employer_id uuid)
RETURNS TABLE (
  assessment_version_id uuid,
  definition_slug   text,
  name_sv           text,
  name_en           text,
  content_status    text,
  validation_status text,
  is_test_fixture   boolean,
  assignable        boolean,
  item_count        integer,
  target_minutes_min integer,
  target_minutes_max integer,
  programme_purpose_sv text,
  programme_purpose_en text,
  does_not_measure_sv  text[],
  does_not_measure_en  text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    av.id, d.slug, d.name_sv, d.name_en,
    av.content_status, av.validation_status, d.is_test_fixture,
    (av.content_status = 'published'
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    COALESCE((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    (SELECT min(f.target_minutes_min) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    (SELECT max(f.target_minutes_max) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    -- The matched programme, or nothing at all.
    pv.purpose_sv, pv.purpose_en, pv.does_not_measure_sv, pv.does_not_measure_en
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
  WHERE fam.product_type = 'development_programme'
    AND av.retired_at IS NULL
  ORDER BY (av.content_status = 'published') DESC, d.name_sv;
END; $$;

COMMENT ON FUNCTION public.scp_employer_library(uuid) IS
  'Catalogue metadata for the employer Assessment Library. Programme purpose '
  'and limitations come from the assessment version''s OWN linked programme '
  'version, or are NULL -- never from whichever programme happens to be oldest. '
  'Returns unpublished programmes flagged assignable=false. Never returns a '
  'form, item, option, key or rubric.';

REVOKE ALL     ON FUNCTION public.scp_employer_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_library(uuid) TO authenticated;

-- =========================================================================
-- SECTION 3 — Prove both corrections
-- =========================================================================

DO $$
DECLARE _n int; _sig text;
BEGIN
  -- No assessment-mode option carries learning feedback. Any mode, any status.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   WHERE iv.mode = 'assessment'
     AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_FEEDBACK_REMAINS: % assessment options still carry learning feedback', _n;
  END IF;

  -- Nothing published was modified: every row we cleared was draft.
  SELECT count(*) INTO _n
    FROM public.scp_content_events
   WHERE metadata->>'migration' = '20260810090000_scp_phase2h_staging_corrections'
     AND metadata->>'item_content_status' <> 'draft';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_TOUCHED_PUBLISHED: % non-draft rows were in scope', _n;
  END IF;

  -- Learning items kept theirs -- the correction removed the misplaced copies,
  -- not the feature.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   WHERE iv.mode = 'learning' AND o.learning_feedback_sv IS NOT NULL;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_P2H_LEARNING_FEEDBACK_LOST: learning items have no feedback left';
  END IF;

  -- The library no longer has an unconditional lateral join.
  SELECT pg_get_functiondef((SELECT oid FROM pg_proc
     WHERE proname = 'scp_employer_library' LIMIT 1)) INTO _sig;
  IF _sig ILIKE '%LATERAL%' THEN
    RAISE EXCEPTION 'SCP_P2H_LIBRARY_STILL_LATERAL: the unmatched programme join is still present';
  END IF;

  -- The immutability guard is back on, and program_version_id was NOT added to
  -- its allowlist -- so a published version's link is frozen from here.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'scp_assessment_versions'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'SCP_P2H_TRIGGERS_LEFT_DISABLED on scp_assessment_versions';
  END IF;

  -- The real Security Guard content is still draft and still unassignable.
  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_REAL_CONTENT_PUBLISHED: %', _n;
  END IF;

  -- No review was marked complete by this migration.
  SELECT count(*) INTO _n FROM public.scp_review_requirements WHERE status = 'cleared';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_REVIEW_CLEARED: % review requirements were cleared', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_ai_providers
              WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P2H_AI_ENABLED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2h-corrections', 'updated',
  'Phase 2h: removed Learning Mode feedback from real Security Guard Assessment Mode options (draft only, text preserved in events) and added a trigger making reintroduction impossible; replaced the unconditional programme lateral join with an explicit scp_assessment_versions.program_version_id link, so the library can no longer attribute one programme''s limitations to another.',
  jsonb_build_object(
    'migration', '20260810090000_scp_phase2h_staging_corrections',
    'guard_added', 'scp_guard_no_learning_feedback_on_assessment',
    'column_added', 'scp_assessment_versions.program_version_id',
    'real_content_published', false));
