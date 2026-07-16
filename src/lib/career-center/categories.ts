import type { Bi, Category, ExperienceLevel } from "./types";

export const categories: readonly Category[] = [
  { id: "guarding", icon: "shield-check", name: { sv: "Bevakning", en: "Guarding" }, desc: { sv: "Operativa bevaknings- och skyddsroller.", en: "Operational guarding and protection roles." } },
  { id: "corporate", icon: "building", name: { sv: "Företagssäkerhet", en: "Corporate Security" }, desc: { sv: "Säkerhet inom företag och organisationer.", en: "Security in corporations and organizations." } },
  { id: "public_safety", icon: "shield", name: { sv: "Ordning & rättsvård", en: "Public Safety" }, desc: { sv: "Roller inom rättsvård och samhällsskydd.", en: "Public safety and law enforcement roles." } },
  { id: "risk", icon: "alert-triangle", name: { sv: "Riskhantering", en: "Risk Management" }, desc: { sv: "Identifiering och hantering av risker.", en: "Identifying and managing risk." } },
  { id: "cyber", icon: "lock", name: { sv: "Cyber- & informationssäkerhet", en: "Cyber & Information Security" }, desc: { sv: "Digital säkerhet och informationsskydd.", en: "Digital security and information protection." } },
  { id: "investigations", icon: "search", name: { sv: "Utredning", en: "Investigations" }, desc: { sv: "Utredning och analys.", en: "Investigation and analysis." } },
  { id: "aml", icon: "scale", name: { sv: "AML & compliance", en: "AML & Compliance" }, desc: { sv: "Finansiell brottslighet och regelefterlevnad.", en: "Financial crime and compliance." } },
  { id: "critical_infra", icon: "server", name: { sv: "Kritisk infrastruktur", en: "Critical Infrastructure" }, desc: { sv: "Skydd av samhällsviktig verksamhet.", en: "Protection of critical infrastructure." } },
  { id: "protective", icon: "user-check", name: { sv: "Personskydd", en: "Protective Security" }, desc: { sv: "Skydd av individer och skyddsvärda objekt.", en: "Protection of individuals and sensitive assets." } },
  { id: "tech", icon: "cpu", name: { sv: "Säkerhetsteknik", en: "Security Technology" }, desc: { sv: "Tekniska säkerhetssystem.", en: "Technical security systems." } },
  { id: "emergency", icon: "siren", name: { sv: "Kris & beredskap", en: "Emergency & Crisis" }, desc: { sv: "Krishantering och kontinuitet.", en: "Crisis management and continuity." } },
  { id: "leadership", icon: "landmark", name: { sv: "Ledarskap", en: "Leadership" }, desc: { sv: "Ledande roller inom säkerhet.", en: "Leadership roles across security." } },
] as const;

export const experienceLevels: readonly { id: ExperienceLevel; name: Bi }[] = [
  { id: "entry", name: { sv: "Ingångsnivå", en: "Entry" } },
  { id: "mid", name: { sv: "Mellannivå", en: "Mid" } },
  { id: "senior", name: { sv: "Senior", en: "Senior" } },
  { id: "executive", name: { sv: "Ledning", en: "Executive" } },
] as const;

export function getCategory(id: string) {
  return categories.find((c) => c.id === id);
}