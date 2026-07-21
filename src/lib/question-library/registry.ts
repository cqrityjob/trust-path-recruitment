import type { CompetencySlug } from "@/lib/competency-library/types";
import { coreAssets } from "./assets/core.assets";
import { securityGuardFoundationAssets } from "./assets/security-guard-foundation.assets";
import { studentOrNewAssets } from "./assets/student-or-new.assets";
import { careerChangerAssets } from "./assets/career-changer.assets";
import type { QuestionAsset } from "./types";

// The flat asset registry. Files under assets/*.ts are grouped purely for
// authoring convenience -- nothing at runtime imports "the student-or-new
// file" directly; every asset carries its own tags/supportedAssessmentDefinitions
// metadata and is merged here into one queryable list.
export const ALL_ASSETS: QuestionAsset[] = [
  ...coreAssets,
  ...securityGuardFoundationAssets,
  ...studentOrNewAssets,
  ...careerChangerAssets,
];

export const byId: Record<string, QuestionAsset> = Object.fromEntries(
  ALL_ASSETS.map((a) => [a.id, a]),
);

export function byTag(tag: string): QuestionAsset[] {
  return ALL_ASSETS.filter((a) => a.tags.includes(tag));
}

export function byDefinition(assessmentDefinitionId: string): QuestionAsset[] {
  return ALL_ASSETS.filter(
    (a) =>
      a.supportedAssessmentDefinitions.includes("*") ||
      a.supportedAssessmentDefinitions.includes(assessmentDefinitionId),
  );
}

export function byCompetency(slug: CompetencySlug): QuestionAsset[] {
  return ALL_ASSETS.filter((a) => a.competencies.includes(slug));
}
