/**
 * Negative controls for the Passport page composition (owner's sketch 2).
 *
 * Each mutation removes or duplicates one thing the sketch asks for -- the
 * side column, the card, the settings beneath it, one of the two top
 * actions -- or reintroduces the label collision between the Passport's own
 * overview tab and the candidate home's "Översikt".
 *
 * Run: bun run negative-controls:passport-page-composition
 */
import { runControls, type Mutation } from "./runner";

const INDEX = "src/routes/_authenticated.passport.index.tsx";
const SIDE = "src/components/security-passport/PassportSideColumn.tsx";
const I18N = "src/lib/security-passport/i18n.ts";
const GUARD = "passport-page-composition:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PPC-NC-SIDE-COLUMN-GONE",
    defect:
      "the side column stops rendering, so the card and the privacy settings go back behind tabs and the sketch's left column disappears",
    file: INDEX,
    find: "      <PassportSideColumn",
    replace: "        <NoSideColumn",
    guard: GUARD,
    expect: "the Passport page renders a side column",
  },
  {
    id: "PPC-NC-CARD-ABOVE-RECORD-ON-MOBILE",
    defect:
      "the side column is moved first in source, so at 375px a card preview pushes every merit off the first screen",
    file: INDEX,
    find: '      <div className="min-w-0 flex flex-col gap-6">',
    replace:
      '      <PassportSideColumn snapshot={snapshot} today="2026-09-15" />\n      <div className="min-w-0 flex flex-col gap-6">',
    guard: GUARD,
    expect: "the workspace comes first in source",
  },
  {
    id: "PPC-NC-SETTINGS-ABOVE-CARD",
    defect:
      "the integrity settings move above the card, so the holder reads who may see it before seeing what it is",
    file: SIDE,
    find: "      data-passport-privacy-summary\n",
    replace: "",
    guard: GUARD,
    expect: "an integrity/privacy region",
  },
  {
    id: "PPC-NC-SUMMARY-BECOMES-A-SECOND-WRITER",
    defect:
      "the privacy summary starts writing the mode itself, so one setting gains a second writer and two pages can disagree",
    file: SIDE,
    find: 'import { SecurityPassportPreview } from "./SecurityPassportPreview";',
    replace:
      'import { setPrivacyMode } from "@/lib/security-passport/passport.functions";\nimport { SecurityPassportPreview } from "./SecurityPassportPreview";',
    guard: GUARD,
    expect: "does NOT write the privacy mode",
  },
  {
    id: "PPC-NC-SIDE-COLUMN-READS-ITS-OWN",
    defect:
      "the side column loads the Passport itself instead of using the snapshot it is handed, adding a second request for the same data",
    file: SIDE,
    find: 'import { SecurityPassportPreview } from "./SecurityPassportPreview";',
    replace:
      'import { getMyPassport } from "@/lib/security-passport/passport.functions";\nimport { SecurityPassportPreview } from "./SecurityPassportPreview";',
    guard: GUARD,
    expect: "the snapshot is passed in",
  },
  {
    id: "PPC-NC-OVERVIEW-LABEL-COLLIDES",
    defect:
      "the Passport's overview tab goes back to reading \"Översikt\", the same word the candidate's primary navigation uses for /my-career -- one word, two destinations, one screen",
    file: I18N,
    find: '  "nav.overview": "Passportöversikt",',
    replace: '  "nav.overview": "Översikt",',
    guard: GUARD,
    expect: "names WHICH overview it is",
  },
  {
    id: "PPC-NC-SIDE-TARGETS-SHRINK",
    defect:
      "the side column's controls lose their 44px minimum target, so they stop being operable by touch",
    file: SIDE,
    find: "min-h-11 items-center gap-1.5 text-sm font-semibold text-accent",
    replace: "items-center gap-1.5 text-sm font-semibold text-accent",
    guard: GUARD,
    expect: "44px minimum target",
  },
];

runControls("passport-page-composition", MUTATIONS);
