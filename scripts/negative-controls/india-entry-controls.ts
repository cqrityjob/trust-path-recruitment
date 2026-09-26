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

const MUTATIONS: readonly Mutation[] = [
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
    find: 'export const DESTINATIONS = ["AE-DU", "IN", "GB", "AE", "SE"] as const;',
    replace: 'export const DESTINATIONS = ["AE-DU", "IN", "GB", "AE", "SE", "US"] as const;',
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
    find: "    if (readStoredLang()) return;\n    const intent = langIntentFrom(search);",
    replace: "    const intent = langIntentFrom(search);",
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
];

runControls("india-entry", MUTATIONS);
