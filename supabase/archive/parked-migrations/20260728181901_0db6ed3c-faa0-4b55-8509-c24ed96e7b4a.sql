CREATE OR REPLACE FUNCTION public.scp_guard_version_starts_as_draft()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'SCP_VERSION_MUST_START_AS_DRAFT: a new %.content_status must be "draft" or "in_review", not "%".',
      TG_TABLE_NAME, NEW.content_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scp_item_versions_insert_status ON public.scp_item_versions;
DROP FUNCTION IF EXISTS public.scp_guard_item_insert_status();

CREATE TRIGGER scp_competency_versions_insert_status BEFORE INSERT ON public.scp_competency_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();
CREATE TRIGGER scp_assessment_versions_insert_status BEFORE INSERT ON public.scp_assessment_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();
CREATE TRIGGER scp_item_versions_insert_status BEFORE INSERT ON public.scp_item_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();
CREATE TRIGGER scp_bundle_versions_insert_status BEFORE INSERT ON public.scp_bundle_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();
CREATE TRIGGER scp_scoring_versions_insert_status BEFORE INSERT ON public.scp_scoring_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();
CREATE TRIGGER scp_role_weight_profiles_insert_status BEFORE INSERT ON public.scp_role_weight_profiles FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft();

CREATE OR REPLACE FUNCTION public.scp_bundle_version_assignability(_bundle_version_id uuid)
RETURNS TABLE (assignability text, reason text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bv public.scp_bundle_versions%ROWTYPE;
  _core public.scp_assessment_versions%ROWTYPE;
  _module public.scp_assessment_versions%ROWTYPE;
  _scoring public.scp_scoring_versions%ROWTYPE;
  _core_items integer;
  _module_items integer;
  _total_items integer;
  _unpublished_items integer;
  _unreviewed_legal integer;
  _fully_adapted_languages integer;
BEGIN
  SELECT * INTO _bv FROM public.scp_bundle_versions WHERE id = _bundle_version_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_NOT_FOUND'::text; RETURN; END IF;
  IF _bv.retired_at IS NOT NULL THEN RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_RETIRED'::text; RETURN; END IF;
  IF _bv.content_status <> 'published' THEN RETURN QUERY SELECT 'blocked'::text, 'BUNDLE_NOT_PUBLISHED'::text; RETURN; END IF;
  SELECT * INTO _core FROM public.scp_assessment_versions WHERE id = _bv.core_assessment_version_id;
  SELECT * INTO _module FROM public.scp_assessment_versions WHERE id = _bv.module_assessment_version_id;
  IF _core.content_status <> 'published' OR _core.retired_at IS NOT NULL THEN RETURN QUERY SELECT 'blocked'::text, 'CORE_VERSION_NOT_PUBLISHED'::text; RETURN; END IF;
  IF _module.content_status <> 'published' OR _module.retired_at IS NOT NULL THEN RETURN QUERY SELECT 'blocked'::text, 'MODULE_VERSION_NOT_PUBLISHED'::text; RETURN; END IF;
  IF _bv.scoring_version_id IS NULL THEN RETURN QUERY SELECT 'blocked'::text, 'NO_SCORING_VERSION'::text; RETURN; END IF;
  SELECT * INTO _scoring FROM public.scp_scoring_versions WHERE id = _bv.scoring_version_id;
  IF _scoring.content_status <> 'published' OR _scoring.retired_at IS NOT NULL THEN RETURN QUERY SELECT 'blocked'::text, 'SCORING_VERSION_NOT_PUBLISHED'::text; RETURN; END IF;
  SELECT count(*) INTO _core_items FROM public.scp_form_items WHERE form_id = _bv.core_form_id;
  IF _core_items = 0 THEN RETURN QUERY SELECT 'blocked'::text, 'CORE_FORM_EMPTY'::text; RETURN; END IF;
  SELECT count(*) INTO _module_items FROM public.scp_form_items WHERE form_id = _bv.module_form_id;
  IF _module_items = 0 THEN RETURN QUERY SELECT 'blocked'::text, 'MODULE_FORM_EMPTY'::text; RETURN; END IF;
  SELECT count(*) INTO _unpublished_items FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND (iv.content_status <> 'published' OR iv.retired_at IS NOT NULL);
  IF _unpublished_items > 0 THEN RETURN QUERY SELECT 'blocked'::text, 'FORM_CONTAINS_UNPUBLISHED_ITEMS'::text; RETURN; END IF;
  SELECT count(*) INTO _unreviewed_legal FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND iv.legal_basis_required AND iv.legal_review_status <> 'approved';
  IF _unreviewed_legal > 0 THEN RETURN QUERY SELECT 'blocked'::text, 'LEGAL_REVIEW_PENDING'::text; RETURN; END IF;
  SELECT count(DISTINCT fi.item_version_id) INTO _total_items FROM public.scp_form_items fi WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id);
  SELECT count(*) INTO _fully_adapted_languages FROM (
    SELECT it.language FROM public.scp_form_items fi JOIN public.scp_item_texts it ON it.item_version_id = fi.item_version_id
    WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND it.adaptation_status IN ('source', 'approved')
    GROUP BY it.language HAVING count(DISTINCT fi.item_version_id) = _total_items
  ) complete_languages;
  IF _fully_adapted_languages = 0 THEN RETURN QUERY SELECT 'blocked'::text, 'NO_FULLY_ADAPTED_LANGUAGE'::text; RETURN; END IF;
  IF _bv.validation_status = 'design' THEN RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_DESIGN'::text; RETURN; END IF;
  IF _bv.validation_status = 'pilot' THEN RETURN QUERY SELECT 'pilot_only'::text, 'VALIDATION_STATUS_PILOT'::text; RETURN; END IF;
  IF _bv.validation_status = 'retired' THEN RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_RETIRED'::text; RETURN; END IF;
  RETURN QUERY SELECT 'assignable'::text, _bv.validation_status::text;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_bundle_version_assignability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_bundle_version_assignability(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assessment_assignments_block_retired_reactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _retired_at timestamptz;
BEGIN
  IF OLD.status NOT IN ('completed', 'expired', 'cancelled') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('invited', 'opened', 'started') THEN RETURN NEW; END IF;
  SELECT retired_at INTO _retired_at FROM public.assessment_versions WHERE id = NEW.assessment_version_id;
  IF _retired_at IS NOT NULL AND _retired_at <= now() THEN
    RAISE EXCEPTION 'ASSESSMENT_RETIRED: assignment % cannot be reactivated from "%" to "%" because assessment version % was retired at %.',
      OLD.id, OLD.status, NEW.status, NEW.assessment_version_id, _retired_at USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_assignments_block_retired_reactivation_trg BEFORE UPDATE ON public.assessment_assignments FOR EACH ROW EXECUTE FUNCTION public.assessment_assignments_block_retired_reactivation();

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata) VALUES (
  'legacy_retirement', 'scp-a3-high-findings', 'updated',
  'Closed HIGH-1, HIGH-2 and HIGH-3 from the PR #11 independent review.',
  jsonb_build_object('migration', '20260727140000_scp_a3_close_high_findings')
);