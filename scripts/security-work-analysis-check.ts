// Synthetic, standalone behavior proofs. No customer documents, network or database.
import assert from "node:assert/strict";
import {
  RSA_MATRIX,
  analysisMethods,
  analysisSaveInput,
  calibrated,
  contextSchema,
  initialContext,
  reportSaveInput,
  reportSections,
  riskColour,
  type RiskColour,
} from "../src/lib/security-work/analysis-model";
import {
  frozenReportSections,
  frozenRiskColour,
  reportBundleSchema,
  reportHtml,
  type ReportBundle,
} from "../src/lib/security-work/report-export";

let checks = 0;
function test(label: string, run: () => void) {
  try {
    run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "failed"}`, {
      cause: error,
    });
  }
}

// Independent owner-approved oracle, listed S5 down to S1 and K1 through K5.
// Deliberately not computed from RSA_MATRIX or a product/threshold formula.
const approvedCells = [
  [5, ["green", "yellow", "red", "red", "red"]],
  [4, ["green", "yellow", "orange", "red", "red"]],
  [3, ["green", "yellow", "yellow", "orange", "orange"]],
  [2, ["green", "green", "yellow", "yellow", "yellow"]],
  [1, ["green", "green", "green", "green", "green"]],
] as const;
for (const [likelihood, colours] of approvedCells) {
  for (const [index, expected] of colours.entries()) {
    test(`owner matrix S${likelihood}/K${index + 1} is ${expected}`, () => {
      assert.equal(riskColour(likelihood, index + 1), expected);
    });
  }
}
test("equal products do not imply equal approved colours", () => {
  assert.equal(5 * 2, 2 * 5);
  assert.equal(riskColour(5, 2), "yellow");
  assert.equal(riskColour(2, 5), "yellow");
  assert.equal(4 * 2, 2 * 4);
  assert.equal(riskColour(4, 2), "yellow");
  assert.equal(riskColour(2, 4), "yellow");
  // The explicit owner matrix is asymmetric even where multiplication is equal.
  assert.equal(riskColour(5, 3), "red");
  assert.equal(riskColour(3, 5), "orange");
});
test("unknown and invalid levels never turn into a low classification", () => {
  for (const invalid of [null, -1, 0, 6, 2.5, NaN, Infinity, -Infinity]) {
    assert.equal(riskColour(invalid, 3), null);
    assert.equal(riskColour(3, invalid), null);
  }
  assert.equal(riskColour(null, null), null);
});

const completeContext = () =>
  contextSchema.parse({
    profile: "Synthetic service profile",
    calibration: {
      likelihood: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
      consequence: ["Impact 1", "Impact 2", "Impact 3", "Impact 4", "Impact 5"],
      riskAcceptance: "Human-defined synthetic acceptance conditions",
    },
  });
test("new context preserves copied profile but invents no calibration", () => {
  const context = initialContext("Synthetic copied profile");
  assert.equal(context.profile, "Synthetic copied profile");
  assert.deepEqual(context.calibration.likelihood, ["", "", "", "", ""]);
  assert.deepEqual(context.calibration.consequence, ["", "", "", "", ""]);
  assert.equal(context.calibration.riskAcceptance, "");
  assert.equal(calibrated(context, "Next review period"), false);
  assert.ok(contextSchema.safeParse(context).success, "incomplete draft must remain saveable");
});
test("fully explicit calibration and horizon enable classification", () => {
  assert.equal(calibrated(completeContext(), "Next review period"), true);
});
for (const scale of ["likelihood", "consequence"] as const) {
  for (let missing = 0; missing < 5; missing += 1) {
    test(`${scale} level ${missing + 1} cannot be silently omitted`, () => {
      const context = completeContext();
      context.calibration[scale][missing] = " \t\n ";
      assert.equal(calibrated(context, "Next review period"), false);
    });
  }
}
test("horizon and acceptance conditions are independently mandatory", () => {
  assert.equal(calibrated(completeContext(), " \n "), false);
  const context = completeContext();
  context.calibration.riskAcceptance = " \t ";
  assert.equal(calibrated(context, "Next review period"), false);
});
test("calibration contract rejects missing, extra and non-text scale levels", () => {
  for (const scale of ["likelihood", "consequence"] as const) {
    for (const values of [["one"], Array(6).fill("six"), [1, 2, 3, 4, 5]]) {
      const context = completeContext();
      assert.equal(
        contextSchema.safeParse({
          ...context,
          calibration: { ...context.calibration, [scale]: values },
        }).success,
        false,
      );
    }
  }
});

const ids = Array.from(
  { length: 8 },
  (_, index) => `64000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const draft = () => ({
  workspaceId: ids[0],
  id: ids[1],
  version: null,
  analysis_type: "rsa",
  title: " Synthetic RSA ",
  purpose: "",
  scope: "",
  horizon: "",
  context_snapshot: initialContext("Synthetic profile"),
  situation: "",
  affected_activity: "",
  assets: "",
  threat: "",
  vulnerability: "",
  existing_controls: "",
  uncertainty: "",
  assumptions: "",
  proposed_measures: "",
  professional_conclusion: "",
  likelihood: null,
  consequence: null,
});
test("incomplete analysis saves as a draft with unknown risk values", () => {
  const result = analysisSaveInput.parse(draft());
  assert.equal(result.title, "Synthetic RSA");
  assert.equal(result.likelihood, null);
  assert.equal(result.consequence, null);
  assert.equal(result.horizon, "");
});
test("analysis save cannot carry human approval fields or forged ownership", () => {
  for (const fields of [{ status: "approved" }, { approved_by: ids[7] }, { created_by: ids[7] }]) {
    assert.equal(analysisSaveInput.safeParse({ ...draft(), ...fields }).success, false);
  }
});
test("analysis save rejects invalid CAS versions and risk levels", () => {
  for (const version of [0, -1, 1.5]) {
    assert.equal(analysisSaveInput.safeParse({ ...draft(), version }).success, false);
  }
  for (const likelihood of [0, 6, 1.5]) {
    assert.equal(analysisSaveInput.safeParse({ ...draft(), likelihood }).success, false);
  }
});
test("each method retains a distinct report contract including legacy", () => {
  assert.equal(analysisMethods.rsa.reportType, "risk_report");
  assert.equal(analysisMethods.monitoring.reportType, "briefing");
  assert.equal(analysisMethods.legacy_security.reportType, "security_assessment");
  assert.equal(reportSections.rsa.length, 6);
  assert.equal(reportSections.monitoring.length, 6);
  assert.equal(reportSections.legacy_security.length, 8);
  assert.notDeepEqual(
    reportSections.rsa.map((row) => row[0]),
    reportSections.monitoring.map((row) => row[0]),
  );
});
test("report save bounds sections and excludes approval stamps", () => {
  const report = {
    workspaceId: ids[0],
    id: ids[2],
    assessmentId: ids[1],
    version: 1,
    title: "Synthetic report",
    language: "sv",
    sections: { introduction: "Draft" },
    uncertainty: "",
  };
  assert.ok(reportSaveInput.safeParse(report).success);
  assert.equal(reportSaveInput.safeParse({ ...report, approved_at: "2026-09-24" }).success, false);
  assert.equal(
    reportSaveInput.safeParse({ ...report, sections: { introduction: "x".repeat(16001) } }).success,
    false,
  );
});

function fixture(): ReportBundle {
  return reportBundleSchema.parse({
    formatVersion: 1,
    method: {
      id: "rsa-v1",
      definition: { matrix: [...approvedCells].reverse().map(([, row]) => [...row]) },
    },
    template: { id: "rsa-report-v1", required_sections: ["conclusions_actions", "introduction"] },
    report: {
      id: ids[2],
      workspace_id: ids[0],
      title: "Synthetic approved report",
      version: 7,
      status: "approved",
      language: "en",
      sections: {
        introduction: "INTRO_FROZEN",
        conclusions_actions: "CONCLUSION_FROZEN",
        method: "NOT_IN_FROZEN_TEMPLATE",
      },
      uncertainty: "Unknown recovery duration",
    },
    assessment: {
      id: ids[1],
      title: "Synthetic analysis",
      analysis_type: "rsa",
      method_version_id: "rsa-v1",
      horizon: "Approved review period",
      purpose: "Synthetic decision",
      scope: "Synthetic service",
    },
    risks: [
      {
        id: ids[3],
        title: "Synthetic dependency risk",
        description: "Synthetic interruption",
        likelihood: 5,
        consequence: 3,
        uncertainty: "Duration unknown",
        decision_rationale: "Human synthetic judgement",
      },
    ],
    actions: [
      {
        id: ids[4],
        title: "Inspect dependency",
        description: "Synthetic action at approval",
        status: "open",
        due_date: "2026-10-01",
        assignee_user_id: ids[7],
        decision_rationale: "Follow up",
      },
    ],
    citations: [
      {
        id: ids[5],
        source_item_id: ids[6],
        claim: "Synthetic source-linked claim",
        excerpt: "Exact synthetic quotation.",
        locator: "Page 2 · segment 3",
      },
    ],
    sources: [
      {
        id: ids[6],
        original_title: "Synthetic preserved original",
        publisher: "Synthetic publisher",
        published_at: "2026-09-20T10:00:00Z",
        retrieved_at: "2026-09-21T10:00:00Z",
        factual_extract: "Exact synthetic quotation. UNQUOTED_SOURCE_TEXT",
      },
    ],
  });
}
const approval = {
  approved_at: "2026-09-24T11:12:13Z",
  report_version: 7,
  bundle_hash: "b".repeat(64),
};
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("all frozen matrix cells use the preserved method definition", () => {
  const bundle = fixture();
  for (const [likelihood, row] of approvedCells) {
    row.forEach((colour, index) =>
      assert.equal(frozenRiskColour(bundle, likelihood, index + 1), colour),
    );
  }
});
test("snapshot matrix can differ from today's runtime matrix", () => {
  const bundle = fixture();
  bundle.method.definition.matrix![4][2] = "green";
  assert.equal(riskColour(5, 3), "red");
  assert.equal(frozenRiskColour(bundle, 5, 3), "green");
  assert.match(reportHtml(bundle, approval), /green · S 5 \/ K 3/);
  assert.doesNotMatch(reportHtml(bundle, approval), /red · S 5 \/ K 3/);
});
test("frozen unknown values and missing matrix never use runtime defaults", () => {
  const bundle = fixture();
  for (const invalid of [null, 0, 6, 1.5, NaN, Infinity]) {
    assert.equal(frozenRiskColour(bundle, invalid, 3), null);
    assert.equal(frozenRiskColour(bundle, 3, invalid), null);
  }
  delete bundle.method.definition.matrix;
  assert.equal(frozenRiskColour(bundle, 5, 3), null);
  assert.match(reportHtml(bundle, approval), /Unknown · S 5 \/ K 3/);
});
test("legacy and monitoring reports never acquire the RSA matrix", () => {
  for (const type of ["legacy_security", "monitoring"] as const) {
    const bundle = fixture();
    bundle.assessment.analysis_type = type;
    assert.equal(frozenRiskColour(bundle, 5, 3), null);
    assert.match(reportHtml(bundle, approval), /Unknown · S 5 \/ K 3/);
  }
});
test("frozen template controls section inclusion and ordering", () => {
  const bundle = fixture();
  assert.deepEqual(
    frozenReportSections(bundle).map((row) => row[0]),
    ["conclusions_actions", "introduction"],
  );
  const html = reportHtml(bundle, approval);
  assert.ok(html.indexOf("CONCLUSION_FROZEN") < html.indexOf("INTRO_FROZEN"));
  assert.doesNotMatch(html, /NOT_IN_FROZEN_TEMPLATE/);
});
test("retired snapshot sections still render instead of disappearing", () => {
  const bundle = fixture();
  bundle.template.required_sections = ["archived_section"];
  bundle.report.sections.archived_section = "HISTORICAL_APPROVED_CONTENT";
  assert.deepEqual(frozenReportSections(bundle), [
    ["archived_section", "archived_section", "archived_section"],
  ]);
  assert.match(reportHtml(bundle, approval), /HISTORICAL_APPROVED_CONTENT/);
});
test("changing runtime matrix and section order cannot rewrite an old export", () => {
  const bundle = deepFreeze(fixture());
  const before = reportHtml(bundle, approval);
  const runtimeMatrix = RSA_MATRIX as unknown as RiskColour[][];
  const runtimeSections = reportSections.rsa as unknown as [string, string, string][];
  const previousColour = runtimeMatrix[4][2];
  const previousSections = [...runtimeSections];
  try {
    runtimeMatrix[4][2] = "green";
    runtimeSections.reverse();
    runtimeSections.push(["future_only", "Framtida avsnitt", "Future section"]);
    assert.equal(riskColour(5, 3), "green", "negative control must actually change runtime");
    assert.equal(reportHtml(bundle, approval), before);
  } finally {
    runtimeMatrix[4][2] = previousColour;
    runtimeSections.splice(0, runtimeSections.length, ...previousSections);
  }
});
test("frozen bundle validation rejects absent provenance and malformed matrices", () => {
  const bundle = fixture();
  const withoutMethod = { ...bundle, method: undefined };
  const withoutTemplate = { ...bundle, template: undefined };
  assert.equal(reportBundleSchema.safeParse(withoutMethod).success, false);
  assert.equal(reportBundleSchema.safeParse(withoutTemplate).success, false);
  assert.equal(
    reportBundleSchema.safeParse({
      ...bundle,
      method: { ...bundle.method, definition: { matrix: [["green"]] } },
    }).success,
    false,
  );
  assert.equal(
    reportBundleSchema.safeParse({
      ...bundle,
      method: {
        ...bundle.method,
        definition: { matrix: Array.from({ length: 5 }, () => Array(5).fill("invented")) },
      },
    }).success,
    false,
  );
});
test("export labels the approved version, method, hash and historical action status", () => {
  const bundle = fixture();
  const html = reportHtml(bundle, approval);
  assert.match(html, /Approved version 7/);
  assert.ok(html.includes(approval.approved_at));
  assert.ok(html.includes(approval.bundle_hash));
  assert.match(html, /Method: rsa-v1/);
  assert.match(html, /Approved review period/);
  assert.match(html, /Actions at approval/);
  assert.match(html, /open · 2026-10-01/);
  assert.match(html, /Current action status may have changed since approval/);
});
test("citation export joins the preserved source identity and exact quote", () => {
  const bundle = fixture();
  bundle.sources.unshift({
    ...bundle.sources[0],
    id: ids[7],
    original_title: "WRONG_SOURCE_ID",
    publisher: "WRONG_PUBLISHER",
  });
  const html = reportHtml(bundle, approval);
  assert.match(html, /<blockquote>Exact synthetic quotation\.<\/blockquote>/);
  assert.match(
    html,
    /Synthetic preserved original · Synthetic publisher · Page 2 · segment 3 · 2026-09-20T10:00:00Z/,
  );
  assert.doesNotMatch(html, /WRONG_SOURCE_ID|WRONG_PUBLISHER|UNQUOTED_SOURCE_TEXT/);
});
test("missing source dates and risk levels stay visibly unknown", () => {
  const bundle = fixture();
  bundle.sources[0].published_at = null;
  bundle.risks[0].likelihood = null;
  bundle.risks[0].consequence = null;
  const html = reportHtml(bundle, approval);
  assert.match(html, /Publication date unknown/);
  assert.match(html, /Unknown · S \? \/ K \?/);
  assert.doesNotMatch(html, /green · S/);
});
test("export uses the approved language and preserves multiline text", () => {
  const bundle = fixture();
  bundle.report.language = "sv";
  bundle.report.sections.introduction = "Första raden\nAndra raden";
  const html = reportHtml(bundle, approval);
  assert.match(html, /<html lang="sv">/);
  assert.match(html, /Godkänd version 7/);
  assert.ok(html.includes("Första raden\nAndra raden"));
  assert.match(html, /white-space:pre-wrap/);
});
test("every untrusted rendered field is text, never executable HTML", () => {
  const bundle = fixture();
  const attack =
    '</title><script>alert("x")</script><img src="https://example.invalid/pixel" onerror="alert(1)">&\'';
  bundle.report.title = attack;
  bundle.report.sections.introduction = attack;
  bundle.report.uncertainty = attack;
  bundle.assessment.method_version_id = attack;
  bundle.assessment.horizon = attack;
  Object.assign(bundle.risks[0], {
    title: attack,
    description: attack,
    uncertainty: attack,
    decision_rationale: attack,
  });
  Object.assign(bundle.actions[0], {
    title: attack,
    description: attack,
    status: attack,
    due_date: attack,
    decision_rationale: attack,
  });
  Object.assign(bundle.citations[0], { claim: attack, excerpt: attack, locator: attack });
  Object.assign(bundle.sources[0], {
    original_title: attack,
    publisher: attack,
    published_at: attack,
  });
  const html = reportHtml(bundle, { ...approval, approved_at: attack, bundle_hash: attack });
  assert.doesNotMatch(html, /<script\b|<img\b|<iframe\b|<svg\b|<object\b|<form\b/i);
  assert.ok(!html.includes(attack));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&amp;&#39;/);
  assert.match(
    html,
    /default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'/,
  );
});
test("rendering neither mutates nor depends on mutable live business rows", () => {
  const bundle = deepFreeze(fixture());
  const saved = JSON.stringify(bundle);
  const first = reportHtml(bundle, approval);
  const liveAction = {
    ...bundle.actions[0],
    status: "completed",
    description: "LIVE_AFTER_APPROVAL",
  };
  assert.equal(liveAction.status, "completed");
  assert.equal(reportHtml(bundle, approval), first);
  assert.equal(JSON.stringify(bundle), saved);
  assert.doesNotMatch(first, /LIVE_AFTER_APPROVAL/);
  assert.match(first, /open · 2026-10-01/);
});
console.log(
  `PASS: ${checks} Security Work analysis and immutable export checks (including all 25 owner-approved matrix cells).`,
);
