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
const WALLET = "src/components/security-passport/CredentialWallet.tsx";
const GUARD = "passport-page-composition:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PPC-NC-SIDE-COLUMN-GONE",
    defect:
      "the side column stops rendering, so the next step and the privacy status disappear from the Passport overview",
    file: INDEX,
    find: "      <PassportSideColumn",
    replace: "        <NoSideColumn",
    guard: GUARD,
    expect: "the Passport page renders a side column",
  },
  {
    id: "PPC-NC-CARD-ABOVE-RECORD-ON-MOBILE",
    defect:
      "the side column is moved first in source, so at 375px it pushes the Passport and every merit off the first screen",
    file: INDEX,
    find: '      <div className="min-w-0 flex flex-col gap-6">',
    replace:
      '      <PassportSideColumn snapshot={snapshot} today="2026-09-15" />\n      <div className="min-w-0 flex flex-col gap-6">',
    guard: GUARD,
    expect: "the workspace comes first in source",
  },
  {
    id: "PPC-NC-SECOND-PASSPORT-RESTORED",
    defect:
      "the compact Passport card is mounted in the side column again, so the page that IS the Passport shows two of them side by side -- the duplicate the owner asked to remove",
    file: SIDE,
    find: "      {/* ── The next step ───────────────────────────────────────────── */}",
    replace:
      "      <SecurityPassportPreview snapshot={snapshot} today={today} metadata={metadata} />\n      {/* ── The next step ───────────────────────────────────────────── */}",
    guard: GUARD,
    expect: "no second Passport card beside the identity surface",
  },
  {
    id: "PPC-NC-CARD-ROUTE-IS-A-PREVIEW-AGAIN",
    defect:
      "/passport/card stops redirecting, so a second preview whose selection the sharing flow never receives is reachable again",
    file: "src/routes/_authenticated.passport.card.tsx",
    find: '    throw redirect({ to: "/passport/share", replace: true });',
    replace: "    return;",
    guard: GUARD,
    expect: "the retired /passport/card sends its visitors there",
  },
  {
    id: "PPC-NC-NAV-POINTS-AT-RETIRED-PREVIEW",
    defect:
      "the Passport navigation's Preview and share goes back to the retired card route instead of the sharing flow",
    file: "src/routes/_authenticated.passport.tsx",
    find: '  { to: "/passport/share", sv: "Förhandsvisa och dela", en: "Preview and share" },',
    replace: '  { to: "/passport/card", sv: "Förhandsvisa och dela", en: "Preview and share" },',
    guard: GUARD,
    expect: "Preview and share opens the sharing flow",
  },
  {
    id: "PPC-NC-PASSPORT-EDITS-A-PROFILE-FACT",
    defect:
      "the identity surface loses its link to the Profile, so the Passport displays a name and title with no way to reach the one place they are edited",
    file: WALLET,
    find: '          data-cta="edit-in-profile"',
    replace: '          data-cta="edit-elsewhere"',
    guard: GUARD,
    expect: "sends the holder to the Profile",
  },
  // ── Work order 2026-09-17, part 1 ────────────────────────────────────
  {
    id: "PPC-NC-CONTROL-BACK-INSIDE-THE-CARD",
    defect:
      "a button is put back inside the identity surface, which is what left the holder's name no room",
    file: WALLET,
    find: "              {derivedIsSelfDeclared ? (",
    replace:
      '              <button type="button">Add credential</button>\n              {derivedIsSelfDeclared ? (',
    guard: GUARD,
    expect: "the identity surface contains no interactive control",
  },
  {
    id: "PPC-NC-NAME-BREAKS-INSIDE-A-WORD",
    defect:
      "the holder's name may break anywhere again, so 'Mostafa Alshawi' prints as 'Most / afa / Alsha / wi'",
    file: WALLET,
    find: "[hyphens:none] [overflow-wrap:normal] [word-break:keep-all]",
    replace: "[hyphens:none] [overflow-wrap:anywhere] [word-break:keep-all]",
    guard: GUARD,
    expect: "may wrap between words and nowhere else",
  },
  {
    id: "PPC-NC-PROFILE-TITLE-STANDS-IN",
    defect:
      "the title line falls back to the Profile title, so a self-described 'Head of Security' prints where a credential-derived standing belongs",
    file: WALLET,
    find: "                {derivedTitle}",
    replace: "                {title || derivedTitle}",
    guard: GUARD,
    expect: "the Profile title is never the fallback",
  },
  {
    id: "PPC-NC-TITLE-NOT-FROM-THE-ENGINE",
    defect: "the primary title line stops coming from the derivation engine",
    file: WALLET,
    find: '  const derivedTitle = professionLine(snapshot.holder.identity, lang, pt("identity.none"));',
    replace: '  const derivedTitle = snapshot.profile?.headline ?? pt("identity.none");',
    guard: GUARD,
    expect: "the derivation engine's output",
  },
  {
    id: "PPC-NC-FIFTH-TAB",
    defect: "Add credential comes back as a tab, so the four tabs are five",
    file: "src/routes/_authenticated.passport.tsx",
    find: '  { to: "/passport", hash: "attention", sv: "Granskning", en: "Verification" },',
    replace:
      '  { to: "/passport/credentials/new", sv: "Lägg till", en: "Add credential" },\n  { to: "/passport", hash: "attention", sv: "Granskning", en: "Verification" },',
    guard: GUARD,
    expect: "in that order and no others",
  },
  {
    id: "PPC-NC-COUNTRY-TWICE",
    defect:
      "the helper appends the jurisdiction unconditionally, so a title ending in the country prints it twice",
    file: "src/lib/security-passport/format.ts",
    find: "  if (t.toLocaleLowerCase().endsWith(j.toLocaleLowerCase())) return t;\n",
    replace: "",
    guard: GUARD,
    expect: "is not given it again",
  },
  {
    id: "PPC-NC-SURFACE-BYPASSES-THE-HELPER",
    defect:
      "the recipient page joins title and jurisdiction by hand again, so one surface can diverge from the other four",
    file: "src/components/security-passport/RecipientVerification.tsx",
    find: "          {titleWithJurisdictionOnce(profession, jurisdiction)}",
    replace: "          {profession} · {jurisdiction}",
    guard: GUARD,
    expect: "RecipientVerification.tsx joins title and jurisdiction through the helper only",
  },
  {
    id: "PPC-NC-NEXT-STEP-SECOND-OPINION",
    defect:
      "the next step stops deriving from the wallet's own status function, so the column can recommend 'add evidence' for a credential the wallet prints as reviewed",
    file: SIDE,
    find: "    credentialProductStatus(c, metadata?.verificationEvents ?? [], today, reviews?.get(c.id)),",
    replace: '    ({ claim: c, status: "registered" as string }),',
    guard: GUARD,
    expect: "the SAME status function",
  },
  {
    id: "PPC-NC-PRIVACY-REGION-GONE",
    defect:
      "the integrity region loses its hook and its place, so the overview no longer says who can see the Passport",
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
    find: 'import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";',
    replace:
      'import { setPrivacyMode } from "@/lib/security-passport/passport.functions";\nimport type { PassportSnapshot } from "@/lib/security-passport/passport.functions";',
    guard: GUARD,
    expect: "does NOT write the privacy mode",
  },
  {
    id: "PPC-NC-SIDE-COLUMN-READS-ITS-OWN",
    defect:
      "the side column loads the Passport itself instead of using the snapshot it is handed, adding a second request for the same data",
    file: SIDE,
    find: 'import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";',
    replace:
      'import { getMyPassport } from "@/lib/security-passport/passport.functions";\nimport type { PassportSnapshot } from "@/lib/security-passport/passport.functions";',
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
  {
    id: "PPC-NC-NEXT-STEP-BUTTON-SHRINKS",
    defect:
      "the next step's button loses its 44px minimum while the text links keep theirs -- the case a file-wide search for min-h-11 could not see",
    file: SIDE,
    find: '"inline-flex min-h-11 w-full items-center justify-center',
    replace: '"inline-flex w-full items-center justify-center',
    guard: GUARD,
    expect: "44px minimum target",
  },
];

runControls("passport-page-composition", MUTATIONS);
