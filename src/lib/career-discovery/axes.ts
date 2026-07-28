// The eight Career Orientation axes and four Behavioural Signals.
//
// Content is transcribed from
// docs/assessment/career-discovery/security-career-dna-model-v3.0.md §3–§4.
//
// Two rules govern everything in this file:
//
//   1. Every axis is BIPOLAR and both ends are legitimate. No axis is a
//      scale from worse to better. `neverMeans` records, per axis, the
//      specific misreading the report must not make.
//   2. Behavioural signals NEVER enter matching. They frame language only.
//      They are kept in a separate structure from the axes so that a
//      scoring function cannot iterate "all constructs" and pick them up
//      by accident.
//
// Axis identifiers are internal. They are never shown to candidates —
// see the spec's Discovery-section rule, and the guard script asserts no
// CDA-/BS- identifier reaches an i18n dictionary value.

import type { BehaviouralSignal, CareerOrientationAxis } from "./types";

export const CAREER_ORIENTATION_AXES: readonly CareerOrientationAxis[] = [
  {
    id: "CDA-01",
    key: "field_presence",
    name: { sv: "Fältnärvaro", en: "Field Presence" },
    lowEnd: {
      sv: "Arbetar med information om situationer — på distans, i efterhand eller i förväg",
      en: "Works with information about situations — remote, after the fact, or in advance",
    },
    highEnd: {
      sv: "Arbetar där situationen är — fysiskt närvarande, i miljön, medan det händer",
      en: "Works where the situation is — physically present, in the environment, as it happens",
    },
    neverMeans: {
      sv: "Att den ena änden är mer 'riktigt' säkerhetsarbete. Rapporten får aldrig antyda en rangordning.",
      en: "That one end is more 'real' security work. The report must never imply a hierarchy.",
    },
  },
  {
    id: "CDA-02",
    key: "people_interface",
    name: { sv: "Människokontakt", en: "People Interface" },
    lowEnd: {
      sv: "Föredrar arbete där mänsklig interaktion är en bieffekt av uppgiften",
      en: "Prefers work where human interaction is incidental to the task",
    },
    highEnd: {
      sv: "Föredrar arbete där möten med människor — även svåra möten — är själva innehållet",
      en: "Prefers work where meeting people — including difficult encounters — is the substance of the job",
    },
    neverMeans: {
      sv: "Sällskaplighet. En person kan vara starkt människoorienterad på jobbet och annorlunda privat; axeln handlar om arbetet.",
      en: "Sociability. A person can be highly people-oriented at work and private otherwise; the axis is about the work.",
    },
  },
  {
    id: "CDA-03",
    key: "procedural_structure",
    name: { sv: "Struktur och rutin", en: "Procedural Structure" },
    lowEnd: {
      sv: "Föredrar att definiera metoden — otydlighet är hanterbar, rutinen är en utgångspunkt",
      en: "Prefers to define the method — ambiguity is workable, procedure is a starting point",
    },
    highEnd: {
      sv: "Föredrar tydlig rutin, klara standarder och ett svar som går att veta",
      en: "Prefers defined procedure, clear standards and a knowable right answer",
    },
    neverMeans: {
      sv: "Stelhet eller kreativitet. Båda ändarna rymmer utmärkta yrkespersoner. Rapportspråket får inte moralisera.",
      en: "Rigidity or creativity. Both ends include excellent professionals. Report language must not moralise.",
    },
  },
  {
    id: "CDA-04",
    key: "acute_tempo",
    name: { sv: "Tempo och akut press", en: "Acute Tempo" },
    lowEnd: {
      sv: "Föredrar uthålligt, planerat och genomtänkt arbete med långa tidshorisonter",
      en: "Prefers sustained, planned, deliberate work with long time horizons",
    },
    highEnd: {
      sv: "Föredrar akut, oförutsägbart och tidskritiskt arbete",
      en: "Prefers acute, unpredictable, time-critical work",
    },
    neverMeans: {
      sv: "Stresstålighet. Att föredra lugnt arbete är ingen svaghet, och axeln får aldrig läsas som motståndskraft.",
      en: "Stress tolerance. Preferring calm work is not a weakness, and this axis must never be read as resilience.",
    },
  },
  {
    id: "CDA-05",
    key: "systems_technology",
    name: { sv: "Teknik och system", en: "Systems & Technology" },
    lowEnd: {
      sv: "Tekniken är ett verktyg som används i arbetet",
      en: "Technology is a tool used in the work",
    },
    highEnd: {
      sv: "Tekniken och systemen är föremålet för arbetet",
      en: "Technology and systems are the object of the work",
    },
    neverMeans: {
      sv: "Teknisk skicklighet. Detta mäter dragning, inte förmåga.",
      en: "Technical skill. This measures pull, not capability.",
    },
  },
  {
    id: "CDA-06",
    key: "investigative_depth",
    name: { sv: "Utredning och mönster", en: "Investigative Depth" },
    lowEnd: {
      sv: "Föredrar att lösa situationen framför sig och gå vidare",
      en: "Prefers to resolve the situation in front of them and move on",
    },
    highEnd: {
      sv: "Dras till att rekonstruera vad som hänt, följa trådar och hitta mönstret",
      en: "Drawn to reconstructing what happened, following threads, finding the pattern",
    },
    neverMeans: {
      sv: "Nyfikenhet eller intelligens.",
      en: "Curiosity or intelligence.",
    },
  },
  {
    id: "CDA-07",
    key: "responsibility_for_others",
    name: { sv: "Ansvar för andra", en: "Responsibility for Others" },
    lowEnd: {
      sv: "Föredrar att äga sitt eget arbete och sina egna resultat",
      en: "Prefers ownership of their own work and outcomes",
    },
    highEnd: {
      sv: "Dras till ansvar för andras arbete, beslut och utveckling",
      en: "Drawn to accountability for other people's work, decisions and development",
    },
    neverMeans: {
      sv: "Ambition. Att tacka nej till ansvar för andra är ett legitimt, permanent och respektabelt val.",
      en: "Ambition. Declining responsibility for others is a legitimate, permanent, respectable choice.",
    },
  },
  {
    id: "CDA-08",
    key: "organisational_scope",
    name: { sv: "Organisatorisk räckvidd", en: "Organisational Scope" },
    lowEnd: {
      sv: "Händelsen, passet, platsen — konkret och omedelbart",
      en: "The incident, the shift, the site — concrete and immediate",
    },
    highEnd: {
      sv: "Organisationen, systemet, styrningen — abstrakt och långsiktigt",
      en: "The organisation, the system, the policy — abstract and long-range",
    },
    neverMeans: {
      sv: "Senioritet eller förfining.",
      en: "Seniority or sophistication.",
    },
  },
] as const;

/** Kept structurally separate from the axes so no scoring function can
 *  sweep "all constructs" and accidentally include a signal in matching. */
export const BEHAVIOURAL_SIGNALS: readonly BehaviouralSignal[] = [
  {
    id: "BS-1",
    key: "procedural_follow_through",
    name: { sv: "Rutinföljsamhet", en: "Procedural follow-through" },
    observes: {
      sv: "Vad som tenderar att hända när en definierad uppgift är obevakad och obekväm",
      en: "What tends to happen when a defined task is unobserved and inconvenient",
    },
    reportUse: {
      sv: "Ramar in hur en strukturerad miljö sannolikt känns",
      en: "Frames how a structured environment might feel",
    },
  },
  {
    id: "BS-2",
    key: "escalation_judgement",
    name: { sv: "Bedömning av eskalering", en: "Escalation judgement" },
    observes: {
      sv: "När någon involverar en annan person i stället för att lösa själv",
      en: "When someone involves another person versus resolving alone",
    },
    reportUse: {
      sv: "Ramar in samtal om självständighet och ensamarbete",
      en: "Frames autonomy and lone-working discussion",
    },
  },
  {
    id: "BS-3",
    key: "composure_under_provocation",
    name: { sv: "Lugn under provokation", en: "Composure under provocation" },
    observes: {
      sv: "Beteende när ett möte blir svårt",
      en: "Behaviour when an interaction turns difficult",
    },
    reportUse: {
      sv: "Ramar in samtal om roller med publik kontakt",
      en: "Frames public-facing role discussion",
    },
  },
  {
    id: "BS-4",
    key: "learning_response",
    name: { sv: "Lärande efter återkoppling", en: "Learning response" },
    observes: {
      sv: "Vad som händer efter återkoppling eller ett misstag",
      en: "What happens after feedback or a mistake",
    },
    reportUse: {
      sv: "Kalibrerar hur realistisk utvecklingsplanen bör vara",
      en: "Frames the development plan's realism",
    },
  },
] as const;

export const AXIS_IDS = CAREER_ORIENTATION_AXES.map((a) => a.id);
export const SIGNAL_IDS = BEHAVIOURAL_SIGNALS.map((s) => s.id);

/** Minimum independent items per axis, per Assessment DNA Doc 06 §1 (≥2)
 *  with the margin this instrument adds. The guard script asserts the
 *  authored item set actually meets it. */
export const MIN_ITEMS_PER_AXIS = 3;
