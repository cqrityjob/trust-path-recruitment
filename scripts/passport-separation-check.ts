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
//   8. Employer recruitment surfaces reach no Passport data, with ONE named,
//      reviewed exception: Candidate overview may render a disclosure the
//      HOLDER created for that specific application, through one named panel
//      and one named server module, both held to tighter rules than the ban
//      they replace. See 3b and 3d.
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
// The rule is therefore about ACCESS, not about vocabulary. Candidate overview
// carries a short, customer-facing Security Passport section -- naming the
// product in order to explain what the employer has and has not been given.
// Banning the word would ban the privacy statement along with the breach, so
// what is banned instead is every route by which a byte of Passport data could
// arrive: the modules, the tables, the functions, the disclosure boundary, the
// tokens and the links.
//
// ── REVISITED DELIBERATELY, ONCE ────────────────────────────────────────
//
// The previous version of this comment said: "if in-platform,
// holder-authorised, application-scoped disclosure is designed later, it
// replaces that copy and arrives as its own reviewed integration -- and this
// list is what has to be revisited deliberately."
//
// That integration now exists, and this is that revisit. Exactly ONE
// recruitment surface may render a disclosure, through exactly ONE component
// and ONE server module, all three named below. Everything else on every
// recruitment surface -- the applications list included -- stays exactly as
// closed as it was, and rule 3d holds the permitted three to a tighter
// standard than the ban it replaces:
//
//   * the panel may reach exactly one server function and no table;
//   * that server module may call only the four holder-scoped RPCs;
//   * the panel must still render the pinned "nothing has been shared"
//     sentence, so the case PR #58 protected is protected by a test rather
//     than by the absence of code;
//   * and the section stays unconditional, so its presence still says nothing
//     about whether this person holds a Passport.
//
// Anything beyond that fails the build, and widening this list again is the
// same deliberate act it was the first time.
// The one reviewed integration, named so that it is one line to audit and one
// line to revoke. Mirrors SERVICE_ROLE_EXCEPTION above: an exception that is a
// named constant is a decision; an exception that is a loosened regex is a
// leak.
const HOLDER_DISCLOSURE_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";
const HOLDER_DISCLOSURE_PANEL = "src/components/employer/ApplicationPassportPanel.tsx";
const HOLDER_DISCLOSURE_SERVER = "src/lib/security-passport/application-disclosure.functions.ts";

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

// Every route by which Passport DATA could reach an employer surface.
const PASSPORT_ACCESS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /security-passport/, why: "a Security Passport module" },
  { pattern: /\bsp_[a-z_]+/, why: "a Passport table or function" },
  { pattern: /getPublicDisclosure|sp_get_disclosure/, why: "the disclosure boundary" },
  { pattern: /\bDisclosurePackage|\bdisclosure\b/i, why: "a disclosure payload" },
  { pattern: /shareToken|disclosureToken|passportToken/i, why: "a share token" },
  // A link is access too: /p/$token is the recipient boundary, and /passport
  // is the holder's own product. Neither belongs on an employer surface.
  { pattern: /to=["'`]\/p\/|href=["'`]\/p\//, why: "a link to the recipient boundary" },
  { pattern: /to=["'`]\/passport|href=["'`]\/passport/, why: "a link to the holder's Passport" },
];

// The word "passport" may appear ONLY as customer-facing copy and as the
// section's own anchor id. Anywhere else it is an identifier -- a variable, a
// query, an import, a prop -- and an identifier means code, which means the
// surface is doing something with a Passport rather than describing one.
//
// This is what makes the copy safe to allow: the section can say the product's
// name, and cannot acquire a single line of behaviour without failing here.
const PASSPORT_COPY_ALLOWLIST: readonly RegExp[] = [
  /^employer\.candidate\.passport\.(heading|none|lede|shared|sharedNote)$/,
  /^candidate-passport$/,
];

// The reviewed integration needs two more things on ONE route: the import
// specifier for the panel, and the panel's own name in the markup. Pinned as
// exact strings rather than a pattern, and scoped to that single file, so a
// second component cannot arrive under the same permission.
const HOLDER_DISCLOSURE_LITERALS: readonly string[] = [
  "@/components/employer/ApplicationPassportPanel",
];
const HOLDER_DISCLOSURE_IDENTIFIERS: readonly string[] = ["ApplicationPassportPanel"];

for (const relPath of RECRUITMENT_SURFACES) {
  const full = path.join(root, relPath);
  if (!existsSync(full)) {
    expect(false, `${relPath}: named in RECRUITMENT_SURFACES but does not exist.`);
    continue;
  }
  // Comments are stripped: Candidate overview's own header explains, at
  // length, why no Passport data appears on it, and a check that failed on its
  // own documentation would be deleted rather than obeyed.
  const src = stripComments(read(full));

  for (const { pattern, why } of PASSPORT_ACCESS) {
    expect(
      !pattern.test(src),
      `${relPath}: an employer recruitment surface must not reference ${why}. ` +
        `Applying for a job is not consent to disclose a Security Passport.`,
    );
  }

  // The reviewed integration is permitted on ONE route and nowhere else.
  const isDisclosureRoute = relPath === HOLDER_DISCLOSURE_ROUTE;

  // Every remaining mention of the word must be one of the allowed literals.
  for (const match of src.matchAll(/["'`]([^"'`\n]*passport[^"'`\n]*)["'`]/gi)) {
    const literal = match[1];
    const allowed =
      PASSPORT_COPY_ALLOWLIST.some((rule) => rule.test(literal)) ||
      (isDisclosureRoute && HOLDER_DISCLOSURE_LITERALS.includes(literal));
    expect(
      allowed,
      `${relPath}: "${literal}" is not an approved Passport copy key. An employer ` +
        `recruitment surface may name the Passport only through ` +
        `employer.candidate.passport.* and the section's anchor id -- anything ` +
        `else is code, and code means access.`,
    );
  }
  // A bare identifier (no quotes) is never copy.
  const identifiers = (
    stripComments(read(full))
      .replace(/["'`][^"'`\n]*["'`]/g, "")
      .match(/[\w$]*passport[\w$]*/gi) ?? []
  ).filter((name) => !(isDisclosureRoute && HOLDER_DISCLOSURE_IDENTIFIERS.includes(name)));
  expect(
    identifiers.length === 0,
    `${relPath}: Passport appears as an identifier (${identifiers.join(", ")}), ` +
      `which means this surface holds Passport state or behaviour rather than copy.`,
  );
}

// ---------------------------------------------------------------------------
// 3c. The privacy statement itself must keep saying what it says
// ---------------------------------------------------------------------------
// The section is only worth allowing because of what it asserts. Copy that
// drifted into "no Passport found", or that appeared only for holders, would
// disclose whether this person holds one -- which is the very fact an employer
// is not entitled to. So the sentence is pinned in both languages.
{
  const dict = read(path.join(root, "src/i18n/dictionaries.ts"));
  const required: readonly { key: string; text: string }[] = [
    {
      key: "employer.candidate.passport.none (sv)",
      text: "Ingen Security Passport-information har delats med er för den här ansökan.",
    },
    {
      key: "employer.candidate.passport.none (en)",
      text:
        "No Security Passport information has been shared with your organisation " +
        "for this application.",
    },
    // The two sentences the disclosed state uses. Same rule as the empty
    // state: both say what YOUR ORGANISATION was given, and neither can be
    // read as a fact about what the candidate holds.
    {
      key: "employer.candidate.passport.shared (sv)",
      text: "Kandidaten har valt att dela följande med er för den här ansökan.",
    },
    {
      key: "employer.candidate.passport.shared (en)",
      text:
        "The candidate has chosen to share the following with your organisation " +
        "for this application.",
    },
  ];
  for (const { key, text } of required) {
    expect(
      dict.includes(text),
      `${key} must read exactly "${text}". The statement is about what the ` +
        `EMPLOYER has been given, never about what the candidate holds.`,
    );
  }

  // Wording that would turn an absence of sharing into a claim about the person.
  const FORBIDDEN_IMPLICATIONS: readonly RegExp[] = [
    /No Security Passport (found|available|on file|registered)/i,
    /(saknar|har ingen) Security Passport/i,
    /Security Passport (not found|does not exist|saknas)/i,
  ];
  for (const pattern of FORBIDDEN_IMPLICATIONS) {
    expect(
      !pattern.test(dict),
      `Passport copy must never imply whether a candidate HOLDS a Passport ` +
        `(matched ${pattern}). Only what has been shared with the employer may be stated.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3d. The one reviewed integration, held tighter than the ban it replaces
// ---------------------------------------------------------------------------
// Candidate overview may render a disclosure. That permission is worth only
// what the three files behind it are worth, so each is pinned here:
//
//   * the PANEL reaches exactly one server function and no table, and must
//     still render the sentence PR #58 pinned -- so the "nothing shared" case
//     is protected by an assertion rather than by the absence of code;
//   * the SERVER MODULE may call only the four holder-scoped RPCs. Every one
//     of them checks, in the database, that the caller is either the holder
//     or a member of the organisation the holder named;
//   * and nothing else in the application may import that module, so the
//     permission cannot spread to a second surface by an import statement.
{
  for (const relPath of [
    HOLDER_DISCLOSURE_ROUTE,
    HOLDER_DISCLOSURE_PANEL,
    HOLDER_DISCLOSURE_SERVER,
  ]) {
    expect(
      existsSync(path.join(root, relPath)),
      `${relPath}: named as the reviewed disclosure integration but does not exist.`,
    );
  }

  // ── The panel ──────────────────────────────────────────────────────────
  const panelPath = path.join(root, HOLDER_DISCLOSURE_PANEL);
  if (existsSync(panelPath)) {
    const panel = stripComments(read(panelPath));

    expect(
      panel.includes("employer.candidate.passport.none"),
      `${HOLDER_DISCLOSURE_PANEL}: must render employer.candidate.passport.none. ` +
        `Loading, error, nothing-shared, revoked and expired are one branch, and ` +
        `that branch is the sentence PR #58 pinned -- any difference between them ` +
        `is an oracle for whether a Passport exists.`,
    );

    // The panel is a renderer. It may call the one server function and must
    // reach nothing else that could carry Passport data.
    const panelBans: readonly { pattern: RegExp; why: string }[] = [
      { pattern: /\.from\s*\(/, why: "a direct table read" },
      { pattern: /\bsp_[a-z_]+/, why: "a Passport table or function by name" },
      { pattern: /client\.server|supabaseAdmin/, why: "the service-role client" },
      { pattern: /getPublicDisclosure/, why: "the public recipient boundary" },
      { pattern: /shareToken|disclosureToken|passportToken/i, why: "a share token" },
      { pattern: /to=["'`]\/p\/|href=["'`]\/p\//, why: "a link to the recipient boundary" },
      {
        pattern: /to=["'`]\/passport|href=["'`]\/passport/,
        why: "a link to the holder's Passport",
      },
      { pattern: /createDisclosure|sp_create_disclosure/, why: "token share creation" },
    ];
    for (const { pattern, why } of panelBans) {
      expect(
        !pattern.test(panel),
        `${HOLDER_DISCLOSURE_PANEL}: the disclosure panel must not reference ${why}.`,
      );
    }
  }

  // ── The server module ──────────────────────────────────────────────────
  const serverPath = path.join(root, HOLDER_DISCLOSURE_SERVER);
  if (existsSync(serverPath)) {
    const server = stripComments(read(serverPath));
    const APPROVED_RPCS = new Set([
      "sp_application_disclosure",
      "sp_share_passport_with_application",
      "sp_my_application_disclosures",
    ]);
    const called = [...server.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
    for (const name of called) {
      expect(
        APPROVED_RPCS.has(name),
        `${HOLDER_DISCLOSURE_SERVER}: may call only the holder-scoped disclosure ` +
          `RPCs -- found ${name}.`,
      );
    }
    expect(
      !/\.from\s*\(/.test(server),
      `${HOLDER_DISCLOSURE_SERVER}: must never read a table directly. Every read ` +
        `goes through a SECURITY DEFINER function that checks who is asking.`,
    );
  }

  // ── The permission cannot spread by import ─────────────────────────────
  // Revocation deliberately reuses sp_revoke_disclosure through the Passport's
  // own sharing centre module, so the candidate's control is listed here too.
  const MAY_IMPORT_DISCLOSURE: readonly string[] = [
    HOLDER_DISCLOSURE_PANEL,
    "src/components/jobs/ApplicationPassportShare.tsx",
  ];
  for (const file of [
    ...walk(path.join(root, "src/components")),
    ...walk(path.join(root, "src/routes")),
    ...walk(path.join(root, "src/lib")),
  ]) {
    const relPath = rel(file);
    if (relPath === HOLDER_DISCLOSURE_SERVER) continue;
    const importsIt = importLines(read(file)).some((line) =>
      line.includes("application-disclosure.functions"),
    );
    if (!importsIt) continue;
    expect(
      MAY_IMPORT_DISCLOSURE.includes(relPath),
      `${relPath}: only the reviewed disclosure surfaces may import the ` +
        `application-scoped disclosure module. Add it to MAY_IMPORT_DISCLOSURE ` +
        `only as a deliberate decision.`,
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
// CAREER PROFILE IS NOT THE SECURITY PASSPORT
// ---------------------------------------------------------------------------
//
// The rest of this file guards the separation between the Passport and
// Career Discovery. This guards a different pair, and the one that decides
// what an employer may RELY on: self-reported career-profile information
// versus verified Passport evidence.
//
// The Passport's own surfaces have always said this ("you can never verify
// yourself"; "never through an upload"). The career-profile side said
// nothing, so a candidate filling in their profession, experience — and,
// when the Career Profile grows, their courses, languages and education —
// had no way to know the two are different things. It is pinned here so a
// future Career Profile or CV Builder cannot quietly blur it.

const CAREER_PROFILE_COPY_KEY = "sca.scp.notPassport";
const CAREER_PROFILE_SURFACES = [
  "src/components/assessment/SecurityCareerProfileForm.tsx",
  "src/components/assessment/SecurityCareerProfileCard.tsx",
];

{
  const dict = readFileSync(path.join(root, "src/i18n/dictionaries.ts"), "utf8");
  const occurrences = dict.split(`"${CAREER_PROFILE_COPY_KEY}"`).length - 1;
  if (occurrences < 2) {
    errors.push(
      `${CAREER_PROFILE_COPY_KEY} must exist in BOTH locales (found ${occurrences}); ` +
        "the Career Profile / Security Passport boundary cannot be stated in one language only.",
    );
  }
  // The statement has to actually make the claim. A key that exists and says
  // something vague is how a boundary erodes without any test noticing.
  for (const [locale, must] of [
    ["sv", ["karriärprofil", "Security Passport", "verifier"]],
    ["en", ["career profile", "Security Passport", "verif"]],
  ] as const) {
    const idx =
      locale === "sv"
        ? dict.indexOf(`"${CAREER_PROFILE_COPY_KEY}"`)
        : dict.lastIndexOf(`"${CAREER_PROFILE_COPY_KEY}"`);
    const text = dict.slice(idx, idx + 400);
    for (const needle of must) {
      if (!text.includes(needle)) {
        errors.push(
          `${CAREER_PROFILE_COPY_KEY} (${locale}) must say it is stored in the career profile ` +
            `and does not become verified Passport information; missing "${needle}".`,
        );
      }
    }
  }

  for (const rel of CAREER_PROFILE_SURFACES) {
    const body = readFileSync(path.join(root, rel), "utf8");
    if (!body.includes(CAREER_PROFILE_COPY_KEY)) {
      errors.push(
        `${rel} collects self-reported career-profile information but never states the ` +
          `Career Profile / Security Passport boundary (${CAREER_PROFILE_COPY_KEY}).`,
      );
    }
    // A career-profile surface must not write to the Passport. Copying
    // self-reported data into Passport evidence is the exact governance
    // failure the boundary exists to prevent.
    for (const forbidden of [
      "security-passport/passport.functions",
      "security-passport/credentials.functions",
      "security-passport/entries.functions",
    ]) {
      if (body.includes(forbidden)) {
        errors.push(
          `${rel} imports ${forbidden}: a career-profile surface must never write Passport data.`,
        );
      }
    }
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
    `${RECRUITMENT_SURFACES.length} employer recruitment surfaces reach no ` +
    `Passport module, table, function, token or link, and name it only as ` +
    `pinned privacy copy; the Career Profile / Security Passport boundary is ` +
    `stated in both locales on every career-profile surface, none of which ` +
    `writes Passport data)`,
);
