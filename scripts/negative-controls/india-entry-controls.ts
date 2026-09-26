/**
 * Negative controls for the India entry journey (scripts/india-entry-check.ts).
 *
 * Each mutation plants one defect the guard exists for: a promise the product
 * cannot keep, the OCR engine loaded on arrival, a destination the database
 * would refuse, analytics carrying more than a name, a version that belongs to
 * another definition, an Indian qualification drawn with a globe, a wrong
 * official source, and a nationality question in the setup.
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
];

runControls("india-entry", MUTATIONS);
