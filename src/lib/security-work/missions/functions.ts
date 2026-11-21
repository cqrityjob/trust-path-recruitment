import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as inputs from "./inputs";
import * as service from "./services";

// The verified caller's client only; a mission id confers nothing (RLS decides).
export const listSecurityMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.missionScope)
  .handler(({ context, data }) =>
    analysisResult(() => service.listMissions(context, data.workspaceId)),
  );
export const getSecurityMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.missionRef)
  .handler(({ context, data }) => analysisResult(() => service.getMission(context, data)));
export const createSecurityMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createMissionInput)
  .handler(({ context, data }) => analysisResult(() => service.createMission(context, data)));
export const updateSecurityMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.updateMissionInput)
  .handler(({ context, data }) => analysisResult(() => service.updateMission(context, data)));
export const transitionSecurityMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.transitionMissionInput)
  .handler(({ context, data }) => analysisResult(() => service.transitionMission(context, data)));
export const setSecurityMissionMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.missionMemberInput)
  .handler(({ context, data }) => analysisResult(() => service.setMissionMember(context, data)));
export const addSecurityMissionLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.missionLinkInput)
  .handler(({ context, data }) => analysisResult(() => service.addMissionLink(context, data)));
export const removeSecurityMissionLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.removeMissionLinkInput)
  .handler(({ context, data }) => analysisResult(() => service.removeMissionLink(context, data)));
