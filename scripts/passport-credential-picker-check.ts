// Security Passport — the credential picker, EXECUTED.
//
// The certification research integration changed how a holder FINDS the
// credential they hold: one search over every approved definition, ranked, named
// by abbreviation + full name + awarding organisation, with the credentials the
// catalogue does not yet offer explained rather than missing. This guard runs
// that behaviour instead of reading it.
//
// The fixture is the SHAPE of the real catalogue, drawn from the research
// package's own awards (a personal certification, a professional qualification,
// a designation, an assessed certificate, a course certificate; similar
// abbreviations such as CISS / CISSP / CISM / CISA and OSCP / OSCP+), not a copy
// of it. supabase/tests/security_passport_catalogue_research_test.sql pins the
// real rows against the real database.
//
// Each group states the rule it pins. scripts/negative-controls/
// passport-credential-picker-controls.ts proves every group fails when its rule
// is broken.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogueIndex,
  changeFilter,
  clearOptionalFilters,
  EMPTY_FILTERS,
  filterCatalogue,
  searchScore,
  type CatalogueFilterSource,
} from "../src/lib/security-passport/credential-catalogue-filters";
import {
  bylineOf,
  draftAfterDefinitionChange,
  EMPTY_REQUEST,
  headlineOf,
  kindLabel,
  maintenanceLabel,
  REQUEST_LIMITS,
  requestErrorMessage,
  requestStatusLabel,
  stripTrailingAbbreviation,
  UNAVAILABLE_REASONS,
  unavailableReasonLabel,
  validateCatalogueRequest,
} from "../src/lib/security-passport/credential-picker";
import { credentialClassLabel } from "../src/lib/security-passport/international";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import { buildShareSelection } from "../src/lib/security-passport/share-selection";
import { buildPassportWorkspace } from "../src/lib/security-passport/workspace";
import { passportCopy } from "../src/lib/security-passport/i18n";
import { credentialMark } from "../src/lib/security-passport/credentials";
import { RESEARCH_CREDENTIAL_MARKS } from "../src/lib/security-passport/catalogue-research-marks";
import { credentialSymbolMarkup } from "../src/lib/security-passport/design/credential-symbols";
import type { InternationalCredentialInput } from "../src/lib/security-passport/international.functions";

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
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** The research foundation migration, found by name: its version is a release-order
 *  fact (it was renumbered once when main took the version before it), not a constant. */
function foundationMigration(): string {
  const name = readdirSync(path.join(root, "supabase/migrations")).find((f) =>
    f.endsWith("_sp_catalogue_research_foundation.sql"),
  );
  if (!name) throw new Error("the research foundation migration is missing");
  return `supabase/migrations/${name}`;
}

// ── The fixture ──────────────────────────────────────────────────────────

const ISSUERS = {
  asis: "ASIS International",
  ifcpp: "International Foundation for Cultural Property Protection (IFCPP)",
  isc2: "ISC2",
  isaca: "ISACA",
  offsec: "OffSec",
  iapp: "IAPP",
  iosh: "Institution of Occupational Safety and Health",
  ica: "Insurance Institute of Canada",
  parking: "Example Parking Institute",
} as const;
type IssuerKey = keyof typeof ISSUERS;
const issuerId = (k: IssuerKey) => `iss-${k}`;

interface Row {
  code: string;
  name: string;
  issuer: IssuerKey | null;
  cls: string;
  abbreviation: string | null;
  domain: string;
  scope?: string;
  country?: string | null;
}
const ROWS: readonly Row[] = [
  {
    code: "INTL_ASIS_CPP",
    name: "Certified Protection Professional (CPP)",
    issuer: "asis",
    cls: "certification",
    abbreviation: "CPP",
    domain: "physical_security",
  },
  {
    code: "FX_PARKING_CPP",
    name: "Certified Parking Professional (CPP)",
    issuer: "parking",
    cls: "certification",
    abbreviation: "CPP",
    domain: "physical_security",
  },
  {
    code: "INTL_IFCPP_CISS",
    name: "Certified Institutional Security Supervisor (CISS)",
    issuer: "ifcpp",
    cls: "certification",
    abbreviation: "CISS",
    domain: "physical_security",
  },
  {
    code: "INTL_ISC2_CISSP",
    name: "Certified Information Systems Security Professional (CISSP)",
    issuer: "isc2",
    cls: "certification",
    abbreviation: "CISSP",
    domain: "information_security",
  },
  {
    code: "INTL_ISACA_CISM",
    name: "Certified Information Security Manager (CISM)",
    issuer: "isaca",
    cls: "certification",
    abbreviation: "CISM",
    domain: "information_security",
  },
  {
    code: "INTL_ISACA_CISA",
    name: "Certified Information Systems Auditor (CISA)",
    issuer: "isaca",
    cls: "certification",
    abbreviation: "CISA",
    domain: "information_security",
  },
  {
    code: "INTL_OFFSEC_OSCP",
    name: "OffSec Certified Professional",
    issuer: "offsec",
    cls: "certification",
    abbreviation: "OSCP",
    domain: "information_security",
  },
  {
    code: "INTL_OFFSEC_OSCP_PLUS",
    name: "OffSec Certified Professional (OSCP+)",
    issuer: "offsec",
    cls: "certification",
    abbreviation: "OSCP+",
    domain: "information_security",
  },
  {
    code: "INTL_IAPP_CIPP_E",
    name: "Certified Information Privacy Professional/Europe (CIPP/E)",
    issuer: "iapp",
    cls: "certification",
    abbreviation: "CIPP/E",
    domain: "risk_compliance",
  },
  {
    code: "INTL_IOSH_MANAGING_SAFELY",
    name: "IOSH Managing Safely",
    issuer: "iosh",
    cls: "course_certificate",
    abbreviation: null,
    domain: "resilience_safety",
  },
  {
    code: "INTL_ICA_CIP",
    name: "Chartered Insurance Professional (CIP)",
    issuer: "ica",
    cls: "professional_designation",
    abbreviation: "CIP",
    domain: "insurance",
  },
  {
    code: "INTL_ICA_FUTURE_KIND",
    name: "A kind this build has not met",
    issuer: "ica",
    cls: "kind_from_the_future",
    abbreviation: null,
    domain: "area_from_the_future",
  },
  {
    code: "VU1",
    name: "Väktarutbildning 1 (VU1)",
    issuer: null,
    cls: "mandatory_training",
    abbreviation: "VU1",
    domain: "security_operations",
    scope: "national_regulated",
    country: "SE",
  },
  {
    code: "OV",
    name: "Ordningsvakt (OV)",
    issuer: null,
    cls: "regulated_authorisation",
    abbreviation: "OV",
    domain: "security_operations",
    scope: "national_regulated",
    country: "SE",
  },
];

const aliasOfICA = "Associate in General Insurance (former title)";
const source: CatalogueFilterSource = {
  definitions: ROWS.map((r) => ({
    code: r.code,
    name_sv: r.name,
    name_en: r.name,
    scope_code: r.scope ?? "global_professional",
    country: r.country ?? null,
    region: null,
    credential_class: r.cls,
    issuer_id: r.issuer ? issuerId(r.issuer) : null,
    issuer_name: r.issuer ? ISSUERS[r.issuer] : null,
  })),
  organisationRoles: [
    ...ROWS.filter((r) => r.issuer).map((r) => ({
      credential_code: r.code,
      role: "issuer" as const,
      authority_id: null,
      certification_issuer_id: issuerId(r.issuer as IssuerKey),
      document_specific: false,
    })),
    {
      credential_code: "VU1",
      role: "regulator" as const,
      authority_id: "auth-police",
      certification_issuer_id: null,
      document_specific: false,
    },
  ],
  definitionReviews: ROWS.map((r) => ({ credential_code: r.code, professional_domain: r.domain })),
  definitionFacts: ROWS.map((r) => ({
    code: r.code,
    requires_scope: false,
    symbol_label: r.abbreviation,
  })),
  abbreviations: ROWS.map((r) => ({ credential_code: r.code, abbreviation: r.abbreviation })),
  definitionAliases: [{ credential_code: "INTL_ICA_CIP", alias: aliasOfICA }],
  issuerAliases: [{ issuer_id: issuerId("isc2"), alias: "(ISC)²" }],
  organisations: [
    ...(Object.keys(ISSUERS) as IssuerKey[]).map((k) => ({ id: issuerId(k), name: ISSUERS[k] })),
    { id: "auth-police", name: "Polismyndigheten" },
  ],
};
const index = buildCatalogueIndex(source);
const find = (state: Partial<typeof EMPTY_FILTERS>) =>
  filterCatalogue(index, { ...EMPTY_FILTERS, ...state }).results.map((d) => d.code);
const byCode = (code: string) => {
  const d = index.find((x) => x.code === code);
  if (!d) throw new Error(`fixture lacks ${code}`);
  return d;
};

// ── 1. The headline and the byline ───────────────────────────────────────

console.log("\n1 · a result is named by abbreviation, full name and awarding organisation");
{
  const cpp = byCode("INTL_ASIS_CPP");
  check(
    headlineOf(cpp, "en").text === "CPP — Certified Protection Professional",
    "1.1 the headline is “CPP — Certified Protection Professional”, the repeated (CPP) removed",
  );
  check(
    bylineOf({ ...cpp, regulator: null }, "en") ===
      "ASIS International · International certification",
    "1.2 the byline is “ASIS International · International certification”",
  );
  check(
    bylineOf({ ...cpp, regulator: null }, "sv") ===
      "ASIS International · Internationell certifiering",
    "1.3 and in Swedish, with the right gender",
  );
  const iosh = byCode("INTL_IOSH_MANAGING_SAFELY");
  check(
    headlineOf(iosh, "en").abbreviation === null &&
      headlineOf(iosh, "en").text === "IOSH Managing Safely",
    "1.4 an award with no published abbreviation gets none: it is not invented from the title",
  );
  check(
    kindLabel(iosh, "en") === "International course certificate" &&
      kindLabel(byCode("INTL_ICA_CIP"), "en") === "International professional designation" &&
      kindLabel(byCode("INTL_ASIS_CPP"), "en") === "International certification",
    "1.5 a course certificate, a designation and a certification are three different words",
  );
  const vu1 = byCode("VU1");
  check(
    headlineOf(vu1, "en").text === "Väktarutbildning 1 (VU1)",
    "1.6 a national credential keeps its own name: its short code is a label, not a name",
  );
  check(
    bylineOf({ ...vu1, regulator: "Polismyndigheten" }, "en", (c) =>
      c === "SE" ? "Sweden" : (c ?? ""),
    ) === "Regulator: Polismyndigheten · Mandatory training credential · Sweden",
    "1.7 a regulator is named as a regulator and never as the issuer",
  );
  check(
    bylineOf({ ...byCode("OV"), regulator: null }, "en").startsWith(
      "Issuer stated on the certificate",
    ),
    "1.8 with no governed issuer or regulator the byline says the issuer is on the certificate",
  );
  check(
    stripTrailingAbbreviation("Certified Fraud Examiner (CFE)", "CFE") ===
      "Certified Fraud Examiner" &&
      stripTrailingAbbreviation("CFE", "CFE") === "CFE" &&
      stripTrailingAbbreviation("Certified Fraud Examiner", null) === "Certified Fraud Examiner",
    "1.9 a trailing (ABBR) is stripped only when it is that abbreviation, and never leaves an empty name",
  );
  const unknown = {
    scope_code: "scope_from_the_future",
    credential_class: "kind_from_the_future",
    country: null,
    region: null,
    issuer_name: "Someone",
  };
  check(
    bylineOf(unknown, "en") === "Someone · Other professional credential" &&
      kindLabel({ ...unknown, scope_code: "global_professional" }, "en") ===
        "International credential",
    "1.10 a class or scope this build does not know is shown generically, never raw",
  );
  check(
    maintenanceLabel("none_published", null, "en") === "The issuer has published no renewal rule" &&
      maintenanceLabel("recertification_cycle", 36, "en") === "Renewed every 36 months" &&
      maintenanceLabel("something_new", null, "en") === null &&
      !/never expires|lifetime|no expiry/i.test(
        maintenanceLabel("none_published", null, "en") ?? "",
      ),
    "1.11 an unpublished renewal rule is never described as lifetime validity",
  );
  check(
    headlineOf(byCode("INTL_OFFSEC_OSCP"), "en").text !==
      headlineOf(byCode("INTL_OFFSEC_OSCP_PLUS"), "en").text,
    "1.12 OSCP and OSCP+ read differently in the list, not only in the code",
  );
}

// ── 2. Search ────────────────────────────────────────────────────────────

console.log("\n2 · search finds it by abbreviation, full name or organisation, without a category");
{
  const cpp = find({ search: "cpp" });
  check(
    cpp.length === 2 && cpp.includes("INTL_ASIS_CPP") && cpp.includes("FX_PARKING_CPP"),
    "2.1 “cpp” finds both CPPs — and not CISS, whose issuer is IFCPP",
  );
  check(
    new Set(
      cpp.map(
        (c) =>
          `${headlineOf(byCode(c), "en").text}|${bylineOf({ ...byCode(c), regulator: null }, "en")}`,
      ),
    ).size === 2,
    "2.2 two awards sharing an abbreviation differ in the list by full name AND awarding organisation",
  );
  check(
    find({ search: "CIPP/E" }).join() === "INTL_IAPP_CIPP_E" &&
      find({ search: "cipp e" }).join() === "INTL_IAPP_CIPP_E",
    "2.3 “CIPP/E” and “cipp e” are the same words",
  );
  const cis = find({ search: "cis" });
  check(
    ["INTL_IFCPP_CISS", "INTL_ISC2_CISSP", "INTL_ISACA_CISM", "INTL_ISACA_CISA"].every((c) =>
      cis.slice(0, 4).includes(c),
    ),
    "2.4 a prefix of an abbreviation lists those abbreviations before any name match",
  );
  check(
    find({ search: "certified protection professional" }).join() === "INTL_ASIS_CPP",
    "2.5 the full name finds it",
  );
  check(
    find({ search: "asis" }).join() === "INTL_ASIS_CPP",
    "2.6 the awarding organisation finds its certification",
  );
  check(
    find({ search: "(ISC)²" }).join() === "INTL_ISC2_CISSP" &&
      find({ search: "isc2" }).join() === "INTL_ISC2_CISSP",
    "2.7 an approved issuer alias finds it",
  );
  check(
    find({ search: "former title" }).join() === "INTL_ICA_CIP" &&
      !headlineOf(byCode("INTL_ICA_CIP"), "en").text.includes("former") &&
      !bylineOf({ ...byCode("INTL_ICA_CIP"), regulator: null }, "en").includes("former"),
    "2.8 a former name finds the definition and is never shown as its name",
  );
  check(
    find({ search: "managing safely" }).join() === "INTL_IOSH_MANAGING_SAFELY" &&
      find({ search: "ioSH" }).join() === "INTL_IOSH_MANAGING_SAFELY",
    "2.9 a holder who does not know the category finds a course certificate by name or issuer",
  );
  check(
    find({ search: "oscp" }).length === 2 && find({ search: "oscp+" }).length === 2,
    "2.10 OSCP finds both OffSec awards: the list, not the matcher, tells them apart",
  );
  check(
    find({ search: "zzzz-no-such" }).length === 0 && find({ search: "   " }).length === ROWS.length,
    "2.11 nothing matches nothing, and a blank search narrows nothing",
  );
  check(
    searchScore(byCode("INTL_ASIS_CPP"), "cpp") === 100 &&
      searchScore(byCode("INTL_ISC2_CISSP"), "cis") === 80 &&
      searchScore(byCode("INTL_ASIS_CPP"), "protection") === 60 &&
      searchScore(byCode("INTL_ASIS_CPP"), "asis") === 40 &&
      searchScore(byCode("INTL_ASIS_CPP"), "nonsense") === 0,
    "2.12 an exact abbreviation outranks a prefix, a name, an organisation",
  );
  check(
    find({ search: "sec" }).includes("INTL_IFCPP_CISS") && !find({ search: "ecurity" }).length,
    "2.13 a token starts a word: “sec” finds Security, “ecurity” finds nothing",
  );
  check(
    find({ search: "väktar" }).join() === "VU1",
    "2.14 a Swedish national credential is found in the same search",
  );
}

// ── 3. Scope and filters ─────────────────────────────────────────────────

console.log("\n3 · scope starts at all; the filters narrow, and clear exactly what they must");
{
  check(
    EMPTY_FILTERS.scope === "all",
    "3.1 the picker starts at all credentials, international and national",
  );
  const everything = filterCatalogue(index, EMPTY_FILTERS);
  const international = filterCatalogue(index, { ...EMPTY_FILTERS, scope: "international" });
  const national = filterCatalogue(index, { ...EMPTY_FILTERS, scope: "national" });
  check(
    everything.results.length === ROWS.length &&
      international.results.length === ROWS.filter((r) => !r.scope).length &&
      national.results.length === 2,
    "3.2 all = international + national; neither is chosen for the holder",
  );
  const kept = changeFilter(
    index,
    { ...EMPTY_FILTERS, search: "cpp", domain: "physical_security" },
    { scope: "international" },
  );
  check(
    kept.search === "cpp" && kept.scope === "international" && kept.country === "",
    "3.3 changing scope keeps what the holder typed and needs no country",
  );
  const na = changeFilter(
    index,
    { ...EMPTY_FILTERS, search: "väktar" },
    { scope: "national", country: "SE" },
  );
  check(
    na.search === "väktar" && changeFilter(index, na, { scope: "all" }).country === "",
    "3.4 leaving national clears the country, not the search",
  );
  check(
    find({ category: "course_certificate" }).join() === "INTL_IOSH_MANAGING_SAFELY" &&
      find({ domain: "insurance" }).join() === "INTL_ICA_CIP",
    "3.5 type and subject filter the same list the search does",
  );
  check(
    find({ organisation: issuerId("offsec") }).length === 2 &&
      find({ organisation: issuerId("asis"), search: "cpp" }).join() === "INTL_ASIS_CPP",
    "3.6 the issuer filter and the search combine, and tell the two CPPs apart",
  );
  check(
    !filterCatalogue(index, clearOptionalFilters({ ...EMPTY_FILTERS, search: "cpp", domain: "x" }))
      .narrowed &&
      clearOptionalFilters({ ...EMPTY_FILTERS, scope: "national", country: "SE", search: "x" })
        .country === "SE",
    "3.7 clear filters empties the optional filters and the search, never the scope or country",
  );
  check(
    international.categories.some((c) => c.value === "course_certificate") &&
      international.domains.some((d) => d.value === "insurance"),
    "3.8 every kind and area offered by the catalogue is a filter option with its count",
  );
  check(
    credentialClassLabel("kind_from_the_future", "en") === "Other professional credential" &&
      find({ search: "has not met" }).join() === "INTL_ICA_FUTURE_KIND",
    "3.9 a definition of a kind this build has not met is still listed and still findable",
  );
}

// ── 4. Changing the selection ────────────────────────────────────────────

console.log(
  "\n4 · choosing another credential clears what depended on the old one, keeps the rest",
);
{
  const blank: InternationalCredentialInput = {
    definition_code: "",
    market_country: "",
    market_region: "",
    identifier: "",
    issued_on: "",
    valid_until: "",
    no_expiry: null,
    authorisation_scope: "",
    issuer_name: "",
    definition_version: "",
  };
  const current: InternationalCredentialInput = {
    ...blank,
    definition_code: "VU1",
    market_country: "SE",
    identifier: "AB-123",
    issued_on: "2024-01-01",
    valid_until: "2027-01-01",
    authorisation_scope: "Site A",
    issuer_name: "Acme Utbildning AB",
    definition_version: "v2",
  };
  const next = draftAfterDefinitionChange(current, blank, "INTL_ASIS_CPP", {
    allows_no_expiry: false,
    requires_valid_until: false,
  });
  check(
    next.definition_code === "INTL_ASIS_CPP" &&
      next.issuer_name === "" &&
      next.authorisation_scope === "" &&
      next.definition_version === "" &&
      next.market_country === "",
    "4.1 the issuer on the document, the scope, the version and the territory do not survive",
  );
  check(
    next.identifier === "AB-123" &&
      next.issued_on === "2024-01-01" &&
      next.valid_until === "2027-01-01",
    "4.2 the identifier and both dates are the holder's own and stay",
  );
  const lifetime = { ...current, no_expiry: true as const, valid_until: "" };
  check(
    draftAfterDefinitionChange(lifetime, blank, "A", {
      allows_no_expiry: false,
      requires_valid_until: false,
    }).no_expiry === null &&
      draftAfterDefinitionChange(lifetime, blank, "B", {
        allows_no_expiry: true,
        requires_valid_until: true,
      }).no_expiry === null &&
      draftAfterDefinitionChange(lifetime, blank, "C", {
        allows_no_expiry: true,
        requires_valid_until: false,
      }).no_expiry === true,
    "4.3 an explicit non-expiring choice survives only where the new definition permits it",
  );
  check(
    draftAfterDefinitionChange(current, blank, "", undefined).definition_code === "" &&
      draftAfterDefinitionChange(current, blank, "X", undefined).no_expiry === null,
    "4.4 choosing nothing, or a definition that is not in the catalogue, never invents a permission",
  );
  const withExtra = {
    ...current,
    a_field_added_later: "x",
  } as unknown as InternationalCredentialInput;
  check(
    !("a_field_added_later" in draftAfterDefinitionChange(withExtra, blank, "X", undefined)),
    "4.5 a field this function has not been told to keep is cleared by default",
  );
}

// ── 5. Why something is not selectable; the request ──────────────────────

console.log("\n5 · a missing certification is explained, and can be asked for — nothing more");
{
  const sql = read(foundationMigration());
  const vocabulary =
    /holder_reason\s+text CHECK \(holder_reason IN\s*\(([^)]*)\)/.exec(sql)?.[1] ?? "";
  const inSql = [...vocabulary.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  check(
    inSql.length > 0 && inSql.join() === Object.keys(UNAVAILABLE_REASONS).sort().join(),
    "5.1 the reasons a holder can be given are exactly the database's controlled vocabulary",
  );
  check(
    Object.keys(UNAVAILABLE_REASONS).every((k) => {
      const reason = (UNAVAILABLE_REASONS as Record<string, { sv: string; en: string }>)[k];
      return (
        reason.sv.length > 8 &&
        reason.en.length > 8 &&
        unavailableReasonLabel(k, "en") === reason.en &&
        unavailableReasonLabel(k, "sv") === reason.sv
      );
    }) &&
      unavailableReasonLabel(null, "en") === "Not available for registration yet" &&
      unavailableReasonLabel("a_reason_from_the_future", "sv") ===
        "Inte tillgänglig för registrering ännu",
    "5.2 every reason is written in both languages, and an unknown or missing one has a neutral fallback",
  );
  const between = (column: string) => {
    const m = new RegExp(`${column}\\s+text[^\\n]*BETWEEN (\\d+) AND (\\d+)`).exec(
      /sp_catalogue_requests \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "",
    );
    return m ? [Number(m[1]), Number(m[2])] : [];
  };
  check(
    between("requested_name").join() === [REQUEST_LIMITS.nameMin, REQUEST_LIMITS.nameMax].join() &&
      between("requested_issuer").join() ===
        [REQUEST_LIMITS.issuerMin, REQUEST_LIMITS.issuerMax].join() &&
      between("requested_abbreviation").join() === `1,${REQUEST_LIMITS.abbreviationMax}` &&
      /note\s+text CHECK \(note IS NULL OR length\(note\) <= 600\)/.test(sql) &&
      REQUEST_LIMITS.noteMax === 600 &&
      /length\(source_url\) <= 500/.test(sql) &&
      REQUEST_LIMITS.urlMax === 500,
    "5.3 the form's limits are the database's limits",
  );
  const valid = {
    ...EMPTY_REQUEST,
    requested_name: "Certified Example Specialist",
    requested_issuer: "Example Institute",
  };
  check(
    validateCatalogueRequest(valid, "en") === null,
    "5.4 a name and an issuer make a valid request",
  );
  check(
    validateCatalogueRequest({ ...valid, requested_name: "ab" }, "en")?.field ===
      "requested_name" &&
      validateCatalogueRequest({ ...valid, requested_issuer: "x" }, "en")?.field ===
        "requested_issuer" &&
      validateCatalogueRequest({ ...valid, source_url: "http://insecure.example" }, "en")?.field ===
        "source_url" &&
      validateCatalogueRequest({ ...valid, source_url: "https://has space.example" }, "en")
        ?.field === "source_url" &&
      validateCatalogueRequest({ ...valid, note: "x".repeat(601) }, "sv")?.field === "note" &&
      validateCatalogueRequest({ ...valid, requested_abbreviation: "x".repeat(25) }, "en")
        ?.field === "requested_abbreviation",
    "5.5 each limit refuses its own field, by name, before anything is sent",
  );
  check(
    validateCatalogueRequest(
      { ...valid, source_url: "https://example.org/certification" },
      "en",
    ) === null,
    "5.6 an https link is accepted",
  );
  check(
    requestErrorMessage("SP_REQUEST_DUPLICATE", "en").includes("already have an open request") &&
      requestErrorMessage("SP_REQUEST_LIMIT", "sv").includes("tio") &&
      requestErrorMessage("whatever", "en").includes("still here") &&
      requestStatusLabel("declined", "en") === "Not taken into the catalogue" &&
      requestStatusLabel("a_status_from_the_future", "en") === "Sent",
    "5.7 a refusal is explained, the draft is said to be kept, and an unknown status is neutral",
  );
  check(
    !/verif|approved|godkänd/i.test(requestStatusLabel("answered_existing", "en")) &&
      !/verif/i.test(requestStatusLabel("open", "en")),
    "5.8 no request status reads as verification or approval of the holder's credential",
  );
}

// ── 6. Structure: what the wizard can and cannot do ──────────────────────

console.log("\n6 · structure: a request is not a definition, and a filter is not a territory");
{
  const form = read("src/components/security-passport/InternationalCredentialForm.tsx");
  const list = read("src/components/security-passport/CredentialResultList.tsx");
  const panel = read("src/components/security-passport/CatalogueRequestPanel.tsx");
  const fns = read("src/lib/security-passport/catalogue-requests.functions.ts");
  const unavailableGroup = list.slice(list.indexOf("export function UnavailableGroup"));
  check(
    !/type="radio"|onSelect|onChange/.test(unavailableGroup) &&
      /data-unavailable-ask/.test(unavailableGroup),
    "6.1 a credential that is not available has no control that selects it; its only action is to ask",
  );
  check(
    !/<form[\s>]/.test(panel) && /sending\.current/.test(panel) && /disabled=\{busy\}/.test(panel),
    "6.2 the request panel is not a form (it cannot submit the credential form) and sends once",
  );
  check(
    /setDraft\(EMPTY_REQUEST\)/.test(panel) &&
      /catch \(cause\)[\s\S]{0,400}requestErrorMessage/.test(panel) &&
      !/catch[\s\S]{0,300}setDraft\(/.test(panel.slice(panel.indexOf("catch (cause)"))),
    "6.3 a successful request empties the draft; a failed one leaves exactly what was typed",
  );
  const writers = (dir: string): string[] =>
    readdirSync(path.join(root, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (statSync(path.join(root, rel)).isDirectory()) return writers(rel);
      return /\.(ts|tsx)$/.test(name) ? [rel] : [];
    });
  const direct = writers("src")
    .filter((rel) => !/integrations\/supabase\/types\.ts$/.test(rel))
    // The administrator's own, read-only queue (checked by passport-catalogue-admin:check).
    .filter((rel) => rel !== "src/lib/job-intelligence/admin-catalogue-research.functions.ts")
    .filter((rel) => /from\(\s*"sp_catalogue_(requests|research_records)"/.test(read(rel)));
  check(
    direct.length === 0,
    `6.4 no holder-side code reads or writes a request or a research record as a table — ${direct.join(", ") || "none"}`,
  );
  check(
    /rpc\("sp_request_catalogue_definition"/.test(fns) &&
      /rpc\("sp_catalogue_unavailable_matches"/.test(fns) &&
      /rpc\("sp_list_my_catalogue_requests"/.test(fns) &&
      !/\.(insert|update|upsert|delete)\(/.test(fns) &&
      !/sp_claims|sp_credential_types|assertion_level/.test(fns),
    "6.5 the holder's three calls are the database's three functions, and touch no claim or definition",
  );
  check(
    /\.middleware\(\[requireSupabaseAuth\]\)/.test(fns) &&
      (fns.match(/createServerFn/g) ?? []).length === 4 &&
      (fns.match(/requireSupabaseAuth\]\)/g) ?? []).length === 3,
    "6.6 all three server functions run as the signed-in holder, never as a service role",
  );
  check(
    (form.match(/setFilters\(/g) ?? []).length === 2 &&
      /setFilters\(\(current\) => changeFilter\(index, current, patch\)\)/.test(form) &&
      /setFilters\(\(current\) => clearOptionalFilters\(current\)\)/.test(form) &&
      /useState<CatalogueFilterState>\(\{\s*\.\.\.EMPTY_FILTERS,/.test(form),
    "6.7 the scope and country are set once, as a starting state, and only ever changed by the holder",
  );
  check(
    (form.match(/preselectCountry/g) ?? []).length === 3 &&
      /startCountry = initial\?\.market_country \|\| preselected\?\.country \|\| preselectCountry/.test(
        form,
      ),
    "6.8 the work country is read once, for the start, and never again: changing it cannot rewrite the scope",
  );
  check(
    /market_country: selected\.country \?\? ""/.test(form) &&
      !/market_country: filters/.test(form) &&
      !/requiresJurisdiction|selectedCountry/.test(form),
    "6.9 an international certification is saved with no country, and no jurisdiction is asked for it",
  );
  check(
    /if \(!selected \|\| saving\.current\) return;/.test(form) &&
      /saving\.current = true;/.test(form) &&
      /if \(!savedId\.current\)/.test(form),
    "6.10 saving cannot be started twice, and a saved claim is never saved again by a retry",
  );
  check(
    !/<select[^>]*\n?[^>]*Godkänd merit|Approved credential/.test(form),
    "6.11 the credential is chosen from the ranked list, not from an unsearchable select",
  );
  check(
    /issuer_name: selected\.issuerStatedOnDocument \? draft\.issuer_name : ""/.test(form) &&
      /authorisation_scope: selected\.requiresScope \? draft\.authorisation_scope : ""/.test(form),
    "6.12 the issuer and the scope are asked for, and sent, only where the definition needs them",
  );
  check(
    /data-credential-international-note/.test(form) &&
      /Det säger ingenting om var du får arbeta/.test(form),
    "6.13 “international” is explained as not tied to a country, and as no permission to work",
  );
  check(
    /Ett bifogat dokument är underlag, inte en verifiering/.test(form) &&
      /Att välja en merit/.test(form) === false,
    "6.14 the review step still says a document is evidence, not verification",
  );
}

// ── 7. The plate prints the whole mark ───────────────────────────────────

console.log("\n7 · a credential's plate prints its whole governed mark");
{
  const legendOf = (code: string | null, mark: string | null) =>
    /<text[^>]*>([^<]*)<\/text>/.exec(credentialSymbolMarkup(code, "verified", mark))?.[1] ?? "";
  check(
    legendOf("INTL_ISC2_CISSP", credentialMark("INTL_ISC2_CISSP")) === "CISSP" &&
      legendOf("INTL_ISACA_CRISC", credentialMark("INTL_ISACA_CRISC")) === "CRISC",
    "7.1 CISSP and CRISC are printed whole, not as CISS and CRIS",
  );
  const marks = Object.entries(RESEARCH_CREDENTIAL_MARKS);
  check(
    marks.length === 140 &&
      marks.every(([code, mark]) => credentialMark(code) === mark) &&
      marks.every(([code, mark]) => legendOf(code, mark) === mark.toUpperCase()),
    "7.2 every one of the 140 researched definitions resolves to a mark and prints it whole",
  );
  const longest = Math.max(...marks.map(([, m]) => m.length));
  const sizes = new Set(
    ["VU1", "CPP", "CISSP", "ANZIIF", "PenTest+"].map(
      (m) => /font-size="([^"]+)"/.exec(credentialSymbolMarkup(null, "verified", m))?.[1],
    ),
  );
  check(
    longest <= 8 && sizes.size === 4,
    "7.3 a longer mark is set smaller so it fits the plate (four or fewer keep the original size)",
  );
  check(
    credentialSymbolMarkup(null, "verified", "VU1").includes(
      'font-size="8.6" font-weight="700" letter-spacing="1.1"',
    ),
    "7.4 a mark that already shipped is byte-for-byte the same plate",
  );
  check(
    credentialMark("INTL_NOT_A_REAL_DEFINITION") === null &&
      !credentialSymbolMarkup("INTL_NOT_A_REAL_DEFINITION", "verified", null).includes("<text"),
    "7.5 an unknown definition has no mark and no plate legend: nothing is derived from its code",
  );
}

// ── 8. A claim type this build does not know is still shown and shareable ──

console.log("\n8 · an unknown claim type is named generically and never silently dropped");
{
  const persona = personaById("overlapping-employers");
  const odd = {
    ...persona.claims[0],
    id: "f1900000-0000-4000-8000-0000000000aa",
    claimType: "kind_from_the_future" as never,
    lifecycleState: "active" as const,
    assertionLevel: "self_declared" as const,
    validUntil: "2099-01-01",
  };
  const model = buildShareSelection({
    claims: [odd],
    periods: [],
    attention: null,
    reviewState: "failed",
    now: new Date("2026-10-03T00:00:00Z"),
  });
  check(
    model.eligibleCount === 1 &&
      model.groups.some((g) => g.candidates.some((c) => c.merit.id === odd.id)),
    "8.1 the sharing screen lists a credential of an unknown type, under a neutral group",
  );
  const workspace = buildPassportWorkspace({
    claims: [odd],
    periods: [],
    attention: null,
    reviewState: "failed",
    now: new Date("2026-10-03T00:00:00Z"),
  });
  const merits = Object.values(workspace.groups).flat() as readonly {
    id: string;
    typeKey?: string;
  }[];
  const shown = merits.find((m) => m.id === odd.id);
  check(
    shown?.typeKey === "claims.type.other" &&
      passportCopy.sv["claims.type.other"] === "Annan merit" &&
      passportCopy.en["claims.type.other"] === "Other credential",
    "8.2 the Passport names it generically, in both languages, instead of printing nothing",
  );
}

if (failures.length) {
  console.error(`\npassport-credential-picker-check FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\npassport-credential-picker-check: ${passed} assertions passed.`);
