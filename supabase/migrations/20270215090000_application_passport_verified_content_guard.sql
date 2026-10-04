-- F09: both application paths require content the employer payload actually
-- includes. General/link sharing deliberately keeps its separate mixed-standing rule.
CREATE FUNCTION public.sp_require_application_verified_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;
  -- ON DELETE SET NULL clears the focus while a claim/account is erased.
  -- That referential cleanup is not a new sharing decision. Allow only the
  -- nested FK change after the old claim has actually gone; direct updates
  -- and changes to the holder/application/package still require content.
  IF TG_OP = 'UPDATE'
     AND OLD.focus_claim_id IS NOT NULL AND NEW.focus_claim_id IS NULL
     AND NEW.holder_user_id IS NOT DISTINCT FROM OLD.holder_user_id
     AND NEW.application_id IS NOT DISTINCT FROM OLD.application_id
     AND NEW.package_code IS NOT DISTINCT FROM OLD.package_code
     AND pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE id = OLD.focus_claim_id)
  THEN
    -- Losing a focused merit must not broaden consent to the remaining ones.
    NEW.revoked_at := coalesce(NEW.revoked_at, now());
    RETURN NEW;
  END IF;
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
