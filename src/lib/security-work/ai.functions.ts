import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "./analysis-services";

const scope = z.object({ workspaceId: z.string().uuid() }).strict();

export const getWorkAiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scope)
  .handler(({ context, data }) =>
    analysisResult(async () => {
      const { workAiStatus } = await import("./processing/ai-jobs.server");
      return workAiStatus(context, data.workspaceId);
    }),
  );

export const requestWorkAiDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    scope.extend({
      assessmentId: z.string().uuid(),
      version: z.number().int().positive(),
      requestId: z.string().uuid(),
    }),
  )
  .handler(({ context, data }) =>
    analysisResult(async () => {
      const { requestAiDraft } = await import("./processing/ai-jobs.server");
      return requestAiDraft(context, data);
    }),
  );
