/**
 * Did the recruitment browser walk actually RUN?
 *
 * A Playwright job is green when every test that ran passed -- and a test
 * that was skipped did not run. e2e/recruitment-workspace.spec.ts skips
 * itself unless it is pointed at a local stack, which is right on a
 * developer's machine and wrong as evidence: a workflow that started no
 * stack, or pointed the spec at nothing, would still finish green with
 * every test skipped.
 *
 * So the CI job hands the JSON report here and this refuses unless every
 * test of the spec, on the desktop project, has the status "expected"
 * (passed as written): none skipped, none failed, none flaky, and at
 * least as many as the spec is known to hold. The names are printed so the
 * job log says which walks were taken.
 *
 * Reads one file; reaches nothing.
 */

import { readFileSync } from "node:fs";

const REPORT = process.env.RECRUITMENT_EVIDENCE_REPORT ?? "test-results/results.json";
const SPEC = "recruitment-workspace.spec.ts";
const PROJECT = "chromium";
/** The spec holds this many tests; fewer means some never reached the report. */
const EXPECTED_AT_LEAST = 13;

interface Result {
  status: string;
}
interface TestCase {
  projectName?: string;
  results: Result[];
  status: string;
}
interface Spec {
  title: string;
  file: string;
  tests: TestCase[];
}
interface Suite {
  file?: string;
  specs?: Spec[];
  suites?: Suite[];
}
interface Report {
  suites: Suite[];
  stats?: { expected?: number; skipped?: number; unexpected?: number; flaky?: number };
}

let report: Report;
try {
  report = JSON.parse(readFileSync(REPORT, "utf8")) as Report;
} catch (e) {
  console.error(`recruitment-evidence-verify: cannot read ${REPORT}: ${(e as Error).message}`);
  process.exit(1);
}

const found: { title: string; status: string; project: string }[] = [];
function walk(suite: Suite) {
  for (const spec of suite.specs ?? []) {
    if (!spec.file.endsWith(SPEC)) continue;
    for (const test of spec.tests) {
      found.push({ title: spec.title, status: test.status, project: test.projectName ?? "?" });
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of report.suites) walk(suite);

const desktop = found.filter((t) => t.project === PROJECT);
console.log(`recruitment-evidence-verify: ${desktop.length} ${PROJECT} test(s) of ${SPEC}\n`);
for (const t of desktop) console.log(`  ${t.status.padEnd(10)} ${t.title}`);
console.log("");

const problems: string[] = [];
if (desktop.length < EXPECTED_AT_LEAST) {
  problems.push(
    `only ${desktop.length} ${PROJECT} test(s) reached the report; the spec holds at least ${EXPECTED_AT_LEAST}`,
  );
}
for (const t of desktop) {
  if (t.status !== "expected") problems.push(`"${t.title}" is ${t.status}, not passed`);
}
if (problems.length > 0) {
  console.error("recruitment-evidence-verify REFUSED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n  A skipped test is not evidence. The job must start the local stack, seed the\n  fixture and point the spec at both before this report can be believed.",
  );
  process.exit(1);
}
console.log(`recruitment-evidence-verify OK: every ${PROJECT} test ran and passed.`);
