-- Removing this entry point preserves every claim and metadata row.
BEGIN;
DROP FUNCTION public.sp_save_international_credential(jsonb);
DROP POLICY sp_evidence_session_read ON storage.objects;
DROP POLICY sp_credential_session_read ON public.sp_claims;
DROP TRIGGER sp_credential_session_write ON public.sp_claims;
DO $$ DECLARE _table text; BEGIN
 FOREACH _table IN ARRAY ARRAY['sp_passport_profiles','sp_credential_details','sp_evidence','sp_verification_requests','sp_verification_decisions','sp_disclosures','sp_disclosure_items'] LOOP
   EXECUTE format('DROP POLICY sp_private_session_read ON public.%I',_table);
   EXECUTE format('DROP TRIGGER sp_private_session_write ON public.%I',_table);
 END LOOP;
END $$;
DROP FUNCTION public.sp_passport_session_write_guard();
DROP FUNCTION public.sp_passport_session_active();
COMMIT;
