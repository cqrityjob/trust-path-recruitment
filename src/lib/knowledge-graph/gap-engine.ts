import { GRAPH_VERSION } from "./graph-meta";
import { getFormalRequirementsForProfession } from "./formal-requirements";
import type {
  CompetenceGap,
  ExperienceGap,
  FormalGapStatus,
  FormalRequirementGap,
  GapAnalysis,
} from "./types";
import { getProfessionRecord } from "./read";
import type { CompetencyId, ProficiencyLevel } from "@/lib/career-center/types";

export interface SelfReportedCompetence {
  competencyId: CompetencyId;
  selfLevel: ProficiencyLevel;
}

// A user-declared status for a specific formal requirement.
export interface FormalRequirementSelfReport {
  requirementId: string;
  status: Exclude<FormalGapStatus, "required" | "not_provided"> | "self_reported_as_met" | "not_applicable";
}

export interface GapEngineInput {
  professionId: string;
  competencies?: SelfReportedCompetence[];
  formalReports?: FormalRequirementSelfReport[];
  yearsExperience?: number | null;
}

// Pure function. No I/O.
export function computeGapAnalysis(input: GapEngineInput): GapAnalysis {
  const profession = getProfessionRecord(input.professionId);
  const competenceGaps: CompetenceGap[] = [];
  const formalRequirementGaps: FormalRequirementGap[] = [];
  const experienceGaps: ExperienceGap[] = [];

  if (!profession) {
    return {
      graphVersion: GRAPH_VERSION,
      professionId: input.professionId,
      competenceGaps,
      formalRequirementGaps,
      experienceGaps,
    };
  }

  // ---- Competence gaps ----
  const reportByComp = new Map<string, ProficiencyLevel>();
  for (const r of input.competencies ?? []) {
    reportByComp.set(r.competencyId, r.selfLevel);
  }
  for (const req of profession.competencies ?? []) {
    const self = reportByComp.get(req.competencyId) ?? null;
    const requiredLevel = req.requiredLevel;
    const meets = self !== null && self >= requiredLevel;
    if (!meets) {
      competenceGaps.push({
        competencyId: req.competencyId,
        requiredLevel,
        selfReportedLevel: self,
        severity: req.critical ? "blocker" : "recommended",
        critical: !!req.critical,
      });
    }
  }

  // ---- Formal requirement gaps ----
  const reportByReq = new Map<string, FormalRequirementSelfReport["status"]>();
  for (const r of input.formalReports ?? []) {
    reportByReq.set(r.requirementId, r.status);
  }
  const frs = getFormalRequirementsForProfession(input.professionId);
  for (const r of frs) {
    const reported = reportByReq.get(r.id);
    let status: FormalGapStatus;
    if (reported === "self_reported_as_met") status = "self_reported_as_met";
    else if (reported === "not_applicable") status = "not_applicable";
    else if (r.legalBlocker) status = "not_provided";
    else status = "required";
    formalRequirementGaps.push({
      requirementId: r.id,
      subtype: r.subtype,
      appliesTo: r.appliesTo,
      legalBlocker: r.legalBlocker,
      status,
      authorityConductsSuitabilityCheck: r.authorityConductsSuitabilityCheck,
    });
  }

  // ---- Experience gaps (very light heuristic in beta) ----
  const level = profession.level;
  const years = input.yearsExperience ?? 0;
  const needed = level === "senior" ? 5 : level === "mid" ? 2 : level === "executive" ? 8 : 0;
  if (needed > 0 && years < needed) {
    experienceGaps.push({
      kind: "years",
      description: {
        sv: `Rekommenderad erfarenhet: cirka ${needed} år. Du har angett ${years} år.`,
        en: `Recommended experience: about ${needed} years. You have indicated ${years} year(s).`,
      },
      severity: "recommended",
    });
  }

  return {
    graphVersion: GRAPH_VERSION,
    professionId: input.professionId,
    competenceGaps,
    formalRequirementGaps,
    experienceGaps,
  };
}
