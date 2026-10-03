/**
 * Negative controls for the credential picker and the catalogue administration.
 *
 * Each mutation brings back one defect the picker must never have: a search that
 * misses an abbreviation or matches the middle of a word, a headline that
 * invents an abbreviation, a selection change that carries a stale issuer or a
 * lifetime across, a request form that can be a second credential form, a plate
 * that prints CISS for CISSP, an administration function that reads before it
 * checks the role, and a decision that can approve.
 *
 * Run: bun run negative-controls:passport-credential-picker
 */
import { runControls, type Mutation } from "./runner";

const MODEL = "src/lib/security-passport/credential-catalogue-filters.ts";
const PICKER = "src/lib/security-passport/credential-picker.ts";
const FORM = "src/components/security-passport/InternationalCredentialForm.tsx";
const LIST = "src/components/security-passport/CredentialResultList.tsx";
const PANEL = "src/components/security-passport/CatalogueRequestPanel.tsx";
const FNS = "src/lib/security-passport/catalogue-requests.functions.ts";
const ADMIN_FNS = "src/lib/job-intelligence/admin-catalogue-research.functions.ts";
const RESEARCH_PANEL = "src/components/admin/passport-catalogue/ResearchPanel.tsx";
const LABELS = "src/lib/security-passport/catalogue-research-labels.ts";
const DIAG = "src/lib/security-passport/catalogue-diagnostics.ts";
const SHARE = "src/lib/security-passport/share-selection.ts";
const SYMBOLS = "src/lib/security-passport/design/credential-symbols.ts";
const CREDENTIALS = "src/lib/security-passport/credentials.ts";
const AUDIT = "src/routes/_authenticated.admin.audit.tsx";
const PICKER_GUARD = "passport-credential-picker:check";
const ADMIN_GUARD = "passport-catalogue-admin:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCP-NC-SCOPE-STARTS-INTERNATIONAL",
    defect:
      "the picker starts at international credentials only, so a holder who does not know whether theirs is national never finds it",
    file: MODEL,
    find: '  scope: "all",',
    replace: '  scope: "international",',
    guard: PICKER_GUARD,
    expect: "3.1 the picker starts at all credentials",
  },
  {
    id: "PCP-NC-SEARCH-MATCHES-MID-WORD",
    defect: "a token matches inside a word, so “cpp” finds CISS through IFCPP",
    file: MODEL,
    find: "  return ` ${folded}`.includes(` ${token}`);",
    replace: "  return folded.includes(token);",
    guard: PICKER_GUARD,
    expect: "2.1 “cpp” finds both CPPs",
  },
  {
    id: "PCP-NC-EXACT-ABBREVIATION-NOT-RANKED",
    defect: "an exact abbreviation is no better a match than a word of the name",
    file: MODEL,
    find: "  if (d.fold.abbreviation && d.fold.abbreviation === joined) return 100;\n",
    replace: "",
    guard: PICKER_GUARD,
    expect: "2.12 an exact abbreviation outranks",
  },
  {
    id: "PCP-NC-FORMER-NAME-NOT-SEARCHED",
    defect:
      "a definition's former names stop reaching the search, so a holder who knows the old title finds nothing",
    file: MODEL,
    find: "      ...(definitionAliasesOf.get(d.code) ?? []),\n",
    replace: "",
    guard: PICKER_GUARD,
    expect: "2.8 a former name finds the definition",
  },
  {
    id: "PCP-NC-ABBREVIATION-INVENTED-IN-HEADLINE",
    defect:
      "an award with no published abbreviation is given one made from the initials of its title",
    file: PICKER,
    find: "  const abbreviation = d.abbreviation?.trim() || null;",
    replace:
      '  const abbreviation = d.abbreviation?.trim() || named.split(" ").map((w) => w[0]).join("").toUpperCase() || null;',
    guard: PICKER_GUARD,
    expect: "1.4 an award with no published abbreviation gets none",
  },
  {
    id: "PCP-NC-COURSE-READS-AS-CERTIFICATION",
    defect: "a course certificate is labelled as an international certification",
    file: PICKER,
    find: '  course_certificate: { sv: "Internationellt kursintyg", en: "International course certificate" },',
    replace:
      '  course_certificate: { sv: "Internationell certifiering", en: "International certification" },',
    guard: PICKER_GUARD,
    expect: "1.5 a course certificate, a designation and a certification are three different words",
  },
  {
    id: "PCP-NC-STALE-ISSUER-SURVIVES",
    defect:
      "choosing another credential keeps the issuer, scope and version typed for the old one, so they are saved against the wrong credential",
    file: PICKER,
    find: "  return {\n    ...blank,\n    definition_code: code,",
    replace: "  return {\n    ...current,\n    definition_code: code,",
    guard: PICKER_GUARD,
    expect:
      "4.1 the issuer on the document, the scope, the version and the territory do not survive",
  },
  {
    id: "PCP-NC-NO-EXPIRY-CARRIED-ACROSS",
    defect:
      "an explicit non-expiring choice survives a change to a definition that does not allow it",
    file: PICKER,
    find: "    no_expiry: keepsNoExpiry ? true : null,",
    replace: "    no_expiry: current.no_expiry,",
    guard: PICKER_GUARD,
    expect: "4.3 an explicit non-expiring choice survives only where the new definition permits it",
  },
  {
    id: "PCP-NC-OWN-DATES-DROPPED",
    defect: "choosing another credential throws away the identifier and dates the holder typed",
    file: PICKER,
    find: "    identifier: current.identifier,\n",
    replace: "",
    guard: PICKER_GUARD,
    expect: "4.2 the identifier and both dates are the holder's own and stay",
  },
  {
    id: "PCP-NC-REQUEST-LIMITS-DRIFT",
    defect: "the form accepts a longer name than the database does",
    file: PICKER,
    find: "  nameMax: 160,",
    replace: "  nameMax: 200,",
    guard: PICKER_GUARD,
    expect: "5.3 the form's limits are the database's limits",
  },
  {
    id: "PCP-NC-UNAVAILABLE-ROW-SELECTABLE",
    defect: "a credential that is not available yet gets a control that selects it",
    file: LIST,
    find: "                onClick={() => onAsk(u)}",
    replace: "                onChange={() => onAsk(u)}",
    guard: PICKER_GUARD,
    expect: "6.1 a credential that is not available has no control that selects it",
  },
  {
    id: "PCP-NC-REQUEST-CAN-DOUBLE-SEND",
    defect: "the send button stays enabled while a request is in flight",
    file: PANEL,
    find: "          disabled={busy}\n          aria-busy={busy}",
    replace: "          disabled={false}\n          aria-busy={busy}",
    guard: PICKER_GUARD,
    expect: "6.2 the request panel is not a form",
  },
  {
    id: "PCP-NC-SERVER-FUNCTION-WRITES-A-TABLE",
    defect: "the holder-side listing writes to a catalogue table directly",
    file: FNS,
    find: '    const result = await context.supabase.rpc("sp_list_my_catalogue_requests");',
    replace:
      '    await context.supabase.from("sp_catalogue_requests").insert({});\n    const result = await context.supabase.rpc("sp_list_my_catalogue_requests");',
    guard: PICKER_GUARD,
    expect: "6.5 the holder's three calls are the database's three functions",
  },
  {
    id: "PCP-NC-WORK-COUNTRY-REWRITES-SCOPE",
    defect: "a change of work country rewrites the picker's country after the holder chose it",
    file: FORM,
    find: "    setFilters((current) => changeFilter(index, current, patch));",
    replace:
      "    setFilters((current) => changeFilter(index, current, patch));\n    if (preselectCountry) setFilters((c) => ({ ...c, country: preselectCountry }));",
    guard: PICKER_GUARD,
    expect: "6.7 the scope and country are set once",
  },
  {
    id: "PCP-NC-UNKNOWN-TYPE-DROPPED-FROM-SHARING",
    defect: "a credential of an unknown claim type silently vanishes from the sharing screen",
    file: SHARE,
    find: '        "qualification");',
    replace: "        undefined as never);",
    guard: PICKER_GUARD,
    expect: "8.1 the sharing screen lists a credential of an unknown type",
  },
  {
    id: "PCP-NC-PLATE-TRUNCATES-CISSP",
    defect: "the plate prints the first four characters of a five-character mark: CISS for CISSP",
    file: SYMBOLS,
    find: '(label ?? "").trim().slice(0, 8).toUpperCase()',
    replace: '(label ?? "").trim().slice(0, 4).toUpperCase()',
    guard: PICKER_GUARD,
    expect: "7.1 CISSP and CRISC are printed whole",
  },
  {
    id: "PCP-NC-RESEARCH-MARKS-NOT-WIRED",
    defect: "the generated marks are never read, so 140 new credentials print no plate legend",
    file: CREDENTIALS,
    find: "CREDENTIAL_MARKS[code] ?? RESEARCH_CREDENTIAL_MARKS[code] ?? null",
    replace: "CREDENTIAL_MARKS[code] ?? null",
    guard: PICKER_GUARD,
    expect: "7.2 every one of the 140 researched definitions resolves to a mark",
  },
  // ── the catalogue administration ──
  {
    id: "PCA-NC-READS-BEFORE-ROLE-CHECK",
    defect: "the research queue is read before the caller is known to be an administrator",
    file: ADMIN_FNS,
    find: '    await assertAdmin(ctx);\n    const result = await ctx.supabase\n      .from("sp_catalogue_research_records")',
    replace: '    const result = await ctx.supabase\n      .from("sp_catalogue_research_records")',
    guard: ADMIN_GUARD,
    expect: "1.3 every one checks is_platform_admin BEFORE it reads or writes anything",
  },
  {
    id: "PCA-NC-SERVICE-ROLE-READS-REQUESTS",
    defect: "the requests list bypasses RLS with the service role",
    file: ADMIN_FNS,
    find: '    const result = await ctx.supabase\n      .from("sp_catalogue_requests")',
    replace:
      '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const result = await supabaseAdmin\n      .from("sp_catalogue_requests")',
    guard: ADMIN_GUARD,
    expect: "1.4 none of them uses the service role",
  },
  {
    id: "PCA-NC-DECISION-CAN-APPROVE",
    defect: "the decision a page may send includes approval",
    file: ADMIN_FNS,
    find: '    decision: z.enum(["pending", "needs_information", "excluded"]),',
    replace: '    decision: z.enum(["pending", "needs_information", "excluded", "approved"]),',
    guard: ADMIN_GUARD,
    expect: "2.1 the decision a page may send is pending, needs_information or excluded",
  },
  {
    id: "PCA-NC-PUBLISHED-RECORD-EDITABLE",
    defect: "a record that already is a published definition offers a decision form",
    file: RESEARCH_PANEL,
    find: "                  {r.credentialCode ? (",
    replace: "                  {false ? (",
    guard: ADMIN_GUARD,
    expect: "3.2 a record that already is a definition offers no decision form",
  },
  {
    id: "PCA-NC-COURSE-LABELLED-AS-CERTIFICATION",
    defect: "the research queue labels a course certificate as a professional certification",
    file: LABELS,
    find: '  course_certificate: { sv: "Kursintyg", en: "Course certificate" },\n} as const satisfies Record<string, Words>;\nexport const researchKindLabel',
    replace:
      '  course_certificate: { sv: "Personcertifiering", en: "Professional certification" },\n} as const satisfies Record<string, Words>;\nexport const researchKindLabel',
    guard: ADMIN_GUARD,
    expect: "3.4 the five kinds are five different labels",
  },
  {
    id: "PCA-NC-RETIRED-STILL-SELECTABLE",
    defect: "a retired definition is shown as blocked or selectable instead of retired",
    file: DIAG,
    find: '    reasons.includes("retired") || reasons.includes("deprecated")',
    replace: "    false",
    guard: ADMIN_GUARD,
    expect: "4.3 a definition past its end date is retired",
  },
  {
    id: "PCA-NC-REQUEST-DECISION-NOT-FINDABLE",
    defect: "a request answer cannot be found on the audit page",
    file: AUDIT,
    find: '  "catalogue_request_resolved",\n',
    replace: "",
    guard: ADMIN_GUARD,
    expect: "2.5 both decisions are audited by the database and can be found on the audit page",
  },
];

runControls("passport-credential-picker", MUTATIONS);
