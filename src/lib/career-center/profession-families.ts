import type { ProfessionFamily } from "./types";

export const professionFamilies: readonly ProfessionFamily[] = [
  {
    id: "exploring",
    isEntryPath: true,
    icon: "compass",
    name: { sv: "Utforska karriärer inom säkerhet", en: "Exploring Security Careers" },
    description: {
      sv: "En ingångspunkt för studenter, unga och karriärbytare som utforskar vilka roller inom säkerhet som kan passa.",
      en: "An entry path for students, young people and career changers exploring which security roles may fit them.",
    },
  },
  { id: "guarding", icon: "shield-check",
    name: { sv: "Bevakning och operativ säkerhet", en: "Guarding and Operational Security" },
    description: { sv: "Operativa roller inom bevakning, ordning och skydd.", en: "Operational roles across guarding, order and protection." } },
  { id: "police_public", icon: "shield",
    name: { sv: "Polis och samhällsskydd", en: "Police and Public Safety" },
    description: { sv: "Yrken inom myndighetsutövning, ordning och rättsvård.", en: "Roles within government authority, public order and law enforcement." } },
  { id: "defence_protective", icon: "user-check",
    name: { sv: "Försvar och personskydd", en: "Defence and Protective Security" },
    description: { sv: "Militär säkerhet och skydd av individer och skyddsvärda objekt.", en: "Military security and protection of individuals and sensitive assets." } },
  { id: "corporate", icon: "building",
    name: { sv: "Företagssäkerhet och ledarskap", en: "Corporate Security and Leadership" },
    description: { sv: "Strategisk säkerhet, ledning och styrning inom organisationer.", en: "Strategic security, leadership and governance within organisations." } },
  { id: "physical_technical", icon: "cpu",
    name: { sv: "Fysisk och teknisk säkerhet", en: "Physical and Technical Security" },
    description: { sv: "Tekniska system, installation och drift av säkerhetslösningar.", en: "Technical systems, installation and operation of security solutions." } },
  { id: "risk_crisis", icon: "alert-triangle",
    name: { sv: "Risk, kris och kontinuitet", en: "Risk, Crisis and Business Continuity" },
    description: { sv: "Identifiera och hantera risker, kriser och verksamhetskontinuitet.", en: "Identify and manage risk, crisis and business continuity." } },
  { id: "investigations_intel", icon: "search",
    name: { sv: "Utredning, underrättelse och analys", en: "Investigations, Intelligence and Analysis" },
    description: { sv: "Analys, utredning och underrättelsearbete.", en: "Analysis, investigation and intelligence work." } },
  { id: "financial_crime", icon: "scale",
    name: { sv: "Finansiell brottslighet, AML och compliance", en: "Financial Crime, AML and Compliance" },
    description: { sv: "Motverkan av penningtvätt, bedrägerier och regelefterlevnad.", en: "Anti-money-laundering, fraud prevention and compliance." } },
  { id: "critical_infra", icon: "server",
    name: { sv: "Kritisk infrastruktur och datacenter", en: "Critical Infrastructure and Data Centers" },
    description: { sv: "Skydd av samhällsviktig verksamhet och kritisk digital infrastruktur.", en: "Protection of critical infrastructure and digital critical services." } },
  { id: "cyber_infosec", icon: "lock",
    name: { sv: "Cyber- och informationssäkerhet", en: "Cybersecurity and Information Security" },
    description: { sv: "Digital säkerhet, incidenthantering och informationsskydd.", en: "Digital security, incident response and information protection." } },
  { id: "consulting_specialist", icon: "handshake",
    name: { sv: "Säkerhetskonsultation och specialistroller", en: "Security Consulting and Specialist Roles" },
    description: { sv: "Rådgivning, specialisering och tvärgående kompetens.", en: "Advisory, specialisation and cross-cutting expertise." } },
] as const;

export function getFamily(id: string) {
  return professionFamilies.find((f) => f.id === id);
}