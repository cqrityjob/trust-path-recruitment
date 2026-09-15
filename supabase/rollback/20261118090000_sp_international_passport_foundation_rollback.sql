BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.sp_credential_details)
 OR EXISTS (SELECT 1 FROM public.sp_evidence_extractions)
 OR EXISTS (SELECT 1 FROM public.sp_credential_adapter_mappings)
 OR EXISTS (SELECT 1 FROM public.sp_credential_definition_metadata)
 OR EXISTS (SELECT 1 FROM public.sp_credential_definition_jurisdictions)
 THEN RAISE EXCEPTION 'SP_INTERNATIONAL_ROLLBACK_REFUSED: adopted metadata requires forward repair'; END IF;
END $$;
DROP TRIGGER sp_guard_credential_expiry ON public.sp_claims;
DROP FUNCTION public.sp_guard_credential_expiry();
DROP TABLE public.sp_evidence_extractions;
DROP TABLE public.sp_credential_details;
DROP TABLE public.sp_credential_adapter_mappings;
DROP TABLE public.sp_credential_definition_jurisdictions;
DROP TABLE public.sp_credential_definition_metadata;
DROP TABLE public.sp_credential_jurisdictions;
DROP TABLE public.sp_credential_classes;
DROP FUNCTION public.sp_guard_credential_details();
DROP FUNCTION public.sp_extractions_append_only();
DROP FUNCTION public.sp_is_passport_credential(text,text);
COMMIT;
