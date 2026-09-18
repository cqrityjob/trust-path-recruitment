// Security Passport — the add-credential wizard's filters, EXECUTED.
//
// `src/lib/security-passport/credential-catalogue-filters.ts` is one pure
// model, so this guard runs it instead of reading it. The fixture below is the
// SHAPE of the governed catalogue (codes, territories, roles, aliases) and not
// a copy of it: what is pinned is behaviour, and
// supabase/tests/security_passport_catalogue_completeness_test.sql pins the
// real 66 definitions against the real database.
//
// Each numbered rule is the one stated in the module's header. A rule that
// stops holding fails here by name, and scripts/negative-controls/
// passport-catalogue-filter-controls.ts proves each assertion is alive.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogueIndex,
  changeFilter,
  clearOptionalFilters,
  EMPTY_FILTERS,
  filterCatalogue,
  foldForSearch,
  type CatalogueFilterSource,
  type CatalogueFilterState,
} from "../src/lib/security-passport/credential-catalogue-filters";
import {
  diagnoseDefinition,
  type DiagnosticDefinition,
} from "../src/lib/security-passport/catalogue-diagnostics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let passed = 0;
function check(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const POLICE = "auth-police";
const COUNTY = "auth-county";
const SIA = "auth-sia";
const SIRA = "auth-sira";
const ASIS = "iss-asis";
const ISC2 = "iss-isc2";

const def = (
  code: string,
  name: string,
  scope: string,
  country: string | null,
  region: string | null,
  cls: string,
  issuerId: string | null,
  issuerName: string | null,
) => ({
  code,
  name_sv: name,
  name_en: name,
  scope_code: scope,
  country,
  region,
  credential_class: cls,
  issuer_id: issuerId,
  issuer_name: issuerName,
});

const role = (
  credential_code: string,
  r: "issuer" | "regulator" | "training_provider" | "verification_authority",
  authority: string | null,
  issuer: string | null,
  documentSpecific = false,
) => ({
  credential_code,
  role: r,
  authority_id: authority,
  certification_issuer_id: issuer,
  document_specific: documentSpecific,
});

const source: CatalogueFilterSource = {
  definitions: [
    def(
      "INTL_ASIS_CPP",
      "Certified Protection Professional (CPP)",
      "global_professional",
      null,
      null,
      "certification",
      ASIS,
      "ASIS International",
    ),
    def(
      "INTL_ISC2_CISSP",
      "Certified Information Systems Security Professional (CISSP)",
      "global_professional",
      null,
      null,
      "certification",
      ISC2,
      "ISC2",
    ),
    def(
      "VU1",
      "Väktarutbildning 1 (VU1)",
      "national_regulated",
      "SE",
      null,
      "mandatory_training",
      null,
      null,
    ),
    def(
      "OV",
      "Ordningsvaktsförordnande",
      "national_regulated",
      "SE",
      null,
      "regulated_authorisation",
      POLICE,
      "Polismyndigheten",
    ),
    def(
      "SV",
      "Skyddsvaktsförordnande",
      "national_regulated",
      "SE",
      null,
      "regulated_authorisation",
      COUNTY,
      "Länsstyrelsen",
    ),
    def(
      "UK_SIA_LICENCE_DS",
      "SIA Licence — Door Supervision",
      "national_regulated",
      "GB",
      null,
      "regulated_authorisation",
      SIA,
      "Security Industry Authority",
    ),
    def(
      "UK_SIA_LICENCE_VI",
      "SIA Licence — Vehicle Immobilisation (Northern Ireland)",
      "national_regulated",
      "GB",
      "GB-NI",
      "regulated_authorisation",
      SIA,
      "Security Industry Authority",
    ),
    def(
      "UK_SIA_QUAL_DS",
      "Licence-linked qualification — Door Supervision",
      "national_regulated",
      "GB",
      null,
      "mandatory_training",
      null,
      null,
    ),
    def(
      "AE_DU_SIRA_CARD_GUARD",
      "SIRA Security Cadre Card — Security Guard",
      "national_regulated",
      "AE",
      "AE-DU",
      "regulated_authorisation",
      SIRA,
      "Security Industry Regulatory Agency",
    ),
  ],
  organisationRoles: [
    role("INTL_ASIS_CPP", "issuer", null, ASIS),
    role("INTL_ISC2_CISSP", "issuer", null, ISC2),
    role("VU1", "regulator", POLICE, null),
    role("VU1", "issuer", null, null, true),
    role("VU1", "training_provider", null, null, true),
    role("OV", "regulator", POLICE, null),
    role("OV", "issuer", POLICE, null),
    role("SV", "regulator", POLICE, null),
    role("SV", "issuer", COUNTY, null),
    role("UK_SIA_LICENCE_DS", "regulator", SIA, null),
    role("UK_SIA_LICENCE_DS", "issuer", SIA, null),
    role("UK_SIA_LICENCE_VI", "regulator", SIA, null),
    role("UK_SIA_LICENCE_VI", "issuer", SIA, null),
    role("UK_SIA_QUAL_DS", "regulator", SIA, null),
    role("UK_SIA_QUAL_DS", "issuer", null, null, true),
    role("UK_SIA_QUAL_DS", "training_provider", null, null, true),
    role("AE_DU_SIRA_CARD_GUARD", "regulator", SIRA, null),
    role("AE_DU_SIRA_CARD_GUARD", "issuer", SIRA, null),
  ],
  definitionReviews: [
    { credential_code: "INTL_ASIS_CPP", professional_domain: "security_management" },
    { credential_code: "INTL_ISC2_CISSP", professional_domain: "information_security" },
    { credential_code: "VU1", professional_domain: "security_operations" },
    { credential_code: "OV", professional_domain: "security_operations" },
    // SV deliberately has NO review row: rule 8.
    { credential_code: "UK_SIA_LICENCE_DS", professional_domain: "security_operations" },
    { credential_code: "UK_SIA_LICENCE_VI", professional_domain: "security_operations" },
    { credential_code: "UK_SIA_QUAL_DS", professional_domain: "security_operations" },
    { credential_code: "AE_DU_SIRA_CARD_GUARD", professional_domain: "security_operations" },
  ],
  definitionFacts: [
    { code: "SV", requires_scope: true, symbol_label: "SV" },
    { code: "AE_DU_SIRA_CARD_GUARD", requires_scope: true, symbol_label: null },
    { code: "OV", requires_scope: false, symbol_label: "OV" },
  ],
  abbreviations: [
    { credential_code: "INTL_ASIS_CPP", abbreviation: "CPP" },
    // An abbreviation that appears in NO name and NO code, so only the
    // abbreviation field can find it: the assertion below cannot pass by luck.
    { credential_code: "OV", abbreviation: "OVF" },
    { credential_code: "INTL_ISC2_CISSP", abbreviation: "CISSP" },
  ],
  issuerAliases: [
    { issuer_id: ISC2, alias: "(ISC)²" },
    { issuer_id: ASIS, alias: "American Society for Industrial Security" },
  ],
  organisations: [
    { id: POLICE, name: "Polismyndigheten" },
    { id: COUNTY, name: "Länsstyrelsen" },
    { id: SIA, name: "Security Industry Authority" },
    { id: SIRA, name: "Security Industry Regulatory Agency" },
    { id: ASIS, name: "ASIS International" },
    { id: ISC2, name: "ISC2" },
  ],
};

const index = buildCatalogueIndex(source);
const codes = (state: CatalogueFilterState) =>
  filterCatalogue(index, state)
    .results.map((d) => d.code)
    .sort();
const national = (patch: Partial<CatalogueFilterState> = {}): CatalogueFilterState => ({
  ...EMPTY_FILTERS,
  scope: "national",
  ...patch,
});

console.log("\n1 · optional filters start at all");
check(
  EMPTY_FILTERS.region === "" &&
    EMPTY_FILTERS.domain === "" &&
    EMPTY_FILTERS.category === "" &&
    EMPTY_FILTERS.organisation === "" &&
    EMPTY_FILTERS.search === "",
  "1 every optional filter starts empty, so no first organisation narrows the catalogue",
);
check(
  codes(national({ country: "SE" })).join() === "OV,SV,VU1",
  "1 a country alone lists everything available in it",
);

console.log("\n2 · faceted options and counts");
{
  const se = filterCatalogue(index, national({ country: "SE" }));
  check(se.total === 3 && se.results.length === 3, "2 the count is the country's whole catalogue");
  const police = se.organisations.find((o) => o.value === POLICE);
  check(
    police?.count === 3,
    "2 the Police is offered with 3: regulator of VU1 and SV, issuer of OV",
  );
  const training = filterCatalogue(
    index,
    national({ country: "SE", category: "mandatory_training" }),
  );
  check(
    training.organisations.length === 1 && training.organisations[0].value === POLICE,
    "2 with 'training' chosen only organisations that still have a result are offered",
  );
  check(
    !training.organisations.some((o) => o.value === COUNTY),
    "2 an organisation with no result under the other filters is not offered",
  );
}

console.log("\n3 · a region filter never hides a country-wide credential");
{
  const ni = codes(national({ country: "GB", region: "GB-NI" }));
  check(
    ni.includes("UK_SIA_LICENCE_DS") && ni.includes("UK_SIA_LICENCE_VI"),
    "3 filtering Northern Ireland keeps the GB-wide door supervision licence",
  );
  const gb = filterCatalogue(index, national({ country: "GB" }));
  check(
    gb.regions.find((r) => r.value === "GB-NI")?.count === 3,
    "3 the region's count includes the country-wide definitions the holder will see",
  );
}

console.log("\n4 · dependent selections are cleared, valid ones are kept");
{
  const start = national({
    country: "SE",
    organisation: COUNTY,
    category: "regulated_authorisation",
  });
  const moved = changeFilter(index, start, { country: "GB" });
  check(
    moved.organisation === "",
    "4 changing country clears an organisation that does not exist there",
  );
  check(
    moved.category === "regulated_authorisation",
    "4 and KEEPS a credential type that is still valid in the new country",
  );
  check(
    filterCatalogue(index, moved).results.length > 0,
    "4 so the new country is never silently empty",
  );
  const region = changeFilter(index, national({ country: "GB", region: "GB-NI" }), {
    country: "SE",
  });
  check(region.region === "", "4 changing country clears the region");
  const scope = changeFilter(
    index,
    national({ country: "GB", region: "GB-NI", domain: "security_operations" }),
    {
      scope: "international",
    },
  );
  check(
    scope.country === "" && scope.region === "" && scope.domain === "",
    "4 switching to international clears country, region and the optional filters",
  );
}

console.log("\n5 · the region control is relevant only where a region exists");
check(
  !filterCatalogue(index, national({ country: "SE" })).regionRelevant,
  "5 Sweden has no regional definition: no region control",
);
check(
  filterCatalogue(index, national({ country: "GB" })).regionRelevant,
  "5 Great Britain has Northern Ireland: the control is offered",
);
check(
  !filterCatalogue(index, EMPTY_FILTERS).regionRelevant,
  "5 international has no region control",
);

console.log("\n6 · organisations are governed, in a stated role");
{
  const vu1 = index.find((d) => d.code === "VU1");
  check(
    vu1?.issuerStatedOnDocument === true && vu1.trainingProviderStatedOnDocument === true,
    "6 VU1's issuer and training provider are stated on the certificate",
  );
  check(
    vu1?.organisations.every((o) => o.role !== "training_provider") === true,
    "6 no governed organisation — and so no regulator — is recorded as VU1's training provider",
  );
  check(
    codes(national({ country: "SE", organisation: POLICE })).includes("VU1"),
    "6 VU1 stays findable through its regulator",
  );
  check(
    index.find((d) => d.code === "SV")?.requiresScope === true &&
      index.find((d) => d.code === "OV")?.requiresScope === false,
    "6 the scope requirement follows the definition, not the filter",
  );
}

console.log("\n7 · search");
check(
  codes({ ...EMPTY_FILTERS, search: "cpp" }).join() === "INTL_ASIS_CPP" &&
    codes(national({ country: "SE", search: "ovf" })).join() === "OV",
  "7 an abbreviation finds its certification",
);
check(
  codes({ ...EMPTY_FILTERS, search: "(ISC)²" }).join() === "INTL_ISC2_CISSP" &&
    // "industrial security" exists ONLY in ASIS's approved alias.
    codes({ ...EMPTY_FILTERS, search: "industrial security" }).join() === "INTL_ASIS_CPP",
  "7 an approved issuer alias finds the issuer's certifications",
);
check(
  codes(national({ country: "SE", search: "vu1" })).join() === "VU1",
  "7 a stable code finds its definition",
);
check(
  codes(national({ country: "SE", search: "vaktarutbildning" })).join() === "VU1",
  "7 search is diacritic-folded",
);
check(
  codes(national({ country: "GB", search: "vehicle immobilisation" })).join() ===
    "UK_SIA_LICENCE_VI" && codes(national({ country: "GB", search: "vehicle door" })).length === 0,
  "7 every token must match: two words from two different credentials find nothing",
);
check(
  foldForSearch("(ISC)²") === "isc 2" || foldForSearch("(ISC)²") === "isc2",
  "7 the fold normalises a superscript",
);

console.log("\n8 · 'all areas' excludes nothing");
{
  check(
    codes(national({ country: "SE" })).includes("SV"),
    "8 a definition with no reviewed area is listed under all areas",
  );
  check(
    !codes(national({ country: "SE", domain: "security_operations" })).includes("SV"),
    "8 and only an explicit area filter leaves it out",
  );
}

console.log("\nclear filters");
{
  const cleared = clearOptionalFilters(
    national({
      country: "GB",
      region: "GB-NI",
      domain: "security_operations",
      organisation: SIA,
      search: "x",
    }),
  );
  check(
    cleared.country === "GB" && cleared.scope === "national",
    "clear keeps the scope and the country the holder chose",
  );
  check(
    !cleared.region &&
      !cleared.domain &&
      !cleared.category &&
      !cleared.organisation &&
      !cleared.search,
    "clear empties every optional filter and the search",
  );
  check(!filterCatalogue(index, cleared).narrowed, "after clear the list is no longer narrowed");
}

console.log("\nthe wizard uses the model, and saves from the definition");
{
  const form = readFileSync(
    path.join(root, "src/components/security-passport/InternationalCredentialForm.tsx"),
    "utf8",
  );
  check(
    /buildCatalogueIndex\(/.test(form) && /filterCatalogue\(index, filters/.test(form),
    "the form derives its catalogue from the model",
  );
  check(
    /changeFilter\(index, current, patch\)/.test(form),
    "every filter change goes through changeFilter",
  );
  check(
    /data-clear-filters/.test(form) && /data-filter-count/.test(form),
    "the form shows a result count and a clear-filters control",
  );
  check(
    /answer\.regionRelevant &&/.test(form),
    "the region control is rendered only when it is relevant",
  );
  check(
    /market_country: selected\.country \?\? ""/.test(form) &&
      /authorisation_scope: selected\.requiresScope \? draft\.authorisation_scope : ""/.test(
        form,
      ) &&
      /issuer_name: selected\.issuerStatedOnDocument \? draft\.issuer_name : ""/.test(form),
    "territory, scope and issuer are saved from the SELECTED definition, never from a filter",
  );
  check(
    !/useState\(\s*(metadata|definitions)\S*\[0\]/.test(form) && !/setIssuer\(/.test(form),
    "no filter is initialised from a first option",
  );
  const fn = readFileSync(
    path.join(root, "src/lib/security-passport/international.functions.ts"),
    "utf8",
  );
  check(
    /if \(authorisation_scope\?\.trim\(\)\) input\.authorisation_scope/.test(fn) &&
      /if \(issuer_name\?\.trim\(\)\) input\.issuer_name/.test(fn),
    "the two new RPC keys travel only when they carry a value",
  );
}

console.log("\nwhy a definition is, or is not, selectable (the administrator's diagnosis)");
{
  const base: DiagnosticDefinition = {
    code: "X",
    nameSv: "X",
    nameEn: "X",
    claimType: "licence",
    category: "appointment",
    scopeCode: "national_regulated",
    marketPackCode: "GB",
    jurisdictionCode: "GB",
    subJurisdictionCode: null,
    isActive: false,
    pilotState: "internal_pilot",
    legalReviewState: "pending",
    requiresScope: false,
    deprecated: false,
    governedAuthority: "Security Industry Authority",
    governedCertificationIssuer: null,
    regulator: "Security Industry Authority",
    issuerStatedOnDocument: false,
    trainingProviderStatedOnDocument: false,
    jurisdictionActive: true,
    packIsActive: false,
    packPilotState: "internal_pilot",
    review: { sourceUrl: "https://example.invalid", checkedOn: "2026-08-22" },
  };
  // ROUTE A: internal_pilot definition + internal_pilot pack = pilot members only.
  const pilot = diagnoseDefinition(base);
  check(
    pilot.availability === "selectable_pilot_members" &&
      pilot.reasons.includes("pilot_authorised_not_public") &&
      pilot.reasons.includes("market_pilot_members_only") &&
      !pilot.reasons.includes("definition_not_approved"),
    "D an internal-pilot definition in an internal-pilot market is selectable by that market's members, and named as NOT public",
  );
  check(
    diagnoseDefinition({ ...base, pilotState: "closed" }).availability ===
      "awaiting_definition_approval",
    "D a definition held back individually (pilot_state closed) is not offered, even in a pilot market",
  );
  check(
    diagnoseDefinition({ ...base, packIsActive: true, packPilotState: "closed" }).availability ===
      "awaiting_definition_approval" &&
      diagnoseDefinition({ ...base, packIsActive: true }).availability ===
        "awaiting_definition_approval",
    "D activating the market publishes no pilot-only definition: it waits for its own approval",
  );
  check(
    diagnoseDefinition({ ...base, isActive: true }).availability === "selectable_pilot_members",
    "D once approved it is selectable by pilot members only, never by everyone",
  );
  check(
    diagnoseDefinition({ ...base, isActive: true, packPilotState: "closed" }).availability ===
      "market_closed",
    "D an approved definition in a closed market stays closed: approval does not open a market",
  );
  check(
    diagnoseDefinition({
      ...base,
      governedAuthority: null,
      issuerStatedOnDocument: true,
      isActive: true,
      packIsActive: true,
    }).holderMustState.join() === "issuer_name",
    "D a document-stated issuer under a governed regulator is resolved, and the holder must name it",
  );
  check(
    diagnoseDefinition({
      ...base,
      governedAuthority: null,
      regulator: null,
      isActive: true,
      packIsActive: true,
    }).availability === "blocked",
    "D with no governed issuer and no governed regulator the definition is blocked, not quietly listed",
  );
  check(
    diagnoseDefinition({ ...base, requiresScope: true }).holderMustState.includes(
      "authorisation_scope",
    ) && !diagnoseDefinition({ ...base, requiresScope: true }).reasons.some((r) => /scope/.test(r)),
    "D a required scope is a holder contract, never a reason a definition is unavailable",
  );
}

console.log("\nthe administrator's diagnosis is authorised server-side and reads nothing personal");
{
  const admin = readFileSync(
    path.join(root, "src/lib/job-intelligence/admin-passport-catalogue.functions.ts"),
    "utf8",
  );
  const handler = admin.slice(admin.indexOf("export const adminListPassportCatalogue"));
  const gate = handler.indexOf("await assertAdmin(ctx);");
  const service = handler.indexOf("@/integrations/supabase/client.server");
  check(
    /\.middleware\(\[requireSupabaseAuth\]\)/.test(handler) && gate > 0 && service > gate,
    "A the platform-admin check runs on the server BEFORE the service-role client is even imported",
  );
  check(
    /rpc\("is_platform_admin"/.test(admin) && /FORBIDDEN_ADMIN_REQUIRED/.test(admin),
    "A the check is the database's is_platform_admin, and a non-administrator is refused",
  );
  const tables = [...handler.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
  check(
    tables.length === 10 &&
      tables.every((t) =>
        /^sp_(credential_types|market_packs|authorities|certification_definitions|certification_issuers|credential_organisation_roles|credential_definition_reviews|credential_definition_metadata|jurisdictions|sub_jurisdictions)$/.test(
          t,
        ),
      ),
    "A it reads ten CATALOGUE tables and no holder table: no claim, profile, evidence or pilot-member row",
  );
  check(
    !/\.(insert|update|upsert|delete)\(/.test(handler) && !/\.rpc\("sp_/.test(handler),
    "A it writes nothing and calls no Passport RPC: approval stays a reviewed migration",
  );
}

console.log("\nguarded release: the application declares the catalogue contract it can save");
{
  const contract = readFileSync(
    path.join(root, "src/lib/security-passport/catalogue-contract.ts"),
    "utf8",
  );
  check(
    /PASSPORT_CATALOGUE_CONTRACT_HEADER = "x-passport-catalogue-contract"/.test(contract) &&
      /PASSPORT_CATALOGUE_CONTRACT = "2"/.test(contract),
    "G the contract header and version are declared once",
  );
  const readers = [
    "src/lib/security-passport/international.functions.ts",
    "src/lib/security-passport/credentials.functions.ts",
  ].map((f) => readFileSync(path.join(root, f), "utf8"));
  check(
    readers.every((t) =>
      /\.from\("sp_approved_credential_catalogue" as never\)[\s\S]{0,320}?\.setHeader\(PASSPORT_CATALOGUE_CONTRACT_HEADER, PASSPORT_CATALOGUE_CONTRACT\)/.test(
        t,
      ),
    ),
    "G BOTH catalogue readers declare the contract, so the wizard and the market panels list what the wizard can save",
  );
  const migration = readFileSync(
    path.join(
      root,
      "supabase/migrations/20261126090000_sp_catalogue_scope_and_document_issuer.sql",
    ),
    "utf8",
  );
  check(
    /current_setting\('request\.path', true\)/.test(migration) &&
      /'x-passport-catalogue-contract'/.test(migration) &&
      /pp\.pilot_state='internal_pilot' AND NOT pp\.is_active/.test(migration) &&
      /public\.sp_is_pilot_member\(auth\.uid\(\), t\.market_pack_code\)/.test(migration),
    "G the migration narrows the REST listing by that header, and Route A requires the definition's OWN pack to be a not-active pilot",
  );
}

console.log(
  `\nPassport catalogue filters: ${passed} of ${passed + failures.length} assertions passed.`,
);
if (failures.length) {
  console.error(`passport-catalogue-filter:check FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
