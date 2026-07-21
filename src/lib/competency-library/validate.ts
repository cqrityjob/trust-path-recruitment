import type { DimensionId } from "@/lib/career-assessment/types";
import { competencyBySlug } from "./competencies";
import type { CompetencySlug } from "./types";

// Consistency checker for the Competency Library. Deliberately takes a
// structural shape rather than importing QuestionAsset from
// src/lib/question-library/ -- the Competency Library is a lower layer and
// must not depend on the Question Library that sits above it. Called from
// question-library's own validation (or a shared check script) by passing
// its assets in.
export interface CompetencyTaggedAsset {
  id: string;
  competencies: CompetencySlug[];
  dimensions: DimensionId[];
}

export interface ValidationIssue {
  assetId: string;
  message: string;
}

export function validateAssetCompetencies(assets: CompetencyTaggedAsset[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const asset of assets) {
    if (asset.competencies.length === 0) {
      issues.push({ assetId: asset.id, message: "asset has no competencies tagged" });
      continue;
    }

    const unresolved = asset.competencies.filter((slug) => !competencyBySlug[slug]);
    for (const slug of unresolved) {
      issues.push({
        assetId: asset.id,
        message: `competency slug "${slug}" does not resolve in the registry`,
      });
    }

    const resolvedSlugs = asset.competencies.filter((slug) => competencyBySlug[slug]);
    const allowedDimensions = new Set<DimensionId>(
      resolvedSlugs.flatMap((slug) => competencyBySlug[slug].dimensions),
    );

    const outOfBand = asset.dimensions.filter((d) => !allowedDimensions.has(d));
    for (const dim of outOfBand) {
      issues.push({
        assetId: asset.id,
        message: `dimension "${dim}" is not declared by any of this asset's competencies (${resolvedSlugs
          .map((s) => s)
          .join(", ")})`,
      });
    }
  }

  return issues;
}
