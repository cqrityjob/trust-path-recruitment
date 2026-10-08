import path from "node:path";

const projects = new Set(["chromium", "mobile-375", "mobile-390"]);
const scenarioTitles = new Map([
  ["guard standalone sv", "guard-standalone-sv"],
  ["guard application en", "guard-application-en"],
  ["manager standalone en", "manager-standalone-en"],
  ["manager application sv", "manager-application-sv"],
]);
const specFile = "recruiter-real-ci-browser.spec.ts";
const count = (value) => (Number.isInteger(value) && value >= 0 && value <= 100 ? value : null);
const coordinate = (value) => (Number.isInteger(value) && value > 0 && value <= 2000 ? value : 0);

function location(error, spec) {
  let line = 0,
    column = 0;
  if (path.basename(String(error?.location?.file ?? "")) === specFile) {
    line = coordinate(error.location.line);
    column = coordinate(error.location.column);
  } else {
    // Read only integer coordinates from the known basename. Never publish
    // any raw path, stack, message, response, locator or attachment content.
    const found = String(error?.stack ?? "").match(
      /recruiter-real-ci-browser\.spec\.ts:(\d+):(\d+)/,
    );
    if (found) {
      line = coordinate(Number(found[1]));
      column = coordinate(Number(found[2]));
    }
  }
  if (!line && path.basename(String(spec.file ?? "")) === specFile) {
    line = coordinate(spec.line);
    column = coordinate(spec.column);
  }
  return line ? { file: `e2e/${specFile}`, line, column } : null;
}

function category(result, error) {
  if (result.status === "timedOut") return "test_timeout";
  if (/^(?:Error: )?expect\(/.test(String(error?.message ?? ""))) return "assertion";
  if (error?.name === "TimeoutError") return "operation_timeout";
  return "unclassified";
}

/** Lossy, fixed taxonomy from private Playwright JSON. Never returns raw text. */
export function browserFailureSummary(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return { code: "invalid_document", failures: [] };
  }
  const failures = [];
  const visit = (suite) => {
    if (!suite || typeof suite !== "object") return;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!spec || typeof spec !== "object") continue;
      const label = String(spec.title ?? "").split(":")[0];
      const scenario =
        spec.title === "two-tab process CAS on real Auth"
          ? "two-tab-process-cas"
          : (scenarioTitles.get(label) ?? "unclassified");
      for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
        if (!test || typeof test !== "object") continue;
        for (const result of Array.isArray(test.results) ? test.results : []) {
          if (!result || typeof result !== "object") continue;
          if (!["failed", "timedOut", "interrupted"].includes(result.status)) continue;
          const error = result.error ?? result.errors?.[0];
          if (failures.length < 16)
            failures.push({
              project: projects.has(test.projectName) ? test.projectName : "unclassified",
              scenario,
              resultStatus: result.status,
              category: category(result, error),
              location: location(error, spec),
            });
        }
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) visit(child);
  };
  for (const suite of Array.isArray(document?.suites) ? document.suites : []) visit(suite);
  return {
    code: "parsed",
    stats: Object.fromEntries(
      ["expected", "unexpected", "flaky", "skipped"].map((key) => [
        key,
        count(document?.stats?.[key]),
      ]),
    ),
    failures,
  };
}
