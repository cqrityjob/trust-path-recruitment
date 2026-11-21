import { z } from "zod";
import { executionStates, linkKinds, offeredMissionKinds, reviewStates } from "./model";

const uuid = z.string().uuid();
const version = z.number().int().positive();
export const missionScope = z.object({ workspaceId: uuid }).strict();
export const missionRef = z.object({ workspaceId: uuid, missionId: uuid }).strict();
export const createMissionInput = z
  .object({
    workspaceId: uuid,
    kind: z.enum(offeredMissionKinds as unknown as [string, ...string[]]),
    title: z.string().trim().min(1).max(300),
    restricted: z.boolean().default(false),
    brief: z.record(z.unknown()).default({}),
  })
  .strict();
export const updateMissionInput = z
  .object({
    workspaceId: uuid,
    missionId: uuid,
    version,
    title: z.string().trim().min(1).max(300).optional(),
    brief: z.record(z.unknown()).optional(),
    ownerId: uuid.nullable().optional(),
    nextAction: z.string().trim().max(500).optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    restricted: z.boolean().optional(),
  })
  .strict();
export const transitionMissionInput = z
  .object({
    workspaceId: uuid,
    missionId: uuid,
    version,
    executionState: z.enum(executionStates).optional(),
    reviewState: z.enum(reviewStates).optional(),
  })
  .strict()
  .refine((value) => value.executionState || value.reviewState);
export const missionMemberInput = z
  .object({ workspaceId: uuid, missionId: uuid, userId: uuid, member: z.boolean() })
  .strict();
export const missionLinkInput = z
  .object({
    workspaceId: uuid,
    missionId: uuid,
    targetKind: z.enum(linkKinds),
    targetId: uuid,
    note: z.string().trim().max(1000).default(""),
  })
  .strict();
export const removeMissionLinkInput = z
  .object({ workspaceId: uuid, missionId: uuid, linkId: uuid })
  .strict();
export type CreateMissionInput = z.infer<typeof createMissionInput>;
export type UpdateMissionInput = z.infer<typeof updateMissionInput>;
export type TransitionMissionInput = z.infer<typeof transitionMissionInput>;
export type MissionMemberInput = z.infer<typeof missionMemberInput>;
export type MissionLinkInput = z.infer<typeof missionLinkInput>;
export type RemoveMissionLinkInput = z.infer<typeof removeMissionLinkInput>;
