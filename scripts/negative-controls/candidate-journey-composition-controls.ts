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
    id: "CJC-NC-PANEL-MOUNTED-UNVERIFIED",
    defect:
      "the panel is mounted on / while public-homepage.spec.ts still pins the page as a two-entrance marketing page — the state that failed six CI runs, each on a different invariant",
    file: HOME,
    find: "  const navigate = useNavigate();",
    replace:
      '  const navigate = useNavigate();\n  const panel = <UnifiedAuthPanel mode="signin" />;',
    guard: GUARD,
    expect: "does not mount the auth panel yet",
  },
  {
    id: "CJC-NC-BLOCKER-UNRECORDED",
    defect:
      "the note explaining why the panel is not mounted is deleted, so the gap becomes invisible and the next reader assumes it was never wanted",
    file: HOME,
    find: "IMAGE 0'S LOGIN PANEL IS NOT MOUNTED HERE",
    replace: "IMAGE 0",
    guard: GUARD,
    expect: "the route records why",
  },
  {
    id: "CJC-NC-SECOND-AUTH-FLOW",
    defect:
      "THE FAILURE MODE THE EXTRACTION EXISTS TO PREVENT: the landing page grows a sign-in call of its own, so there are two authentication implementations that drift the first time either is touched",
    file: HOME,
    find: "  const navigate = useNavigate();",
    replace:
      '  const navigate = useNavigate();\n  const homeSignIn = () => supabase.auth.signInWithPassword({ email: "", password: "" });',
    guard: GUARD,
    expect: "signInWithPassword lives in the panel and nowhere else",
  },
  {
    id: "CJC-NC-SESSION-SIGNAL-COLLAPSES",
    defect:
      "the session signal loses its third state, so 'not answered yet' becomes indistinguishable from 'signed out' — which is what paints a login form on a public page and snatches it back",
    file: "src/hooks/useSignedIn.ts",
    find: "export type SignedInState = boolean | null;",
    replace: "export type SignedInState = boolean;",
    guard: GUARD,
    expect: "three-state",
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
    find: '      <OverviewPassportCard lang={lang as Lang} className="mt-4" />',
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
    defect:
      "the per-section anchors are dropped, so every link in the row resolves to nothing",
    file: INFO,
    find: "            id={`sp-${section.kind}`}",
    replace: "            id={undefined}",
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
    replace: "  const location = { hash: typeof window === \"undefined\" ? \"\" : window.location.hash };",
    guard: GUARD,
    expect: "the hash comes from the router",
  },
];

runControls("candidate-journey-composition", MUTATIONS);
