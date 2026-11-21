import { z } from "zod";
import { operatingProfileSchema, provenanceSchema } from "./schema";

const uuid = z.string().uuid();
export const contextScope = z.object({ workspaceId: uuid }).strict();
export const saveOperatingProfileInput = z
  .object({
    workspaceId: uuid,
    /** The version the editor started from; 0 when there is none yet. */
    expectedVersion: z.number().int().min(0),
    profile: operatingProfileSchema,
    provenance: provenanceSchema,
    changeNote: z.string().trim().max(2000).default(""),
  })
  .strict();
export const savePreferenceInput = z
  .object({
    workspaceId: uuid,
    roleFocus: z.enum(["corporate_security", "ciso", "coordinator", "event_lead", "combined"]),
  })
  .strict();
export type SaveOperatingProfileInput = z.infer<typeof saveOperatingProfileInput>;
export type SavePreferenceInput = z.infer<typeof savePreferenceInput>;
