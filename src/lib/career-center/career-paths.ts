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
  { from: "security-officer", to: "security-coordinator", likelihood: "possible", status: "placeholder" },
  { from: "security-coordinator", to: "security-manager", likelihood: "possible", status: "placeholder" },
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