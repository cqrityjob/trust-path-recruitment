/**
 * Did the public-pilot walk actually RUN, on the whole stack?
 *
 * A Playwright job is green when every test that ran passed -- and a test that
 * was skipped did not run. e2e/passport-public-pilot-local.spec.ts skips itself
 * unless it is pointed at a local stack, which is right on a developer's
 * machine and wrong as evidence: a workflow that started no stack would still
 * finish green with every test skipped.
 *
 * So the CI job hands the JSON report here, and this refuses unless, on BOTH
 * the desktop and the 390px project:
 *   * every proof case of the completion work order the spec carries (its
 *     `proof` annotation) ran and has the status "expected" -- none skipped,
 *     failed or flaky, none missing;
 *   * case F uploaded its documents through Storage, not through the RPC-only
 *     path a machine without Storage falls back to;
 *   * case G opened its links behind both stand-ins for the hosted platform:
 *     hosted Supabase's HTML restriction and the host's analytics script. A
 *     share that passes only on a bare local stack is how the gateway page
 *     reached production broken;
 *   * the screenshots the owner asked for exist, at 1440 and at 390.
 * The names are printed so the job log says which walks were taken.
 *
 * Reads files; reaches nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPORT = process.env.PP_EVIDENCE_REPORT ?? "test-results/results.json";
const SHOTS = process.env.PP_EVIDENCE_SHOTS ?? "test-results/passport-public-pilot";
const SPEC = "passport-public-pilot-local.spec.ts";
const PROJECTS = { chromium: 1440, "mobile-390": 390 } as const;
const PROOFS = [
  "A (registration)",
  "A D E",
  "A (English)",
  "I",
  "F",
  "G",
  "H",
  "B",
  "J",
  "K",
] as const;
/** The screenshots the report and the release notes point to. */
const SCREENS = [
  "sv-register-market-choice",
  "sv-register-first-dubai-credential",
  "sv-picker-dubai-public-pilot",
  "sv-information-dubai-public-pilot",
  "en-information-dubai-public-pilot",
  "sv-passport-four-markets",
  "en-passport-four-markets",
  "sv-passport-after-move-to-sweden",
  "sv-review-clarification-answered",
  "sv-review-approved",
  "en-share-created",
  "en-share-recipient",
  "sv-share-recipient-gateway-link",
  "en-share-expired",
  "en-share-revoked",
  "en-passport-mixed-with-india",
  "sv-passport-large",
  "en-admin-catalogue",
] as const;

interface Annotation {
  type: string;
  description?: string;
}
interface TestCase {
  projectName?: string;
  status: string;
  annotations?: Annotation[];
  results?: { annotations?: Annotation[] }[];
}
interface Spec {
  title: string;
  file: string;
  tests: TestCase[];
}
interface Suite {
  specs?: Spec[];
  suites?: Suite[];
}

let report: { suites: Suite[] };
try {
  report = JSON.parse(readFileSync(REPORT, "utf8")) as { suites: Suite[] };
} catch (e) {
  console.error(
    `passport-public-pilot-evidence-verify: cannot read ${REPORT}: ${(e as Error).message}`,
  );
  process.exit(1);
}

interface Found {
  title: string;
  status: string;
  project: string;
  annotations: Annotation[];
}
const found: Found[] = [];
function walk(suite: Suite) {
  for (const spec of suite.specs ?? []) {
    if (!spec.file.endsWith(SPEC)) continue;
    for (const t of spec.tests) {
      found.push({
        title: spec.title,
        status: t.status,
        project: t.projectName ?? "?",
        annotations: [
          ...(t.annotations ?? []),
          ...(t.results ?? []).flatMap((r) => r.annotations ?? []),
        ],
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of report.suites) walk(suite);

const problems: string[] = [];
for (const [project, width] of Object.entries(PROJECTS)) {
  const tests = found.filter((t) => t.project === project);
  console.log(
    `passport-public-pilot-evidence-verify: ${tests.length} ${project} test(s) of ${SPEC}`,
  );
  for (const t of tests) console.log(`  ${t.status.padEnd(10)} ${t.title}`);
  console.log("");

  for (const proof of PROOFS) {
    const hits = tests.filter((t) =>
      t.annotations.some((a) => a.type === "proof" && a.description === proof),
    );
    if (hits.length === 0)
      problems.push(`${project}: proof case "${proof}" never reached the report`);
    for (const t of hits) {
      if (t.status !== "expected")
        problems.push(`${project}: "${t.title}" is ${t.status}, not passed`);
    }
  }
  for (const t of tests) {
    if (t.status !== "expected" && !problems.some((p) => p.includes(t.title)))
      problems.push(`${project}: "${t.title}" is ${t.status}, not passed`);
  }
  const f = tests.find((t) =>
    t.annotations.some((a) => a.type === "proof" && a.description === "F"),
  );
  const upload = f?.annotations.find((a) => a.type === "evidence-upload")?.description;
  if (f && upload !== "storage") {
    problems.push(
      `${project}: case F attached its documents by "${upload ?? "nothing"}", not through Storage -- set E2E_STORAGE=1 on a stack that serves it`,
    );
  }
  const g = tests.find((t) =>
    t.annotations.some((a) => a.type === "proof" && a.description === "G"),
  );
  const hosting = g?.annotations.find((a) => a.type === "share-hosting")?.description;
  if (g && hosting !== "hosted-html-restriction+host-analytics") {
    problems.push(
      `${project}: case G ran "${hosting ?? "on a bare local stack"}" -- set E2E_HOSTED_FUNCTIONS_URL and E2E_HOST_ANALYTICS=1`,
    );
  }
  for (const name of SCREENS) {
    const file = path.join(SHOTS, `${project}-${width}-${name}.png`);
    if (!existsSync(file)) problems.push(`${project}: screenshot missing: ${file}`);
  }
}

if (problems.length > 0) {
  console.error("passport-public-pilot-evidence-verify REFUSED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n  A skipped test is not evidence. The job must start the whole local stack (Storage,\n  the share function, the mail catcher), seed the fixture and point the spec at it\n  before this report can be believed.",
  );
  process.exit(1);
}
console.log(
  `passport-public-pilot-evidence-verify OK: all ${PROOFS.length} proof cases ran and passed on ${Object.keys(PROJECTS).join(" and ")}, documents through Storage, shares behind the hosted restriction and the host's analytics, ${SCREENS.length} screenshots at each width.`,
);
