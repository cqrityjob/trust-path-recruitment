import { z } from "zod";
import { POLICY_SELF_TEST_VOCABULARIES } from "../../interview-intelligence/ai/policy";
import { screenPassages } from "../../interview-intelligence/ai/injection";

export const RECRUITER_AI_CONTRACT_VERSION = "recruiter-ai-v0.3-draft2";
export const RECRUITER_AI_TASKS = [
  "source_summary",
  "criterion_linking",
  "neutral_clarifications",
  "reviewed_report_draft",
] as const;
export type RecruiterAiTask = (typeof RECRUITER_AI_TASKS)[number];
export const RECRUITER_AI_DISABLED = "RECRUITER_AI_V03_DISABLED";
// Four separate switches; neither request input nor environment can open them.
export const RECRUITER_AI_FEATURES = Object.freeze({
  source_summary: false,
  criterion_linking: false,
  neutral_clarifications: false,
  reviewed_report_draft: false,
});

// Proposed wording, for content review; the source specification provided four
// intentions, not approved final SV/EN copy. These are never sent to a provider.
export const RECRUITER_AI_ENTRY_DRAFT = Object.freeze([
  {
    task: "source_summary",
    sv: "Vilket underlag finns för de beslutade skallkraven?",
    en: "What evidence is available for the agreed mandatory requirements?",
  },
  {
    task: "criterion_linking",
    sv: "Vilka uppgifter behöver klarläggas mot kravprofilen?",
    en: "Which information needs clarification against the requirements profile?",
  },
  {
    task: "neutral_clarifications",
    sv: "Vilka neutrala följdfrågor kan förberedas?",
    en: "Which neutral follow-up questions can be prepared?",
  },
  {
    task: "reviewed_report_draft",
    sv: "Vilka kontroller återstår efter intervjun?",
    en: "Which checks remain after the interview?",
  },
] as const);

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().trim().min(1).max(128);
// Declarative draft support only. A future trusted adapter must still read the
// profile's actual accepted kinds and current sharing/withdrawal permissions.
const sourceOrigin = z.enum([
  "application_answer",
  "application_cv",
  "interview_source",
  "external_reference",
  "candidate_supplement",
]);
export const recruiterAiContextSchema = z
  .object({
    employerId: uuid,
    applicationId: uuid,
    jobId: uuid,
    actorId: uuid,
    role: z.enum(["owner", "admin", "member"]),
    activeEmployer: z.literal(true),
    mayReadApplication: z.literal(true),
    plan: z
      .object({
        id: version,
        version,
        permitsTask: z.boolean(),
        budgetUnits: z.number().int().min(0).max(1_000_000),
        maxConcurrent: z.number().int().min(1).max(2),
        maxQueued: z.number().int().min(0).max(8),
        maxDurationMs: z.number().int().min(1).max(30_000),
      })
      .strict(),
    profile: z
      .object({
        id: uuid,
        version: z.number().int().positive(),
        contentHash: hash,
        confirmed: z.literal(true),
        requirements: z
          .array(
            z
              .object({
                id: uuid,
                kind: z.enum(["mandatory", "desirable"]),
                label: z.string().min(1).max(500),
                acceptedOrigins: z.array(sourceOrigin).min(1).max(5),
              })
              .strict(),
          )
          .min(1)
          .max(60),
      })
      .strict(),
    pins: z
      .object({
        model: version,
        modelVersion: version,
        promptVersion: version,
        promptHash: hash,
        columnVersion: version,
        schemaVersion: z.literal(RECRUITER_AI_CONTRACT_VERSION),
      })
      .strict(),
    passages: z
      .array(
        z
          .object({
            id: uuid,
            sourceId: uuid,
            sourceVersion: version,
            sourceContentHash: hash,
            passageHash: hash,
            employerId: uuid,
            applicationId: uuid,
            origin: sourceOrigin,
            text: z.string().min(1).max(20_000),
            readable: z.boolean(),
            withdrawn: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    // Only authoritative already-human-selected items, never AI's own claim of review.
    humanItems: z
      .array(
        z
          .object({
            id: uuid,
            text: z.string().min(1).max(5000),
            selectedBy: uuid,
            selectedAt: z.string().datetime(),
            questionId: uuid.nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type RecruiterAiContext = z.infer<typeof recruiterAiContextSchema>;
export const recruiterAiRequestSchema = z
  .object({
    employerId: uuid,
    applicationId: uuid,
    operationId: uuid,
    task: z.enum(RECRUITER_AI_TASKS),
    language: z.enum(["sv", "en"]),
  })
  .strict();
export type RecruiterAiRequest = z.infer<typeof recruiterAiRequestSchema>;
export function recruiterAiRequestForTask(task: RecruiterAiTask) {
  return recruiterAiRequestSchema.extend({ task: z.literal(task) });
}

const citation = z
  .object({
    passageId: uuid,
    sourceId: uuid,
    sourceVersion: version,
    sourceContentHash: hash,
    passageHash: hash,
    offsetEncoding: z.literal("utf16"),
    start: z.number().int().min(0),
    end: z.number().int().positive(),
    quote: z.string().min(1).max(2000),
  })
  .strict();
const shared = {
  contractVersion: z.literal(RECRUITER_AI_CONTRACT_VERSION),
  humanReviewRequired: z.literal(true),
  reviewState: z.literal("unreviewed"),
};
const citedItem = {
  text: z.string().min(1).max(2000),
  citations: z.array(citation).min(1).max(5),
};
export const recruiterAiOutputSchema = z.discriminatedUnion("task", [
  z
    .object({
      ...shared,
      task: z.literal("source_summary"),
      facts: z
        .array(
          z
            .object({
              ...citedItem,
              evidenceState: z.enum(["candidate_declared", "extraction_unclear"]),
            })
            .strict(),
        )
        .max(80),
    })
    .strict(),
  z
    .object({
      ...shared,
      task: z.literal("criterion_linking"),
      links: z
        .array(
          z
            .object({
              ...citedItem,
              requirementId: uuid,
              profileVersion: z.number().int().positive(),
              relation: z.enum(["possibly_relevant", "insufficient", "conflicting"]),
            })
            .strict(),
        )
        .max(80),
    })
    .strict(),
  z
    .object({
      ...shared,
      task: z.literal("neutral_clarifications"),
      questions: z
        .array(
          z
            .object({
              ...citedItem,
              requirementId: uuid,
              gap: z.enum(["missing", "ambiguous", "conflicting", "external_verification"]),
              nextAction: z.string().min(1).max(500),
            })
            .strict(),
        )
        .max(60),
    })
    .strict(),
  z
    .object({
      ...shared,
      task: z.literal("reviewed_report_draft"),
      paragraphs: z
        .array(z.object({ humanItemId: uuid, text: z.string().min(1).max(5000) }).strict())
        .max(100),
    })
    .strict(),
]);
export type RecruiterAiOutput = z.infer<typeof recruiterAiOutputSchema>;
export type ProposalRejection =
  | "schema_invalid"
  | "scope_invalid"
  | "unavailable_source"
  | "input_quarantined"
  | "citation_invalid"
  | "criterion_invalid"
  | "policy_rejected"
  | "unselected_human_item";
export type ProposalValidation =
  | { ok: true; proposal: RecruiterAiOutput; semanticSupport: "requires_human_review" }
  | { ok: false; reason: ProposalRejection };

export function authoritativeContext(
  input: unknown,
  request: RecruiterAiRequest,
): RecruiterAiContext | null {
  const result = recruiterAiContextSchema.safeParse(input);
  if (!result.success) return null;
  const c = result.data;
  if (
    c.employerId !== request.employerId ||
    c.applicationId !== request.applicationId ||
    !c.plan.permitsTask
  )
    return null;
  if (c.passages.some((p) => p.employerId !== c.employerId || p.applicationId !== c.applicationId))
    return null;
  if (
    new Set(c.passages.map((p) => p.id)).size !== c.passages.length ||
    new Set(c.profile.requirements.map((r) => r.id)).size !== c.profile.requirements.length ||
    new Set(c.humanItems.map((i) => i.id)).size !== c.humanItems.length
  )
    return null;
  return c;
}

function forbiddenWholePhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

function scalarBoundary(text: string, position: number): boolean {
  const code = text.charCodeAt(position);
  const previous = text.charCodeAt(position - 1);
  return !(code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff);
}

/** Source existence and verbatim bytes are checkable. Semantic truth is not. */
export function validateRecruiterAiProposal(
  raw: unknown,
  request: RecruiterAiRequest,
  c: RecruiterAiContext,
): ProposalValidation {
  if (!authoritativeContext(c, request)) return { ok: false, reason: "scope_invalid" };
  if (c.passages.some((p) => !p.readable || p.withdrawn))
    return { ok: false, reason: "unavailable_source" };
  if (
    screenPassages(c.passages.map((p) => ({ passageId: p.id, sourceKind: p.origin, text: p.text })))
      .quarantined.length
  )
    return { ok: false, reason: "input_quarantined" };
  const parsed = recruiterAiOutputSchema.safeParse(raw);
  if (!parsed.success || parsed.data.task !== request.task)
    return { ok: false, reason: "schema_invalid" };
  const out = parsed.data;
  // Existing policy vocabulary is a mitigation, never a claim of complete NLP safety.
  const text = JSON.stringify(out).toLowerCase();
  const prohibited = [...Object.values(POLICY_SELF_TEST_VOCABULARIES).flat(), "why did you lie"];
  if (prohibited.some((term) => forbiddenWholePhrase(text, term)))
    return { ok: false, reason: "policy_rejected" };
  if (out.task === "reviewed_report_draft") {
    const selected = new Map(c.humanItems.map((i) => [i.id, i.text]));
    if (!c.humanItems.length || out.paragraphs.some((p) => selected.get(p.humanItemId) !== p.text))
      return { ok: false, reason: "unselected_human_item" };
  } else {
    const items =
      out.task === "source_summary"
        ? out.facts
        : out.task === "criterion_linking"
          ? out.links
          : out.questions;
    const sources = new Map(c.passages.map((p) => [p.id, p]));
    for (const item of items)
      for (const cite of item.citations) {
        const source = sources.get(cite.passageId);
        if (
          !source ||
          source.sourceId !== cite.sourceId ||
          source.sourceVersion !== cite.sourceVersion ||
          source.sourceContentHash !== cite.sourceContentHash ||
          source.passageHash !== cite.passageHash ||
          cite.start >= cite.end ||
          cite.end > source.text.length ||
          !scalarBoundary(source.text, cite.start) ||
          !scalarBoundary(source.text, cite.end) ||
          source.text.slice(cite.start, cite.end) !== cite.quote
        )
          return { ok: false, reason: "citation_invalid" };
      }
    if (out.task !== "source_summary") {
      const requirements = new Set(c.profile.requirements.map((r) => r.id));
      if (
        items.some(
          (item) =>
            "requirementId" in item &&
            (!requirements.has(item.requirementId) ||
              ("profileVersion" in item && item.profileVersion !== c.profile.version)),
        )
      )
        return { ok: false, reason: "criterion_invalid" };
    }
  }
  if (out.task === "criterion_linking") {
    const requirements = new Map(c.profile.requirements.map((r) => [r.id, r]));
    const passages = new Map(c.passages.map((p) => [p.id, p]));
    if (
      out.links.some((link) =>
        link.citations.some((cite) => {
          const requirement = requirements.get(link.requirementId);
          const passage = passages.get(cite.passageId);
          return !requirement || !passage || !requirement.acceptedOrigins.includes(passage.origin);
        }),
      )
    )
      return { ok: false, reason: "criterion_invalid" };
  }
  return { ok: true, proposal: out, semanticSupport: "requires_human_review" };
}

export function requireRecruiterAiDisabled(task: RecruiterAiTask): never {
  // No env/config/plan/request override and no provider seam. Future activation
  // is a separately reviewed code/schema/release change, outside this contract.
  throw new Error(`${RECRUITER_AI_DISABLED}:${task}`);
}
