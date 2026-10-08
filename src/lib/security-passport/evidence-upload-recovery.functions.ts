import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cleanupOwnedUpload,
  listOwnedUploadAttempts,
  resumeOwnedUpload,
} from "./evidence-upload-recovery-adapter.functions";

const target = z
  .object({ claimId: z.string().uuid().nullable(), periodId: z.string().uuid().nullable() })
  .refine((t) => !t.claimId || !t.periodId);
const attempt = z.object({ attemptId: z.string().uuid() });
export const listMyUploadAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => target.parse(data))
  .handler(({ context, data }) => listOwnedUploadAttempts(context, data));
export const resumeMyUploadAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => attempt.parse(data))
  .handler(({ context, data }) => resumeOwnedUpload(context, data.attemptId));
export const cleanupMyUploadAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => attempt.parse(data))
  .handler(({ context, data }) => cleanupOwnedUpload(context, data.attemptId));
