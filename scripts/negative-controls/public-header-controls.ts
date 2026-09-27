/**
 * Negative controls for the public header's six destinations.
 *
 * The MVP text specification (2026-09-27) makes security work, Security
 * Passport and career/jobs three equal core parts, each reachable from the
 * chrome, from ONE definition (src/components/site/public-nav.ts) that the
 * desktop bar, the compact menu and the footer all render. Navigation is
 * easy to get quietly wrong in several directions, so each is planted here:
 * Career Discovery creeping back into the bar as a seventh entry, the
 * specified order changing, a signed-in reader's product entry pointing at a
 * homepage section they are always redirected away from, a second nav list,
 * the footer drifting to its own list, and a section the nav points at being
 * deleted from the content.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:public-header
 */
import { runControls, type Mutation } from "./runner";

const HEADER = "src/components/site/SiteHeader.tsx";
const NAV = "src/components/site/public-nav.ts";
const HOME = "src/routes/index.tsx";
const SECTIONS = "src/components/site/HomeSections.tsx";
const FOOTER = "src/components/site/SiteFooter.tsx";
const GUARD = "header-entry:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- Career Discovery creeps back into the chrome -----------------------
  {
    id: "PH-NC-DISCOVERY-RETURNS",
    defect:
      "Career Discovery comes back as a seventh public nav entry, competing with the three core parts",
    file: NAV,
    find: '    { key: "jobs", to: "/jobs", hash: undefined, labelKey: "nav.jobs" },',
    replace:
      '    { key: "jobs", to: "/security-career-assessment" as "/jobs", hash: undefined, labelKey: "nav.jobs" },',
    guard: GUARD,
    expect: "Career Discovery must not be a public nav item",
  },

  // ---- The specified order ------------------------------------------------
  {
    id: "PH-NC-ORDER-CHANGED",
    defect: "Jobb is promoted above Karriär, so the bar no longer reads in the specified order",
    file: NAV,
    find: '    { key: "career", to: "/career-center", hash: undefined, labelKey: "nav.career" },\n    { key: "jobs", to: "/jobs", hash: undefined, labelKey: "nav.jobs" },',
    replace:
      '    { key: "jobs", to: "/jobs", hash: undefined, labelKey: "nav.jobs" },\n    { key: "career", to: "/career-center", hash: undefined, labelKey: "nav.career" },',
    guard: GUARD,
    expect: "in that order",
  },

  // ---- A signed-in reader is sent to a section they never see -------------
  {
    id: "PH-NC-SIGNED-IN-SECTION-TRAP",
    defect:
      "a signed-in reader's Passport entry points at the homepage section, which redirects them to their overview instead of the Passport",
    file: NAV,
    find: '      ? { key: "passport", to: "/passport", hash: undefined, labelKey: "nav.passportPublic" }',
    replace:
      '      ? { key: "passport", to: "/", hash: "passport", labelKey: "nav.passportPublic" }',
    guard: GUARD,
    expect: "must open the product itself",
  },

  // ---- One definition, two viewports and the footer -----------------------
  {
    id: "PH-NC-SECOND-NAV-ARRAY",
    defect:
      "a second nav definition appears, which is how the desktop bar and the compact menu drift into different information architectures",
    file: HEADER,
    find: "  const nav = publicNav(signedIn === true).map((item) => ({ ...item, label: t(item.labelKey) }));",
    replace:
      '  const nav = publicNav(signedIn === true).map((item) => ({ ...item, label: t(item.labelKey) }));\n  const nav2 = [{ key: "about", to: "/about", hash: undefined, label: t("nav.about") }];\n  const nav = nav2;',
    guard: GUARD,
    expect: "exactly one public nav definition",
  },
  {
    id: "PH-NC-FOOTER-OWN-LIST",
    defect:
      "the footer stops rendering the shared definition and keeps a hand-written list of its own",
    file: FOOTER,
    find: "    ...publicNav(signedIn === true).map((item) => ({",
    replace: "    ...publicNav(false).map((item) => ({",
    guard: GUARD,
    expect: "the footer must render the same six from publicNav()",
  },

  // ---- A destination the nav points at leaks out of the content -----------
  {
    id: "PH-NC-PASSPORT-SECTION-DELETED",
    defect:
      "the homepage's Passport section is deleted, so the nav's Security Passport entry points at nothing",
    file: HOME,
    find: 'id="passport"',
    replace: 'id="passport-removed"',
    guard: GUARD,
    expect: "must keep its Security Passport section",
  },
  {
    id: "PH-NC-SECURITY-SECTION-DELETED",
    defect:
      "the homepage's security work section is deleted, so the nav's Säkerhetsarbete entry points at nothing",
    file: SECTIONS,
    find: 'id="security-intelligence"',
    replace: 'id="security-intelligence-removed"',
    guard: GUARD,
    expect: "must keep its security work section",
  },
  {
    id: "PH-NC-APP-MENU-BREAKPOINT",
    defect:
      "the signed-in sheet stays active until xl again, so a Windows PC at 125% scaling (1093-1229px) has no desktop navigation",
    file: HEADER,
    find: 'MENU_SURFACE, !compactJobs && "lg:hidden", open ? "block" : "hidden"',
    replace: 'MENU_SURFACE, appMode ? "xl:hidden" : "lg:hidden", open ? "block" : "hidden"',
    guard: GUARD,
    expect: "the compact sheet must switch off at lg except for the scoped public jobs header",
  },
  {
    id: "PH-NC-APP-NAV-BREAKPOINT",
    defect: "the seven-item candidate nav waits for xl while the compact menu switched off at lg",
    file: "src/components/site/CandidateAppNav.tsx",
    find: "gap-2.5 lg:flex xl:gap-4 2xl:gap-6",
    replace: "gap-2.5 xl:flex xl:gap-4 2xl:gap-6",
    guard: GUARD,
    expect: "the seven-destination candidate nav must appear at lg (1024px), never wait for xl",
  },
];

runControls("public-header", MUTATIONS);
