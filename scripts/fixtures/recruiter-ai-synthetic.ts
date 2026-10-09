import {
  RECRUITER_AI_CONTRACT_VERSION,
  type RecruiterAiContext,
  type RecruiterAiRequest,
} from "../../src/lib/recruitment/ai/contract";
import { syntheticTextHash } from "../../src/lib/recruitment/ai/synthetic-sandbox.server";
export function syntheticId(n: number): string {
  return `b7140000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
export function syntheticContext(text = "Arbetade som väktare 2021–2024."): RecruiterAiContext {
  return {
    employerId: syntheticId(1),
    applicationId: syntheticId(2),
    jobId: syntheticId(3),
    actorId: syntheticId(4),
    role: "owner",
    activeEmployer: true,
    mayReadApplication: true,
    plan: {
      id: "synthetic-plan",
      version: "1",
      permitsTask: true,
      budgetUnits: 100,
      maxConcurrent: 1,
      maxQueued: 1,
      maxDurationMs: 1000,
    },
    profile: {
      id: syntheticId(5),
      version: 1,
      contentHash: "a".repeat(64),
      confirmed: true,
      requirements: [
        {
          id: syntheticId(6),
          kind: "mandatory",
          label: "Relevant arbetslivserfarenhet",
          acceptedOrigins: ["application_cv"],
        },
      ],
    },
    pins: {
      model: "none-synthetic-fixture",
      modelVersion: "1",
      promptVersion: "draft-1",
      promptHash: "b".repeat(64),
      columnVersion: "ri-columns-1",
      schemaVersion: RECRUITER_AI_CONTRACT_VERSION,
    },
    passages: [
      {
        id: syntheticId(7),
        sourceId: syntheticId(8),
        sourceVersion: "source-v1",
        sourceContentHash: syntheticTextHash(text),
        passageHash: syntheticTextHash(text),
        employerId: syntheticId(1),
        applicationId: syntheticId(2),
        origin: "application_cv",
        text,
        readable: true,
        withdrawn: false,
      },
    ],
    humanItems: [
      {
        id: syntheticId(9),
        text: "Underlaget räcker inte för att bedöma denna kompetens.",
        selectedBy: syntheticId(4),
        selectedAt: "2026-10-08T00:00:00.000Z",
        questionId: syntheticId(10),
      },
    ],
  };
}
export function syntheticRequest(
  operation = 11,
  task: RecruiterAiRequest["task"] = "source_summary",
): RecruiterAiRequest {
  return {
    employerId: syntheticId(1),
    applicationId: syntheticId(2),
    operationId: syntheticId(operation),
    task,
    language: "sv",
  };
}
export function syntheticOutput(
  c: RecruiterAiContext,
  task: RecruiterAiRequest["task"] = "source_summary",
) {
  const p = c.passages[0];
  const shared = {
    contractVersion: RECRUITER_AI_CONTRACT_VERSION,
    humanReviewRequired: true,
    reviewState: "unreviewed",
  };
  const cited = {
    text: p.text,
    citations: [
      {
        passageId: p.id,
        sourceId: p.sourceId,
        sourceVersion: p.sourceVersion,
        sourceContentHash: p.sourceContentHash,
        passageHash: p.passageHash,
        offsetEncoding: "utf16",
        start: 0,
        end: p.text.length,
        quote: p.text,
      },
    ],
  };
  if (task === "source_summary")
    return { ...shared, task, facts: [{ ...cited, evidenceState: "candidate_declared" }] };
  if (task === "criterion_linking")
    return {
      ...shared,
      task,
      links: [
        {
          ...cited,
          requirementId: c.profile.requirements[0].id,
          profileVersion: c.profile.version,
          relation: "possibly_relevant",
        },
      ],
    };
  if (task === "neutral_clarifications")
    return {
      ...shared,
      task,
      questions: [
        {
          ...cited,
          text: "Vilken tidsperiod avser uppgiften?",
          requirementId: c.profile.requirements[0].id,
          gap: "ambiguous",
          nextAction: "Be kandidaten ange datum och originalunderlag.",
        },
      ],
    };
  return {
    ...shared,
    task,
    paragraphs: [{ humanItemId: c.humanItems[0].id, text: c.humanItems[0].text }],
  };
}
// Independently written manual original/OCR facit; no provider is evaluated.
export const SYNTHETIC_OCR_FACIT = {
  fixtureId: "ocr-year-2028-vs-2038",
  originalHumanReadable: "Intyget gäller till 2028-12-31.",
  extractedOcr: "Intyget gäller till 2038-12-31.",
  expectedHumanVerdict: "reject_and_verify_original",
  expectedMachineSupport: "requires_human_review",
} as const;
