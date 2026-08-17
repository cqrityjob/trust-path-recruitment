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
//   2. No Passport module imports a Supabase client, a server function or
//      an auth middleware — the strongest available evidence that the
//      Phase 1 prototype makes no database, auth or hosted-data call.
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

import { readdirSync, readFileSync, statSync } from "node:fs";
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
const FORBIDDEN_RUNTIME_FRAGMENTS = [
  "@/integrations/supabase",
  "@supabase/supabase-js",
  "@tanstack/react-start", // server functions / createServerFn
  "integrations/lovable",
];

for (const file of passportFiles) {
  for (const line of importLines(read(file))) {
    for (const fragment of FORBIDDEN_RUNTIME_FRAGMENTS) {
      expect(
        !line.includes(fragment),
        `${rel(file)}: Phase 1 is fixture-only; "${fragment}" must not be imported — ${line.trim()}`,
      );
    }
  }
}

// Also catch bare fetch/XHR, which would be a network call without an import.
for (const file of passportFiles) {
  const src = read(file);
  expect(
    !/\bfetch\s*\(/.test(src),
    `${rel(file)}: Phase 1 is fixture-only and must make no network call (found fetch()).`,
  );
  expect(
    !/\bXMLHttpRequest\b/.test(src),
    `${rel(file)}: Phase 1 is fixture-only and must make no network call (found XMLHttpRequest).`,
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
for (const forbidden of ["passport.tsx", "passport.index.tsx", "p.$token.tsx", "p.tsx"]) {
  expect(
    !routeFiles.includes(forbidden),
    `Phase 1 must not claim a production route: src/routes/${forbidden} exists.`,
  );
}

// No production surface may link to the prototype.
for (const file of walk(path.join(root, "src/routes")).concat(
  walk(path.join(root, "src/components/site")),
)) {
  if (file === PASSPORT_ROUTE) continue;
  const src = read(file);
  expect(
    !src.includes("dev/security-passport") && !src.includes("security-passport"),
    `${rel(file)}: production surfaces must not reference the dev-only Passport prototype.`,
  );
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
    `/passport and /p unclaimed)`,
);
