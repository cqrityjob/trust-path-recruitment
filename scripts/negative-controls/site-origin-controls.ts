/**
 * Negative controls for the public-address guard (site-origin:check).
 *
 * The production domain is https://www.cqrityjob.com and every public address
 * comes from src/lib/site-origin.ts. Each way that could quietly stop being
 * true is planted here: a Lovable host written back into a route's canonical,
 * robots.txt pointing a crawler at the old host, the single source drifting to
 * the apex or to the old host, the e-mail link base falling back to the old
 * host, an invitation built on the browser's own origin again, the local-test
 * exception being lost, and the Passport share function's fallback reverting.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte (proved by the shared
 * runner).
 *
 * Run: bun run negative-controls:site-origin
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "site-origin:check";
const OLD_HOST = "https://trust-path-recruitment.lovable.app";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "SO-NC-ROUTE-CANONICAL",
    defect: "the contact page's canonical is written as the old Lovable host again",
    file: "src/routes/contact.tsx",
    find: 'links: [{ rel: "canonical", href: siteUrl("/contact") }],',
    replace: `links: [{ rel: "canonical", href: "${OLD_HOST}/contact" }],`,
    guard: GUARD,
    expect: "a Lovable host is written into user-facing code",
  },
  {
    id: "SO-NC-ROBOTS",
    defect: "robots.txt tells crawlers the sitemap is on the old Lovable host",
    file: "public/robots.txt",
    find: "Sitemap: https://www.cqrityjob.com/sitemap.xml",
    replace: `Sitemap: ${OLD_HOST}/sitemap.xml`,
    guard: GUARD,
    expect: "a Lovable host is written into user-facing code",
  },
  {
    id: "SO-NC-ORIGIN-APEX",
    defect: "the single source drifts to the apex domain, which only redirects",
    file: "src/lib/site-origin.ts",
    find: 'export const PRODUCTION_ORIGIN = "https://www.cqrityjob.com";',
    replace: 'export const PRODUCTION_ORIGIN = "https://cqrityjob.com";',
    guard: GUARD,
    expect: "PRODUCTION_ORIGIN is https://www.cqrityjob.com",
  },
  {
    id: "SO-NC-EMAIL-BASE",
    defect: "the e-mail link base fallback goes back to the old Lovable host",
    file: "src/lib/job-intelligence/seo.ts",
    find: "export const SITE_ORIGIN = PRODUCTION_ORIGIN;",
    replace: `export const SITE_ORIGIN = "${OLD_HOST}";`,
    guard: GUARD,
    expect: "SITE_ORIGIN (the e-mail link base fallback and job canonicals) is PRODUCTION_ORIGIN",
  },
  {
    id: "SO-NC-INVITE-RAW-ORIGIN",
    defect: "the colleague join link is built on the browser's own origin again",
    file: "src/components/employer/EmployerTeamPanel.tsx",
    find: ": shareableUrl(`/employer/join?org=${employerId}`, window.location.origin);",
    replace: ": `${window.location.origin}/employer/join?org=${employerId}`;",
    guard: GUARD,
    expect: "the colleague join link is built on shareableUrl()",
  },
  {
    id: "SO-NC-LOOPBACK-LOST",
    defect: "a localhost origin is no longer kept, so local development hands out production links",
    file: "src/lib/site-origin.ts",
    find: "  if (currentOrigin && isLoopbackOrigin(currentOrigin)) return currentOrigin;\n",
    replace: "",
    guard: GUARD,
    expect: "a localhost origin is kept",
  },
  {
    id: "SO-NC-SHARE-FUNCTION-FALLBACK",
    defect: "the Passport share function's fallback entry origin reverts to the old Lovable host",
    file: "supabase/functions/passport-share/index.ts",
    find: 'const fallback = "https://www.cqrityjob.com";',
    replace: `const fallback = "${OLD_HOST}";`,
    guard: GUARD,
    expect: "a Lovable host is written into user-facing code",
  },
  // ---- A sitemap invites indexing: it lists nothing a crawler may not index ----
  {
    id: "SO-NC-SITEMAP-NOINDEX",
    defect:
      "the sitemap lists /security-career-assessment again, a route that carries noindex, so the crawler is invited to a page that tells it to leave",
    file: "src/routes/sitemap[.]xml.ts",
    find: '          { path: "/jobs", changefreq: "daily", priority: "0.9" },',
    replace:
      '          { path: "/security-career-assessment", changefreq: "monthly", priority: "0.9" },\n          { path: "/jobs", changefreq: "daily", priority: "0.9" },',
    guard: GUARD,
    expect: "the sitemap lists a page a crawler may not index",
  },
  {
    id: "SO-NC-SITEMAP-REDIRECT",
    defect:
      "the sitemap lists /career-center/start again, a retired route that only redirects to /career-center",
    file: "src/routes/sitemap[.]xml.ts",
    find: '          { path: "/jobs", changefreq: "daily", priority: "0.9" },',
    replace:
      '          { path: "/career-center/start", changefreq: "monthly", priority: "0.7" },\n          { path: "/jobs", changefreq: "daily", priority: "0.9" },',
    guard: GUARD,
    expect: "the sitemap lists a page a crawler may not index",
  },
  {
    id: "SO-NC-SITEMAP-UNPUBLISHED-GUIDES",
    defect:
      "the sitemap lists every profession again, including the nine unpublished ones that redirect or render a noindex page",
    file: "src/routes/sitemap[.]xml.ts",
    find: "          ...publishedProfessions.map((p) => ({",
    replace: "          ...professions.map((p) => ({",
    guard: GUARD,
    expect: "the sitemap lists only PUBLISHED profession guides",
  },
  {
    id: "SO-NC-SITEMAP-DRAFT-LEGAL",
    defect:
      "the sitemap lists /villkor whether or not the terms are final, so a crawler is invited to a draft that carries noindex",
    file: "src/routes/sitemap[.]xml.ts",
    find: '          ...(TERMS_FINAL\n            ? [{ path: "/villkor", changefreq: "yearly" as const, priority: "0.3" }]\n            : []),',
    replace: '          { path: "/villkor", changefreq: "yearly" as const, priority: "0.3" },',
    guard: GUARD,
    expect: "the sitemap lists a page a crawler may not index",
  },
  {
    id: "SO-NC-OG-IMAGE-LOST",
    defect: "the root route drops its og:image, so the host's Lovable preview is shared again",
    file: "src/routes/__root.tsx",
    find: '      { property: "og:image", content: `${PRODUCTION_ORIGIN}/og-cqrityjob.png` },\n',
    replace: "",
    guard: GUARD,
    expect:
      "the root route points og:image and twitter:image at the picture on the production domain",
  },
  {
    id: "SO-NC-TWITTER-IMAGE-OLD",
    defect: "the root route's twitter:image goes back to the Lovable editor preview",
    file: "src/routes/__root.tsx",
    find: '{ name: "twitter:image", content: `${PRODUCTION_ORIGIN}/og-cqrityjob.png` }',
    replace: `{ name: "twitter:image", content: "${OLD_HOST}/og-cqrityjob.png" }`,
    guard: GUARD,
    expect:
      "the root route points og:image and twitter:image at the picture on the production domain",
  },
  {
    id: "SO-NC-SHARE-TWITTER-IMAGE",
    defect: "the shared Passport page loses its twitter:image and inherits the site's image on X",
    file: "src/routes/p.$token.tsx",
    find: '      { name: "twitter:image", content: `${publicShareOrigin()}/og-security-passport.png` },\n',
    replace: "",
    guard: GUARD,
    expect: "the shared Passport page sets its own twitter:image",
  },
];

runControls("site-origin", MUTATIONS);
