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
import { cieRankingIdentity } from "./ranking-identity";
import { toCigSlug } from "./slug-map";
import type { TargetVector } from "./types";

export function buildTargetVectorsFromLegacy(): TargetVector[] {
  return professionProfiles.map((p) => ({
    professionKey: p.professionId,
    legacySlug: p.professionId,
    // Enrichment bridge only -- undefined when no honest CIG node exists.
    cigSlug: toCigSlug(p.professionId),
    // Ranked-list dedup identity, frozen independently of the bridge.
    rankingIdentity: cieRankingIdentity(p.professionId),
    familyKey: p.family,
    targets: p.targets,
    distinguishing: p.distinguishing,
    potentialMismatch: p.potentialMismatch ?? [],
    gate: p.gate,
    minRelevantEvidence: p.minRelevantEvidence ?? 3,
    regulated: !!p.regulated,
  }));
}
