/**
 * Negative controls for the public header's five destinations.
 *
 * The owner replaced a six-item public bar that named Security Passport
 * and Career Discovery with five audience/topic entries. Removing items
 * from a navigation is easy to get quietly wrong in two opposite
 * directions, so both are planted here: a product name creeping back into
 * the chrome, and the removal leaking into the CONTENT so that a product
 * becomes unreachable.
 *
 * Also planted: the order the owner specified, the umbrella pointing at a
 * duplicate page instead of the canonical landing page, and the single-
 * array shape that keeps desktop and mobile identical.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:public-header
 */
import { runControls, type Mutation } from "./runner";

const HEADER = "src/components/site/SiteHeader.tsx";
const HOME = "src/routes/index.tsx";
const FOOTER = "src/components/site/SiteFooter.tsx";
const GUARD = "header-entry:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- A product name creeps back into the chrome -------------------------
  {
    id: "PH-NC-PASSPORT-RETURNS",
    defect:
      "Security Passport comes back as a public-header nav item, which is the exact arrangement the owner removed",
    file: HEADER,
    find: '    { to: "/", hash: undefined, label: t("nav.forYou") },',
    replace: '    { to: "/", hash: "passport", label: t("nav.passportPublic") },',
    guard: GUARD,
    expect: "must not be public-header nav items",
  },
  {
    id: "PH-NC-DISCOVERY-RETURNS",
    defect: "Career Discovery comes back as a sixth public-header nav item",
    file: HEADER,
    find: '    { to: "/jobs", hash: undefined, label: t("nav.jobs") },',
    replace:
      '    { to: "/security-career-assessment", hash: undefined, label: t("nav.careerDiscovery") },\n    { to: "/jobs", hash: undefined, label: t("nav.jobs") },',
    guard: GUARD,
    expect: "must not be public-header nav items",
  },

  // ---- The owner's order ---------------------------------------------------
  {
    id: "PH-NC-ORDER-CHANGED",
    defect:
      "Karriärvägar is promoted above Jobb, so the bar no longer reads in the order the owner specified",
    file: HEADER,
    find: '    { to: "/jobs", hash: undefined, label: t("nav.jobs") },\n    { to: "/employers", hash: undefined, label: t("nav.employers") },\n    { to: "/career-center", hash: undefined, label: t("nav.career_center") },',
    replace:
      '    { to: "/career-center", hash: undefined, label: t("nav.career_center") },\n    { to: "/jobs", hash: undefined, label: t("nav.jobs") },\n    { to: "/employers", hash: undefined, label: t("nav.employers") },',
    guard: GUARD,
    expect: "in that order",
  },

  // ---- The umbrella stops being the canonical page -------------------------
  {
    id: "PH-NC-FORYOU-DUPLICATE-PAGE",
    defect:
      '"För dig" points at a second candidate page instead of the canonical public landing page, which is the duplication this decision exists to remove',
    file: HEADER,
    find: '    { to: "/", hash: undefined, label: t("nav.forYou") },',
    replace: '    { to: "/careers", hash: undefined, label: t("nav.forYou") },',
    guard: GUARD,
    expect: "in that order",
  },

  // ---- One array, two viewports -------------------------------------------
  {
    id: "PH-NC-SECOND-NAV-ARRAY",
    defect:
      "a second nav definition appears, which is how the desktop bar and the compact menu drift into different information architectures",
    file: HEADER,
    find: '    { to: "/about", hash: undefined, label: t("nav.about") },\n  ] as const;',
    replace:
      '    { to: "/about", hash: undefined, label: t("nav.about") },\n  ] as const;\n  const nav = [\n    { to: "/about", hash: undefined, label: t("nav.about") },\n  ] as const;',
    guard: GUARD,
    expect: "exactly one public nav definition",
  },

  // ---- The removal leaks from the chrome into the content -----------------
  {
    id: "PH-NC-PASSPORT-SECTION-DELETED",
    defect:
      "the homepage's Passport section is deleted along with the nav item, so removing a product from the chrome silently removes it from the product",
    file: HOME,
    find: 'id="passport"',
    replace: 'id="passport-removed"',
    guard: GUARD,
    expect: "must keep its Security Passport section",
  },
  {
    id: "PH-NC-FOOTER-LOSES-PRODUCTS",
    defect:
      "the footer stops naming the two products, so they are reachable from neither the chrome nor the site furniture",
    file: FOOTER,
    find: 't("nav.careerDiscovery")',
    replace: 't("nav.about")',
    guard: GUARD,
    expect: "footer must still name both products",
  },
];

runControls("public-header", MUTATIONS);
