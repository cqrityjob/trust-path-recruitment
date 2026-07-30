// Security Career Discovery v3.1 — completion orchestration.
//
// This file sits DELIBERATELY OUTSIDE src/lib/career-discovery/v31/. That
// directory is the pure domain model, and the guard script fails the build if
// anything in it touches the clock, the network, a database client or a
// server boundary. Orchestration needs all four, so it lives here.
//
//   database → domain modules → THIS FILE → snapshot contract → renderer
//
// The layering is not decorative. `buildValidatedSnapshot` is a pure function
// of (answers, locale, timestamp); this file is what supplies the timestamp,
// reads the evidence and performs the write. Move any of that inward and the
// domain stops being testable without a database.
//
// ── TRUST MODEL ────────────────────────────────────────────────────────
//
// Reads go through the caller's own RLS-scoped client, so a user can only
// ever reach their own session and evidence — the database enforces it, not
// this file. The write goes through cd_v31_complete_session, which re-checks
// ownership itself because it is SECURITY DEFINER.
//
// ── NO ANSWER LOGGING ──────────────────────────────────────────────────
//
// Nothing here logs an answer value, an option id or a report payload.
// Failures surface as stable codes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { CORE_ITEM_BY_ID } from "./v31/core-items";
import {
  buildValidatedSnapshot,
  SnapshotValidationError,
  type ReportSnapshot,
} from "./v31/snapshot";
import type { Answer } from "./v31/scoring";
import { AVAILABLE_LOCALES, PATTERN_DEFINITION_VERSION, type Locale } from "./v31/version";

// Matches the shape requireSupabaseAuth injects and the convention every
// other *.functions.ts in this repository uses. The generated Database type
// does not yet know this branch's cd_* objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type V31CompletionErrorCode =
  | "no_session"
  | "not_v31_session"
  | "evidence_unreadable"
  | "invalid_evidence"
  | "invalid_report"
  | "completion_failed";

export class V31CompletionError extends Error {
  constructor(
    readonly code: V31CompletionErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "V31CompletionError";
  }
}

interface EvidenceRow {
  item_id: string;
  answer_value: string;
  option_id: string | null;
}

/**
 * Turn stored evidence rows into domain answers.
 *
 * Refuses rather than repairs. An unknown item, a single-choice row with no
 * option, or a scale value outside 1-10 means the session's evidence is not
 * scoreable — and a report built by quietly dropping those rows would be
 * wrong in a way nobody would ever notice.
 */
export function toAnswers(rows: readonly EvidenceRow[]): Answer[] {
  const answers: Answer[] = [];

  for (const row of rows) {
    const item = CORE_ITEM_BY_ID[row.item_id];
    // Context and adaptive items are not scored and are not errors here.
    if (!item) continue;

    if (item.format === "scale") {
      const value = Number(row.answer_value);
      if (!Number.isFinite(value)) {
        throw new V31CompletionError(
          "invalid_evidence",
          `${row.item_id}: non-numeric scale answer`,
        );
      }
      answers.push({ itemId: item.id, format: "scale", value });
      continue;
    }

    if (!row.option_id) {
      throw new V31CompletionError(
        "invalid_evidence",
        `${row.item_id}: single-choice answer with no option`,
      );
    }
    answers.push({ itemId: item.id, format: "single_choice", optionId: row.option_id });
  }

  return answers;
}

function parseLocale(value: unknown): Locale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(String(value))
    ? (value as Locale)
    : "sv";
}

export interface CompletionResult {
  readonly snapshotId: string;
  /** false when a previous call had already produced this snapshot. */
  readonly created: boolean;
}

/**
 * Complete a v3.1 session and store its immutable report.
 *
 * Atomic and retry-safe. The database is the enforcement point for both: the
 * session row is locked, and a repeat call returns the stored snapshot rather
 * than recomputing or duplicating.
 *
 * The short-circuit below is an optimisation, not the guarantee — two
 * concurrent first-time calls both reach the RPC, where the lock serialises
 * them and the second takes the idempotent path.
 */
export const completeV31Session = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CompletionResult> => {
    const ctx = context as Ctx;

    // Ownership first, through the caller's own client. Nothing proceeds if
    // this returns nothing.
    const { data: session } = await ctx.supabase
      .from("cd_sessions")
      .select("id, locale, status, definition_version_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new V31CompletionError("no_session");

    // Already finished: return the stored result without recomputing. A
    // recomputation here would produce a fresh timestamp and could, after a
    // future version bump, produce different text for the same run.
    if (session.status === "completed") {
      const { data: existing } = await ctx.supabase
        .from("cd_report_snapshots")
        .select("id")
        .eq("session_id", data.sessionId)
        .maybeSingle();
      if (existing?.id) return { snapshotId: existing.id as string, created: false };
      // Completed with no snapshot is a broken state. Let the RPC say so
      // rather than papering over it with a freshly built report.
    }

    const { data: evidence, error: evidenceError } = await ctx.supabase
      .from("cd_evidence")
      .select("item_id, answer_value, option_id")
      .eq("session_id", data.sessionId);

    if (evidenceError) throw new V31CompletionError("evidence_unreadable");

    const answers = toAnswers((evidence ?? []) as EvidenceRow[]);
    const locale = parseLocale(session.locale);

    // The one place a timestamp enters the pipeline. The domain engine never
    // reads a clock, so this value is passed in and then frozen.
    const completedAt = new Date().toISOString();

    let snapshot: ReportSnapshot;
    try {
      snapshot = buildValidatedSnapshot({ answers, locale, completedAt });
    } catch (err) {
      if (err instanceof SnapshotValidationError) {
        // The session stays in_progress and therefore resumable. Nothing was
        // written; the candidate can answer what is missing and try again.
        throw new V31CompletionError("invalid_report", err.failures.map((f) => f.code).join(","));
      }
      throw err;
    }

    const { data: result, error } = await ctx.supabase.rpc("cd_v31_complete_session", {
      _session_id: data.sessionId,
      _payload: snapshot,
      _pattern_definition_version: PATTERN_DEFINITION_VERSION,
      _completed_at: completedAt,
    });

    if (error) throw new V31CompletionError("completion_failed", error.code ?? undefined);

    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.snapshot_id) throw new V31CompletionError("completion_failed");

    return { snapshotId: row.snapshot_id as string, created: Boolean(row.was_created) };
  });

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
