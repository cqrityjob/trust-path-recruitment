-- Rollback of 20270212090000_sp_catalogue_research_foundation.sql
--
-- A rollback refuses rather than destroys. It stops if a holder has made a
-- catalogue request, if a research record or a definition that needs the new
-- shape still exists (roll back 20270214090000 and then 20270213090000 first,
-- in that order), or if a claim already carries one of the new credential
-- classes. Prefer a forward fix.
--
-- The application does not need this schema to keep working: without it the
-- picker simply has no "not yet available" section and no request path, and
-- every definition that existed before keeps working.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.sp_catalogue_requests') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sp_catalogue_requests) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: catalogue requests exist; archive them before rolling back';
  END IF;
  IF to_regclass('public.sp_catalogue_research_records') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sp_catalogue_research_records) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: research records exist; roll back 20270213090000 first';
  END IF;
  IF to_regclass('public.sp_certification_definition_aliases') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sp_certification_definition_aliases) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: definition aliases exist; roll back 20270213090000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_details
              WHERE credential_class IN ('professional_qualification', 'professional_designation',
                                         'assessed_certificate', 'course_certificate')) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: claims carry the new credential classes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_definition_metadata
              WHERE credential_class IN ('professional_qualification', 'professional_designation',
                                         'assessed_certificate', 'course_certificate')) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: definitions use the new credential classes; roll back 20270213090000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_definition_reviews
              WHERE professional_domain IN ('insurance', 'risk_compliance', 'resilience_safety')) THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: definitions use the new subject domains; roll back 20270213090000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_certification_definitions
              WHERE abbreviation IS NULL OR length(btrim(abbreviation)) > 12
                 OR maintenance_policy_type = 'not_assessed') THEN
    RAISE EXCEPTION 'SP_RESEARCH_FOUNDATION_ROLLBACK_REFUSED: definitions need the relaxed abbreviation or maintenance policy; roll back 20270213090000 first';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.sp_admin_review_research_record(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.sp_admin_resolve_catalogue_request(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.sp_list_my_catalogue_requests();
DROP FUNCTION IF EXISTS public.sp_request_catalogue_definition(jsonb);
DROP FUNCTION IF EXISTS public.sp_catalogue_unavailable_matches(text, integer);

DROP TABLE IF EXISTS public.sp_catalogue_requests;
DROP TRIGGER IF EXISTS sp_catalogue_research_provenance_immutable_trg ON public.sp_catalogue_research_records;
DROP TABLE IF EXISTS public.sp_catalogue_research_records;
DROP FUNCTION IF EXISTS public.sp_catalogue_research_provenance_immutable();
DROP TABLE IF EXISTS public.sp_certification_definition_aliases;

-- Restore the three constraints exactly as 20261111090000 and 20261123090000 left them.
ALTER TABLE public.sp_certification_definitions
  DROP CONSTRAINT IF EXISTS sp_certification_definitions_maintenance_policy_type_check;
ALTER TABLE public.sp_certification_definitions
  ADD CONSTRAINT sp_certification_definitions_maintenance_policy_type_check
  CHECK (maintenance_policy_type = ANY (ARRAY[
    'recertification_cycle', 'cycle_plus_annual_maintenance', 'annual_compliance', 'none_published']));

ALTER TABLE public.sp_certification_definitions
  DROP CONSTRAINT IF EXISTS sp_certification_definitions_abbreviation_check;
ALTER TABLE public.sp_certification_definitions
  ADD CONSTRAINT sp_certification_definitions_abbreviation_check
  CHECK (length(btrim(abbreviation)) BETWEEN 1 AND 12);
ALTER TABLE public.sp_certification_definitions
  ALTER COLUMN abbreviation SET NOT NULL;

ALTER TABLE public.sp_credential_definition_reviews
  DROP CONSTRAINT IF EXISTS sp_credential_definition_reviews_professional_domain_check;
ALTER TABLE public.sp_credential_definition_reviews
  ADD CONSTRAINT sp_credential_definition_reviews_professional_domain_check
  CHECK (professional_domain = ANY (ARRAY[
    'security_operations', 'security_management', 'physical_security',
    'information_security', 'investigation', 'financial_crime']));

DELETE FROM public.sp_credential_classes
 WHERE code IN ('professional_qualification', 'professional_designation',
                'assessed_certificate', 'course_certificate')
   AND NOT EXISTS (SELECT 1 FROM public.sp_credential_details d WHERE d.credential_class = sp_credential_classes.code);

COMMIT;
