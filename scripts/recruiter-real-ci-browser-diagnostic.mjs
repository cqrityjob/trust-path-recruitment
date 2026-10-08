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
const notePhases = new Set(["paused", "completed", "evidence"]);
const noteFailureCodes = new Set();
const evidenceFailureCodes = new Set();
for (let i = 1; i <= 8; i++)
  for (const reason of ["SELECTION", "NOTE_VISIBLE", "USE_VISIBLE", "CONFIRMED_EXCERPT"])
    evidenceFailureCodes.add(`REAL_CI_EVIDENCE_Q${i}_${reason}`);
for (const phase of notePhases) {
  const prefix = `REAL_CI_NOTE_READBACK_${phase.toUpperCase()}_`;
  for (const reason of [
    "HTTP",
    "SESSION_COUNT",
    "SESSION_STATE",
    "CASE_COUNT",
    "CASE_STATE",
    "QUESTION_MAP",
    "NOTE_COUNT",
  ])
    noteFailureCodes.add(`${prefix}${reason}`);
  for (let i = 1; i <= 8; i++)
    for (const reason of ["MISSING", "BLANK", "MARKER", "DUPLICATE"])
      noteFailureCodes.add(`${prefix}Q${i}_${reason}`);
}

/** Checks an actual own-Auth REST readback. Errors contain only fixed codes. */
export function requireNativeNoteReadback({ phase, sessions, cases, questions, notes, markers }) {
  if (!notePhases.has(phase)) throw Error("REAL_CI_NOTE_READBACK_PHASE_REQUIRED");
  const fail = (reason) => {
    throw Error(`REAL_CI_NOTE_READBACK_${phase.toUpperCase()}_${reason}`);
  };
  if (!Array.isArray(sessions) || sessions.length !== 1) fail("SESSION_COUNT");
  if (sessions[0]?.status !== (phase === "paused" ? "paused" : "completed")) fail("SESSION_STATE");
  if (!Array.isArray(cases) || cases.length !== 1) fail("CASE_COUNT");
  const allowedCases =
    phase === "paused"
      ? ["interview_in_progress"]
      : phase === "completed"
        ? ["interview_complete"]
        : ["interview_complete", "evidence_review"];
  if (!allowedCases.includes(cases[0]?.status)) fail("CASE_STATE");
  if (
    !Array.isArray(questions) ||
    questions.length !== 8 ||
    new Set(questions.map((q) => q?.id)).size !== 8 ||
    questions.some((q) => typeof q?.id !== "string" || !q.id)
  )
    fail("QUESTION_MAP");
  if (!Array.isArray(notes)) fail("NOTE_COUNT");
  for (let i = 1; i <= 8; i++) {
    const code = `Q${i}`;
    const question = questions.filter((q) => q.code === code);
    if (question.length !== 1 || typeof markers?.[code] !== "string" || !markers[code])
      fail("QUESTION_MAP");
    const matched = notes.filter((n) => n?.question_id === question[0].id);
    if (matched.length === 0) fail(`${code}_MISSING`);
    if (matched.length !== 1) fail(`${code}_DUPLICATE`);
    if (typeof matched[0].body !== "string" || !matched[0].body.trim()) fail(`${code}_BLANK`);
    if (!matched[0].body.includes(markers[code])) fail(`${code}_MARKER`);
  }
  if (notes.length !== 8) fail("NOTE_COUNT");
  return { phase, nonemptyQuestionNotes: 8 };
}

function probeFailureCode(error) {
  const code = String(error?.message ?? "").replace(/^Error: /, "");
  return noteFailureCodes.has(code) || evidenceFailureCodes.has(code) ? code : null;
}

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
  const probe = probeFailureCode(error);
  if (probe) return noteFailureCodes.has(probe) ? "note_readback" : "evidence_readback";
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
              ...(probeFailureCode(error) ? { probeCode: probeFailureCode(error) } : {}),
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
