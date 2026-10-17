-- =============================================================================
-- 20270322090000 -- Passport in an application: a faithful preview of what
-- the employer will see, before the holder chooses to share.
--
-- Canonical forward slot after 20270321090000. Schema-first: the application
-- change that uses it (sharing off by default, an explicit choice, the preview)
-- ships separately, after this is installed.
--
-- An application share is always the employer_review package for 30 days
-- with no purpose (sp_submit_application_with_cv_source ->
-- sp_share_passport_with_application). The employer reads it through
-- sp_disclosure_payload. A preview must be THAT payload, not a description of
-- it, or the holder consents to something they have not seen. So this builds
-- the payload with the same builder from a disclosure row that exists only
-- inside a sub-transaction, which is then rolled back: nothing is stored,
-- nothing is shared, no access is recorded, no event is written.
--
-- The holder's live Auth session is required (the Passport's rule); the
-- preview row's insert is also behind the sp_disclosures write guard.
--
-- Rollback: supabase/rollback/20270322090000_sp_preview_application_disclosure_rollback.sql
-- Suite:    supabase/tests/sp_preview_application_disclosure_test.sql
-- =============================================================================
BEGIN;

CREATE FUNCTION public.sp_preview_application_disclosure()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _id uuid; _payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.sp_assert_passport_session();
  BEGIN
    -- The same package, term and (absent) purpose an application share gets.
    -- A link-shaped row (token_hash set, no application) so that no
    -- application is named; the payload does not depend on either.
    INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash, expires_at)
    VALUES (auth.uid(), 'employer_review', 'preview:' || gen_random_uuid()::text, now() + interval '30 days')
    RETURNING id INTO _id;
    _payload := public.sp_disclosure_payload(_id);
    RAISE EXCEPTION 'SP_PREVIEW_DISCARDED' USING ERRCODE = 'SPPRV';
  EXCEPTION WHEN SQLSTATE 'SPPRV' THEN
    NULL;  -- the row, and anything it touched, is gone; _payload is kept
  END;
  RETURN coalesce(_payload, jsonb_build_object('status', 'unavailable'));
END $$;
REVOKE ALL ON FUNCTION public.sp_preview_application_disclosure() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sp_preview_application_disclosure() TO authenticated;
COMMENT ON FUNCTION public.sp_preview_application_disclosure() IS
  'The holder''s own preview of what an employer receives when the Passport is shared with an application '
  '(employer_review, 30 days): the same payload builder, nothing stored. Requires a live session. 20270322090000.';

COMMIT;
