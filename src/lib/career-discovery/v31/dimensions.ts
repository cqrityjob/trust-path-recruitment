// The 16 Career Intelligence Dimensions.
//
// Owner-locked in CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx,
// sheet 06. Names and definitions are reproduced verbatim.
//
// These describe WORK PREFERENCES AND PATTERNS. They are not competence,
// diagnosis, eligibility or personality. Every downstream consumer — report,
// patterns, profession matching, and any future AI service — inherits that
// constraint, so it is stated here at the root of the model rather than
// repeated hopefully in each layer.

import type { Bilingual } from "./version";

export const DIMENSION_IDS = [
  "CID01",
  "CID02",
  "CID03",
  "CID04",
  "CID05",
  "CID06",
  "CID07",
  "CID08",
  "CID09",
  "CID10",
  "CID11",
  "CID12",
  "CID13",
  "CID14",
  "CID15",
  "CID16",
] as const;

export type DimensionId = (typeof DIMENSION_IDS)[number];

export interface Dimension {
  readonly id: DimensionId;
  readonly name: Bilingual;
  readonly definition: Bilingual;
  /** Weight this dimension carries in profession matching.
   *
   *  CID15 is 0 by owner decision A-4: its measured value range across the
   *  instrument is 0.25, the narrowest of the sixteen, because every option
   *  in an ethical scenario has to be defensible. A dimension that cannot
   *  separate candidates cannot legitimately drive a ranking — it would
   *  contribute a near-constant to every profession while appearing to
   *  discriminate. It remains fully scored and fully reported. */
  readonly matchingWeight: 0 | 1;
}

export const DIMENSIONS: Readonly<Record<DimensionId, Dimension>> = {
  CID01: {
    id: "CID01",
    name: { sv: "Operativ orientering", en: "Operational Orientation" },
    definition: {
      sv: "Preferens för praktiskt, situationsnära och direkt handlande arbete.",
      en: "Preference for practical, situation-near and direct-action work.",
    },
    matchingWeight: 1,
  },
  CID02: {
    id: "CID02",
    name: { sv: "Ledarskapsorientering", en: "Leadership Orientation" },
    definition: {
      sv: "Preferens för att leda, prioritera, samordna och utveckla andra.",
      en: "Preference for leading, prioritising, coordinating and developing others.",
    },
    matchingWeight: 1,
  },
  CID03: {
    id: "CID03",
    name: { sv: "Analytisk orientering", en: "Analytical Orientation" },
    definition: {
      sv: "Preferens för att förstå komplex information, samband och orsaker.",
      en: "Preference for understanding complex information, patterns and causes.",
    },
    matchingWeight: 1,
  },
  CID04: {
    id: "CID04",
    name: { sv: "Teknisk orientering", en: "Technical Orientation" },
    definition: {
      sv: "Intresse för teknik, system, digitala miljöer och problemlösning.",
      en: "Interest in technology, systems, digital environments and troubleshooting.",
    },
    matchingWeight: 1,
  },
  CID05: {
    id: "CID05",
    name: { sv: "Strategisk orientering", en: "Strategic Orientation" },
    definition: {
      sv: "Preferens för långsiktighet, helhetsperspektiv och verksamhetsutveckling.",
      en: "Preference for long-term thinking, systems perspective and organisational development.",
    },
    matchingWeight: 1,
  },
  CID06: {
    id: "CID06",
    name: { sv: "Riskmedvetenhet", en: "Risk Awareness" },
    definition: {
      sv: "Uppmärksamhet på risker, konsekvenser, förebyggande åtgärder och kontroll.",
      en: "Attention to risks, consequences, prevention and control.",
    },
    matchingWeight: 1,
  },
  CID07: {
    id: "CID07",
    name: { sv: "Kommunikation", en: "Communication" },
    definition: {
      sv: "Preferens och förmåga att förklara, lyssna och anpassa budskap.",
      en: "Preference and ability to explain, listen and adapt communication.",
    },
    matchingWeight: 1,
  },
  CID08: {
    id: "CID08",
    name: { sv: "Serviceorientering", en: "Service Orientation" },
    definition: {
      sv: "Motivation att hjälpa, skapa trygghet och ge professionellt stöd.",
      en: "Motivation to help, create safety and provide professional support.",
    },
    matchingWeight: 1,
  },
  CID09: {
    id: "CID09",
    name: { sv: "Konflikthantering", en: "Conflict Management" },
    definition: {
      sv: "Trygghet i att hantera motstånd, gränssättning och svåra situationer.",
      en: "Comfort with resistance, boundary-setting and difficult situations.",
    },
    matchingWeight: 1,
  },
  CID10: {
    id: "CID10",
    name: { sv: "Utredande orientering", en: "Investigative Orientation" },
    definition: {
      sv: "Preferens för att granska, verifiera, samla belägg och komma fram till vad som hänt.",
      en: "Preference for examining, verifying, gathering evidence and establishing what happened.",
    },
    matchingWeight: 1,
  },
  CID11: {
    id: "CID11",
    name: { sv: "Struktur och dokumentation", en: "Structure & Documentation" },
    definition: {
      sv: "Preferens för tydliga processer, noggrann dokumentation och uppföljning.",
      en: "Preference for clear processes, accurate documentation and follow-up.",
    },
    matchingWeight: 1,
  },
  CID12: {
    id: "CID12",
    name: { sv: "Självständiga beslut", en: "Independent Decision-Making" },
    definition: {
      sv: "Trygghet i att fatta välgrundade beslut inom eget ansvar.",
      en: "Comfort with making sound decisions within own responsibility.",
    },
    matchingWeight: 1,
  },
  CID13: {
    id: "CID13",
    name: { sv: "Samarbete", en: "Collaboration" },
    definition: {
      sv: "Preferens för samarbete, gemensamt ansvar och tvärfunktionellt arbete.",
      en: "Preference for teamwork, shared responsibility and cross-functional work.",
    },
    matchingWeight: 1,
  },
  CID14: {
    id: "CID14",
    name: { sv: "Lärande och utveckling", en: "Learning & Development" },
    definition: {
      sv: "Motivation att lära nytt, utveckla kompetens och ta sig an nya utmaningar.",
      en: "Motivation to learn, develop competence and take on new challenges.",
    },
    matchingWeight: 1,
  },
  CID15: {
    id: "CID15",
    name: { sv: "Etiskt beslutsstil", en: "Ethical Decision Style" },
    definition: {
      sv: "Hur en person tycks väga konsekvenser, formella rutiner, ansvar, öppenhet, dialog och proportionalitet.",
      en: "How a person appears to balance consequences, formal procedure, responsibility, transparency, dialogue and proportionality.",
    },
    // Owner decision A-4. See the Dimension.matchingWeight docstring.
    matchingWeight: 0,
  },
  CID16: {
    id: "CID16",
    name: { sv: "Lugn under press", en: "Composure Under Pressure" },
    definition: {
      sv: "Förmåga och preferens att behålla lugn, fokus och omdöme under belastning.",
      en: "Ability and preference to remain calm, focused and sound under pressure.",
    },
    matchingWeight: 1,
  },
};

/** Dimensions that contribute to profession matching. CID15 is excluded. */
export const MATCHABLE_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_IDS.filter(
  (id) => DIMENSIONS[id].matchingWeight === 1,
);

/** Dimensions that contribute to Career Pattern scoring.
 *
 *  CID15 is excluded here too, for a reason specific to patterns: with a
 *  measured range of 0.25 it would add nearly the same value to all ten
 *  pattern scores, shifting every one equally and changing no ranking while
 *  implying a precision the evidence cannot support. It still selects
 *  narrative wording (owner decision A-4), which is a separate path. */
export const PATTERN_SCORED_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_IDS.filter(
  (id) => id !== "CID15",
);

/** CID15's candidate-facing framing is decision style, never ability.
 *  Vocabulary that would turn it into a claim about the person is banned at
 *  the content level and asserted by the guard script. */
export const CID15_BANNED_TERMS = [
  "etisk förmåga",
  "ethical ability",
  "integritet",
  "integrity",
  "moralisk",
  "moral quality",
  "ärlig",
  "honest",
  "lämplig",
  "suitable",
] as const;
