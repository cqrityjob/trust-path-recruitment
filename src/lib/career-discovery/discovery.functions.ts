// Security Career Discovery v3 — server functions.
//
// Every function here is authenticated through the EXISTING
// requireSupabaseAuth middleware. No second auth provider, no second
// Supabase client for user identity, no temporary or fake login.
//
// ── TRUST MODEL ────────────────────────────────────────────────────────
//
// Reads go through the CALLER'S OWN RLS-scoped client (`ctx.supabase`), so
// a user can only ever see their own sessions, evidence and reports — the
// database enforces it, not this file.
//
// The service-role client is used for exactly two things, both of which
// are integrity operations the caller must not be able to forge:
//   · opening an internal-test session (via the admin-authorised RPC)
//   · completing a session (via the atomic cd_complete_session RPC)
// It is never used to read one user's data on behalf of another.
//
// ── NO ANSWER LOGGING ──────────────────────────────────────────────────
//
// Nothing in this file logs an answer value, a report payload, or any
// candidate-identifying data. Errors are returned as stable codes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { ADAPTIVE_ITEMS_BY_ID } from "./adaptive-items";
import { rankCareerAreas } from "./area-ranking";
import {
  CONTEXT_STATUS_ITEM_ID,
  DISCOVERY_GOAL_ITEM_ID,
  isContextStatus,
  isDiscoveryGoal,
} from "./context-items";
import { CORE_ITEMS_BY_ID } from "./core-items";
import { buildReport } from "./report";
import type { DiscoveryReport } from "./report";
import { scoreDna } from "./scoring";
import type { ScoringInput } from "./scoring";
import { assembleSession } from "./session";
import type { ContextStatus, DiscoveryGoal } from "./types";
import { DEFINITION_ID, DEFINITION_VERSION } from "./version";

// Matches the shape requireSupabaseAuth injects, and the convention every
// other *.functions.ts in this repository already uses. The Supabase client
// is generic over a generated Database type that does not yet know this
// branch's cd_* objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

/** Stable, non-identifying failure codes. */
export type DiscoveryErrorCode =
  | "not_authorised"
  | "no_definition"
  | "no_session"
  | "unknown_item"
  | "core_incomplete"
  | "already_completed"
  | "save_failed"
  | "complete_failed";

export class DiscoveryError extends Error {
  constructor(public readonly code: DiscoveryErrorCode) {
    super(code);
  }
}

// -------------------------------------------------------------------------
// Access
// -------------------------------------------------------------------------

/** Whether the caller may take the internal-test discovery at all, plus the
 *  definition version to use. Drives the landing page's CTA state. */
export const getDiscoveryAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;

    const { data: allowed } = await ctx.supabase.rpc("cd_is_internal_tester", {
      _user_id: ctx.userId,
    });

    const { data: version } = await ctx.supabase
      .from("cd_definition_versions")
      .select("id, definition_version, lifecycle_status, available_locales")
      .eq("assessment_id", DEFINITION_ID)
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();

    // An unfinished session, so the landing page can offer Resume.
    let resumableSessionId: string | null = null;
    if (version?.id) {
      const { data: existing } = await ctx.supabase
        .from("cd_sessions")
        .select("id")
        .eq("definition_version_id", version.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resumableSessionId = existing?.id ?? null;
    }

    return {
      isInternalTester: allowed === true,
      lifecycleStatus: (version?.lifecycle_status as string) ?? null,
      definitionVersionId: (version?.id as string) ?? null,
      resumableSessionId,
    };
  });

// -------------------------------------------------------------------------
// Session
// -------------------------------------------------------------------------

/** Start a new session, or return the caller's existing unfinished one.
 *  Idempotent by construction — the RPC returns the in-progress session if
 *  there is one, so a double-click cannot create two runs. */
export const startDiscoverySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ locale: z.enum(["sv", "en"]).default("sv") }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    const { data: allowed } = await ctx.supabase.rpc("cd_is_internal_tester", {
      _user_id: ctx.userId,
    });
    if (allowed !== true) throw new DiscoveryError("not_authorised");

    const { data: version } = await ctx.supabase
      .from("cd_definition_versions")
      .select("id")
      .eq("assessment_id", DEFINITION_ID)
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();
    if (!version?.id) throw new DiscoveryError("no_definition");

    // The RPC is SECURITY DEFINER and reads auth.uid(), so it must run on a
    // client carrying the caller's JWT — not the service client.
    const { data: sessionId, error } = await ctx.supabase.rpc("cd_begin_internal_test_session", {
      _definition_version_id: version.id,
      _locale: data.locale,
      _context_status: null,
    });
    if (error || !sessionId) throw new DiscoveryError("not_authorised");

    return { sessionId: sessionId as string };
  });

/** Full resume state: the session row plus every answer already given.
 *  This is what makes refresh restore the question, the answer, the
 *  progress and the path. */
export const getDiscoverySessionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    // RLS scopes this to the caller. Another user's id returns no row.
    const { data: session } = await ctx.supabase
      .from("cd_sessions")
      .select(
        "id, locale, context_status, discovery_goal, adaptive_path, current_section, current_item, status, started_at, completed_at",
      )
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new DiscoveryError("no_session");

    const { data: evidence } = await ctx.supabase
      .from("cd_evidence")
      .select("item_id, answer_value, item_kind, answered_at")
      .eq("session_id", data.sessionId);

    const answers: Record<string, string> = {};
    for (const row of (evidence ?? []) as Array<{ item_id: string; answer_value: string }>) {
      answers[row.item_id] = row.answer_value;
    }

    // The report, if this session is already finished.
    const { data: snapshot } = await ctx.supabase
      .from("cd_report_snapshots")
      .select("id")
      .eq("session_id", data.sessionId)
      .maybeSingle();

    return {
      session: {
        id: session.id as string,
        locale: session.locale as "sv" | "en",
        contextStatus: (session.context_status as ContextStatus | null) ?? null,
        discoveryGoal: (session.discovery_goal as DiscoveryGoal | null) ?? null,
        adaptivePath: (session.adaptive_path as string | null) ?? null,
        currentSection: (session.current_section as string | null) ?? null,
        currentItem: (session.current_item as string | null) ?? null,
        status: session.status as "in_progress" | "completed" | "abandoned",
      },
      answers,
      snapshotId: (snapshot?.id as string) ?? null,
    };
  });

// -------------------------------------------------------------------------
// Autosave
// -------------------------------------------------------------------------

const saveSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().min(1).max(64),
  answerValue: z.string().min(1).max(64),
  /** Resume position, saved with the answer so a refresh lands correctly. */
  currentSection: z.string().max(32).optional(),
  currentItem: z.string().max(64).optional(),
});

/**
 * Save one answer. Upsert on (session_id, item_id) so going back and
 * changing an answer UPDATES rather than creating a duplicate.
 *
 * Item metadata — kind, version, evidence class, is_scored, adaptive path —
 * is NOT sent by the client and NOT trusted from it. The database derives
 * every one of those from cd_definition_items. Only the item id, the stable
 * option value and the contextual tags travel from here.
 */
export const saveDiscoveryAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    const isCore = CORE_ITEMS_BY_ID.has(data.itemId);
    const adaptive = ADAPTIVE_ITEMS_BY_ID.get(data.itemId);
    const isContext =
      data.itemId === CONTEXT_STATUS_ITEM_ID || data.itemId === DISCOVERY_GOAL_ITEM_ID;
    if (!isCore && !adaptive && !isContext) throw new DiscoveryError("unknown_item");

    // Contextual report tags come from the authored bank, never the client.
    const tags = adaptive?.options.find((o) => o.value === data.answerValue)?.reportTags ?? [];

    const { error } = await ctx.supabase.from("cd_evidence").upsert(
      {
        session_id: data.sessionId,
        item_id: data.itemId,
        answer_value: data.answerValue,
        answer_tags: tags,
      },
      { onConflict: "session_id,item_id" },
    );
    if (error) throw new DiscoveryError("save_failed");

    // C1 sets the routing. The database DERIVES adaptive_path from it and
    // freezes both, so this write cannot choose a path.
    const patch: Record<string, unknown> = {};
    if (data.itemId === CONTEXT_STATUS_ITEM_ID && isContextStatus(data.answerValue)) {
      patch.context_status = data.answerValue;
    }
    if (data.itemId === DISCOVERY_GOAL_ITEM_ID && isDiscoveryGoal(data.answerValue)) {
      patch.discovery_goal = data.answerValue;
    }
    if (data.currentSection) patch.current_section = data.currentSection;
    if (data.currentItem) patch.current_item = data.currentItem;

    if (Object.keys(patch).length > 0) {
      const { error: sErr } = await ctx.supabase
        .from("cd_sessions")
        .update(patch)
        .eq("id", data.sessionId);
      if (sErr) throw new DiscoveryError("save_failed");
    }

    return { saved: true as const, itemId: data.itemId };
  });

// -------------------------------------------------------------------------
// Completion
// -------------------------------------------------------------------------

/**
 * Score, rank, generate the report, and persist it atomically.
 *
 * The answers are re-read from the database rather than accepted from the
 * client, so a caller cannot submit a payload that was never stored as
 * evidence. Scoring and ranking are deterministic TypeScript; the RPC does
 * the locking, the exact-core verification and the atomic write.
 */
export const completeDiscoverySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    // Ownership: read through the caller's own RLS-scoped client first. If
    // this returns nothing, the session is not theirs and nothing proceeds.
    const { data: session } = await ctx.supabase
      .from("cd_sessions")
      .select("id, context_status, discovery_goal, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new DiscoveryError("no_session");

    if (session.status === "completed") {
      const { data: existing } = await ctx.supabase
        .from("cd_report_snapshots")
        .select("id")
        .eq("session_id", data.sessionId)
        .maybeSingle();
      if (existing?.id) return { snapshotId: existing.id as string, alreadyCompleted: true };
      throw new DiscoveryError("already_completed");
    }

    const { data: evidence } = await ctx.supabase
      .from("cd_evidence")
      .select("item_id, answer_value, answer_tags, is_scored")
      .eq("session_id", data.sessionId);

    const rows = (evidence ?? []) as Array<{
      item_id: string;
      answer_value: string;
      answer_tags: string[] | null;
      is_scored: boolean;
    }>;

    const scoringInput: ScoringInput[] = rows.map((r) => ({
      itemId: r.item_id,
      answerValue: r.answer_value,
    }));

    const dna = scoreDna(scoringInput);
    const ranking = rankCareerAreas(dna);

    // Contextual tags reach the report and nothing else.
    const tags = rows.flatMap((r) => r.answer_tags ?? []);

    const report = buildReport(dna, ranking, {
      contextStatus: (session.context_status as ContextStatus | null) ?? null,
      discoveryGoal: (session.discovery_goal as DiscoveryGoal | null) ?? null,
      tags,
    });

    // The atomic write. Version strings are derived by trigger from the
    // session's definition version, never from this payload.
    //
    // supabaseAdmin is imported DYNAMICALLY, inside the handler: a
    // top-level import of client.server.ts from a *.functions.ts module
    // would ship the service-role client into the browser bundle. The
    // file's own header says so, and this is the pattern it prescribes.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The generated Database type is produced by Lovable and does not yet
    // know the cd_* RPCs added by this branch's migrations. Casting the rpc
    // call keeps type safety everywhere else in this file rather than
    // widening the client itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: snapshotId, error } = await (supabaseAdmin.rpc as any)("cd_complete_session", {
      _session_id: data.sessionId,
      _dna_scores: { axes: dna.axes, signals: dna.signals, report },
      _career_areas: ranking.top.map((t) => ({
        areaId: t.areaId,
        fit: t.fit,
        confidence: t.confidence,
      })),
      _confidence: {
        axisCoverage: dna.axisCoverage,
        emergingAxes: dna.emergingAxes,
        contextDependentAxes: dna.contextDependentAxes,
      },
      _coverage: { coverage: dna.coverage, answeredCoreItemCount: dna.answeredCoreItemCount },
      _contextual_tags: Array.from(new Set(tags)).sort(),
    });

    if (error || !snapshotId) {
      // Distinguish the one case the user can act on from everything else.
      const message = String(error?.message ?? "");
      if (message.includes("CD_CORE_INCOMPLETE")) throw new DiscoveryError("core_incomplete");
      if (message.includes("CD_ALREADY_COMPLETED")) throw new DiscoveryError("already_completed");
      throw new DiscoveryError("complete_failed");
    }

    return { snapshotId: snapshotId as string, alreadyCompleted: false };
  });

// -------------------------------------------------------------------------
// Report and history
// -------------------------------------------------------------------------

export const getDiscoveryReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    // Owner-scoped by RLS. Another user's snapshot id returns nothing.
    const { data: snapshot } = await ctx.supabase
      .from("cd_report_snapshots")
      .select(
        "id, session_id, generated_at, definition_version, content_version, scoring_version, taxonomy_version, dna_scores, career_areas, confidence, coverage, contextual_tags, context_status, discovery_goal",
      )
      .eq("id", data.snapshotId)
      .maybeSingle();
    if (!snapshot) throw new DiscoveryError("no_session");

    return {
      snapshotId: snapshot.id as string,
      generatedAt: snapshot.generated_at as string,
      versions: {
        definition: snapshot.definition_version as string,
        content: snapshot.content_version as string,
        scoring: snapshot.scoring_version as string,
        taxonomy: snapshot.taxonomy_version as string,
      },
      report: (snapshot.dna_scores as { report?: DiscoveryReport })?.report ?? null,
      careerAreas: snapshot.career_areas,
      contextualTags: (snapshot.contextual_tags as string[]) ?? [],
    };
  });

export const listMyDiscoveryReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;

    // The view is security_invoker, so the caller's own RLS governs.
    const { data: rows } = await ctx.supabase
      .from("cd_my_report_history")
      .select(
        "snapshot_id, session_id, generated_at, definition_version, scoring_version, context_status, discovery_goal, locale, top_area_id",
      )
      .order("generated_at", { ascending: false });

    return {
      reports: ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        snapshotId: r.snapshot_id as string,
        sessionId: r.session_id as string,
        generatedAt: r.generated_at as string,
        definitionVersion: r.definition_version as string,
        scoringVersion: r.scoring_version as string,
        contextStatus: (r.context_status as ContextStatus | null) ?? null,
        discoveryGoal: (r.discovery_goal as DiscoveryGoal | null) ?? null,
        locale: r.locale as "sv" | "en",
        topAreaId: (r.top_area_id as string | null) ?? null,
      })),
    };
  });

/** Re-export so a route can assemble the question list without importing
 *  half the namespace. */
export { assembleSession };
