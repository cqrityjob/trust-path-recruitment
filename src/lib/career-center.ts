import {
  Shield,
  ShieldCheck,
  Building2,
  Cpu,
  AlertTriangle,
  Scale,
  UserCheck,
  Server,
  Siren,
  Search,
  Radar,
  Lock,
  Landmark,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Lang } from "@/i18n/dictionaries";

export type Bi = { sv: string; en: string };
export const L = (b: Bi, lang: Lang) => b[lang];

export type CategoryId =
  | "guarding"
  | "corporate"
  | "public_safety"
  | "risk"
  | "cyber"
  | "investigations"
  | "aml"
  | "critical_infra"
  | "protective"
  | "tech"
  | "emergency"
  | "leadership";

export type Category = {
  id: CategoryId;
  name: Bi;
  desc: Bi;
  icon: LucideIcon;
};

export const categories: readonly Category[] = [
  { id: "guarding", icon: ShieldCheck, name: { sv: "Bevakning", en: "Guarding" }, desc: { sv: "Operativa bevaknings- och skyddsroller.", en: "Operational guarding and protection roles." } },
  { id: "corporate", icon: Building2, name: { sv: "Företagssäkerhet", en: "Corporate Security" }, desc: { sv: "Säkerhet inom företag och organisationer.", en: "Security in corporations and organizations." } },
  { id: "public_safety", icon: Shield, name: { sv: "Ordning & rättsvård", en: "Public Safety" }, desc: { sv: "Roller inom rättsvård och samhällsskydd.", en: "Roles across public safety and law enforcement." } },
  { id: "risk", icon: AlertTriangle, name: { sv: "Riskhantering", en: "Risk Management" }, desc: { sv: "Identifiering och hantering av risker.", en: "Identifying and managing risk." } },
  { id: "cyber", icon: Lock, name: { sv: "Cyber- & informationssäkerhet", en: "Cyber & Information Security" }, desc: { sv: "Digital säkerhet, informationsskydd.", en: "Digital security and information protection." } },
  { id: "investigations", icon: Search, name: { sv: "Utredning", en: "Investigations" }, desc: { sv: "Utredning och analys av incidenter och brott.", en: "Incident and crime investigation and analysis." } },
  { id: "aml", icon: Scale, name: { sv: "AML", en: "AML" }, desc: { sv: "Motverkan av penningtvätt och finansiell brottslighet.", en: "Anti-money-laundering and financial crime prevention." } },
  { id: "critical_infra", icon: Server, name: { sv: "Kritisk infrastruktur", en: "Critical Infrastructure" }, desc: { sv: "Skydd av samhällsviktig verksamhet.", en: "Protection of critical infrastructure." } },
  { id: "protective", icon: UserCheck, name: { sv: "Personskydd", en: "Protective Security" }, desc: { sv: "Skydd av individer och skyddsvärda objekt.", en: "Protecting individuals and sensitive assets." } },
  { id: "tech", icon: Cpu, name: { sv: "Säkerhetsteknik", en: "Security Technology" }, desc: { sv: "Tekniska säkerhetssystem och lösningar.", en: "Technical security systems and solutions." } },
  { id: "emergency", icon: Siren, name: { sv: "Kris & beredskap", en: "Emergency & Crisis Management" }, desc: { sv: "Krishantering och kontinuitet.", en: "Crisis management and continuity." } },
  { id: "leadership", icon: Landmark, name: { sv: "Ledarskap", en: "Leadership" }, desc: { sv: "Ledande roller inom säkerhet.", en: "Leadership roles across security." } },
] as const;

export type SkillId =
  | "leadership"
  | "communication"
  | "risk_awareness"
  | "analytical"
  | "technical"
  | "customer_service"
  | "planning"
  | "decision_making";

export const skills: Record<SkillId, { name: Bi; desc: Bi; icon: LucideIcon }> = {
  leadership: { icon: Users, name: { sv: "Ledarskap", en: "Leadership" }, desc: { sv: "Leda team, prioritera och skapa riktning.", en: "Leading teams, setting priorities and direction." } },
  communication: { icon: Users, name: { sv: "Kommunikation", en: "Communication" }, desc: { sv: "Tydlig kommunikation, muntligt och skriftligt.", en: "Clear communication, verbal and written." } },
  risk_awareness: { icon: Radar, name: { sv: "Riskmedvetenhet", en: "Risk Awareness" }, desc: { sv: "Se, bedöma och agera på risker.", en: "Seeing, evaluating and acting on risk." } },
  analytical: { icon: Search, name: { sv: "Analytiskt tänkande", en: "Analytical Thinking" }, desc: { sv: "Strukturera information och dra slutsatser.", en: "Structuring information and drawing conclusions." } },
  technical: { icon: Cpu, name: { sv: "Teknisk förståelse", en: "Technical Understanding" }, desc: { sv: "Förstå tekniska system och lösningar.", en: "Understanding technical systems and tooling." } },
  customer_service: { icon: UserCheck, name: { sv: "Bemötande", en: "Customer Service" }, desc: { sv: "Professionellt bemötande i mötet med människor.", en: "Professional interaction with people." } },
  planning: { icon: Wrench, name: { sv: "Planering", en: "Planning" }, desc: { sv: "Planera arbete och resurser över tid.", en: "Planning work and resources over time." } },
  decision_making: { icon: ShieldCheck, name: { sv: "Beslutsförmåga", en: "Decision Making" }, desc: { sv: "Fatta genomtänkta beslut under press.", en: "Making sound decisions under pressure." } },
};

export type ExperienceLevel = "entry" | "mid" | "senior" | "executive";

export type Profession = {
  slug: string;
  title: Bi;
  short: Bi;
  category: CategoryId;
  level: ExperienceLevel;
  icon: LucideIcon;
  hero: Bi;
  responsibilities: Bi[];
  roleFor: Bi;
  skills: SkillId[];
  careerPath: Bi[];
  related: string[];
  faqs: { q: Bi; a: Bi }[];
};

const genericResponsibilities: Bi[] = [
  { sv: "Utföra det dagliga arbetet enligt rutiner och krav.", en: "Carry out day-to-day duties according to procedures and requirements." },
  { sv: "Dokumentera händelser, avvikelser och åtgärder.", en: "Document events, deviations and actions taken." },
  { sv: "Samverka med kollegor, kunder och externa parter.", en: "Collaborate with colleagues, clients and external parties." },
  { sv: "Bidra till förbättring av arbetssätt och rutiner.", en: "Contribute to improving working methods and procedures." },
];

const genericFaqs: { q: Bi; a: Bi }[] = [
  { q: { sv: "Vilka krav ställs vanligtvis?", en: "What requirements are typically expected?" }, a: { sv: "Detaljerade krav skiljer sig mellan arbetsgivare och roller. Utförliga guider är under uppbyggnad.", en: "Detailed requirements vary between employers and roles. In-depth guides are being built." } },
  { q: { sv: "Hur kommer jag igång?", en: "How do I get started?" }, a: { sv: "Gör karriärbedömningen för att se hur din profil matchar rollen och utforska relaterade yrken.", en: "Take the Security Career Assessment to see how your profile matches the role and explore related professions." } },
  { q: { sv: "Erbjuder CQrityjob utbildningar?", en: "Does CQrityjob offer training?" }, a: { sv: "Vi kurerar information om utbildningar och certifikat. Vi är inte en utbildningsleverantör.", en: "We curate information about education and certifications. CQrityjob is not a training provider." } },
];

export const professions: Profession[] = [
  {
    slug: "security-officer",
    title: { sv: "Väktare / Skyddsvakt", en: "Security Officer" },
    short: { sv: "Operativa bevaknings- och skyddsuppdrag inom civila och skyddsklassade miljöer.", en: "Operational guarding and protective duties across civilian and protected environments." },
    category: "guarding", level: "entry", icon: ShieldCheck,
    hero: { sv: "Väktare och skyddsvakter är den operativa ryggraden i säkerhetsbranschen — synliga, förberedda och professionella i mötet med människor.", en: "Security officers are the operational backbone of the industry — visible, prepared and professional in every interaction." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som är strukturerad, lugn och trygg i mötet med människor.", en: "The role suits people who are structured, calm and confident in dealing with others." },
    skills: ["communication", "risk_awareness", "customer_service", "decision_making"],
    careerPath: [
      { sv: "Student", en: "Student" },
      { sv: "Väktare", en: "Security Officer" },
      { sv: "Skyddsvakt / Specialistroll", en: "Protective Officer / Specialist" },
      { sv: "Gruppledare", en: "Team Leader" },
      { sv: "Säkerhetschef", en: "Security Manager" },
    ],
    related: ["security-manager", "close-protection", "data-center-security"],
    faqs: genericFaqs,
  },
  {
    slug: "security-manager",
    title: { sv: "Säkerhetschef", en: "Security Manager" },
    short: { sv: "Strategiskt ansvar för säkerhet, riskhantering och kontinuitet i en organisation.", en: "Strategic responsibility for security, risk management and continuity within an organisation." },
    category: "leadership", level: "senior", icon: Building2,
    hero: { sv: "Säkerhetschefen sätter riktningen för hela säkerhetsarbetet — från policy och risk till operativ leverans och kontinuitet.", en: "The security manager sets the direction for the entire security function — from policy and risk to operational delivery and continuity." },
    responsibilities: [
      { sv: "Utforma och underhålla säkerhetspolicy och styrande dokument.", en: "Design and maintain security policy and governance documents." },
      { sv: "Leda risk- och sårbarhetsanalyser.", en: "Lead risk and vulnerability assessments." },
      { sv: "Ansvara för budget, leverantörer och kontinuitetsplaner.", en: "Own budget, vendor relationships and continuity plans." },
      { sv: "Rapportera till ledning och styrelse.", en: "Report to executive management and the board." },
    ],
    roleFor: { sv: "Rollen passar erfarna säkerhetsprofiler med stark ledaridentitet och affärsförståelse.", en: "The role suits experienced security professionals with strong leadership identity and business acumen." },
    skills: ["leadership", "planning", "risk_awareness", "communication", "decision_making", "analytical"],
    careerPath: [
      { sv: "Student", en: "Student" },
      { sv: "Väktare", en: "Security Officer" },
      { sv: "Gruppledare", en: "Team Leader" },
      { sv: "Säkerhetschef", en: "Security Manager" },
      { sv: "Head of Security", en: "Head of Security" },
    ],
    related: ["risk-manager", "emergency-crisis-management", "security-officer"],
    faqs: genericFaqs,
  },
  {
    slug: "security-technician",
    title: { sv: "Säkerhetstekniker", en: "Security Technician" },
    short: { sv: "Installation, drift och underhåll av tekniska säkerhetssystem.", en: "Installation, operation and maintenance of technical security systems." },
    category: "tech", level: "mid", icon: Cpu,
    hero: { sv: "Säkerhetstekniker knyter ihop det fysiska och digitala — genom passersystem, kameror, larm och integrationer.", en: "Security technicians bridge the physical and digital — through access control, cameras, alarms and integrations." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som är tekniskt lagd, noggrann och lösningsorienterad.", en: "The role suits people who are technically minded, precise and solution-oriented." },
    skills: ["technical", "analytical", "planning", "communication"],
    careerPath: [
      { sv: "Elev / Praktikant", en: "Apprentice" },
      { sv: "Säkerhetstekniker", en: "Security Technician" },
      { sv: "Senior tekniker", en: "Senior Technician" },
      { sv: "Teknikledare", en: "Technical Lead" },
    ],
    related: ["data-center-security", "security-manager"],
    faqs: genericFaqs,
  },
  {
    slug: "risk-manager",
    title: { sv: "Risk Manager", en: "Risk Manager" },
    short: { sv: "Identifiering, analys och hantering av operativa och organisatoriska risker.", en: "Identification, analysis and management of operational and organisational risk." },
    category: "risk", level: "senior", icon: AlertTriangle,
    hero: { sv: "Risk managers ger ledningen ett strukturerat sätt att förstå och prioritera risker — från operativ till strategisk nivå.", en: "Risk managers give leadership a structured way to understand and prioritize risk — from operational to strategic level." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar analytiska profiler som trivs med struktur, siffror och beslut under osäkerhet.", en: "The role suits analytical people who thrive on structure, numbers and decisions under uncertainty." },
    skills: ["analytical", "risk_awareness", "communication", "decision_making"],
    careerPath: [
      { sv: "Analytiker", en: "Analyst" },
      { sv: "Risk Manager", en: "Risk Manager" },
      { sv: "Senior Risk Manager", en: "Senior Risk Manager" },
      { sv: "Chief Risk Officer", en: "Chief Risk Officer" },
    ],
    related: ["security-manager", "aml-specialist"],
    faqs: genericFaqs,
  },
  {
    slug: "aml-specialist",
    title: { sv: "AML-specialist", en: "AML Specialist" },
    short: { sv: "Motverkan av penningtvätt, finansiell brottslighet och regelefterlevnad.", en: "Anti-money-laundering, financial crime prevention and regulatory compliance." },
    category: "aml", level: "mid", icon: Scale,
    hero: { sv: "AML-specialister skyddar det finansiella systemet — genom noggrann analys, kontroll och rapportering.", en: "AML specialists protect the financial system through careful analysis, controls and reporting." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som är noggrann, analytisk och intresserad av regelverk.", en: "The role suits precise, analytical people with an interest in regulation." },
    skills: ["analytical", "communication", "risk_awareness", "decision_making"],
    careerPath: [
      { sv: "AML-analytiker", en: "AML Analyst" },
      { sv: "AML-specialist", en: "AML Specialist" },
      { sv: "AML Manager", en: "AML Manager" },
      { sv: "Head of Financial Crime", en: "Head of Financial Crime" },
    ],
    related: ["risk-manager"],
    faqs: genericFaqs,
  },
  {
    slug: "close-protection",
    title: { sv: "Livvakt", en: "Close Protection" },
    short: { sv: "Personskydd för utsatta individer i olika miljöer och riskbilder.", en: "Personal protection for exposed individuals across varied environments and threat profiles." },
    category: "protective", level: "senior", icon: UserCheck,
    hero: { sv: "Livvakter arbetar diskret, förberett och professionellt — nära individen som skyddas.", en: "Close protection officers operate discreetly, prepared and professional — close to the individual being protected." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som är fysiskt och mentalt förberedd, disciplinerad och lugn under press.", en: "The role suits people who are physically and mentally prepared, disciplined and calm under pressure." },
    skills: ["risk_awareness", "decision_making", "planning", "communication"],
    careerPath: [
      { sv: "Väktare / Militär bakgrund", en: "Officer / Military background" },
      { sv: "Livvakt", en: "Close Protection Officer" },
      { sv: "Team Leader Close Protection", en: "Close Protection Team Leader" },
    ],
    related: ["security-officer", "security-manager"],
    faqs: genericFaqs,
  },
  {
    slug: "data-center-security",
    title: { sv: "Datacentersäkerhet", en: "Data Center Security" },
    short: { sv: "Fysisk och operativ säkerhet för datacenter och kritisk digital infrastruktur.", en: "Physical and operational security for data centers and critical digital infrastructure." },
    category: "critical_infra", level: "mid", icon: Server,
    hero: { sv: "Säkerhet i datacenter kräver stenhård rutin, teknisk förståelse och en tydlig känsla för det som inte får hända.", en: "Data center security demands rigorous routine, technical understanding and a clear sense of what must never happen." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som gillar rutin, tekniska system och en stabil arbetsmiljö.", en: "The role suits people who value routine, technical systems and a stable environment." },
    skills: ["technical", "risk_awareness", "planning", "communication"],
    careerPath: [
      { sv: "Väktare", en: "Security Officer" },
      { sv: "Datacenteroperatör säkerhet", en: "Data Center Security Operator" },
      { sv: "Site Security Lead", en: "Site Security Lead" },
    ],
    related: ["security-officer", "security-technician"],
    faqs: genericFaqs,
  },
  {
    slug: "emergency-crisis-management",
    title: { sv: "Krishantering & beredskap", en: "Emergency & Crisis Management" },
    short: { sv: "Planering och ledning av kris- och incidenthantering på organisationsnivå.", en: "Planning and leading incident, crisis and business continuity response." },
    category: "emergency", level: "senior", icon: Siren,
    hero: { sv: "Kris- och beredskapsansvariga förbereder organisationen på det som ännu inte hänt — och leder när det gör det.", en: "Emergency and crisis leads prepare the organization for what has not yet happened — and lead when it does." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som är strukturerad, lugn och trygg i att fatta beslut under osäkerhet.", en: "The role suits people who are structured, calm and confident making decisions under uncertainty." },
    skills: ["planning", "leadership", "decision_making", "communication", "risk_awareness"],
    careerPath: [
      { sv: "Beredskapshandläggare", en: "Preparedness Officer" },
      { sv: "Krishanteringsansvarig", en: "Crisis Manager" },
      { sv: "Head of Resilience", en: "Head of Resilience" },
    ],
    related: ["security-manager", "risk-manager"],
    faqs: genericFaqs,
  },
  {
    slug: "police-officer",
    title: { sv: "Polis", en: "Police Officer" },
    short: { sv: "Grundläggande utredning, ordning och rättsvård — inom myndighetsutövning.", en: "Investigation, public order and law enforcement within government authority." },
    category: "public_safety", level: "mid", icon: Shield,
    hero: { sv: "Polisen är samhällets myndighetsroll för ordning, utredning och skydd — med tydliga rättsliga ramar.", en: "Police officers hold the state's authority for public order, investigation and protection within clear legal frameworks." },
    responsibilities: genericResponsibilities,
    roleFor: { sv: "Rollen passar dig som söker samhällsuppdrag, samarbete och yrkesmässig utveckling över tid.", en: "The role suits people seeking public service, teamwork and long-term professional development." },
    skills: ["communication", "decision_making", "risk_awareness", "analytical"],
    careerPath: [
      { sv: "Polisstudent", en: "Police Student" },
      { sv: "Polis", en: "Police Officer" },
      { sv: "Specialist / Utredare", en: "Specialist / Investigator" },
      { sv: "Chef / Ledarroll", en: "Leadership role" },
    ],
    related: ["security-officer", "close-protection"],
    faqs: genericFaqs,
  },
];

export function getProfession(slug: string): Profession | undefined {
  return professions.find((p) => p.slug === slug);
}

export function getCategory(id: CategoryId): Category | undefined {
  return categories.find((c) => c.id === id);
}

export const experienceLevels: { id: ExperienceLevel; name: Bi }[] = [
  { id: "entry", name: { sv: "Ingångsnivå", en: "Entry" } },
  { id: "mid", name: { sv: "Mellannivå", en: "Mid" } },
  { id: "senior", name: { sv: "Senior", en: "Senior" } },
  { id: "executive", name: { sv: "Ledning", en: "Executive" } },
];
