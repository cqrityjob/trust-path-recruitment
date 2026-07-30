// The public v3.1 assessment: availability, and replay-on-login persistence.
//
// ── WHAT MAKES THIS PUBLIC WITHOUT BEING ANONYMOUS ─────────────────────
//
// A signed-out visitor answers into sessionStorage (v31-public-buffer.ts). The
// database is not touched at all until they sign in. Then `persistPublicV31Run`
// replays the buffer through the NORMAL authenticated pipeline: a real
// cd_sessions row owned by their user_id, real cd_evidence rows, and
// cd_v31_complete_session for the atomic snapshot.
//
// So there is no anonymous grant, no anonymous RLS policy, and no anonymous
// report ownership. A report cannot exist before its owner does.
//
// ── AVAILABILITY IS READ, NEVER ASSUMED ────────────────────────────────
//
// v3.1 sits at lifecycle_status = 'internal_test' with review gates
// outstanding, and the database refuses a candidate session against it. That
// refusal is the review-gate control working, not a bug to route around.
//
// `getV31Availability` reads the real lifecycle state so the public route can
// say so plainly BEFORE a visitor spends fifteen minutes answering questions.
// Letting someone complete an assessment that cannot be saved would be the
// worst possible version of this feature.
//
// Nothing here promotes, bypasses or weakens the lifecycle. Activation is a
// separate, owner-run step — see docs/assessment/career-discovery/v31-activation.sql.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as publicClient } from "@/integrations/supabase/client";

import { CORE_ITEM_BY_ID, CORE_ITEMS } from "./v31/core-items";
import { buildValidatedSnapshot, SnapshotValidationError } from "./v31/snapshot";
import type { Answer } from "./v31/scoring";
import { DEFINITION_VERSION, PATTERN_DEFINITION_VERSION, type Locale } from "./v31/version";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

/** Lifecycle statuses a real candidate session may be created against. Mirrors
 *  the database rule; the database remains the enforcement point. */
const CANDIDATE_ADMINISTRABLE = ["pilot", "active"] as const;

export type V31PublicErrorCode =
  | "not_available"
  | "definition_missing"
  | "incomplete_buffer"
  | "invalid_answers"
  | "persist_failed";

export class V31PublicError extends Error {
  constructor(
    readonly code: V31PublicErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "V31PublicError";
  }
}

export interface V31Availability {
  /** True only when a real candidate could actually complete and save a run. */
  readonly available: boolean;
  /** Present so the UI can distinguish "coming soon" from "misconfigured". */
  readonly lifecycleStatus: string | null;
  readonly outstandingGates: number;
}

/**
 * Can a real candidate take v3.1 right now?
 *
 * Deliberately UNAUTHENTICATED: a signed-out visitor needs the answer before
 * starting. Reads only definition metadata, which carries no candidate data and
 * which `anon` may already select — no grant is added by this PR.
 */
export const getV31Availability = createServerFn({ method: "GET" }).handler(
  async (): Promise<V31Availability> => {
    const { data } = await publicClient
      .from("cd_definition_versions")
      .select("lifecycle_status, review_status")
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();

    if (!data) return { available: false, lifecycleStatus: null, outstandingGates: 0 };

    const gates = (data.review_status ?? {}) as Record<string, unknown>;
    const outstanding = Object.values(gates).filter((v) => v !== true).length;
    const status = (data.lifecycle_status as string) ?? null;

    return {
      available:
        status !== null &&
        (CANDIDATE_ADMINISTRABLE as readonly string[]).includes(status) &&
        outstanding === 0,
      lifecycleStatus: status,
      outstandingGates: outstanding,
    };
  },
);

const bufferedAnswerSchema = z.union([
  z.object({
    itemId: z.string(),
    format: z.literal("scale"),
    value: z.number().int().min(1).max(10),
  }),
  z.object({
    itemId: z.string(),
    format: z.literal("single_choice"),
    optionId: z.string(),
  }),
]);

export interface PersistResult {
  readonly snapshotId: string;
  readonly created: boolean;
}

/**
 * Replay a buffered public run into the authenticated v3.1 pipeline.
 *
 * Ordinary authenticated writes throughout — the caller's own RLS-scoped
 * client, so a run can only ever be written as its own owner.
 *
 * Throws rather than partially persisting. The client keeps the buffer until
 * this resolves, so a failure loses nothing: the candidate can retry with their
 * answers intact. Clearing the buffer before this succeeded is the one mistake
 * that would destroy real work.
 */
export const persistPublicV31Run = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        locale: z.enum(["sv", "en"]),
        answers: z.array(bufferedAnswerSchema).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PersistResult> => {
    const ctx = context as Ctx;

    // 1. Every core item must be answered exactly once. Checked before any
    //    write, so an incomplete buffer never creates a half-finished session.
    const byItem = new Map<string, Answer>();
    for (const a of data.answers) {
      const item = CORE_ITEM_BY_ID[a.itemId];
      if (!item) throw new V31PublicError("invalid_answers", "unknown item");
      if (item.format !== a.format) {
        throw new V31PublicError("invalid_answers", "format does not match the registry");
      }
      if (a.format === "single_choice" && !a.optionId.startsWith(`${a.itemId}_`)) {
        throw new V31PublicError("invalid_answers", "option does not belong to its item");
      }
      byItem.set(a.itemId, a as Answer);
    }
    if (byItem.size !== CORE_ITEMS.length) {
      throw new V31PublicError("incomplete_buffer", `${byItem.size} of ${CORE_ITEMS.length}`);
    }

    // 2. Resolve the definition version. Its lifecycle is enforced by the
    //    database on insert; this read is for a clear error, not a gate.
    const { data: dv } = await ctx.supabase
      .from("cd_definition_versions")
      .select("id, lifecycle_status")
      .eq("definition_version", DEFINITION_VERSION)
      .maybeSingle();
    if (!dv?.id) throw new V31PublicError("definition_missing");

    // 3. Build and validate the report BEFORE writing anything. A run that
    //    cannot produce a valid report must not leave a session behind.
    const completedAt = new Date().toISOString();
    const answers = [...byItem.values()];
    let snapshot;
    try {
      snapshot = buildValidatedSnapshot({ answers, locale: data.locale as Locale, completedAt });
    } catch (err) {
      if (err instanceof SnapshotValidationError) {
        throw new V31PublicError("invalid_answers", err.failures.map((f) => f.code).join(","));
      }
      throw err;
    }

    // 4. Session. `context_status` stays NULL: v3.1's twenty items do not
    //    include the v3.0 routing questions, and the derive trigger already
    //    treats NULL as "no routing answer, therefore no adaptive path". No
    //    new question is introduced to satisfy a column.
    const { data: session, error: sessionError } = await ctx.supabase
      .from("cd_sessions")
      .insert({
        definition_version_id: dv.id,
        user_id: ctx.userId,
        locale: data.locale,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (sessionError || !session?.id) {
      // The most likely cause is the lifecycle guard refusing a session against
      // a non-administrable version. Surfaced as not_available so the UI can
      // say "not yet available" rather than "something went wrong".
      const code = String(sessionError?.message ?? "");
      if (
        code.includes("CD_VERSION_NOT_ADMINISTRABLE") ||
        code.includes("CD_REVIEW_GATES") ||
        // internal_test is refused by its own, stronger guard: the version is
        // reachable only through the admin-authorised function. Surfaced as
        // not_available so the candidate reads "not open yet" rather than
        // "something went wrong". Found by the public-flow fixture.
        code.includes("CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION")
      ) {
        throw new V31PublicError("not_available", dv.lifecycle_status as string);
      }
      throw new V31PublicError("persist_failed", "session");
    }

    // 5. Evidence. Metadata is derived by the database from the item registry;
    //    only the answer itself is supplied.
    const rows = answers.map((a) => ({
      session_id: session.id,
      item_id: a.itemId,
      item_version: 1,
      answer_value: a.format === "scale" ? String(a.value) : a.optionId,
      option_id: a.format === "single_choice" ? a.optionId : null,
    }));

    const { error: evidenceError } = await ctx.supabase.from("cd_evidence").insert(rows);
    if (evidenceError) throw new V31PublicError("persist_failed", "evidence");

    // 6. Atomic completion. Idempotent: a retry returns the same snapshot.
    const { data: result, error: completeError } = await ctx.supabase.rpc(
      "cd_v31_complete_session",
      {
        _session_id: session.id,
        _payload: snapshot,
        _pattern_definition_version: PATTERN_DEFINITION_VERSION,
        _completed_at: completedAt,
      },
    );
    if (completeError) throw new V31PublicError("persist_failed", "completion");

    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.snapshot_id) throw new V31PublicError("persist_failed", "completion");

    return { snapshotId: row.snapshot_id as string, created: Boolean(row.was_created) };
  });
