/**
 * Negative controls for the Passport card's ground and the homepage panel.
 *
 * Each mutation brings back one thing the owner's finish removed — a pattern
 * behind the card, a drifted CSS mirror, a verified-looking example, the
 * action moved into the fictional card, or copy that advertises the Passport
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
    find: '      code: "INTL_ASIS_CPP",\n      name: "Certified Protection Professional (CPP)",\n      state: "self_declared",',
    replace:
      '      code: "INTL_ASIS_CPP",\n      name: "Certified Protection Professional (CPP)",\n      state: "verified",',
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
    id: "PCSF-NC-ACTION-MOVES-INTO-THE-EXAMPLE",
    defect:
      "the registration action is rendered after the illustrative card, reading as a control on a fictional person's record",
    file: HOME,
    find: "            {action}\n",
    replace: "",
    guard: GUARD,
    expect: "OUTSIDE and above the illustrative card",
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
      "the homepage says 'Samla erfarenhet, utbildning och certifieringar' again — employment history is the CV's, not the Passport's",
    file: DICT,
    find: '      "Samla dina certifieringar, licenser och yrkesbehörigheter — internationellt och per land. Lägg till underlag och välj vad du delar.",',
    replace:
      '      "Samla erfarenhet, utbildning och certifieringar. Välj Sverige, Storbritannien eller Dubai och bestäm själv vad du delar.",',
    guard: GUARD,
    expect: "sv · the Passport sentence is the owner's",
  },
];

runControls("passport-card-surface", MUTATIONS);
