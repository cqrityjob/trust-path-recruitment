/**
 * Nothing that must not leave, leaves.
 *
 * ── WHY THIS RUNS BEFORE THE UPLOAD ────────────────────────────────────
 *
 * The evidence artifact is downloadable by anyone who can read the pull
 * request. It carries screenshots of a signed-in application, Playwright
 * traces (which record network activity), console logs and a manifest. Any of
 * those can pick up something that should never be published: the owner
 * project ref, a hosted URL, a JWT, a service-role key, a password.
 *
 * So the artifact is scanned first, and a hit FAILS the job rather than being
 * redacted quietly. A redaction nobody is told about is how a leak becomes
 * routine; a red build is how it gets fixed.
 *
 * It also fails when the walk produced nothing, because an empty artifact
 * uploaded green is indistinguishable from evidence until somebody opens it.
 *
 * Run: bun run scripts/e4-evidence-scan.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const DIRS = ["artifacts/employer-final-report-e4", "playwright-report", "test-results"];

/** Binary formats are scanned as bytes-to-text: a JWT inside a trace.zip entry
 *  or a PNG's metadata is still a leak. Reading them as latin1 keeps every
 *  byte addressable without throwing on invalid UTF-8. */
const TEXTUAL = /\.(json|txt|log|md|html|xml|csv|js|map|webm|zip|trace|network)$/i;

const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/wrygicdfxwjnrugduxnt/, "the owner production project ref"],
  [/https:\/\/[a-z0-9-]+\.supabase\.co/i, "a hosted Supabase URL"],
  [/\.lovable(project|)\.(app|dev)/i, "a hosted Lovable backend URL"],
  // A JWT: three base64url segments. Anon keys and service-role keys are both
  // JWTs, and neither belongs in a published artifact.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, "a JWT"],
  [/service_role/i, "a service-role reference"],
  [/sbp_[A-Za-z0-9]{20,}/, "a Supabase access token"],
  [
    /SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/,
    "a hosted credential name",
  ],
];

function walk(rel: string): string[] {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const child = path.join(rel, name);
    if (statSync(path.join(root, child)).isDirectory()) out.push(...walk(child));
    else out.push(child);
  }
  return out;
}

const files = DIRS.flatMap(walk);
const findings: string[] = [];
let scanned = 0;

for (const rel of files) {
  const abs = path.join(root, rel);
  // Screenshots are scanned too: PNG text chunks can carry metadata.
  const raw = readFileSync(abs);
  const text = TEXTUAL.test(rel) ? raw.toString("utf8") : raw.toString("latin1");
  scanned += 1;
  for (const [pattern, what] of PATTERNS) {
    const m = pattern.exec(text);
    if (m) findings.push(`${rel}: ${what} (matched "${m[0].slice(0, 24)}…")`);
  }
}

console.log(`e4 evidence scan — ${scanned} file(s) under ${DIRS.join(", ")}`);

if (findings.length > 0) {
  console.error("\nREFUSED: the evidence carries something that must not be published.\n");
  for (const f of findings) console.error(`  - ${f}`);
  console.error(
    "\nNothing was uploaded. Fix the leak at its source -- do not redact the\n" +
      "artifact and upload it anyway: a redaction nobody is told about is how a\n" +
      "leak becomes routine.",
  );
  process.exit(1);
}

// An empty artifact uploaded green is worse than no artifact: it looks like
// evidence in the checks list and contains none.
const captures = walk("artifacts/employer-final-report-e4").filter((f) => f.endsWith(".png"));
if (captures.length === 0) {
  console.error(
    "\nREFUSED: no screenshot was captured, so there is nothing to review.\n" +
      "An empty artifact must not be published as evidence.",
  );
  process.exit(1);
}

console.log(`  clean — ${captures.length} capture(s), nothing sensitive found`);
