import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as inputs from "./inputs";
import * as service from "./services";

// Every endpoint uses the verified caller's client; input IDs never confer
// access. Strict schemas whitelist writes, then services + RLS check membership.
export const getSecurityProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.scope)
  .handler(({ context, data }) => analysisResult(() => service.readProgramme(context, data.workspaceId)));
export const saveSecurityMandate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveMandateInput)
  .handler(({ context, data }) => analysisResult(() => service.saveMandate(context, data)));
export const saveSecurityMandateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveMandateDocumentInput)
  .handler(({ context, data }) => analysisResult(() => service.saveMandateDocument(context, data)));
export const saveSecurityAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveAssetInput)
  .handler(({ context, data }) => analysisResult(() => service.saveAsset(context, data)));
export const linkSecurityRiskAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.linkRiskAssetInput)
  .handler(({ context, data }) => analysisResult(() => service.linkRiskAsset(context, data)));
export const saveSecurityProgrammeRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveProgrammeRiskInput)
  .handler(({ context, data }) => analysisResult(() => service.saveProgrammeRisk(context, data)));
export const decideSecurityRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decideRiskInput)
  .handler(({ context, data }) => analysisResult(() => service.decideRisk(context, data)));
export const startSecurityBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.startBaselineInput)
  .handler(({ context, data }) => analysisResult(() => service.startBaseline(context, data)));
export const answerSecurityBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.answerBaselineInput)
  .handler(({ context, data }) => analysisResult(() => service.answerBaseline(context, data)));
export const completeSecurityBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.completeBaselineInput)
  .handler(({ context, data }) => analysisResult(() => service.completeBaseline(context, data)));
export const saveSecurityGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveGapInput)
  .handler(({ context, data }) => analysisResult(() => service.saveGap(context, data)));
export const saveSecurityProgrammeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveProgrammeActionInput)
  .handler(({ context, data }) => analysisResult(() => service.saveProgrammeAction(context, data)));
export const linkSecurityEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.evidenceLinkInput)
  .handler(({ context, data }) => analysisResult(() => service.linkEvidence(context, data)));
export const saveSecurityPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.planInput)
  .handler(({ context, data }) => analysisResult(() => service.savePlan(context, data)));
export const createSecurityManagementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createManagementReportInput)
  .handler(({ context, data }) => analysisResult(() => service.createManagementReport(context, data)));
export const saveSecurityManagementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveManagementReportInput)
  .handler(({ context, data }) => analysisResult(() => service.saveManagementReport(context, data)));
export const decideSecurityManagementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decideManagementReportInput)
  .handler(({ context, data }) => analysisResult(() => service.decideManagementReport(context, data)));

// The assistant lives in a server-only module so no provider code, key
// handling or prompt text reaches the client bundle.
export const requestSecuritySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.requestSuggestionInput)
  .handler(({ context, data }) =>
    analysisResult(async () => {
      const { requestSuggestion } = await import("./assistant.server");
      return requestSuggestion(context, data);
    }),
  );
export const decideSecuritySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decideSuggestionInput)
  .handler(({ context, data }) =>
    analysisResult(async () => {
      const { decideSuggestion } = await import("./assistant.server");
      return decideSuggestion(context, data);
    }),
  );
