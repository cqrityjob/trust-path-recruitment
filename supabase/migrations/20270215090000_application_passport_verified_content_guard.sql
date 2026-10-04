-- F09: both application paths require content the employer payload actually
-- includes. General/link sharing deliberately keeps its separate mixed-standing rule.
CREATE FUNCTION public.sp_require_application_verified_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.sp_claims c
      WHERE c.holder_user_id = NEW.holder_user_id
        AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active'
        AND NEW.package_code IN ('public_card', 'verified_qualifications', 'employer_review', 'full_verification')
        AND (NEW.focus_claim_id IS NULL OR c.id = NEW.focus_claim_id)
    ) OR EXISTS (
      SELECT 1 FROM public.sp_experience_periods e
      WHERE e.holder_user_id = NEW.holder_user_id
        AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
        AND NEW.package_code IN ('public_card', 'verified_experience', 'employer_review', 'full_verification')
        AND NEW.focus_claim_id IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'SP_NO_VERIFIED_APPLICATION_CONTENT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sp_require_application_verified_content() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sp_application_verified_content
  BEFORE INSERT OR UPDATE OF holder_user_id, application_id, package_code, focus_claim_id
  ON public.sp_disclosures FOR EACH ROW
  EXECUTE FUNCTION public.sp_require_application_verified_content();
