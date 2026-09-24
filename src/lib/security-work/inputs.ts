import { z } from "zod";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1);
const list = z.array(required(200)).max(50);
const language = z.enum(["sv", "en"]);
const version = z.number().int().positive();
const optionalEdit = { id: uuid.optional(), version: version.optional() };
const pairedEdit = (x: { id?: string; version?: number }) => Boolean(x.id) === Boolean(x.version);

// These are reference links only. Nothing in this domain fetches them. Reject
// credentials and non-HTTPS links, including script/data URLs, before rendering.
export const referenceUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !/\s/.test(value);
    } catch {
      return false;
    }
  })
  .nullable();
export const workspaceInput = z.object({ workspaceId: uuid }).strict();
export const createWorkspaceInput = z.object({ name: required(120) }).strict();
export const saveWorkspaceInput = workspaceInput.extend({
  version,
  name: required(120),
  language,
});
export const saveProfileInput = workspaceInput
  .extend({
    ...optionalEdit,
    sector: text(500),
    countries: list,
    regions: list,
    important_locations: list,
    important_functions: list,
    critical_operations: list,
    assets: list,
    threat_categories: list,
    frequency: z.enum(["daily", "weekly", "monthly", "manual"]),
    decisions_supported: text(4000),
    onboarding_completed: z.boolean(),
  })
  .refine(pairedEdit);
export const saveRequirementInput = workspaceInput
  .extend({
    ...optionalEdit,
    question: required(2000),
    decision_supported: text(4000),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["active", "paused"]),
    horizon_days: z.number().int().min(1).max(365),
  })
  .refine(pairedEdit);
export const deleteRequirementInput = workspaceInput.extend({ id: uuid, version });
export const saveSourceInput = workspaceInput
  .extend({
    ...optionalEdit,
    name: required(200),
    publisher: text(500),
    source_type: z.enum(["manual", "url_reference"]),
    canonical_url: referenceUrl,
    language,
    geography: list,
    topics: list,
    reliability_category: z.enum(["official", "professional", "observation", "unverified"]),
    usage_notes: text(4000),
    active: z.boolean(),
  })
  .refine(pairedEdit)
  .refine((x) => x.source_type !== "url_reference" || x.canonical_url !== null);
const inboxFields = {
  requirementId: uuid.nullable(),
  urgency: z.enum(["routine", "soon", "urgent"]),
};
export const addSourceItemInput = workspaceInput.extend({
  sourceId: uuid,
  requestId: uuid,
  original_title: required(500),
  publisher: text(500),
  canonical_url: referenceUrl,
  author: text(500).nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  factual_extract: required(16000).refine((x) => new TextEncoder().encode(x).length <= 65536),
  language,
  geography: list,
  ...inboxFields,
});
export const retryInboxInput = workspaceInput.extend({ sourceItemId: uuid, ...inboxFields });
export const decideItemInput = workspaceInput.extend({
  id: uuid,
  version,
  status: z.enum(["relevant", "dismissed"]),
  human_rationale: required(2000).refine((x) => new TextEncoder().encode(x).length <= 2000),
});
export const listItemsInput = workspaceInput.extend({
  offset: z.number().int().min(0).max(100000).default(0),
  sourceId: uuid.optional(),
});
export const itemHistoryInput = workspaceInput.extend({ intelligenceItemId: uuid });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type SaveWorkspaceInput = z.infer<typeof saveWorkspaceInput>;
export type SaveProfileInput = z.infer<typeof saveProfileInput>;
export type SaveRequirementInput = z.infer<typeof saveRequirementInput>;
export type DeleteRequirementInput = z.infer<typeof deleteRequirementInput>;
export type SaveSourceInput = z.infer<typeof saveSourceInput>;
export type AddSourceItemInput = z.infer<typeof addSourceItemInput>;
export type RetryInboxInput = z.infer<typeof retryInboxInput>;
export type DecideItemInput = z.infer<typeof decideItemInput>;
