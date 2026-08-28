CREATE TABLE public.scp_scoring_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft' CHECK (content_status IN ('draft', 'in_review', 'approved', 'published', 'retired')),
  validation_status text NOT NULL DEFAULT 'design' CHECK (validation_status IN ('design', 'pilot', 'operational-development', 'operational-selection', 'retired')),
  sjt_weight numeric NOT NULL CHECK (sjt_weight >= 0 AND sjt_weight <= 1),
  biq_weight numeric NOT NULL CHECK (biq_weight >= 0 AND biq_weight <= 1),
  core_summary_is_indicative boolean NOT NULL DEFAULT true,
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
  CONSTRAINT scp_scoring_weights_sum_to_one CHECK (abs((sjt_weight + biq_weight) - 1) < 0.0001)
);

CREATE TRIGGER set_scp_scoring_versions_updated_at BEFORE UPDATE ON public.scp_scoring_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER scp_scoring_versions_immutable BEFORE UPDATE ON public.scp_scoring_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_published_immutable();

GRANT SELECT ON public.scp_scoring_versions TO authenticated;
GRANT ALL ON public.scp_scoring_versions TO service_role;
ALTER TABLE public.scp_scoring_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY scp_scoring_versions_read ON public.scp_scoring_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY scp_scoring_versions_author_write ON public.scp_scoring_versions FOR ALL TO authenticated USING (public.scp_can_author(auth.uid())) WITH CHECK (public.scp_can_author(auth.uid()));

INSERT INTO public.scp_scoring_versions (slug, version_number, content_status, validation_status, sjt_weight, biq_weight, notes)
VALUES ('scp-scoring-v1', 1, 'draft', 'design', 0.70, 0.30, 'Spec 8.1 start model, provisional pilot configuration.');

DO $$
DECLARE _rows bigint;
BEGIN
  SELECT count(*) INTO _rows FROM public.scp_bundle_versions;
  IF _rows > 0 THEN
    RAISE EXCEPTION 'SCP_A2_ABORT: scp_bundle_versions contains % row(s); the scoring_version column replacement assumes an empty table.', _rows;
  END IF;
END $$;

ALTER TABLE public.scp_bundle_versions ADD COLUMN scoring_version_id uuid REFERENCES public.scp_scoring_versions(id) ON DELETE RESTRICT;
ALTER TABLE public.scp_bundle_versions DROP COLUMN scoring_version;

CREATE OR REPLACE FUNCTION public.scp_guard_legal_review_before_publish()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status NOT IN ('approved', 'published') THEN RETURN NEW; END IF;
  IF OLD.content_status IN ('approved', 'published') THEN RETURN NEW; END IF;
  IF NEW.legal_basis_required THEN
    IF NEW.legal_review_status <> 'approved' THEN
      RAISE EXCEPTION 'SCP_LEGAL_REVIEW_REQUIRED: item version % relies on legal basis and cannot be approved or published while legal_review_status is "%".',
        NEW.id, NEW.legal_review_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scp_item_versions_legal_gate BEFORE UPDATE ON public.scp_item_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_legal_review_before_publish();

CREATE OR REPLACE FUNCTION public.scp_guard_item_insert_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'SCP_ITEM_MUST_START_AS_DRAFT: a new item version must be created as draft or in_review, not "%".',
      NEW.content_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scp_item_versions_insert_status BEFORE INSERT ON public.scp_item_versions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_item_insert_status();

CREATE TABLE public.scp_item_version_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE CASCADE,
  profession_id uuid NOT NULL REFERENCES public.scp_professions(id) ON DELETE RESTRICT,
  job_analysis_reference text,
  sme_review_status text NOT NULL DEFAULT 'pending' CHECK (sme_review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, profession_id)
);
CREATE INDEX scp_item_version_professions_profession_idx ON public.scp_item_version_professions (profession_id);
CREATE TRIGGER scp_item_version_professions_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.scp_item_version_professions FOR EACH ROW EXECUTE FUNCTION public.scp_guard_child_of_published();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scp_item_version_professions TO authenticated;
GRANT ALL ON public.scp_item_version_professions TO service_role;
ALTER TABLE public.scp_item_version_professions ENABLE ROW LEVEL SECURITY;
CREATE POLICY scp_item_version_professions_author_only ON public.scp_item_version_professions FOR ALL TO authenticated USING (public.scp_can_author(auth.uid())) WITH CHECK (public.scp_can_author(auth.uid()));

CREATE OR REPLACE FUNCTION public.scp_guard_child_of_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _item_version_id uuid; _row record;
BEGIN
  _row := COALESCE(NEW, OLD);
  IF TG_TABLE_NAME IN ('scp_item_texts', 'scp_item_options', 'scp_item_version_professions') THEN
    SELECT content_status INTO _status FROM public.scp_item_versions WHERE id = _row.item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_item_option_texts' THEN
    SELECT o.item_version_id INTO _item_version_id FROM public.scp_item_options o WHERE o.id = _row.item_option_id;
    SELECT content_status INTO _status FROM public.scp_item_versions WHERE id = _item_version_id;
  ELSIF TG_TABLE_NAME = 'scp_form_items' THEN
    SELECT av.content_status INTO _status FROM public.scp_forms f JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id WHERE f.id = _row.form_id;
  ELSIF TG_TABLE_NAME = 'scp_role_weight_profile_weights' THEN
    SELECT content_status INTO _status FROM public.scp_role_weight_profiles WHERE id = _row.role_weight_profile_id;
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'SCP_PUBLISHED_IMMUTABLE: % cannot be modified because its parent version is "%". Create a new version instead.',
      TG_TABLE_NAME, _status USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.scp_bundle_version_assignability(_bundle_version_id uuid)
RETURNS TABLE (assignability text, reason text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT count(*) INTO _unpublished_items FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND (iv.content_status <> 'published' OR iv.retired_at IS NOT NULL);
  IF _unpublished_items > 0 THEN RETURN QUERY SELECT 'blocked'::text, 'FORM_CONTAINS_UNPUBLISHED_ITEMS'::text; RETURN; END IF;
  SELECT count(*) INTO _unreviewed_legal FROM public.scp_form_items fi JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND iv.legal_basis_required AND iv.legal_review_status <> 'approved';
  IF _unreviewed_legal > 0 THEN RETURN QUERY SELECT 'blocked'::text, 'LEGAL_REVIEW_PENDING'::text; RETURN; END IF;
  SELECT count(*) INTO _unapproved_language FROM public.scp_form_items fi JOIN public.scp_item_texts it ON it.item_version_id = fi.item_version_id WHERE fi.form_id IN (_bv.core_form_id, _bv.module_form_id) AND it.adaptation_status NOT IN ('source', 'approved');
  IF _unapproved_language > 0 THEN RETURN QUERY SELECT 'blocked'::text, 'LANGUAGE_ADAPTATION_NOT_APPROVED'::text; RETURN; END IF;
  IF _bv.validation_status = 'design' THEN RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_DESIGN'::text; RETURN; END IF;
  IF _bv.validation_status = 'pilot' THEN RETURN QUERY SELECT 'pilot_only'::text, 'VALIDATION_STATUS_PILOT'::text; RETURN; END IF;
  IF _bv.validation_status = 'retired' THEN RETURN QUERY SELECT 'blocked'::text, 'VALIDATION_STATUS_RETIRED'::text; RETURN; END IF;
  RETURN QUERY SELECT 'assignable'::text, _bv.validation_status::text;
END;
$$;

REVOKE ALL ON FUNCTION public.scp_bundle_version_assignability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_bundle_version_assignability(uuid) TO authenticated, service_role;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata) VALUES (
  'assessment_version', 'scp-scoring-v1', 'created',
  'Owner decisions A-D implemented as schema.',
  jsonb_build_object('migration', '20260727130000_scp_a2_scoring_versions_and_publication_gates')
);