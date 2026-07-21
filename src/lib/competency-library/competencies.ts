import type { CompetencyDefinition } from "./types";

// The 19 competencies backing Public Career Assessment v1.0 (see
// docs/job-intelligence/public-career-assessment-v1-spec.md §7 and
// docs/architecture/competency-library.md for the full per-question tagging
// and dimension fan-in rationale). All bilingual text below is a first draft
// pending native-speaker review, same status as the question content it
// describes.
export const competencies: CompetencyDefinition[] = [
  {
    id: "comp-integrity",
    slug: "comp-integrity",
    name: { sv: "Integritet", en: "Integrity" },
    description: {
      sv: "Att agera hederligt och följa regler även när ingen kontrollerar det.",
      en: "Acting honestly and following rules even when no one is checking.",
    },
    dimensions: ["structure_documentation", "conflict_management"],
    status: "provisional",
  },
  {
    id: "comp-judgement",
    slug: "comp-judgement",
    name: { sv: "Omdöme", en: "Judgement" },
    description: {
      sv: "Att fatta väl avvägda beslut och ompröva dem när ny information tillkommer.",
      en: "Making well-weighed decisions and reconsidering them as new information arrives.",
    },
    dimensions: ["independent_decision_making", "analytical_orientation"],
    status: "provisional",
  },
  {
    id: "comp-reliability",
    slug: "comp-reliability",
    name: { sv: "Pålitlighet", en: "Reliability" },
    description: {
      sv: "Att hålla samma standard på ansvar och uppgifter oavsett uppsikt.",
      en: "Holding the same standard of responsibility and follow-through regardless of oversight.",
    },
    dimensions: ["structure_documentation", "risk_awareness", "independent_decision_making"],
    status: "provisional",
  },
  {
    id: "comp-clear-communication",
    slug: "comp-clear-communication",
    name: { sv: "Tydlig kommunikation", en: "Clear communication" },
    description: {
      sv: "Att förmedla fakta tydligt och i rätt ordning, särskilt under tidspress.",
      en: "Conveying facts clearly and in order, especially under time pressure.",
    },
    dimensions: ["communication"],
    status: "provisional",
  },
  {
    id: "comp-collaboration",
    slug: "comp-collaboration",
    name: { sv: "Samarbetsförmåga", en: "Collaboration" },
    description: {
      sv: "Att arbeta konstruktivt med andra, även vid oenighet eller olika arbetssätt.",
      en: "Working constructively with others, including through disagreement or differing methods.",
    },
    dimensions: ["teamwork", "independent_decision_making", "learning_development"],
    status: "provisional",
  },
  {
    id: "comp-risk-recognition",
    slug: "comp-risk-recognition",
    name: { sv: "Riskidentifiering", en: "Risk recognition" },
    description: {
      sv: "Att proaktivt tänka igenom vad som kan gå fel innan det händer.",
      en: "Proactively thinking through what could go wrong before it happens.",
    },
    dimensions: ["risk_awareness"],
    status: "provisional",
  },
  {
    id: "comp-prioritisation",
    slug: "comp-prioritisation",
    name: { sv: "Prioritering", en: "Prioritisation" },
    description: {
      sv: "Att hålla huvudet kallt och välja rätt sak att göra först när flera saker kräver uppmärksamhet.",
      en: "Staying composed and choosing the right thing to act on first when several things demand attention.",
    },
    dimensions: ["operational_orientation", "conflict_management"],
    status: "provisional",
  },
  {
    id: "comp-learning-agility",
    slug: "comp-learning-agility",
    name: { sv: "Lärandeförmåga", en: "Learning agility" },
    description: {
      sv: "Att snabbt sätta sig in i nytt material eller nya arbetssätt.",
      en: "Quickly getting up to speed on new material or new ways of working.",
    },
    dimensions: ["learning_development"],
    status: "provisional",
  },
  {
    id: "comp-situational-awareness",
    slug: "comp-situational-awareness",
    name: { sv: "Situationsmedvetenhet", en: "Situational awareness" },
    description: {
      sv: "Att lägga märke till avvikelser från det normala i sin omgivning.",
      en: "Noticing deviations from normal in one's surroundings.",
    },
    dimensions: ["risk_awareness"],
    status: "provisional",
  },
  {
    id: "comp-procedural-discipline",
    slug: "comp-procedural-discipline",
    name: { sv: "Rutindisciplin", en: "Procedural discipline" },
    description: {
      sv: "Att följa fastställda rutiner konsekvent, även när en genväg känns bättre.",
      en: "Consistently following established procedures, even when a shortcut feels better.",
    },
    dimensions: ["structure_documentation"],
    status: "provisional",
  },
  {
    id: "comp-escalation-judgement",
    slug: "comp-escalation-judgement",
    name: { sv: "Eskaleringsbedömning", en: "Escalation judgement" },
    description: {
      sv: "Att avgöra när en situation ska föras vidare, och att hantera den lugnt under tiden.",
      en: "Judging when a situation should be escalated, and handling it calmly in the meantime.",
    },
    dimensions: ["conflict_management", "communication"],
    status: "provisional",
  },
  {
    id: "comp-judgement-under-uncertainty",
    slug: "comp-judgement-under-uncertainty",
    name: { sv: "Beslut under osäkerhet", en: "Judgement under uncertainty" },
    description: {
      sv: "Att agera förnuftigt när information är ofullständig eller motsägelsefull.",
      en: "Acting sensibly when information is incomplete or conflicting.",
    },
    dimensions: ["independent_decision_making", "analytical_orientation"],
    status: "provisional",
  },
  {
    id: "comp-adaptability",
    slug: "comp-adaptability",
    name: { sv: "Anpassningsförmåga", en: "Adaptability" },
    description: {
      sv: "Att ställa om till en förändrad rutin eller situation utan att tappa driv.",
      en: "Adjusting to a changed procedure or situation without losing momentum.",
    },
    dimensions: ["learning_development", "operational_orientation"],
    status: "provisional",
  },
  {
    id: "comp-reporting-quality",
    slug: "comp-reporting-quality",
    name: { sv: "Rapporteringskvalitet", en: "Reporting quality" },
    description: {
      sv: "Att dokumentera det som hänt tydligt och i tid, även när det är frestande att skjuta upp det.",
      en: "Documenting what happened clearly and promptly, even when it's tempting to put off.",
    },
    dimensions: ["structure_documentation"],
    status: "provisional",
  },
  {
    id: "comp-work-environment-preference",
    slug: "comp-work-environment-preference",
    name: { sv: "Miljöpreferens", en: "Work environment preference" },
    description: {
      sv: "Vilken typ av arbetsmiljö och kontaktyta mot allmänheten som passar bäst.",
      en: "Which kind of work environment and public-facing exposure suits best.",
    },
    dimensions: ["service_orientation", "communication"],
    status: "provisional",
  },
  {
    id: "comp-career-direction-preference",
    slug: "comp-career-direction-preference",
    name: { sv: "Karriärriktning", en: "Career direction preference" },
    description: {
      sv: "Vilken typ av framtida roll eller specialisering som lockar mest.",
      en: "Which kind of future role or specialisation is most appealing.",
    },
    dimensions: [
      "analytical_orientation",
      "strategic_orientation",
      "operational_orientation",
      "technical_orientation",
      "structure_documentation",
      "service_orientation",
      "leadership_orientation",
      "investigation_orientation",
      "teamwork", // the "coordination" option also weights teamwork alongside leadership_orientation
    ],
    status: "provisional",
  },
  {
    id: "comp-work-motivation",
    slug: "comp-work-motivation",
    name: { sv: "Arbetsmotivation", en: "Work motivation" },
    description: {
      sv: "Att hålla samma standard på enkla eller upprepande uppgifter som på mer intressanta.",
      en: "Holding the same standard on simple or repetitive tasks as on more interesting ones.",
    },
    dimensions: ["operational_orientation", "structure_documentation"],
    status: "provisional",
  },
  {
    id: "comp-service-disposition",
    slug: "comp-service-disposition",
    name: { sv: "Serviceinriktning", en: "Service disposition" },
    description: {
      sv: "Att möta människor hjälpsamt, även när det inte är ens egen uppgift.",
      en: "Meeting people helpfully, even when it isn't strictly one's own task.",
    },
    dimensions: ["service_orientation", "communication", "conflict_management"],
    status: "provisional",
  },
  {
    id: "comp-composure-under-pressure",
    slug: "comp-composure-under-pressure",
    name: { sv: "Lugn under press", en: "Composure under pressure" },
    description: {
      sv: "Att hålla huvudet kallt och agera fokuserat när flera saker sker samtidigt eller känslor är inblandade.",
      en: "Staying calm and focused when multiple things happen at once or emotions are involved.",
    },
    dimensions: ["operational_orientation", "conflict_management", "communication"],
    status: "provisional",
  },
];

export const competencyBySlug: Record<string, CompetencyDefinition> = Object.fromEntries(
  competencies.map((c) => [c.slug, c]),
);
