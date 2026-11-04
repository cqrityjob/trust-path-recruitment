/**
 * Negative controls for the India entry journey (scripts/india-entry-check.ts).
 *
 * Each mutation plants one defect the guard exists for: a promise the product
 * cannot keep, the OCR engine loaded on arrival, a destination the database
 * would refuse, analytics carrying more than a name, a version that belongs to
 * another definition, an Indian qualification drawn with a globe, a wrong
 * official source, a nationality question in the setup, a sign-up link that
 * drops the page language, a URL language overriding an explicit choice, and
 * a missing expiry date printed as "No expiry" (or an explicit one dropped).
 *
 * Run: bun run negative-controls:india-entry
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "india-entry:check";

const SETUP = "src/routes/_authenticated.passport.start.tsx";
const SETUP_STATE = "src/lib/india-entry/setup-state.ts";

const MUTATIONS: readonly Mutation[] = [
  // ── The last step: completion (BUG-04, app half) ─────────────────────
  {
    id: "INDIA-NC-DECLARATION-PRETICKED",
    defect: "the declaration box is ticked for the holder",
    file: SETUP,
    find: "  const [declared, setDeclared] = useState(false);",
    replace: "  const [declared, setDeclared] = useState(true);",
    guard: GUARD,
    expect: "6.17 the declaration box starts empty",
  },
  {
    id: "INDIA-NC-DOUBLE-SUBMIT",
    defect: "a second click starts a second completion while the first is in flight",
    file: SETUP,
    find: "    if (inFlight.current) return;\n    if (!declared) {",
    replace: "    if (!declared) {",
    guard: GUARD,
    expect: "6.18 one completion at a time, and only after the holder ticked the box",
  },
  {
    id: "INDIA-NC-COMPLETION-WITHOUT-DECLARATION",
    defect: "the server function completes with declared: false",
    file: "src/lib/security-passport/setup-completion.functions.ts",
    find: "      .object({ declared: z.literal(true) })",
    replace: "      .object({ declared: z.boolean() })",
    guard: GUARD,
    expect: "6.21 the server function completes only with the holder's own declaration",
  },
  {
    id: "INDIA-NC-EMPTY-PASSPORT-COMPLETES",
    defect: "an empty Passport is offered the Complete button",
    file: SETUP_STATE,
    find: '  return hasCurrentPassportMerit(s) ? "confirm" : "add";',
    replace: '  return "confirm";',
    guard: GUARD,
    expect: "6.13 an empty Passport cannot be completed",
  },
  {
    id: "INDIA-NC-CV-ENTRY-COUNTS",
    defect: "a CV entry is counted as a Passport merit",
    file: SETUP_STATE,
    find: "  return s.merits.credentials.length > 0 || s.merits.employments.length > 0;",
    replace:
      "  return (\n    s.merits.credentials.length > 0 || s.merits.employments.length > 0 || s.merits.cvEntries > 0\n  );",
    guard: GUARD,
    expect: "6.14 drafts only, or CV entries only, cannot be completed",
  },
  {
    id: "INDIA-NC-COMPLETED-ASKS-AGAIN",
    defect: "a completed holder is sent back through the questions",
    file: SETUP_STATE,
    find: '  if (s.completed) return "done";\n',
    replace: "",
    guard: GUARD,
    expect: "6.11 a completed Passport opens on its completion, whatever else is unanswered",
  },
  {
    id: "INDIA-NC-STUCK-HOLDER-NOT-SENT-BACK",
    defect:
      "a holder with credentials who was never completed is no longer sent to the declaration",
    file: "src/components/security-passport/PassportSideColumn.tsx",
    find: '    profile.onboardingState !== "completed" &&\n',
    replace: '    profile.onboardingState === "never" &&\n',
    guard: GUARD,
    expect:
      "6.25 a holder stuck in the old flow (a current merit, never completed) is sent to the declaration from the Passport",
  },
  {
    id: "INDIA-NC-LOST-RESPONSE-AS-FAILURE",
    defect: "a lost response is reported as a failed completion without reading the database",
    file: SETUP,
    find: "          const next = await onRefresh();\n          if (next.completed)",
    replace:
      '          setProblem("failed");\n          const next = state;\n          if (next.completed)',
    guard: GUARD,
    expect: "6.24 after a lost response the screen reads what the database holds before it speaks",
  },

  {
    id: "INDIA-NC-GUARANTEED-JOB",
    defect: "the landing page promises a job in Dubai",
    file: "src/lib/india-entry/copy.ts",
    find: '  "landing.title": "Your security qualifications, in one place",',
    replace: '  "landing.title": "Guaranteed security jobs in Dubai",',
    guard: GUARD,
    expect: "1.3 en:landing.title makes no claim of a guarantee",
  },
  {
    id: "INDIA-NC-DUBAI-READY",
    defect: "the checklist tells a holder they are Dubai-ready",
    file: "src/lib/india-entry/copy.ts",
    find: '  "check.title": "Next steps for Dubai",',
    replace: '  "check.title": "You are Dubai ready",',
    guard: GUARD,
    expect: "1.3 en:check.title makes no claim of readiness",
  },
  {
    id: "INDIA-NC-OCR-ON-LANDING",
    defect: "the landing page pulls in HAYAT's document reader, and with it the OCR engine",
    file: "src/routes/security-passport.india.tsx",
    find: 'import { trackFunnelOnce } from "@/lib/india-entry/analytics";',
    replace:
      'import { trackFunnelOnce } from "@/lib/india-entry/analytics";\nimport "@/lib/security-passport/hayat/browser-reader";',
    guard: GUARD,
    expect: "2.1 no OCR engine, pdf.js or HAYAT reader is reachable",
  },
  {
    id: "INDIA-NC-DESTINATION-DRIFT",
    defect: "the form offers a destination the database CHECK refuses",
    file: "src/lib/india-entry/destinations.ts",
    find: 'export const DESTINATIONS = ["AE-DU", "IN", "GB", "AE", "SE", "US"] as const;',
    replace: 'export const DESTINATIONS = ["AE-DU", "IN", "GB", "AE", "SE", "US", "NO"] as const;',
    guard: GUARD,
    expect: "3.3 the destination vocabulary mirrors the database CHECK",
  },
  {
    id: "INDIA-NC-ANALYTICS-DETAIL",
    defect: "a funnel event carries the page address (a share token would ride along)",
    file: "src/lib/india-entry/analytics.ts",
    find: "  void trackV31FunnelEvent({ data: { eventName: event } }).catch(() => undefined);",
    replace:
      "  void trackV31FunnelEvent({ data: { eventName: event, detail: { href: window.location.href } } }).catch(() => undefined);",
    guard: GUARD,
    expect: "4.2 it sends the name alone",
  },
  {
    id: "INDIA-NC-VERSION-UNCHECKED",
    defect: "the form sends whatever version is in the draft, including another definition's",
    file: "src/components/security-passport/InternationalCredentialForm.tsx",
    find: "            definition_version: selectedVersions.some(",
    replace:
      "            definition_version: draft.definition_version, _unused: selectedVersions.some(",
    guard: GUARD,
    expect: "6.4 the form sends a version only when it is one of the selected definition's",
  },
  {
    id: "INDIA-NC-GLOBE-FOR-NATIONAL",
    defect: "a recipient reads an Indian national qualification as scope 'unknown'",
    file: "src/lib/security-passport/recipient-presentation.ts",
    find: '            c.scope_code === "national_regulated" || c.scope_code === "national_qualification"',
    replace: '            c.scope_code === "national_regulated"',
    guard: GUARD,
    expect: "6.6 a recipient sees a national qualification as national",
  },
  {
    id: "INDIA-NC-WRONG-SIRA-SOURCE",
    defect: "the Dubai checklist links an unofficial page",
    file: "src/lib/india-entry/copy.ts",
    find: '  siraCadreCard: "https://www.sira.gov.ae/en/services/security-cadre-card",',
    replace: '  siraCadreCard: "https://sira-card-help.example/apply",',
    guard: GUARD,
    expect: "7.1 SIRA's official page is the source",
  },
  {
    id: "INDIA-NC-NATIONALITY-FIELD",
    defect: "the setup starts asking for nationality",
    file: "src/lib/india-entry/setup.functions.ts",
    find: "        locality,\n      } as never,",
    replace: "        locality,\n        nationality: data.countryCode,\n      } as never,",
    guard: GUARD,
    expect: "6.1 the setup has no nationality, immigration or right-to-work field",
  },
  {
    id: "INDIA-NC-LANG-LOST-BEFORE-HYDRATION",
    defect:
      "the sign-up link stops carrying the page language, so a tap before hydration signs up in Swedish",
    file: "src/routes/security-passport.india.tsx",
    find: "  return { redirect: `${INDIA_SETUP_REDIRECT}&lang=${lang}`, lang } as const;",
    replace: "  return { redirect: INDIA_SETUP_REDIRECT, lang } as const;",
    guard: GUARD,
    expect: "5.7 both signed-out links carry the page language, into sign-up and into the setup",
  },
  {
    id: "INDIA-NC-URL-LANG-OVERRIDES-CHOICE",
    defect: "a language in the URL overrides a visitor's explicit, stored choice",
    file: "src/i18n/context.tsx",
    find: "    if (!setLang || readStoredLang()) return;\n    const intent = langIntentFrom(search);",
    replace: "    if (!setLang) return;\n    const intent = langIntentFrom(search);",
    guard: GUARD,
    expect: "5.8 a carried language is adopted only when none is stored, on every navigation",
  },
  {
    id: "INDIA-NC-MISSING-EXPIRY-AS-NO-EXPIRY",
    defect: "an expiry date nobody entered is printed as 'No expiry' again",
    file: "src/lib/security-passport/format.ts",
    find: '  return passportT(noExpiry === true ? "claims.noExpiry" : "claims.expiryNotProvided", lang);',
    replace: '  return passportT("claims.noExpiry", lang);',
    guard: GUARD,
    expect: "8.1 an absent expiry date reads as not provided, in both languages",
  },
  {
    id: "INDIA-NC-EXPLICIT-NO-EXPIRY-DROPPED",
    defect: "the recipient presentation stops carrying an explicit no_expiry",
    file: "src/lib/security-passport/recipient-presentation.ts",
    find: "      validUntil: c.valid_until,\n      noExpiry: c.no_expiry === true,",
    replace: "      validUntil: c.valid_until,\n      noExpiry: false,",
    guard: GUARD,
    expect: "8.5 the recipient presentation carries only an explicit no_expiry",
  },
  {
    id: "INDIA-NC-CLASS-MIRROR-DRIFT",
    defect:
      "the TS class table loses vocational_qualification again -- the 2026-09-26 production crash on /passport",
    file: "src/lib/security-passport/international.ts",
    find: '  vocational_qualification: { sv: "Yrkeskvalifikation", en: "Vocational qualification" },\n',
    replace: "",
    guard: GUARD,
    expect: "9.2 every database credential class has a label (missing: vocational_qualification)",
  },
  {
    id: "INDIA-NC-WALLET-INDEXES-CLASS-TABLE",
    defect: "the wallet indexes the class table directly, so an unknown class blanks the Passport",
    file: "src/components/security-passport/CredentialWallet.tsx",
    find: "{credentialClassLabel(credentialClass(c, r.detail), lang)}",
    replace: "{CREDENTIAL_CLASSES[credentialClass(c, r.detail)][lang]}",
    guard: GUARD,
    expect: "9.6 the wallet never indexes the class table directly",
  },
];

runControls("india-entry", MUTATIONS);
