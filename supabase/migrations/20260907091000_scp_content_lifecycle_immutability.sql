-- Evidence-based content immutability.
--
-- ── WHAT ALREADY WORKED ─────────────────────────────────────────────────────
--
-- scp_guard_published_immutable (A3) freezes a version row once content_status
-- leaves draft/in_review, and scp_guard_child_of_published extends that to the
-- item's texts, options, option texts, form membership and profession map.
-- That is the right rule and it is left exactly as it is.
--
-- ── THE GAP ─────────────────────────────────────────────────────────────────
--
-- Both guards key on content_status alone. content_status is an EDITORIAL
-- state a person sets. Nothing tied immutability to whether the content had
-- actually been used to produce evidence about a real person. Two ways that
-- bites:
--
--   * content_status can be moved back. 'suspended' and 'retired' are frozen,
--     but the vocabulary permits an author to write 'draft' onto a version
--     that has already been run, and everything downstream then becomes
--     editable again.
--   * a version can carry real attempts while still reading 'draft'. That is
--     exactly what the closed-test grant mechanism (20260818162445) exists to
--     allow, and it is correct for internal testing -- but it means "draft"
--     cannot by itself mean "nobody has been assessed with this".
--
-- ── THE RULE THIS ADDS ──────────────────────────────────────────────────────
--
--   DESIGN / INTERNAL CLOSED TEST   -> mutable
--   REAL EXTERNAL PILOT OR LATER    -> immutable, whatever content_status says
--
-- "Real" is read off the attempts themselves, not off a label somebody can
-- edit: an attempt whose governance_mode is 'recruitment', or whose recorded
-- validation_status_at_assignment was 'pilot' or beyond, is evidence about a
-- person that somebody may act on. From that moment the wording, the options,
-- the scoring keys, the rubric and the item membership of that assessment
-- version are frozen and a new version is required.
--
-- Attempts in 'development' or 'closed_test' governance do not freeze
-- anything. That is deliberate and is what makes the current repair possible:
-- the flagship is internal closed-test content and the owner is entitled to
-- rebuild it in place.
--
-- Deliberately NOT built: version branching, content lineage copying, or a
-- migration path for frozen content. Those are real needs when the first real
-- pilot happens; today there is no pilot evidence anywhere, and building the
-- machinery for it now would be building against a guess.
--
-- Reversible: drop the three triggers and the two functions this file adds.
-- Every guard that existed before is untouched.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Has this assessment version produced real evidence?
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_version_has_operational_evidence(_assessment_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_attempts a
      JOIN public.scp_forms f ON f.id = a.form_id
     WHERE (a.assessment_version_id = _assessment_version_id
            OR f.assessment_version_id = _assessment_version_id)
       -- An abandoned attempt produced nothing and is not evidence.
       AND a.status <> 'abandoned'
       AND (
         -- Assessing somebody for a real recruitment decision.
         a.governance_mode = 'recruitment'
         -- ...or run while the content was already declared past design.
         OR a.validation_status_at_assignment IN ('pilot', 'operational-development',
                                                  'operational-selection', 'operational')
       )
  );
$$;

COMMENT ON FUNCTION public.scp_version_has_operational_evidence(uuid) IS
  'True once an assessment version has produced evidence somebody may act on: '
  'an attempt in recruitment governance, or one run against content already '
  'declared pilot or operational. Internal development and closed-test '
  'attempts deliberately do NOT count -- draft content stays iterable.';

REVOKE ALL     ON FUNCTION public.scp_version_has_operational_evidence(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_version_has_operational_evidence(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The guard
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One trigger function for every table, resolving each row back to the
-- assessment version that owns it. Deliberately mirrors the shape of
-- scp_guard_child_of_published rather than inventing a second dispatch style.

CREATE OR REPLACE FUNCTION public.scp_guard_evidenced_content_frozen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _row record;
  _item_version_id uuid;
  _versions uuid[];
  _v uuid;
BEGIN
  _row := COALESCE(NEW, OLD);

  -- Resolve the owning item version, where there is one.
  IF TG_TABLE_NAME IN ('scp_item_versions') THEN
    _item_version_id := _row.id;
  ELSIF TG_TABLE_NAME IN ('scp_item_texts', 'scp_item_options') THEN
    _item_version_id := _row.item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_item_option_texts' THEN
    SELECT o.item_version_id INTO _item_version_id
      FROM public.scp_item_options o WHERE o.id = _row.item_option_id;
  END IF;

  IF TG_TABLE_NAME = 'scp_form_items' THEN
    -- Item membership belongs to exactly one version, via the form.
    SELECT array_agg(f.assessment_version_id) INTO _versions
      FROM public.scp_forms f WHERE f.id = _row.form_id;
  ELSE
    -- An item version can sit on more than one form, so every assessment
    -- version that uses it is asked.
    SELECT array_agg(DISTINCT f.assessment_version_id) INTO _versions
      FROM public.scp_form_items fi
      JOIN public.scp_forms f ON f.id = fi.form_id
     WHERE fi.item_version_id = _item_version_id;
  END IF;

  IF _versions IS NULL THEN
    -- Not on any form yet: it cannot have produced evidence.
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOREACH _v IN ARRAY _versions LOOP
    IF _v IS NOT NULL AND public.scp_version_has_operational_evidence(_v) THEN
      RAISE EXCEPTION
        'SCP_EVIDENCED_CONTENT_FROZEN: % cannot be modified because assessment '
        'version % has already produced pilot or operational evidence. Item '
        'wording, options, scoring keys, rubrics and item membership are fixed '
        'from that point. Create a new assessment version instead.',
        TG_TABLE_NAME, _v
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $$;

COMMENT ON FUNCTION public.scp_guard_evidenced_content_frozen() IS
  'Refuses edits to content whose assessment version has produced real pilot '
  'or operational evidence, independently of content_status.';

REVOKE ALL ON FUNCTION public.scp_guard_evidenced_content_frozen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_item_versions_evidence_frozen     ON public.scp_item_versions;
DROP TRIGGER IF EXISTS scp_item_texts_evidence_frozen        ON public.scp_item_texts;
DROP TRIGGER IF EXISTS scp_item_options_evidence_frozen      ON public.scp_item_options;
DROP TRIGGER IF EXISTS scp_item_option_texts_evidence_frozen ON public.scp_item_option_texts;
DROP TRIGGER IF EXISTS scp_form_items_evidence_frozen        ON public.scp_form_items;

-- UPDATE and DELETE only. An INSERT adds something new; it does not rewrite
-- what a candidate was actually shown. Adding an option to an evidenced item
-- would change the item, so scp_item_options is guarded on INSERT too.
CREATE TRIGGER scp_item_versions_evidence_frozen
  BEFORE UPDATE OR DELETE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidenced_content_frozen();
CREATE TRIGGER scp_item_texts_evidence_frozen
  BEFORE UPDATE OR DELETE ON public.scp_item_texts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidenced_content_frozen();
CREATE TRIGGER scp_item_options_evidence_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_options
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidenced_content_frozen();
CREATE TRIGGER scp_item_option_texts_evidence_frozen
  BEFORE UPDATE OR DELETE ON public.scp_item_option_texts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidenced_content_frozen();
CREATE TRIGGER scp_form_items_evidence_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_form_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidenced_content_frozen();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Rubrics
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A rubric is not reachable from a form, so it gets the simpler rule: once a
-- rubric version is published it is already frozen by scp_guard_published_immutable
-- on its own table. What was missing is its DIMENSIONS and LEVELS, which are
-- what a reviewer actually scores against.

CREATE OR REPLACE FUNCTION public.scp_guard_rubric_detail_frozen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _row record; _rv uuid; _status text;
BEGIN
  _row := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME = 'scp_rubric_dimensions' THEN
    _rv := _row.rubric_version_id;
  ELSE
    SELECT d.rubric_version_id INTO _rv
      FROM public.scp_rubric_dimensions d WHERE d.id = _row.rubric_dimension_id;
  END IF;

  SELECT content_status INTO _status
    FROM public.scp_rubric_versions WHERE id = _rv;

  IF _status IS NOT NULL AND _status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'SCP_PUBLISHED_IMMUTABLE: % cannot be modified because its rubric version '
      'is "%". A reviewer has already scored against it. Create a new rubric '
      'version instead.', TG_TABLE_NAME, _status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.scp_guard_rubric_detail_frozen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_rubric_dimensions_immutable ON public.scp_rubric_dimensions;
DROP TRIGGER IF EXISTS scp_rubric_levels_immutable     ON public.scp_rubric_levels;
CREATE TRIGGER scp_rubric_dimensions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_rubric_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_rubric_detail_frozen();
CREATE TRIGGER scp_rubric_levels_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_rubric_levels
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_rubric_detail_frozen();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'scp_guard_evidenced_content_frozen';
  IF _n <> 5 THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_GUARD_COVERAGE: expected 5 evidence-freeze '
      'triggers (item versions, texts, options, option texts, form items), found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'scp_guard_rubric_detail_frozen';
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_RUBRIC_DETAIL_GUARD_COVERAGE: expected 2, found %', _n;
  END IF;

  -- Today no version anywhere carries operational evidence, which is why the
  -- flagship can still be repaired in place. If this ever fails, the repair
  -- migration that follows must NOT be re-run against that database.
  IF EXISTS (
    SELECT 1 FROM public.scp_assessment_versions av
     WHERE public.scp_version_has_operational_evidence(av.id)
  ) THEN
    RAISE WARNING 'SCP_LIFECYCLE_EVIDENCE_PRESENT: at least one assessment '
      'version already carries pilot/operational evidence and is now frozen.';
  END IF;

  -- The guards that existed before are untouched.
  SELECT count(DISTINCT c.relname) INTO _n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'scp_guard_child_of_published';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_REGRESSION: scp_guard_child_of_published now '
      'covers % tables, expected 6. The pre-existing publication guard must not '
      'have been weakened.', _n;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-content-lifecycle-immutability', 'created',
  'Content whose assessment version has produced real pilot or operational '
  'evidence is frozen independently of content_status. Development and '
  'closed-test attempts do not freeze anything, so draft content stays iterable.',
  jsonb_build_object(
    'migration', '20260907091000_scp_content_lifecycle_immutability',
    'mutable_while', jsonb_build_array('development', 'closed_test'),
    'frozen_from', jsonb_build_array('recruitment governance', 'pilot', 'operational'))
);
