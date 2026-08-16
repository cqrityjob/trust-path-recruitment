// The 17 Career Intelligence Dimensions.
//
// CID01-CID16 owner-locked in CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx,
// sheet 06. Names and definitions reproduced verbatim. CID17 (Regulatory &
// Compliance Orientation) added under the Final Autonomous Matching Engine
// Completion Mandate -- see signalType below for why, and
// professions.ts's DOMAIN_ONLY_CENTRAL_RULE for how it is used.
//
// These describe WORK PREFERENCES AND PATTERNS. They are not competence,
// diagnosis, eligibility or personality. Every downstream consumer — report,
// patterns, profession matching, and any future AI service — inherits that
// constraint, so it is stated here at the root of the model rather than
// repeated hopefully in each layer.
//
// ── WORK STYLE vs CAREER DIRECTION (signalType) ─────────────────────────
//
// Root-cause finding: a real owner test (Sakerhetschef, 8+ years, Bred
// profil DNA) still ranked Guarding #1 in production, explained by Composure
// Under Pressure, Risk Awareness, Collaboration and Conflict Management --
// traits every competent security professional needs, regardless of which
// profession they actually belong in. Investigation traced this to the
// PROFESSION DATA, not the ranking arithmetic: several professions' most
// heavily-weighted ("central") dimensions were themselves transferable
// work-style traits (Composure, Collaboration, Structure, Independent
// Decision-Making) rather than traits that actually signal WHICH security
// direction someone belongs in. A flat, moderate-everywhere candidate who
// clears those low bars comfortably will look like a strong match for any
// profession whose central set leans on them -- no amount of rescoring
// (z-scores, weighting, thresholds) fixes a taxonomy problem underneath the
// arithmetic.
//
// Fix: every dimension is now classified as either:
//   "domain" -- a CAREER-DIRECTION signal: what kind of security work a
//     candidate is drawn to (operational, technical, investigative,
//     strategic, leadership, service, conflict, risk, compliance). These
//     are the traits that should distinguish one profession from another.
//   "style"  -- a WORK-STYLE signal: how a candidate tends to work,
//     regardless of domain (calm under pressure, collaborative, structured,
//     communicates well, decides independently, keeps learning). Needed
//     almost everywhere, and therefore incapable of discriminating between
//     professions on its own.
//
// professions.ts enforces this at the data-integrity level: a profession's
// "central" (dominant, gate-triggering) band may ONLY be a domain dimension
// going forward. Style dimensions can still be genuine, differentiated
// supporting evidence -- they are real and matter -- but structurally
// cannot, by themselves, make a profession look like a strong match.

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
  "CID17",
] as const;

export type DimensionId = (typeof DIMENSION_IDS)[number];

export type SignalType = "domain" | "style";

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
  /** "domain" (career-direction signal) or "style" (transferable work-style
   *  signal) -- see the file header. Drives which dimensions professions.ts
   *  may ever mark "central". */
  readonly signalType: SignalType;
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
    signalType: "domain",
  },
  CID02: {
    id: "CID02",
    name: { sv: "Ledarskapsorientering", en: "Leadership Orientation" },
    definition: {
      sv: "Preferens för att leda, prioritera, samordna och utveckla andra.",
      en: "Preference for leading, prioritising, coordinating and developing others.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID03: {
    id: "CID03",
    name: { sv: "Analytisk orientering", en: "Analytical Orientation" },
    definition: {
      sv: "Preferens för att förstå komplex information, samband och orsaker.",
      en: "Preference for understanding complex information, patterns and causes.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID04: {
    id: "CID04",
    name: { sv: "Teknisk orientering", en: "Technical Orientation" },
    definition: {
      sv: "Intresse för teknik, system, digitala miljöer och problemlösning.",
      en: "Interest in technology, systems, digital environments and troubleshooting.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID05: {
    id: "CID05",
    name: { sv: "Strategisk orientering", en: "Strategic Orientation" },
    definition: {
      sv: "Preferens för långsiktighet, helhetsperspektiv och verksamhetsutveckling.",
      en: "Preference for long-term thinking, systems perspective and organisational development.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID06: {
    id: "CID06",
    name: { sv: "Riskmedvetenhet", en: "Risk Awareness" },
    definition: {
      sv: "Uppmärksamhet på risker, konsekvenser, förebyggande åtgärder och kontroll.",
      en: "Attention to risks, consequences, prevention and control.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID07: {
    id: "CID07",
    name: { sv: "Kommunikation", en: "Communication" },
    definition: {
      sv: "Preferens och förmåga att förklara, lyssna och anpassa budskap.",
      en: "Preference and ability to explain, listen and adapt communication.",
    },
    matchingWeight: 1,
    // Transferable across every security profession -- how you convey
    // information, not which direction you're drawn to.
    signalType: "style",
  },
  CID08: {
    id: "CID08",
    name: { sv: "Serviceorientering", en: "Service Orientation" },
    definition: {
      sv: "Motivation att hjälpa, skapa trygghet och ge professionellt stöd.",
      en: "Motivation to help, create safety and provide professional support.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID09: {
    id: "CID09",
    name: { sv: "Konflikthantering", en: "Conflict Management" },
    definition: {
      sv: "Trygghet i att hantera motstånd, gränssättning och svåra situationer.",
      en: "Comfort with resistance, boundary-setting and difficult situations.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID10: {
    id: "CID10",
    name: { sv: "Utredande orientering", en: "Investigative Orientation" },
    definition: {
      sv: "Preferens för att granska, verifiera, samla belägg och komma fram till vad som hänt.",
      en: "Preference for examining, verifying, gathering evidence and establishing what happened.",
    },
    matchingWeight: 1,
    signalType: "domain",
  },
  CID11: {
    id: "CID11",
    name: { sv: "Struktur och dokumentation", en: "Structure & Documentation" },
    definition: {
      sv: "Preferens för tydliga processer, noggrann dokumentation och uppföljning.",
      en: "Preference for clear processes, accurate documentation and follow-up.",
    },
    matchingWeight: 1,
    // Transferable -- guards, investigators and managers all document,
    // just different things. How you work, not what you're drawn to.
    signalType: "style",
  },
  CID12: {
    id: "CID12",
    name: { sv: "Självständiga beslut", en: "Independent Decision-Making" },
    definition: {
      sv: "Trygghet i att fatta välgrundade beslut inom eget ansvar.",
      en: "Comfort with making sound decisions within own responsibility.",
    },
    matchingWeight: 1,
    // Correlates with autonomy/seniority more than with any one domain --
    // needed at the front line and in the boardroom alike.
    signalType: "style",
  },
  CID13: {
    id: "CID13",
    name: { sv: "Samarbete", en: "Collaboration" },
    definition: {
      sv: "Preferens för samarbete, gemensamt ansvar och tvärfunktionellt arbete.",
      en: "Preference for teamwork, shared responsibility and cross-functional work.",
    },
    matchingWeight: 1,
    signalType: "style",
  },
  CID14: {
    id: "CID14",
    name: { sv: "Lärande och utveckling", en: "Learning & Development" },
    definition: {
      sv: "Motivation att lära nytt, utveckla kompetens och ta sig an nya utmaningar.",
      en: "Motivation to learn, develop competence and take on new challenges.",
    },
    matchingWeight: 1,
    signalType: "style",
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
    signalType: "style",
  },
  CID16: {
    id: "CID16",
    name: { sv: "Lugn under press", en: "Composure Under Pressure" },
    definition: {
      sv: "Förmåga och preferens att behålla lugn, fokus och omdöme under belastning.",
      en: "Ability and preference to remain calm, focused and sound under pressure.",
    },
    matchingWeight: 1,
    // The exact trait the owner's real test exposed: universally necessary,
    // structurally incapable of telling two professions apart.
    signalType: "style",
  },
  CID17: {
    id: "CID17",
    name: { sv: "Regelefterlevnad och granskning", en: "Regulatory & Compliance Orientation" },
    definition: {
      sv: "Preferens för att arbeta inom regelverk, granska transaktioner eller underlag och identifiera avvikelser från fastställda krav.",
      en: "Preference for working within regulatory frameworks, reviewing transactions or records and identifying deviations from established requirements.",
    },
    // New dimension (Final Autonomous Matching Engine Completion Mandate).
    // AML-specialist shared its entire central-domain set with Säkerhetsutredare
    // (Analytical + Investigative) once style dimensions were correctly
    // demoted from "central" -- with nothing left to distinguish "reviews
    // transactions against regulatory requirements" from "investigates what
    // happened". This is the minimum necessary new evidence for that
    // distinction, not for AML alone: it is also CP06's ("Compliance
    // Guardian") defining trait, replacing a work-style proxy
    // (Conflict Management) that never actually described compliance work.
    matchingWeight: 1,
    signalType: "domain",
  },
};

/** Dimensions that contribute to profession matching. CID15 is excluded. */
export const MATCHABLE_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_IDS.filter(
  (id) => DIMENSIONS[id].matchingWeight === 1,
);

/** Matchable dimensions classified as career-direction ("domain") signals.
 *  professions.ts's DOMAIN_ONLY_CENTRAL_RULE restricts "central" bands to
 *  this set -- see the file header. */
export const DOMAIN_DIMENSION_IDS: readonly DimensionId[] = MATCHABLE_DIMENSION_IDS.filter(
  (id) => DIMENSIONS[id].signalType === "domain",
);

/** Matchable dimensions classified as transferable work-style signals. */
export const STYLE_DIMENSION_IDS: readonly DimensionId[] = MATCHABLE_DIMENSION_IDS.filter(
  (id) => DIMENSIONS[id].signalType === "style",
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
