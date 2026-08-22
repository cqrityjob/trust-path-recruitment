-- Standard recruitment availability — the rule, and its edges.
--
-- The point of this file is not that the flagship became assignable. It is
-- that NOTHING ELSE did. Every assertion below either admits the one
-- designated assessment to an approved employer, or proves a neighbouring case
-- is still refused.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

DO $$
DECLARE
  _def        uuid;
  _other_def  uuid;
  _fixture    uuid;
  _fam        uuid;
  _active     uuid := '00000000-a11e-0000-0000-000000000001';
  _pending    uuid := '00000000-a11e-0000-0000-000000000002';
  _suspended  uuid := '00000000-a11e-0000-0000-000000000003';
  _cs         text;
  _vs         text;
  _mode       public.scp_governance_mode;
BEGIN
  RAISE NOTICE 'GROUP 1 -- the designated assessment';

  SELECT id INTO _def FROM public.scp_assessment_definitions
   WHERE slug = 'security-officer-recruitment';
  PERFORM pg_temp.ok(_def IS NOT NULL, 'the flagship recruitment assessment exists');
  PERFORM pg_temp.ok(
    (SELECT standard_for_recruitment FROM public.scp_assessment_definitions WHERE id = _def),
    'it is designated as standard recruitment content');

  -- Exactly one designation. A second one appearing is a decision somebody
  -- should have to make on purpose.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_assessment_definitions
      WHERE standard_for_recruitment) = 1,
    'exactly one assessment carries the designation');

  SELECT content_status, validation_status INTO _cs, _vs
    FROM public.scp_assessment_versions WHERE definition_id = _def
   ORDER BY version_number DESC LIMIT 1;
  PERFORM pg_temp.ok(_cs = 'draft' AND _vs = 'design',
    'it is still draft/design -- nothing here published it');

  -- Three organisations, one of each status that matters.
  INSERT INTO public.employers (id, name, slug, status) VALUES
    (_active,    'Std active',    'std-t-active',    'active'),
    (_pending,   'Std pending',   'std-t-pending',   'pending'),
    (_suspended, 'Std suspended', 'std-t-suspended', 'suspended')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'GROUP 2 -- an approved employer needs no grant';

  PERFORM pg_temp.ok(
    NOT public.scp_has_test_grant(_active, 'closed_test', _def),
    'the test employer holds NO closed_test grant');

  _mode := public.scp_grant_permits_assignment(_active, _def, _cs, _vs, false);
  PERFORM pg_temp.ok(_mode = 'closed_test',
    'an active employer is admitted, as closed_test');
  PERFORM pg_temp.ok(_mode IS DISTINCT FROM 'recruitment',
    'a designation can NEVER produce recruitment mode');

  RAISE NOTICE 'GROUP 3 -- everybody else is still refused';

  PERFORM pg_temp.ok(
    public.scp_grant_permits_assignment(_pending, _def, _cs, _vs, false) IS NULL,
    'a pending employer is refused');
  PERFORM pg_temp.ok(
    public.scp_grant_permits_assignment(_suspended, _def, _cs, _vs, false) IS NULL,
    'a suspended employer is refused');

  -- Undesignated draft/design content, same employer, same statuses.
  SELECT d.id INTO _other_def
    FROM public.scp_assessment_definitions d
   WHERE NOT d.standard_for_recruitment AND NOT d.is_test_fixture
   LIMIT 1;
  IF _other_def IS NOT NULL THEN
    PERFORM pg_temp.ok(
      public.scp_grant_permits_assignment(_active, _other_def, 'draft', 'design', false) IS NULL,
      'undesignated draft/design content is still refused');
  END IF;

  -- Nothing designated may admit a fixture.
  PERFORM pg_temp.ok(
    public.scp_grant_permits_assignment(_active, _def, _cs, _vs, true) IS NULL,
    'a fixture is still fixture-gated, designation or not');

  RAISE NOTICE 'GROUP 4 -- the grant mechanism still works on its own';

  -- A grant admits content that carries no designation: the restricted route
  -- is untouched and is still the way experimental content is piloted.
  IF _other_def IS NOT NULL THEN
    INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason)
    VALUES (_pending, 'closed_test', _other_def, 'test: restricted route still works');
    PERFORM pg_temp.ok(
      public.scp_grant_permits_assignment(_pending, _other_def, 'draft', 'design', false)
        = 'closed_test',
      'an explicit grant still admits undesignated content');
  END IF;

  RAISE NOTICE 'GROUP 5 -- operational content is unaffected';

  PERFORM pg_temp.ok(
    public.scp_grant_permits_assignment(
      _active, _def, 'published', 'operational-selection', false) = 'recruitment',
    'genuinely validated content still answers recruitment');

  RAISE NOTICE 'GROUP 6 -- the lawful basis stayed honest';

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_purpose_versions
      WHERE purpose_code = 'closed_test_recruitment'
        AND published_at IS NOT NULL AND retired_at IS NULL) >= 2,
    'closed_test_recruitment has a published v2');
  PERFORM pg_temp.ok(
    (SELECT lawful_basis_reference FROM public.scp_purpose_versions
      WHERE purpose_code = 'closed_test_recruitment' AND version_number = 2)
      LIKE '%designated%',
    'v2 names the designation route in the lawful basis');
  PERFORM pg_temp.ok(
    (SELECT lawful_basis_reference FROM public.scp_purpose_versions
      WHERE purpose_code = 'closed_test_recruitment' AND version_number = 2)
      LIKE '%NOT a basis for an operational selection decision%',
    'v2 still forbids resting a decision on it');
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_purpose_versions
             WHERE purpose_code = 'closed_test_recruitment'
               AND version_number = 1 AND retired_at IS NULL),
    'v1 survives for attempts already made under it');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_purpose_versions
                 WHERE purpose_code = 'selection_support'
                   AND published_at IS NOT NULL AND retired_at IS NULL),
    'selection_support is still unpublished');

  RAISE NOTICE 'GROUP 7 -- the designation cannot be put on the wrong content';

  BEGIN
    UPDATE public.scp_assessment_definitions
       SET standard_for_recruitment = true
     WHERE designed_for <> 'recruitment_support'
       AND id = (SELECT id FROM public.scp_assessment_definitions
                  WHERE designed_for <> 'recruitment_support' LIMIT 1);
    -- Only reachable if such a row exists AND the constraint failed to fire.
    IF FOUND THEN
      RAISE EXCEPTION 'ASSERTION FAILED: a non-recruitment assessment accepted the designation';
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '    ok  the CHECK refuses a designation on non-recruitment content';
  END;

  RAISE NOTICE 'GROUP 8 -- cleanup';
  DELETE FROM public.scp_test_grants WHERE employer_id IN (_active, _pending, _suspended);
  DELETE FROM public.employers WHERE id IN (_active, _pending, _suspended);
END $$;

ROLLBACK;
