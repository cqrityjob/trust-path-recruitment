-- Option-order proof scope, step 1 of 3 (driven by scripts/db-test.sh).
--
-- Builds, and COMMITS, a valid historical twin of the Väktare form: a second
-- assessment definition and version of its own, carrying a form with the SAME
-- slug and the same 50 items. The domain allows this (forms are unique per
-- (assessment_version_id, slug)); production has exactly this shape after the
-- retired project's data restore. The migration's proof must resolve the
-- live form through its version and ignore this one. Step 3 removes it.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE live AS
SELECT d.id AS def_id, d.family_id, d.profession_id, d.purpose, d.designed_for,
       av.id AS ver_id, av.program_version_id, f.id AS form_id
  FROM public.scp_assessment_definitions d
  JOIN public.scp_assessment_versions av ON av.definition_id = d.id AND av.version_number = 1
  JOIN public.scp_forms f ON f.assessment_version_id = av.id
                         AND f.slug = 'security-officer-recruitment-form-a'
 WHERE d.slug = 'security-officer-recruitment';

DO $$ BEGIN
  IF (SELECT count(*) FROM live) <> 1 THEN
    RAISE EXCEPTION 'SETUP: the live Väktare form did not resolve to exactly one row';
  END IF;
END $$;

INSERT INTO public.scp_assessment_definitions
  (id, family_id, profession_id, slug, name_sv, name_en, purpose, is_test_fixture,
   designed_for, standard_for_recruitment)
SELECT 'fe000000-0000-0000-0000-00000000d0d0'::uuid, family_id, profession_id,
       'security-officer-recruitment-historical-twin',
       'Väktare rekrytering (historisk tvilling)', 'Security officer recruitment (historical twin)',
       purpose, true, designed_for, false
  FROM live;

INSERT INTO public.scp_assessment_versions
  (id, definition_id, version_number, content_status, validation_status, language_scope,
   program_version_id, notes)
SELECT 'fe000000-0000-0000-0000-00000000a0a0'::uuid, 'fe000000-0000-0000-0000-00000000d0d0'::uuid,
       1, 'draft', 'design', ARRAY['sv-SE','en-GB'], program_version_id,
       'Test fixture: a historical assessment version whose form shares the Väktare slug.'
  FROM live;

INSERT INTO public.scp_forms
  (id, assessment_version_id, slug, name_sv, name_en, target_minutes_min, target_minutes_max,
   randomise_within_block)
VALUES ('fe000000-0000-0000-0000-00000000f0f0'::uuid, 'fe000000-0000-0000-0000-00000000a0a0'::uuid,
        'security-officer-recruitment-form-a',
        'Väktare rekrytering A (historisk tvilling)', 'Security officer recruitment A (historical twin)',
        35, 45, false);

-- The same 50 item versions, same sections, same flags: a faithful twin.
INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
SELECT 'fe000000-0000-0000-0000-00000000f0f0'::uuid, fi.item_version_id, fi.block_key,
       fi.display_order, fi.randomise_options
  FROM public.scp_form_items fi WHERE fi.form_id = (SELECT form_id FROM live);

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _n <> 2 THEN RAISE EXCEPTION 'SETUP: expected two forms with the Väktare slug, found %', _n; END IF;
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id = fi.form_id WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _n <> 100 THEN RAISE EXCEPTION 'SETUP: expected 100 items across the two forms, found %', _n; END IF;
  RAISE NOTICE 'setup: two assessment versions now carry a form with the Väktare slug, 50 items each (100 by slug)';
END $$;

COMMIT;
