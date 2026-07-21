import type { DimensionId } from "@/lib/career-assessment/types";
import { competencies, competencyBySlug } from "./competencies";
import type { CompetencyDefinition, CompetencySlug } from "./types";

export { competencies, competencyBySlug };

export const ALL_COMPETENCIES: CompetencyDefinition[] = competencies;

export function byId(id: string): CompetencyDefinition | undefined {
  return competencies.find((c) => c.id === id);
}

export function bySlug(slug: CompetencySlug): CompetencyDefinition | undefined {
  return competencyBySlug[slug];
}

export function getDimensionsForCompetency(slug: CompetencySlug): DimensionId[] {
  return competencyBySlug[slug]?.dimensions ?? [];
}
