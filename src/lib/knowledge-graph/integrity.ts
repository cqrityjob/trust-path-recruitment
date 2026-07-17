// Dev-time integrity checks for the Career Intelligence Graph.
// Non-throwing in production; logs warnings.

import { professions } from "@/lib/career-center/professions";
import { formalRequirements, professionFormalRequirements } from "./formal-requirements";

export function checkGraphIntegrity(): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const professionIds = new Set(professions.map((p) => p.id));
  const frIds = new Set(formalRequirements.map((r) => r.id));

  for (const link of professionFormalRequirements) {
    if (!professionIds.has(link.professionId)) {
      errors.push(`FR link references unknown profession '${link.professionId}'`);
    }
    if (!frIds.has(link.requirementId)) {
      errors.push(`FR link references unknown requirement '${link.requirementId}'`);
    }
  }

  // Guard against reintroducing rejected requirement ids
  const banned = ["fr.se.vaktare.employment", "fr.se.skyddsvakt.scope", "fr.se.criminal-record-check"];
  for (const b of banned) {
    if (frIds.has(b)) errors.push(`Banned FormalRequirement id '${b}' must not exist (see Sprint 09B corrections).`);
  }

  // Skyddsvakt approval authority sanity check
  const skyddsApproval = formalRequirements.find((r) => r.id === "fr.se.skyddsvakt.approval");
  if (skyddsApproval) {
    const auth = `${skyddsApproval.authority.sv} ${skyddsApproval.authority.en}`.toLowerCase();
    if (auth.includes("polismyndighet")) {
      errors.push("Skyddsvakt approval must NOT list Polismyndigheten as approving authority.");
    }
    if (!auth.includes("länsstyrelse")) {
      errors.push("Skyddsvakt approval must list Länsstyrelsen as approving authority.");
    }
  } else {
    errors.push("Missing FormalRequirement 'fr.se.skyddsvakt.approval'.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

if (import.meta.env?.DEV) {
  const res = checkGraphIntegrity();
  if (!res.ok) console.error("[knowledge-graph] integrity errors:", res.errors);
  else if (res.warnings.length) console.warn("[knowledge-graph] warnings:", res.warnings);
}
