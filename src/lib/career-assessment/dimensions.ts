import type { Dimension, DimensionId } from "./types";

export const dimensions: Dimension[] = [
  {
    id: "operational_orientation",
    name: { sv: "Operativ läggning", en: "Operational orientation" },
    description: {
      sv: "Trivsel med fältarbete, direkt insats och konkreta säkerhetsuppgifter.",
      en: "Comfort with field work, hands-on delivery and concrete security tasks.",
    },
    explanationKey: "dim.operational_orientation",
    status: "provisional",
  },
  {
    id: "leadership_orientation",
    name: { sv: "Ledarskapsläggning", en: "Leadership orientation" },
    description: {
      sv: "Vilja att leda team, ta ansvar för andras arbete och driva beslut.",
      en: "Willingness to lead teams, own others' work and drive decisions.",
    },
    explanationKey: "dim.leadership_orientation",
    status: "provisional",
  },
  {
    id: "analytical_orientation",
    name: { sv: "Analytisk läggning", en: "Analytical orientation" },
    description: {
      sv: "Nyfikenhet på data, mönster och strukturerad problemlösning.",
      en: "Curiosity for data, patterns and structured problem-solving.",
    },
    explanationKey: "dim.analytical_orientation",
    status: "provisional",
  },
  {
    id: "technical_orientation",
    name: { sv: "Teknisk läggning", en: "Technical orientation" },
    description: {
      sv: "Intresse för säkerhetsteknik, system och tekniska lösningar.",
      en: "Interest in security technology, systems and technical solutions.",
    },
    explanationKey: "dim.technical_orientation",
    status: "provisional",
  },
  {
    id: "strategic_orientation",
    name: { sv: "Strategisk läggning", en: "Strategic orientation" },
    description: {
      sv: "Att tänka långsiktigt, planera i horisonter och forma helhet.",
      en: "Thinking long-term, planning in horizons and shaping the whole.",
    },
    explanationKey: "dim.strategic_orientation",
    status: "provisional",
  },
  {
    id: "risk_awareness",
    name: { sv: "Riskmedvetenhet", en: "Risk awareness" },
    description: {
      sv: "Naturligt sinne för potentiella risker och konsekvensbedömning.",
      en: "A natural sense for potential risks and their consequences.",
    },
    explanationKey: "dim.risk_awareness",
    status: "provisional",
  },
  {
    id: "communication",
    name: { sv: "Kommunikation", en: "Communication" },
    description: {
      sv: "Förmåga att uttrycka sig tydligt, särskilt under press.",
      en: "Ability to communicate clearly, especially under pressure.",
    },
    explanationKey: "dim.communication",
    status: "provisional",
  },
  {
    id: "service_orientation",
    name: { sv: "Serviceläggning", en: "Service orientation" },
    description: {
      sv: "Trivsel med att möta människor och representera en verksamhet.",
      en: "Comfort meeting people and representing an organisation.",
    },
    explanationKey: "dim.service_orientation",
    status: "provisional",
  },
  {
    id: "conflict_management",
    name: { sv: "Konflikthantering", en: "Conflict management" },
    description: {
      sv: "Förmåga att lugna, deeskalera och hantera pressade möten.",
      en: "Ability to calm situations, de-escalate and handle high-tension encounters.",
    },
    explanationKey: "dim.conflict_management",
    status: "provisional",
  },
  {
    id: "investigation_orientation",
    name: { sv: "Utredningsläggning", en: "Investigation orientation" },
    description: {
      sv: "Intresse för utredning, granskning och att följa spår.",
      en: "Interest in investigation, scrutiny and following the trail.",
    },
    explanationKey: "dim.investigation_orientation",
    status: "provisional",
  },
  {
    id: "structure_documentation",
    name: { sv: "Struktur och dokumentation", en: "Structure & documentation" },
    description: {
      sv: "Att arbeta metodiskt, följa rutiner och dokumentera väl.",
      en: "Working methodically, following procedures and documenting well.",
    },
    explanationKey: "dim.structure_documentation",
    status: "provisional",
  },
  {
    id: "independent_decision_making",
    name: { sv: "Självständigt beslutsfattande", en: "Independent decision-making" },
    description: {
      sv: "Att kunna ta beslut i stunden när det behövs.",
      en: "Making decisions in the moment when the situation demands it.",
    },
    explanationKey: "dim.independent_decision_making",
    status: "provisional",
  },
  {
    id: "teamwork",
    name: { sv: "Samarbete", en: "Teamwork" },
    description: {
      sv: "Att fungera väl i team, samverka och bidra till gruppens resultat.",
      en: "Working well in teams and contributing to shared results.",
    },
    explanationKey: "dim.teamwork",
    status: "provisional",
  },
  {
    id: "learning_development",
    name: { sv: "Lärande och utveckling", en: "Learning & development" },
    description: {
      sv: "Vilja att bygga kompetens genom kurser, certifikat och praktik.",
      en: "Drive to build competence through courses, certifications and practice.",
    },
    explanationKey: "dim.learning_development",
    status: "provisional",
  },
];

export const dimensionById: Record<DimensionId, Dimension> = Object.fromEntries(
  dimensions.map((d) => [d.id, d]),
) as Record<DimensionId, Dimension>;

export const allDimensionIds: DimensionId[] = dimensions.map((d) => d.id);