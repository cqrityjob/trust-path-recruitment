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
//
// ── TWO REPORT CONTRACTS NOW EXIST ─────────────────────────────────────
//
// v3.0 and v3.1 store genuinely different payloads under the same
// `dna_scores.report` key. v3.0 holds a DiscoveryReport (topAreas, dna.axes,
// why, strengths); v3.1 holds a snapshot (versions, outputA, outputB) with no
// field name in common.
//
// So this function no longer returns one "v3" shape. It classifies the stored
// snapshot by its DEFINITION VERSION COLUMN — not by guessing from the
// payload — and returns a discriminated union. Each contract reaches its own
// renderer, and a payload that contradicts its version column reaches
// neither.
//
// Nothing is transformed. A v3.0 snapshot stays v3.0 forever.
//
// ── A V3 ERROR NEVER FALLS BACK TO LEGACY ──────────────────────────────
//
// If the newest report is a v3 snapshot this build cannot read, the answer is
// `discovery_unreadable` — not the legacy report. Silently showing an older
// instrument's conclusions because the newer one failed to load is precisely
// the defect this file was written to remove.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyStoredReport, type V31ReportIdentity } from "./active-report.classify";
import type { DiscoveryReport } from "./report";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type ActiveReportKind =
  | "discovery_v3_0"
  | "discovery_v3_1"
  | "discovery_unreadable"
  | "legacy_v21"
  | "none";

/** Metadata carried by every readable v3 report, whichever contract it uses. */
interface ActiveDiscoveryBase {
  snapshotId: string;
  generatedAt: string;
  definitionVersion: string;
  scoringVersion: string;
  isInternalTest: boolean;
  locale: "sv" | "en";
}

/** A v3.0 report. Field names are unchanged so the existing v3.0 renderer
 *  needs no modification. */
export interface ActiveDiscoveryReport extends ActiveDiscoveryBase {
  kind: "discovery_v3_0";
  contract: "v3.0";
  /** The immutable stored report. Every dashboard value comes from here. */
  report: DiscoveryReport | null;
}

/** A v3.1 report.
 *
 *  Carries metadata and the report schema version, and NOT the stored payload.
 *  Nothing renders v3.1 content until PR 4 builds the renderer, so exposing the
 *  payload now would be surface with no consumer — which is exactly where the
 *  next silent misread would come from. PR 4 adds it alongside the renderer. */
export interface ActiveDiscoveryV31Report extends ActiveDiscoveryBase {
  kind: "discovery_v3_1";
  contract: "v3.1";
  identity: V31ReportIdentity;
}

/** A v3 report this build cannot render. Surfaced explicitly rather than
 *  degraded into an empty-looking report or replaced by a legacy one. */
export interface ActiveUnreadableReport {
  kind: "discovery_unreadable";
  problem: "unsupported" | "malformed";
  snapshotId: string;
  generatedAt: string;
  definitionVersion: string | null;
  reason: string;
}

export interface ActiveLegacyReport {
  kind: "legacy_v21";
  runId: string;
  completedAt: string | null;
}

export type ActiveReport =
  | ActiveDiscoveryReport
  | ActiveDiscoveryV31Report
  | ActiveUnreadableReport
  | ActiveLegacyReport
  | { kind: "none" };

/** True for any kind that represents a real, renderable v3 report. */
export function isRenderableDiscovery(
  active: ActiveReport | undefined,
): active is ActiveDiscoveryReport | ActiveDiscoveryV31Report {
  return active?.kind === "discovery_v3_0" || active?.kind === "discovery_v3_1";
}

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
      const stored = (v3.dna_scores as { report?: unknown } | null)?.report ?? null;
      const classified = classifyStoredReport(v3.definition_version as string | null, stored);

      if (classified.contract === "unsupported" || classified.contract === "malformed") {
        // Deliberately does NOT continue to the legacy branch below.
        return {
          kind: "discovery_unreadable",
          problem: classified.contract,
          snapshotId: v3.id as string,
          generatedAt: v3.generated_at as string,
          definitionVersion: (v3.definition_version as string | null) ?? null,
          reason: classified.reason,
        };
      }

      // The session carries locale and the internal-test marker. A failure
      // to read it must not discard the report, so both have safe defaults.
      const { data: session } = await ctx.supabase
        .from("cd_sessions")
        .select("locale, is_internal_test, status")
        .eq("id", v3.session_id)
        .maybeSingle();

      const base: ActiveDiscoveryBase = {
        snapshotId: v3.id as string,
        generatedAt: v3.generated_at as string,
        definitionVersion: v3.definition_version as string,
        scoringVersion: v3.scoring_version as string,
        isInternalTest: (session?.is_internal_test as boolean) ?? true,
        locale: ((session?.locale as string) ?? "sv") as "sv" | "en",
      };

      if (classified.contract === "v3.1") {
        return {
          ...base,
          kind: "discovery_v3_1",
          contract: "v3.1",
          identity: classified.identity,
        };
      }

      return {
        ...base,
        kind: "discovery_v3_0",
        contract: "v3.0",
        // Stored payload only. Nothing is recomputed from live questions,
        // scoring, translations or the career-area catalogue.
        report: classified.report,
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
