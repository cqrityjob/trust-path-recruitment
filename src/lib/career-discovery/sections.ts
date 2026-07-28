// The five candidate-facing Discovery sections.
//
// Section titles, descriptions and transition copy are OWNER-LOCKED,
// transcribed verbatim from the implementation directive §6 and §13.
//
// ── HOW THE 20 CORE ITEMS WERE ASSIGNED ────────────────────────────────
//
// Each item went to the section whose candidate-facing description best
// describes what the item actually asks about. NO item's scoring or axis
// loading was changed to make it fit a section — the directive forbids it,
// and the axis-coverage assertion below would catch it if it happened.
//
//   D1 approach       S1 (field presence) · S5 (technology) · T1 (field × tech)
//   D2 others         S2 (people) · T2 (people × investigation) ·
//                     T6 (people × procedure) · B3 (composure)
//   D3 decisions      S4 (tempo) · S6 (investigation) · T3 (procedure × tempo) ·
//                     T7 (tempo × investigation) · B2 (escalation)
//   D4 responsibility S3 (procedure) · S7 (responsibility) ·
//                     T4 (responsibility × scope) · B1 (follow-through)
//   D5 development    S8 (scope) · T5 (field × scope) · T8 (tech × responsibility) ·
//                     B4 (learning response)
//
// Axis coverage is preserved exactly — 3 loadings per axis, 24 total:
//
//   CDA-01  S1·D1  T1·D1  T5·D5        CDA-05  S5·D1  T1·D1  T8·D5
//   CDA-02  S2·D2  T2·D2  T6·D2        CDA-06  S6·D3  T2·D2  T7·D3
//   CDA-03  S3·D4  T3·D3  T6·D2        CDA-07  S7·D4  T4·D4  T8·D5
//   CDA-04  S4·D3  T3·D3  T7·D3        CDA-08  S8·D5  T4·D4  T5·D5
//
// Sections are a PRESENTATION grouping. Nothing in scoring reads them.
//
// Internal axis identifiers (CDA-01…, BS-1…) never appear in any string a
// candidate can see — only in these comments and in code.

import type { DiscoverySection } from "./types";

/** Adaptive items are placed in sections 1, 2, 4 and 5 per directive §7.
 *  Section 3 deliberately has none, so the longest run of core items sits
 *  in the middle of the session where the candidate is warmed up. */
export const ADAPTIVE_SLOT_SECTIONS = [
  "approach",
  "others",
  "responsibility",
  "development",
] as const;

export const DISCOVERY_SECTIONS: readonly DiscoverySection[] = [
  {
    id: "approach",
    ordinal: 1,
    title: {
      sv: "Hur du tar dig an situationer",
      en: "How you approach situations",
    },
    description: {
      sv: "Vi börjar med hur du helst arbetar och vilken typ av situationer som ger dig energi.",
      en: "We begin with how you prefer to work and the kinds of situations that give you energy.",
    },
    coreItemIds: ["S1", "S5", "T1"],
    hasAdaptiveSlot: true,
    transition: {
      sv: "Bra början.\n\nNu går vi vidare och tittar på hur du arbetar tillsammans med andra.",
      en: "A good start.\n\nNext, we will explore how you work with other people.",
    },
  },
  {
    id: "others",
    ordinal: 2,
    title: {
      sv: "Hur du arbetar med andra",
      en: "How you work with others",
    },
    description: {
      sv: "Nu tittar vi på samarbete, kontakt med människor och hur du bidrar tillsammans med andra.",
      en: "Now we look at collaboration, contact with people, and how you contribute alongside others.",
    },
    coreItemIds: ["S2", "T2", "T6", "B3"],
    hasAdaptiveSlot: true,
    transition: {
      sv: "Tack.\n\nNästa del handlar om hur du fattar beslut när situationen inte är helt självklar.",
      en: "Thank you.\n\nThe next section explores how you make decisions when the situation is not straightforward.",
    },
  },
  {
    id: "decisions",
    ordinal: 3,
    title: {
      sv: "Hur du fattar beslut",
      en: "How you make decisions",
    },
    description: {
      sv: "Här utforskar vi hur du väger information, tempo, risk och handlingskraft.",
      en: "Here we explore how you weigh information, pace, risk and decisiveness.",
    },
    coreItemIds: ["S4", "S6", "T3", "T7", "B2"],
    hasAdaptiveSlot: false,
    transition: {
      sv: "Du är mer än halvvägs.\n\nNu tittar vi på ansvar, struktur och vad du gör när något står på spel.",
      en: "You are more than halfway through.\n\nNext, we will look at responsibility, structure and how you respond when something is at stake.",
    },
  },
  {
    id: "responsibility",
    ordinal: 4,
    title: {
      sv: "Hur du hanterar ansvar",
      en: "How you handle responsibility",
    },
    description: {
      sv: "Nu tittar vi på struktur, ansvar, tillit och hur du agerar när något står på spel.",
      en: "Now we look at structure, responsibility, trust and how you act when something is at stake.",
    },
    coreItemIds: ["S3", "S7", "T4", "B1"],
    hasAdaptiveSlot: true,
    transition: {
      sv: "Sista delen.\n\nNu fokuserar vi på vilken utveckling och framtida riktning som känns mest relevant för dig.",
      en: "Final section.\n\nNow we will focus on the development and future direction that feel most relevant to you.",
    },
  },
  {
    id: "development",
    ordinal: 5,
    title: {
      sv: "Hur du vill utvecklas",
      en: "How you want to develop",
    },
    description: {
      sv: "Till sist undersöker vi vilken riktning och typ av utveckling som känns mest relevant för dig.",
      en: "Finally, we explore which direction and kind of development feel most relevant to you.",
    },
    coreItemIds: ["S8", "T5", "T8", "B4"],
    hasAdaptiveSlot: true,
    // No transition — the final section is followed by result generation.
  },
];

export const SECTION_COUNT = DISCOVERY_SECTIONS.length;

export const SECTIONS_BY_ID: ReadonlyMap<string, DiscoverySection> = new Map(
  DISCOVERY_SECTIONS.map((s) => [s.id, s]),
);

// -------------------------------------------------------------------------
// Preparation screen (owner-locked, directive §5)
// -------------------------------------------------------------------------
//
// Shown once, after Context Question 2, before Discovery 1. It is not a
// question and produces no evidence record.

export const PREPARATION_SCREEN = {
  title: { sv: "Låt oss börja", en: "Let's begin" },
  body: {
    sv: [
      "Det här är inte ett prov med rätt eller fel svar.",
      "Vi försöker förstå vilken typ av säkerhetsarbete som bäst passar dina styrkor, drivkrafter och arbetssätt.",
      "Svara utifrån hur du oftast fungerar — inte hur du tror att man borde svara.",
      "Det tar ungefär 12–15 minuter.",
    ],
    en: [
      "This is not a test with right or wrong answers.",
      "We are exploring which types of security work best align with your strengths, motivations and preferred way of working.",
      "Answer based on how you usually operate — not how you think you should answer.",
      "It takes approximately 12–15 minutes.",
    ],
  },
  cta: { sv: "Starta min Discovery", en: "Start my Discovery" },
} as const;
