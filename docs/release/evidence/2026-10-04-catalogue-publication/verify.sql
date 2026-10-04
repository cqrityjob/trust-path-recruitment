-- Read-only verification of the catalogue publication (20270214090000), for production.
-- "Unchanged" lines are compared with the same query run before the apply; the others are exact expectations.
with research_added as (select credential_code code from public.sp_catalogue_research_records where reconciliation_outcome='added_approved')
select k, v from (
select '01 ledger' k, count(*)::text||' '||md5(string_agg(version||':'||name, E'\n' order by version collate "C")) v from supabase_migrations.schema_migrations
union all select '02 publish_row', string_agg(version||':'||name, ',' order by version collate "C") from supabase_migrations.schema_migrations where version like '20270214%'
union all select '03 researched_active', count(*)::text||' of '||(select count(*) from research_added) from public.sp_credential_types t where t.code in (select code from research_added) and t.is_active
union all select '04 researched_shape', count(*)::text||' ok='||count(*) filter (where t.scope_code='global_professional' and t.jurisdiction_code is null and t.market_pack_code is null and not t.allows_no_expiry and t.legal_review_state='pending') from public.sp_credential_types t where t.code in (select code from research_added)
union all select '05 intl_active', count(*)::text from public.sp_credential_types where code like 'INTL\_%' and is_active
union all select '06 types_total_active', count(*)::text||' active='||count(*) filter (where is_active) from public.sp_credential_types
union all select '07 active_outside_intl_unchanged', md5(coalesce(string_agg(code, ',' order by code collate "C"),''))||' n='||count(*) from public.sp_credential_types where is_active and code not like 'INTL\_%'
union all select '08 old_active_intl_unchanged', md5(coalesce(string_agg(code, ',' order by code collate "C"),''))||' n='||count(*) from public.sp_credential_types where is_active and code like 'INTL\_%' and code not in (select code from research_added)
union all select '09 types_all_cols_except_active', count(*)::text||' '||md5(coalesce(string_agg((to_jsonb(t) - 'is_active' - 'updated_at')::text, E'\n' order by t.code collate "C"),'')) from public.sp_credential_types t
union all select '10 old_types_fp', md5(string_agg(code||'|'||is_active||'|'||coalesce(scope_code,'')||'|'||coalesce(jurisdiction_code,'')||'|'||coalesce(market_pack_code,'')||'|'||coalesce(claim_type,'')||'|'||coalesce(category,'')||'|'||coalesce(symbol_label,'')||'|'||coalesce(pilot_state,'')||'|'||allows_no_expiry||'|'||coalesce(legal_review_state,''), E'\n' order by code collate "C"))||' n='||count(*) from public.sp_credential_types where code not in (select code from research_added)
union all select '11 market_packs', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_market_packs t
union all select '12 pilot_members', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_pilot_members t
union all select '13 def_metadata', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_definition_metadata t
union all select '14 def_reviews', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_definition_reviews t
union all select '15 cert_sources', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_certification_sources t
union all select '16 org_roles', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_organisation_roles t
union all select '17 def_versions', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_definition_versions t
union all select '18 adapter_mappings', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_adapter_mappings t
union all select '19 def_jurisdictions', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_credential_definition_jurisdictions t
union all select '20 cert_defs', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_certification_definitions t
union all select '21 issuers', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_certification_issuers t
union all select '22 aliases', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_certification_definition_aliases t
union all select '23 research_records', count(*)::text||' '||md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"),'')) from public.sp_catalogue_research_records t
union all select '24 requests', count(*)::text from public.sp_catalogue_requests
union all select '25 claims', count(*)::text||' '||md5(string_agg(id::text||'|'||coalesce(credential_code,'')||'|'||assertion_level||'|'||lifecycle_state||'|'||coalesce(jurisdiction_code,'')||'|'||coalesce(claimed_issuer_name,''), E'\n' order by id::text collate "C")) from public.sp_claims
union all select '26 claims_on_new_codes', count(*)::text from public.sp_claims where credential_code in (select code from research_added)
union all select '27 details_evidence_disclosures', (select count(*) from public.sp_credential_details)||'/'||(select count(*) from public.sp_evidence)||'/'||(select count(*) from public.sp_disclosures)
) q order by k;
