-- Saved inventory: exactly 34 unchanged tables, synthetic local replay only.
\set ON_ERROR_STOP on
\i supabase/rollback/20270218090000_catalogue_internal_metadata_boundary_rollback.sql
BEGIN;
CREATE TEMP TABLE c5_unchanged AS SELECT c.oid,c.relname,c.relacl,c.relrowsecurity,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(ARRAY['assessment_versions','assessments','scp_assessment_families','scp_behaviour_competency_map','scp_bundles','scp_competencies','scp_competency_facets','scp_competency_versions','scp_contract_versions','scp_evidence_source_types','scp_followup_prompts','scp_jurisdictions','scp_maturity_thresholds','scp_observable_behaviours','scp_processing_purposes','scp_professions','scp_purpose_versions','scp_recruitment_content_links','scp_recruitment_role_profiles','scp_report_versions','scp_role_competency_map','scp_roles','scp_scenarios','sp_certification_definitions','sp_certification_issuer_aliases','sp_certification_issuers','sp_credential_classes','sp_credential_definition_reviews','sp_credential_definition_versions','sp_credential_organisation_roles','sp_credential_scopes','sp_recognition_policies','sp_skill_types','sp_sub_jurisdictions']);
CREATE TEMP TABLE c5_rows(name text, fingerprint text);
DO $$ DECLARE t text; h text; BEGIN
 FOREACH t IN ARRAY ARRAY['assessment_versions','assessments','scp_assessment_families','scp_behaviour_competency_map','scp_bundles','scp_competencies','scp_competency_facets','scp_competency_versions','scp_contract_versions','scp_evidence_source_types','scp_followup_prompts','scp_jurisdictions','scp_maturity_thresholds','scp_observable_behaviours','scp_processing_purposes','scp_professions','scp_purpose_versions','scp_recruitment_content_links','scp_recruitment_role_profiles','scp_report_versions','scp_role_competency_map','scp_roles','scp_scenarios','sp_certification_definitions','sp_certification_issuer_aliases','sp_certification_issuers','sp_credential_classes','sp_credential_definition_reviews','sp_credential_definition_versions','sp_credential_organisation_roles','sp_credential_scopes','sp_recognition_policies','sp_skill_types','sp_sub_jurisdictions'] || ARRAY['graph_versions','scp_bundle_versions','scp_role_weight_profiles','scp_forms','scp_form_blocks'] LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM public.%I x',t) INTO h;
  INSERT INTO c5_rows VALUES(t,h);
 END LOOP;
END $$;
\i supabase/migrations/20270218090000_catalogue_internal_metadata_boundary.sql
DO $$ DECLARE t record; h text; BEGIN
 IF (SELECT count(*) FROM c5_unchanged)<>34 THEN RAISE EXCEPTION 'C5 PRESERVE inventory'; END IF;
 IF EXISTS (SELECT FROM c5_unchanged b JOIN pg_class c ON c.oid=b.oid
 WHERE c.relacl IS DISTINCT FROM b.relacl OR c.relrowsecurity IS DISTINCT FROM b.relrowsecurity
 OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) IS DISTINCT FROM b.policies
 OR (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM b.columns)
 THEN RAISE EXCEPTION 'C5 PRESERVE 34 policy/grant/column state changed'; END IF;
 FOR t IN SELECT * FROM c5_rows LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM public.%I x',t.name) INTO h;
  IF h IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'C5 PRESERVE row data changed: %',t.name; END IF;
 END LOOP;
 RAISE NOTICE 'ok C5 PRESERVE: 34 ACL/policy/column states and all 39 row fingerprints unchanged';
END $$;
ROLLBACK;
\i supabase/migrations/20270218090000_catalogue_internal_metadata_boundary.sql
