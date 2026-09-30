/**
 * Negative controls for the Passport card's ground and the homepage panel.
 *
 * Each mutation brings back one thing the owner's finish removed — a pattern
 * behind the card, a drifted CSS mirror, a verified-looking example, an
 * action placed on the fictional card, or copy that advertises the Passport
 * as the editor for employment history.
 *
 * Run: bun run negative-controls:passport-card-surface
 */
import { runControls, type Mutation } from "./runner";

const CSS = "src/styles.css";
const HOME = "src/components/site/HomePassportPreview.tsx";
const DICT = "src/i18n/dictionaries.ts";
const GUARD = "passport-card-surface:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCSF-NC-STRIPES-RETURN",
    defect: "the diagonal stripes come back behind the card's name and shields",
    file: CSS,
    find: "  background-image: linear-gradient(168deg, #12294a 0%, #0b1f3a 46%, #061426 100%);",
    replace:
      "  background-image: repeating-linear-gradient(135deg, transparent 0, transparent 18px, rgba(255,255,255,.2) 19px, transparent 20px), linear-gradient(168deg, #12294a 0%, #0b1f3a 46%, #061426 100%);",
    guard: GUARD,
    expect: "no stripes and no image",
  },
  {
    id: "PCSF-NC-CSS-MIRROR-DRIFTS",
    defect:
      "the stylesheet's gradient drifts from the token, so the overview card and the shared card are two different navies",
    file: CSS,
    find: "  background-image: linear-gradient(168deg, #12294a 0%, #0b1f3a 46%, #061426 100%);",
    replace: "  background-image: linear-gradient(168deg, #1b3a66 0%, #0b1f3a 46%, #061426 100%);",
    guard: GUARD,
    expect: "styles.css draws the token's gradient",
  },
  {
    id: "PCSF-NC-ENGRAVING-BEHIND-THE-SHARED-CARD",
    defect: "the wave engraving is mounted behind the shared card's text again",
    file: "src/components/security-passport/live/RecipientPassportCard.tsx",
    find: '      <div className="relative flex h-full flex-col p-5 sm:p-6">',
    replace:
      '      <EngravedField intensity={0.95} />\n      <div className="relative flex h-full flex-col p-5 sm:p-6">',
    guard: GUARD,
    expect: "with no engraving",
  },
  {
    id: "PCSF-NC-EXAMPLE-LOOKS-VERIFIED",
    defect:
      "an example shield is drawn as verified, so the public homepage shows a fictional person with a verified credential",
    file: HOME,
    find: '    state: "self_declared",\n    statusWordKey: "assertion.self_declared",',
    replace: '    state: "verified",\n    statusWordKey: "assertion.self_declared",',
    guard: GUARD,
    expect: "no example shield is verified",
  },
  {
    id: "PCSF-NC-EXAMPLE-LABEL-GONE",
    defect:
      "the Exempel/Example label is removed, so the illustrative card reads as a real holder's Passport",
    file: HOME,
    find: '              {t("home.passportPreview.exampleLabel")}\n',
    replace: "",
    guard: GUARD,
    expect: "labelled an example",
  },
  {
    id: "PCSF-NC-ACTION-ON-THE-EXAMPLE",
    defect:
      "a registration action is placed on the illustrative card, reading as a control on a fictional person's record",
    file: HOME,
    find: "        <figcaption\n          data-home-passport-example-caption",
    replace:
      '        <a href="/signup?redirect=/passport">{t("cta.passport")}</a>\n        <figcaption\n          data-home-passport-example-caption',
    guard: GUARD,
    expect: "the illustrative card holds no control",
  },
  {
    id: "PCSF-NC-DECORATIVE-TRUST-FACT-RETURNS",
    defect:
      "the panel states a trust level of its own again ('Documented'), which describes nobody and reads as if it described somebody",
    file: HOME,
    find: '        {t("home.passportPreview.statusNote")}\n',
    replace: '        {t("home.trust.documented")}\n',
    guard: GUARD,
    expect: "replaced by the status explanation",
  },
  {
    id: "PCSF-NC-PASSPORT-ADVERTISED-AS-THE-CV",
    defect:
      "the homepage says 'Samla erfarenhet, utbildning och certifikat' again — employment history is the CV's, not the Passport's",
    file: DICT,
    find: '      "Samla dina certifikat, licenser och behörigheter på ett ställe – och välj själv vad du delar.",',
    replace:
      '      "Samla erfarenhet, utbildning och certifikat på ett ställe – och välj själv vad du delar.",',
    guard: GUARD,
    expect: "sv · the Passport sentences are the approved ones",
  },
  {
    id: "PCSF-NC-PASSPORT-PAGE-ADVERTISES-EMPLOYMENT",
    defect:
      "the Passport's own page pitches work history again — a single sentence the exact-copy check would not see",
    file: DICT,
    find: '    "passportPage.holds.lead":\n      "Samla det som har betydelse i ditt säkerhetsarbete',
    replace:
      '    "passportPage.holds.lead":\n      "Samla din anställning och det som har betydelse i ditt säkerhetsarbete',
    guard: GUARD,
    expect: '"passportPage.holds.lead" does not advertise the Passport',
  },
  {
    id: "PCSF-NC-EXAMPLE-BACK-ON-THE-HOMEPAGE",
    defect:
      "the illustrative Passport card returns to the homepage, which explains the Passport in depth again instead of pointing to its page",
    file: "src/components/site/HomeSections.tsx",
    find: "export function HomeWhy() {",
    replace:
      'import { HomePassportPreview } from "@/components/site/HomePassportPreview";\nexport function HomeWhy() {',
    guard: GUARD,
    expect: "the homepage does not explain the Passport in depth",
  },
];

runControls("passport-card-surface", MUTATIONS);
