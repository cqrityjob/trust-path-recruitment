/**
 * Did the job back-navigation walk actually RUN?
 *
 * A Playwright job is green when every test that ran passed -- and a test that
 * was skipped did not run. e2e/job-back-navigation.spec.ts skips itself unless
 * it is pointed at a local stack, which is right on a developer's machine and
 * wrong as evidence: a workflow that started no stack would still finish green
 * with every test skipped.
 *
 * So the CI job hands the JSON report here, and this refuses unless every test
 * of the spec has the status "expected" (passed as written) on BOTH the desktop
 * and the 375px project: none skipped, none failed, none flaky, and at least
 * as many per project as the spec is known to hold. The names are printed so
 * the job log says which walks were taken.
 *
 * Reads one file; reaches nothing.
 */

import { readFileSync } from "node:fs";

const REPORT = process.env.JOB_BACK_EVIDENCE_REPORT ?? "test-results/results.json";
const SPEC = "job-back-navigation.spec.ts";
const PROJECTS = ["chromium", "mobile-375"] as const;
/** The spec holds this many tests; fewer means some never reached the report. */
const EXPECTED_AT_LEAST = 5;

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
}

let report: Report;
try {
  report = JSON.parse(readFileSync(REPORT, "utf8")) as Report;
} catch (e) {
  console.error(
    `job-back-navigation-evidence-verify: cannot read ${REPORT}: ${(e as Error).message}`,
  );
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

const problems: string[] = [];
for (const project of PROJECTS) {
  const tests = found.filter((t) => t.project === project);
  console.log(`job-back-navigation-evidence-verify: ${tests.length} ${project} test(s) of ${SPEC}`);
  for (const t of tests) console.log(`  ${t.status.padEnd(10)} ${t.title}`);
  console.log("");
  if (tests.length < EXPECTED_AT_LEAST) {
    problems.push(
      `only ${tests.length} ${project} test(s) reached the report; the spec holds at least ${EXPECTED_AT_LEAST}`,
    );
  }
  for (const t of tests) {
    if (t.status !== "expected")
      problems.push(`${project}: "${t.title}" is ${t.status}, not passed`);
  }
}
if (problems.length > 0) {
  console.error("job-back-navigation-evidence-verify REFUSED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n  A skipped test is not evidence. The job must start the local stack, seed the\n  fixture and point the spec at both before this report can be believed.",
  );
  process.exit(1);
}
console.log(
  `job-back-navigation-evidence-verify OK: every test ran and passed on ${PROJECTS.join(" and ")}.`,
);
