import type { CareerPath } from "./types";

// Career paths are RELATIONSHIPS between professions.
// They describe possible or common transitions — never guaranteed progression.

export const careerPaths: readonly CareerPath[] = [
  { from: "security-officer", to: "ordningsvakt", likelihood: "common", status: "researched", lastVerified: "2026-07-16",
    transferableCompetencies: ["observation", "conflict", "communication", "reporting"],
    notes: { sv: "Kompetenskraven skiljer sig — ordningsvakt kräver egen grundutbildning och förordnande.", en: "Requirements differ — a public order officer requires separate basic training and appointment." } },
  { from: "security-officer", to: "skyddsvakt", likelihood: "common", status: "researched", lastVerified: "2026-07-16",
    transferableCompetencies: ["observation", "reporting", "risk_awareness"],
    notes: { sv: "Skyddsvakt förutsätter godkännande och separat utbildning enligt skyddslagen.", en: "Protective security guards require approval and separate training under the Swedish Protective Security Act." } },
  // The pilot's middle of the chain. Both edges are unregulated moves, and
  // the notes say so explicitly: nothing here is a förordnande, an approval
  // or a mandated course, and no timing is claimed because none is sourced.
  { from: "security-officer", to: "security-coordinator", likelihood: "common", status: "researched", lastVerified: "2026-09-08",
    transferableCompetencies: ["reporting", "risk_awareness", "communication", "teamwork"],
    competencyGaps: ["planning", "analytical", "leadership"],
    experienceRequired: { sv: "Operativ erfarenhet från bevaknings- eller ordningshållningsuppdrag, tillsammans med vana att dokumentera händelser och samverka med kund, polis och andra myndigheter.", en: "Operational experience from guarding or public-order assignments, together with a habit of documenting incidents and working with clients, police and other authorities." },
    notes: { sv: "Säkerhetssamordnare är inte ett reglerat yrke — övergången bygger på erfarenhet och dokumenterat arbetssätt, inte på ett förordnande eller en föreskriven utbildning.", en: "Security coordinator is not a regulated profession — this move rests on experience and a documented way of working, not on an appointment or a mandated course." } },
  { from: "security-coordinator", to: "security-manager", likelihood: "possible", status: "researched", lastVerified: "2026-09-08",
    transferableCompetencies: ["planning", "risk_awareness", "communication", "analytical"],
    competencyGaps: ["leadership", "decision_making"],
    experienceRequired: { sv: "Erfarenhet av att driva säkerhetsarbete över flera funktioner, samt av budget, leverantörsstyrning och rapportering till ledning.", en: "Experience of running security work across several functions, and of budget, supplier management and reporting to executive management." },
    notes: { sv: "Steget handlar om ansvar snarare än behörighet: säkerhetschef är inte heller ett reglerat yrke, men rollen förutsätter personalansvar, budgetansvar och ett mandat från ledningen.", en: "This step is about responsibility rather than authorisation: security manager is not a regulated profession either, but the role presupposes staff and budget responsibility and a mandate from executive management." } },
  { from: "security-manager", to: "security-consultant", likelihood: "possible", status: "placeholder" },
  { from: "police-officer", to: "security-investigator", likelihood: "possible", status: "placeholder",
    notes: { sv: "Övergången beror på erfarenhet, arbetsgivare och land — inget garanterat spår.", en: "Transition depends on experience, employer and country — not a guaranteed path." } },
  { from: "police-officer", to: "intelligence-analyst", likelihood: "possible", status: "placeholder" },
  { from: "police-officer", to: "security-manager", likelihood: "possible", status: "placeholder" },
  { from: "military-security-specialist", to: "close-protection", likelihood: "possible", status: "placeholder" },
  { from: "military-security-specialist", to: "data-center-security", likelihood: "possible", status: "placeholder" },
  { from: "military-security-specialist", to: "security-manager", likelihood: "possible", status: "placeholder" },
  { from: "security-technician", to: "data-center-security", likelihood: "possible", status: "placeholder" },
  { from: "security-technician", to: "security-manager", likelihood: "possible", status: "placeholder" },
  { from: "aml-specialist", to: "fraud-investigator", likelihood: "possible", status: "placeholder" },
  { from: "aml-specialist", to: "security-consultant", likelihood: "possible", status: "placeholder" },
  { from: "risk-manager", to: "security-manager", likelihood: "possible", status: "placeholder" },
  { from: "crisis-continuity-manager", to: "security-manager", likelihood: "possible", status: "placeholder" },
  { from: "soc-analyst", to: "security-consultant", likelihood: "possible", status: "placeholder" },
];

export function getPathsFrom(id: string) {
  return careerPaths.filter((p) => p.from === id);
}
export function getPathsTo(id: string) {
  return careerPaths.filter((p) => p.to === id);
}