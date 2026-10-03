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

  // ---- "Registrera företag": one entry, every surface (2026-10-03) --------
  {
    id: "PH-NC-REGISTER-LOSES-INTENT",
    defect:
      "the shared registration entry stops carrying the employer intent, so every surface that renders it creates a personal account with no company in it",
    file: NAV,
    find: '  search: EMPLOYER_INTENT,\n  labelKey: "employers.cta.register",',
    replace:
      '  search: { redirect: "/my-career" } as never,\n  labelKey: "employers.cta.register",',
    guard: GUARD,
    expect: "EMPLOYER_REGISTER_NAV must point at /signup carrying the shared EMPLOYER_INTENT",
  },
  {
    id: "PH-NC-REGISTER-DESKTOP-HAND-WRITTEN",
    defect:
      'the desktop "För arbetsgivare" panel hand-writes its own bare /signup link instead of rendering the shared entry, so the two viewports can drift',
    file: HEADER,
    find: "            <Link\n              to={EMPLOYER_REGISTER_NAV.to}\n              search={EMPLOYER_REGISTER_NAV.search as never}\n",
    replace: '            <Link\n              to="/signup"\n',
    guard: GUARD,
    expect: "the header must render EMPLOYER_REGISTER_NAV exactly twice",
  },
  {
    id: "PH-NC-REGISTER-UNGATED-IN-SHEET",
    defect:
      "the compact menu offers company registration to somebody who is already signed in (and while the employer portal is closed)",
    file: HEADER,
    find: "            {signedIn !== true && employerPortalEnabled() && (\n              <Link\n                to={EMPLOYER_REGISTER_NAV.to}",
    replace: "            {(\n              <Link\n                to={EMPLOYER_REGISTER_NAV.to}",
    guard: GUARD,
    expect: "must be gated on",
  },
  {
    id: "PH-NC-FOOTER-REGISTER-FOR-SIGNED-IN",
    defect:
      "the footer offers company registration to a signed-in reader, who has an account (and their organisations in the account menu)",
    file: NAV,
    find: "  if (state.signedIn !== true && state.employerPortal) items.push(EMPLOYER_REGISTER_NAV);",
    replace: "  if (state.employerPortal) items.push(EMPLOYER_REGISTER_NAV);",
    guard: GUARD,
    expect: "the footer's entries after the shared six for",
  },
  {
    id: "PH-NC-FOOTER-FEEDBACK-FOR-EVERYONE",
    defect:
      "Betafeedback is offered to a signed-out visitor again, who is bounced to a sign-in form by a login-gated route",
    file: NAV,
    find: '  if (state.signedIn === true) {\n    items.push({ key: "feedback"',
    replace: '  if (state.signedIn !== undefined) {\n    items.push({ key: "feedback"',
    guard: GUARD,
    expect: "the footer's entries after the shared six for",
  },
  {
    id: "PH-NC-FOOTER-SEARCH-DROPPED",
    defect:
      "the footer link stops passing the entry's search, so its registration entry is a bare /signup",
    file: FOOTER,
    find: "                    search={l.search as never}\n",
    replace: "",
    guard: GUARD,
    expect: "the footer must pass an entry's search to its link",
  },
  {
    id: "PH-NC-FOOTER-NO-CONTACT-ADDRESS",
    defect:
      "the footer's contact address stops being a mailto, so the only visible address on the site is behind /contact again",
    file: FOOTER,
    find: "              href={`mailto:${CONTACT_EMAIL}`}",
    replace: '              href="/contact"',
    guard: GUARD,
    expect: "the footer must show CONTACT_EMAIL as a visible mailto link",
  },
  {
    id: "PH-NC-LEGACY-REGISTER-BARE",
    defect:
      "/employer/register forwards to a bare /signup again, so a bookmarked 'register your company' link creates a personal account",
    file: "src/lib/auth/legacy-entry.ts",
    find: '  return unifiedAuthHref("signup", searchStr, EMPLOYER_INTENT.redirect);',
    replace: '  return unifiedAuthHref("signup", searchStr);',
    guard: GUARD,
    expect: "must resolve to /signup?redirect=%2Femployer",
  },
  {
    id: "PH-NC-HOME-OWN-INTENT-COPY",
    defect:
      "the homepage band keeps a private copy of the employer intent instead of the shared one, which is how the entries drift apart",
    file: SECTIONS,
    find: 'import { EMPLOYER_INTENT } from "@/lib/auth/organisation-entrance";',
    replace: 'const EMPLOYER_INTENT = { redirect: "/employer" } as const;',
    guard: GUARD,
    expect: "the homepage employer band must register through the shared EMPLOYER_INTENT",
  },
  {
    id: "PH-NC-NAV-LANDMARK-ENGLISH-ONLY",
    defect:
      "the desktop navigation landmark is named in English on the Swedish site again (and loses the attribute the e2e specs find it by)",
    file: HEADER,
    find: '              aria-label={t("nav.primary")}\n              data-site-nav="primary"\n            >\n              {nav.map((item) =>',
    replace: '              aria-label="Primary"\n            >\n              {nav.map((item) =>',
    guard: GUARD,
    expect: 'must be named by t("nav.primary")',
  },
  {
    id: "PH-NC-CONTACT-CLOSED-PROMISES-INSTANT-USE",
    defect:
      "the closed contact form invites a visitor to register and use the platform themselves again, without saying an administrator must approve the organisation first",
    file: "src/i18n/dictionaries.ts",
    find: "Arbetsgivarytan öppnas först när en administratör har godkänt det.",
    replace: "Då kan ni använda plattformen själva direkt.",
    guard: GUARD,
    expect: '"contact.closed.body" must not invite a visitor to start using the platform',
  },
];

runControls("public-header", MUTATIONS);
