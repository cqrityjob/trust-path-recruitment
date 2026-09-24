import { z } from "zod";

export type AnalysisType = "rsa" | "monitoring" | "legacy_security";
export type RiskColour = "green" | "yellow" | "orange" | "red";
// Owner approved 2026-09-24 after visual inspection of method 4b, page 4.
// Rows are likelihood 1..5, columns consequence 1..5. This is NOT S × K.
export const RSA_MATRIX = [
  ["green", "green", "green", "green", "green"],
  ["green", "green", "yellow", "yellow", "yellow"],
  ["green", "yellow", "yellow", "orange", "orange"],
  ["green", "yellow", "orange", "red", "red"],
  ["green", "yellow", "red", "red", "red"],
] as const satisfies readonly (readonly RiskColour[])[];

export function riskColour(
  likelihood: number | null,
  consequence: number | null,
): RiskColour | null {
  if (
    likelihood === null ||
    consequence === null ||
    !Number.isInteger(likelihood) ||
    !Number.isInteger(consequence) ||
    likelihood < 1 ||
    likelihood > 5 ||
    consequence < 1 ||
    consequence > 5
  )
    return null;
  return RSA_MATRIX[likelihood - 1][consequence - 1];
}

export const analysisMethods = {
  rsa: { method: "rsa-v1", template: "rsa-report-v1", reportType: "risk_report" },
  monitoring: { method: "monitoring-v1", template: "monitoring-report-v1", reportType: "briefing" },
  legacy_security: {
    method: "legacy-security-v1",
    template: "legacy-security-report-v1",
    reportType: "security_assessment",
  },
} as const;

export const reportSections = {
  rsa: [
    ["introduction", "Inledning", "Introduction"],
    ["method", "Metod och genomförande", "Method and process"],
    ["context", "Omvärldsanalys", "Context analysis"],
    ["risk_analysis", "Riskanalys", "Risk analysis"],
    ["vulnerability", "Sårbarhetsbedömning", "Vulnerability assessment"],
    ["conclusions_actions", "Slutsatser och åtgärder", "Conclusions and actions"],
  ],
  monitoring: [
    ["summary", "Sammanfattning", "Summary"],
    ["threats", "Aktuell hotbild", "Current threats"],
    ["technology", "Teknologisk utveckling", "Technology developments"],
    ["regulation", "Regelverk och lagar", "Regulations and laws"],
    ["incidents", "Branschtrender och incidenter", "Industry trends and incidents"],
    ["recommendations", "Rekommendationer", "Recommendations"],
  ],
  legacy_security: [
    ["executive_summary", "Sammanfattning", "Executive summary"],
    ["overall_description", "Övergripande beskrivning", "Overall description"],
    ["risk_assessment", "Riskbedömning", "Risk assessment"],
    ["identified_risks", "Identifierade risker", "Identified risks"],
    ["security_arrangement", "Säkerhetsupplägg", "Security arrangement"],
    [
      "preparedness_incident_management",
      "Beredskap och incidenthantering",
      "Preparedness and incident management",
    ],
    ["conclusion", "Slutsats", "Conclusion"],
    ["contacts", "Kontaktpersoner", "Contacts"],
  ],
} as const;

const text = z.string().max(16000);
export const calibrationSchema = z
  .object({
    likelihood: z.array(z.string().max(1000)).length(5),
    consequence: z.array(z.string().max(1000)).length(5),
    riskAcceptance: z.string().max(4000),
  })
  .strict();
export const contextSchema = z
  .object({
    profile: z.string().max(20000),
    calibration: calibrationSchema,
  })
  .strict();
export const initialContext = (profile: string) => ({
  profile,
  calibration: {
    likelihood: ["", "", "", "", ""],
    consequence: ["", "", "", "", ""],
    riskAcceptance: "",
  },
});
export function calibrated(context: z.infer<typeof contextSchema>, horizon: string) {
  return Boolean(
    horizon.trim() &&
    context.calibration.riskAcceptance.trim() &&
    [...context.calibration.likelihood, ...context.calibration.consequence].every((value) =>
      value.trim(),
    ),
  );
}
export const analysisSaveInput = z
  .object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid(),
    version: z.number().int().positive().nullable(),
    analysis_type: z.enum(["rsa", "monitoring", "legacy_security"]),
    title: z.string().trim().min(1).max(500),
    purpose: text,
    scope: text,
    horizon: z.string().max(2000),
    context_snapshot: contextSchema,
    situation: text,
    affected_activity: text,
    assets: text,
    threat: text,
    vulnerability: text,
    existing_controls: text,
    uncertainty: text,
    assumptions: text,
    proposed_measures: text,
    professional_conclusion: text,
    likelihood: z.number().int().min(1).max(5).nullable(),
    consequence: z.number().int().min(1).max(5).nullable(),
  })
  .strict();
export const reportSaveInput = z
  .object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid(),
    assessmentId: z.string().uuid(),
    version: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(500),
    language: z.enum(["sv", "en"]),
    sections: z.record(z.string().max(16000)),
    uncertainty: text,
  })
  .strict();
export type AnalysisSaveInput = z.infer<typeof analysisSaveInput>;
export type ReportSaveInput = z.infer<typeof reportSaveInput>;
