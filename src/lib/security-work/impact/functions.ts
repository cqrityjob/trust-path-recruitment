import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as inputs from "./inputs";
import * as service from "./services";

// The verified caller's client only; a brief or source id confers nothing.
export const getSecurityImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.impactScope)
  .handler(({ context, data }) =>
    analysisResult(() => service.readImpact(context, data.workspaceId)),
  );
export const getSecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.briefRef)
  .handler(({ context, data }) => analysisResult(() => service.getBrief(context, data)));
export const createSecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createBriefInput)
  .handler(({ context, data }) => analysisResult(() => service.createBrief(context, data)));
export const updateSecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.updateBriefInput)
  .handler(({ context, data }) => analysisResult(() => service.updateBrief(context, data)));
export const transitionSecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.transitionBriefInput)
  .handler(({ context, data }) => analysisResult(() => service.transitionBrief(context, data)));
export const reviseSecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.briefRef)
  .handler(({ context, data }) => analysisResult(() => service.reviseBrief(context, data)));
export const applySecurityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.applyBriefInput)
  .handler(({ context, data }) => analysisResult(() => service.applyBrief(context, data)));
export const resolveSecurityFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.resolveFlagInput)
  .handler(({ context, data }) => analysisResult(() => service.resolveFlag(context, data)));
export const createSecurityFeedSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createFeedSourceInput)
  .handler(({ context, data }) => analysisResult(() => service.createFeedSource(context, data)));
export const fetchSecurityFeedNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.fetchNowInput)
  .handler(async ({ context, data }) => {
    const { fetchSourceNow } = await import("../connectors/fetch.server");
    return analysisResult(() => fetchSourceNow(context, data));
  });
