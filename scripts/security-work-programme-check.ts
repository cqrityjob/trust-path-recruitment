// Synthetic, standalone proofs of the Security Work programme rules. No
// customer data, network or database: every input is a plain fixture and
// every value asserted here is one the application computes deterministically
// (AI never produces programme status, maturity, gaps or next steps).
import assert from "node:assert/strict";
import {
  BASELINE_QUESTIONS,
  BASELINE_VERSION,
  SECURITY_DOMAINS,
  baselineQuestions,
} from "../src/lib/security-work/programme/content/baseline-v1";
import { PLAN_90_TASKS, PLAN_90_VERSION, planTasks } from "../src/lib/security-work/programme/content/plan-90-v1";
import { answerMap, computeMaturity } from "../src/lib/security-work/programme/maturity";
import { potentialGapsFromBaseline } from "../src/lib/security-work/programme/gaps";
import {
  attentionItems,
  programmeStatus,
  recommendedNextAction,
} from "../src/lib/security-work/programme/rules";
import {
  buildManagementReportData,
  computedSummaryLines,
} from "../src/lib/security-work/programme/management-report";
import {
  CAPABILITIES,
  capabilitiesFor,
  parseSuggestionContent,
} from "../src/lib/security-work/programme/assistant-capabilities";
import type {
  Action,
  Gap,
  ManagementReport,
  Mandate,
  ProgrammeFacts,
  ProtectedAsset,
  Risk,
} from "../src/lib/security-work/programme/types";
import { securityWorkEn, securityWorkSv } from "../src/i18n/security-work-copy";

let checks = 0;
function test(label: string, run: () => void) {
  try {
    run();
    checks += 1;
    console.log(`  ok ${label}`);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "failed"}`, {
      cause: error,
    });
  }
}
const TODAY = "2026-10-02";
const W = "00000000-0000-4000-8000-000000000001";
const U = "00000000-0000-4000-8000-000000000002";
const stamp = { created_at: "2026-09-01T00:00:00Z", created_by: U, updated_at: "2026-09-01T00:00:00Z", version: 1 };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function mandate(over: Partial<Mandate> = {}): Mandate {
  return {
    id: uuid(10), workspace_id: W, organisation_description: "Logistics company", security_mission: "Protect people and deliveries",
    reporting_line: "CEO", key_stakeholders: "", decision_authority: "", risk_acceptance_authority: "CEO", geographic_scope: "Sweden",
    key_requirements: "", review_date: "2027-01-01", mandate_document: "", document_provenance: {}, status: "draft", ...stamp, ...over,
  };
}
function asset(n: number, over: Partial<ProtectedAsset> = {}): ProtectedAsset {
  return {
    id: uuid(100 + n), workspace_id: W, name: `Asset ${n}`, description: "", category: "facilities", owner_id: null, owner_label: "Site manager",
    business_importance: "high", consequence_level: 4, consequence_description: "", status: "active", review_date: null, ...stamp, ...over,
  };
}
function risk(n: number, over: Partial<Risk> = {}): Risk {
  return {
    id: uuid(200 + n), workspace_id: W, assessment_id: null, title: `Risk ${n}`, description: "", affected_assets: "", likelihood: 3, consequence: 4,
    uncertainty: "", status: "proposed", decision_rationale: "", accepted_by: null, accepted_at: null, owner_id: U, threat_scenario: "", source_kind: "programme", ...stamp, ...over,
  };
}
function action(n: number, over: Partial<Action> = {}): Action {
  return {
    id: uuid(300 + n), workspace_id: W, assessment_id: null, risk_id: null, title: `Action ${n}`, description: "", assignee_user_id: U, priority: "medium",
    due_date: "2026-12-01", status: "open", decision_rationale: "", completion_evidence: "", closed_by: null, closed_at: null, gap_id: null, asset_id: null,
    source_kind: "manual", approval_required: false, approval_note: "", ...stamp, ...over,
  };
}
function gap(n: number, over: Partial<Gap> = {}): Gap {
  return {
    id: uuid(400 + n), workspace_id: W, source_kind: "manual", domain: "governance", title: `Gap ${n}`, description: "", evidence_note: "", business_impact: "medium",
    related_asset_id: null, related_risk_id: null, related_assessment_id: null, baseline_id: null, baseline_question_id: null, suggested_action: "", owner_id: null,
    status: "open", resolution_note: "", ...stamp, ...over,
  };
}
function report(over: Partial<ManagementReport> = {}): ManagementReport {
  return {
    id: uuid(500), workspace_id: W, title: "Q3", language: "sv", content_version: "management-report-v1", period_start: null, period_end: null, facts: {},
    computed: {}, narrative: {}, decisions_required: [], status: "approved", approved_by: U, approved_at: "2026-09-15T00:00:00Z", ...stamp, ...over,
  };
}
function facts(over: Partial<ProgrammeFacts> = {}): ProgrammeFacts {
  return {
    today: TODAY, mandate: null, assets: [], riskAssets: [], risks: [], actions: [], gaps: [],
    baseline: { assessment: null, answers: [] }, monitoring: { profileExists: false, requirements: 0, pendingItems: 0 },
    analyses: [], analysisReports: [], managementReports: [], plan: null, ...over,
  };
}
const baselineRow = (market: "global" | "se" = "se", date = "2026-09-01") => ({
  id: uuid(600), workspace_id: W, content_version: BASELINE_VERSION, market, mode: "quick", assessment_date: date, status: "open", completed_at: null, ...stamp,
});
const answerRows = (answers: Record<string, string>) =>
  Object.entries(answers).map(([question_id, answer], index) => ({ id: uuid(700 + index), workspace_id: W, baseline_id: uuid(600), question_id, answer, note: "", ...stamp }));

// ── Content ──────────────────────────────────────────────────────────────────
test("baseline content covers ten domains with 3–4 quick questions each", () => {
  assert.equal(SECURITY_DOMAINS.length, 10);
  for (const domain of SECURITY_DOMAINS) {
    const quick = baselineQuestions("global").filter((q) => q.domain === domain.id && q.quick);
    assert.ok(quick.length >= 3 && quick.length <= 4, `${domain.id} has ${quick.length} quick questions`);
    assert.ok(quick.some((q) => q.level === 2), `${domain.id} quick set reaches Managed`);
  }
  assert.equal(new Set(BASELINE_QUESTIONS.map((q) => q.id)).size, BASELINE_QUESTIONS.length, "ids unique");
  for (const q of BASELINE_QUESTIONS)
    for (const field of [q.text, q.why, q.evidence]) assert.ok(field.sv.trim() && field.en.trim(), `${q.id} bilingual`);
});
test("Swedish market pack adds questions without changing the global base", () => {
  const global = baselineQuestions("global");
  const se = baselineQuestions("se");
  assert.ok(se.length > global.length);
  assert.ok(global.every((q) => se.some((s) => s.id === q.id)));
  assert.ok(se.some((q) => q.id.startsWith("com.se.")));
  assert.ok(!global.some((q) => q.id.startsWith("com.se.")));
});
test("90-day plan is a fixed versioned checklist in three periods", () => {
  assert.equal(PLAN_90_VERSION, "plan-90-v1");
  assert.equal(new Set(PLAN_90_TASKS.map((t) => t.id)).size, PLAN_90_TASKS.length);
  assert.ok(planTasks("d30").length >= 3 && planTasks("d60").length >= 3 && planTasks("d90").length >= 3);
});

// ── Maturity ─────────────────────────────────────────────────────────────────
const quickGov = baselineQuestions("global").filter((q) => q.domain === "governance" && q.quick);
test("maturity: a level needs every question at that level and below answered yes", () => {
  const all = baselineQuestions("global");
  const yesToLevel2 = Object.fromEntries(quickGov.filter((q) => q.level <= 2).map((q) => [q.id, "yes"]));
  const m = computeMaturity(all, answerMap(answerRows(yesToLevel2)), "quick");
  const gov = m.domains.find((d) => d.domain === "governance")!;
  assert.equal(gov.level, 2);
  assert.deepEqual(gov.missingForNextLevel, quickGov.filter((q) => q.level === 3).map((q) => q.id));
  const partly = { ...yesToLevel2, [quickGov.find((q) => q.level === 2)!.id]: "partly" };
  assert.equal(computeMaturity(all, answerMap(answerRows(partly)), "quick").domains.find((d) => d.domain === "governance")!.level, 1, "partly stops the ladder");
  const allYes = Object.fromEntries(quickGov.map((q) => [q.id, "yes"]));
  assert.equal(computeMaturity(all, answerMap(answerRows(allYes)), "quick").domains.find((d) => d.domain === "governance")!.level, 3, "the quick set asks nothing at level 4, so Optimised is unreachable from it");
  const detailedYes = Object.fromEntries(all.filter((q) => q.domain === "governance").map((q) => [q.id, "yes"]));
  assert.equal(computeMaturity(all, answerMap(answerRows(detailedYes)), "detailed").domains.find((d) => d.domain === "governance")!.level, 4);
  assert.equal(computeMaturity(all, answerMap(answerRows(allYes)), "detailed").domains.find((d) => d.domain === "governance")!.level, 1, "detailed scope needs the detailed questions too");
});
test("maturity: not applicable removes a question; unanswered domains are not assessed; overall is the lowest assessed domain", () => {
  const all = baselineQuestions("global");
  const answers: Record<string, string> = {};
  for (const q of quickGov) answers[q.id] = q.level === 3 ? "not_applicable" : "yes";
  const m = computeMaturity(all, answerMap(answerRows(answers)), "quick");
  assert.equal(m.domains.find((d) => d.domain === "governance")!.level, 2, "N/A on the only level-3 question: level 2 stands, level 3 is not granted by default");
  assert.ok(m.domains.find((d) => d.domain === "physical")!.notAssessed);
  assert.equal(m.overall, 2, "only assessed domains count");
  assert.equal(computeMaturity(all, {}, "quick").overall, 1);
  assert.ok(computeMaturity(all, {}, "quick").overallNotAssessed);
});

// ── Gaps ─────────────────────────────────────────────────────────────────────
test("gaps: no/partly answers become potential gaps, never actions, and recorded ones are not repeated", () => {
  const all = baselineQuestions("global");
  const answers = answerMap(answerRows({ "gov.mandate": "no", "gov.policy": "partly", "gov.review": "yes", "per.access": "no" }));
  const potential = potentialGapsFromBaseline(all, answers, [], uuid(600));
  assert.deepEqual(potential.map((g) => [g.questionId, g.suggestedImpact]), [["gov.mandate", "high"], ["gov.policy", "medium"], ["per.access", "high"]]);
  const recorded = [gap(1, { baseline_id: uuid(600), baseline_question_id: "gov.mandate", source_kind: "baseline" })];
  assert.deepEqual(potentialGapsFromBaseline(all, answers, recorded, uuid(600)).map((g) => g.questionId), ["gov.policy", "per.access"]);
});

// ── Programme status ─────────────────────────────────────────────────────────
test("programme status: an empty workspace is not started everywhere", () => {
  assert.deepEqual(programmeStatus(facts()), { mandate: "not_started", assets: "not_started", risks: "not_started", baseline: "not_started", actions: "not_started", reporting: "not_started" });
});
test("programme status: mandate in progress until mission, reporting line and risk acceptance exist; attention when review date passed", () => {
  assert.equal(programmeStatus(facts({ mandate: mandate({ risk_acceptance_authority: "" }) })).mandate, "in_progress");
  assert.equal(programmeStatus(facts({ mandate: mandate() })).mandate, "complete");
  assert.equal(programmeStatus(facts({ mandate: mandate({ review_date: "2026-01-01" }) })).mandate, "needs_attention");
});
test("programme status: assets need owner and consequence; fewer than three is in progress", () => {
  assert.equal(programmeStatus(facts({ assets: [asset(1, { owner_label: "" })] })).assets, "needs_attention");
  assert.equal(programmeStatus(facts({ assets: [asset(1, { consequence_level: null })] })).assets, "needs_attention");
  assert.equal(programmeStatus(facts({ assets: [asset(1)] })).assets, "in_progress");
  assert.equal(programmeStatus(facts({ assets: [asset(1), asset(2), asset(3)] })).assets, "complete");
  assert.equal(programmeStatus(facts({ assets: [asset(1), asset(2), asset(3, { status: "retired", owner_label: "" })] })).assets, "in_progress", "retired assets are ignored");
});
test("programme status: risks need owner, rating and (when assets exist) an asset link; complete once a risk is accepted", () => {
  assert.equal(programmeStatus(facts({ risks: [risk(1, { owner_id: null })] })).risks, "needs_attention");
  assert.equal(programmeStatus(facts({ risks: [risk(1, { likelihood: null })] })).risks, "needs_attention");
  assert.equal(programmeStatus(facts({ risks: [risk(1)] })).risks, "in_progress", "no assets yet: a missing link is not an attention item");
  const withAssets = facts({ assets: [asset(1)], risks: [risk(1)] });
  assert.equal(programmeStatus(withAssets).risks, "needs_attention");
  const linked = facts({ assets: [asset(1)], risks: [risk(1, { status: "accepted" })], riskAssets: [{ id: uuid(900), workspace_id: W, risk_id: uuid(201), asset_id: uuid(101), created_at: "", created_by: U }] });
  assert.equal(programmeStatus(linked).risks, "complete");
  assert.equal(programmeStatus(facts({ risks: [risk(1, { status: "closed", owner_id: null })] })).risks, "in_progress", "closed risks are not open items");
});
test("programme status: legacy analysis risks and actions keep working without assets or owners being required of the analysis", () => {
  const legacy = facts({ risks: [risk(1, { assessment_id: uuid(50), owner_id: null, source_kind: "analysis" })], actions: [action(1, { assessment_id: uuid(50), source_kind: "analysis" })] });
  const status = programmeStatus(legacy);
  assert.equal(status.risks, "needs_attention", "an analysis risk without an owner is surfaced, not hidden");
  assert.equal(status.actions, "in_progress");
  assert.ok(attentionItems(legacy).some((item) => item.id === "risks_without_owner"));
});
test("programme status: baseline progress and staleness", () => {
  const partial = facts({ baseline: { assessment: baselineRow(), answers: answerRows({ "gov.mandate": "yes" }) } });
  assert.equal(programmeStatus(partial).baseline, "in_progress");
  const quickAll = Object.fromEntries(baselineQuestions("se").filter((q) => q.quick).map((q) => [q.id, "yes"]));
  assert.equal(programmeStatus(facts({ baseline: { assessment: baselineRow(), answers: answerRows(quickAll) } })).baseline, "complete");
  assert.equal(programmeStatus(facts({ baseline: { assessment: baselineRow("se", "2025-01-01"), answers: answerRows(quickAll) } })).baseline, "needs_attention");
  assert.equal(programmeStatus(facts({ baseline: { assessment: baselineRow(), answers: [] } })).baseline, "not_started");
});
test("programme status: actions & governance", () => {
  assert.equal(programmeStatus(facts({ actions: [action(1, { due_date: "2026-01-01" })] })).actions, "needs_attention");
  assert.equal(programmeStatus(facts({ gaps: [gap(1, { business_impact: "high" })] })).actions, "needs_attention");
  assert.equal(programmeStatus(facts({ gaps: [gap(1)] })).actions, "in_progress");
  assert.equal(programmeStatus(facts({ gaps: [gap(1)], actions: [action(1, { gap_id: uuid(401), status: "completed" })] })).actions, "complete");
  assert.equal(programmeStatus(facts({ gaps: [gap(1, { business_impact: "high" })], actions: [action(1, { gap_id: uuid(401), status: "cancelled" })] })).actions, "needs_attention", "a cancelled action does not address a gap");
});
test("programme status: monitoring & reporting", () => {
  assert.equal(programmeStatus(facts({ monitoring: { profileExists: true, requirements: 1, pendingItems: 0 } })).reporting, "in_progress");
  assert.equal(programmeStatus(facts({ monitoring: { profileExists: true, requirements: 1, pendingItems: 2 } })).reporting, "needs_attention");
  assert.equal(programmeStatus(facts({ managementReports: [report()] })).reporting, "complete");
  assert.equal(programmeStatus(facts({ managementReports: [report({ status: "draft", approved_at: null, approved_by: null })] })).reporting, "needs_attention");
  assert.equal(programmeStatus(facts({ risks: [risk(1)], managementReports: [report({ approved_at: "2026-01-01T00:00:00Z" })] })).reporting, "needs_attention", "a stale report on a live programme needs attention");
});

// ── Attention ────────────────────────────────────────────────────────────────
test("attention items are counted, actionable and ordered by severity", () => {
  const items = attentionItems(facts({
    risks: [risk(1, { owner_id: null }), risk(2, { owner_id: null })],
    actions: [action(1, { due_date: "2026-01-01" }), action(2, { priority: "urgent" })],
    assets: [asset(1, { owner_label: "" })],
    gaps: [gap(1, { business_impact: "high" }), gap(2)],
    monitoring: { profileExists: true, requirements: 1, pendingItems: 3 },
  }));
  assert.deepEqual(items.slice(0, 3).map((i) => [i.id, i.count]), [["overdue_actions", 1], ["high_impact_gaps", 1], ["risks_without_owner", 2]]);
  assert.ok(items.every((i) => i.count > 0 && i.area));
  assert.ok(items.some((i) => i.id === "monitoring_pending" && i.count === 3));
  assert.ok(items.some((i) => i.id === "gaps_without_action" && i.count === 1), "high-impact gaps are not double counted");
  assert.ok(items.some((i) => i.id === "high_priority_actions" && i.count === 1), "overdue actions are not double counted as high priority");
  assert.deepEqual(attentionItems(facts()), []);
});

// ── Next action ──────────────────────────────────────────────────────────────
test("next action follows the programme, explains prerequisites and never blocks", () => {
  assert.equal(recommendedNextAction(facts()).id, "create_mandate");
  assert.equal(recommendedNextAction(facts({ mandate: mandate({ reporting_line: "" }) })).id, "complete_mandate");
  assert.equal(recommendedNextAction(facts({ mandate: mandate() })).id, "add_assets");
  const risksFirst = recommendedNextAction(facts({ mandate: mandate(), risks: [risk(1)] }));
  assert.equal(risksFirst.id, "assets_before_risks");
  assert.equal(risksFirst.prerequisite, "assets");
  assert.equal(recommendedNextAction(facts({ mandate: mandate(), assets: [asset(1)], risks: [risk(1)] })).id, "link_assets_to_risks");
  assert.equal(recommendedNextAction(facts({ mandate: mandate(), assets: [asset(1)] })).id, "quick_baseline");
  assert.equal(recommendedNextAction(facts({ mandate: mandate(), actions: [action(1, { due_date: "2026-01-01" })] })).id, "clear_overdue", "overdue work outranks everything");
  const quickAll = Object.fromEntries(baselineQuestions("se").filter((q) => q.quick).map((q) => [q.id, "yes"]));
  const complete = facts({
    mandate: mandate(), assets: [asset(1)], risks: [risk(1, { status: "accepted" })],
    riskAssets: [{ id: uuid(900), workspace_id: W, risk_id: uuid(201), asset_id: uuid(101), created_at: "", created_by: U }],
    baseline: { assessment: baselineRow(), answers: answerRows(quickAll) }, managementReports: [report()],
  });
  assert.equal(recommendedNextAction(complete).id, "all_clear");
  assert.equal(recommendedNextAction({ ...complete, managementReports: [] }).id, "first_management_report");
  const withGap = { ...complete, baseline: { assessment: baselineRow(), answers: answerRows({ ...quickAll, "gov.policy": "no" }) } };
  assert.equal(recommendedNextAction(withGap).id, "record_gaps");
  assert.equal(recommendedNextAction({ ...withGap, gaps: [gap(1, { baseline_id: uuid(600), baseline_question_id: "gov.policy" })] }).id, "convert_gaps");
});

// ── Management report ────────────────────────────────────────────────────────
test("management report separates facts, system-calculated values and narrative; AI never supplies the numbers", () => {
  const data = buildManagementReportData(facts({
    mandate: mandate(), assets: [asset(1)], risks: [risk(1, { likelihood: 5, consequence: 5 }), risk(2, { likelihood: 1, consequence: 1 })],
    actions: [action(1, { due_date: "2026-01-01", priority: "high" })], gaps: [gap(1, { business_impact: "high" })],
  }), report({ computed: { maturity: { overall: 1, not_assessed: false }, counts: { open_risks: 1, overdue_actions: 0 } } as never }));
  assert.equal(data.computed.counts.overdue_actions, 1);
  assert.equal(data.computed.top_risks[0].id, uuid(201));
  assert.equal(data.computed.changes_since_previous.open_risks_delta, 1);
  assert.equal(data.computed.changes_since_previous.overdue_actions_delta, 1);
  assert.equal(data.facts.actions[0].overdue, true);
  assert.ok(!("narrative" in data.facts) && !("narrative" in data.computed));
  const lines = computedSummaryLines(data.computed, "en");
  assert.ok(lines.some((line) => line.includes("Overdue") || line.includes("overdue")));
  assert.ok(computedSummaryLines(data.computed, "sv").some((line) => line.includes("försenade")));
});

// ── AI guardrails ────────────────────────────────────────────────────────────
test("assistant capabilities are context-aware and their output shapes carry no decision fields", () => {
  assert.ok(capabilitiesFor("risk").some((c) => c.id === "risk_scenario"));
  assert.ok(!capabilitiesFor("risk").some((c) => c.id === "mandate_draft"));
  assert.ok(capabilitiesFor("baseline_question").every((c) => c.kind === "explanation"), "baseline help never answers the assessment");
  for (const c of CAPABILITIES) assert.ok(c.fallback.sv && c.fallback.en, `${c.id} works without AI`);
  const forbidden = ["likelihood", "consequence", "score", "level", "owner", "status", "accepted", "approved"];
  const samples: [Parameters<typeof parseSuggestionContent>[0], unknown][] = [
    ["risk_scenario", { threat_scenario: "x", description: "y", missing_information: [], questions: [], likelihood: 5 }],
    ["asset_suggestions", { assets: [{ name: "a", category: "people", reason: "r", owner: "me" }] }],
    ["gap_action", { actions: [{ title: "t", description: "d", why: "w", status: "completed" }] }],
    ["mandate_draft", { text: "t", caveats: [], approved: true }],
  ];
  for (const [kind, value] of samples) assert.equal(parseSuggestionContent(kind, value).success, false, `${kind} rejects decision fields`);
  assert.ok(parseSuggestionContent("risk_scenario", { threat_scenario: "x", description: "y", missing_information: ["z"], questions: [] }).success);
  assert.ok(forbidden.every((word) => !JSON.stringify(Object.keys(parseSuggestionContent("asset_suggestions", { assets: [{ name: "a", category: "people", reason: "r" }] }).success ? {} : {})).includes(word)));
});

// ── Localisation ─────────────────────────────────────────────────────────────
test("every Security Work copy key exists in both Swedish and English, and programme keys are present", () => {
  const sv = Object.keys(securityWorkSv);
  const en = Object.keys(securityWorkEn);
  assert.deepEqual(sv.sort(), en.sort());
  for (const key of sv) {
    assert.ok((securityWorkSv as Record<string, string>)[key].trim(), `${key} sv`);
    assert.ok((securityWorkEn as Record<string, string>)[key].trim(), `${key} en`);
  }
  for (const key of ["sw.prog.nav.mandate", "sw.prog.nav.assets", "sw.prog.nav.baseline", "sw.prog.nav.gaps", "sw.prog.area.mandate", "sw.prog.status.needs_attention", "sw.prog.attention.overdue_actions", "sw.prog.next.create_mandate", "sw.prog.ai.unavailable"])
    assert.ok(key in securityWorkSv, `${key} defined`);
});

console.log(`PASS: ${checks} Security Work programme checks (content, maturity, gaps, status, attention, next action, report, AI guardrails, localisation)`);
