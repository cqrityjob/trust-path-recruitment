import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);
export const impactScope = z.object({ workspaceId: uuid }).strict();
export const briefRef = z.object({ workspaceId: uuid, briefId: uuid }).strict();
const proposedAction = z
  .object({ title: text(500).min(1), description: text(2000).default("") })
  .strict();
const briefFields = {
  title: text(300).min(1),
  whatChanged: text(8000).default(""),
  known: text(8000).default(""),
  whyItMatters: text(8000).default(""),
  uncertain: text(8000).default(""),
  proposedActions: z.array(proposedAction).max(10).default([]),
  evidenceItemIds: z.array(uuid).min(1).max(50),
  relevance: z.record(z.unknown()).default({}),
};
export const createBriefInput = z
  .object({
    workspaceId: uuid,
    missionId: uuid.nullable().default(null),
    clusterId: uuid.nullable().default(null),
    ...briefFields,
  })
  .strict();
export const updateBriefInput = z
  .object({ workspaceId: uuid, briefId: uuid, version, ...briefFields })
  .strict();
export const transitionBriefInput = z
  .object({
    workspaceId: uuid,
    briefId: uuid,
    version,
    status: z.enum(["draft", "in_review", "approved", "rejected"]),
    decisionNote: text(2000).default(""),
  })
  .strict();
export const applyBriefInput = z
  .object({
    workspaceId: uuid,
    briefId: uuid,
    version,
    requestId: uuid,
    risk: z
      .object({
        title: text(500).min(1),
        description: text(8000).default(""),
        threatScenario: text(8000).default(""),
      })
      .strict()
      .nullable(),
    actions: z
      .array(
        z
          .object({
            title: text(500).min(1),
            description: text(4000).default(""),
            priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
            dueDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable()
              .default(null),
          })
          .strict(),
      )
      .max(10),
  })
  .strict()
  .refine((value) => value.risk !== null || value.actions.length > 0);
export const resolveFlagInput = z
  .object({ workspaceId: uuid, flagId: uuid, note: text(2000).min(1) })
  .strict();
export const createFeedSourceInput = z
  .object({
    workspaceId: uuid,
    name: text(200).min(1),
    feedUrl: z.string().trim().url().max(2048),
    pollTargetMinutes: z.number().int().min(15).max(10080).nullable(),
  })
  .strict();
export const fetchNowInput = z.object({ workspaceId: uuid, sourceId: uuid }).strict();
export type CreateBriefInput = z.infer<typeof createBriefInput>;
export type UpdateBriefInput = z.infer<typeof updateBriefInput>;
export type TransitionBriefInput = z.infer<typeof transitionBriefInput>;
export type ApplyBriefInput = z.infer<typeof applyBriefInput>;
export type ResolveFlagInput = z.infer<typeof resolveFlagInput>;
export type CreateFeedSourceInput = z.infer<typeof createFeedSourceInput>;
