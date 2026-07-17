// Layer 6 — Structured, bilingual explanations.
//
// Deterministic template registry. No generative AI. Every kind emits a
// Bi-text pair (sv/en). The UI renders these; the engine composes them.

import { dimensionById } from "@/lib/career-assessment/dimensions";
import { getFamily } from "@/lib/career-center/profession-families";
import type {
  Bi,
  CareerProfile,
  DimensionId,
  DualScore,
  EnrichmentBundle,
  FamilyRankingEntry,
  Match,
  StructuredExplanation,
  TargetVector,
} from "./types";

function dimName(id: DimensionId): Bi {
  return dimensionById[id]?.name ?? { sv: id, en: id };
}

function svEnJoin(items: Bi[], sep: { sv: string; en: string }): Bi {
  return {
    sv: items.map((i) => i.sv).join(sep.sv),
    en: items.map((i) => i.en).join(sep.en),
  };
}

function forDim(
  kind: StructuredExplanation["kind"],
  dim: DimensionId,
  data?: Record<string, unknown>,
): StructuredExplanation {
  const name = dimName(dim);
  if (kind === "matched_dimension") {
    return {
      kind,
      data: { dimension: dim, ...data },
      text: {
        sv: `Din signal på "${name.sv}" ligger nära det som är typiskt för yrket.`,
        en: `Your signal on "${name.en}" is close to what is typical for this role.`,
      },
    };
  }
  return {
    kind: "gap_dimension",
    data: { dimension: dim, ...data },
    text: {
      sv: `"${name.sv}" är ett område att utveckla för denna karriärväg.`,
      en: `"${name.en}" is an area to develop for this career path.`,
    },
  };
}

export function explainMatch(input: {
  target: TargetVector;
  dual: DualScore;
  enrichment: EnrichmentBundle;
  evidenceScore: number;
  rankIndex: number; // 0-based
  topReferenceKey?: string;
}): StructuredExplanation[] {
  const out: StructuredExplanation[] = [];
  const { target, dual, enrichment, evidenceScore, rankIndex } = input;

  for (const dim of dual.currentFit.topDimensions) {
    out.push(forDim("matched_dimension", dim));
  }
  for (const dim of dual.currentFit.gaps) {
    out.push(forDim("gap_dimension", dim));
  }

  if (dual.currentFit.gatePassed) {
    if (target.gate !== "none") {
      out.push({
        kind: "gate_pass",
        data: { gate: target.gate },
        text: {
          sv: "Grundkraven för karriärvägen (baserade på svaren) är uppfyllda.",
          en: "The baseline signals for this career path are present in your answers.",
        },
      });
    }
  } else {
    out.push({
      kind: "gate_fail",
      data: { gate: target.gate },
      text: dual.currentFit.gateNote ?? {
        sv: "Grundkraven för karriärvägen visas inte tydligt i svaren.",
        en: "Baseline signals for this career path are not clearly present in the answers.",
      },
    });
  }

  if (dual.currentFit.importantCount > 0 &&
      dual.currentFit.observedImportant / dual.currentFit.importantCount < 0.5) {
    out.push({
      kind: "low_evidence",
      text: {
        sv: "Flera relevanta områden täcktes inte av dina svar — resultatet är därför indikativt.",
        en: "Several relevant areas were not covered by your answers, so the result is indicative.",
      },
    });
  }

  if (enrichment.formalRequirements.length > 0) {
    const items = enrichment.formalRequirements.slice(0, 3).map((r) => r.label);
    out.push({
      kind: "formal_requirement",
      data: { count: enrichment.formalRequirements.length },
      text: {
        sv: `Yrket har formella eller lagstadgade krav (t.ex. ${items
          .map((i) => i.sv)
          .join("; ")}). Dessa hanteras separat från karriärmatchningen.`,
        en: `This role has formal or legal requirements (e.g. ${items
          .map((i) => i.en)
          .join("; ")}). These are handled separately from career fit.`,
      },
    });
  }

  if (target.regulated) {
    out.push({
      kind: "regulated_notice",
      text: enrichment.disclaimer ?? {
        sv: "Detta är ett reglerat yrke. Matchningen indikerar intresseprofil — inte tillstånd, behörighet eller anställning.",
        en: "This is a regulated profession. The match reflects a career-interest profile only — not authorisation, eligibility, or employment.",
      },
    });
  }

  if (rankIndex > 0 && input.topReferenceKey) {
    out.push({
      kind: "why_ranked_lower",
      data: { rank: rankIndex + 1, comparedTo: input.topReferenceKey },
      text: {
        sv: "Rankas något lägre eftersom särskiljande signaler ligger närmare den högst rankade karriärvägen.",
        en: "Ranked slightly lower because distinguishing signals aligned more closely with the top-ranked path.",
      },
    });
  }

  const gapCurrentPotential = dual.potential.displayed - dual.currentFit.displayed;
  if (gapCurrentPotential >= 10) {
    out.push({
      kind: "current_vs_potential",
      data: { currentFit: dual.currentFit.displayed, potential: dual.potential.displayed },
      text: {
        sv: `Aktuell passform är ${dual.currentFit.displayed}/100 medan din utvecklingspotential för detta yrke uppskattas till ${dual.potential.displayed}/100.`,
        en: `Current fit is ${dual.currentFit.displayed}/100 while your development potential for this role is estimated at ${dual.potential.displayed}/100.`,
      },
    });
  }

  out.push({
    kind: "evidence_note",
    data: { evidenceScore },
    text: {
      sv: `Underlagets bredd är ${evidenceScore}/100 baserat på besvarade frågor och tillgängliga källor.`,
      en: `Evidence coverage is ${evidenceScore}/100 based on answered questions and available sources.`,
    },
  });

  return out;
}

export function explainCareerProfile(profile: CareerProfile): StructuredExplanation[] {
  const top = profile.archetypes[0];
  const runnerUp = profile.archetypes[1];
  if (!top) return [];
  return [
    {
      kind: "profile_archetype",
      data: { primary: top.key, secondary: runnerUp?.key },
      text: {
        sv: `Din tydligaste karriärarketyp är "${top.label.sv}"${runnerUp ? `, med "${runnerUp.label.sv}" som stödprofil` : ""}.`,
        en: `Your strongest archetype is "${top.label.en}"${runnerUp ? `, with "${runnerUp.label.en}" as a supporting profile` : ""}.`,
      },
    },
  ];
}

export function explainFamily(entry: FamilyRankingEntry): StructuredExplanation[] {
  const fam = getFamily(entry.familyKey);
  const nameSv = fam?.name.sv ?? entry.familyKey;
  const nameEn = fam?.name.en ?? entry.familyKey;
  return [
    {
      kind: "family_rationale",
      data: { familyKey: entry.familyKey },
      text: {
        sv: `Yrkesfamiljen "${nameSv}" ligger närmast baserat på dina svar inom detta område.`,
        en: `The Career Family "${nameEn}" is the closest match based on your answers in this area.`,
      },
    },
  ];
}

export function _debugJoin(items: Bi[]): Bi {
  return svEnJoin(items, { sv: ", ", en: ", " });
}
