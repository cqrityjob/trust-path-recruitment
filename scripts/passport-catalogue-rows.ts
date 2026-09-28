// Security Passport — every definition, as the catalogue's predicate reads it.
//
// One loader for the two scripts that diagnose the catalogue from a migrated
// LOCAL database: the coverage matrix (docs/passport/catalogue-coverage-matrix.md)
// and the availability agreement proof, which checks that diagnosis against
// what an ordinary holder is actually offered and can save. Reading the rows
// in one place keeps the matrix and the proof about the same data.
//
// It refuses any host that is not local: nothing here has any business reading
// a hosted catalogue.

import { execFileSync } from "node:child_process";
import type { DiagnosticDefinition } from "../src/lib/security-passport/catalogue-diagnostics";

/** The local database to read, refusing anything that is not loopback. */
export function localCatalogueDatabaseUrl(): string {
  const url =
    process.env.PASSPORT_MATRIX_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    console.error("REFUSING: the Passport catalogue scripts read a LOCAL database only.");
    process.exit(2);
  }
  return url;
}

export const CATALOGUE_ROWS_QUERY = `
select coalesce(json_agg(row_to_json(x) order by x.pack_order, x.sort_order, x.code), '[]') from (
 select t.code, t.name_sv, t.name_en, t.claim_type, t.category, t.scope_code, t.market_pack_code,
  t.jurisdiction_code, t.sub_jurisdiction_code, t.is_active, t.pilot_state, t.legal_review_state,
  t.requires_scope, t.sort_order,
  case when t.scope_code='national_qualification' then 1.5 else case coalesce(t.market_pack_code,'INTL') when 'INTL' then 0 when 'SE' then 1 when 'GB' then 2 when 'GB-NI' then 3 when 'AE-DU' then 4 else 5 end end as pack_order,
  (select a.name_local from public.sp_authorities a where a.id=t.authority_id and a.is_active) as governed_authority,
  (select i.display_name from public.sp_certification_definitions d join public.sp_certification_issuers i on i.id=d.issuer_id and i.is_active where d.credential_code=t.code) as governed_issuer,
  (select a.name_local from public.sp_credential_organisation_roles r join public.sp_authorities a on a.id=r.authority_id and a.is_active where r.credential_code=t.code and r.role='regulator') as regulator,
  coalesce((select r.document_specific from public.sp_credential_organisation_roles r where r.credential_code=t.code and r.role='issuer'), false) as issuer_on_document,
  coalesce((select r.document_specific from public.sp_credential_organisation_roles r where r.credential_code=t.code and r.role='training_provider'), false) as trainer_on_document,
  exists(select 1 from public.sp_credential_definition_metadata m where m.credential_code=t.code and m.deprecated_at is not null) as deprecated,
  (t.jurisdiction_code is null or (exists(select 1 from public.sp_jurisdictions j where j.code=t.jurisdiction_code and j.is_active)
     and (t.sub_jurisdiction_code is null or exists(select 1 from public.sp_sub_jurisdictions s where s.code=t.sub_jurisdiction_code and s.is_active)))) as jurisdiction_active,
  (select p.is_active and p.superseded_on is null from public.sp_market_packs p where p.code=t.market_pack_code) as pack_is_active,
  (select p.pilot_state from public.sp_market_packs p where p.code=t.market_pack_code) as pack_pilot_state,
  (select p.legal_review_state from public.sp_market_packs p where p.code=t.market_pack_code) as pack_legal_review_state,
  (select v.source_url from public.sp_credential_definition_reviews v where v.credential_code=t.code) as source_url,
  (select v.checked_on::text from public.sp_credential_definition_reviews v where v.credential_code=t.code) as checked_on
 from public.sp_credential_types t) x`;

type Raw = Record<string, unknown>;

/** Every sp_credential_types row, in the catalogue's display order, with the
 *  attributes `diagnoseDefinition` reads. */
export function loadCatalogueDefinitions(dbUrl: string): DiagnosticDefinition[] {
  const raw = JSON.parse(
    execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", CATALOGUE_ROWS_QUERY], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
    }),
  ) as Raw[];
  return raw.map((t) => ({
    code: t.code as string,
    nameSv: t.name_sv as string,
    nameEn: t.name_en as string,
    claimType: t.claim_type as string,
    category: t.category as string,
    scopeCode: (t.scope_code as string | null) ?? null,
    marketPackCode: (t.market_pack_code as string | null) ?? null,
    jurisdictionCode: (t.jurisdiction_code as string | null) ?? null,
    subJurisdictionCode: (t.sub_jurisdiction_code as string | null) ?? null,
    isActive: t.is_active === true,
    pilotState: (t.pilot_state as string | null) ?? null,
    legalReviewState: (t.legal_review_state as string | null) ?? null,
    requiresScope: t.requires_scope === true,
    deprecated: t.deprecated === true,
    governedAuthority: (t.governed_authority as string | null) ?? null,
    governedCertificationIssuer: (t.governed_issuer as string | null) ?? null,
    regulator: (t.regulator as string | null) ?? null,
    issuerStatedOnDocument: t.issuer_on_document === true,
    trainingProviderStatedOnDocument: t.trainer_on_document === true,
    jurisdictionActive: t.jurisdiction_active === true,
    packIsActive: t.pack_is_active === null ? null : t.pack_is_active === true,
    packPilotState: (t.pack_pilot_state as string | null) ?? null,
    packLegalReviewState: (t.pack_legal_review_state as string | null) ?? null,
    review: t.source_url
      ? { sourceUrl: t.source_url as string, checkedOn: t.checked_on as string }
      : null,
  }));
}
