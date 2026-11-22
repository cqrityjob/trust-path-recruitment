import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Every command carries a client-made operation id: a retry repeats it. */
const op = { workspaceId: uuid, operationId: uuid };

export const scope = z.object({ workspaceId: uuid }).strict();
export const supplierRef = z.object({ workspaceId: uuid, assetId: uuid }).strict();
export const requestRef = z.object({ workspaceId: uuid, requestId: uuid }).strict();

export const saveProfileInput = z
  .object({
    workspaceId: uuid,
    /** An existing supplier asset, or null with a name to create one. */
    assetId: uuid.nullable(),
    name: text(300).default(""),
    internalOwnerId: uuid.nullable(),
    contactRoute: text(1000).default(""),
    services: text(4000).default(""),
    status: z.enum(["active", "ended"]).default("active"),
  })
  .strict()
  .refine((v) => v.assetId !== null || v.name.length > 0, { message: "name" });

export const dependencyInput = z
  .object({
    workspaceId: uuid,
    fromAssetId: uuid,
    toAssetId: uuid,
    relation: z.enum(["supplied_by", "depends_on", "located_at", "runs_on"]),
    sourceNote: text(2000).default(""),
    confirmed: z.boolean().default(false),
  })
  .strict();
export const dependencyRef = z
  .object({ workspaceId: uuid, dependencyId: uuid, confirmed: z.boolean().optional() })
  .strict();

export const contractInput = z
  .object({
    workspaceId: uuid,
    supplierAssetId: uuid,
    contractKey: text(120).min(1),
    title: text(300).min(1),
    validFrom: date.nullable().default(null),
    validTo: date.nullable().default(null),
    documentRef: text(1000).default(""),
    summary: text(8000).default(""),
  })
  .strict();
export const contractRef = z.object({ workspaceId: uuid, contractId: uuid }).strict();

export const obligationInput = z
  .object({
    workspaceId: uuid,
    supplierAssetId: uuid,
    contractId: uuid.nullable(),
    clause: text(200).default(""),
    basisNote: text(4000).default(""),
    scope: text(4000).min(1),
    expectedResult: text(4000).min(1),
    verificationMethod: text(4000).min(1),
    timeRule: text(1000).default(""),
    responseDays: z.number().int().min(1).max(365).nullable().default(null),
    completionDays: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict();
export const obligationChange = z
  .object({ workspaceId: uuid, obligationId: uuid, change: z.enum(["confirm", "retire"]) })
  .strict();

const requestFields = {
  title: text(300).min(1),
  task: text(8000).min(1),
  expectedResult: text(4000).min(1),
  responseInstruction: text(2000).default(""),
  verificationCriteria: text(4000).min(1),
  internalOwnerId: uuid,
  requiresSeparateVerifier: z.boolean().default(false),
};
export const createRequestInput = z
  .object({
    ...op,
    actionId: uuid,
    supplierAssetId: uuid,
    basisKind: z.enum(["information", "contract_obligation", "deviation", "change_order"]),
    obligationId: uuid.nullable().default(null),
    basisNote: text(4000).default(""),
    changeDecisionId: uuid.nullable().default(null),
    requestedDue: date,
    ...requestFields,
  })
  .strict();
export const updateRequestInput = z
  .object({ ...op, requestId: uuid, version, ...requestFields })
  .strict();
export const approveShareInput = z
  .object({
    ...op,
    requestId: uuid,
    version,
    recipient: text(300).min(1),
    purpose: text(1000).min(1),
  })
  .strict();
export const dispatchInput = z
  .object({
    ...op,
    requestId: uuid,
    version,
    channel: z.enum(["email", "letter", "phone", "meeting", "other"]),
    recipient: text(300).min(1),
    sentAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const responseInput = z
  .object({
    ...op,
    requestId: uuid,
    version,
    kind: z.enum(["acknowledged", "plan", "question", "objection", "done"]),
    authorName: text(200).min(1),
    origin: z.enum(["email", "phone", "meeting", "letter", "other"]),
    body: text(8000).min(1),
    claimedDoneAt: z.string().datetime({ offset: true }).nullable().default(null),
    receivedAt: z.string().datetime({ offset: true }),
    proposedDue: date.nullable().default(null),
    evidenceSourceIds: z.array(uuid).max(20).default([]),
  })
  .strict();
export const verifyInput = z
  .object({
    ...op,
    requestId: uuid,
    version,
    responseId: uuid,
    outcome: z.enum(["accepted", "needs_revision"]),
    criteriaChecked: text(4000).min(1),
    checkedEvidence: text(4000).default(""),
    remainingDeviation: text(4000).default(""),
  })
  .strict();
export const reasonInput = z
  .object({ ...op, requestId: uuid, version, reason: text(2000).min(1) })
  .strict();
export const dueInput = z
  .object({
    ...op,
    requestId: uuid,
    version,
    which: z.enum(["requested", "agreed"]),
    due: date.nullable(),
    reason: text(2000).min(1),
  })
  .strict();

export const decisionInput = z
  .object({
    workspaceId: uuid,
    subjectKind: z.enum([
      "intelligence_item",
      "change_brief",
      "risk",
      "action",
      "supplier_request",
    ]),
    subjectId: uuid,
    decision: z.enum([
      "investigate",
      "remediate",
      "defer",
      "accept_risk",
      "no_action",
      "scope_cost",
      "temporary_protection",
      "close_with_deviation",
    ]),
    rationale: text(4000).min(1),
    reviewAt: date.nullable().default(null),
    amount: z.number().nonnegative().max(1e12).nullable().default(null),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    costScope: text(4000).nullable().default(null),
    mandate: text(1000).nullable().default(null),
  })
  .strict();
export const decisionsRef = z
  .object({
    workspaceId: uuid,
    subjectKind: z.enum([
      "intelligence_item",
      "change_brief",
      "risk",
      "action",
      "supplier_request",
    ]),
    subjectId: uuid,
  })
  .strict();

export const impactInput = z
  .object({
    workspaceId: uuid,
    linkId: uuid,
    status: z.enum(["unconfirmed", "confirmed", "ruled_out"]),
    note: text(2000).default(""),
  })
  .strict();

export const reviewInput = z
  .object({
    workspaceId: uuid,
    supplierAssetId: uuid,
    reviewId: uuid.nullable(),
    periodStart: date,
    periodEnd: date,
    findings: text(8000).default(""),
    decisionsText: text(8000).default(""),
    requirementChanges: text(8000).default(""),
    nextReviewAt: date.nullable().default(null),
    approve: z.boolean().default(false),
  })
  .strict();

export const sharingInput = z
  .object({ workspaceId: uuid, userId: uuid, allowed: z.boolean() })
  .strict();

export type SaveProfileInput = z.infer<typeof saveProfileInput>;
export type DependencyInput = z.infer<typeof dependencyInput>;
export type ContractInput = z.infer<typeof contractInput>;
export type ObligationInput = z.infer<typeof obligationInput>;
export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type UpdateRequestInput = z.infer<typeof updateRequestInput>;
export type ApproveShareInput = z.infer<typeof approveShareInput>;
export type DispatchInput = z.infer<typeof dispatchInput>;
export type ResponseInput = z.infer<typeof responseInput>;
export type VerifyInput = z.infer<typeof verifyInput>;
export type ReasonInput = z.infer<typeof reasonInput>;
export type DueInput = z.infer<typeof dueInput>;
export type DecisionInput = z.infer<typeof decisionInput>;
export type ImpactInput = z.infer<typeof impactInput>;
export type ReviewInput = z.infer<typeof reviewInput>;
