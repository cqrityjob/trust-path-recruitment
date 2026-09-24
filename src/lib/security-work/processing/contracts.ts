import { z } from "zod";

export const SW_EXTRACTION_VERSION = "sw-text-1.0.0";
export const SW_AI_TASK_VERSION = "sw-analysis-1.1.0";
export const SW_AI_PROMPT_VERSION = "sw-analysis-prompt-1.1.0";
export const SW_AI_POLICY_VERSION = "sw-analysis-policy-1.1.0";
export const SW_AI_OUTPUT_VERSION = "sw-analysis-output-1.0.0";

export const EXTRACTION_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  pages: 100,
  zipEntries: 256,
  xmlBytes: 8 * 1024 * 1024,
  uncompressedBytes: 20 * 1024 * 1024,
  compressionRatio: 200,
  textCharacters: 200_000,
  chunkCharacters: 16_000,
  segments: 200,
  timeoutMs: 10_000,
});

export type ExtractionFailureCode =
  | "unsupported"
  | "malformed"
  | "encrypted"
  | "too_large"
  | "too_many_pages"
  | "too_much_text"
  | "scanned_or_empty"
  | "deadline"
  | "cancelled"
  | "processor_not_configured"
  | "processor_unavailable"
  | "engine_unavailable";

export class ExtractionError extends Error {
  constructor(readonly code: ExtractionFailureCode) {
    super(`SW_EXTRACTION_${code.toUpperCase()}`);
    this.name = "ExtractionError";
  }
}

export interface ExtractedSegment {
  readonly ordinal: number;
  readonly locator: { readonly kind: "page" | "section"; readonly number: number };
  readonly text: string;
  readonly sha256: string;
}

export interface DocumentExtraction {
  readonly sha256: string;
  readonly extractorVersion: typeof SW_EXTRACTION_VERSION;
  readonly format: "pdf" | "docx";
  readonly pageCount: number | null;
  readonly segments: readonly ExtractedSegment[];
  readonly warnings: readonly ("pages_without_text" | "body_text_only")[];
}

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = (max: number) => z.string().trim().min(1).max(max);

/** Immutable recorded source claims, not independently verified facts or currency. */
export const sourceMetadataSchema = z
  .object({
    title: boundedText(500),
    publisher: z.string().max(2000),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    retrievedAt: z.string().datetime({ offset: true }),
  })
  .strict();

/** Only server-loaded immutable source items belong in this manifest. */
export const manifestSegmentSchema = z
  .object({
    segmentId: uuid,
    sourceItemId: uuid,
    text: boundedText(EXTRACTION_LIMITS.chunkCharacters),
    sha256,
    locator: boundedText(240),
    metadata: sourceMetadataSchema.optional(),
  })
  .strict();
export type ManifestSegment = z.infer<typeof manifestSegmentSchema>;

export const userInputSchema = z
  .object({
    id: uuid,
    text: boundedText(4000),
    kind: z.enum(["user_input", "assumption"]).default("user_input"),
    context: z.string().max(4000).optional(),
  })
  .strict();
export type AnalysisUserInput = z.infer<typeof userInputSchema>;

export const citationSchema = z
  .object({
    segmentId: uuid,
    sourceItemId: uuid,
    quote: boundedText(2000),
  })
  .strict();

const narrativeFields = {
  statement: boundedText(4000),
  citations: z.array(citationSchema).max(8),
  userInputIds: z.array(uuid).max(8),
  uncertainty: z.string().max(1500),
};
export const sourceFactSchema = z
  .object({
    ...narrativeFields,
    kind: z.literal("source_fact"),
    citations: z.array(citationSchema).min(1).max(8),
    userInputIds: z.array(uuid).max(0),
  })
  .strict();
export const userInterpretationSchema = z
  .object({
    ...narrativeFields,
    kind: z.literal("user_interpretation"),
    userInputIds: z.array(uuid).length(1),
  })
  .strict();
export const assumptionSchema = z
  .object({ ...narrativeFields, kind: z.literal("assumption") })
  .strict();
export const proposalSchema = z
  .object({ ...narrativeFields, kind: z.literal("ai_proposal") })
  .strict();
export const narrativeSchema = z.discriminatedUnion("kind", [
  sourceFactSchema,
  userInterpretationSchema,
  assumptionSchema,
  proposalSchema,
]);
export type AnalysisNarrative = z.infer<typeof narrativeSchema>;

export const REPORT_SECTIONS = {
  rsa: [
    "introduction",
    "method",
    "context",
    "risk_analysis",
    "vulnerability",
    "conclusions_actions",
  ],
  monitoring: ["summary", "threats", "technology", "regulation", "incidents", "recommendations"],
  legacy_security: [
    "executive_summary",
    "overall_description",
    "risk_assessment",
    "identified_risks",
    "security_arrangement",
    "preparedness_incident_management",
    "conclusion",
    "contacts",
  ],
} as const;
export type AnalysisReportKind = keyof typeof REPORT_SECTIONS;
const sectionKeySchema = z.enum([
  "introduction",
  "method",
  "context",
  "risk_analysis",
  "vulnerability",
  "conclusions_actions",
  "summary",
  "threats",
  "technology",
  "regulation",
  "incidents",
  "recommendations",
  "executive_summary",
  "overall_description",
  "identified_risks",
  "risk_assessment",
  "security_arrangement",
  "preparedness_incident_management",
  "conclusion",
  "contacts",
]);

export const analysisOutputSchema = z
  .object({
    schemaVersion: z.literal(SW_AI_OUTPUT_VERSION),
    facts: z.array(sourceFactSchema).max(40),
    userInterpretations: z.array(userInterpretationSchema).max(20),
    assumptions: z.array(assumptionSchema).max(20),
    proposals: z.array(proposalSchema).max(30),
    uncertainty: z.string().max(4000),
    risks: z
      .array(
        z
          .object({
            title: boundedText(300),
            description: narrativeSchema,
            likelihood: z.number().int().min(1).max(5).nullable(),
            consequence: z.number().int().min(1).max(5).nullable(),
            calibrationId: uuid.nullable(),
            rationale: narrativeSchema,
            currentControls: z
              .array(z.discriminatedUnion("kind", [sourceFactSchema, userInterpretationSchema]))
              .max(12)
              .nullable(),
            proposedActions: z.array(proposalSchema).max(12),
          })
          .strict(),
      )
      .max(20),
    followups: z.array(proposalSchema).max(20),
    contradictions: z
      .array(
        z
          .object({
            statement: boundedText(2000),
            citations: z.array(citationSchema).min(2).max(8),
            uncertainty: boundedText(1500),
          })
          .strict(),
      )
      .max(20),
    report: z
      .object({
        kind: z.enum(["rsa", "monitoring", "legacy_security"]),
        sections: z
          .array(
            z
              .object({
                key: sectionKeySchema,
                content: z.array(narrativeSchema).max(20),
                missingInformation: z.string().max(1500),
              })
              .strict(),
          )
          .min(1)
          .max(14),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

const scaleSchema = z
  .array(
    z.object({ level: z.number().int().min(1).max(5), definition: boundedText(1000) }).strict(),
  )
  .length(5)
  .refine(
    (scale) => new Set(scale.map((entry) => entry.level)).size === 5,
    "Every scale level must be defined",
  );
export const riskCalibrationSchema = z
  .object({
    id: uuid,
    likelihoodScale: scaleSchema,
    consequenceScale: scaleSchema,
    horizon: boundedText(2000),
    riskAcceptance: boundedText(4000),
  })
  .strict();

export const analysisInputSchema = z
  .object({
    language: z.enum(["sv", "en"]),
    // Server-derived from the immutable job, never the provider's current clock.
    asOf: z.string().datetime({ offset: true }).optional(),
    methodSnapshot: z
      .object({
        id: boundedText(100),
        analysisType: z.enum(["rsa", "monitoring", "legacy_security"]),
        definition: z
          .object({
            version: z.number().int().positive(),
            matrix: z
              .array(z.array(z.enum(["green", "yellow", "orange", "red"])).length(5))
              .length(5)
              .optional(),
          })
          .passthrough(),
      })
      .strict()
      .optional(),
    purpose: z.enum([
      "summarise",
      "explain_relevance",
      "compare_sources",
      "identify_uncertainty",
      "draft_assessment",
      "suggest_actions",
      "draft_report",
      "quality_review",
    ]),
    manifest: z.array(manifestSegmentSchema).min(1).max(EXTRACTION_LIMITS.segments),
    userInputs: z.array(userInputSchema).max(200),
    reportKind: z.enum(["rsa", "monitoring", "legacy_security"]).nullable(),
    calibration: riskCalibrationSchema.nullable(),
  })
  .strict();
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
