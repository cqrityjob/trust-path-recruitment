/**
 * Negative controls for the candidate navigation canon.
 *
 * Every material assertion of scripts/candidate-navigation-canon-check.ts
 * must detect the exact defect it exists to catch. These plant them: the
 * duplicate Översikt/Min karriär label, a second entry pointing at a
 * destination another entry already owns, the CV promoted to a primary
 * item, the Career Card coming back as a rendered pilot page and as a
 * recommended next step, the retired section strip returning to the
 * shell, a nav item pointing at a path the router does not know, and the
 * brand mark going somewhere other than the public homepage.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:candidate-navigation-canon
 */
import { runControls, type Mutation } from "./runner";

const NAV = "src/components/site/candidate-app-nav.ts";
const SHELL = "src/routes/_authenticated.my-career.tsx";
const HEADER = "src/components/site/SiteHeader.tsx";
const CARD = "src/routes/_authenticated.my-career.career-card.tsx";
const IDENTITY = "src/components/professional-identity/ProfessionalIdentityHeader.tsx";
const NEXT_ACTION = "src/lib/professional-identity/next-best-action.ts";
const GUARD = "candidate-navigation-canon:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The duplicate that started all of this ------------------------------
  {
    id: "CNC-NC-MIN-KARRIAR-RETURNS",
    defect:
      'the candidate home goes back to being labelled "Min karriär" while "Översikt" still names that destination -- one URL, two names',
    file: NAV,
    find: '    labelKey: "nav.overview",',
    replace: '    labelKey: "nav.my_career",',
    guard: GUARD,
    expect: "Min karriär",
  },
  {
    id: "CNC-NC-TWO-ENTRIES-ONE-DESTINATION",
    defect:
      "two navigation entries resolve to the same destination, which is the Översikt/Min karriär defect in its general form",
    file: NAV,
    find: '    key: "career",\n    to: "/career-center",',
    replace: '    key: "career",\n    to: "/my-career",',
    guard: GUARD,
    expect: "no two navigation entries resolve to the same destination",
  },
  {
    id: "CNC-NC-ORDER-CHANGED",
    defect:
      "the Passport is demoted out of second place, so the primary product is no longer the primary product",
    file: NAV,
    find: '    key: "passport",\n    to: "/passport",',
    replace: '    key: "assessments",\n    to: "/academy",',
    guard: GUARD,
    expect: "the owner's five, in the sketch order",
  },

  // ---- A control with nowhere to go ----------------------------------------
  {
    id: "CNC-NC-DEAD-DESTINATION",
    defect:
      "a primary navigation item points at a path the router never generated -- a dead control that looks alive",
    file: NAV,
    find: '    key: "jobs",\n    to: "/jobs",',
    replace: '    key: "jobs",\n    to: "/find-jobs",',
    guard: GUARD,
    expect: "resolves to a route the router generated",
  },

  // ---- The CV, which the owner made contextual on purpose ------------------
  {
    id: "CNC-NC-CV-PROMOTED",
    defect:
      "the CV is promoted back to a primary destination, against the owner's explicit rule that it is reached from Översikt and Jobb",
    file: NAV,
    find: '    key: "career",\n    to: "/career-center",',
    replace: '    key: "career",\n    to: "/my-career/cv",',
    guard: GUARD,
    expect: "no navigation entry points at the CV",
  },

  // ---- Career Card coming back ---------------------------------------------
  {
    id: "CNC-NC-CARD-ROUTE-RENDERS",
    defect:
      "the Career Card route renders a pilot page again instead of redirecting, so a surface the owner removed is reachable",
    file: CARD,
    find: "  beforeLoad: () => {\n    throw redirect({ to: \"/my-career\", replace: true });\n  },",
    replace: "  component: () => null,",
    guard: GUARD,
    expect: "redirects rather than rendering a pilot page",
  },
  {
    id: "CNC-NC-CARD-CONTROL-RETURNS",
    defect: 'the "View Career Card" control returns to the identity header',
    file: IDENTITY,
    find: '            to="/my-career/profile"',
    replace: '            to="/my-career/career-card"',
    guard: GUARD,
    expect: "gone from the identity header",
  },
  {
    id: "CNC-NC-CARD-RECOMMENDED",
    defect:
      "a recommended next step points at the Career Card again, which redirects away the moment it is followed",
    file: NEXT_ACTION,
    find: '    add("open_cv", 7, "/my-career/cv", "never — a standing destination", { count: saved });',
    replace:
      '    add("open_cv", 7, "/my-career/career-card", "never — a standing destination", { count: saved });',
    guard: GUARD,
    expect: "no recommended next step points at the Career Card",
  },

  {
    id: "CNC-NC-CARD-CTA-INLINE",
    defect:
      "the Career Discovery report gets its Career Card CTA back -- the entry point that opens the creator INLINE, which hiding the route never reached",
    file: "src/components/career-discovery/v31/V31ReportView.tsx",
    find: "    </div>\n  );\n}",
    replace:
      "      <CareerCardCreator open={false} onOpenChange={() => {}} />\n    </div>\n  );\n}",
    guard: GUARD,
    expect: "mounts no Career Card creator",
  },

  // ---- The second navigation -----------------------------------------------
  {
    id: "CNC-NC-SECTION-STRIP-RETURNS",
    defect:
      "the retired section strip is rendered in the shell again, putting a second candidate navigation under the first",
    file: SHELL,
    find: "    <SiteLayout>\n      <Outlet />\n    </SiteLayout>",
    replace: "    <SiteLayout>\n      <MyCareerHubNav activeKey={null} />\n      <Outlet />\n    </SiteLayout>",
    guard: GUARD,
    expect: "renders no section strip",
  },
  {
    id: "CNC-NC-SHELL-GROWS-A-NAV",
    defect: "the shell grows a <nav> of its own beside the primary navigation",
    file: SHELL,
    find: "    <SiteLayout>\n      <Outlet />\n    </SiteLayout>",
    replace: '    <SiteLayout>\n      <nav aria-label="sections" />\n      <Outlet />\n    </SiteLayout>',
    guard: GUARD,
    expect: "declares no <nav> of its own",
  },

  // ---- The brand mark ------------------------------------------------------
  {
    id: "CNC-NC-LOGO-GOES-INWARDS",
    defect:
      "the brand mark goes back to meaning two different things depending on who is reading it",
    file: HEADER,
    find: '          <Link\n            to="/"',
    replace: '          <Link\n            to={appMode ? "/my-career" : "/"}',
    guard: GUARD,
    expect: "the brand mark links to",
  },
];

runControls("candidate-navigation-canon", MUTATIONS);
