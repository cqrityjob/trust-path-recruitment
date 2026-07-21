import { ALL_ASSETS } from "./registry";
import type { AssembledQuestionSet, AssessmentProfileId, QuestionAsset } from "./types";

function supportsDefinition(asset: QuestionAsset, assessmentDefinitionId: string): boolean {
  return (
    asset.supportedAssessmentDefinitions.includes("*") ||
    asset.supportedAssessmentDefinitions.includes(assessmentDefinitionId)
  );
}

// The platform's lightweight assembly function -- the "mini blueprint
// engine" for this phase. Filters the flat asset registry by
// supportedAssessmentDefinitions + tag(s), returns questions/mappings in a
// stable order: Universal Core (8) first, then the selected profile pool
// (8), for a total of exactly 16 for the Public Career Assessment.
//
// Defensive dedupe by the underlying content.id: several profile pools reuse
// the same legacy question (e.g. q16 appears as sgf-08/stu-07/chg-07) but a
// single assembled run must never ask the same underlying question twice.
export function assembleQuestionSet(
  assessmentDefinitionId: string,
  profileId?: AssessmentProfileId,
): AssembledQuestionSet {
  const core = ALL_ASSETS.filter(
    (a) => supportsDefinition(a, assessmentDefinitionId) && a.tags.includes("universal-core"),
  );
  const profile = profileId
    ? ALL_ASSETS.filter(
        (a) =>
          supportsDefinition(a, assessmentDefinitionId) && a.tags.includes(`profile:${profileId}`),
      )
    : [];

  const ordered = [...core, ...profile];
  const seen = new Set<string>();
  const deduped = ordered.filter((a) => {
    if (seen.has(a.content.id)) return false;
    seen.add(a.content.id);
    return true;
  });

  return {
    questions: deduped.map((a) => a.content),
    mappings: deduped.map((a) => a.mapping),
  };
}
