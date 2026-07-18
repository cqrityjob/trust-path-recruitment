// Phase 2 — Server-only helpers for report.functions.ts.
// Moved out of report.functions.ts to satisfy the TanStack Start server-fn
// splitter contract (see tanstack-serverfn-splitting): a `.functions.ts`
// module must contain only createServerFn declarations and imports.
// Sibling helper *function declarations* referenced from a handler can
// become undefined after the ?tss-serverfn-split transform runs, which
// surfaces at runtime as "Invalid server function ID" / ReferenceError.

import { getProfession } from "@/lib/career-center";
import type { CompareEnrichmentMap } from "./report-types";
import type { Match } from "./types";

export const ASSESSMENT_ID = "career-guidance";

export function buildCompareEnrichment(matches: Match[]): CompareEnrichmentMap {
  const result: CompareEnrichmentMap = {};
  for (const m of matches.slice(0, 3)) {
    const cc = getProfession(m.legacySlug);
    if (!cc) continue;
    const nextRoleSlug = cc.nextRoles?.[0];
    const nextRoleProf = nextRoleSlug ? getProfession(nextRoleSlug) : undefined;
    result[m.legacySlug] = {
      level: cc.level,
      workEnvironments: cc.workEnvironments?.slice(0, 2),
      nextRoleTitle: nextRoleProf
        ? { titleSv: nextRoleProf.titleSv, titleEn: nextRoleProf.titleEn }
        : undefined,
    };
  }
  return result;
}
