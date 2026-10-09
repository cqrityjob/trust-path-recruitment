import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recruiterAiRequestForTask, requireRecruiterAiDisabled } from "./contract";

// Deliberately no provider, model selection, admin client, source read, write,
// message API, report finalisation or requirement/status mutation. Existing
// manual functionality works independently. Each task has a separate entry.
export const requestRecruiterSourceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recruiterAiRequestForTask("source_summary").parse(data))
  .handler(() => requireRecruiterAiDisabled("source_summary"));
export const requestRecruiterCriterionLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recruiterAiRequestForTask("criterion_linking").parse(data))
  .handler(() => requireRecruiterAiDisabled("criterion_linking"));
export const requestRecruiterNeutralQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    recruiterAiRequestForTask("neutral_clarifications").parse(data),
  )
  .handler(() => requireRecruiterAiDisabled("neutral_clarifications"));
export const requestRecruiterReviewedReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recruiterAiRequestForTask("reviewed_report_draft").parse(data))
  .handler(() => requireRecruiterAiDisabled("reviewed_report_draft"));
