// Security Passport — the catalogue coverage matrix, GENERATED from a database.
//
//   bun run scripts/passport-catalogue-coverage-matrix.ts            # writes the doc
//   PASSPORT_MATRIX_DB_URL=postgresql://… bun run scripts/…          # another local DB
//
// Reads every row of sp_credential_types with the attributes the approved
// catalogue's predicate reads, runs the SAME diagnosis the administration page
// runs (src/lib/security-passport/catalogue-diagnostics.ts), and writes
// docs/passport/catalogue-coverage-matrix.md. It is a report, never a gate: it
// needs a migrated local database, which CI's guard job does not have. The
// gate is supabase/tests/security_passport_catalogue_completeness_test.sql,
// which pins the same 66 codes and PROVES each one saves and reads back.
//
// It refuses any host that is not local: this script has no business reading
// a hosted catalogue.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diagnoseDefinition,
  type DiagnosticDefinition,
} from "../src/lib/security-passport/catalogue-diagnostics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL =
  process.env.PASSPORT_MATRIX_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)) {
  console.error("REFUSING: the coverage matrix reads a LOCAL database only.");
  process.exit(2);
}

const QUERY = `
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
  (select v.source_url from public.sp_credential_definition_reviews v where v.credential_code=t.code) as source_url,
  (select v.checked_on::text from public.sp_credential_definition_reviews v where v.credential_code=t.code) as checked_on
 from public.sp_credential_types t) x`;

type Raw = Record<string, unknown>;
const raw = JSON.parse(
  execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", QUERY], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  }),
) as Raw[];

const rows = raw.map((t) => {
  const d: DiagnosticDefinition = {
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
    review: t.source_url
      ? { sourceUrl: t.source_url as string, checkedOn: t.checked_on as string }
      : null,
  };
  return { ...d, ...diagnoseDefinition(d) };
});

const territory = (r: (typeof rows)[number]) =>
  r.scopeCode === "global_professional"
    ? "International"
    : [r.jurisdictionCode, r.subJurisdictionCode].filter(Boolean).join(" / ");
const awarding = (r: (typeof rows)[number]) =>
  r.governedCertificationIssuer ??
  r.governedAuthority ??
  (r.issuerStatedOnDocument ? "stated on the certificate" : "—");
const STATE: Record<string, string> = {
  selectable: "approved · open to all",
  selectable_pilot_members: "pilot-authorised (not public) · valid members of this market",
  awaiting_definition_approval: "NOT approved · pilot market",
  market_closed: "market CLOSED",
  blocked: "BLOCKED",
};
const inScope = (r: (typeof rows)[number]) => r.marketPackCode !== "AE-AZ";
const display = (r: (typeof rows)[number]) =>
  r.scopeCode === "global_professional"
    ? "globe · no country"
    : `flag ${r.subJurisdictionCode ?? r.jurisdictionCode}${r.scopeCode === "national_qualification" ? " · national qualification, not a licence" : ""}${r.requiresScope ? " · scope-limited mark, scope text withheld from an anonymous share" : ""}`;

const line = (r: (typeof rows)[number]) =>
  `| \`${r.code}\` | ${r.nameEn} | ${territory(r)} | ${r.claimType} / ${r.category} | ${r.regulator ?? "—"} | ${awarding(r)}${r.trainingProviderStatedOnDocument ? "; training provider stated on the certificate" : ""} | ${STATE[r.availability]} | ${r.availability === "selectable" ? "yes" : r.availability === "selectable_pilot_members" ? "pilot members" : "no"} | ${inScope(r) ? `proven${r.holderMustState.length ? ` (holder states ${r.holderMustState.join(" + ").replaceAll("_", " ")})` : ""}${r.availability === "selectable_pilot_members" ? " — as a valid pilot member" : ""}` : "refused (closed market)"} | ${inScope(r) ? "review request + evidence reach the reviewer; definition, issuer as stated, territory and scope shown" : "n/a"} | ${inScope(r) ? display(r) : "n/a"} |`;

const count = (a: string) => rows.filter((r) => r.availability === a).length;
const pending = rows.filter((r) => r.availability === "selectable_pilot_members");
const groups: [string, (r: (typeof rows)[number]) => boolean][] = [
  ["International certifications", (r) => r.scopeCode === "global_professional"],
  ["Sweden", (r) => r.marketPackCode === "SE"],
  [
    "India — national qualifications (no market pack; approved for every holder, 20261214090000)",
    (r) => r.scopeCode === "national_qualification" && r.jurisdictionCode === "IN",
  ],
  ["Great Britain", (r) => r.marketPackCode === "GB"],
  ["Northern Ireland", (r) => r.marketPackCode === "GB-NI"],
  ["Dubai", (r) => r.marketPackCode === "AE-DU"],
  [
    "Abu Dhabi (closed by owner decision — out of pilot scope)",
    (r) => r.marketPackCode === "AE-AZ",
  ],
];
const HEAD =
  "| code | name | territory | type / category | regulator | awarding organisation / provider | approval · access | selectable now | saves and reloads | admin review | Passport / share display |\n|---|---|---|---|---|---|---|---|---|---|---|";

const md = `# Security Passport — catalogue coverage matrix

_Generated by \`scripts/passport-catalogue-coverage-matrix.ts\` from a migrated local database
(all migrations through 20261214090000). Do not edit by hand; regenerate._

Every researched definition is reconciled here by its **stable credential code** against the
actual taxonomy, its approval state, its catalogue visibility and the governed save path. The
same diagnosis is shown to a platform administrator at \`/admin/passport-catalogue\`.

| | count |
|---|---|
| definitions in the taxonomy | ${rows.length} |
| in the agreed scope (international, Sweden, India, Great Britain, Northern Ireland, Dubai) | ${rows.filter(inScope).length} |
| selectable by every holder today | ${count("selectable")} |
| selectable by VALID PILOT MEMBERS of the definition's own market (Route A) | ${count("selectable_pilot_members")} |
| held back individually or awaiting approval | ${count("awaiting_definition_approval")} |
| market closed (Abu Dhabi) | ${count("market_closed")} |
| blocked by missing governed data | ${count("blocked")} |

**Nothing is approved to produce this proof.** "Saves and reloads — proven" means the definition is pinned by code in
\`supabase/tests/security_passport_catalogue_completeness_test.sql\` (CI, every push) and in
\`scripts/passport-live-local-journey-check.mjs\` (real GoTrue + PostgREST, authenticated test
users): visible to its entitled holder, saved through \`sp_save_international_credential\` with the
contract its definition demands, and read back with the right territory, issuer and scope. A pilot
definition is reached through a pilot membership alone, exactly as a real tester reaches it;
\`is_active\` is never set, temporarily or otherwise.

Three questions are kept apart throughout: **definition approval** (\`is_active\`, per definition),
**market entitlement** (active pack, or internal pilot + a named member) and **holder
verification** (never a catalogue matter).

${groups
  .map(([title, pick]) => {
    const g = rows.filter(pick);
    return `## ${title} — ${g.length}\n\n${HEAD}\n${g.map(line).join("\n")}`;
  })
  .join("\n\n")}

## The ${pending.length} pilot definitions — Route A (owner decision, 2026-09-18)

The owner approved Route A: the per-definition internal-pilot authorisation already on record
(\`pilot_state = 'internal_pilot'\`, 20260915090000) is honoured **for explicitly granted pilot
members**. A pilot definition is offered only when the definition is \`internal_pilot\`, ITS OWN
market pack is \`internal_pilot\` and not active, and the authenticated holder has a valid
membership of THAT pack — and every other catalogue, source, issuer, jurisdiction and scope
requirement passes. \`is_active\` stays false on all of them, so public activation of a market
publishes none of them; the legal-review gate is untouched. This authorises implementation and
testing, not public market activation. Details and release steps:
[pilot-approval-decisions.md](pilot-approval-decisions.md).

| code | name | market | legal review | source recorded for the definition | checked |
|---|---|---|---|---|---|
${pending
  .map(
    (r) =>
      `| \`${r.code}\` | ${r.nameEn} | ${r.marketPackCode} | ${r.legalReviewState} | ${r.review?.sourceUrl ?? "—"} | ${r.review?.checkedOn ?? "—"} |`,
  )
  .join("\n")}

### Known limits to weigh with those decisions

- **Dubai:** \`portal.sira.gov.ae\` never answered the source checker (a standing limitation
  recorded in \`docs/passport/regulatory-source-register.md\`); \`name_ar\` is NULL on every row and
  Arabic vocabulary must be supplied and reviewed before activation.
- **Dubai issuer mapping was checked against the source's CONTENT, not its reachability**
  (2026-09-18). \`sira.gov.ae/en/services/security-cadre-card\` presents the Security Cadre Card
  as a SIRA service and requires "completion of the … course from Approved Training Centers"
  and a knowledge test "at one of the Security Training Centers approved by the Agency". So a
  **card** is issued and regulated by SIRA, the authority recorded for checking it; a **course or check** is regulated by SIRA
  but its certificate comes from the approved centre, which the holder names. SIRA is recorded as
  the issuer of no course, although the taxonomy's \`authority_id\` names it on every Dubai row.
  What the source does NOT state is who issues the fitness, fire-safety and life-support
  documents specifically; they are modelled the same way (stated on the document) and that is
  the one Dubai mapping a reviewer should confirm.
- **Great Britain:** the four ICO sources must be re-read on the implementation date (Data (Use
  and Access) Act).
- **India** has no market pack: its four national qualifications authorise nothing, so they are
  offered without one (scope \`national_qualification\`), with \`legal_review_state\` still
  \`pending\`. No personal PSARA licence exists and none is modelled; state-specific PSARA
  training certificates are not modelled either. See \`docs/passport/india-market-entry.md\`.
- **Sweden** is \`grandfathered\`, not \`approved\`: it carries the same review debt, and whether the
  narrow personnel-approval result may be recorded at all is named for legal review in
  \`docs/passport/sweden-market-pack.md\`.
`;
writeFileSync(path.join(root, "docs/passport/catalogue-coverage-matrix.md"), md);
console.log(
  `coverage matrix written: ${rows.length} definitions, ${pending.length} for pilot members, ${count("selectable")} selectable`,
);
