// Public-address guard: the site's outward name is https://www.cqrityjob.com.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The product launched on a Lovable-assigned host and that host was written
// out by hand in every public route's canonical and og:url, in the sitemap,
// in robots.txt, in the Passport share fallback and in the e-mail link base.
// After the move to the production domain a search engine was still told the
// old host is the real one. src/lib/site-origin.ts is now the single source;
// this guard fails the build if a Lovable host is written into user-facing
// code again, or if the single source stops saying www.cqrityjob.com.
//
// ── WHAT IT DELIBERATELY LEAVES ALONE ──────────────────────────────────
//
// * Comments (they explain history), and the generated Supabase client's
//   preview-zone detection, which is a technical integration, not a name
//   the site gives itself.
// * Loopback / test hosts: shareableOrigin() keeps them, and this guard
//   asserts it, so local walks and the isolated test stacks keep working.
//
// Run: bun run site-origin:check

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  PRODUCTION_ORIGIN,
  isLoopbackOrigin,
  serverSiteOrigin,
  shareableOrigin,
  shareableUrl,
  siteUrl,
} from "../src/lib/site-origin";

const ROOT = join(import.meta.dir, "..");
let failures = 0;

function check(ok: boolean, message: string): void {
  if (ok) {
    console.log(`  ok  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ---- 1. The single source -------------------------------------------------

check(
  PRODUCTION_ORIGIN === "https://www.cqrityjob.com",
  "PRODUCTION_ORIGIN is https://www.cqrityjob.com (www, https, no trailing slash)",
);
check(
  siteUrl("/jobs") === "https://www.cqrityjob.com/jobs",
  "siteUrl('/jobs') is on the production domain",
);
check(
  siteUrl("jobs") === "https://www.cqrityjob.com/jobs",
  "siteUrl('jobs') adds the missing slash",
);
check(siteUrl() === "https://www.cqrityjob.com/", "siteUrl() is the home page");

// A link meant for ANOTHER person: loopback stays, everything else is production.
check(
  shareableOrigin("http://localhost:8080") === "http://localhost:8080",
  "a localhost origin is kept, so local development links open locally",
);
check(
  shareableOrigin("http://127.0.0.1:54321") === "http://127.0.0.1:54321",
  "a 127.0.0.1 origin is kept, so the isolated test stacks stay self-contained",
);
check(
  shareableOrigin("https://trust-path-recruitment.lovable.app") === PRODUCTION_ORIGIN,
  "the old published host is never handed to a recipient",
);
check(
  shareableOrigin("https://preview--abc.lovable.app") === PRODUCTION_ORIGIN,
  "a preview host is never handed to a recipient",
);
check(
  shareableOrigin(undefined) === PRODUCTION_ORIGIN,
  "no current origin (server) is the production domain",
);
check(
  shareableUrl("/employer/join?org=1", "https://www.cqrityjob.com") ===
    "https://www.cqrityjob.com/employer/join?org=1",
  "shareableUrl builds on the production domain",
);
check(
  !isLoopbackOrigin("https://localhost.evil.example"),
  "a host that merely starts with 'localhost' is not loopback",
);

// The e-mail link base: the deployment's PUBLIC_SITE_URL, unless it is the
// old platform host or otherwise unusable.
check(
  serverSiteOrigin(undefined) === PRODUCTION_ORIGIN,
  "no PUBLIC_SITE_URL is the production domain",
);
check(
  serverSiteOrigin("") === PRODUCTION_ORIGIN,
  "an empty PUBLIC_SITE_URL is the production domain",
);
check(
  serverSiteOrigin("https://trust-path-recruitment.lovable.app") === PRODUCTION_ORIGIN,
  "a PUBLIC_SITE_URL left on the old Lovable host is ignored — mails must not link there",
);
check(
  serverSiteOrigin("https://preview--abc.lovable.app/") === PRODUCTION_ORIGIN,
  "a preview PUBLIC_SITE_URL is ignored",
);
check(
  serverSiteOrigin("https://x.lovableproject.com") === PRODUCTION_ORIGIN,
  "a lovableproject.com PUBLIC_SITE_URL is ignored",
);
check(
  serverSiteOrigin("http://www.cqrityjob.com") === PRODUCTION_ORIGIN,
  "plain http on a public host is ignored",
);
check(
  serverSiteOrigin("not a url") === PRODUCTION_ORIGIN,
  "a malformed PUBLIC_SITE_URL is ignored",
);
check(
  serverSiteOrigin("https://www.cqrityjob.com/") === "https://www.cqrityjob.com",
  "a trailing slash never reaches a link",
);
check(
  serverSiteOrigin("https://www.cqrityjob.com/some/path?x=1") === "https://www.cqrityjob.com",
  "a path in the setting never reaches a link",
);
check(
  serverSiteOrigin("www.cqrityjob.com") === "https://www.cqrityjob.com",
  "a setting without a scheme is taken as https",
);
check(
  serverSiteOrigin("https://staging.cqrityjob.com") === "https://staging.cqrityjob.com",
  "a genuine staging host is honoured",
);
check(
  serverSiteOrigin("http://127.0.0.1:8080") === "http://127.0.0.1:8080",
  "a loopback test stack keeps its own address",
);

// ---- 2. No Lovable host in user-facing code -------------------------------

const LOVABLE_HOST = /lovable\.app|lovableproject\.com/i;

/** Files whose Lovable references are technical integrations, not the site's name. */
const TECHNICAL_ALLOWLIST = new Set<string>([
  // Generated by Lovable: detects an editor preview surface to broker the
  // auth session. Not an address the site publishes.
  "src/integrations/supabase/previewAuthStorage.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|html|txt|xml|json|webmanifest)$/.test(name)) out.push(full);
  }
  return out;
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("<!--");
}

const scanned = [
  ...walk(join(ROOT, "src")),
  ...walk(join(ROOT, "public")),
  ...walk(join(ROOT, "supabase", "functions")),
].filter((f) => !f.endsWith("routeTree.gen.ts"));

const offenders: string[] = [];
for (const file of scanned) {
  const rel = relative(ROOT, file);
  if (TECHNICAL_ALLOWLIST.has(rel)) continue;
  read(rel)
    .split("\n")
    .forEach((line, i) => {
      if (LOVABLE_HOST.test(line) && !isComment(line))
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
}
check(
  offenders.length === 0,
  offenders.length === 0
    ? `no Lovable host is written into src, public or supabase/functions (${scanned.length} files scanned)`
    : `a Lovable host is written into user-facing code:\n         ${offenders.join("\n         ")}`,
);

// ---- 3. The places that publish the address -------------------------------

const robots = read("public/robots.txt");
check(
  robots.split("\n").some((l) => l.trim() === `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`),
  "robots.txt names the production sitemap",
);

const sitemap = read("src/routes/sitemap[.]xml.ts");
check(
  /const BASE_URL = PRODUCTION_ORIGIN;/.test(sitemap),
  "the sitemap is built on PRODUCTION_ORIGIN",
);

const seo = read("src/lib/job-intelligence/seo.ts");
check(
  /export const SITE_ORIGIN = PRODUCTION_ORIGIN;/.test(seo),
  "SITE_ORIGIN (the e-mail link base fallback and job canonicals) is PRODUCTION_ORIGIN",
);

const publicOrigin = read("src/lib/security-passport/public-origin.ts");
check(
  /const FALLBACK_ORIGIN = PRODUCTION_ORIGIN;/.test(publicOrigin),
  "the Passport share fallback is PRODUCTION_ORIGIN",
);

const shareFn = read("supabase/functions/passport-share/index.ts");
check(
  shareFn.includes(`const fallback = "${PRODUCTION_ORIGIN}";`),
  "the passport-share function's fallback entry origin is the production domain",
);

// Every canonical / og:url in a route is built by siteUrl(), never a literal.
const routeFiles = readdirSync(join(ROOT, "src", "routes")).filter(
  (f) => f.endsWith(".tsx") || f.endsWith(".ts"),
);
const literalMeta: string[] = [];
for (const f of routeFiles) {
  read(`src/routes/${f}`)
    .split("\n")
    .forEach((line, i) => {
      if (isComment(line)) return;
      if (/(og:url|canonical)/.test(line) && /["'`]https?:\/\//.test(line)) {
        literalMeta.push(`src/routes/${f}:${i + 1}: ${line.trim()}`);
      }
    });
}
check(
  literalMeta.length === 0,
  literalMeta.length === 0
    ? "no route writes a canonical or og:url as a literal address (all go through siteUrl)"
    : `a canonical/og:url is a literal address:\n         ${literalMeta.join("\n         ")}`,
);

// Links another person opens are built on shareableUrl(), not on the browser's
// own origin: an employer on the old host would otherwise send the old host.
const shareSites: ReadonlyArray<readonly [string, RegExp, string]> = [
  [
    "src/components/beskt/BesktStartDialog.tsx",
    /shareableUrl\(`\/beskt\/inbjudan\//,
    "the BESKT invitation link",
  ],
  [
    "src/components/employer/EmployerTeamPanel.tsx",
    /shareableUrl\(`\/employer\/join\?org=/,
    "the colleague join link",
  ],
  ["src/components/academy/ContentLibrary.tsx", /shareableUrl\("\/academy"/, "the Academy link"],
  [
    "src/components/career-discovery/v31/PublicAssessmentFlow.tsx",
    /shareableUrl\(DISCOVER_URL_PATH/,
    "the Career Card share link",
  ],
  [
    "src/components/career-discovery/v31/CareerCardCreator.tsx",
    /shareableUrl\(DISCOVER_URL_PATH/,
    "the Career Card creator link",
  ],
  [
    "src/routes/security-passport.india.tsx",
    /shareableUrl\(PAGE_PATH/,
    "the India page share link",
  ],
];
for (const [file, pattern, what] of shareSites) {
  check(pattern.test(read(file)), `${what} is built on shareableUrl()`);
}

// Every e-mail / stored-message link base goes through serverSiteOrigin().
const emailBaseSites: ReadonlyArray<readonly [string, string]> = [
  ["src/lib/recruitment/receipt.server.ts", "the application receipt"],
  ["src/lib/recruitment/recruitment.functions.ts", "the candidate message"],
  ["src/lib/job-intelligence/assessment-assignments.functions.ts", "the test invitation"],
  [
    "src/lib/job-intelligence/employer-registration-notice.server.ts",
    "the employer registration notice",
  ],
  ["src/lib/library/start.functions.ts", "the stored test-invitation message"],
  ["src/lib/security-competency/academy-employer.functions.ts", "the Academy invitation"],
];
for (const [file, what] of emailBaseSites) {
  const src = read(file);
  check(
    src.includes("serverSiteOrigin(process.env.PUBLIC_SITE_URL)") &&
      !/process\.env\.PUBLIC_SITE_URL\s*\|\|/.test(src),
    `${what} builds its link base with serverSiteOrigin(), never a bare PUBLIC_SITE_URL`,
  );
}
check(
  /lovable\\\.app\|lovableproject\\\.com/.test(shareFn),
  "the passport-share function ignores a platform-assigned PUBLIC_SITE_URL too",
);

if (failures > 0) {
  console.error(`\nsite-origin:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nsite-origin:check — ok");
