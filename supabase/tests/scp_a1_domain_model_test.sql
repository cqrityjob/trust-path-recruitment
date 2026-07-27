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


ROLLBACK;

\echo ''
\echo '================================================'
\echo ' SCP-A1 database + RLS suite: ALL ASSERTIONS OK'
\echo '================================================'
