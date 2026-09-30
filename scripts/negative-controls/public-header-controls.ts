/**
 * Negative controls for the public header's six destinations.
 *
 * The locked navigation (2026-09-30) is Karriär · Jobb · Security Passport ·
 * Säkerhetsarbete · För arbetsgivare ▾ · Om oss, from ONE definition
 * (src/components/site/public-nav.ts) that the desktop bar, the compact menu
 * and the footer all render. Navigation is easy to get quietly wrong in
 * several directions, so each is planted here: Career Discovery creeping
 * back into the bar as a seventh entry, the locked order changing, a
 * product entry pointing at a homepage anchor again, a second nav list, the
 * footer drifting to its own list, the employer submenu pointing at a
 * section that does not exist, and the breakpoints drifting apart.
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
    find: '    { key: "jobs", to: "/jobs", labelKey: "nav.jobs" },',
    replace:
      '    { key: "jobs", to: "/security-career-assessment" as "/jobs", labelKey: "nav.jobs" },',
    guard: GUARD,
    expect: "Career Discovery must not be a public nav item",
  },

  // ---- The specified order ------------------------------------------------
  {
    id: "PH-NC-ORDER-CHANGED",
    defect: "Jobb is promoted above Karriär, so the bar no longer reads in the locked order",
    file: NAV,
    find: '    { key: "career", to: "/career-center", labelKey: "nav.career" },\n    { key: "jobs", to: "/jobs", labelKey: "nav.jobs" },',
    replace:
      '    { key: "jobs", to: "/jobs", labelKey: "nav.jobs" },\n    { key: "career", to: "/career-center", labelKey: "nav.career" },',
    guard: GUARD,
    expect: "in that order",
  },

  // ---- A signed-in reader is sent to a section they never see -------------
  {
    id: "PH-NC-SIGNED-IN-SECTION-TRAP",
    defect:
      "a signed-in reader's Passport entry points at the public page instead of their own Passport",
    file: NAV,
    find: '      ? { key: "passport", to: "/passport", labelKey: "nav.passportPublic" }',
    replace:
      '      ? { key: "passport", to: "/security-passport", labelKey: "nav.passportPublic" }',
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
      '  const nav = publicNav(signedIn === true).map((item) => ({ ...item, label: t(item.labelKey) }));\n  const nav2 = [{ key: "about", to: "/about", label: t("nav.about") }];\n  const nav = nav2;',
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
    id: "PH-NC-PRODUCT-ENTRY-BACK-TO-AN-ANCHOR",
    defect:
      "a signed-out reader's Säkerhetsarbete entry points at a homepage anchor again, so choosing one product keeps them scrolling through the others",
    file: NAV,
    find: '      : { key: "security-work", to: "/sakerhetsarbete", labelKey: "nav.securityWorkPublic" },',
    replace:
      '      : { key: "security-work", to: "/#security-intelligence" as "/sakerhetsarbete", labelKey: "nav.securityWorkPublic" },',
    guard: GUARD,
    expect: "in that order for a signed-out visitor",
  },
  {
    id: "PH-NC-EMPLOYER-SUBMENU-DEAD-LINK",
    defect:
      "an employer submenu entry points at a section /employers does not have — a dead link wearing a heading",
    file: NAV,
    find: '    hash: "intervju",',
    replace: '    hash: "intervjuer" as "intervju",',
    guard: GUARD,
    expect: "which must exist on /employers",
  },
  {
    id: "PH-NC-HOMEPAGE-CARD-DROPPED",
    defect:
      "the homepage's Security Passport card stops opening the Passport's page, so the area is reachable only from the chrome",
    file: SECTIONS,
    find: '    to: "/security-passport",',
    replace: '    to: "/jobs",',
    guard: GUARD,
    expect: "cards must open /security-passport",
  },
  {
    id: "PH-NC-APP-MENU-BREAKPOINT",
    defect:
      "the signed-in sheet stays active until xl again, so a Windows PC at 125% scaling (1093-1229px) has no desktop navigation",
    file: HEADER,
    find: 'MENU_SURFACE, "lg:hidden", open ? "block" : "hidden"',
    replace: 'MENU_SURFACE, appMode ? "xl:hidden" : "lg:hidden", open ? "block" : "hidden"',
    guard: GUARD,
    expect: "the compact sheet must switch off at lg, for every route",
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
