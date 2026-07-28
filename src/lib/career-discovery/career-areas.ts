// The 14 canonical Security Career Areas and their requirement profiles.
//
// Area keys are reused UNCHANGED from the Career Intelligence Graph — see
// career-intelligence-mapping-v3.0.md §2. This module adds the per-axis
// tolerance bands v3.0 needs for matching; it does not redefine the areas.
//
// ── BANDS, NOT POINTS ──────────────────────────────────────────────────
//
// Each area declares a RANGE per axis, with an importance weight. Being
// inside the band is a fit; being outside is a distance. This fixes audit
// findings F-2 and F-5: the previous model used a point target and
// symmetric distance, so a maximally learning-oriented candidate was
// penalised for exceeding a target.
//
// There are NO hard gates. F-1 recorded the worst defect in the old system
// — `gateThreshold = 55` meant three of five eligibility gates were decided
// by which boxes a candidate ticked on one question. Importance weighting
// replaces gating: an axis can matter a great deal without being a wall.
//
// ── VALIDATION STATUS: design ──────────────────────────────────────────
//
// These bands are AUTHORED, NOT REVIEWED. career-intelligence-mapping-v3.0
// §3 requires that no profile ships unreviewed at [V1] — an area with an
// unreviewed profile is not recommended at all. That rule binds at V1; for
// internal testing the bands are used and the report's Method section
// states plainly that they are unreviewed. `AREA_PROFILE_VALIDATION_STATUS`
// is the single flag a reviewer flips, and the report reads it rather than
// hard-coding the claim.

import type { Bi, CareerOrientationAxisId } from "./types";

export const AREA_PROFILE_VALIDATION_STATUS = "design" as const;

export type SecurityCareerAreaId =
  | "protective_operations"
  | "public_safety_justice"
  | "corrections_secure_transport"
  | "defence_national_security"
  | "corporate_security"
  | "critical_infrastructure_security"
  | "risk_management"
  | "crisis_management"
  | "business_continuity_resilience"
  | "cyber_information_security"
  | "financial_crime_compliance"
  | "security_technology"
  | "security_leadership_governance"
  | "investigations_intelligence";

export interface AxisBand {
  axis: CareerOrientationAxisId;
  low: number;
  high: number;
  /** 1 = relevant · 2 = important · 3 = defining. Never a gate. */
  importance: 1 | 2 | 3;
}

export interface SecurityCareerArea {
  id: SecurityCareerAreaId;
  name: Bi;
  summary: Bi;
  bands: AxisBand[];
  /** Areas requiring a state authority (police, defence, corrections) carry
   *  a mandatory disclaimer: CQrityjob does not recruit for them and the
   *  authority's own process is the only route. */
  authorityRoute: boolean;
}

const b = (
  axis: CareerOrientationAxisId,
  low: number,
  high: number,
  importance: 1 | 2 | 3,
): AxisBand => ({ axis, low, high, importance });

export const SECURITY_CAREER_AREAS: readonly SecurityCareerArea[] = [
  {
    id: "protective_operations",
    name: { sv: "Bevakning och skydd", en: "Protective Operations" },
    summary: {
      sv: "Att vara på plats och skapa trygghet — bevakning, ordning och skydd av människor och egendom.",
      en: "Being present and creating safety — guarding, order, and protecting people and property.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.7, 1.0, 3),
      b("CDA-02", 0.5, 1.0, 2),
      b("CDA-03", 0.5, 0.9, 2),
      b("CDA-04", 0.4, 0.9, 2),
      b("CDA-05", 0.0, 0.4, 1),
      b("CDA-06", 0.0, 0.5, 1),
      b("CDA-07", 0.0, 0.5, 1),
      b("CDA-08", 0.0, 0.4, 2),
    ],
  },
  {
    id: "public_safety_justice",
    name: { sv: "Polis och rättsväsende", en: "Public Safety & Justice" },
    summary: {
      sv: "Samhällets ordning och rättskedja — arbete nära människor i skarpa lägen.",
      en: "Public order and the justice chain — work close to people in demanding situations.",
    },
    authorityRoute: true,
    bands: [
      b("CDA-01", 0.6, 1.0, 3),
      b("CDA-02", 0.7, 1.0, 3),
      b("CDA-03", 0.4, 0.8, 2),
      b("CDA-04", 0.6, 1.0, 2),
      b("CDA-05", 0.0, 0.5, 1),
      b("CDA-06", 0.3, 0.8, 2),
      b("CDA-07", 0.2, 0.7, 1),
      b("CDA-08", 0.0, 0.5, 1),
    ],
  },
  {
    id: "corrections_secure_transport",
    name: { sv: "Kriminalvård och säkerhetstransport", en: "Corrections & Secure Transport" },
    summary: {
      sv: "Säker hantering och transport av personer, med hög procedurtrohet.",
      en: "Safe handling and transport of people, with high procedural fidelity.",
    },
    authorityRoute: true,
    bands: [
      b("CDA-01", 0.7, 1.0, 3),
      b("CDA-02", 0.4, 0.8, 2),
      b("CDA-03", 0.7, 1.0, 3),
      b("CDA-04", 0.3, 0.8, 1),
      b("CDA-05", 0.0, 0.4, 1),
      b("CDA-06", 0.0, 0.5, 1),
      b("CDA-07", 0.1, 0.6, 1),
      b("CDA-08", 0.0, 0.4, 2),
    ],
  },
  {
    id: "defence_national_security",
    name: { sv: "Försvar och nationell säkerhet", en: "Defence & National Security" },
    summary: {
      sv: "Skydd av nationella intressen, ofta i strukturerade och reglerade miljöer.",
      en: "Protecting national interests, often in structured and regulated environments.",
    },
    authorityRoute: true,
    bands: [
      b("CDA-01", 0.5, 1.0, 2),
      b("CDA-02", 0.3, 0.8, 1),
      b("CDA-03", 0.6, 1.0, 3),
      b("CDA-04", 0.3, 0.8, 1),
      b("CDA-05", 0.3, 0.8, 2),
      b("CDA-06", 0.4, 0.9, 2),
      b("CDA-07", 0.3, 0.8, 2),
      b("CDA-08", 0.4, 0.9, 2),
    ],
  },
  {
    id: "corporate_security",
    name: { sv: "Företagssäkerhet", en: "Corporate Security" },
    summary: {
      sv: "Att hålla en verksamhet trygg — bred roll som spänner över människor, rutiner och risk.",
      en: "Keeping an organisation safe — a broad role spanning people, procedure and risk.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.2, 0.7, 1),
      b("CDA-02", 0.5, 1.0, 2),
      b("CDA-03", 0.3, 0.8, 1),
      b("CDA-04", 0.2, 0.7, 1),
      b("CDA-05", 0.3, 0.8, 1),
      b("CDA-06", 0.3, 0.8, 2),
      b("CDA-07", 0.4, 0.9, 2),
      b("CDA-08", 0.5, 1.0, 3),
    ],
  },
  {
    id: "critical_infrastructure_security",
    name: { sv: "Skydd av samhällsviktig verksamhet", en: "Critical Infrastructure Security" },
    summary: {
      sv: "Skydd av anläggningar och funktioner som samhället är beroende av.",
      en: "Protecting the facilities and functions society depends on.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.3, 0.8, 2),
      b("CDA-02", 0.0, 0.5, 1),
      b("CDA-03", 0.7, 1.0, 3),
      b("CDA-04", 0.2, 0.7, 1),
      b("CDA-05", 0.4, 0.9, 2),
      b("CDA-06", 0.3, 0.8, 1),
      b("CDA-07", 0.2, 0.7, 1),
      b("CDA-08", 0.4, 0.9, 2),
    ],
  },
  {
    id: "risk_management",
    name: { sv: "Riskhantering", en: "Risk Management" },
    summary: {
      sv: "Att förstå vad som kan gå fel innan det gör det, och vad det betyder för verksamheten.",
      en: "Understanding what could go wrong before it does, and what it means for the organisation.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.0, 0.4, 3),
      b("CDA-02", 0.2, 0.7, 1),
      b("CDA-03", 0.0, 0.5, 2),
      b("CDA-04", 0.0, 0.4, 2),
      b("CDA-05", 0.3, 0.8, 1),
      b("CDA-06", 0.5, 1.0, 2),
      b("CDA-07", 0.2, 0.7, 1),
      b("CDA-08", 0.7, 1.0, 3),
    ],
  },
  {
    id: "crisis_management",
    name: { sv: "Krishantering", en: "Crisis Management" },
    summary: {
      sv: "Att leda och samordna när något allvarligt inträffar.",
      en: "Leading and coordinating when something serious happens.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.4, 0.9, 1),
      b("CDA-02", 0.6, 1.0, 2),
      b("CDA-03", 0.3, 0.8, 1),
      b("CDA-04", 0.7, 1.0, 3),
      b("CDA-05", 0.2, 0.7, 1),
      b("CDA-06", 0.3, 0.8, 1),
      b("CDA-07", 0.5, 1.0, 2),
      b("CDA-08", 0.5, 1.0, 2),
    ],
  },
  {
    id: "business_continuity_resilience",
    name: { sv: "Kontinuitet och motståndskraft", en: "Business Continuity & Resilience" },
    summary: {
      sv: "Att bygga förmågan att fortsätta fungera när något stör verksamheten.",
      en: "Building the capacity to keep functioning when something disrupts the organisation.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.0, 0.4, 2),
      b("CDA-02", 0.2, 0.7, 1),
      b("CDA-03", 0.5, 1.0, 2),
      b("CDA-04", 0.0, 0.4, 3),
      b("CDA-05", 0.3, 0.8, 1),
      b("CDA-06", 0.3, 0.8, 1),
      b("CDA-07", 0.3, 0.8, 1),
      b("CDA-08", 0.6, 1.0, 3),
    ],
  },
  {
    id: "cyber_information_security",
    name: { sv: "Cyber- och informationssäkerhet", en: "Cyber & Information Security" },
    summary: {
      sv: "Skydd av system, data och digitala miljöer.",
      en: "Protecting systems, data and digital environments.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.0, 0.3, 3),
      b("CDA-02", 0.0, 0.5, 2),
      b("CDA-03", 0.3, 0.8, 1),
      b("CDA-04", 0.2, 0.8, 1),
      b("CDA-05", 0.7, 1.0, 3),
      b("CDA-06", 0.5, 1.0, 2),
      b("CDA-07", 0.0, 0.6, 1),
      b("CDA-08", 0.4, 0.9, 1),
    ],
  },
  {
    id: "financial_crime_compliance",
    name: { sv: "Finansiell brottslighet och regelefterlevnad", en: "Financial Crime & Compliance" },
    summary: {
      sv: "Att upptäcka och förhindra ekonomisk brottslighet, och säkerställa att regler följs.",
      en: "Detecting and preventing financial crime, and ensuring rules are followed.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.0, 0.3, 3),
      b("CDA-02", 0.1, 0.6, 1),
      b("CDA-03", 0.5, 1.0, 2),
      b("CDA-04", 0.0, 0.5, 2),
      b("CDA-05", 0.4, 0.9, 1),
      b("CDA-06", 0.7, 1.0, 3),
      b("CDA-07", 0.0, 0.6, 1),
      b("CDA-08", 0.4, 0.9, 1),
    ],
  },
  {
    id: "security_technology",
    name: { sv: "Säkerhetsteknik", en: "Security Technology" },
    summary: {
      sv: "Larm, kameror, passersystem och tekniken som håller skyddet igång.",
      en: "Alarms, cameras, access systems and the technology that keeps protection working.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.1, 0.6, 1),
      b("CDA-02", 0.0, 0.5, 2),
      b("CDA-03", 0.4, 0.9, 1),
      b("CDA-04", 0.2, 0.7, 1),
      b("CDA-05", 0.7, 1.0, 3),
      b("CDA-06", 0.3, 0.8, 1),
      b("CDA-07", 0.0, 0.6, 1),
      b("CDA-08", 0.2, 0.7, 1),
    ],
  },
  {
    id: "security_leadership_governance",
    name: { sv: "Säkerhetsledning och styrning", en: "Security Leadership & Governance" },
    summary: {
      sv: "Att leda människor och sätta riktningen för hela organisationens säkerhetsarbete.",
      en: "Leading people and setting the direction for an organisation's whole security effort.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.0, 0.5, 1),
      b("CDA-02", 0.5, 1.0, 2),
      b("CDA-03", 0.1, 0.6, 1),
      b("CDA-04", 0.2, 0.7, 1),
      b("CDA-05", 0.2, 0.7, 1),
      b("CDA-06", 0.2, 0.7, 1),
      b("CDA-07", 0.7, 1.0, 3),
      b("CDA-08", 0.7, 1.0, 3),
    ],
  },
  {
    id: "investigations_intelligence",
    name: { sv: "Utredning och underrättelse", en: "Investigations & Intelligence" },
    summary: {
      sv: "Att ta reda på vad som faktiskt hänt, och se mönstren andra missar.",
      en: "Finding out what actually happened, and seeing the patterns others miss.",
    },
    authorityRoute: false,
    bands: [
      b("CDA-01", 0.1, 0.6, 1),
      b("CDA-02", 0.2, 0.8, 1),
      b("CDA-03", 0.2, 0.7, 1),
      b("CDA-04", 0.1, 0.6, 1),
      b("CDA-05", 0.3, 0.8, 1),
      b("CDA-06", 0.7, 1.0, 3),
      b("CDA-07", 0.0, 0.6, 1),
      b("CDA-08", 0.2, 0.7, 1),
    ],
  },
];

export const AREAS_BY_ID: ReadonlyMap<SecurityCareerAreaId, SecurityCareerArea> = new Map(
  SECURITY_CAREER_AREAS.map((a) => [a.id, a]),
);

/** Mandatory disclaimer for areas reached only through a state authority.
 *  CQrityjob does not recruit for these and must never imply otherwise. */
export const AUTHORITY_DISCLAIMER: Bi = {
  sv: "Den här inriktningen nås genom myndighetens egen antagningsprocess. CQrityjob rekryterar inte till den, och det här är vägledning — inte en bedömning av om du skulle antas.",
  en: "This direction is reached through the authority's own admissions process. CQrityjob does not recruit for it, and this is guidance — not an assessment of whether you would be admitted.",
};
