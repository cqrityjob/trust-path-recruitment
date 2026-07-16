import type { Bi } from "@/lib/career-center/types";
import { dimensionById } from "./dimensions";
import type { ConfidenceLevel, DimensionId, MatchResult } from "./types";

export const confidenceLabel: Record<ConfidenceLevel, Bi> = {
  limited: { sv: "Begränsat underlag", en: "Limited evidence" },
  moderate: { sv: "Måttligt underlag", en: "Moderate evidence" },
  stronger: { sv: "Starkare underlag", en: "Stronger evidence" },
};

export const matchIndicatorLabel: Bi = {
  sv: "Karriärmatchning",
  en: "Career match",
};

export const matchTooltip: Bi = {
  sv: "Detta är en vägledande indikator baserad på dina nuvarande svar, inte en sannolikhet för yrkesmässig framgång eller behörighet.",
  en: "This is a guidance indicator based on your current answers, not a probability of professional success or eligibility.",
};

export function whyThisResult(m: MatchResult, professionTitle: Bi): Bi {
  const dimsSv = m.topDimensions.map((d) => dimensionById[d].name.sv.toLowerCase()).join(", ");
  const dimsEn = m.topDimensions.map((d) => dimensionById[d].name.en.toLowerCase()).join(", ");
  if (m.topDimensions.length === 0) {
    return {
      sv: `Vi har inte tillräckligt tydligt underlag ännu för att förklara varför ${professionTitle.sv} skulle passa dig. Utforska rollen om den intresserar dig.`,
      en: `We don't yet have clear enough signals to explain why ${professionTitle.en} might fit you. Explore the role if it interests you.`,
    };
  }
  return {
    sv: `Dina svar visar tydligast ${dimsSv} — dimensioner som ofta är viktiga i rollen ${professionTitle.sv}.`,
    en: `Your answers most clearly signal ${dimsEn} — dimensions that tend to matter in the ${professionTitle.en} role.`,
  };
}

export function gapsExplanation(gaps: DimensionId[]): Bi {
  if (gaps.length === 0) {
    return {
      sv: "Inga tydliga gap i din nuvarande profil för den här rollen.",
      en: "No clear gaps in your current profile for this role.",
    };
  }
  const sv = gaps.map((d) => dimensionById[d].name.sv).join(", ");
  const en = gaps.map((d) => dimensionById[d].name.en).join(", ");
  return {
    sv: `Områden där ditt underlag är svagare: ${sv}.`,
    en: `Areas where your evidence is weaker: ${en}.`,
  };
}

export const formalRequirementsNote: Bi = {
  sv: "Formella krav — utbildning, licens, förordnande eller erfarenhet — utvärderas separat och påverkar inte din karriärmatchning här.",
  en: "Formal requirements — education, licence, appointment or experience — are evaluated separately and don't affect your career match here.",
};

export const earlyModelNote: Bi = {
  sv: "Det här är en tidig karriärvägledningsmodell. Resultatet kan förändras när dina intressen och erfarenheter utvecklas.",
  en: "This is an early career-guidance model. Results may change as your interests and experience develop.",
};

// Notice shown when the top matched profession is still a Career Center
// placeholder — the match is real, but the underlying profession guide is
// still being developed and should not be presented as verified.
export const placeholderProfessionNotice: Bi = {
  sv: "Yrkesprofilen och rekommendationerna för den här rollen är fortfarande under utveckling. Matchningen är vägledande — detaljerad guide och källor tillkommer.",
  en: "The profession profile and recommendations for this role are still being developed. The match is indicative — a detailed guide and sources are on the way.",
};

export const researchedProfessionNotice: Bi = {
  sv: "Yrkesguiden bygger på insamlad information och pågående granskning.",
  en: "The profession guide is based on sourced information and ongoing review.",
};

export const unansweredReducesEvidence: Bi = {
  sv: "Obesvarade frågor bidrar inte med underlag och kan sänka säkerheten i matchningen.",
  en: "Unanswered questions provide no evidence and can lower the confidence of a match.",
};