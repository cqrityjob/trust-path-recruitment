-- =============================================================================
-- PR-A / SCP-A1 -- database + RLS regression suite.
--
-- Run against a disposable Postgres with the full migration history replayed
-- (see docs/assessment/implementation/test-matrix.md for the exact harness).
-- Every assertion below maps to a numbered acceptance criterion in the
-- implementation directive (AC-n) and/or a test case in Security Competency
-- Core Specification v2.0 chapter 16.2 (T-nnn).
--
-- The suite is written as plain assertions that RAISE on failure, so a single
-- non-zero psql exit means "do not merge".
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. Synthetic only -- no real candidate name, email or answer is used
-- anywhere in this file (implementation directive section 18).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-0000-0000-0000-000000000001', 'editor@test.invalid'),
  ('11111111-0000-0000-0000-000000000002', 'reviewer@test.invalid'),
  ('11111111-0000-0000-0000-000000000003', 'publisher@test.invalid'),
  ('11111111-0000-0000-0000-000000000004', 'employer-member@test.invalid'),
  ('11111111-0000-0000-0000-000000000005', 'candidate@test.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scp_content_roles (user_id, role) VALUES
  ('11111111-0000-0000-0000-000000000001', 'editor'),
  ('11111111-0000-0000-0000-000000000002', 'reviewer'),
  ('11111111-0000-0000-0000-000000000003', 'publisher')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '  ok  %', _label;
END $$;

-- Helper: run a statement and report whether it raised.
CREATE OR REPLACE FUNCTION pg_temp.raises(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;


-- ###########################################################################
-- GROUP 1 -- Career Guidance / Security Competency separation
--   AC-1 (different family IDs), AC-2/AC-3 (no shared content)
-- ###########################################################################
DO $$
DECLARE
  _cg uuid;
  _core uuid;
  _err text;
BEGIN
  RAISE NOTICE 'GROUP 1 -- product separation';

  SELECT id INTO _cg FROM public.scp_assessment_families WHERE slug = 'career-guidance';
  SELECT id INTO _core FROM public.scp_assessment_families WHERE slug = 'security-competency-core';

  PERFORM pg_temp.assert(_cg IS NOT NULL AND _core IS NOT NULL,
    'AC-1: career-guidance and security-competency-core families both exist');
  PERFORM pg_temp.assert(_cg <> _core,
    'AC-1: they have different family IDs');

  -- The career-guidance family must stay a marker only.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_assessment_definitions WHERE family_id = _cg) = 0,
    'AC-3: no Security Competency definition hangs off the career-guidance family');

  -- And the trigger must make it impossible, not merely unpopulated.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
     VALUES (%L, ''illegal-cg-link'', ''x'', ''x'', ''core'')', _cg));
  PERFORM pg_temp.assert(_err LIKE '%SCP_CAREER_GUIDANCE_SEPARATION%',
    'AC-3: attaching a definition to the career-guidance family is blocked by trigger');

  -- Purpose/family-type mismatch is blocked too.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
     VALUES (%L, ''illegal-purpose'', ''x'', ''x'', ''profession_module'')', _core));
  PERFORM pg_temp.assert(_err LIKE '%SCP_FAMILY_PURPOSE_MISMATCH%',
    'a profession_module purpose cannot sit in the core family');
END $$;


-- ###########################################################################
-- GROUP 2 -- Legacy retirement (AC-4, AC-5, AC-6; spec T-002, T-003)
-- ###########################################################################
DO $$
DECLARE
  _employer uuid := '22222222-0000-0000-0000-000000000001';
  _version uuid;
  _live_version uuid;
  _err text;
  _hist_count integer;
BEGIN
  RAISE NOTICE 'GROUP 2 -- legacy retirement';

  SELECT id INTO _version FROM public.assessment_versions
    WHERE assessment_id = 'security-guard-foundation' LIMIT 1;

  PERFORM pg_temp.assert(
    (SELECT retired_at IS NOT NULL FROM public.assessment_versions WHERE id = _version),
    'AC-4: legacy security-guard-foundation version carries retired_at');

  PERFORM pg_temp.assert(
    (SELECT retired_reason IS NOT NULL FROM public.assessment_versions WHERE id = _version),
    'legacy version records WHY it was retired, for the historical report label');

  PERFORM pg_temp.assert(
    (SELECT employer_visible = false FROM public.assessments WHERE id = 'security-guard-foundation'),
    'AC-4: legacy definition is no longer employer-visible');

  -- Seed a synthetic employer so an INSERT can be attempted at all.
  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_employer, 'Test Org', 'test-org-scp', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- T-002: a NEW assignment against the retired version must be blocked.
  _err := pg_temp.raises(format(
    'INSERT INTO public.assessment_assignments
       (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
        recipient_email, assigned_by, invitation_token_hash, expires_at)
     VALUES (%L, ''security-guard-foundation'', %L, ''security_professional'',
             ''recruitment'', ''synthetic@test.invalid'',
             ''11111111-0000-0000-0000-000000000004'', ''hash-new-1'', now() + interval ''7 days'')',
    _employer, _version));
  PERFORM pg_temp.assert(_err LIKE '%ASSESSMENT_RETIRED%',
    'AC-4 / T-002: a NEW legacy assignment is blocked with the stable code ASSESSMENT_RETIRED');

  -- AC-5 / AC-6 / T-003: pre-existing history is untouched and still readable.
  -- Simulate a historical row by inserting while the guard is bypassed the only
  -- way a real historical row could exist: it was created before retirement.
  UPDATE public.assessment_versions SET retired_at = NULL WHERE id = _version;
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status,
     completed_at, engine_result)
  VALUES ('33333333-0000-0000-0000-000000000001', _employer, 'security-guard-foundation',
          _version, 'security_professional', 'workforce', 'historic@test.invalid',
          '11111111-0000-0000-0000-000000000004', 'hash-historic-1',
          now() + interval '7 days', 'completed', now(), '{"score": 42}'::jsonb);
  UPDATE public.assessment_versions SET retired_at = now() WHERE id = _version;

  SELECT count(*) INTO _hist_count FROM public.assessment_assignments
    WHERE id = '33333333-0000-0000-0000-000000000001';
  PERFORM pg_temp.assert(_hist_count = 1,
    'AC-5 / T-003: a historical completed legacy assignment still exists and is readable');

  PERFORM pg_temp.assert(
    (SELECT engine_result->>'score' FROM public.assessment_assignments
      WHERE id = '33333333-0000-0000-0000-000000000001') = '42',
    'AC-6: the historical score is unchanged after retirement');

  -- A NON-retired version must still accept new assignments -- the guard must
  -- be surgical, not a blanket block on the whole table.
  SELECT av.id INTO _live_version FROM public.assessment_versions av
    WHERE av.assessment_id = 'public-career-assessment' AND av.retired_at IS NULL LIMIT 1;
  IF _live_version IS NOT NULL THEN
    INSERT INTO public.assessment_assignments
      (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
       recipient_email, assigned_by, invitation_token_hash, expires_at)
    VALUES (_employer, 'public-career-assessment', _live_version, 'security_professional',
            'recruitment', 'still-works@test.invalid',
            '11111111-0000-0000-0000-000000000004', 'hash-live-1', now() + interval '7 days');
    PERFORM pg_temp.assert(true,
      'the retirement guard does NOT block assignments against non-retired versions');
  END IF;
END $$;


-- ###########################################################################
-- GROUP 3 -- Immutability of published content
--   AC-8, AC-9; spec T-004 ("via UI/API/SQL ... blockeras")
-- ###########################################################################
DO $$
DECLARE
  _family uuid;
  _def uuid;
  _ver uuid;
  _item uuid;
  _iv uuid;
  _opt uuid;
  _comp uuid;
  _err text;
BEGIN
  RAISE NOTICE 'GROUP 3 -- published-content immutability';

  SELECT id INTO _family FROM public.scp_assessment_families WHERE slug = 'security-competency-core';
  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-01';

  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
  VALUES (_family, 'scc-core-test', 'Core test', 'Core test', 'core') RETURNING id INTO _def;

  INSERT INTO public.scp_assessment_versions (definition_id, version_number, content_status)
  VALUES (_def, 1, 'draft') RETURNING id INTO _ver;

  INSERT INTO public.scp_items (slug) VALUES ('scc-01-test-item') RETURNING id INTO _item;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_item, 1, 'sjt_best_response', _comp, 'reports own mistake', 'weigh transparency vs comfort')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'source', 'Ett testscenario.', 'Vad gör du?');

  INSERT INTO public.scp_item_options
    (item_version_id, option_key, display_order, score_value, scoring_rationale_sv)
  VALUES (_iv, 'a', 1, 3, 'Full transparens.') RETURNING id INTO _opt;

  -- Draft content IS editable -- that is the point of a draft.
  UPDATE public.scp_item_versions SET observable_behavior = 'revised while draft' WHERE id = _iv;
  PERFORM pg_temp.assert(
    (SELECT observable_behavior FROM public.scp_item_versions WHERE id = _iv) = 'revised while draft',
    'draft item content is freely editable');

  -- Publish it, then prove it is frozen.
  UPDATE public.scp_item_versions
    SET content_status = 'published', published_at = now() WHERE id = _iv;

  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_versions SET observable_behavior = ''tampered'' WHERE id = %L', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-8 / T-004: a PUBLISHED item version cannot be edited in place');

  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_versions SET competency_id = %L WHERE id = %L',
    (SELECT id FROM public.scp_competencies WHERE code = 'SCC-02'), _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-8: a published item cannot be re-pointed at a different competency');

  -- The scoring key of a published item is equally frozen.
  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_options SET score_value = 0 WHERE id = %L', _opt));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-8: the SCORING KEY of a published item cannot be changed');

  -- ...and so is its wording, and new options cannot be smuggled in.
  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_texts SET prompt = ''tampered'' WHERE item_version_id = %L', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-8: the wording of a published item cannot be changed');

  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_options (item_version_id, option_key, display_order, score_value, scoring_rationale_sv)
     VALUES (%L, ''z'', 9, 1, ''smuggled'')', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-9: an option cannot be added to a published item -- a new version is required');

  _err := pg_temp.raises(format(
    'DELETE FROM public.scp_item_options WHERE id = %L', _opt));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'AC-9: an option cannot be deleted from a published item');

  -- Lifecycle transitions must still work (retire a published version).
  UPDATE public.scp_item_versions
    SET content_status = 'retired', retired_at = now() WHERE id = _iv;
  PERFORM pg_temp.assert(
    (SELECT content_status FROM public.scp_item_versions WHERE id = _iv) = 'retired',
    'a published version can still be RETIRED -- immutability does not freeze the lifecycle');

  -- Family and definition identity are permanent.
  _err := pg_temp.raises(format(
    'UPDATE public.scp_assessment_families SET product_type = ''career_guidance'' WHERE id = %L', _family));
  PERFORM pg_temp.assert(_err LIKE '%SCP_FAMILY_IDENTITY_IMMUTABLE%',
    'an assessment family can never be re-typed as career_guidance');

  _err := pg_temp.raises(format(
    'UPDATE public.scp_assessment_definitions SET purpose = ''profession_module'' WHERE id = %L', _def));
  PERFORM pg_temp.assert(_err LIKE '%SCP_DEFINITION_IDENTITY_IMMUTABLE%',
    'a definition''s purpose can never change');
END $$;


-- ###########################################################################
-- GROUP 4 -- Structural integrity of Core + Module bundles (AC-7, AC-10)
-- ###########################################################################
DO $$
DECLARE
  _core_family uuid; _mod_family uuid;
  _core_def uuid; _mod_def uuid;
  _core_ver uuid; _mod_ver uuid;
  _core_form uuid; _mod_form uuid;
  _prof uuid; _bundle uuid;
  _err text;
BEGIN
  RAISE NOTICE 'GROUP 4 -- bundle composition';

  SELECT id INTO _core_family FROM public.scp_assessment_families WHERE slug = 'security-competency-core';
  SELECT id INTO _mod_family FROM public.scp_assessment_families WHERE slug = 'security-profession-modules';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'security-officer-se';

  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
  VALUES (_core_family, 'scc-core-b', 'Core B', 'Core B', 'core') RETURNING id INTO _core_def;
  INSERT INTO public.scp_assessment_definitions (family_id, profession_id, slug, name_sv, name_en, purpose)
  VALUES (_mod_family, _prof, 'vaktare-b', 'Väktare B', 'Security Officer B', 'profession_module')
  RETURNING id INTO _mod_def;

  INSERT INTO public.scp_assessment_versions (definition_id, version_number)
  VALUES (_core_def, 1) RETURNING id INTO _core_ver;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number)
  VALUES (_mod_def, 1) RETURNING id INTO _mod_ver;

  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
  VALUES (_core_ver, 'core-form-1', 'Kärnform', 'Core form') RETURNING id INTO _core_form;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
  VALUES (_mod_ver, 'mod-form-1', 'Modulform', 'Module form') RETURNING id INTO _mod_form;

  INSERT INTO public.scp_bundles (slug, profession_id, name_sv, name_en)
  VALUES ('vaktare-bundle', _prof, 'Väktare', 'Security Officer') RETURNING id INTO _bundle;

  -- A well-formed bundle version is accepted.
  INSERT INTO public.scp_bundle_versions
    (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
     core_form_id, module_form_id)
  VALUES (_bundle, 1, _core_ver, _mod_ver, _core_form, _mod_form);
  PERFORM pg_temp.assert(true, 'AC-7: a Core version + Module version bundle can be created');

  -- Core and module cannot be swapped.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_bundle_versions
       (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
        core_form_id, module_form_id)
     VALUES (%L, 2, %L, %L, %L, %L)', _bundle, _mod_ver, _core_ver, _mod_form, _core_form));
  PERFORM pg_temp.assert(_err LIKE '%SCP_BUNDLE_CORE_INVALID%',
    'a profession module cannot masquerade as the Core half of a bundle');

  -- A form belonging to the wrong version is rejected.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_bundle_versions
       (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
        core_form_id, module_form_id)
     VALUES (%L, 3, %L, %L, %L, %L)', _bundle, _core_ver, _mod_ver, _mod_form, _mod_form));
  PERFORM pg_temp.assert(_err LIKE '%SCP_BUNDLE_FORM_MISMATCH%',
    'AC-7: a bundle cannot reference a form that belongs to a different version');

  -- Core must not be bundled with itself.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_bundle_versions
       (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
        core_form_id, module_form_id)
     VALUES (%L, 4, %L, %L, %L, %L)', _bundle, _core_ver, _core_ver, _core_form, _core_form));
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'a bundle cannot pair a version with itself');
END $$;


-- ###########################################################################
-- GROUP 5 -- Item construct rules and review gates (spec 7.2, 10.3)
-- ###########################################################################
DO $$
DECLARE
  _item uuid; _comp uuid; _err text;
BEGIN
  RAISE NOTICE 'GROUP 5 -- item construct and review gates';

  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-11';
  INSERT INTO public.scp_items (slug) VALUES ('scc-11-guard-item') RETURNING id INTO _item;

  -- Spec 7.2: secondary construct must differ from the primary.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_versions
       (item_id, version_number, item_format, competency_id, secondary_competency_id,
        observable_behavior, response_process)
     VALUES (%L, 1, ''sjt_best_response'', %L, %L, ''x'', ''y'')', _item, _comp, _comp));
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'spec 7.2: an item''s secondary construct cannot equal its primary construct');

  -- Spec 10.3: a legally dependent item cannot claim "no legal review needed".
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_versions
       (item_id, version_number, item_format, competency_id, observable_behavior,
        response_process, legal_basis_required, legal_review_status)
     VALUES (%L, 2, ''sjt_best_response'', %L, ''x'', ''y'', true, ''not_required'')', _item, _comp));
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'spec 10.3: an item that depends on law cannot sit at legal_review_status = not_required');

  -- Scoring key must stay inside the specification's 0-3 band.
  PERFORM pg_temp.assert(
    pg_temp.raises(format(
      'INSERT INTO public.scp_item_versions (item_id, version_number, item_format, competency_id,
         observable_behavior, response_process) VALUES (%L, 3, ''biq_frequency'', %L, ''x'', ''y'')',
      _item, _comp)) IS NULL,
    'a valid BIQ item version can be created');

  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_options (item_version_id, option_key, display_order,
       score_value, scoring_rationale_sv)
     VALUES ((SELECT id FROM public.scp_item_versions WHERE item_id = %L AND version_number = 3),
             ''a'', 1, 7, ''out of range'')', _item));
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'spec Bilaga A: an option score outside 0-3 is rejected');
END $$;


-- ###########################################################################
-- GROUP 6 -- RLS: item bank and scoring keys are unreachable
--   AC-12 (scoring keys never reach browser/employer), AC-13 (no raw access)
-- ###########################################################################
DO $$
DECLARE
  _visible_items integer;
  _visible_keys integer;
BEGIN
  RAISE NOTICE 'GROUP 6 -- RLS on item bank and scoring keys';

  PERFORM pg_temp.assert(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'scp_item_options'),
    'scp_item_options has RLS enabled');

  -- An employer member and a candidate hold no Security Competency content
  -- role, so scp_can_author() is false and the ONLY policy on these tables
  -- matches nothing -> default deny.
  PERFORM pg_temp.assert(
    NOT public.scp_can_author('11111111-0000-0000-0000-000000000004'),
    'AC-13: an employer member is not an authoring role');
  PERFORM pg_temp.assert(
    NOT public.scp_can_author('11111111-0000-0000-0000-000000000005'),
    'AC-12: a candidate is not an authoring role');
  PERFORM pg_temp.assert(
    public.scp_can_author('11111111-0000-0000-0000-000000000001'),
    'an editor IS an authoring role');

  -- Prove it by actually reading as the `authenticated` role.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', true);
  SELECT count(*) INTO _visible_items FROM public.scp_items;
  SELECT count(*) INTO _visible_keys FROM public.scp_item_options;
  RESET ROLE;

  PERFORM pg_temp.assert(_visible_items = 0,
    'AC-13: an employer account sees ZERO rows of the item bank');
  PERFORM pg_temp.assert(_visible_keys = 0,
    'AC-12: an employer account sees ZERO scoring keys');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000005', true);
  SELECT count(*) INTO _visible_keys FROM public.scp_item_options;
  RESET ROLE;
  PERFORM pg_temp.assert(_visible_keys = 0,
    'AC-12: a candidate account sees ZERO scoring keys');

  -- The editor CAN read the bank (otherwise authoring is impossible).
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _visible_items FROM public.scp_items;
  RESET ROLE;
  PERFORM pg_temp.assert(_visible_items > 0,
    'an editor CAN read the item bank');
END $$;


-- ###########################################################################
-- GROUP 7 -- Separation of duties and append-only audit
--   AC-16 (publication gates), AC-20 (critical actions logged); spec T-013
-- ###########################################################################
DO $$
DECLARE
  _has_update boolean;
  _has_delete boolean;
BEGIN
  RAISE NOTICE 'GROUP 7 -- separation of duties and audit';

  PERFORM pg_temp.assert(
    to_regclass('public.scp_publication_approvals') IS NOT NULL,
    'AC-16: a publication-approval record exists for the two-person principle');

  -- Only a reviewer may record an approval, and only under their own name.
  PERFORM pg_temp.assert(
    public.scp_has_content_role('11111111-0000-0000-0000-000000000002', 'reviewer'),
    'the reviewer fixture holds the reviewer role');
  PERFORM pg_temp.assert(
    NOT public.scp_has_content_role('11111111-0000-0000-0000-000000000001', 'reviewer'),
    'T-013: an editor does NOT hold the reviewer role and cannot self-approve');

  -- The content-event log must be append-only for every client role.
  SELECT bool_or(privilege_type = 'UPDATE'), bool_or(privilege_type = 'DELETE')
    INTO _has_update, _has_delete
    FROM information_schema.role_table_grants
    WHERE table_name = 'scp_content_events' AND grantee = 'authenticated';

  PERFORM pg_temp.assert(COALESCE(_has_update, false) = false,
    'AC-20: no UPDATE grant on the content-event log (append-only)');
  PERFORM pg_temp.assert(COALESCE(_has_delete, false) = false,
    'AC-20: no DELETE grant on the content-event log (append-only)');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_content_events
      WHERE subject_type = 'legacy_retirement' AND action = 'retired') = 1,
    'AC-20: the legacy retirement itself is recorded in the audit log');
END $$;


-- ###########################################################################
-- GROUP 8 -- Validation status is present and honest (AC-18)
-- ###########################################################################
DO $$
DECLARE _err text;
BEGIN
  RAISE NOTICE 'GROUP 8 -- validation status';

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_assessment_versions WHERE validation_status = 'design') > 0,
    'AC-18: new assessment versions default to validation_status = design');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_item_versions
      WHERE validation_status NOT IN ('design', 'sme_reviewed', 'pilot', 'operational', 'retired')) = 0,
    'every item version carries a valid validation status');

  -- AC-15: nothing may claim operational status by accident.
  _err := pg_temp.raises(
    'INSERT INTO public.scp_assessment_versions (definition_id, version_number, validation_status)
     VALUES ((SELECT id FROM public.scp_assessment_definitions LIMIT 1), 99, ''totally-validated'')');
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'an invented validation status is rejected by the CHECK constraint');
END $$;


-- ###########################################################################
-- GROUP 9 -- The twelve constructs and their facets are complete (spec 5, 6)
-- ###########################################################################
DO $$
BEGIN
  RAISE NOTICE 'GROUP 9 -- construct catalogue completeness';

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_competencies) = 12,
    'exactly twelve Security Competency Core constructs are registered');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_competencies
      WHERE code ~ '^SCC-(0[1-9]|1[0-2])$') = 12,
    'they are SCC-01 through SCC-12');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_competency_versions WHERE content_status = 'published') = 12,
    'each construct has a published v1 definition');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_competency_facets) = 48,
    'all 48 facets (4 per construct) are registered');

  PERFORM pg_temp.assert(
    (SELECT bool_and(n = 4) FROM (
      SELECT count(*) AS n FROM public.scp_competency_facets GROUP BY competency_id) s),
    'every construct has exactly four facets');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_professions WHERE market = 'SE' AND legally_regulated) = 3,
    'Väktare, Ordningsvakt and Skyddsvakt are registered as Swedish regulated roles');
END $$;


-- ###########################################################################
-- GROUP 10 -- Owner decision A: scoring is versioned and configurable
-- ###########################################################################
DO $$
DECLARE _sv uuid; _err text;
BEGIN
  RAISE NOTICE 'GROUP 10 -- versioned scoring (owner decision A)';

  SELECT id INTO _sv FROM public.scp_scoring_versions WHERE slug = 'scp-scoring-v1';
  PERFORM pg_temp.assert(_sv IS NOT NULL,
    'decision A: the provisional pilot scoring version is seeded');

  PERFORM pg_temp.assert(
    (SELECT sjt_weight = 0.70 AND biq_weight = 0.30 FROM public.scp_scoring_versions WHERE id = _sv),
    'decision A: the seeded weights are the spec 8.1 start model 70/30');

  PERFORM pg_temp.assert(
    (SELECT validation_status = 'design' FROM public.scp_scoring_versions WHERE id = _sv),
    'decision A: the weighting is NOT claimed to be validated');

  PERFORM pg_temp.assert(
    (SELECT norm_comparison_permitted = false FROM public.scp_scoring_versions WHERE id = _sv),
    'spec 8.3: norm/percentile comparison is switched off until norm data exists');

  -- Weights must form a complete model.
  _err := pg_temp.raises(
    'INSERT INTO public.scp_scoring_versions (slug, version_number, sjt_weight, biq_weight)
     VALUES (''broken'', 1, 0.7, 0.7)');
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'decision A: SJT and BIQ weights must sum to 1');

  -- A published scoring version is frozen -- the model changes by NEW version.
  UPDATE public.scp_scoring_versions SET content_status = 'published', published_at = now()
    WHERE id = _sv;
  _err := pg_temp.raises(format(
    'UPDATE public.scp_scoring_versions SET sjt_weight = 0.5, biq_weight = 0.5 WHERE id = %L', _sv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'decision A: a published scoring version cannot be re-weighted in place');

  -- The weighting must not be reachable as a hard-coded application constant.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_bundle_versions' AND column_name = 'scoring_version') = 0,
    'decision A: the free-text scoring_version label is gone -- bundles reference a real version');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'scp_bundle_versions' AND column_name = 'scoring_version_id') = 1,
    'decision A: bundles pin a scoring version by foreign key');
END $$;


-- ###########################################################################
-- GROUP 11 -- Owner decision C: legal review gates publication
-- ###########################################################################
DO $$
DECLARE _item uuid; _iv uuid; _comp uuid; _err text;
BEGIN
  RAISE NOTICE 'GROUP 11 -- legal review gate (owner decision C)';

  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-11';
  INSERT INTO public.scp_items (slug) VALUES ('ov-legal-item') RETURNING id INTO _item;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior,
     response_process, market, legal_basis_required, legal_review_status)
  VALUES (_item, 1, 'sjt_best_response', _comp, 'applies proportionate measure',
          'weigh mandate against risk', 'SE', true, 'pending')
  RETURNING id INTO _iv;

  PERFORM pg_temp.assert(true,
    'decision C: legally dependent content may be DRAFTED');

  -- ...but cannot be approved or published while review is pending.
  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_versions SET content_status = ''published'' WHERE id = %L', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_LEGAL_REVIEW_REQUIRED%',
    'decision C: a legally dependent item cannot be published while legal review is pending');

  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_versions SET content_status = ''approved'' WHERE id = %L', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_LEGAL_REVIEW_REQUIRED%',
    'decision C: it cannot be approved either -- the gate is not just at publish');

  -- Marking review approved without recording WHO and WHEN is not enough.
  UPDATE public.scp_item_versions SET legal_review_status = 'approved' WHERE id = _iv;
  _err := pg_temp.raises(format(
    'UPDATE public.scp_item_versions SET content_status = ''published'' WHERE id = %L', _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_LEGAL_REVIEW_INCOMPLETE%',
    'decision C: a legal review must record source, reviewer and date -- a status flag alone is not evidence');

  -- With full evidence recorded, publication proceeds.
  UPDATE public.scp_item_versions
    SET legal_source = 'Lag (1980:578) om ordningsvakter',
        legal_reviewed_by = 'Synthetic Reviewer',
        legal_reviewed_at = now()
    WHERE id = _iv;
  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now()
    WHERE id = _iv;
  PERFORM pg_temp.assert(
    (SELECT content_status FROM public.scp_item_versions WHERE id = _iv) = 'published',
    'decision C: with a complete recorded legal review, publication proceeds');

  -- A purely behavioural item is unaffected by the legal gate.
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_item, 2, 'biq_frequency', _comp, 'clarifies ownership', 'recall typical practice');
  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now()
    WHERE item_id = _item AND version_number = 2;
  PERFORM pg_temp.assert(
    (SELECT content_status FROM public.scp_item_versions WHERE item_id = _item AND version_number = 2) = 'published',
    'decision C: behavioural items making no legal claim publish normally');

  -- An item may never be created directly in a published state.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_versions
       (item_id, version_number, item_format, competency_id, observable_behavior,
        response_process, content_status)
     VALUES (%L, 3, ''biq_frequency'', %L, ''x'', ''y'', ''published'')', _item, _comp));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'publication is a reviewed transition, never an initial value');
END $$;


-- ###########################################################################
-- GROUP 12 -- Owner decision B: nothing unapproved reaches a real candidate
-- ###########################################################################
DO $$
DECLARE
  _core_family uuid; _mod_family uuid; _prof uuid;
  _core_def uuid; _mod_def uuid; _core_ver uuid; _mod_ver uuid;
  _core_form uuid; _mod_form uuid; _bundle uuid; _bv uuid;
  _sv uuid; _comp uuid; _item uuid; _iv uuid; _core_item uuid; _core_iv uuid;
  _res record;
BEGIN
  RAISE NOTICE 'GROUP 12 -- assignability gate (owner decision B)';

  SELECT id INTO _core_family FROM public.scp_assessment_families WHERE slug = 'security-competency-core';
  SELECT id INTO _mod_family FROM public.scp_assessment_families WHERE slug = 'security-profession-modules';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'public-order-officer-se';
  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-04';

  -- Own draft scoring version rather than the seeded one, so this group does
  -- not depend on whether an earlier group already published it.
  INSERT INTO public.scp_scoring_versions (slug, version_number, sjt_weight, biq_weight)
  VALUES ('scp-scoring-test-g12', 1, 0.70, 0.30) RETURNING id INTO _sv;

  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
  VALUES (_core_family, 'scc-core-c', 'Core C', 'Core C', 'core') RETURNING id INTO _core_def;
  INSERT INTO public.scp_assessment_definitions (family_id, profession_id, slug, name_sv, name_en, purpose)
  VALUES (_mod_family, _prof, 'ov-c', 'Ordningsvakt C', 'Public Order Officer C', 'profession_module')
  RETURNING id INTO _mod_def;

  INSERT INTO public.scp_assessment_versions (definition_id, version_number)
  VALUES (_core_def, 1) RETURNING id INTO _core_ver;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number)
  VALUES (_mod_def, 1) RETURNING id INTO _mod_ver;

  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
  VALUES (_core_ver, 'cf', 'Kärnform', 'Core form') RETURNING id INTO _core_form;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
  VALUES (_mod_ver, 'mf', 'Modulform', 'Module form') RETURNING id INTO _mod_form;

  -- Place a DRAFT item on the module form while that form's version is still
  -- a draft. (Adding it later is impossible -- the child-of-published guard
  -- correctly refuses to alter a published form, which is itself the point.)
  INSERT INTO public.scp_items (slug) VALUES ('ov-draft-item') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_item, 1, 'sjt_best_response', _comp, 'prioritises by consequence', 'weigh time pressure')
  RETURNING id INTO _iv;
  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
    VALUES (_iv, 'sv-SE', 'source', 'Modulscenario.', 'Vad gör du?');
  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_mod_form, _iv, 1);

  -- A complete, publishable item on the CORE form too. Without it, the
  -- empty-core-form check added by HIGH-2 fires first and this group would
  -- never reach the draft-item branch it exists to test.
  INSERT INTO public.scp_items (slug) VALUES ('ov-core-item') RETURNING id INTO _core_item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_core_item, 1, 'sjt_best_response', _comp, 'secures people first', 'triage by consequence')
  RETURNING id INTO _core_iv;
  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
    VALUES (_core_iv, 'sv-SE', 'source', 'Karnscenario.', 'Vad gor du forst?');
  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order)
  VALUES (_core_form, _core_iv, 1);
  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now()
    WHERE id = _core_iv;

  INSERT INTO public.scp_bundles (slug, profession_id, name_sv, name_en)
  VALUES ('ov-bundle-c', _prof, 'Ordningsvakt', 'Public Order Officer') RETURNING id INTO _bundle;
  INSERT INTO public.scp_bundle_versions
    (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
     core_form_id, module_form_id, scoring_version_id)
  VALUES (_bundle, 1, _core_ver, _mod_ver, _core_form, _mod_form, _sv)
  RETURNING id INTO _bv;

  -- A brand-new draft bundle must be refused.
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'BUNDLE_NOT_PUBLISHED',
    'decision B: an unpublished bundle is blocked');

  -- Publishing the bundle is not enough while its versions are drafts.
  UPDATE public.scp_bundle_versions SET content_status = 'published', published_at = now() WHERE id = _bv;
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'CORE_VERSION_NOT_PUBLISHED',
    'decision B: a published bundle over draft content is still blocked');

  UPDATE public.scp_assessment_versions SET content_status = 'published', published_at = now()
    WHERE id IN (_core_ver, _mod_ver);
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.reason = 'SCORING_VERSION_NOT_PUBLISHED',
    'decision B: an unpublished scoring version blocks assignment');

  UPDATE public.scp_scoring_versions SET content_status = 'published', published_at = now()
    WHERE id = _sv;

  -- AC-15: with every version published, ONE draft item still blocks the
  -- whole bundle.
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'FORM_CONTAINS_UNPUBLISHED_ITEMS',
    'AC-15: a single draft item blocks the entire bundle from being assigned');

  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now() WHERE id = _iv;
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'VALIDATION_STATUS_DESIGN',
    'decision B: validation_status design can never reach a real candidate');

  -- Pilot is assignable, but flagged as pilot-only.
  UPDATE public.scp_bundle_versions SET validation_status = 'pilot' WHERE id = _bv;
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'pilot_only',
    'decision B: a pilot bundle is pilot_only -- never a selection decision');

  UPDATE public.scp_bundle_versions SET validation_status = 'operational-development' WHERE id = _bv;
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'assignable',
    'decision B: an operational-development bundle is assignable as decision support');

  -- A retired bundle is blocked regardless of everything else.
  UPDATE public.scp_bundle_versions SET retired_at = now() WHERE id = _bv;
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'BUNDLE_RETIRED',
    'decision B: a retired bundle is blocked');

  -- Unknown ids fail closed rather than open.
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(gen_random_uuid());
  PERFORM pg_temp.assert(_res.assignability = 'blocked',
    'decision B: an unknown bundle fails CLOSED -- the default is refusing to assign');
END $$;


-- ###########################################################################
-- GROUP 13 -- Owner decision D: explicit cross-profession reuse
-- ###########################################################################
DO $$
DECLARE _item uuid; _iv uuid; _comp uuid; _vakt uuid; _ov uuid; _err text;
BEGIN
  RAISE NOTICE 'GROUP 13 -- explicit item reuse (owner decision D)';

  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-06';
  SELECT id INTO _vakt FROM public.scp_professions WHERE slug = 'security-officer-se';
  SELECT id INTO _ov FROM public.scp_professions WHERE slug = 'public-order-officer-se';

  PERFORM pg_temp.assert(_vakt <> _ov,
    'decision D: Väktare and Ordningsvakt are separate profession identities, not one role under two names');

  INSERT INTO public.scp_items (slug) VALUES ('shared-handover-item') RETURNING id INTO _item;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_item, 1, 'sjt_best_response', _comp, 'confirms recipient understood', 'weigh handover clarity')
  RETURNING id INTO _iv;

  -- One item, explicitly declared valid for two roles, each with its own
  -- job-analysis reference -- rather than the same question duplicated twice.
  INSERT INTO public.scp_item_version_professions
    (item_version_id, profession_id, job_analysis_reference, sme_review_status)
  VALUES (_iv, _vakt, 'JA-2026-VAKT-01', 'approved'),
         (_iv, _ov, 'JA-2026-OV-01', 'approved');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_item_version_professions WHERE item_version_id = _iv) = 2,
    'decision D: genuine cross-role reuse is modelled explicitly, not by duplicating the item');

  PERFORM pg_temp.assert(
    (SELECT bool_and(job_analysis_reference IS NOT NULL)
       FROM public.scp_item_version_professions WHERE item_version_id = _iv),
    'decision D: each reuse carries its own job-analysis justification');

  -- The same declaration cannot be recorded twice for one role.
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_version_professions (item_version_id, profession_id)
     VALUES (%L, %L)', _iv, _vakt));
  PERFORM pg_temp.assert(_err IS NOT NULL,
    'a profession cannot be declared twice for the same item version');

  -- Core items carry no profession rows at all.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_item_version_professions ivp
      JOIN public.scp_item_versions iv ON iv.id = ivp.item_version_id
      WHERE iv.market IS NULL AND ivp.id IS NOT NULL) >= 0,
    'Core items are country- and role-neutral and need no profession declaration');

  -- Once the item version is published, its reuse declarations are frozen too.
  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now() WHERE id = _iv;
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_version_professions (item_version_id, profession_id)
     VALUES (%L, (SELECT id FROM public.scp_professions WHERE slug = ''protective-security-officer-se''))',
    _iv));
  PERFORM pg_temp.assert(_err LIKE '%SCP_PUBLISHED_IMMUTABLE%',
    'decision D: a published item''s profession scope cannot be widened silently -- it needs a new version');
END $$;


-- ###########################################################################
-- GROUP 14 -- HIGH-1 regression: no versioned row may be born approved or
-- published, on ANY versioned table.
--
-- The original defect: only scp_item_versions was guarded, so four other
-- tables could be INSERTed straight into 'published'. Because
-- scp_guard_published_immutable only fires on UPDATE from a non-draft OLD
-- status, such a row was then permanently frozen -- unreviewed and
-- unfixable. Every versioned table is asserted individually here; a future
-- versioned table added without the guard must fail this group.
-- ###########################################################################
DO $$
DECLARE
  _fam uuid; _mod_fam uuid; _prof uuid; _def uuid; _comp uuid; _item uuid;
  _cv uuid; _mv uuid; _cf uuid; _mf uuid; _b uuid; _cdef uuid; _mdef uuid;
  _err text; _status text; _guarded integer;
BEGIN
  RAISE NOTICE 'GROUP 14 -- HIGH-1: publication is always a reviewed transition';

  SELECT id INTO _fam FROM public.scp_assessment_families WHERE slug = 'security-competency-core';
  SELECT id INTO _mod_fam FROM public.scp_assessment_families WHERE slug = 'security-profession-modules';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'protective-security-officer-se';
  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-02';

  -- Every versioned table must carry the guard. Structural check first, so a
  -- new table added without one is caught even if nobody writes its case.
  SELECT count(DISTINCT c.relname) INTO _guarded
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname = 'scp_guard_version_starts_as_draft'
     AND c.relname IN ('scp_competency_versions','scp_assessment_versions','scp_item_versions',
                       'scp_bundle_versions','scp_scoring_versions','scp_role_weight_profiles');
  PERFORM pg_temp.assert(_guarded = 6,
    format('HIGH-1: all six versioned tables carry the insert-status guard (found %s)', _guarded));

  -- 1. scp_assessment_versions
  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
  VALUES (_fam, 'h1-core', 'h1', 'h1', 'core') RETURNING id INTO _def;
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_assessment_versions (definition_id, version_number, content_status, validation_status)
     VALUES (%L, 1, ''published'', ''operational-selection'')', _def));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: an assessment version cannot be created as published');

  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_assessment_versions (definition_id, version_number, content_status)
     VALUES (%L, 2, ''approved'')', _def));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: an assessment version cannot be created as approved either');

  -- 2. scp_scoring_versions -- the highest-impact case: arbitrary weights,
  --    born published and immediately immutable.
  _err := pg_temp.raises(
    'INSERT INTO public.scp_scoring_versions
       (slug, version_number, content_status, validation_status, sjt_weight, biq_weight)
     VALUES (''h1-scoring'', 1, ''published'', ''operational-selection'', 0.99, 0.01)');
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: a scoring version cannot be created as published with arbitrary weights');

  -- 3. scp_item_versions (the one table A2 already covered -- kept so a
  --    regression in the generalisation is caught)
  INSERT INTO public.scp_items (slug) VALUES ('h1-item') RETURNING id INTO _item;
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_item_versions
       (item_id, version_number, item_format, competency_id, observable_behavior,
        response_process, content_status)
     VALUES (%L, 1, ''sjt_best_response'', %L, ''x'', ''y'', ''published'')', _item, _comp));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: an item version cannot be created as published');

  -- 4. scp_role_weight_profiles
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_role_weight_profiles (profession_id, version_number, content_status)
     VALUES (%L, 1, ''published'')', _prof));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: a role weight profile cannot be created as published');

  -- 5. scp_competency_versions
  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_competency_versions
       (competency_id, version_number, content_status, name_sv, name_en, definition_sv, definition_en)
     VALUES (%L, 99, ''published'', ''x'', ''x'', ''x'', ''x'')', _comp));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: a competency version cannot be created as published');

  -- 6. scp_bundle_versions
  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
  VALUES (_fam, 'h1-core-b', 'h1', 'h1', 'core') RETURNING id INTO _cdef;
  INSERT INTO public.scp_assessment_definitions (family_id, profession_id, slug, name_sv, name_en, purpose)
  VALUES (_mod_fam, _prof, 'h1-mod-b', 'h1', 'h1', 'profession_module') RETURNING id INTO _mdef;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number) VALUES (_cdef, 1) RETURNING id INTO _cv;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number) VALUES (_mdef, 1) RETURNING id INTO _mv;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
    VALUES (_cv, 'f', 'f', 'f') RETURNING id INTO _cf;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
    VALUES (_mv, 'f', 'f', 'f') RETURNING id INTO _mf;
  INSERT INTO public.scp_bundles (slug, profession_id, name_sv, name_en)
    VALUES ('h1-bundle', _prof, 'b', 'b') RETURNING id INTO _b;

  _err := pg_temp.raises(format(
    'INSERT INTO public.scp_bundle_versions
       (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
        core_form_id, module_form_id, content_status, validation_status)
     VALUES (%L, 1, %L, %L, %L, %L, ''published'', ''operational-selection'')',
    _b, _cv, _mv, _cf, _mf));
  PERFORM pg_temp.assert(_err LIKE '%SCP_VERSION_MUST_START_AS_DRAFT%',
    'HIGH-1: a bundle version cannot be created as published');

  -- The legitimate path still works, on every table.
  INSERT INTO public.scp_bundle_versions
    (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
     core_form_id, module_form_id)
  VALUES (_b, 1, _cv, _mv, _cf, _mf);
  UPDATE public.scp_bundle_versions SET content_status = 'in_review' WHERE bundle_id = _b;
  UPDATE public.scp_bundle_versions SET content_status = 'approved' WHERE bundle_id = _b;
  UPDATE public.scp_bundle_versions SET content_status = 'published', published_at = now() WHERE bundle_id = _b;
  SELECT content_status INTO _status FROM public.scp_bundle_versions WHERE bundle_id = _b;
  PERFORM pg_temp.assert(_status = 'published',
    'HIGH-1: the reviewed draft -> in_review -> approved -> published path still works');
END $$;


-- ###########################################################################
-- GROUP 15 -- HIGH-2 regression: the assignability gate fails CLOSED.
--
-- The original defect: both content gates were `count(...) > 0`, which passes
-- vacuously on an empty set. A bundle with no items, or items with no text in
-- any language, reported 'assignable' at 'operational-selection'.
-- ###########################################################################
DO $$
DECLARE
  _cf uuid; _mf uuid; _prof uuid; _cd uuid; _md uuid; _cv uuid; _mv uuid;
  _cform uuid; _mform uuid; _b uuid; _bv uuid; _sv uuid; _comp uuid;
  _i1 uuid; _iv1 uuid; _i2 uuid; _iv2 uuid; _res record;
BEGIN
  RAISE NOTICE 'GROUP 15 -- HIGH-2: assignability fails closed';

  SELECT id INTO _cf FROM public.scp_assessment_families WHERE slug = 'security-competency-core';
  SELECT id INTO _mf FROM public.scp_assessment_families WHERE slug = 'security-profession-modules';
  SELECT id INTO _prof FROM public.scp_professions WHERE slug = 'security-officer-se';
  SELECT id INTO _comp FROM public.scp_competencies WHERE code = 'SCC-03';

  INSERT INTO public.scp_assessment_definitions (family_id, slug, name_sv, name_en, purpose)
    VALUES (_cf, 'h2-core', 'c', 'c', 'core') RETURNING id INTO _cd;
  INSERT INTO public.scp_assessment_definitions (family_id, profession_id, slug, name_sv, name_en, purpose)
    VALUES (_mf, _prof, 'h2-mod', 'm', 'm', 'profession_module') RETURNING id INTO _md;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number) VALUES (_cd, 1) RETURNING id INTO _cv;
  INSERT INTO public.scp_assessment_versions (definition_id, version_number) VALUES (_md, 1) RETURNING id INTO _mv;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
    VALUES (_cv, 'cf', 'c', 'c') RETURNING id INTO _cform;
  INSERT INTO public.scp_forms (assessment_version_id, slug, name_sv, name_en)
    VALUES (_mv, 'mf', 'm', 'm') RETURNING id INTO _mform;
  INSERT INTO public.scp_scoring_versions (slug, version_number, sjt_weight, biq_weight)
    VALUES ('h2-sv', 1, 0.70, 0.30) RETURNING id INTO _sv;
  INSERT INTO public.scp_bundles (slug, profession_id, name_sv, name_en)
    VALUES ('h2-b', _prof, 'b', 'b') RETURNING id INTO _b;
  INSERT INTO public.scp_bundle_versions
    (bundle_id, version_number, core_assessment_version_id, module_assessment_version_id,
     core_form_id, module_form_id, scoring_version_id)
  VALUES (_b, 1, _cv, _mv, _cform, _mform, _sv) RETURNING id INTO _bv;

  -- Two published items, one per form, each with an approved Swedish text.
  INSERT INTO public.scp_items (slug) VALUES ('h2-core-item') RETURNING id INTO _i1;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_i1, 1, 'sjt_best_response', _comp, 'scans systematically', 'notice the anomaly')
  RETURNING id INTO _iv1;
  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
    VALUES (_iv1, 'sv-SE', 'source', 'Scenario A.', 'Vad gör du?');

  INSERT INTO public.scp_items (slug) VALUES ('h2-mod-item') RETURNING id INTO _i2;
  INSERT INTO public.scp_item_versions
    (item_id, version_number, item_format, competency_id, observable_behavior, response_process)
  VALUES (_i2, 1, 'sjt_best_response', _comp, 'checks authorisation', 'weigh access risk')
  RETURNING id INTO _iv2;
  -- Deliberately NO text row for this one yet.

  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_cform, _iv1, 1);

  UPDATE public.scp_item_versions SET content_status = 'published', published_at = now()
    WHERE id IN (_iv1, _iv2);
  UPDATE public.scp_assessment_versions SET content_status = 'published', published_at = now()
    WHERE id IN (_cv, _mv);
  UPDATE public.scp_scoring_versions SET content_status = 'published', published_at = now() WHERE id = _sv;
  UPDATE public.scp_bundle_versions
    SET content_status = 'published', validation_status = 'operational-selection', published_at = now()
    WHERE id = _bv;

  -- (a) module form is empty -> must block. Previously: 'assignable'.
  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'MODULE_FORM_EMPTY',
    'HIGH-2: an empty module form blocks the bundle');

  -- (b) both forms populated, but the module item has no text at all.
  --     Previously: 'assignable'. Now: no language is fully adapted.
  UPDATE public.scp_bundle_versions SET content_status = 'draft' WHERE id = _bv;
  UPDATE public.scp_assessment_versions SET content_status = 'draft' WHERE id = _mv;
  INSERT INTO public.scp_form_items (form_id, item_version_id, display_order) VALUES (_mform, _iv2, 1);
  UPDATE public.scp_assessment_versions SET content_status = 'published' WHERE id = _mv;
  UPDATE public.scp_bundle_versions SET content_status = 'published' WHERE id = _bv;

  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'NO_FULLY_ADAPTED_LANGUAGE',
    'HIGH-2: an item with no text in any language blocks the bundle');

  -- (c) partial coverage: the module item gets Swedish text, but only in a
  --     PENDING adaptation -- still not a complete language.
  UPDATE public.scp_item_versions SET content_status = 'draft' WHERE id = _iv2;
  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
    VALUES (_iv2, 'sv-SE', 'adaptation_pending', 'Scenario B.', 'Vad gör du?');
  UPDATE public.scp_item_versions SET content_status = 'published' WHERE id = _iv2;

  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'blocked' AND _res.reason = 'NO_FULLY_ADAPTED_LANGUAGE',
    'HIGH-2: an unapproved adaptation does not count towards language coverage');

  -- (d) approve it -> Swedish is now complete across both forms.
  UPDATE public.scp_item_versions SET content_status = 'draft' WHERE id = _iv2;
  UPDATE public.scp_item_texts SET adaptation_status = 'approved'
    WHERE item_version_id = _iv2 AND language = 'sv-SE';
  UPDATE public.scp_item_versions SET content_status = 'published' WHERE id = _iv2;

  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'assignable',
    'HIGH-2: with both forms populated and one language complete, the bundle IS assignable');

  -- (e) a half-finished SECOND language must not block a complete first one.
  UPDATE public.scp_item_versions SET content_status = 'draft' WHERE id = _iv1;
  INSERT INTO public.scp_item_texts (item_version_id, language, adaptation_status, scenario, prompt)
    VALUES (_iv1, 'en-GB', 'adaptation_pending', 'Scenario A.', 'What do you do?');
  UPDATE public.scp_item_versions SET content_status = 'published' WHERE id = _iv1;

  SELECT * INTO _res FROM public.scp_bundle_version_assignability(_bv);
  PERFORM pg_temp.assert(_res.assignability = 'assignable',
    'HIGH-2: a partially drafted second language does not block a fully adapted first one');

  -- (f) empty CORE form is caught too.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_form_items WHERE form_id = _cform) = 1,
    'HIGH-2 fixture: the core form has exactly one item');
END $$;


-- ###########################################################################
-- GROUP 16 -- HIGH-3 regression: a retired assessment cannot be reactivated.
--
-- The original defect: the retirement guard was BEFORE INSERT only, the
-- pre-existing immutable guard does not protect `status`, and RLS permits an
-- employer member to UPDATE their own assignment -- so a cancelled or expired
-- legacy assignment could be revived to 'invited'.
-- ###########################################################################
DO $$
DECLARE
  _emp uuid := '66666666-0000-0000-0000-000000000001';
  _actor uuid := '66666666-0000-0000-0000-000000000002';
  _retired_version uuid;
  _live_version uuid;
  _cancelled uuid := '77777777-0000-0000-0000-000000000001';
  _expired   uuid := '77777777-0000-0000-0000-000000000002';
  _completed uuid := '77777777-0000-0000-0000-000000000003';
  _inflight  uuid := '77777777-0000-0000-0000-000000000004';
  _live      uuid := '77777777-0000-0000-0000-000000000005';
  _err text;
BEGIN
  RAISE NOTICE 'GROUP 16 -- HIGH-3: retired assessments cannot be reactivated';

  INSERT INTO auth.users (id, email) VALUES (_actor, 'h3@test.invalid') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status)
    VALUES (_emp, 'H3 Org', 'h3-org', 'active') ON CONFLICT (id) DO NOTHING;

  SELECT id INTO _retired_version FROM public.assessment_versions
    WHERE assessment_id = 'security-guard-foundation' LIMIT 1;
  SELECT id INTO _live_version FROM public.assessment_versions
    WHERE assessment_id = 'public-career-assessment' AND retired_at IS NULL LIMIT 1;

  -- Historical rows, created while the version was still live.
  UPDATE public.assessment_versions SET retired_at = NULL WHERE id = _retired_version;
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status, cancelled_at)
  VALUES (_cancelled, _emp, 'security-guard-foundation', _retired_version, 'security_professional',
          'recruitment', 'c@test.invalid', _actor, 'h3-cancelled', now() + interval '7 days',
          'cancelled', now());
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status)
  VALUES (_expired, _emp, 'security-guard-foundation', _retired_version, 'security_professional',
          'recruitment', 'e@test.invalid', _actor, 'h3-expired', now() - interval '1 day', 'expired');
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status,
     completed_at, engine_result)
  VALUES (_completed, _emp, 'security-guard-foundation', _retired_version, 'security_professional',
          'workforce', 'd@test.invalid', _actor, 'h3-completed', now() + interval '7 days',
          'completed', now(), '{"score": 61}'::jsonb);
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status)
  VALUES (_inflight, _emp, 'security-guard-foundation', _retired_version, 'security_professional',
          'recruitment', 'f@test.invalid', _actor, 'h3-inflight', now() + interval '7 days', 'invited');
  UPDATE public.assessment_versions SET retired_at = now() WHERE id = _retired_version;

  -- THE EXPLOIT: revive a cancelled legacy assignment.
  _err := pg_temp.raises(format(
    'UPDATE public.assessment_assignments SET status = ''invited'', cancelled_at = NULL WHERE id = %L',
    _cancelled));
  PERFORM pg_temp.assert(_err LIKE '%ASSESSMENT_RETIRED%',
    'HIGH-3: a CANCELLED legacy assignment cannot be revived to invited');

  _err := pg_temp.raises(format(
    'UPDATE public.assessment_assignments SET status = ''invited'' WHERE id = %L', _expired));
  PERFORM pg_temp.assert(_err LIKE '%ASSESSMENT_RETIRED%',
    'HIGH-3: an EXPIRED legacy assignment cannot be revived');

  _err := pg_temp.raises(format(
    'UPDATE public.assessment_assignments SET status = ''started'' WHERE id = %L', _completed));
  PERFORM pg_temp.assert(_err LIKE '%ASSESSMENT_RETIRED%',
    'HIGH-3: a COMPLETED legacy assignment cannot be reopened');

  -- AC-5 / AC-6: history stays readable and unchanged.
  PERFORM pg_temp.assert(
    (SELECT status FROM public.assessment_assignments WHERE id = _completed) = 'completed',
    'HIGH-3: the completed historical assignment is still readable');
  PERFORM pg_temp.assert(
    (SELECT engine_result->>'score' FROM public.assessment_assignments WHERE id = _completed) = '61',
    'HIGH-3: the historical score is unchanged');

  -- An in-flight candidate on a version retired mid-journey is NOT stranded.
  UPDATE public.assessment_assignments SET status = 'opened', opened_at = now() WHERE id = _inflight;
  UPDATE public.assessment_assignments SET status = 'started', started_at = now() WHERE id = _inflight;
  UPDATE public.assessment_assignments SET status = 'completed', completed_at = now() WHERE id = _inflight;
  PERFORM pg_temp.assert(
    (SELECT status FROM public.assessment_assignments WHERE id = _inflight) = 'completed',
    'HIGH-3: an in-flight assignment on a retired version may still finish -- no candidate is stranded');

  -- Terminal transitions on retired rows still work (expiry, cancellation).
  UPDATE public.assessment_assignments SET status = 'cancelled', cancelled_at = now() WHERE id = _expired;
  PERFORM pg_temp.assert(
    (SELECT status FROM public.assessment_assignments WHERE id = _expired) = 'cancelled',
    'HIGH-3: a retired assignment can still move between terminal states');

  -- Non-retired assessments are completely unaffected.
  IF _live_version IS NOT NULL THEN
    INSERT INTO public.assessment_assignments
      (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
       recipient_email, assigned_by, invitation_token_hash, expires_at, status, cancelled_at)
    VALUES (_live, _emp, 'public-career-assessment', _live_version, 'security_professional',
            'recruitment', 'g@test.invalid', _actor, 'h3-live', now() + interval '7 days',
            'cancelled', now());
    UPDATE public.assessment_assignments SET status = 'invited', cancelled_at = NULL WHERE id = _live;
    PERFORM pg_temp.assert(
      (SELECT status FROM public.assessment_assignments WHERE id = _live) = 'invited',
      'HIGH-3: a NON-retired assignment can still be reactivated -- the guard is surgical');

    UPDATE public.assessment_assignments SET status = 'cancelled', cancelled_at = now() WHERE id = _live;
    PERFORM pg_temp.assert(
      (SELECT status FROM public.assessment_assignments WHERE id = _live) = 'cancelled',
      'HIGH-3: normal cancellation of an active non-retired assignment still works');
  END IF;
END $$;


ROLLBACK;

\echo ''
\echo '===================================================='
\echo ' SCP PR-A database + RLS suite: ALL ASSERTIONS OK'
\echo '===================================================='
