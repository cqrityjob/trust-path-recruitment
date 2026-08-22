// The released brief behind the Väktare recruitment assessment, as it stands
// in the hosted test tenant (participant 4C42C8, submitted 2026-08-21).
//
// Transcribed from the released report rather than invented: the signals, task
// counts, the reviewer's safety finding, the wording of each "why" line and
// each self-report pattern are the ones the engine actually produced. Two
// suites and the worked example in
// docs/employer/recruitment-decision-support-report-v2.md read from here, so
// none of them can drift from the others or from the real thing.
//
// It carries no name, no address and no subject id, because the brief it
// mirrors carries none either.

import type {
  InterviewGuideEntry,
  ObservedArea,
  ReportContext,
  SelfReportedArea,
} from "../../src/lib/security-competency/academy-employer.functions";
import type { DecisionSupportInput } from "../../src/lib/security-competency/decision-support";

const area = (
  areaCode: string,
  areaSv: string,
  areaEn: string,
  signal: ObservedArea["signal"],
  items: number,
  whySv: string,
  behaviourSv: string,
): ObservedArea => ({
  areaCode,
  areaSv,
  areaEn,
  evidenceType: "observed",
  signal,
  items,
  mean: 0.5,
  spread: signal === "mixed" ? 0.83 : 0.2,
  evidenceState: signal === "limited" ? "not_yet_shown" : "follow_up",
  behaviourSv,
  behaviourEn: `EN ${areaCode} behaviour`,
  whySv,
  whyEn: `EN ${areaCode} why`,
});

export const OBSERVED: ObservedArea[] = [
  area(
    "communication",
    "Kommunikation och informationskvalitet",
    "Communication and information quality",
    "developing",
    6,
    "Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (6 uppgifter).",
    "Förmedlar tydlig och verifierbar information till rätt mottagare. Rapporterar det som observerats, skilt från egen tolkning.",
  ),
  area(
    "situational_awareness",
    "Situationsmedvetenhet",
    "Situational awareness",
    "developing",
    4,
    "Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (4 uppgifter).",
    "Bedömer situationen utifrån det som faktiskt observeras innan hen agerar.",
  ),
  area(
    "accountability",
    "Ansvarstagande och tillförlitlighet",
    "Accountability and reliability",
    "mixed",
    4,
    "Svaren skilde sig åt mellan jämförbara uppgifter (4 uppgifter, spännvidd 0.83).",
    "Håller sig inom sitt mandat och eskalerar när gränsen nås.",
  ),
  area(
    "integrity",
    "Integritet och etik",
    "Integrity and ethics",
    "limited",
    2,
    "Endast 2 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    "Hanterar känslig information enligt uppdrag och regelverk.",
  ),
  area(
    "pressure",
    "Beslutsfattande under press",
    "Decision-making under pressure",
    "limited",
    2,
    "Endast 2 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    "Väljer den minst ingripande åtgärd som löser situationen.",
  ),
  area(
    "service",
    "Respektfull service och gränshållning",
    "Respectful service and holding a line",
    "limited",
    2,
    "Endast 2 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    "Sänker spänningsnivån verbalt innan situationen trappas upp.",
  ),
  area(
    "judgement",
    "Professionellt omdöme och proportionalitet",
    "Professional judgement and proportionality",
    "limited",
    2,
    "Endast 2 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    "Väljer den minst ingripande åtgärd som löser situationen.",
  ),
  area(
    "cooperation",
    "Samarbete och samordning",
    "Cooperation and coordination",
    "limited",
    1,
    "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    "Samordnar egna åtgärder med kollegor och andra funktioner.",
  ),
];

const self = (
  domainKey: string,
  domainSv: string,
  domainEn: string,
  pattern: SelfReportedArea["pattern"],
  consistency: SelfReportedArea["consistency"],
): SelfReportedArea => ({
  domainKey,
  domainSv,
  domainEn,
  areaCode: domainKey,
  evidenceType: "self_reported",
  pattern,
  consistency,
  items: 3,
  whySv:
    consistency === "varied"
      ? `Svaren varierade mellan närliggande frågor om ${domainSv.toLowerCase()}. Utforska området i intervju.`
      : undefined,
});

export const SELF_REPORTED: SelfReportedArea[] = [
  self("recovery", "Återhämtning", "Recovery", "mostly_described", "varied"),
  self(
    "escalation",
    "Eskalering och överlämning",
    "Escalation and handover",
    "mostly_described",
    "varied",
  ),
  self("boundaries", "Gränshållning", "Holding a line", "mostly_described", "varied"),
  self("scanning", "Aktiv scanning", "Active scanning", "consistently_described", "consistent"),
  self("anomaly", "Avvikelseigenkänning", "Anomaly recognition", "rarely_described", "consistent"),
  self(
    "error_ownership",
    "Fel- och avvikelseansvar",
    "Error and deviation ownership",
    "consistently_described",
    "consistent",
  ),
  self(
    "discipline",
    "Genomförandedisciplin",
    "Execution discipline",
    "consistently_described",
    "consistent",
  ),
  self(
    "rule_loyalty",
    "Regel- och syfteslojalitet",
    "Loyalty to rule and purpose",
    "rarely_described",
    "consistent",
  ),
];

export const INTERVIEW_GUIDE: InterviewGuideEntry[] = [
  {
    areaCode: "situational_awareness",
    areaSv: "Situationsmedvetenhet",
    areaEn: "Situational awareness",
    focus: "explore_development",
    evidenceType: "observed",
    whySv:
      "Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (4 uppgifter).",
    whyEn: "EN why",
    questionSv: "Berätta om en gång då du märkte att något inte stämde på en plats du kände väl.",
    questionEn: "Tell me about a time you noticed something was off in a place you knew well.",
    followupSv: "Vad var det konkret som fick dig att reagera, och vad gjorde du sedan?",
    followupEn: "What specifically made you react, and what did you do next?",
    listenForSv: [
      "Namnger observerbara detaljer, inte en känsla",
      "Beskriver normalbilden hen jämförde mot",
      "Följde upp i stället för att låta det passera",
      "Skiljer på vad hen såg och vad hen antog",
    ],
    listenForEn: ["Names observable detail, not a feeling"],
  },
  {
    areaCode: "communication",
    areaSv: "Kommunikation och informationskvalitet",
    areaEn: "Communication and information quality",
    focus: "explore_development",
    evidenceType: "observed",
    whySv:
      "Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (6 uppgifter).",
    whyEn: "EN why",
    questionSv:
      "Berätta om en rapport eller en överlämning du skrivit som fick konsekvenser för någon annan.",
    questionEn: "Tell me about a report or handover you wrote that had consequences for someone.",
    followupSv: "Hur avgjorde du vad som skulle med och vad som kunde utelämnas?",
    followupEn: "How did you decide what to include and what to leave out?",
    listenForSv: ["Skiljer iakttagelse från slutsats i sitt eget språk"],
    listenForEn: ["Separates observation from conclusion"],
  },
  {
    areaCode: "accountability",
    areaSv: "Ansvarstagande och tillförlitlighet",
    areaEn: "Accountability and reliability",
    focus: "explore_development",
    evidenceType: "observed",
    whySv: "Svaren skilde sig åt mellan jämförbara uppgifter (4 uppgifter, spännvidd 0.83).",
    whyEn: "EN why",
    questionSv: "Berätta om ett misstag du gjort i tjänsten som ingen annan hade märkt.",
    questionEn: "Tell me about a mistake on duty that nobody else would have noticed.",
    followupSv: "Vad gjorde du efteråt, och vem fick veta?",
    followupEn: "What did you do afterwards, and who was told?",
    listenForSv: ["Berättar om ett verkligt misstag, inte en styrka i förklädnad"],
    listenForEn: ["Tells a real mistake"],
  },
  {
    areaCode: "integrity",
    areaSv: "Integritet och etik",
    areaEn: "Integrity and ethics",
    focus: "explore_limited_evidence",
    evidenceType: "observed",
    whySv:
      "Endast 2 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
    whyEn: "EN why",
    questionSv: "Vad räknar du som ett integritetsproblem i väktararbete?",
    questionEn: "What counts as an integrity problem in security work, to you?",
    followupSv: "Vad hände, och vad hade du gjort annorlunda?",
    followupEn: "What happened, and what would you have done differently?",
    listenForSv: ["Ser vardagliga situationer, inte bara grova fall"],
    listenForEn: ["Sees everyday situations"],
  },
  // Shares an area code with the OBSERVED "Beslutsfattande under press" line
  // above, and is self-reported. The competency card for that area must show
  // no question rather than this one: a question drawn from a self-description
  // on an observed card is the blur the whole report is built to prevent.
  {
    areaCode: "pressure",
    areaSv: "Återhämtning",
    areaEn: "Recovery",
    focus: "explore_self_report",
    evidenceType: "self_reported",
    whySv: "Svaren varierade mellan närliggande frågor om återhämtning.",
    whyEn: "EN why",
    questionSv: "SJÄLVRAPPORTERAD FRÅGA — får inte hamna på ett observerat kort.",
    questionEn: "SELF-REPORTED QUESTION — must not land on an observed card.",
    followupSv: "Vad märkte du på dig själv?",
    followupEn: "What did you notice in yourself?",
    listenForSv: ["Kan beskriva den egna reaktionen konkret"],
    listenForEn: ["Can describe their own reaction"],
  },
  {
    areaCode: "rule_loyalty",
    areaSv: "Regel- och syfteslojalitet",
    areaEn: "Loyalty to rule and purpose",
    focus: "explore_self_report",
    evidenceType: "self_reported",
    whySv:
      "Deltagaren beskriver att hen sällan arbetar så (3 frågor). Detta är självrapporterat och inte observerat.",
    whyEn: "EN why",
    questionSv: "Berätta om en gång då någon frågade dig om något du visste men inte fick berätta.",
    questionEn:
      "Tell me about a time someone asked you about something you knew but could not share.",
    followupSv: "Hur formulerade du dig, och hur togs det emot?",
    followupEn: "How did you put it, and how was it received?",
    listenForSv: ["Kan säga nej utan att göra frågeställaren till motståndare"],
    listenForEn: ["Can say no without making an opponent"],
  },
];

export const CONTEXT: ReportContext = {
  participantRef: "4C42C8",
  personContext: "candidate",
  organisationName: "Säkerhet AB",
  purposeCode: "closed_test_recruitment",
  assessmentNameSv: "Väktare – Recruitment Assessment",
  assessmentNameEn: "Security Officer – Recruitment Assessment",
  assessmentVersion: 1,
  submittedAt: "2026-08-21T10:00:00.000Z",
  reviewsTotal: 1,
  reviewsCompleted: 1,
  evidenceObservations: 23,
  evidenceContexts: 1,
  selfReportObservations: 24,
  humanReviewOccurred: true,
  safetyConcernPresent: true,
};

/** The real run: one reviewer-confirmed safety-critical response. */
export const SAFETY_FLAGS = 1;

export const PACE = { rapidAnswers: 44, answered: 50 };

export function candidateInput(over: Partial<DecisionSupportInput> = {}): DecisionSupportInput {
  return {
    observed: OBSERVED,
    selfReported: SELF_REPORTED,
    interviewGuide: INTERVIEW_GUIDE,
    safetyFlagCount: SAFETY_FLAGS,
    observedObservations: 23,
    selfReportObservations: 24,
    evidenceContexts: 1,
    reviewsTotal: 1,
    reviewsCompleted: 1,
    // The catalogue paragraph the database freezes. Kept here so the suites can
    // prove the composed summary is NOT this.
    frozenSummary: {
      sv: "Inget område nådde sammanhållet observerat underlag i den här bedömningen. Underlaget var mer blandat kring Ansvarstagande och tillförlitlighet, där svaren skilde sig åt mellan jämförbara uppgifter. Svaren låg genomgående lägre inom Kommunikation och informationskvalitet och Situationsmedvetenhet. Beslutsfattande under press, Integritet och etik, Professionellt omdöme och proportionalitet, Respektfull service och gränshållning och Samarbete och samordning berördes för lite i bedömningen för att säga något, vilket inte ska läsas som en svaghet. Självrapporterade svar beskriver ett genomgående arbetssätt kring aktiv scanning, fel- och avvikelseansvar och genomförandedisciplin. Svaren varierade mellan närliggande frågor om återhämtning, eskalering och överlämning och gränshållning — värt att utforska i intervju. Underlaget kommer från ett bedömningstillfälle och är beslutsstöd inför intervju, inte ett anställningsbeslut.",
      en: "No area reached consistent observed evidence in this assessment.",
    },
    ...over,
  };
}
