import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import * as inputs from "./inputs";
import * as service from "./services";

// Every endpoint uses the verified caller's client; input IDs never confer
// access. Strict schemas whitelist writes, then services + RLS check membership.
export const getSecurityWorkEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({}).strict())
  .handler(({ context }) => service.workResult(() => service.readEntry(context)));
export const createSecurityWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.createWorkspaceInput)
  .handler(({ context, data }) => service.workResult(() => service.createWorkspace(context, data)));
export const getSecurityWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.workspaceInput)
  .handler(({ context, data }) =>
    service.workResult(() => service.readWorkspace(context, data.workspaceId)),
  );
export const listSecuritySourceItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.listItemsInput)
  .handler(({ context, data }) => service.workResult(() => service.listSourceItems(context, data)));
export const getSecurityItemHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.itemHistoryInput)
  .handler(({ context, data }) =>
    service.workResult(() =>
      service.itemHistory(context, data.workspaceId, data.intelligenceItemId),
    ),
  );
export const saveSecurityWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveWorkspaceInput)
  .handler(({ context, data }) => service.workResult(() => service.saveWorkspace(context, data)));
export const saveSecurityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveProfileInput)
  .handler(({ context, data }) => service.workResult(() => service.saveProfile(context, data)));
export const saveSecurityRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveRequirementInput)
  .handler(({ context, data }) => service.workResult(() => service.saveRequirement(context, data)));
export const deleteSecurityRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.deleteRequirementInput)
  .handler(({ context, data }) =>
    service.workResult(() => service.deleteRequirement(context, data)),
  );
export const saveSecuritySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveSourceInput)
  .handler(({ context, data }) => service.workResult(() => service.saveSource(context, data)));
export const addSecuritySourceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.addSourceItemInput)
  .handler(({ context, data }) => service.workResult(() => service.addSourceItem(context, data)));
export const retrySecurityInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.retryInboxInput)
  .handler(({ context, data }) => service.workResult(() => service.retryInboxItem(context, data)));
export const decideSecurityItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.decideItemInput)
  .handler(({ context, data }) => service.workResult(() => service.decideItem(context, data)));
