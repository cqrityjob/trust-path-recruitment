import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isMissingFunctionError,
  mapReportAccess,
  type ReportAccessFacts,
} from "@/lib/security-competency/report-access";

// -----------------------------------------------------------------------------
// The caller's own facts about who may read results in one organisation.
//
// A thin pass-through over `employer_report_access`: owner or admin, the use
// cases they may read, the vacancies they answer for, whether any interview case
// is theirs to open. Nothing here decides access. The database does, for every
// read, through employer_reports_readable; this only lets the screen tell the
// truth ("you do not have access to results in this organisation") instead of
// showing an empty list that reads as "no candidates".
//
// If the function does not exist yet -- the migration has not been applied --
// the answer is `known: false` and the screens behave as before. See
// src/lib/security-competency/report-access.ts.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

export type MyReportAccess = { known: boolean; facts: ReportAccessFacts | null };

export const getMyReportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MyReportAccess> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("employer_report_access", {
      _employer_id: data.employerId,
    });
    if (error) {
      if (isMissingFunctionError(error)) return { known: false, facts: null };
      throw new Error("Could not load your access to results.");
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    const facts = mapReportAccess(row);
    return { known: facts !== null, facts };
  });
