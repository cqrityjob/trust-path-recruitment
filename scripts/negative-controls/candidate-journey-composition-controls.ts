/**
 * Negative controls for screens 0, 1 and 2.
 *
 * Each mutation is a way the composition regresses while still looking
 * plausible in a diff: a second auth flow, a panel shown to the wrong
 * visitor, a card that repeats the summary's figures, a row of tabs that
 * hides the sections other surfaces deep-link into.
 *
 * Run: bun run negative-controls:candidate-journey-composition
 */
import { runControls, type Mutation } from "./runner";

const HOME = "src/routes/index.tsx";
const FORM = "src/components/auth/UnifiedAuthForm.tsx";
const PANEL = "src/components/auth/UnifiedAuthPanel.tsx";
const OVERVIEW = "src/routes/_authenticated.my-career.index.tsx";
const CARD = "src/components/professional-identity/OverviewPassportCard.tsx";
const INFO = "src/routes/_authenticated.passport.information.tsx";
const NAV = "src/components/security-passport/PassportSectionNav.tsx";
const GUARD = "candidate-journey-composition:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── SCREEN 0 · ONE AUTH FLOW ──────────────────────────────────────── */
  {
    id: "CJC-NC-PANEL-GONE",
    defect:
      "the landing page stops mounting the login panel, so image 0's entrance is a link again",
    file: HOME,
    find: '              <UnifiedAuthPanel mode="signin" />',
    replace: "",
    guard: GUARD,
    expect: "/ mounts the auth panel",
  },
  {
    id: "CJC-NC-SECOND-AUTH-FLOW",
    defect:
      "THE FAILURE MODE: the landing page grows a sign-in call of its own, so there are two authentication implementations that will drift the first time either is touched",
    file: HOME,
    find: "  const showAuthPanel = useSignedIn() === false;",
    replace:
      '  const showAuthPanel = useSignedIn() === false;\n  const homeSignIn = () => supabase.auth.signInWithPassword({ email: "", password: "" });',
    guard: GUARD,
    expect: "signInWithPassword lives in the panel and nowhere else",
  },
  {
    id: "CJC-NC-PANEL-SHOWN-TO-EVERYONE",
    defect:
      "the panel renders before the session is known, so it paints on a public page and is snatched back — and the panel navigates a signed-in visitor off the homepage entirely",
    file: HOME,
    find: "  const showAuthPanel = useSignedIn() === false;",
    replace: "  const showAuthPanel = useSignedIn() !== true;",
    guard: GUARD,
    expect: "renders only for a visitor confirmed signed OUT",
  },
  {
    id: "CJC-NC-LOGIN-PAGE-INLINES-PANEL",
    defect:
      "/login stops using the shared panel and inlines its own copy, which is the same second-flow defect from the other direction",
    file: FORM,
    find: "            <UnifiedAuthPanel mode={mode} />",
    replace: "            <div>{/* inlined */}</div>",
    guard: GUARD,
    expect: "/login mounts the same component",
  },

  /* ── SCREEN 1 · ONE CARD, ONE SUMMARY ──────────────────────────────── */
  {
    id: "CJC-NC-OVERVIEW-CARD-GONE",
    defect:
      "Överskt stops showing the Passport card, which is the delta the audit itself recorded as unresolved",
    file: OVERVIEW,
    // Repointed: the card moved into the Passport column, where it no
    // longer needs its own top margin.
    find: "          <OverviewPassportCard lang={lang as Lang} />",
    replace: "",
    guard: GUARD,
    expect: "Överskt mounts the Passport card",
  },
  {
    id: "CJC-NC-SUMMARY-DROPPED-FOR-CARD",
    defect:
      "the card replaces the summary rather than joining it, so the merit counts disappear from Överskt",
    file: OVERVIEW,
    find: "          <PassportSummary",
    replace: "          <IgnoredSummary",
    guard: GUARD,
    expect: "keeps the Passport summary",
  },
  {
    id: "CJC-NC-CARD-RESTATES-FIGURES",
    defect:
      "the card starts rendering merit counts too, so one page states the same figure twice and the two can disagree",
    file: CARD,
    find: 'import { buildPassportCard } from "@/lib/security-passport/card";',
    replace:
      'import { meritFigures } from "@/lib/professional-identity/merit-figures";\nimport { buildPassportCard } from "@/lib/security-passport/card";',
    guard: GUARD,
    expect: "does not restate meritFigures",
  },
  {
    id: "CJC-NC-CARD-SECOND-READ",
    defect:
      "the card grows a server function of its own instead of reading through the canonical getMyPassport",
    file: CARD,
    find: "type State =",
    replace:
      'const loadCard = createServerFn({ method: "GET" }).handler(async () => null);\n\ntype State =',
    guard: GUARD,
    expect: "defines no server function of its own",
  },

  /* ── SCREEN 2 · LINKS, NEVER TABS ──────────────────────────────────── */
  {
    id: "CJC-NC-SECTION-ROW-GONE",
    defect: "the section row disappears, so image 2's navigation is missing",
    file: INFO,
    find: '      <PassportSectionNav label={pt("info.sections.label")} sections={SECTION_LINKS} />',
    replace: "",
    guard: GUARD,
    expect: "the information page carries the section row",
  },
  {
    id: "CJC-NC-ROW-BECOMES-TABS",
    defect:
      "THE FAILURE MODE: the row becomes a tab widget, hiding every section but one — and #246's retired-anchor redirects then land on a hidden panel and silently fail",
    file: NAV,
    find: '    <nav aria-label={label} data-passport-section-nav className="overflow-x-auto">',
    replace:
      '    <nav role="tab" aria-label={label} data-passport-section-nav className="overflow-x-auto">',
    guard: GUARD,
    expect: 'no role="tab"',
  },
  {
    id: "CJC-NC-CREDENTIAL-ANCHOR-LOST",
    defect:
      "the credential wrapper loses #sp-credentials, so the add-a-merit chooser lands at the top of a long page",
    file: INFO,
    find: '      <div id="sp-credentials" className="scroll-mt-24 space-y-5">',
    replace: '      <div className="scroll-mt-24 space-y-5">',
    guard: GUARD,
    expect: "#sp-credentials survives",
  },
  {
    id: "CJC-NC-SECTION-ANCHORS-LOST",
    defect: "the per-section anchors are dropped, so every link in the row resolves to nothing",
    file: INFO,
    // Anchored WITHOUT leading whitespace: this control broke once when a
    // prettier run normalised the surrounding indentation, which says
    // nothing about the anchors it exists to protect.
    find: "id={`sp-${section.kind}`}",
    replace: "id={undefined}",
    guard: GUARD,
    expect: "each credential section has its own anchor",
  },
  {
    id: "CJC-NC-ROW-HARD-CODED",
    defect:
      "the row's destinations stop being derived from the section table, so adding a section silently leaves it out of the row",
    file: INFO,
    find: "    anchor: `sp-${s.kind}`,",
    replace: '    anchor: "sp-training",',
    guard: GUARD,
    expect: "DERIVED from the section table",
  },
  {
    id: "CJC-NC-SECTIONS-UNMOUNTED",
    defect:
      "the sections stop rendering as a group, which is how a tab-like implementation sneaks back in without the word 'tab' appearing",
    file: INFO,
    find: "        {PASSPORT_CLAIM_SECTIONS.map(claimSection)}",
    replace: "        {PASSPORT_CLAIM_SECTIONS.slice(0, 1).map(claimSection)}",
    guard: GUARD,
    expect: "every credential section still renders",
  },
  {
    id: "CJC-NC-HASH-FROM-WINDOW",
    defect:
      "the row reads window.location instead of the router, so back and forward leave the marker on whichever section was current at mount",
    file: NAV,
    find: "  const location = useLocation();",
    replace:
      '  const location = { hash: typeof window === "undefined" ? "" : window.location.hash };',
    guard: GUARD,
    expect: "the hash comes from the router",
  },
];

runControls("candidate-journey-composition", MUTATIONS);
