-- International credential foundation. Additive; no personal-data backfill.
-- CLI-created 20260915160557, ordered after the verified 20261116 frontier
-- and the concurrent 20261117 BESKT slot. No hosted execution authorized.
BEGIN;

CREATE TABLE public.sp_credential_classes (
  code text PRIMARY KEY,
  name_sv text NOT NULL,
  name_en text NOT NULL
);
INSERT INTO public.sp_credential_classes VALUES
 ('certification','Certifiering','Certification'),
 ('professional_licence','Yrkeslicens','Professional licence'),
 ('regulated_authorisation','Reglerad behörighet','Regulated authorisation'),
 ('permit','Tillstånd','Permit'),
 ('mandatory_training','Obligatoriskt yrkesutbildningsbevis','Mandatory professional training credential'),
 ('occupational_card','Yrkeslegitimation','Occupational card'),
 ('other_professional_credential','Annat yrkesbevis','Other professional credential');

-- A territory is not an issuer's domicile. Global does not mean universally
-- recognised. Supranational scopes require their own governed catalogue row.
CREATE TABLE public.sp_credential_jurisdictions (
  code text PRIMARY KEY CHECK (length(code) BETWEEN 2 AND 64),
  jurisdiction_type text NOT NULL CHECK (jurisdiction_type IN
    ('national','regional','supranational','global')),
  country_code text REFERENCES public.sp_jurisdictions(code),
  subdivision_code text REFERENCES public.sp_sub_jurisdictions(code),
  name_original text NOT NULL CHECK (length(btrim(name_original)) > 0),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  source_url text CHECK (source_url IS NULL OR source_url LIKE 'https://%'),
  is_active boolean NOT NULL DEFAULT true,
  CHECK ((jurisdiction_type = 'national' AND country_code IS NOT NULL AND subdivision_code IS NULL)
      OR (jurisdiction_type = 'regional' AND country_code IS NOT NULL AND subdivision_code IS NOT NULL)
      OR (jurisdiction_type IN ('supranational','global') AND country_code IS NULL AND subdivision_code IS NULL)),
  CHECK (subdivision_code IS NULL OR left(subdivision_code,2) = country_code)
);
INSERT INTO public.sp_credential_jurisdictions
 (code,jurisdiction_type,country_code,name_original,name_sv,name_en)
 SELECT code,'national',code,name_en,name_sv,name_en FROM public.sp_jurisdictions;
INSERT INTO public.sp_credential_jurisdictions
 (code,jurisdiction_type,country_code,subdivision_code,name_original,name_sv,name_en)
 SELECT code,'regional',jurisdiction_code,code,name_sv,name_sv,name_en FROM public.sp_sub_jurisdictions;
-- No supranational/global validity is invented or assigned to a holder.

CREATE TABLE public.sp_credential_definition_metadata (
  credential_code text PRIMARY KEY REFERENCES public.sp_credential_types(code),
  credential_class text NOT NULL REFERENCES public.sp_credential_classes(code),
  original_name text NOT NULL CHECK (length(btrim(original_name)) > 0),
  original_language text CHECK (original_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  description text,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  external_revision text,
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sp_credential_definition_jurisdictions (
  credential_code text NOT NULL REFERENCES public.sp_credential_types(code),
  jurisdiction_code text NOT NULL REFERENCES public.sp_credential_jurisdictions(code),
  relation text NOT NULL CHECK (relation IN ('issuing','validity')),
  source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
  reviewed_on date NOT NULL,
  PRIMARY KEY (credential_code,jurisdiction_code,relation)
);
CREATE INDEX ON public.sp_credential_definition_jurisdictions(jurisdiction_code);

-- Versioned adapter mappings, not claims of VC/Open Badges compliance.
CREATE TABLE public.sp_credential_adapter_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_code text NOT NULL REFERENCES public.sp_credential_types(code),
  adapter_namespace text NOT NULL CHECK (length(btrim(adapter_namespace)) BETWEEN 1 AND 100),
  adapter_version text NOT NULL CHECK (length(btrim(adapter_version)) BETWEEN 1 AND 40),
  external_identifier text NOT NULL CHECK (length(btrim(external_identifier)) BETWEEN 1 AND 1000),
  mapping jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(mapping) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credential_code,adapter_namespace,adapter_version,external_identifier)
);

CREATE TABLE public.sp_credential_details (
  claim_id uuid PRIMARY KEY REFERENCES public.sp_claims(id) ON DELETE RESTRICT,
  credential_class text NOT NULL REFERENCES public.sp_credential_classes(code),
  original_language text CHECK (original_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  issuing_country_code text REFERENCES public.sp_jurisdictions(code),
  issuing_jurisdiction_code text REFERENCES public.sp_credential_jurisdictions(code),
  validity_jurisdiction_code text REFERENCES public.sp_credential_jurisdictions(code),
  no_expiry boolean, -- NULL = unknown; never infer lifetime validity from a missing date.
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sp_credential_details(credential_class);
CREATE INDEX ON public.sp_credential_details(issuing_jurisdiction_code);
CREATE INDEX ON public.sp_credential_details(validity_jurisdiction_code);
CREATE INDEX ON public.sp_credential_details(issuing_country_code);

-- Machine observations are immutable attempts. No row here is a verification
-- decision. An authorised human/source decision still uses the existing path.
CREATE TABLE public.sp_evidence_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.sp_evidence(id) ON DELETE RESTRICT,
  process_version text NOT NULL CHECK (length(btrim(process_version)) BETWEEN 1 AND 100),
  model_version text CHECK (model_version IS NULL OR length(btrim(model_version)) BETWEEN 1 AND 100),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  original_source text NOT NULL CHECK (length(btrim(original_source)) BETWEEN 1 AND 1000),
  document_language text,
  document_country text REFERENCES public.sp_jurisdictions(code),
  sensitivity text NOT NULL CHECK (sensitivity IN ('personal','restricted')),
  retention_state text NOT NULL CHECK (retention_state IN ('retained','pending_erasure','erased')),
  extraction_status text NOT NULL CHECK (extraction_status IN ('completed','failed','needs_review')),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  proposed_fields jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(proposed_fields) = 'object'),
  human_review_state text NOT NULL DEFAULT 'pending' CHECK (human_review_state = 'pending'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (extraction_status <> 'completed' OR confidence IS NOT NULL)
);
CREATE INDEX ON public.sp_evidence_extractions(evidence_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.sp_is_passport_credential(_type text, _code text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT _type IN ('certification','licence')
    OR (_code IS NOT NULL AND _type IN ('training','specialisation'));
$$;
REVOKE ALL ON FUNCTION public.sp_is_passport_credential(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sp_is_passport_credential(text,text) TO authenticated,service_role;

CREATE FUNCTION public.sp_guard_credential_details()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.sp_claims%ROWTYPE; j public.sp_credential_jurisdictions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.sp_claims WHERE id = NEW.claim_id FOR UPDATE;
 IF NOT FOUND OR NOT public.sp_is_passport_credential(c.claim_type,c.credential_code)
 THEN RAISE EXCEPTION 'SP_NOT_A_CREDENTIAL'; END IF;
 IF auth.uid() IS DISTINCT FROM c.holder_user_id THEN RAISE EXCEPTION 'SP_NOT_OWNER'; END IF;
 IF c.assertion_level <> 'self_declared' OR c.lifecycle_state NOT IN ('draft','active')
    OR EXISTS (SELECT 1 FROM public.sp_verification_requests WHERE claim_id=c.id)
 THEN RAISE EXCEPTION 'SP_CORRECTION_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.claim_id<>OLD.claim_id OR NEW.created_at<>OLD.created_at)
 THEN RAISE EXCEPTION 'SP_DETAILS_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.credential_class IN ('professional_licence','regulated_authorisation','permit') AND c.claim_type <> 'licence'
 THEN RAISE EXCEPTION 'SP_CREDENTIAL_CLASS_CONFLICT'; END IF;
 IF NEW.no_expiry IS TRUE AND c.valid_until IS NOT NULL THEN RAISE EXCEPTION 'SP_EXPIRY_CONFLICT'; END IF;
 IF NEW.issuing_jurisdiction_code IS NOT NULL THEN
   SELECT * INTO j FROM public.sp_credential_jurisdictions WHERE code=NEW.issuing_jurisdiction_code;
   IF j.country_code IS NOT NULL AND j.country_code IS DISTINCT FROM NEW.issuing_country_code
   THEN RAISE EXCEPTION 'SP_ISSUING_COUNTRY_CONFLICT'; END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_guard_credential_details() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_guard_credential_details BEFORE INSERT OR UPDATE ON public.sp_credential_details
 FOR EACH ROW EXECUTE FUNCTION public.sp_guard_credential_details();

CREATE FUNCTION public.sp_extractions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'SP_EXTRACTION_APPEND_ONLY'; END $$;
REVOKE ALL ON FUNCTION public.sp_extractions_append_only() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_extractions_append_only BEFORE UPDATE OR DELETE ON public.sp_evidence_extractions
 FOR EACH ROW EXECUTE FUNCTION public.sp_extractions_append_only();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sp_credential_classes','sp_credential_jurisdictions',
 'sp_credential_definition_metadata','sp_credential_definition_jurisdictions',
 'sp_credential_adapter_mappings','sp_credential_details','sp_evidence_extractions'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.sp_credential_classes,public.sp_credential_jurisdictions,
 public.sp_credential_definition_metadata,public.sp_credential_definition_jurisdictions,
 public.sp_credential_adapter_mappings TO authenticated,service_role;
CREATE POLICY credential_classes_read ON public.sp_credential_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY credential_jurisdictions_read ON public.sp_credential_jurisdictions FOR SELECT TO authenticated USING (is_active);
-- Resolve through the existing catalogue RLS; do not reveal closed pilot definitions.
CREATE POLICY credential_definitions_read ON public.sp_credential_definition_metadata FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.sp_credential_types c WHERE c.code=credential_code));
CREATE POLICY credential_definition_jurisdictions_read ON public.sp_credential_definition_jurisdictions FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.sp_credential_types c WHERE c.code=credential_code));
CREATE POLICY credential_adapters_read ON public.sp_credential_adapter_mappings FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.sp_credential_types c WHERE c.code=credential_code));
GRANT SELECT,INSERT,UPDATE ON public.sp_credential_details TO authenticated;
CREATE POLICY credential_details_owner ON public.sp_credential_details TO authenticated
 USING (EXISTS (SELECT 1 FROM public.sp_claims c WHERE c.id=claim_id AND c.holder_user_id=(SELECT auth.uid())))
 WITH CHECK (EXISTS (SELECT 1 FROM public.sp_claims c WHERE c.id=claim_id AND c.holder_user_id=(SELECT auth.uid())));
-- Extraction worker credentials do not confer the ability to verify a claim.
GRANT SELECT,INSERT ON public.sp_evidence_extractions TO service_role;

COMMENT ON TABLE public.sp_credential_details IS 'Holder-declared international credential metadata. Not a verification or recognition claim. No existing personal data backfilled.';
COMMENT ON TABLE public.sp_evidence_extractions IS 'Internal append-only extraction proposals with provenance. No machine promotion, no claim overwrite, no recipient access. Execution adapter not implemented.';
COMMENT ON TABLE public.sp_credential_adapter_mappings IS 'Versioned future adapter mappings. No W3C VC/Open Badges compliance or signed credential issuance is claimed.';
CREATE FUNCTION public.sp_guard_credential_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.valid_until IS NOT NULL AND EXISTS (SELECT 1 FROM public.sp_credential_details WHERE claim_id=NEW.id AND no_expiry IS TRUE)
 THEN RAISE EXCEPTION 'SP_EXPIRY_CONFLICT'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_guard_credential_expiry() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sp_guard_credential_expiry BEFORE UPDATE ON public.sp_claims
 FOR EACH ROW EXECUTE FUNCTION public.sp_guard_credential_expiry();
COMMIT;
