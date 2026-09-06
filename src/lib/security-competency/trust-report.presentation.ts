// TRUST Evidence Report — the presentation model behind the employer page.
//
// Pure functions from the V3 document to what a section renders. Nothing here
// computes a level, a contribution or a score: every number that leaves this
// file is a count that arrived in the document. The three dimensions stay
// three -- a card carries observed_pattern, evidence_sufficiency and
// follow_up_priority side by side and never folds them into one word.

import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  CoreCompetency,
  EmployerArea,
  EvidenceSufficiency,
  FollowUpPriority,
  GuideFocus,
  InterviewAddendum,
  MethodologicalFlag,
  ObservedPattern,
  OverviewLine,
  PlanPriority,
  SelfReportedPattern,
  TrustFollowUp,
  TrustReportDocument,
  VerifyReason,
} from "./trust-report.types";

export type Lang = "sv" | "en";

export const PATTERN_KEY: Record<ObservedPattern, TranslationKey> = {
  clearly_consistent: "report.trust.pattern.clearly_consistent",
  consistent: "report.trust.pattern.consistent",
  mixed: "report.trust.pattern.mixed",
  developing: "report.trust.pattern.developing",
  not_established: "report.trust.pattern.not_established",
};

export const SUFFICIENCY_KEY: Record<EvidenceSufficiency, TranslationKey> = {
  sufficient: "report.trust.sufficiency.sufficient",
  limited: "report.trust.sufficiency.limited",
  none: "report.trust.sufficiency.none",
};

export const PRIORITY_KEY: Record<FollowUpPriority, TranslationKey> = {
  first: "report.trust.priority.first",
  next: "report.trust.priority.next",
  if_time_allows: "report.trust.priority.if_time_allows",
  none: "report.trust.priority.none",
};

export const FLAG_KEY: Record<MethodologicalFlag, TranslationKey> = {
  single_context: "report.trust.flag.single_context",
  single_item: "report.trust.flag.single_item",
  self_report_not_observed: "report.trust.flag.self_report_not_observed",
  descriptive_only: "report.trust.flag.descriptive_only",
  methodologically_open: "report.trust.flag.methodologically_open",
  unvalidated_content: "report.trust.flag.unvalidated_content",
  closed_test: "report.trust.flag.closed_test",
};

export const REASON_KEY: Record<VerifyReason, TranslationKey> = {
  safety_finding: "report.trust.reason.safety_finding",
  developing_pattern: "report.trust.reason.developing_pattern",
  mixed_pattern: "report.trust.reason.mixed_pattern",
  limited_evidence: "report.trust.reason.limited_evidence",
  pending_review: "report.trust.reason.pending_review",
  human_review_adjusted: "report.trust.reason.human_review_adjusted",
};

export const STEP_KEY: Record<
  TrustReportDocument["frozen_report"]["employer"]["primary_next_step"]["step"],
  TranslationKey
> = {
  structured_interview: "report.trust.overview.step.structured_interview",
  additional_assessment: "report.trust.overview.step.additional_assessment",
  request_clarification: "report.trust.overview.step.request_clarification",
  gather_more_evidence: "report.trust.overview.step.gather_more_evidence",
};

export const UNCLEAR_KEY: Record<GuideFocus, TranslationKey> = {
  explore_limited_evidence: "report.trust.plan.unclear.explore_limited_evidence",
  explore_self_report: "report.trust.plan.unclear.explore_self_report",
  explore_development: "report.trust.plan.unclear.explore_development",
  confirm_strength: "report.trust.plan.unclear.confirm_strength",
};

export const SELF_PATTERN_KEY: Record<SelfReportedPattern["pattern"], TranslationKey> = {
  consistently_described: "report.trust.self.pattern.consistently_described",
  mostly_described: "report.trust.self.pattern.mostly_described",
  rarely_described: "report.trust.self.pattern.rarely_described",
  not_described: "report.trust.self.pattern.not_described",
};

export const ADDENDUM_STATUS_KEY: Record<InterviewAddendum["status"], TranslationKey> = {
  supported_in_interview: "report.trust.addenda.status.supported_in_interview",
  not_supported_in_interview: "report.trust.addenda.status.not_supported_in_interview",
  additional_context: "report.trust.addenda.status.additional_context",
};

/** A visual tone for a status word. Never colour alone: every chip that uses
 *  a tone also prints the word, and the tones are chosen to survive
 *  grayscale (established is the darkest, limited the lightest). */
export type Tone = "established" | "attention" | "neutral" | "limited";

export function patternTone(p: ObservedPattern): Tone {
  switch (p) {
    case "clearly_consistent":
    case "consistent":
      return "established";
    case "mixed":
    case "developing":
      return "attention";
    default:
      return "neutral";
  }
}

export function sufficiencyTone(s: EvidenceSufficiency): Tone {
  return s === "sufficient" ? "established" : "limited";
}

export function priorityTone(p: FollowUpPriority): Tone {
  return p === "first" ? "attention" : p === "next" ? "neutral" : "limited";
}

/** One evidence card: the frozen core line and the employer's area, joined
 *  by competency code, with the follow-ups, self-report and live addenda that
 *  belong to the same area. */
export type EvidenceCard = {
  code: string;
  core: CoreCompetency;
  area: EmployerArea | null;
  selfReports: SelfReportedPattern[];
  followUps: TrustFollowUp[];
  addenda: InterviewAddendum[];
};

export function buildEvidenceCards(doc: TrustReportDocument): EvidenceCard[] {
  const { core, employer } = doc.frozen_report;
  const areas = new Map((employer.areas ?? []).map((a) => [a.competency_code, a]));
  const selfByCode = new Map<string, SelfReportedPattern[]>();
  for (const s of core.self_reported_patterns ?? []) {
    selfByCode.set(s.competency_code, [...(selfByCode.get(s.competency_code) ?? []), s]);
  }
  const fuByCode = new Map<string, TrustFollowUp[]>();
  for (const f of employer.trust_followups ?? []) {
    fuByCode.set(f.competency_code, [...(fuByCode.get(f.competency_code) ?? []), f]);
  }
  const addByCode = new Map<string, InterviewAddendum[]>();
  for (const a of doc.addenda_overlay?.items ?? []) {
    addByCode.set(a.competency_code, [...(addByCode.get(a.competency_code) ?? []), a]);
  }
  return (core.competencies ?? []).map((c) => ({
    code: c.competency_code,
    core: c,
    area: areas.get(c.competency_code) ?? null,
    selfReports: selfByCode.get(c.competency_code) ?? [],
    followUps: fuByCode.get(c.competency_code) ?? [],
    addenda: addByCode.get(c.competency_code) ?? [],
  }));
}

/** The thirty-second overview, at most three lines per column, exactly as
 *  the document orders them. No number is attached to a position. */
export function overviewColumns(doc: TrustReportDocument): {
  support: OverviewLine[];
  verify: OverviewLine[];
  limited: OverviewLine[];
} {
  const o = doc.frozen_report.employer.overview;
  return {
    support: (o?.clearest_support ?? []).slice(0, 3),
    verify: (o?.verify_in_interview ?? []).slice(0, 3),
    limited: (o?.limited_evidence ?? []).slice(0, 3),
  };
}

export function planPriorities(doc: TrustReportDocument): PlanPriority[] {
  return (doc.frozen_report.employer.trust_plan?.priorities ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 3);
}

/** Safety follow-up renders only from an explicit human-reviewed finding. A
 *  safety-critical COUNT (items read by a reviewer) is not a finding. */
export function hasSafetyFollowUp(doc: TrustReportDocument): boolean {
  const s = doc.frozen_report.employer.safety_followup;
  return Boolean(s && s.present && s.source === "human_review" && (s.findings?.length ?? 0) > 0);
}

export function competencyName(
  x: { competency_name_sv: string; competency_name_en: string },
  lang: Lang,
): string {
  return lang === "en" ? x.competency_name_en : x.competency_name_sv;
}

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "en" ? "en-GB" : "sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Sort addenda newest first, for the live rail. */
export function addendaNewestFirst(doc: TrustReportDocument): InterviewAddendum[] {
  return (doc.addenda_overlay?.items ?? [])
    .slice()
    .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : a.recorded_at > b.recorded_at ? -1 : 0));
}
