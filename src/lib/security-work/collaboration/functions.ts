import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as service from "./services";

export const getSecurityTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(service.teamScope)
  .handler(({ context, data }) =>
    analysisResult(() => service.readTeam(context, data.workspaceId)),
  );
export const createSecurityInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(service.createInvitationInput)
  .handler(({ context, data }) => analysisResult(() => service.createInvitation(context, data)));
export const revokeSecurityInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(service.revokeInvitationInput)
  .handler(({ context, data }) => analysisResult(() => service.revokeInvitation(context, data)));
export const acceptSecurityInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(service.acceptInvitationInput)
  .handler(({ context, data }) => analysisResult(() => service.acceptInvitation(context, data)));
export const setSecurityMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(service.setMemberRoleInput)
  .handler(({ context, data }) => analysisResult(() => service.setMemberRole(context, data)));
