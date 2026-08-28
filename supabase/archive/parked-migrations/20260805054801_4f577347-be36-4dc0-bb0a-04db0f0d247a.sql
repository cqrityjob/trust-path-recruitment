-- Phase 2h — the two corrections required before staging.

-- =========================================================================
-- SECTION 1 — Learning feedback must not exist on Assessment Mode options
-- =========================================================================

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

-- 1b. Remove it. Draft rows only.
UPDATE public.scp_item_options o
   SET learning_feedback_sv = NULL,
       learning_feedback_en = NULL
  FROM public.scp_item_versions iv
 WHERE iv.id = o.item_version_id
   AND iv.mode = 'assessment'
   AND iv.content_status = 'draft'
   AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);

-- 1c. Make it impossible to reintroduce.
CREATE OR REPLACE FUNCTION public.scp_guard_no_learning_feedback_on_assessment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
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

ALTER TABLE public.scp_assessment_versions
  ADD COLUMN IF NOT EXISTS program_version_id uuid
    REFERENCES public.scp_program_versions(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_assessment_versions.program_version_id IS
  'The development programme this assessment version belongs to, if any. '
  'Explicit rather than inferred through the behaviour graph, because an '
  'inferred link becomes ambiguous as soon as two programmes share a behaviour '
  'and would then silently pick one. NULL means "no programme", and the library '
  'shows no programme text rather than another programme''s.';

-- Backfill a newly added column; the immutability guard cannot express a
-- backfill, so it is disabled for exactly these statements and restored
-- immediately. program_version_id is NOT added to its allowlist.
ALTER TABLE public.scp_assessment_versions DISABLE TRIGGER USER;

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
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   WHERE iv.mode = 'assessment'
     AND (o.learning_feedback_sv IS NOT NULL OR o.learning_feedback_en IS NOT NULL);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_FEEDBACK_REMAINS: % assessment options still carry learning feedback', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_content_events
   WHERE metadata->>'migration' = '20260810090000_scp_phase2h_staging_corrections'
     AND metadata->>'item_content_status' <> 'draft';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_TOUCHED_PUBLISHED: % non-draft rows were in scope', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
   WHERE iv.mode = 'learning' AND o.learning_feedback_sv IS NOT NULL;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SCP_P2H_LEARNING_FEEDBACK_LOST: learning items have no feedback left';
  END IF;

  SELECT pg_get_functiondef((SELECT oid FROM pg_proc
     WHERE proname = 'scp_employer_library' LIMIT 1)) INTO _sig;
  IF _sig ILIKE '%LATERAL%' THEN
    RAISE EXCEPTION 'SCP_P2H_LIBRARY_STILL_LATERAL: the unmatched programme join is still present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'scp_assessment_versions'
       AND NOT t.tgisinternal AND t.tgenabled <> 'D')
  THEN
    RAISE EXCEPTION 'SCP_P2H_TRIGGERS_LEFT_DISABLED on scp_assessment_versions';
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2H_REAL_CONTENT_PUBLISHED: %', _n;
  END IF;

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