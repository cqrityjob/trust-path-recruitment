/**
 * Public jobs-surface labels for career areas ("Yrkesområden").
 *
 * Internal identifiers (family_id) remain unchanged. This module only
 * provides the professional, market-recognised public names and
 * descriptions used across the /jobs surfaces. Do NOT reuse this in the
 * Career Center — that surface owns its own copy.
 */

export type CareerAreaLabel = {
  id: string;
  name: { sv: string; en: string };
  description: { sv: string; en: string };
};

export const careerAreaLabels: readonly CareerAreaLabel[] = [
  {
    id: "protective_operations",
    name: { sv: "Bevakning och operativt skydd", en: "Protective Operations" },
    description: {
      sv: "Operativa bevaknings-, ordnings- och personskyddsroller.",
      en: "Operational guarding, order and close-protection roles.",
    },
  },
  {
    id: "public_safety_justice",
    name: { sv: "Samhällsskydd och rättsväsende", en: "Public Safety & Justice" },
    description: {
      sv: "Yrken inom polis, ordning, gränskontroll och rättsvård.",
      en: "Roles across policing, public order, border control and justice.",
    },
  },
  {
    id: "corrections_secure_transport",
    name: { sv: "Kriminalvård och säker transport", en: "Corrections & Secure Transport" },
    description: {
      sv: "Kriminalvård, transportsäkerhet och värdetransport.",
      en: "Correctional services, transport security and cash-in-transit.",
    },
  },
  {
    id: "defence_national_security",
    name: { sv: "Försvar och nationell säkerhet", en: "Defence & National Security" },
    description: {
      sv: "Militär säkerhet och roller kopplade till försvar och nationell säkerhet.",
      en: "Military security roles connected to defence and national security.",
    },
  },
  {
    id: "corporate_security",
    name: { sv: "Företagssäkerhet", en: "Corporate Security" },
    description: {
      sv: "Interna säkerhetsfunktioner inom företag och organisationer.",
      en: "In-house security functions within companies and organisations.",
    },
  },
  {
    id: "critical_infrastructure_security",
    name: { sv: "Kritisk infrastruktur och datacenter", en: "Critical Infrastructure Security" },
    description: {
      sv: "Skydd av samhällsviktig verksamhet, hamnar, flygplatser och datacenter.",
      en: "Protection of essential services, ports, airports and data centres.",
    },
  },
  {
    id: "risk_management",
    name: { sv: "Riskhantering", en: "Risk Management" },
    description: {
      sv: "Identifiering, analys och hantering av operativa och organisatoriska risker.",
      en: "Identification, analysis and management of operational and organisational risk.",
    },
  },
  {
    id: "crisis_management",
    name: { sv: "Krishantering och räddning", en: "Crisis Management & Emergency Response" },
    description: {
      sv: "Krisberedskap, incidentledning och räddningstjänst.",
      en: "Crisis preparedness, incident command and emergency response.",
    },
  },
  {
    id: "business_continuity_resilience",
    name: { sv: "Kontinuitet och motståndskraft", en: "Business Continuity & Resilience" },
    description: {
      sv: "Kontinuitetsplanering och organisatorisk motståndskraft.",
      en: "Continuity planning and organisational resilience.",
    },
  },
  {
    id: "cyber_information_security",
    name: { sv: "Cyber- och informationssäkerhet", en: "Cyber & Information Security" },
    description: {
      sv: "Digital säkerhet, incidenthantering och informationsskydd.",
      en: "Digital security, incident response and information protection.",
    },
  },
  {
    id: "financial_crime_compliance",
    name: { sv: "Finansiell brottslighet och compliance", en: "Financial Crime & Compliance" },
    description: {
      sv: "AML, bedrägeribekämpning och regelefterlevnad.",
      en: "Anti-money-laundering, fraud prevention and compliance.",
    },
  },
  {
    id: "security_technology",
    name: { sv: "Säkerhetsteknik", en: "Security Technology" },
    description: {
      sv: "Installation, drift och integration av tekniska säkerhetssystem.",
      en: "Installation, operation and integration of technical security systems.",
    },
  },
  {
    id: "security_leadership_governance",
    name: { sv: "Säkerhetsledning och styrning", en: "Security Leadership & Governance" },
    description: {
      sv: "Strategisk säkerhet, ledarskap, rådgivning och styrning.",
      en: "Strategic security leadership, advisory and governance.",
    },
  },
  {
    id: "investigations_intelligence",
    name: { sv: "Utredning och underrättelse", en: "Investigations & Intelligence" },
    description: {
      sv: "Utredning, underrättelse och analys inom offentlig och privat sektor.",
      en: "Investigations, intelligence and analysis across public and private sectors.",
    },
  },
] as const;

const byId: ReadonlyMap<string, CareerAreaLabel> = new Map(
  careerAreaLabels.map((c) => [c.id, c] as const),
);

export function getCareerAreaLabel(id: string | null | undefined): CareerAreaLabel | undefined {
  if (!id) return undefined;
  return byId.get(id);
}