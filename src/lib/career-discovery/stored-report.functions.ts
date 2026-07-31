// Loading ONE stored Security Career Discovery report, whichever contract it
// was written under.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// `getDiscoveryReport` returns `dna_scores.report` typed as a v3.0
// DiscoveryReport. When a v3.1 snapshot (versions / outputA / outputB) is
// stored under the same key, that cast succeeds silently and the v3.0
// renderer then reads `report.dna.axes` on an object that has no `dna` —
// a TypeError during render, which the router surfaces as the generic
// "This page didn't load".
//
// This function refuses to make that cast. It reads the snapshot, classifies
// it by its DEFINITION VERSION COLUMN (never by guessing from the payload)
// and returns a discriminated union, so each contract reaches its own
// renderer and a payload that contradicts its version column reaches neither.
//
// Nothing here transforms, migrates or repairs a stored payload.
//
// ── OWNERSHIP ──────────────────────────────────────────────────────────
//
// The read goes through the caller's own RLS-scoped client. Another user's
// snapshot id simply returns no row, which is reported as `not_found`.
// Distinguishing "exists but is not yours" from "does not exist" would leak
// the existence of other people's reports, so it is deliberately not done.
//
// A missing row is NOT an error: it returns a status, so the route can show a
// real not-found state instead of a generic failure.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyStoredReport } from "./active-report.classify";
import type { DiscoveryReport } from "./report";
import type { ReportSnapshot } from "./v31/snapshot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export interface StoredReportVersions {
  readonly definition: string;
  readonly content: string;
  readonly scoring: string;
  readonly taxonomy: string;
}

export type StoredReportResult =
  | { readonly status: "not_found" }
  | {
      readonly status: "v3.0";
      readonly snapshotId: string;
      readonly generatedAt: string;
      readonly versions: StoredReportVersions;
      readonly report: DiscoveryReport | null;
    }
  | {
      readonly status: "v3.1";
      readonly snapshotId: string;
      readonly generatedAt: string;
      readonly versions: StoredReportVersions;
      readonly snapshot: ReportSnapshot;
    }
  | {
      readonly status: "unreadable";
      readonly snapshotId: string;
      readonly generatedAt: string;
      readonly definitionVersion: string | null;
      readonly problem: "unsupported" | "malformed";
      readonly reason: string;
    };

export const getStoredDiscoveryReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<StoredReportResult> => {
    const ctx = context as Ctx;

    const { data: row } = await ctx.supabase
      .from("cd_report_snapshots")
      .select(
        "id, generated_at, definition_version, content_version, scoring_version, taxonomy_version, dna_scores",
      )
      .eq("id", data.snapshotId)
      .maybeSingle();

    if (!row) return { status: "not_found" };

    const snapshotId = row.id as string;
    const generatedAt = row.generated_at as string;
    const definitionVersion = (row.definition_version as string | null) ?? null;
    const versions: StoredReportVersions = {
      definition: (row.definition_version as string) ?? "—",
      content: (row.content_version as string) ?? "—",
      scoring: (row.scoring_version as string) ?? "—",
      taxonomy: (row.taxonomy_version as string) ?? "—",
    };

    const stored = (row.dna_scores as { report?: unknown } | null)?.report ?? null;
    const classified = classifyStoredReport(definitionVersion, stored);

    if (classified.contract === "unsupported" || classified.contract === "malformed") {
      return {
        status: "unreadable",
        snapshotId,
        generatedAt,
        definitionVersion,
        problem: classified.contract,
        reason: classified.reason,
      };
    }

    if (classified.contract === "v3.1") {
      return {
        status: "v3.1",
        snapshotId,
        generatedAt,
        versions,
        // Verbatim stored payload. classifyStoredReport has already confirmed
        // it declares AND structurally is v3.1.
        snapshot: stored as ReportSnapshot,
      };
    }

    return {
      status: "v3.0",
      snapshotId,
      generatedAt,
      versions,
      report: classified.report,
    };
  });