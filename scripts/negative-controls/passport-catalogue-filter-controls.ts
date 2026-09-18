/**
 * Negative controls for the add-credential wizard's filter model.
 *
 * Each mutation brings back one of the defects the owner's addendum named: a
 * region filter that hides a country-wide credential, a stale organisation
 * that survives a country change, a search that ignores abbreviations and
 * approved aliases, a filter defaulted to a first option, a scope or issuer
 * saved from somewhere other than the selected definition, a region control
 * shown where no region exists, and an empty RPC key travelling to a database
 * that would refuse it.
 *
 * Run: bun run negative-controls:passport-catalogue-filter
 */
import { runControls, type Mutation } from "./runner";

const MODEL = "src/lib/security-passport/credential-catalogue-filters.ts";
const FORM = "src/components/security-passport/InternationalCredentialForm.tsx";
const FN = "src/lib/security-passport/international.functions.ts";
const DIAG = "src/lib/security-passport/catalogue-diagnostics.ts";
const ADMIN = "src/lib/job-intelligence/admin-passport-catalogue.functions.ts";
const GUARD = "passport-catalogue-filter:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCF-NC-REGION-HIDES-COUNTRYWIDE",
    defect:
      "a region filter hides credentials that are valid in the whole country, so choosing Northern Ireland loses every ordinary SIA licence",
    file: MODEL,
    find: "    if (d.region && d.region !== state.region) return false;",
    replace: "    if (d.region !== state.region) return false;",
    guard: GUARD,
    expect: "3 filtering Northern Ireland keeps the GB-wide door supervision licence",
  },
  {
    id: "PCF-NC-STALE-ORGANISATION-SURVIVES",
    defect:
      "changing country no longer reconciles the other filters, so a Swedish organisation stays selected in Great Britain and the list is silently empty",
    file: MODEL,
    find: "  let next: CatalogueFilterState = { ...state, ...change };",
    replace:
      "  let next: CatalogueFilterState = { ...state, ...change };\n  if (change.country !== undefined) return next;",
    guard: GUARD,
    expect: "4 changing country clears an organisation that does not exist there",
  },
  {
    id: "PCF-NC-SEARCH-IGNORES-ABBREVIATION",
    defect: "the search stops reading the governed abbreviation, so 'CPP' finds nothing",
    file: MODEL,
    find: '          abbreviationOf.get(d.code) ?? "",\n',
    replace: "",
    guard: GUARD,
    expect: "7 an abbreviation finds its certification",
  },
  {
    id: "PCF-NC-SEARCH-IGNORES-ALIASES",
    defect: "the approved issuer aliases are dropped from the search, so '(ISC)²' finds nothing",
    file: MODEL,
    find: "          ...aliasText,\n",
    replace: "",
    guard: GUARD,
    expect: "7 an approved issuer alias finds the issuer's certifications",
  },
  {
    id: "PCF-NC-FIRST-ORGANISATION-DEFAULT",
    defect:
      "the organisation filter starts on an organisation instead of on 'all', narrowing the catalogue before the holder chose anything",
    file: MODEL,
    find: '  organisation: "",\n  search: "",\n};',
    replace: '  organisation: "auth-police",\n  search: "",\n};',
    guard: GUARD,
    expect: "1 every optional filter starts empty",
  },
  {
    id: "PCF-NC-AREA-EXCLUDES-UNREVIEWED",
    defect:
      "the professional-area filter is applied even when it is 'all', so a definition with no reviewed area disappears from the catalogue",
    file: MODEL,
    find: '  if (skip !== "domain" && state.domain && d.domain !== state.domain) return false;',
    replace: '  if (skip !== "domain" && d.domain !== state.domain) return false;',
    guard: GUARD,
    expect: "8 a definition with no reviewed area is listed under all areas",
  },
  {
    id: "PCF-NC-SCOPE-SAVED-FROM-THE-DRAFT",
    defect:
      "the scope is saved from whatever the draft holds instead of from the selected definition, so a stale scope travels with an unscoped credential",
    file: FORM,
    find: '            authorisation_scope: selected.requiresScope ? draft.authorisation_scope : "",',
    replace: "            authorisation_scope: draft.authorisation_scope,",
    guard: GUARD,
    expect: "saved from the SELECTED definition",
  },
  {
    id: "PCF-NC-REGION-CONTROL-ALWAYS-SHOWN",
    defect: "the region control is shown for a country that has no regional credential",
    file: FORM,
    find: "                  {answer.regionRelevant && (",
    replace: "                  {true && (",
    guard: GUARD,
    expect: "the region control is rendered only when it is relevant",
  },
  {
    id: "PCF-NC-EMPTY-KEY-TRAVELS",
    defect:
      "an empty scope key is sent to the RPC, which a database that has not received 20261126090000 refuses for every credential",
    file: FN,
    find: "    if (authorisation_scope?.trim()) input.authorisation_scope = authorisation_scope.trim();",
    replace: '    input.authorisation_scope = authorisation_scope ?? "";',
    guard: GUARD,
    expect: "the two new RPC keys travel only when they carry a value",
  },
  {
    id: "PCF-NC-APPROVAL-OPENS-A-PILOT-MARKET",
    defect:
      "the administrator's diagnosis reports an approved pilot definition as selectable by everyone, merging definition approval with market entitlement",
    file: DIAG,
    find: '        ? "selectable_pilot_members"',
    replace: '        ? "selectable"',
    guard: GUARD,
    expect: "D once approved it is selectable by pilot members only",
  },
  {
    id: "PCF-NC-UNRESOLVED-ISSUER-LISTED",
    defect:
      "a definition with neither a governed issuer nor a governed regulator is reported as selectable instead of blocked",
    file: DIAG,
    find: '  if (!issuerResolved) reasons.push("issuer_unresolved");',
    replace: "  void issuerResolved;",
    guard: GUARD,
    expect: "D with no governed issuer and no governed regulator the definition is blocked",
  },
  {
    id: "PCF-NC-DIAGNOSIS-WITHOUT-ADMIN-CHECK",
    defect:
      "the catalogue diagnosis reaches for the service-role client without first proving the caller is a platform administrator",
    file: ADMIN,
    find: "    const ctx = context as Ctx;\n    await assertAdmin(ctx);\n    // Service role AFTER the admin check",
    replace: "    const ctx = context as Ctx;\n    // Service role AFTER the admin check",
    guard: GUARD,
    expect: "A the platform-admin check runs on the server BEFORE the service-role client",
  },
  {
    id: "PCF-NC-ACTIVATION-PUBLISHES-PILOT-DEFINITIONS",
    defect:
      "the diagnosis stops requiring the market to still be a pilot, so activating a market reports every pilot-only definition as available",
    file: DIAG,
    find: '  const pilotRoute = !global && !d.isActive && d.pilotState === "internal_pilot" && marketPilot;',
    replace: '  const pilotRoute = !global && !d.isActive && d.pilotState === "internal_pilot";',
    guard: GUARD,
    expect: "D activating the market publishes no pilot-only definition",
  },
  {
    id: "PCF-NC-READER-FORGETS-THE-CONTRACT",
    defect:
      "the market panels stop declaring the catalogue contract, so they list fewer credentials than the wizard they lead into can save",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: "      .setHeader(PASSPORT_CATALOGUE_CONTRACT_HEADER, PASSPORT_CATALOGUE_CONTRACT);",
    replace: ";",
    guard: GUARD,
    expect: "G BOTH catalogue readers declare the contract",
  },
];

runControls("passport-catalogue-filter", MUTATIONS);
