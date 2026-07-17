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
    id: "exploring",
    name: { sv: "Utforska säkerhetsyrken", en: "Explore security careers" },
    description: {
      sv: "För dig som vill upptäcka olika yrken och karriärvägar inom säkerhetsområdet.",
      en: "For people exploring roles and career paths across the security sector.",
    },
  },
  {
    id: "guarding",
    name: { sv: "Bevakning och operativ säkerhet", en: "Protective services and operational security" },
    description: {
      sv: "Yrken inom bevakning, ordning, skydd och operativ säkerhet.",
      en: "Roles in guarding, public order, protection and operational security.",
    },
  },
  {
    id: "police_public",
    name: { sv: "Polis och samhällsskydd", en: "Policing and public protection" },
    description: {
      sv: "Yrken inom brottsbekämpning, ordning, rättsväsende och samhällsskydd.",
      en: "Roles in law enforcement, public order, justice and public protection.",
    },
  },
  {
    id: "defence_protective",
    name: { sv: "Försvar och personskydd", en: "Defence and close protection" },
    description: {
      sv: "Yrken inom försvar, personskydd och skydd av personer och skyddsvärda verksamheter.",
      en: "Roles in defence, close protection and the protection of people and sensitive operations.",
    },
  },
  {
    id: "corporate",
    name: { sv: "Företagssäkerhet och säkerhetsledning", en: "Corporate security and security leadership" },
    description: {
      sv: "Yrken inom strategisk säkerhet, styrning, samordning och ledarskap.",
      en: "Roles in security strategy, governance, coordination and leadership.",
    },
  },
  {
    id: "physical_technical",
    name: { sv: "Fysisk och teknisk säkerhet", en: "Physical and electronic security" },
    description: {
      sv: "Yrken inom säkerhetsteknik, installation, drift och fysiskt skydd.",
      en: "Roles in security systems, installation, operations and physical protection.",
    },
  },
  {
    id: "risk_crisis",
    name: { sv: "Risk, kris och kontinuitet", en: "Risk, crisis and business continuity" },
    description: {
      sv: "Yrken inom riskhantering, krisberedskap och kontinuitetsplanering.",
      en: "Roles in risk management, crisis management and business continuity.",
    },
  },
  {
    id: "investigations_intel",
    name: { sv: "Utredning, underrättelse och analys", en: "Investigations, intelligence and analysis" },
    description: {
      sv: "Yrken inom utredning, informationsinhämtning, underrättelse och analys.",
      en: "Roles in investigations, intelligence gathering and analysis.",
    },
  },
  {
    id: "financial_crime",
    name: { sv: "AML, compliance och finansiell brottslighet", en: "AML, compliance and financial crime" },
    description: {
      sv: "Yrken inom penningtvätt, bedrägeribekämpning, regelefterlevnad och finansiella utredningar.",
      en: "Roles in anti-money laundering, fraud prevention, compliance and financial investigations.",
    },
  },
  {
    id: "critical_infra",
    name: { sv: "Kritisk infrastruktur och datacenter", en: "Critical infrastructure and data centres" },
    description: {
      sv: "Yrken som skyddar samhällsviktig verksamhet, kritisk infrastruktur och datacenter.",
      en: "Roles protecting essential services, critical infrastructure and data centres.",
    },
  },
  {
    id: "cyber_infosec",
    name: { sv: "Cyber- och informationssäkerhet", en: "Cybersecurity and information security" },
    description: {
      sv: "Yrken inom cybersäkerhet, informationssäkerhet och incidenthantering.",
      en: "Roles in cybersecurity, information security and incident response.",
    },
  },
  {
    id: "consulting_specialist",
    name: { sv: "Säkerhetskonsulter och specialister", en: "Security consultants and specialists" },
    description: {
      sv: "Konsult- och specialistyrken med rådgivande, fördjupad eller tvärgående kompetens.",
      en: "Advisory and specialist roles requiring advanced or cross-functional expertise.",
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