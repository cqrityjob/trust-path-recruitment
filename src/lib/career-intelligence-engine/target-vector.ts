// Target-vector adapter.
//
// Phase D uses the legacy TS `professionProfiles` array as the canonical
// signal source for scoring. This adapter normalises those profiles into
// the engine's `TargetVector` shape and attaches the CIG slug when known
// so enrichment can be looked up.
//
// A future migration can seed cig_profession_assessment_signals from the
// same source, at which point a second adapter (fromCigSignals) can be
// added without changing the engine core.

import { professionProfiles } from "@/lib/career-assessment/profession-profiles";
import { toCigSlug } from "./slug-map";
import type { TargetVector } from "./types";

export function buildTargetVectorsFromLegacy(): TargetVector[] {
  return professionProfiles.map((p) => ({
    professionKey: p.professionId,
    legacySlug: p.professionId,
    cigSlug: toCigSlug(p.professionId),
    familyKey: p.family,
    targets: p.targets,
    distinguishing: p.distinguishing,
    potentialMismatch: p.potentialMismatch ?? [],
    gate: p.gate,
    minRelevantEvidence: p.minRelevantEvidence ?? 3,
    regulated: !!p.regulated,
  }));
}
