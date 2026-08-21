// Security Passport — product separation guard.
//
// Modelled on scripts/security-competency-separation-check.ts, which exists
// because a previous domain boundary held only by convention did not hold.
// This one is authored in Phase 1, before any sp_* table exists, precisely
// because a boundary is cheap to establish and expensive to retrofit.
//
// What it proves, statically:
//
//   1. No Passport module imports Career Discovery, Career Card or
//      Security Competence Platform code (Product Architecture v1.1 §2,
//      rules B6-B9).
//   2. Only `*.functions.ts` / `*.server.ts` may reach the server tier.
//      Components, pure domain modules and the fixture prototype cannot
//      import a Supabase client at all, which is what keeps the calculation
//      layer testable and the dev prototype genuinely offline. The
//      service-role client is banned everywhere, including the server tier:
//      RLS is the Passport's boundary, and a read that succeeded because the
//      server held a master key would defeat it.
//   3. No Career Discovery or SCP module imports Passport code, so the
//      boundary holds in both directions.
//   4. The Passport tree renders no bar, meter, percentage or normalised
//      indicator — Career Card's guidance vocabulary, which must not appear
//      in the Trust product.
//   5. No user-facing Passport text lives outside the domain-local copy
//      module, and the central dictionary is untouched by Passport.
//   6. No criminal-record, background-check or "clean record" concept
//      appears anywhere in the Passport tree.
//   7. The dev route is fail-closed and no production route claims
//      /passport or /p/:token.
//
// Plain TS script run with Bun, matching this repository's scripts/*-check.ts
// convention (no test runner is configured in this project).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const PASSPORT_LIB = path.join(root, "src/lib/security-passport");
const PASSPORT_COMPONENTS = path.join(root, "src/components/security-passport");
const PASSPORT_ROUTE = path.join(root, "src/routes/dev.security-passport.tsx");

const passportFiles = [...walk(PASSPORT_LIB), ...walk(PASSPORT_COMPONENTS), PASSPORT_ROUTE];

expect(passportFiles.length > 0, "No Security Passport files found — is the tree in place?");

function rel(file: string): string {
  return path.relative(root, file);
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

// Comments legitimately NAME the forbidden domains and concepts in order to
// explain the boundary — a file that says "this must never render a
// suitability score" would otherwise fail the very check it documents. So
// the content scans run against code with comments stripped, and the import
// scans run against import lines only.
function importLines(source: string): string[] {
  return source.split("\n").filter((line) => /^\s*(import|export)\s[^;]*from\s+["']/.test(line));
}

/** Removes block and line comments. Conservative about `//` inside URLs,
 *  which appear in comments here but would otherwise truncate a line early. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1. Cross-domain imports out of Passport
// ---------------------------------------------------------------------------
const FORBIDDEN_IMPORT_FRAGMENTS = [
  "career-discovery",
  "career-assessment",
  "career-intelligence-engine",
  "career-center",
  "security-competency",
  "question-library",
  "competency-library",
  "knowledge-graph",
  "assessment-content",
];

for (const file of passportFiles) {
  for (const line of importLines(read(file))) {
    for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
      expect(
        !line.includes(fragment),
        `${rel(file)}: Passport must not import "${fragment}" — ${line.trim()}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. No database, auth or server access from the Passport tree
// ---------------------------------------------------------------------------
// Phase 2 gave the Passport a real server tier, so database and server-
// function imports are now legitimate — but ONLY in files whose name says
// they are the server tier. Components, the pure domain modules and the
// fixture tree stay unable to reach a database, which is what keeps the
// calculation layer testable and the dev prototype genuinely offline.
const SERVER_TIER = /\.(functions|server)\.ts$/;

const FORBIDDEN_RUNTIME_FRAGMENTS = [
  "@/integrations/supabase",
  "@supabase/supabase-js",
  "@tanstack/react-start", // server functions / createServerFn
  "integrations/lovable",
];

for (const file of passportFiles) {
  if (SERVER_TIER.test(file)) continue;
  for (const line of importLines(read(file))) {
    for (const fragment of FORBIDDEN_RUNTIME_FRAGMENTS) {
      expect(
        !line.includes(fragment),
        `${rel(file)}: only *.functions.ts may reach the server tier; "${fragment}" must not be imported here — ${line.trim()}`,
      );
    }
  }
}

// The service-role client bypasses RLS. A Passport read that succeeds because
// the server held a master key is exactly the failure mode RLS exists to
// prevent, so it is banned everywhere in this domain — with ONE named
// exception.
//
// The exception is the public recipient boundary. A recipient is anonymous:
// there is no session, so there is no auth.uid() for RLS to key on, and RLS
// cannot express "whoever holds this token" because a token is not an
// identity. The authorisation is the token, checked inside a SECURITY
// DEFINER function that assembles the payload from the package contract and
// which the service role cannot make return more.
//
// Naming the file here is the control: the exception is one path, reviewed
// once, and any second file reaching for the service role fails the build.
const SERVICE_ROLE_EXCEPTION = path.join(PASSPORT_LIB, "public-disclosure.server.ts");

for (const file of passportFiles) {
  if (file === SERVICE_ROLE_EXCEPTION) continue;
  const src = read(file);
  for (const line of importLines(src)) {
    expect(
      !line.includes("client.server") && !line.includes("supabaseAdmin"),
      `${rel(file)}: Passport must never use the service-role client — RLS is the boundary. ${line.trim()}`,
    );
  }
  // Dynamic import is the repository's own convention for loading the admin
  // client inside a handler, so the import-line scan alone would miss it.
  expect(
    !/client\.server|supabaseAdmin/.test(stripComments(src)),
    `${rel(file)}: Passport must never use the service-role client — RLS is the boundary.`,
  );
}

// The exception must stay minimal: exactly one database call, through the
// disclosure function, and nothing else. A `.from(` here would be a direct
// table read with RLS bypassed, which is the thing the ban exists to stop.
{
  const src = stripComments(read(SERVICE_ROLE_EXCEPTION));
  expect(
    !/\.from\s*\(/.test(src),
    "public-disclosure.server.ts must never read a table directly — only sp_get_disclosure.",
  );
  const rpcNames = [...src.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
  const allowed = new Set(["sp_get_disclosure", "sp_throttle_public_access"]);
  for (const name of rpcNames) {
    expect(
      allowed.has(name),
      `public-disclosure.server.ts may only call sp_get_disclosure and sp_throttle_public_access — found ${name}.`,
    );
  }
  expect(
    rpcNames.includes("sp_throttle_public_access"),
    "The public recipient path must go through the rate limit.",
  );
}

// Bare network calls, outside the server tier.
for (const file of passportFiles) {
  if (SERVER_TIER.test(file)) continue;
  const src = read(file);
  expect(
    !/\bfetch\s*\(/.test(src),
    `${rel(file)}: components and domain modules must make no network call (found fetch()).`,
  );
  expect(
    !/\bXMLHttpRequest\b/.test(src),
    `${rel(file)}: components and domain modules must make no network call (found XMLHttpRequest).`,
  );
}

// The fixture tree must stay a pure, offline prototype: it is the thing that
// proves the calculations without a database, and it is what the dev-only
// route renders.
for (const file of passportFiles) {
  if (!file.includes("/fixtures/") && !file.endsWith("PrototypeShell.tsx")) continue;
  for (const line of importLines(read(file))) {
    expect(
      !line.includes("passport.functions"),
      `${rel(file)}: the fixture prototype must not call live Passport server functions.`,
    );
  }
}

// Phase 2 writes only self-declared claims. No module may name a higher
// assertion level in a write position — the database refuses it, and this
// catches the attempt at review time instead of at runtime.
for (const file of passportFiles) {
  if (!SERVER_TIER.test(file)) continue;
  const src = stripComments(read(file));
  // Only a QUOTED LITERAL is a write. `assertion_level: row.assertion_level`
  // is the read mapping and `assertion_level: string` is the row type — both
  // are legitimate, and a rule that flagged them would be turned off within
  // a week. What must never appear is a hard-coded trust value.
  expect(
    !/assertion_level\s*:\s*["'`]/.test(src),
    `${rel(file)}: Phase 2 server code must never assign a literal assertion_level — it takes the column default.`,
  );
  expect(
    !/lifecycle_state\s*:\s*["'`](verified|document_provided|disputed|revoked|expired)["'`]/.test(
      src,
    ),
    `${rel(file)}: Phase 2 server code must not write a Phase 3+ lifecycle state.`,
  );
  expect(
    !/verified_by_user_id\s*:\s*[^;\n]*\b(userId|auth)\b/.test(src),
    `${rel(file)}: Phase 2 server code must never write verification attribution.`,
  );
}

// ---------------------------------------------------------------------------
// 3. The boundary holds in both directions
// ---------------------------------------------------------------------------
const OTHER_DOMAIN_DIRS = [
  path.join(root, "src/lib/career-discovery"),
  path.join(root, "src/components/career-discovery"),
  path.join(root, "src/lib/security-competency"),
  path.join(root, "src/components/academy"),
];

for (const dir of OTHER_DOMAIN_DIRS) {
  for (const file of walk(dir)) {
    for (const line of importLines(read(file))) {
      expect(
        !line.includes("security-passport"),
        `${rel(file)}: must not import Security Passport — ${line.trim()}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3b. Applying for a job is not consent to disclose a Passport
// ---------------------------------------------------------------------------
// The employer recruitment surfaces — the applications list and Candidate 360
// — are where the two products come closest: one screen, one named person, and
// a recruiter who would quite reasonably like to see their Passport. They must
// not be able to.
//
// A Passport reaches somebody only through a disclosure its HOLDER created,
// read back through sp_get_disclosure at the public recipient boundary. An
// employer surface that read an sp_* table, called a disclosure function, or
// assembled a payload from Passport modules would make job-application consent
// into Passport consent by implementation, whatever the copy said.
//
// So the rule for these files is absolute and easy to check: they may not
// name the Passport at all. If in-platform, holder-authorised disclosure to a
// named employer is built later, it arrives as its own reviewed integration
// and this list is what has to be revisited deliberately.
const RECRUITMENT_SURFACES = [
  "src/routes/_authenticated.employer.$employerSlug.applications.tsx",
  "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx",
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx",
  "src/lib/job-intelligence/application-status.ts",
  "src/components/academy/ApplicationAssessmentPanel.tsx",
];

// The list is only a control while it matches reality: a candidate route added
// tomorrow and not named here would escape every rule below.
{
  const routeDir = path.join(root, "src/routes");
  const recruitmentRoutes = readdirSync(routeDir).filter((f) =>
    f.startsWith("_authenticated.employer.$employerSlug.applications"),
  );
  for (const file of recruitmentRoutes) {
    expect(
      RECRUITMENT_SURFACES.includes(`src/routes/${file}`),
      `src/routes/${file}: a new employer applications surface must be added to ` +
        `RECRUITMENT_SURFACES in this check, so the Passport boundary is proven for it too.`,
    );
  }
}

const PASSPORT_REFERENCES: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /security-passport/, why: "a Security Passport module" },
  { pattern: /\bsp_[a-z_]+/, why: "a Passport table or function" },
  { pattern: /getPublicDisclosure|sp_get_disclosure/, why: "the disclosure boundary" },
  { pattern: /\bpassport\b/i, why: "the Passport by name" },
];

for (const relPath of RECRUITMENT_SURFACES) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) {
    expect(false, `${relPath}: named in RECRUITMENT_SURFACES but does not exist.`);
    continue;
  }
  // Comments are stripped: Candidate 360's own header explains, at length, why
  // no Passport appears on it, and a check that failed on that explanation
  // would be deleted rather than obeyed.
  const src = stripComments(read(full));
  for (const { pattern, why } of PASSPORT_REFERENCES) {
    expect(
      !pattern.test(src),
      `${relPath}: an employer recruitment surface must not reference ${why}. ` +
        `Applying for a job is not consent to disclose a Security Passport.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. No guidance-indicator vocabulary in the Trust product
// ---------------------------------------------------------------------------
// Career Card renders normalised [0,1] dimension bars. Anything shaped like
// that in the Passport tree would imply measurement where there is
// attestation. `<progress>` and role="progressbar" are covered too.
const FORBIDDEN_UI_PATTERNS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /role\s*=\s*["']progressbar["']/, why: "progressbar role" },
  { pattern: /<progress\b/, why: "<progress> element" },
  { pattern: /\bdimensionScores\b/, why: "Career DNA dimension scores" },
  { pattern: /\bfitTier\b/, why: "Career Card fit tier" },
  { pattern: /\bmatchScore\b|\bmatchPercent/, why: "match score" },
  { pattern: /\bemployabilit/i, why: "employability language" },
  { pattern: /\bsuitabilit/i, why: "suitability language" },
];

for (const file of passportFiles) {
  const src = stripComments(read(file));
  for (const { pattern, why } of FORBIDDEN_UI_PATTERNS) {
    expect(!pattern.test(src), `${rel(file)}: Passport must not use ${why}.`);
  }
}

// ---------------------------------------------------------------------------
// 5. Copy stays domain-local; the central dictionary is untouched
// ---------------------------------------------------------------------------
for (const file of passportFiles) {
  for (const line of importLines(read(file))) {
    expect(
      !line.includes("@/i18n/dictionaries"),
      `${rel(file)}: Passport copy must come from lib/security-passport/i18n.ts, not the central dictionary — ${line.trim()}`,
    );
  }
}

// Only the adapter may touch the global i18n context, and only for `lang`.
const adapterPath = path.join(PASSPORT_LIB, "use-passport-copy.ts");
for (const file of passportFiles) {
  const src = read(file);
  if (file === adapterPath) continue;
  const usesGlobalT = /from\s+["']@\/i18n\/context["']/.test(src);
  if (usesGlobalT) {
    // PrototypeShell legitimately needs setLang for the harness language
    // toggle. Anything else reaching for the global context is a smell.
    expect(
      file.endsWith("PrototypeShell.tsx"),
      `${rel(file)}: only the copy adapter and the harness may use the global i18n context.`,
    );
  }
  expect(
    !/\bt\(\s*["']/.test(src) || file.endsWith("PrototypeShell.tsx"),
    `${rel(file)}: use pt() from usePassportCopy, never the central t().`,
  );
}

// ---------------------------------------------------------------------------
// 6. No criminal-record or background-check concept, in any language
// ---------------------------------------------------------------------------
const PROHIBITED_CONCEPTS: readonly RegExp[] = [
  /criminal[\s_-]?record/i,
  /background[\s_-]?check/i,
  /clean[\s_-]?record/i,
  /\bconvict/i,
  /belastningsregister/i,
  /brottsregister/i,
  /bakgrundskontroll/i,
  /ostraffad/i,
  /vandelspr[öo]vning/i,
];

// The prohibition is on PROCESSING such data — a field, a question, a claim
// type, a stored value. Telling the holder plainly that Passport is not a
// background check and never holds criminal-record information is required
// copy (Product Architecture v1.1 §4, welcome screen), and naming the thing
// is the only way to deny it. So these two copy keys, and only these, may
// contain the words.
const DISCLAIMER_KEYS = ["welcome.isNot3", "welcome.rule1"];

for (const file of passportFiles) {
  const lines = stripComments(read(file)).split("\n");
  lines.forEach((line, i) => {
    const previous = i > 0 ? lines[i - 1] : "";
    const isDisclaimer = DISCLAIMER_KEYS.some(
      (k) => line.includes(`"${k}"`) || previous.includes(`"${k}"`),
    );
    if (isDisclaimer) return;
    for (const pattern of PROHIBITED_CONCEPTS) {
      expect(
        !pattern.test(line),
        `${rel(file)}:${i + 1}: prohibited concept (${pattern}). Criminal-record and background-check processing are out of scope entirely — only the explicit disclaimer copy may name them.`,
      );
    }
  });
}

// The disclaimer must actually exist: a check that merely permits the words
// would pass just as happily if the reassurance were deleted.
{
  const copySource = read(path.join(PASSPORT_LIB, "i18n.ts"));
  expect(
    copySource.includes('"welcome.isNot3"'),
    "The welcome copy must keep an explicit statement that Passport is not a background check.",
  );
}

// ---------------------------------------------------------------------------
// 7. Route isolation
// ---------------------------------------------------------------------------
const routeSrc = read(PASSPORT_ROUTE);
expect(
  routeSrc.includes("beforeLoad") && routeSrc.includes("notFound()"),
  "dev.security-passport.tsx must fail closed via beforeLoad -> notFound().",
);
expect(
  routeSrc.includes("import.meta.env") && routeSrc.includes("DEV"),
  "dev.security-passport.tsx must gate on import.meta.env.DEV.",
);
expect(
  /robots["']?\s*,?\s*content:\s*["']noindex/.test(routeSrc) ||
    routeSrc.includes('"noindex,nofollow"'),
  "dev.security-passport.tsx must declare robots noindex,nofollow.",
);

const routeFiles = readdirSync(path.join(root, "src/routes"));

// Phase 2 claims /passport as the authenticated product destination, and it
// must live behind the existing _authenticated guard rather than as a bare
// top-level route.
expect(
  !routeFiles.includes("passport.tsx") && !routeFiles.includes("passport.index.tsx"),
  "The Passport must be an _authenticated route, not a public top-level one.",
);
expect(
  routeFiles.some((f) => f.startsWith("_authenticated.passport.")),
  "Phase 2 must provide an _authenticated Passport route.",
);

// Phase 4/5 ships public sharing, so the recipient route now EXISTS and the
// rule inverts: it must be the one public Passport route, it must not be
// indexed, and it must never reach a Passport table directly.
expect(
  routeFiles.includes("p.$token.tsx"),
  "The public recipient route src/routes/p.$token.tsx must exist.",
);
for (const forbidden of ["p.tsx", "passport.$token.tsx"]) {
  expect(
    !routeFiles.includes(forbidden),
    `src/routes/${forbidden} must not exist — /p/$token is the only public Passport route.`,
  );
}

{
  const recipientRoute = read(path.join(root, "src/routes/p.$token.tsx"));
  expect(
    /noindex/.test(recipientRoute),
    "The recipient page must declare robots noindex — a share link is for one recipient, not a search engine.",
  );
  expect(
    recipientRoute.includes("getPublicDisclosure"),
    "The recipient page must read through getPublicDisclosure, the throttled server boundary.",
  );
  expect(
    !/@\/integrations\/supabase/.test(recipientRoute),
    "The recipient page must not talk to Supabase directly.",
  );
  // The payload is assembled server-side from the package contract. A page
  // that filtered a fuller object would make "hidden UI is not access
  // control" false again.
  expect(
    !/sp_passport_profiles|sp_claims|sp_experience_periods/.test(recipientRoute),
    "The recipient page must never name a Passport table.",
  );
}

// No production surface may link to the DEV prototype. Live Passport routes
// legitimately import the shared Passport components, so the rule is about
// the dev route specifically.
for (const file of walk(path.join(root, "src/routes")).concat(
  walk(path.join(root, "src/components/site")),
)) {
  if (file === PASSPORT_ROUTE) continue;
  const src = read(file);
  expect(
    !src.includes("dev/security-passport") && !src.includes("dev.security-passport"),
    `${rel(file)}: production surfaces must not reference the dev-only Passport prototype.`,
  );
}

// Phase 5 wires the social formats to real, revocable disclosures, so the
// share surfaces are now legitimately reachable — from the holder's own
// sharing centre and nowhere else. CardStudio stays dev-only: it is a
// three-direction comparison harness, not a product surface.
const SHARING_CENTRE = path.join(root, "src/routes/_authenticated.passport.share.tsx");

for (const file of walk(path.join(root, "src/routes"))) {
  if (file === PASSPORT_ROUTE) continue;
  const src = read(file);
  expect(
    !src.includes("CardStudio"),
    `${rel(file)}: CardStudio is a dev-only comparison harness and must not be reachable from a production route.`,
  );
  if (file === SHARING_CENTRE) continue;
  for (const deferred of ["social/SocialFrame", "social/ShareActions"]) {
    expect(
      !src.includes(deferred),
      `${rel(file)}: "${deferred}" belongs to the holder's sharing centre only.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Internal reviewer notes never leave the review
// ---------------------------------------------------------------------------
// `decision_note` is the reviewer's private reasoning; `holder_message` is
// what the holder is told. Two fields exist so one cannot leak as the other,
// and the holder-facing read must never select the internal one.
{
  // Comments stripped first: the holder read legitimately CARRIES a comment
  // saying decision_note is deliberately absent, and a check that failed on
  // its own documentation would be turned off within a week.
  const holderRead = stripComments(read(path.join(PASSPORT_LIB, "verification.functions.ts")));
  const holderSelect = holderRead.slice(
    holderRead.indexOf("listMyVerificationRequests"),
    holderRead.indexOf("submitForVerification"),
  );
  expect(
    !holderSelect.includes("decision_note"),
    "The holder-facing verification read must not select decision_note — that is the reviewer's internal reasoning.",
  );
}

for (const file of passportFiles) {
  if (file.includes("/social/") || file.endsWith("card.ts") || file.includes("/card/")) {
    expect(
      !stripComments(read(file)).includes("decision_note"),
      `${rel(file)}: internal reviewer notes must never reach a card or a social image.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`passport-separation:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `passport-separation:check OK ` +
    `(${passportFiles.length} Passport files; no Career Discovery, Career Card or SCP import; ` +
    `no Supabase/server/network access; no guidance-indicator vocabulary; ` +
    `copy domain-local; no criminal-record concept; dev route fails closed; ` +
    `/passport is _authenticated-only; /p/$token is noindex and reads only ` +
    `through the throttled server boundary; the service role is confined to ` +
    `that one file; internal reviewer notes never reach a card or a holder; ` +
    `${RECRUITMENT_SURFACES.length} employer recruitment surfaces name the ` +
    `Passport nowhere)`,
);
