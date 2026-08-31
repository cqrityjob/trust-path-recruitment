// Security Career Discovery v3.1 — reading one stored report.
//
// This file sits DELIBERATELY OUTSIDE src/lib/career-discovery/v31/. That
// directory is the pure domain model, and the guard script fails the build if
// anything in it touches the clock, the network, a database client or a
// server boundary. Orchestration needs all four, so it lives here.
//
// ── WHAT USED TO BE HERE, AND WHY IT IS GONE ───────────────────────────
//
// `completeV31Session` — a second writer of `cd_report_snapshots`. It read a
// session's evidence and called `buildValidatedSnapshot` directly, with NO
// profession catalogue, NO career context and NO CIG transition edges. That
// is precisely the input set the ranking is computed from, so every report it
// wrote was frozen with `professions.available = false` and `ranked: []`: no
// primary recommendation, no Top 3, no Career Card, and a report telling the
// candidate that profession matching "is not included in this version".
//
// It is the same defect, in the same shape, as the anonymous/authenticated
// divergence corrected on 2026-08-29 (see v31-public.functions.ts's header):
// one pure engine, two callers, different inputs. The correction there made
// `buildCanonicalSnapshot` the single place a run becomes a report. This
// caller was never migrated onto it, and was never wired to a route either —
// the shipped completion path is `persistPublicV31Run`, which does go through
// the canonical builder.
//
// So it is removed rather than repaired. Nothing called it, and a dormant
// second writer of the product's one immutable result is not an asset: the
// moment anything imported it, a candidate's stored report would silently
// disagree with the one they had just read on screen.
// `scripts/career-discovery-canonical-result-check.ts` now asserts that
// `buildValidatedSnapshot` has exactly one orchestration caller, so this
// cannot come back by accident.
//
// ── TRUST MODEL ────────────────────────────────────────────────────────
//
// The read goes through the caller's own RLS-scoped client, so a user can
// only ever reach their own snapshot — the database enforces it, not this
// file.
//
// ── NO ANSWER LOGGING ──────────────────────────────────────────────────
//
// Nothing here logs an answer value, an option id or a report payload.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { ReportSnapshot } from "./v31/snapshot";

// Matches the shape requireSupabaseAuth injects and the convention every
// other *.functions.ts in this repository uses. The generated Database type
// does not yet know this branch's cd_* objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

/**
 * Read a stored report.
 *
 * Reads the snapshot and NOTHING else — no definition version, no item
 * registry, no option matrix, no story template, no i18n dictionary. That is
 * what makes a historical report stable: there is nothing current for it to
 * be reinterpreted against.
 */
export const getV31StoredReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    const { data: row } = await ctx.supabase
      .from("cd_report_snapshots")
      .select(
        "id, generated_at, definition_version, content_version, scoring_version, " +
          "pattern_definition_version, patterns, candidate_story, dna_scores",
      )
      .eq("id", data.snapshotId)
      .maybeSingle();

    if (!row) return null;

    const stored = (row.dna_scores as { report?: ReportSnapshot } | null)?.report ?? null;

    return {
      snapshotId: row.id as string,
      generatedAt: row.generated_at as string,
      versions: {
        definitionVersion: row.definition_version as string,
        contentVersion: row.content_version as string,
        scoringVersion: row.scoring_version as string,
        patternDefinitionVersion: row.pattern_definition_version as string | null,
      },
      outputA: row.patterns,
      outputB: row.candidate_story,
      /** The complete stored payload, exactly as written at completion. */
      report: stored,
    };
  });
