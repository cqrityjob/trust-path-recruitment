import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as inputs from "./inputs";
import * as service from "./services";

// The verified caller's client only; an id in the input confers nothing.
export const getSecuritySuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.scope)
  .handler(({ context, data }) =>
    analysisResult(() => service.readSuppliers(context, data.workspaceId)),
  );
export const getSecuritySupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.supplierRef)
  .handler(({ context, data }) => analysisResult(() => service.getSupplier(context, data)));
export const saveSecuritySupplierProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveProfileInput)
  .handler(({ context, data }) => analysisResult(() => service.saveProfile(context, data)));
export const addSecurityDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.dependencyInput)
  .handler(({ context, data }) => analysisResult(() => service.addDependency(context, data)));
export const changeSecurityDependency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.dependencyRef)
  .handler(({ context, data }) => analysisResult(() => service.changeDependency(context, data)));
export const addSecuritySupplierContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.contractInput)
  .handler(({ context, data }) => analysisResult(() => service.addContract(context, data)));
export const verifySecuritySupplierContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.contractRef)
  .handler(({ context, data }) => analysisResult(() => service.verifyContract(context, data)));
export const addSecuritySupplierObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.obligationInput)
  .handler(({ context, data }) => analysisResult(() => service.addObligation(context, data)));
export const changeSecuritySupplierObligation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.obligationChange)
  .handler(({ context, data }) => analysisResult(() => service.changeObligation(context, data)));
export const getSecuritySupplierRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.requestRef)
  .handler(({ context, data }) => analysisResult(() => service.getRequest(context, data)));
export const createSecuritySupplierRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createRequestInput)
  .handler(({ context, data }) => analysisResult(() => service.createRequest(context, data)));
export const updateSecuritySupplierRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.updateRequestInput)
  .handler(({ context, data }) => analysisResult(() => service.updateRequest(context, data)));
export const approveSecuritySupplierShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.approveShareInput)
  .handler(({ context, data }) => analysisResult(() => service.approveShare(context, data)));
export const recordSecuritySupplierDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.dispatchInput)
  .handler(({ context, data }) => analysisResult(() => service.recordDispatch(context, data)));
export const recordSecuritySupplierResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.responseInput)
  .handler(({ context, data }) => analysisResult(() => service.recordResponse(context, data)));
export const verifySecuritySupplierResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.verifyInput)
  .handler(({ context, data }) => analysisResult(() => service.verifyResponse(context, data)));
export const reopenSecuritySupplierRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.reasonInput)
  .handler(({ context, data }) => analysisResult(() => service.reopenRequest(context, data)));
export const withdrawSecuritySupplierRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.reasonInput)
  .handler(({ context, data }) => analysisResult(() => service.withdrawRequest(context, data)));
export const changeSecuritySupplierDue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.dueInput)
  .handler(({ context, data }) => analysisResult(() => service.changeDue(context, data)));
export const recordSecurityDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decisionInput)
  .handler(({ context, data }) => analysisResult(() => service.recordDecision(context, data)));
export const listSecurityDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decisionsRef)
  .handler(({ context, data }) => analysisResult(() => service.listDecisions(context, data)));
export const setSecurityAssetImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.impactInput)
  .handler(({ context, data }) => analysisResult(() => service.setImpact(context, data)));
export const setSecurityMemberSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.sharingInput)
  .handler(({ context, data }) => analysisResult(() => service.setSharing(context, data)));
export const saveSecuritySupplierReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.reviewInput)
  .handler(({ context, data }) => analysisResult(() => service.saveReview(context, data)));
export const getSecurityWorkQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.scope)
  .handler(({ context, data }) =>
    analysisResult(() => service.readWorkQueue(context, data.workspaceId)),
  );
