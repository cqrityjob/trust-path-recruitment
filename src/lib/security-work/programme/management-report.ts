import { z } from "zod";
import { domainTitle } from "./content/baseline-v1";
import { deriveProgramme, programmeStatus } from "./rules";
import type { Lang, ManagementReport, ProgrammeFacts } from "./types";

export const MANAGEMENT_REPORT_VERSION = "management-report-v1";

/** Sections of the narrative. FACTS and SYSTEM-CALCULATED values are stored
 * apart from these; every narrative section records whether a human or AI
 * wrote it, and AI text only arrives here after an approved suggestion. */
export const REPORT_SECTIONS = [
  "executive_position",
  "major_risks",
  "changes_since_previous",
  "priority_actions",
  "overdue_actions",
  "incidents",
  "maturity_changes",
  "external_developments",
  "decisions_required",
] as const;
export type ReportSectionId = (typeof REPORT_SECTIONS)[number];
export const REPORT_SECTION_TITLES: Record<ReportSectionId, { sv: string; en: string }> = {
  executive_position: { sv: "Säkerhetsläget i korthet", en: "Executive security position" },
  major_risks: { sv: "Största risker", en: "Major risks" },
  changes_since_previous: { sv: "Förändringar sedan förra rapporten", en: "Key changes since previous report" },
  priority_actions: { sv: "Prioriterade åtgärder", en: "High-priority actions" },
  overdue_actions: { sv: "Försenade åtgärder", en: "Overdue actions" },
  incidents: { sv: "Incidenter", en: "Incidents" },
  maturity_changes: { sv: "Förändringar i säkerhetsmognad", en: "Security maturity changes" },
  external_developments: { sv: "Omvärld", en: "External developments" },
  decisions_required: { sv: "Beslut som krävs av ledningen", en: "Decisions required from management" },
};
export const narrativeSectionSchema = z
  .object({
    text: z.string().max(16000),
    origin: z.enum(["user", "ai"]),
    suggestion_id: z.string().uuid().optional(),
  })
  .strict();
export const narrativeSchema = z.record(z.enum(REPORT_SECTIONS), narrativeSectionSchema);
export const decisionSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(500),
    rationale: z.string().max(4000),
    status: z.enum(["open", "decided"]),
  })
  .strict();
export type ReportNarrative = z.infer<typeof narrativeSchema>;
export type ReportDecision = z.infer<typeof decisionSchema>;

/** FACTS: frozen copies of the records the report is about. */
export type ReportFacts = {
  generated_at: string;
  risks: {
    id: string;
    title: string;
    status: string;
    owner: boolean;
    likelihood: number | null;
    consequence: number | null;
    assets: string[];
  }[];
  actions: {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    owner: boolean;
    overdue: boolean;
    approval_required: boolean;
  }[];
  gaps: { id: string; title: string; domain: string | null; impact: string; status: string }[];
  assets: { id: string; name: string; category: string; owner: boolean; consequence: number | null }[];
  mandate: { mission: string; review_date: string | null } | null;
  monitoring: { pending_items: number; requirements: number };
  previous_report: { id: string; approved_at: string | null; computed: unknown } | null;
};
/** SYSTEM-CALCULATED: deterministic values from the rules. */
export type ReportComputed = {
  programme_status: Record<string, string>;
  maturity: {
    scope: "quick" | "detailed";
    overall: number;
    not_assessed: boolean;
    domains: { domain: string; level: number; not_assessed: boolean }[];
  };
  counts: {
    open_risks: number;
    accepted_risks: number;
    risks_without_owner: number;
    open_actions: number;
    overdue_actions: number;
    high_priority_actions: number;
    open_gaps: number;
    gaps_without_action: number;
    high_impact_gaps: number;
    active_assets: number;
  };
  top_risks: { id: string; title: string; score: number | null }[];
  changes_since_previous: {
    maturity_delta: number | null;
    open_risks_delta: number | null;
    overdue_actions_delta: number | null;
  };
};

export function buildManagementReportData(
  facts: ProgrammeFacts,
  previous: ManagementReport | null,
): { facts: ReportFacts; computed: ReportComputed } {
  const d = deriveProgramme(facts);
  const status = programmeStatus(facts);
  const assetNames = new Map(facts.assets.map((asset) => [asset.id, asset.name]));
  const linksByRisk = new Map<string, string[]>();
  for (const link of facts.riskAssets) {
    const names = linksByRisk.get(link.risk_id) ?? [];
    names.push(assetNames.get(link.asset_id) ?? "");
    linksByRisk.set(link.risk_id, names);
  }
  const maturity = d.quickAnswered >= d.quickTotal && d.detailed.answered > d.quick.answered ? d.detailed : d.quick;
  const previousComputed = previous ? (previous.computed as Partial<ReportComputed>) : null;
  const score = (risk: { likelihood: number | null; consequence: number | null }) =>
    risk.likelihood !== null && risk.consequence !== null ? risk.likelihood * risk.consequence : null;
  const topRisks = d.openRisks
    .map((risk) => ({ id: risk.id, title: risk.title, score: score(risk) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 5);
  const computed: ReportComputed = {
    programme_status: status,
    maturity: {
      scope: maturity.scope,
      overall: maturity.overall,
      not_assessed: maturity.overallNotAssessed,
      domains: maturity.domains.map((domain) => ({
        domain: domain.domain,
        level: domain.level,
        not_assessed: domain.notAssessed,
      })),
    },
    counts: {
      open_risks: d.openRisks.length,
      accepted_risks: facts.risks.filter((risk) => risk.status === "accepted").length,
      risks_without_owner: d.risksWithoutOwner.length,
      open_actions: d.openActions.length,
      overdue_actions: d.overdueActions.length,
      high_priority_actions: d.highPriorityActions.length,
      open_gaps: d.openGaps.length,
      gaps_without_action: d.gapsWithoutAction.length,
      high_impact_gaps: d.highImpactGapsWithoutAction.length,
      active_assets: d.activeAssets.length,
    },
    top_risks: topRisks,
    changes_since_previous: {
      maturity_delta:
        previousComputed?.maturity && !previousComputed.maturity.not_assessed && !maturity.overallNotAssessed
          ? maturity.overall - previousComputed.maturity.overall
          : null,
      open_risks_delta:
        previousComputed?.counts ? d.openRisks.length - previousComputed.counts.open_risks : null,
      overdue_actions_delta:
        previousComputed?.counts ? d.overdueActions.length - previousComputed.counts.overdue_actions : null,
    },
  };
  const reportFacts: ReportFacts = {
    generated_at: new Date().toISOString(),
    risks: facts.risks
      .filter((risk) => risk.status !== "closed")
      .map((risk) => ({
        id: risk.id,
        title: risk.title,
        status: risk.status,
        owner: Boolean(risk.owner_id),
        likelihood: risk.likelihood,
        consequence: risk.consequence,
        assets: linksByRisk.get(risk.id) ?? [],
      })),
    actions: d.openActions.map((action) => ({
      id: action.id,
      title: action.title,
      status: action.status,
      priority: action.priority,
      due_date: action.due_date,
      owner: Boolean(action.assignee_user_id),
      overdue: d.overdueActions.includes(action),
      approval_required: action.approval_required,
    })),
    gaps: d.openGaps.map((gap) => ({
      id: gap.id,
      title: gap.title,
      domain: gap.domain,
      impact: gap.business_impact,
      status: gap.status,
    })),
    assets: d.activeAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      owner: Boolean(asset.owner_id) || asset.owner_label.trim() !== "",
      consequence: asset.consequence_level,
    })),
    mandate: facts.mandate
      ? { mission: facts.mandate.security_mission, review_date: facts.mandate.review_date }
      : null,
    monitoring: {
      pending_items: facts.monitoring.pendingItems,
      requirements: facts.monitoring.requirements,
    },
    previous_report: previous
      ? { id: previous.id, approved_at: previous.approved_at, computed: previous.computed }
      : null,
  };
  return { facts: reportFacts, computed };
}

/** Plain-language lines the UI shows under SYSTEM-CALCULATED. No prose is
 * invented: every line is a number or a name from the facts. */
export function computedSummaryLines(computed: ReportComputed, lang: Lang): string[] {
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const level = computed.maturity.not_assessed
    ? t("inte bedömd", "not assessed")
    : String(computed.maturity.overall);
  const lines = [
    `${t("Säkerhetsmognad (lägsta område)", "Security maturity (lowest domain)")}: ${level}/4 (${computed.maturity.scope === "quick" ? t("snabbt nuläge", "quick baseline") : t("fördjupad genomgång", "detailed review")})`,
    `${t("Öppna risker", "Open risks")}: ${computed.counts.open_risks} · ${t("utan ägare", "without owner")}: ${computed.counts.risks_without_owner}`,
    `${t("Öppna åtgärder", "Open actions")}: ${computed.counts.open_actions} · ${t("försenade", "overdue")}: ${computed.counts.overdue_actions} · ${t("hög prioritet", "high priority")}: ${computed.counts.high_priority_actions}`,
    `${t("Öppna gap", "Open gaps")}: ${computed.counts.open_gaps} · ${t("utan åtgärd", "without action")}: ${computed.counts.gaps_without_action}`,
  ];
  const weakest = computed.maturity.domains
    .filter((domain) => !domain.not_assessed)
    .sort((a, b) => a.level - b.level)
    .slice(0, 3)
    .map((domain) => `${domainTitle(domain.domain as never)[lang]} (${domain.level})`);
  if (weakest.length) lines.push(`${t("Svagaste områden", "Weakest domains")}: ${weakest.join(", ")}`);
  const delta = computed.changes_since_previous;
  if (delta.maturity_delta !== null || delta.open_risks_delta !== null)
    lines.push(
      `${t("Sedan förra rapporten", "Since previous report")}: ${t("mognad", "maturity")} ${fmt(delta.maturity_delta)}, ${t("öppna risker", "open risks")} ${fmt(delta.open_risks_delta)}, ${t("försenade åtgärder", "overdue actions")} ${fmt(delta.overdue_actions_delta)}`,
    );
  return lines;
}
function fmt(value: number | null) {
  if (value === null) return "–";
  return value > 0 ? `+${value}` : String(value);
}
