import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analysisResult } from "../analysis-services";
import * as inputs from "./inputs";
import * as service from "./services";

export const getOperatingContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.contextScope)
  .handler(({ context, data }) =>
    analysisResult(() => service.readOperatingContext(context, data.workspaceId)),
  );
export const saveOperatingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.saveOperatingProfileInput)
  .handler(({ context, data }) =>
    analysisResult(() => service.saveOperatingProfile(context, data)),
  );
export const saveRoleFocus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputs.savePreferenceInput)
  .handler(({ context, data }) => analysisResult(() => service.savePreference(context, data)));
