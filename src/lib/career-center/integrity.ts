import { professions } from "./professions";
import { competencies } from "./competencies";
import { education } from "./education";
import { certifications } from "./certifications";
import { careerPaths } from "./career-paths";
import { professionFamilies } from "./profession-families";

export type IntegrityIssue = { level: "error" | "warning"; message: string };

/**
 * Dev-time integrity checks. Called only in development.
 * The shipped dataset must produce zero errors.
 */
export function runIntegrityCheck(): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  const profIds = new Set<string>();
  const profSlugs = new Set<string>();
  const compIds = new Set(competencies.map((c) => c.id));
  const eduIds = new Set(education.map((e) => e.id));
  const certIds = new Set(certifications.map((c) => c.id));
  const familyIds = new Set(professionFamilies.map((f) => f.id));

  for (const p of professions) {
    if (profIds.has(p.id)) issues.push({ level: "error", message: `Duplicate profession id: ${p.id}` });
    if (profSlugs.has(p.slug)) issues.push({ level: "error", message: `Duplicate profession slug: ${p.slug}` });
    profIds.add(p.id);
    profSlugs.add(p.slug);

    if (!familyIds.has(p.family)) issues.push({ level: "error", message: `Profession ${p.id} references unknown family ${p.family}` });

    for (const c of p.competencies) {
      if (!compIds.has(c.competencyId)) issues.push({ level: "error", message: `Profession ${p.id} → unknown competency ${c.competencyId}` });
    }
    for (const e of p.educationPathways ?? []) {
      if (!eduIds.has(e)) issues.push({ level: "error", message: `Profession ${p.id} → unknown education ${e}` });
    }
    for (const c of p.certifications ?? []) {
      if (!certIds.has(c)) issues.push({ level: "error", message: `Profession ${p.id} → unknown certification ${c}` });
    }

    if (!p.titleSv || !p.titleEn) issues.push({ level: "error", message: `Profession ${p.id} missing SV/EN title` });
    if (!p.description.sv || !p.description.en) issues.push({ level: "error", message: `Profession ${p.id} missing SV/EN description` });
    if (!p.overview.sv || !p.overview.en) issues.push({ level: "error", message: `Profession ${p.id} missing SV/EN overview` });

    if (p.status === "researched") {
      if (!p.sources || p.sources.length === 0) issues.push({ level: "error", message: `Researched profession ${p.id} has no sources` });
      if (!p.lastVerified) issues.push({ level: "error", message: `Researched profession ${p.id} missing lastVerified` });
    }
    if (p.status === "reviewed" && !p.reviewedBy) {
      issues.push({ level: "error", message: `Profession ${p.id} marked "reviewed" without explicit reviewedBy` });
    }
    if (p.status === "published" && !p.publishedBy) {
      issues.push({ level: "error", message: `Profession ${p.id} marked "published" without explicit publishedBy` });
    }
  }

  for (const cp of careerPaths) {
    if (!profIds.has(cp.from)) issues.push({ level: "error", message: `Career path ${cp.from} → ${cp.to} has unknown 'from' profession` });
    if (!profIds.has(cp.to)) issues.push({ level: "error", message: `Career path ${cp.from} → ${cp.to} has unknown 'to' profession` });
  }

  return issues;
}

if (import.meta.env?.DEV) {
  const issues = runIntegrityCheck();
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[career-center] Integrity errors:", errors);
  }
}