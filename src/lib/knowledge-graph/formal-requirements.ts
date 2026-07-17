import type { FormalRequirement, ProfessionFormalRequirement } from "./types";

// -------------------------------------------------------------
// Sprint 09B corrected FormalRequirement seed.
// See .lovable/plan.md §1 for legal anchors.
// -------------------------------------------------------------

export const formalRequirements: readonly FormalRequirement[] = [
  // ---------------- Cross-cutting ----------------
  {
    id: "fr.common.age-18",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Minst 18 år", en: "At least 18 years old" },
    subtype: "age_requirement",
    appliesTo: "person",
    authority: { sv: "Aktuell tillsynsmyndighet", en: "Applicable regulator" },
    jurisdiction: "SE",
    legalBlocker: true,
  },
  {
    id: "fr.se.residency-eligible-to-work",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Rätt att arbeta i Sverige", en: "Right to work in Sweden" },
    subtype: "eligibility_requirement",
    appliesTo: "person",
    authority: { sv: "Migrationsverket / arbetsgivare", en: "Swedish Migration Agency / employer" },
    jurisdiction: "SE",
    legalBlocker: true,
  },
  {
    id: "fr.common.driving-licence-b",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Körkort B", en: "Category B driving licence" },
    subtype: "licence_requirement",
    appliesTo: "person",
    authority: { sv: "Transportstyrelsen", en: "Swedish Transport Agency" },
    jurisdiction: "SE",
    legalBlocker: false,
  },
  {
    id: "fr.common.medical-fitness-basic",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Grundläggande medicinsk lämplighet", en: "Basic medical fitness" },
    subtype: "medical_fitness_requirement",
    appliesTo: "person",
    authority: { sv: "Arbetsgivare eller myndighet enligt roll", en: "Employer or authority depending on role" },
    jurisdiction: "SE",
    legalBlocker: false,
  },
  {
    id: "fr.eu.gdpr-training",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "GDPR-utbildning", en: "GDPR training" },
    subtype: "gdpr_training_requirement",
    appliesTo: "person",
    authority: { sv: "Arbetsgivare", en: "Employer" },
    jurisdiction: "EU",
    legalBlocker: false,
  },

  // ---------------- Väktare ----------------
  {
    id: "fr.se.vaktare.company-authorization",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Auktorisation av bevakningsföretag", en: "Authorization of security company" },
    definition: {
      sv: "Bevakningsverksamhet får bedrivas endast av auktoriserat bevakningsföretag.",
      en: "Guarding activity may only be conducted by an authorised guarding company.",
    },
    subtype: "company_authorization",
    appliesTo: "organization",
    authority: { sv: "Länsstyrelsen", en: "County Administrative Board (Länsstyrelsen)" },
    jurisdiction: "SE",
    legalBlocker: true,
    officialSource: {
      label: { sv: "Lag (1974:191) om bevakningsföretag", en: "Guarding Companies Act (1974:191)" },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/lag-1974191-om-bevakningsforetag_sfs-1974-191",
    },
  },
  {
    id: "fr.se.vaktare.training",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Föreskriven väktarutbildning", en: "Prescribed security-guard training" },
    subtype: "mandatory_training",
    appliesTo: "person",
    authority: {
      sv: "Auktoriserat bevakningsföretag under Polismyndighetens tillsyn (FAP 573-1)",
      en: "Authorised guarding company under Swedish Police Authority supervision (FAP 573-1)",
    },
    jurisdiction: "SE",
    legalBlocker: true,
    officialSource: {
      label: { sv: "PMFS / FAP 573-1", en: "PMFS / FAP 573-1" },
      publisher: "Polismyndigheten",
    },
  },
  {
    id: "fr.se.vaktare.personnel-approval",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: {
      sv: "Länsstyrelsens godkännande som väktare",
      en: "County Administrative Board personnel approval as security officer",
    },
    subtype: "personnel_approval",
    appliesTo: "person",
    authority: { sv: "Länsstyrelsen", en: "County Administrative Board (Länsstyrelsen)" },
    jurisdiction: "SE",
    legalBlocker: true,
    authorityConductsSuitabilityCheck: true,
    officialSource: {
      label: { sv: "Lag (1974:191); Förordning (1989:149)", en: "Act (1974:191); Ordinance (1989:149)" },
      publisher: "Sveriges riksdag",
    },
  },

  // ---------------- Ordningsvakt ----------------
  {
    id: "fr.se.ordningsvakt.training",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Ordningsvaktsgrundutbildning", en: "Public order officer basic training" },
    subtype: "mandatory_training",
    appliesTo: "person",
    authority: { sv: "Polismyndigheten", en: "Swedish Police Authority" },
    jurisdiction: "SE",
    legalBlocker: true,
    officialSource: {
      label: { sv: "Ordningsvaktslag (2023:421); PMFS", en: "Public Order Officers Act (2023:421); PMFS" },
      publisher: "Sveriges riksdag",
    },
  },
  {
    id: "fr.se.ordningsvakt.appointment",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Förordnande som ordningsvakt", en: "Appointment as public order officer" },
    subtype: "government_appointment",
    appliesTo: "person",
    authority: { sv: "Polismyndigheten", en: "Swedish Police Authority" },
    jurisdiction: "SE",
    legalBlocker: true,
    authorityConductsSuitabilityCheck: true,
    officialSource: {
      label: { sv: "Ordningsvaktslag (2023:421)", en: "Public Order Officers Act (2023:421)" },
      publisher: "Sveriges riksdag",
    },
  },
  {
    id: "fr.se.ordningsvakt.appointment.renewal",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Förnyelse och giltighet av förordnande", en: "Appointment renewal and validity" },
    subtype: "government_appointment",
    appliesTo: "person",
    authority: { sv: "Polismyndigheten", en: "Swedish Police Authority" },
    jurisdiction: "SE",
    legalBlocker: true,
    renewalOf: "fr.se.ordningsvakt.appointment",
  },

  // ---------------- Skyddsvakt ----------------
  {
    id: "fr.se.skyddsvakt.training",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Skyddsvaktsutbildning", en: "Protective security guard training" },
    subtype: "mandatory_training",
    appliesTo: "person",
    authority: {
      sv: "Utbildning enligt Polismyndighetens föreskrifter (PMFS)",
      en: "Training per Swedish Police Authority regulations (PMFS)",
    },
    jurisdiction: "SE",
    legalBlocker: true,
    officialSource: {
      label: { sv: "Skyddslag (2010:305); Skyddsförordning (2010:523)", en: "Protection Act (2010:305); Protection Ordinance (2010:523)" },
      publisher: "Sveriges riksdag",
    },
  },
  {
    id: "fr.se.skyddsvakt.approval",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Godkännande som skyddsvakt", en: "Approval as protective security guard" },
    definition: {
      sv: "Ordinarie godkännande som skyddsvakt meddelas av Länsstyrelsen. För personal inom Försvarsmakten prövar Försvarsmakten frågan om godkännande.",
      en: "Ordinary approval as protective security guard is issued by Länsstyrelsen. For personnel within the Swedish Armed Forces, the Armed Forces decide on approval.",
    },
    subtype: "government_approval",
    appliesTo: "person",
    authority: {
      sv: "Länsstyrelsen (ordinarie); Försvarsmakten endast för personal inom Försvarsmakten",
      en: "Länsstyrelsen (ordinary approval); Försvarsmakten only for personnel within the Swedish Armed Forces",
    },
    jurisdiction: "SE",
    legalBlocker: true,
    authorityConductsSuitabilityCheck: true,
    officialSource: {
      label: { sv: "Skyddsförordning (2010:523) 6 §", en: "Protection Ordinance (2010:523) section 6" },
      publisher: "Sveriges riksdag",
      url: "https://www.riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523",
    },
  },

  // ---------------- Optional formal security screening ----------------
  {
    id: "fr.se.security-screening.basic",
    status: "reviewed",
    lastVerified: "2026-07-17",
    name: { sv: "Säkerhetsprövning (grundnivå)", en: "Security screening (basic level)" },
    definition: {
      sv: "Formell säkerhetsprövning enligt säkerhetsskyddslagen. Genomförs av verksamhetsutövaren när rollen är säkerhetsklassad.",
      en: "Formal security screening under the Swedish Protective Security Act. Conducted by the operator when the role is security-classified.",
    },
    subtype: "security_screening_requirement",
    appliesTo: "person",
    authority: { sv: "Verksamhetsutövare", en: "Operator responsible for protective security" },
    jurisdiction: "SE",
    legalBlocker: false,
    authorityConductsSuitabilityCheck: true,
    officialSource: {
      label: { sv: "Säkerhetsskyddslag (2018:585)", en: "Protective Security Act (2018:585)" },
      publisher: "Sveriges riksdag",
    },
  },
];

// -------------------------------------------------------------
// Profession → FormalRequirement links (explicit relationship records).
// -------------------------------------------------------------

export const professionFormalRequirements: readonly ProfessionFormalRequirement[] = [
  // security-officer (Väktare)
  { professionId: "security-officer", requirementId: "fr.common.age-18", required: true },
  { professionId: "security-officer", requirementId: "fr.se.residency-eligible-to-work", required: true },
  { professionId: "security-officer", requirementId: "fr.se.vaktare.company-authorization", required: true },
  { professionId: "security-officer", requirementId: "fr.se.vaktare.training", required: true },
  { professionId: "security-officer", requirementId: "fr.se.vaktare.personnel-approval", required: true },
  { professionId: "security-officer", requirementId: "fr.eu.gdpr-training", required: false },

  // ordningsvakt
  { professionId: "ordningsvakt", requirementId: "fr.common.age-18", required: true },
  { professionId: "ordningsvakt", requirementId: "fr.se.residency-eligible-to-work", required: true },
  { professionId: "ordningsvakt", requirementId: "fr.se.ordningsvakt.training", required: true },
  { professionId: "ordningsvakt", requirementId: "fr.se.ordningsvakt.appointment", required: true },
  { professionId: "ordningsvakt", requirementId: "fr.se.ordningsvakt.appointment.renewal", required: true },

  // skyddsvakt
  { professionId: "skyddsvakt", requirementId: "fr.common.age-18", required: true },
  { professionId: "skyddsvakt", requirementId: "fr.se.residency-eligible-to-work", required: true },
  { professionId: "skyddsvakt", requirementId: "fr.se.skyddsvakt.training", required: true },
  { professionId: "skyddsvakt", requirementId: "fr.se.skyddsvakt.approval", required: true },
  { professionId: "skyddsvakt", requirementId: "fr.se.security-screening.basic", required: false },

  // data-center-security — often säkerhetsklassad
  { professionId: "data-center-security", requirementId: "fr.se.security-screening.basic", required: false },
  { professionId: "data-center-security", requirementId: "fr.eu.gdpr-training", required: false },

  // Non-regulated pilot roles — GDPR training as development guidance only
  { professionId: "security-manager", requirementId: "fr.eu.gdpr-training", required: false },
  { professionId: "risk-manager", requirementId: "fr.eu.gdpr-training", required: false },
  { professionId: "aml-specialist", requirementId: "fr.eu.gdpr-training", required: false },
  { professionId: "crisis-continuity-manager", requirementId: "fr.eu.gdpr-training", required: false },
  { professionId: "close-protection", requirementId: "fr.common.medical-fitness-basic", required: false },
  { professionId: "close-protection", requirementId: "fr.common.driving-licence-b", required: false },
  { professionId: "security-technician", requirementId: "fr.common.driving-licence-b", required: false },
];

export function getFormalRequirement(id: string): FormalRequirement | undefined {
  return formalRequirements.find((r) => r.id === id);
}

export function getFormalRequirementsForProfession(professionId: string): FormalRequirement[] {
  const links = professionFormalRequirements.filter((l) => l.professionId === professionId);
  const out: FormalRequirement[] = [];
  for (const link of links) {
    const r = getFormalRequirement(link.requirementId);
    if (r) out.push(r);
  }
  return out;
}
