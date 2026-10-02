import { baselineQuestions } from "./content/baseline-v1";
import { gapHasAction, gapIsOpen } from "./gaps";
import { answerMap, computeMaturity } from "./maturity";
import type {
  Action,
  Market,
  ProgrammeAreaId,
  ProgrammeAreaStatus,
  ProgrammeFacts,
  ProtectedAsset,
  Risk,
} from "./types";

export const PROGRAMME_AREAS: ProgrammeAreaId[] = [
  "mandate",
  "assets",
  "risks",
  "baseline",
  "actions",
  "reporting",
];
export const OPEN_ACTION_STATUSES = ["open", "in_progress", "blocked"] as const;
export const OPEN_RISK_STATUSES = ["proposed", "accepted"] as const;
const REPORT_FRESH_DAYS = 90;
const BASELINE_FRESH_DAYS = 365;

export function isOpenAction(action: Pick<Action, "status">) {
  return (OPEN_ACTION_STATUSES as readonly string[]).includes(action.status);
}
export function isOpenRisk(risk: Pick<Risk, "status">) {
  return (OPEN_RISK_STATUSES as readonly string[]).includes(risk.status);
}
export function isOverdue(action: Pick<Action, "status" | "due_date">, today: string) {
  return isOpenAction(action) && Boolean(action.due_date) && (action.due_date as string) < today;
}
export function assetHasOwner(asset: Pick<ProtectedAsset, "owner_id" | "owner_label">) {
  return Boolean(asset.owner_id) || asset.owner_label.trim() !== "";
}
export function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
export function mandateComplete(mandate: ProgrammeFacts["mandate"]) {
  return Boolean(
    mandate &&
    mandate.security_mission.trim() &&
    mandate.reporting_line.trim() &&
    mandate.risk_acceptance_authority.trim(),
  );
}

/** Derived facts every rule shares. Computed once per snapshot. */
export function deriveProgramme(facts: ProgrammeFacts) {
  const today = facts.today;
  const activeAssets = facts.assets.filter((asset) => asset.status === "active");
  const assetsWithoutOwner = activeAssets.filter((asset) => !assetHasOwner(asset));
  const assetsWithoutConsequence = activeAssets.filter((asset) => asset.consequence_level === null);
  const assetsOverdueReview = activeAssets.filter(
    (asset) => asset.review_date !== null && asset.review_date < today,
  );
  const openRisks = facts.risks.filter(isOpenRisk);
  const linkedRiskIds = new Set(facts.riskAssets.map((link) => link.risk_id));
  const risksWithoutOwner = openRisks.filter((risk) => !risk.owner_id);
  const risksWithoutRating = openRisks.filter(
    (risk) => risk.likelihood === null || risk.consequence === null,
  );
  const risksWithoutAsset =
    activeAssets.length > 0 ? openRisks.filter((risk) => !linkedRiskIds.has(risk.id)) : [];
  const openActions = facts.actions.filter(isOpenAction);
  const overdueActions = openActions.filter((action) => isOverdue(action, today));
  const highPriorityActions = openActions.filter((action) =>
    ["high", "urgent"].includes(action.priority),
  );
  const actionsWithoutOwner = openActions.filter((action) => !action.assignee_user_id);
  const openGaps = facts.gaps.filter(gapIsOpen);
  const gapsWithoutAction = openGaps.filter((gap) => !gapHasAction(gap, facts.actions));
  const highImpactGapsWithoutAction = gapsWithoutAction.filter(
    (gap) => gap.business_impact === "high",
  );
  const market = (facts.baseline.assessment?.market ?? "global") as Market;
  const questions = baselineQuestions(market);
  const answers = answerMap(facts.baseline.answers);
  const quick = computeMaturity(questions, answers, "quick");
  const detailed = computeMaturity(questions, answers, "detailed");
  const quickTotal = questions.filter((question) => question.quick).length;
  const quickAnswered = questions.filter(
    (question) => question.quick && answers[question.id] !== undefined,
  ).length;
  const baselineStale =
    facts.baseline.assessment !== null &&
    daysBetween(facts.baseline.assessment.assessment_date, today) > BASELINE_FRESH_DAYS;
  const mandateOverdue =
    facts.mandate?.review_date !== null &&
    facts.mandate?.review_date !== undefined &&
    facts.mandate.review_date < today;
  const approvedManagementReports = facts.managementReports.filter(
    (report) => report.status === "approved",
  );
  const latestApprovedReport = approvedManagementReports
    .slice()
    .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""))[0];
  const reportStale =
    !latestApprovedReport ||
    daysBetween((latestApprovedReport.approved_at ?? "").slice(0, 10), today) > REPORT_FRESH_DAYS;
  const draftManagementReports = facts.managementReports.filter(
    (report) => report.status === "draft",
  );
  const analysesInReview = facts.analyses.filter((analysis) => analysis.status === "in_review");
  const draftAnalysisReports = facts.analysisReports.filter((report) => report.status === "draft");
  return {
    today,
    activeAssets,
    assetsWithoutOwner,
    assetsWithoutConsequence,
    assetsOverdueReview,
    openRisks,
    risksWithoutOwner,
    risksWithoutRating,
    risksWithoutAsset,
    openActions,
    overdueActions,
    highPriorityActions,
    actionsWithoutOwner,
    openGaps,
    gapsWithoutAction,
    highImpactGapsWithoutAction,
    market,
    questions,
    answers,
    quick,
    detailed,
    quickTotal,
    quickAnswered,
    baselineStale,
    mandateOverdue,
    reportStale,
    latestApprovedReport: latestApprovedReport ?? null,
    draftManagementReports,
    analysesInReview,
    draftAnalysisReports,
  };
}
export type DerivedProgramme = ReturnType<typeof deriveProgramme>;

/**
 * Programme status per area. Deterministic, never AI-derived.
 *
 *  mandate    not_started: no mandate row · needs_attention: review date passed
 *             · in_progress: mission, reporting line or risk-acceptance missing
 *             · complete otherwise
 *  assets     not_started: no active asset · needs_attention: an active asset
 *             lacks an owner or a consequence level, or is overdue for review
 *             · in_progress: fewer than three active assets · complete otherwise
 *  risks      not_started: no risk · needs_attention: an open risk lacks an
 *             owner or a rating, or (when assets exist) a linked asset
 *             · in_progress: no risk accepted yet · complete otherwise
 *  baseline   not_started: no baseline or no answer · needs_attention:
 *             assessment older than a year · in_progress: quick questions not
 *             all answered · complete otherwise
 *  actions    not_started: no gap and no action · needs_attention: an overdue
 *             action, or a high-impact open gap without an action
 *             · in_progress: an open gap without an action, or an open action
 *             · complete otherwise
 *  reporting  not_started: no monitoring profile, no requirement and no report
 *             · needs_attention: monitoring items await assessment, a
 *             management report draft awaits approval, or no approved report
 *             in 90 days while the programme has content · in_progress:
 *             monitoring set up but no approved management report · complete
 */
export function programmeStatus(
  facts: ProgrammeFacts,
): Record<ProgrammeAreaId, ProgrammeAreaStatus> {
  const d = deriveProgramme(facts);
  const mandate: ProgrammeAreaStatus = !facts.mandate
    ? "not_started"
    : d.mandateOverdue
      ? "needs_attention"
      : mandateComplete(facts.mandate)
        ? "complete"
        : "in_progress";
  const assets: ProgrammeAreaStatus =
    d.activeAssets.length === 0
      ? "not_started"
      : d.assetsWithoutOwner.length ||
          d.assetsWithoutConsequence.length ||
          d.assetsOverdueReview.length
        ? "needs_attention"
        : d.activeAssets.length < 3
          ? "in_progress"
          : "complete";
  const risks: ProgrammeAreaStatus =
    facts.risks.length === 0
      ? "not_started"
      : d.risksWithoutOwner.length || d.risksWithoutRating.length || d.risksWithoutAsset.length
        ? "needs_attention"
        : d.openRisks.some((risk) => risk.status === "accepted")
          ? "complete"
          : "in_progress";
  const baseline: ProgrammeAreaStatus =
    !facts.baseline.assessment || facts.baseline.answers.length === 0
      ? "not_started"
      : d.baselineStale
        ? "needs_attention"
        : d.quickAnswered < d.quickTotal
          ? "in_progress"
          : "complete";
  const actions: ProgrammeAreaStatus =
    facts.gaps.length === 0 && facts.actions.length === 0
      ? "not_started"
      : d.overdueActions.length || d.highImpactGapsWithoutAction.length
        ? "needs_attention"
        : d.gapsWithoutAction.length || d.openActions.length
          ? "in_progress"
          : "complete";
  const programmeHasContent =
    facts.risks.length > 0 || facts.actions.length > 0 || facts.gaps.length > 0;
  const reporting: ProgrammeAreaStatus =
    !facts.monitoring.profileExists &&
    facts.monitoring.requirements === 0 &&
    facts.managementReports.length === 0 &&
    facts.analysisReports.length === 0
      ? "not_started"
      : facts.monitoring.pendingItems > 0 ||
          d.draftManagementReports.length > 0 ||
          (programmeHasContent && d.reportStale && facts.managementReports.length > 0)
        ? "needs_attention"
        : d.latestApprovedReport && !d.reportStale
          ? "complete"
          : "in_progress";
  return { mandate, assets, risks, baseline, actions, reporting };
}

export type AttentionItem = {
  id:
    | "risks_without_owner"
    | "risks_without_rating"
    | "risks_without_asset"
    | "overdue_actions"
    | "high_priority_actions"
    | "actions_without_owner"
    | "assets_without_owner"
    | "assets_without_consequence"
    | "assets_review_overdue"
    | "baseline_unanswered"
    | "baseline_stale"
    | "gaps_without_action"
    | "high_impact_gaps"
    | "reports_awaiting_approval"
    | "analyses_in_review"
    | "mandate_review_overdue"
    | "monitoring_pending";
  count: number;
  severity: "high" | "medium" | "low";
  area: ProgrammeAreaId;
};

/** Every item is actionable and carries a count. Ordered by severity, then
 * by operational urgency, so the first card is always the one to act on. */
export function attentionItems(facts: ProgrammeFacts): AttentionItem[] {
  const d = deriveProgramme(facts);
  const items: AttentionItem[] = [];
  const push = (item: Omit<AttentionItem, "count"> & { count: number }) => {
    if (item.count > 0) items.push(item);
  };
  push({
    id: "overdue_actions",
    count: d.overdueActions.length,
    severity: "high",
    area: "actions",
  });
  push({
    id: "high_impact_gaps",
    count: d.highImpactGapsWithoutAction.length,
    severity: "high",
    area: "actions",
  });
  push({
    id: "risks_without_owner",
    count: d.risksWithoutOwner.length,
    severity: "high",
    area: "risks",
  });
  push({
    id: "reports_awaiting_approval",
    count: d.draftManagementReports.length,
    severity: "medium",
    area: "reporting",
  });
  push({
    id: "monitoring_pending",
    count: facts.monitoring.pendingItems,
    severity: "medium",
    area: "reporting",
  });
  push({
    id: "analyses_in_review",
    count: d.analysesInReview.length,
    severity: "medium",
    area: "reporting",
  });
  push({
    id: "risks_without_rating",
    count: d.risksWithoutRating.length,
    severity: "medium",
    area: "risks",
  });
  push({
    id: "risks_without_asset",
    count: d.risksWithoutAsset.length,
    severity: "medium",
    area: "risks",
  });
  push({
    id: "assets_without_owner",
    count: d.assetsWithoutOwner.length,
    severity: "medium",
    area: "assets",
  });
  push({
    id: "assets_without_consequence",
    count: d.assetsWithoutConsequence.length,
    severity: "medium",
    area: "assets",
  });
  push({
    id: "high_priority_actions",
    count: d.highPriorityActions.filter((a) => !d.overdueActions.includes(a)).length,
    severity: "medium",
    area: "actions",
  });
  push({
    id: "actions_without_owner",
    count: d.actionsWithoutOwner.length,
    severity: "medium",
    area: "actions",
  });
  push({
    id: "gaps_without_action",
    count: d.gapsWithoutAction.length - d.highImpactGapsWithoutAction.length,
    severity: "low",
    area: "actions",
  });
  push({
    id: "baseline_unanswered",
    count:
      facts.baseline.assessment && facts.baseline.answers.length
        ? d.quickTotal - d.quickAnswered
        : 0,
    severity: "low",
    area: "baseline",
  });
  push({ id: "baseline_stale", count: d.baselineStale ? 1 : 0, severity: "low", area: "baseline" });
  push({
    id: "mandate_review_overdue",
    count: d.mandateOverdue ? 1 : 0,
    severity: "low",
    area: "mandate",
  });
  push({
    id: "assets_review_overdue",
    count: d.assetsOverdueReview.length,
    severity: "low",
    area: "assets",
  });
  // Stable sort: within a severity band the push order above is the order
  // (overdue work before unowned risks before unrated risks …).
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type NextAction = {
  id:
    | "create_mandate"
    | "complete_mandate"
    | "add_assets"
    | "assets_before_risks"
    | "link_assets_to_risks"
    | "assign_risk_owners"
    | "rate_risks"
    | "create_risks"
    | "quick_baseline"
    | "finish_quick_baseline"
    | "record_gaps"
    | "convert_gaps"
    | "clear_overdue"
    | "first_management_report"
    | "approve_management_report"
    | "refresh_management_report"
    | "review_mandate"
    | "all_clear";
  area: ProgrammeAreaId;
  /** Prerequisite the user may ignore; shown as information, never a block. */
  prerequisite?: ProgrammeAreaId;
};

/**
 * One recommended next step, from fixed precedence. Prerequisite warnings
 * explain why the recommendation points "backwards" (for example: risks exist
 * but no protected assets), but the user is never blocked from any module.
 */
export function recommendedNextAction(facts: ProgrammeFacts): NextAction {
  const d = deriveProgramme(facts);
  const status = programmeStatus(facts);
  if (d.overdueActions.length) return { id: "clear_overdue", area: "actions" };
  if (!facts.mandate) return { id: "create_mandate", area: "mandate" };
  if (status.mandate === "in_progress") return { id: "complete_mandate", area: "mandate" };
  if (d.activeAssets.length === 0)
    return facts.risks.length
      ? { id: "assets_before_risks", area: "assets", prerequisite: "assets" }
      : { id: "add_assets", area: "assets" };
  if (d.risksWithoutAsset.length)
    return { id: "link_assets_to_risks", area: "risks", prerequisite: "assets" };
  if (d.risksWithoutOwner.length) return { id: "assign_risk_owners", area: "risks" };
  if (d.risksWithoutRating.length) return { id: "rate_risks", area: "risks" };
  if (!facts.baseline.assessment || facts.baseline.answers.length === 0)
    return { id: "quick_baseline", area: "baseline" };
  if (d.quickAnswered < d.quickTotal) return { id: "finish_quick_baseline", area: "baseline" };
  if (facts.risks.length === 0) return { id: "create_risks", area: "risks" };
  const potential = d.detailed.domains.reduce((sum, domain) => sum + domain.shortfalls.length, 0);
  const recordedForBaseline = facts.gaps.filter(
    (gap) => gap.baseline_id === facts.baseline.assessment?.id,
  ).length;
  if (potential > recordedForBaseline) return { id: "record_gaps", area: "actions" };
  if (d.gapsWithoutAction.length) return { id: "convert_gaps", area: "actions" };
  if (d.draftManagementReports.length)
    return { id: "approve_management_report", area: "reporting" };
  if (facts.managementReports.length === 0)
    return { id: "first_management_report", area: "reporting" };
  if (d.reportStale) return { id: "refresh_management_report", area: "reporting" };
  if (d.mandateOverdue) return { id: "review_mandate", area: "mandate" };
  return { id: "all_clear", area: "reporting" };
}
