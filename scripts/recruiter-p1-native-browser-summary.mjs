// Publish fixed case identities, counts and source positions only. Actual
// Playwright messages, stacks, attachments, headers and paths stay private.
const CASES = new Map([
  [
    "100 oracle: global status/counts/order, source-aware manual review, preserved URL and drafts in sv/en desktop and emulated mobile",
    "global_review",
  ],
  [
    "direct API reads the same 100 oracle before pagination and refuses anonymous access",
    "browser_direct_api",
  ],
  [
    "explicit chosen clarification reaches the existing PEACE case once without changing role content or confirming evidence",
    "explicit_peace_handoff",
  ],
  [
    "cached recruitment navigation resets the profile target and unsaved drafts even at equal version numbers",
    "cached_profile_target",
  ],
  [
    "archive-only recruitment still exposes all received applications and its archive filter",
    "archive_only",
  ],
]);
export function summarizeNativeBrowser(report) {
  const cases = [];
  const position = (error) => {
    if (
      typeof error?.location?.file === "string" &&
      error.location.file.endsWith("/recruiter-intelligence-p1-native.spec.ts") &&
      Number.isInteger(error.location.line) &&
      error.location.line >= 1 &&
      error.location.line <= 2000
    )
      return error.location.line;
    const match =
      typeof error?.stack === "string" &&
      error.stack.match(/recruiter-intelligence-p1-native\.spec\.ts:(\d{1,4}):\d{1,4}/);
    return match && Number(match[1]) >= 1 && Number(match[1]) <= 2000 ? Number(match[1]) : null;
  };
  const visit = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const id = CASES.get(spec.title);
        if (!id || spec.tests?.length !== 1)
          throw Error("P1_NATIVE_BROWSER_REPORT_IDENTITY_REQUIRED");
        const test = spec.tests[0];
        if (
          !["expected", "unexpected", "flaky", "skipped"].includes(test.status) ||
          !Array.isArray(test.results) ||
          test.results.length < 1 ||
          test.results.length > 2
        )
          throw Error("P1_NATIVE_BROWSER_REPORT_RESULTS_REQUIRED");
        const lines = [
          ...new Set(
            test.results.flatMap((result) =>
              [result.error, ...(result.errors ?? [])]
                .map(position)
                .filter((line) => line !== null),
            ),
          ),
        ];
        cases.push({
          case: id,
          status: test.status,
          attempts: test.results.length,
          sourceLines: lines,
        });
      }
      visit(suite.suites);
    }
  };
  visit(report?.suites);
  if (cases.length !== 5 || new Set(cases.map((item) => item.case)).size !== 5)
    throw Error("P1_NATIVE_BROWSER_FIVE_CASES_REQUIRED");
  const stats = {};
  for (const key of ["expected", "unexpected", "flaky", "skipped"]) {
    const n = report.stats?.[key];
    if (!Number.isInteger(n) || n < 0 || n > 5)
      throw Error("P1_NATIVE_BROWSER_REPORT_COUNTS_REQUIRED");
    stats[key] = n;
    if (cases.filter((item) => item.status === key).length !== n)
      throw Error("P1_NATIVE_BROWSER_REPORT_COUNTS_MISMATCH");
  }
  return { stats, cases };
}
