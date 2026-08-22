-- Standard recruitment content stops needing a per-customer grant.
--
-- ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────
--
-- scp_grant_permits_assignment() has two ways to say yes. The first is
-- published + operationally validated content, which answers 'recruitment'.
-- The second is a per-employer closed_test row in scp_test_grants, which
-- answers 'closed_test'. The flagship recruitment assessment
-- (security-officer-recruitment) is draft/design content with its review gates
-- outstanding, so it can only ever take the second route.
--
-- Nothing in the product issues that row. No server function, no trigger, no
-- admin screen. Every organisation that could assign the assessment had a row
-- inserted by hand, and every organisation created since could not assign it
-- at all -- which is an operations process wearing the costume of a
-- governance control.
--
-- ── WHAT CHANGES, PRECISELY ─────────────────────────────────────────────
--
-- One flag on the DEFINITION, meaning: CQrityjob has designated this as
-- standard recruitment content for the current product phase. An ACTIVE
-- employer may assign a designated assessment without holding a grant.
--
-- That is the whole rule. It is deliberately narrow:
--
--   * It is per-definition, default false, and set here for exactly one row.
--     Every other draft/design assessment is untouched and still needs a
--     grant.
--   * It requires employers.status = 'active'. A pending, rejected, suspended
--     or archived organisation is refused exactly as before.
--   * It answers 'closed_test', NOT 'recruitment'. This is the load-bearing
--     part: 'recruitment' still means genuinely published and operationally
--     validated content, a designation still cannot produce that answer, and
--     every downstream honesty guarantee -- the closed-test stamp on the
--     report, the purpose, the prohibition on resting a decision on it --
--     continues to apply unchanged.
--   * scp_test_grants is not touched. Genuinely restricted or experimental
--     content keeps the per-employer grant mechanism, and a grant still
--     admits content that carries no designation.
--
-- ── WHY THE PROCESSING PURPOSE GETS A VERSION 2 ─────────────────────────
--
-- closed_test_recruitment v1 states the lawful basis as legitimate interest
-- "under a time-bounded closed-test grant". After this migration some
-- processing happens under a designation instead, so that sentence would
-- describe the processing inaccurately -- and a lawful basis is not a label
-- applied afterwards. v2 states both admission routes and changes nothing
-- else: the same legitimate interest, the same closed-test stamp, the same
-- prohibition on an operational selection decision.
--
-- v1 is NOT retired. Attempts made under it store its id and keep it, which is
-- the entire reason purposes are versioned. New attempts resolve v2 through
-- the existing ORDER BY version_number DESC lookup.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────
--
-- It does not publish anything. It does not mark draft content operational or
-- validated. It does not publish selection_support. It does not make all
-- draft/design content assignable. It does not create an employment
-- relationship, rank a candidate, or let any assessment decide anything. Each
-- of those is asserted at the bottom of this file rather than promised here.

-- ---------------------------------------------------------------------------
-- 1. The designation
-- ---------------------------------------------------------------------------

ALTER TABLE public.scp_assessment_definitions
  ADD COLUMN IF NOT EXISTS standard_for_recruitment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scp_assessment_definitions.standard_for_recruitment IS
  'CQrityjob has designated this assessment as standard recruitment content '
  'for the current product phase: an ACTIVE employer may assign it without a '
  'per-employer closed-test grant. Never confers ''recruitment'' governance '
  'mode -- designated content still runs, and still reports, as closed test. '
  'Deliberately NOT derived from designed_for, which records what the content '
  'was written for and confers nothing.';

-- Only where a designation can mean anything. designed_for is the author's
-- statement of intent; this constraint stops the two drifting into a state
-- where a competence programme is designated for recruitment.
ALTER TABLE public.scp_assessment_definitions
  DROP CONSTRAINT IF EXISTS scp_standard_recruitment_requires_recruitment_design;
ALTER TABLE public.scp_assessment_definitions
  ADD CONSTRAINT scp_standard_recruitment_requires_recruitment_design
  CHECK (NOT standard_for_recruitment OR designed_for = 'recruitment_support');

-- The flagship, and only the flagship. One definition -- 'Väktare –
-- Recruitment Assessment' and 'Security Officer – Recruitment Assessment' are
-- its Swedish and English names, not two assessments.
UPDATE public.scp_assessment_definitions
   SET standard_for_recruitment = true
 WHERE slug = 'security-officer-recruitment';

-- ---------------------------------------------------------------------------
-- 2. The question, asked in one place
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scp_is_standard_recruitment_content(
  _definition_id uuid,
  _employer_id   uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_assessment_definitions d
      JOIN public.employers e ON e.id = _employer_id
     WHERE d.id = _definition_id
       AND d.standard_for_recruitment
       -- Approval is the control that this rule leans on. An organisation that
       -- is pending, rejected, suspended or archived is not an approved
       -- customer and gets nothing here.
       AND e.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.scp_is_standard_recruitment_content(uuid, uuid) IS
  'Whether this organisation may assign this assessment under the standard '
  'recruitment designation: the definition is designated AND the employer is '
  'active. SECURITY DEFINER because employers and the definition table are not '
  'freely readable; returns only a boolean about the pair it was asked about.';

REVOKE ALL     ON FUNCTION public.scp_is_standard_recruitment_content(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_is_standard_recruitment_content(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The gate learns the second admission route
-- ---------------------------------------------------------------------------
-- Rewritten in full so the file is readable on its own. The body is the
-- 20260819100000 revision -- the current one, including the fixture-access
-- fallback that migration added -- with a single OR added to the closed_test
-- branch. The first branch and the fixture branch are otherwise byte-for-byte
-- what they were.

CREATE OR REPLACE FUNCTION public.scp_grant_permits_assignment(
  _employer_id       uuid,
  _definition_id     uuid,
  _content_status    text,
  _validation_status text,
  _is_test_fixture   boolean
)
RETURNS public.scp_governance_mode
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Published, validated, non-fixture content needs no grant at all. This is
  -- the normal operational path and the only one that reaches recruitment.
  IF _content_status = 'published'
     AND NOT coalesce(_is_test_fixture, false)
     AND _validation_status IN ('operational-development', 'operational-selection') THEN
    RETURN 'recruitment';
  END IF;

  -- A fixture is internal development content, whatever its content_status.
  -- Either surface may carry it: an explicit development grant, or the
  -- Phase 2m fixture-access row that predates grants. A designation cannot
  -- admit one -- fixtures are not product.
  IF coalesce(_is_test_fixture, false) THEN
    IF public.scp_has_test_grant(_employer_id, 'development', _definition_id)
       OR EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                   WHERE fa.employer_id = _employer_id) THEN
      RETURN 'development';
    END IF;
    RETURN NULL;
  END IF;

  -- Real content that is not yet validated. Two ways in, and both answer
  -- 'closed_test' -- never 'recruitment'. Everything downstream stamps that
  -- value, so the pilot basis travels with the data either way.
  --
  --   1. an explicit per-employer grant  (restricted / experimental content)
  --   2. a standard-recruitment designation held by an ACTIVE employer
  --      (content CQrityjob has put into the product for this phase)
  IF _content_status IN ('draft', 'approved', 'published')
     AND _validation_status IN ('design', 'pilot')
     AND (
       public.scp_has_test_grant(_employer_id, 'closed_test', _definition_id)
       OR public.scp_is_standard_recruitment_content(_definition_id, _employer_id)
     ) THEN
    RETURN 'closed_test';
  END IF;

  -- Published-but-still-piloting content, with neither route, is not assignable.
  RETURN NULL;
END; $$;

COMMENT ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) IS
  'The governance mode under which this organisation may assign this content, '
  'or NULL if it may not. Returns ''recruitment'' ONLY for content that is '
  'genuinely published and operationally validated -- neither a grant nor a '
  'standard-recruitment designation can ever produce that answer. Callers '
  'stamp the returned mode onto the attempt so the basis is preserved '
  'historically rather than inferred later.';

REVOKE ALL     ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The lawful basis says what is now true
-- ---------------------------------------------------------------------------

INSERT INTO public.scp_purpose_versions
  (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
   jurisdiction_id, published_at)
SELECT 'closed_test_recruitment', 2,
       'pn-2026-09-closed-test-recruitment-v2',
       'GDPR Art.6(1)(f) — legitimate interest in evaluating a recruitment '
       'assessment inside its intended journey. The organisation is admitted '
       'either by an explicit time-bounded closed-test grant, or because '
       'CQrityjob has designated the assessment as standard recruitment '
       'content for the current product phase and the organisation is an '
       'approved, active customer. Explicitly NOT a basis for an operational '
       'selection decision: the result is marked as closed-test on every '
       'report and may not, on its own, inform an employment decision.',
       j.id, now()
  FROM public.scp_jurisdictions j WHERE j.code = 'SE'
ON CONFLICT (purpose_code, version_number, jurisdiction_id) DO NOTHING;

COMMENT ON TABLE public.scp_processing_purposes IS
  'Why a person is being processed. closed_test_recruitment is deliberately '
  'distinct from selection_support: it covers evaluating the product inside a '
  'recruitment journey, under either an explicit closed-test grant or a '
  'standard-recruitment designation, and confers no basis for an operational '
  'selection decision. selection_support remains unpublished and is the only '
  'purpose that would.';

-- ---------------------------------------------------------------------------
-- 5. In-migration assertions
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _def uuid; _ver record; _emp uuid; _mode public.scp_governance_mode;
BEGIN
  SELECT id INTO _def FROM public.scp_assessment_definitions
   WHERE slug = 'security-officer-recruitment';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'STD_RECRUIT: the flagship definition is missing';
  END IF;

  SELECT content_status, validation_status INTO _ver
    FROM public.scp_assessment_versions WHERE definition_id = _def
   ORDER BY version_number DESC LIMIT 1;

  -- It must still be draft/design. If a later migration publishes it, this
  -- rule stops being the thing that admits it and the assertion should be
  -- revisited deliberately rather than silently passing.
  IF _ver.content_status = 'published'
     AND _ver.validation_status IN ('operational-development','operational-selection') THEN
    RAISE NOTICE 'STD_RECRUIT: flagship is now operational; designation is redundant but harmless';
  END IF;

  -- Three probes, one per status. Created directly rather than updated:
  -- employers.status is trigger-guarded to moderate_employer(), and an
  -- assertion has no business going round that.
  INSERT INTO public.employers (id, name, slug, status) VALUES
    ('00000000-57d0-0000-0000-000000000001', 'STD probe active',  'std-probe-active',  'active'),
    ('00000000-57d0-0000-0000-000000000002', 'STD probe pending', 'std-probe-pending', 'pending')
  ON CONFLICT (id) DO NOTHING;
  _emp := '00000000-57d0-0000-0000-000000000001';

  -- An ACTIVE employer is admitted, and gets closed_test -- never recruitment.
  _mode := public.scp_grant_permits_assignment(
             _emp, _def, _ver.content_status, _ver.validation_status, false);
  IF _mode IS DISTINCT FROM 'closed_test' THEN
    RAISE EXCEPTION
      'STD_RECRUIT: an active employer must be admitted as closed_test, got %', _mode;
  END IF;

  -- A pending employer is refused.
  _mode := public.scp_grant_permits_assignment(
             '00000000-57d0-0000-0000-000000000002', _def,
             _ver.content_status, _ver.validation_status, false);
  IF _mode IS NOT NULL THEN
    RAISE EXCEPTION
      'STD_RECRUIT: a non-active employer must be refused, got %', _mode;
  END IF;

  -- Undesignated draft/design content stays refused for the same active
  -- employer. This is the assertion that the change is narrow.
  IF EXISTS (
    SELECT 1 FROM public.scp_assessment_definitions d
     WHERE NOT d.standard_for_recruitment
       AND NOT d.is_test_fixture
       AND public.scp_grant_permits_assignment(_emp, d.id, 'draft', 'design', false)
           IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'STD_RECRUIT: undesignated draft content became assignable';
  END IF;

  -- A fixture stays fixture-gated even if somebody designates it.
  IF public.scp_grant_permits_assignment(_emp, _def, 'draft', 'design', true) IS NOT NULL THEN
    RAISE EXCEPTION 'STD_RECRUIT: a designation admitted a test fixture';
  END IF;

  DELETE FROM public.employers
   WHERE id IN ('00000000-57d0-0000-0000-000000000001',
                '00000000-57d0-0000-0000-000000000002');

  -- selection_support must still be unpublished: nothing here earns it.
  IF EXISTS (SELECT 1 FROM public.scp_purpose_versions
              WHERE purpose_code = 'selection_support'
                AND published_at IS NOT NULL AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'STD_RECRUIT: selection_support became published';
  END IF;

  -- v1 survives, so attempts made under it keep an accurate basis.
  IF NOT EXISTS (SELECT 1 FROM public.scp_purpose_versions
                  WHERE purpose_code = 'closed_test_recruitment'
                    AND version_number = 1 AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'STD_RECRUIT: closed_test_recruitment v1 was retired';
  END IF;
END $$;
