// Stable read-only interface for the Career Intelligence Graph.
// UI code MUST use this module; never import raw seed files directly.

import { professions as _professions } from "@/lib/career-center/professions";
import { getProfession as _getProfession } from "@/lib/career-center/selectors";
import { competencies } from "@/lib/career-center/competencies";
import { educations } from "@/lib/career-center/education";
import { certifications } from "@/lib/career-center/certifications";
import type { Profession, ProfessionId, CompetencyId, EducationId, CertificationId, SourceRef } from "@/lib/career-center/types";

import { GRAPH_VERSION } from "./graph-meta";
import {
  formalRequirements as _formalRequirements,
  getFormalRequirement,
  getFormalRequirementsForProfession,
  professionFormalRequirements,
} from "./formal-requirements";
import type { FormalRequirement, ProfessionFormalRequirement, ProfessionGraphView } from "./types";

export function listProfessions(): readonly Profession[] {
  return _professions;
}

export function getProfessionRecord(id: ProfessionId): Profession | undefined {
  return _getProfession(id);
}

export function listFormalRequirements(): readonly FormalRequirement[] {
  return _formalRequirements;
}

export function listProfessionFormalRequirements(): readonly ProfessionFormalRequirement[] {
  return professionFormalRequirements;
}

export { getFormalRequirement, getFormalRequirementsForProfession };

export function readProfessionGraph(professionId: ProfessionId): ProfessionGraphView | undefined {
  const p = _getProfession(professionId);
  if (!p) return undefined;

  const frs = getFormalRequirementsForProfession(professionId);
  const legalRequirements = frs.filter((r) => r.legalBlocker);
  const developmentRequirements = frs.filter((r) => !r.legalBlocker);

  const sources: SourceRef[] = [];
  for (const s of p.sources ?? []) sources.push(s);
  for (const r of frs) if (r.officialSource) sources.push(r.officialSource);

  return {
    id: p.id,
    slug: p.slug,
    titleSv: p.titleSv,
    titleEn: p.titleEn,
    status: p.status,
    regulated: p.regulated,
    legalRequirements,
    developmentRequirements,
    competencyIds: (p.competencies ?? []).map((c) => c.competencyId as CompetencyId),
    educationIds: (p.educationPathways ?? []) as EducationId[],
    certificationIds: (p.certifications ?? []) as CertificationId[],
    sources,
    lastVerified: p.lastVerified,
    graphVersion: GRAPH_VERSION,
  };
}

// Convenience lookups used by UI
export function getCompetencyName(id: CompetencyId): { sv: string; en: string } | undefined {
  const c = competencies.find((x) => x.id === id);
  return c ? c.name : undefined;
}

export function getEducationName(id: EducationId): { sv: string; en: string } | undefined {
  const e = educations.find((x) => x.id === id);
  return e ? e.name : undefined;
}

export function getCertification(id: CertificationId) {
  return certifications.find((x) => x.id === id);
}
