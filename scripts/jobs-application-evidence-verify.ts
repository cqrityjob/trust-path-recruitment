import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const report = JSON.parse(
  readFileSync(process.argv[2] ?? "test-results/jobs-application-results.json", "utf8"),
);
const tests: Array<{ title: string; status: string }> = [];
function visit(suite: {
  suites?: unknown[];
  specs?: Array<{ title: string; tests: Array<{ status: string }> }>;
}) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) tests.push({ title: spec.title, status: test.status });
  }
  for (const child of suite.suites ?? []) visit(child as Parameters<typeof visit>[0]);
}
visit(report);
assert.equal(tests.length, 2, "Exactly the two real application/preview tests must run.");
assert.ok(
  tests.every((test) => test.status === "expected"),
  "A skipped, failed or flaky application proof is not passing evidence.",
);
assert.equal(report.errors?.length ?? 0, 0, "The browser run must have no runner errors.");
console.log("Real application and employer preview evidence: 2 passed, none skipped.");
