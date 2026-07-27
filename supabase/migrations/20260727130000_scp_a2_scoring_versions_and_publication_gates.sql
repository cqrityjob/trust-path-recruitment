-- =============================================================================
-- PR-A / SCP-A2 -- owner decisions A-D, implemented as schema.
--
-- Follow-up to 20260727120000_scp_a1_security_competency_platform_domain.sql,
-- responding to four product decisions recorded in
-- docs/assessment/governance/owner-decisions.md. Each section below closes a
-- gap where the A1 schema permitted something a decision says must not happen.
--
-- Written as a SECOND migration rather than an edit to A1 deliberately. A1 has
-- not been merged or deployed anywhere, so amending it would have produced a
-- tidier single file -- but a migration that has been pushed is a migration
-- that might have been applied, and a file whose content no longer matches
-- what ran is unrecoverable. Additive-forward is the safe default even when
-- the risk looks like zero. It also keeps the response to each decision
-- reviewable on its own.
--
-- ---------------------------------------------------------------------------
-- Decision A -- the 70/30 SJT/BIQ split is an approved PROVISIONAL pilot
--   configuration. It must be versioned, configurable through an approved
--   scoring version, and must not be hard-coded across unrelated layers.
--   => scp_scoring_versions becomes the single source of truth; bundle
--      versions reference it by FK instead of by a free-text label.
--
-- Decision B -- a DPIA is required before real recruitment use, and the
--   system must support a non-operational status that PREVENTS unapproved
--   assessments from being assigned to real candidates.
--   => scp_bundle_version_assignability() encodes the gate that PR-C's
--      assignment path must call. Nothing can be assigned by accident.
--
-- Decision C -- items relying on Swedish legislation, authority, legal power,
--   obligation or regulated terminology must not be published or assigned
--   until legal review is recorded.
--   => a trigger blocks the approve/publish transition outright. This was
--      previously only a convention.
--
-- Decision D -- Väktare, Ordningsvakt and Skyddsvakt keep separate module
--   identities and separate item-bank lineage, but genuine cross-role reuse
--   must be modelled explicitly rather than solved by duplicating items.
--   => scp_item_version_professions makes reuse a reviewed, auditable
--      declaration instead of an incidental consequence of form membership.
--
-- Additive only, except for one column replacement on a table this same PR
-- created and which has never held a row (documented in SECTION 1).
-- Rollback: docs/assessment/implementation/migration-and-rollback.md.
-- =============================================================================


-- #############################################################################
-- SECTION 1 -- Decision A: versioned, configurable scoring
-- #############################################################################

CREATE TABLE public.scp_scoring_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  version_number integer NOT NULL,

  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design', 'pilot', 'operational-development', 'operational-selection', 'retired'
    )),

  -- Spec 8.1/8.2 component weights. Stored as data, versioned, changeable
  -- only by issuing a NEW scoring version -- which is what makes "historical
  -- results never change when the model changes" true rather than hoped for.
  sjt_weight numeric NOT NULL CHECK (sjt_weight >= 0 AND sjt_weight <= 1),
  biq_weight numeric NOT NULL CHECK (biq_weight >= 0 AND biq_weight <= 1),

  -- Spec 8.1: the Core Summary Index is indicative only and may never be
  -- shown without the competency profile beside it. Kept as data so a report
  -- layer cannot quietly decide otherwise.
  core_summary_is_indicative boolean NOT NULL DEFAULT true,

  -- Spec 8.3: no percentile / "top N %" / industry comparison before approved
  -- norm data exists. False until a norm study says otherwise.
  norm_comparison_permitted boolean NOT NULL DEFAULT false,

  notes text,
  content_hash text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  retired_at timestamptz,
  retired_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- The two components must form a complete model. Numeric tolerance keeps a
  -- future 1/3-2/3 split expressible without floating-point grief.
  CONSTRAINT scp_scoring_weights_sum_to_one
    CHECK (abs((sjt_weight + biq_weight) - 1) < 0.0001)
);

COMMENT ON TABLE public.scp_scoring_versions IS
  'Owner decision A. The SJT/BIQ weighting is an approved PROVISIONAL pilot '
  'configuration, not a validated fact. It lives here as versioned data so it '
  'can be changed by publishing a new scoring version without altering any '
  'historical score, and so no application layer hard-codes it.';

COMMENT ON COLUMN public.scp_scoring_versions.sjt_weight IS
  'Spec 8.1 start weight 0.70. Provisional. Changing it requires a NEW row, '
  'never an UPDATE -- the immutability trigger enforces this once approved.';

CREATE TRIGGER set_scp_scoring_versions_updated_at BEFORE UPDATE ON public.scp_scoring_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER scp_scoring_versions_immutable
  BEFORE UPDATE ON public.scp_scoring_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();

GRANT SELECT ON public.scp_scoring_versions TO authenticated;
GRANT ALL ON public.scp_scoring_versions TO service_role;
ALTER TABLE public.scp_scoring_versions ENABLE ROW LEVEL SECURITY;

-- Readable metadata (a report must be able to state which scoring version
-- produced it); writable only by authoring roles.
CREATE POLICY scp_scoring_versions_read ON public.scp_scoring_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scp_scoring_versions_author_write ON public.scp_scoring_versions
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

INSERT INTO public.scp_scoring_versions
  (slug, version_number, content_status, validation_status, sjt_weight, biq_weight, notes)
VALUES (
  'scp-scoring-v1', 1, 'draft', 'design', 0.70, 0.30,
  'Spec 8.1 start model, approved by the product owner as a provisional pilot '
  'configuration. Not psychometrically validated. May change after pilot '
  'evidence and specialist review -- by publishing a new scoring version, '
  'never by editing this row.'
);


-- Replace the free-text scoring_version label on bundle versions with a real
-- foreign key. scp_bundle_versions was created by A1 in this same unmerged PR
-- and has never held a row in any environment, so this drops nothing that
-- exists. Verified by the guard below, which fails the migration rather than
-- silently discarding data if that assumption is ever wrong.
DO $$
DECLARE _rows bigint;
BEGIN
  SELECT count(*) INTO _rows FROM public.scp_bundle_versions;
  IF _rows > 0 THEN
    RAISE EXCEPTION
      'SCP_A2_ABORT: scp_bundle_versions contains % row(s); the scoring_version column '
      'replacement assumes an empty table. Backfill scoring_version_id manually before rerunning.',
      _rows;
  END IF;
END $$;

ALTER TABLE public.scp_bundle_versions
  ADD COLUMN scoring_version_id uuid REFERENCES public.scp_scoring_versions(id) ON DELETE RESTRICT;

ALTER TABLE public.scp_bundle_versions DROP COLUMN scoring_version;

COMMENT ON COLUMN public.scp_bundle_versions.scoring_version_id IS
  'Owner decision A. The exact scoring model this bundle locks. A foreign key, '
  'not a label, so a bundle can never reference a scoring version that does '
  'not exist or has been retired.';


-- #############################################################################
-- SECTION 2 -- Decision C: legally dependent content cannot be published
--              without a recorded legal review
-- #############################################################################

CREATE OR REPLACE FUNCTION public.scp_guard_legal_review_before_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only the transition INTO an approved/published state is gated. Drafting
  -- and reviewing legally dependent content is explicitly permitted
  -- (owner decision C: "may be drafted and technically implemented").
  IF NEW.content_status NOT IN ('approved', 'published') THEN
    RETURN NEW;
  END IF;
  IF OLD.content_status IN ('approved', 'published') THEN
    RETURN NEW;  -- already past the gate; the immutability trigger owns this row now
  END IF;

  IF NEW.legal_basis_required THEN
    IF NEW.legal_review_status <> 'approved' THEN
      RAISE EXCEPTION
        'SCP_LEGAL_REVIEW_REQUIRED: item version % relies on legal basis and cannot be approved or published while legal_review_status is "%". Record a completed legal review first.',
        NEW.id, NEW.legal_review_status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.legal_source IS NULL OR NEW.legal_reviewed_by IS NULL OR NEW.legal_reviewed_at IS NULL THEN
      RAISE EXCEPTION
        'SCP_LEGAL_REVIEW_INCOMPLETE: item version % must record legal_source, legal_reviewed_by and legal_reviewed_at before publication.',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.scp_guard_legal_review_before_publish() IS
  'Owner decision C / spec 10.3. Ordningsvakt and Skyddsvakt content that '
  'relies on Swedish legislation, authority, legal power, obligation or '
  'regulated terminology cannot reach an approved or published state until a '
  'named reviewer, a source and a review date are recorded. Behavioural '
  'judgement items that make no legal claim are unaffected.';

CREATE TRIGGER scp_item_versions_legal_gate
  BEFORE UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_legal_review_before_publish();

-- An item cannot be created directly in a published state either.
CREATE OR REPLACE FUNCTION public.scp_guard_item_insert_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'SCP_ITEM_MUST_START_AS_DRAFT: a new item version must be created as draft or in_review, not "%". Publication is a reviewed transition, not an initial value.',
      NEW.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_item_versions_insert_status
  BEFORE INSERT ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_item_insert_status();


-- #############################################################################
-- SECTION 3 -- Decision D: explicit, reviewed cross-profession item reuse
--
-- Form membership already made reuse physically possible. It did not make it
-- a DECISION -- an item could end up in two professions' forms because
-- someone dragged it there. This table turns reuse into a reviewed
-- declaration with its own evidence, while each profession bundle keeps
-- entirely independent lineage.
-- #############################################################################

CREATE TABLE public.scp_item_version_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE CASCADE,
  profession_id uuid NOT NULL REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  -- Why this item is valid evidence for THIS role. Owner decision D: an item
  -- is reused because a job analysis says it applies, not for convenience.
  job_analysis_reference text,
  sme_review_status text NOT NULL DEFAULT 'pending'
    CHECK (sme_review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, profession_id)
);

COMMENT ON TABLE public.scp_item_version_professions IS
  'Owner decision D. Declares that a profession-module item version is '
  'approved as evidence for a given profession. Zero rows = a Core item '
  '(country- and role-neutral, spec 7.2). More than one row = deliberate, '
  'SME-reviewed reuse across roles -- the alternative to duplicating an '
  'identical question three times purely to satisfy a structural rule. Each '
  'profession bundle still pins its own forms and versions, so the roles '
  'remain separately evolvable.';

CREATE INDEX scp_item_version_professions_profession_idx
  ON public.scp_item_version_professions (profession_id);

CREATE TRIGGER scp_item_version_professions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_version_professions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_item_version_professions TO authenticated;
GRANT ALL ON public.scp_item_version_professions TO service_role;
ALTER TABLE public.scp_item_version_professions ENABLE ROW LEVEL SECURITY;

-- Item-bank adjacent: authoring roles only, same default-deny as the bank.
CREATE POLICY scp_item_version_professions_author_only ON public.scp_item_version_professions
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));


-- The child-of-published guard needs to know about the new table.
CREATE OR REPLACE FUNCTION public.scp_guard_child_of_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _item_version_id uuid;
  _row record;
BEGIN
  _row := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME IN ('scp_item_texts', 'scp_item_options', 'scp_item_version_professions') THEN
    SELECT content_status INTO _status
      FROM public.scp_item_versions WHERE id = _row.item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_item_option_texts' THEN
    SELECT o.item_version_id INTO _item_version_id
      FROM public.scp_item_options o WHERE o.id = _row.item_option_id;
    SELECT content_status INTO _status
      FROM public.scp_item_versions WHERE id = _item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_form_items' THEN
    SELECT av.content_status INTO _status
      FROM public.scp_forms f
      JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
      WHERE f.id = _row.form_id;
  ELSIF TG_TABLE_NAME = 'scp_role_weight_profile_weights' THEN
    SELECT content_status INTO _status
      FROM public.scp_role_weight_profiles WHERE id = _row.role_weight_profile_id;
  END IF;

  IF _status IS NOT NULL AND _status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'SCP_PUBLISHED_IMMUTABLE: % cannot be modified because its parent version is "%". Create a new version instead.',
      TG_TABLE_NAME, _status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- #############################################################################
-- SECTION 4 -- Decision B: the non-operational gate
--
-- Returns WHY a bundle version can or cannot be assigned, rather than a bare
-- boolean, so the assignment path in PR-C can surface an accurate reason and
-- the admin UI in PR-B can show what is still missing.
--
-- 'blocked'   -- must never be assigned to anyone
-- 'pilot_only'-- may be assigned to consenting pilot participants only; no
--                selection decisions (spec 14, validation_status pilot)
-- 'assignable'-- may be used with real candidates as decision support
-- #############################################################################

CREATE OR REPLACE FUNCTION public.scp_bundle_version_assignability(_bundle_version_id uuid)
RETURNS TABLE (assignability text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bv public.scp_bundle_versions%ROWTYPE;
  _core public.scp_assessment_versions%ROWTYPE;
  _module public.scp_assessment_versions%ROWTYPE;
  _scoring public.scp_scoring_versions%ROWTYPE;
  _unpublished_items integer;
  _unreviewed_legal integer;
  _unapproved_language integer;
BEGIN
  SELECT * INTO _bv FROM public.scp_bundle_versions WHERE id = _bundle_version_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_NOT_FOUND'::text; RETURN;
  END IF;

  IF _bv.retired_at IS NOT NULL THEN
    RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_RETIRED'::text; RETURN;
  END IF;
  IF _bv.content_status <> 'published' THEN
    RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_NOT_PUBLISHED'::text; RETURN;
  END IF;

  SELECT * INTO _core FROM public.scp_assessment_versions WHERE id = _bv.core_assessment_version_id;
  SELECT * INTO _module FROM public.scp_assessment_versions WHERE id = _bv.module_assessment_version_id;

  IF _core.content_status <> 'published' OR _core.retired_at IS NOT NULL THEN
    RETURN QUERY SELECT 'blocked'::text, 'CORE_VERSION_NOT_PUBLISHED'::text; RETURN;
  END IF;
  IF _module.content_status <> 'published' OR _module.retired_at IS NOT NULL THEN
    RETURN QUERY SELECT 'blocked'::text, 'MODULE_VERSION_NOT_PUBLISHED'::text; RETURN;
  END IF;

  IF _bv.scoring_version_id IS NULL THEN
    RETURN QUERY SELECT 'blocked'::text, 'NO_SCORING_VERSION'::text; RETURN;
  END IF;
  SELECT * INTO _scoring FROM public.scp_scoring_versions WHERE id = _bv.scoring_version_id;
  IF _scoring.content_status <> 'published' OR _scoring.retired_at IS NOT NULL THEN
    RETURN QUERY SELECT 'blocked'::text, 'SCORING_VERSION_NOT_PUBLISHED'::text; RETURN;
  END IF;

  -- Acceptance criterion 15: a draft item can never be assigned.
  SELECT count(*) INTO _unpublished_items
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id)
      AND (iv.content_status <> 'published' OR iv.retired_at IS NOT NULL);
  IF _unpublished_items > 0 THEN
    RETURN QUERY SELECT 'blocked'::text, 'FORM_CONTAINS_UNPUBLISHED_ITEMS'::text; RETURN;
  END IF;

  -- Owner decision C, enforced a second time at assignment: legally dependent
  -- content must never reach a candidate without a recorded legal review.
  SELECT count(*) INTO _unreviewed_legal
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id)
      AND iv.legal_basis_required
      AND iv.legal_review_status <> 'approved';
  IF _unreviewed_legal > 0 THEN
    RETURN QUERY SELECT 'blocked'::text, 'LEGAL_REVIEW_PENDING'::text; RETURN;
  END IF;

  -- Spec T-012: a language cannot be administered until every item text in it
  -- is an approved adaptation.
  SELECT count(*) INTO _unapproved_language
    FROM public.scp_form_items fi
    JOIN public.scp_item_texts it ON it.item_version_id = fi.item_version_id
    WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id)
      AND it.adaptation_status NOT IN ('source', 'approved');
  IF _unapproved_language > 0 THEN
    RETURN QUERY SELECT 'blocked'::text, 'LANGUAGE_ADAPTATION_NOT_APPROVED'::text; RETURN;
  END IF;

  -- Owner decision B: a DPIA gates real recruitment use. Anything short of an
  -- operational validation status is not usable with real candidates.
  IF _bv.validation_status = 'design' THEN
    RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_DESIGN'::text; RETURN;
  END IF;
  IF _bv.validation_status = 'pilot' THEN
    RETURN QUERY SELECT 'pilot_only'::text, 'VALIDATION_STATUS_PILOT'::text; RETURN;
  END IF;
  IF _bv.validation_status = 'retired' THEN
    RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_RETIRED'::text; RETURN;
  END IF;

  RETURN QUERY SELECT 'assignable'::text, _bv.validation_status::text;
END;
$$;

COMMENT ON FUNCTION public.scp_bundle_version_assignability(uuid) IS
  'Owner decision B. The single gate PR-C''s assignment path MUST call before '
  'creating any Security Competency assignment. Returns blocked / pilot_only / '
  'assignable plus a stable machine-readable reason. Defaults to blocked for '
  'every unfinished state, so a half-built bundle cannot reach a candidate by '
  'omission -- the failure mode is refusing to assign, never assigning '
  'something unapproved.';

REVOKE ALL ON FUNCTION public.scp_bundle_version_assignability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_bundle_version_assignability(uuid) TO authenticated, service_role;


INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version',
  'scp-scoring-v1',
  'created',
  'Owner decisions A-D implemented as schema (see docs/assessment/governance/owner-decisions.md).',
  jsonb_build_object(
    'migration', '20260727130000_scp_a2_scoring_versions_and_publication_gates',
    'decision_a', 'scoring weights versioned and configurable',
    'decision_b', 'non-operational assignability gate',
    'decision_c', 'legal review required before publication',
    'decision_d', 'explicit cross-profession item reuse'
  )
);
