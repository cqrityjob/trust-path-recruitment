// Active-report selection for My Career.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// My Career was structurally a v2.1 dashboard: it read the legacy career
// profile and rendered legacy-only concepts (Toppyrke, Primär drivkraft,
// Konfidensnivå) as the candidate's current result, while v3 reports were
// relegated to a history list. A candidate whose newest assessment is
// Security Career Discovery was shown an older instrument's conclusions as
// if they were current.
//
// ── ONE SELECTION POINT, RESOLVED ON THE SERVER ────────────────────────
//
// Selection happens here, in one round trip, BEFORE the dashboard renders
// its summary. Doing it client-side — legacy first, v3 arriving later —
// would flash the wrong summary. The dashboard shows a neutral skeleton
// until this resolves, and never falls back to legacy on a v3 failure.
//
// ── THE RULE ───────────────────────────────────────────────────────────
//
//   1. A completed v3 report exists  -> the NEWEST v3 report is active.
//   2. Otherwise                     -> the newest completed legacy report.
//   3. Neither                       -> none; the start-assessment state.
//
// v3 wins whenever it exists. That is deliberate and not a timestamp
// comparison: v2.1 is retired for new runs, so a legacy report can only
// ever be older in product terms even if a clock says otherwise.
//
// Ordering uses stored completion timestamps and an explicit type
// discriminator — never client rendering order.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DiscoveryReport } from "./report";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type ActiveReportKind = "discovery_v3" | "legacy_v21" | "none";

export interface ActiveDiscoveryReport {
  kind: "discovery_v3";
  snapshotId: string;
  generatedAt: string;
  definitionVersion: string;
  scoringVersion: string;
  isInternalTest: boolean;
  locale: "sv" | "en";
  /** The immutable stored report. Every dashboard value comes from here. */
  report: DiscoveryReport | null;
}

export interface ActiveLegacyReport {
  kind: "legacy_v21";
  runId: string;
  completedAt: string | null;
}

export type ActiveReport = ActiveDiscoveryReport | ActiveLegacyReport | { kind: "none" };

/**
 * Resolve which report drives the My Career dashboard.
 *
 * Both reads go through the caller's own RLS-scoped client, so this can only
 * ever see the caller's own reports.
 */
export const getActiveCareerReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveReport> => {
    const ctx = context as Ctx;

    // --- 1. Newest completed v3 report -----------------------------------
    const { data: v3 } = await ctx.supabase
      .from("cd_report_snapshots")
      .select("id, generated_at, definition_version, scoring_version, dna_scores, session_id")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (v3?.id) {
      // The session carries locale and the internal-test marker. A failure
      // to read it must not discard the report, so both have safe defaults.
      const { data: session } = await ctx.supabase
        .from("cd_sessions")
        .select("locale, is_internal_test, status")
        .eq("id", v3.session_id)
        .maybeSingle();

      return {
        kind: "discovery_v3",
        snapshotId: v3.id as string,
        generatedAt: v3.generated_at as string,
        definitionVersion: v3.definition_version as string,
        scoringVersion: v3.scoring_version as string,
        isInternalTest: (session?.is_internal_test as boolean) ?? true,
        locale: ((session?.locale as string) ?? "sv") as "sv" | "en",
        // Stored payload only. Nothing is recomputed from live questions,
        // scoring, translations or the career-area catalogue.
        report: (v3.dna_scores as { report?: DiscoveryReport } | null)?.report ?? null,
      };
    }

    // --- 2. Fall back to the newest completed legacy run ------------------
    const { data: legacy } = await ctx.supabase
      .from("assessment_runs")
      .select("id, completed_at, status")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacy?.id) {
      return {
        kind: "legacy_v21",
        runId: legacy.id as string,
        completedAt: (legacy.completed_at as string) ?? null,
      };
    }

    // --- 3. Nothing completed --------------------------------------------
    return { kind: "none" };
  });
