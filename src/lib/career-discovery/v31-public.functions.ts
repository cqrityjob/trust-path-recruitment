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
import {
  ADAPTIVE_ITEMS_PER_SESSION,
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  isContextStatus,
  isValidPersonalAnswer,
  reportTagsFor,
  type ContextStatus,
} from "./v31/personal-layer";
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

    // Mirrors the database rule exactly: lifecycle decides admission. Review
    // gates are a governance record, reported here for operators, and never
    // used to refuse a candidate.
    return {
      available: status !== null && (CANDIDATE_ADMINISTRABLE as readonly string[]).includes(status),
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
  // Context and Discovery Path answers. Never scored — see the split in the
  // handler, where these are excluded from the snapshot inputs by type.
  z.object({
    itemId: z.string(),
    format: z.literal("personal"),
    value: z.string(),
  }),
]);

export interface PersistResult {
  readonly snapshotId: string;
  readonly created: boolean;
}

/** One row as it is sent to cd_evidence.
 *
 *  Only the columns the caller is allowed to supply. item_version, item_kind,
 *  evidence_class, is_scored and adaptive_path are DERIVED by the database
 *  from the item registry and are deliberately absent — sending them would
 *  mean a client could assert that a context answer is scored. */
export interface EvidenceRow {
  readonly session_id: string;
  readonly item_id: string;
  readonly item_version: number;
  readonly answer_value: string;
  readonly option_id: string | null;
  /** NEVER null. `cd_evidence.answer_tags` is `text[] NOT NULL DEFAULT '{}'`,
   *  so an explicit null overrides the default and fails the column's NOT NULL
   *  constraint with SQLSTATE 23502 — for the whole statement, not just the
   *  offending row. Empty array for everything that is not an adaptive item;
   *  the database refuses tags on any other kind
   *  (CD_REPORT_TAGS_ONLY_ON_ADAPTIVE). */
  readonly answer_tags: readonly string[];
}

/**
 * Build the evidence rows for one completed run.
 *
 * Extracted and exported so the payload is directly testable. It previously
 * lived inline inside the handler, which meant the SQL suite could only test a
 * hand-written approximation of it — and that approximation omitted
 * `answer_tags` entirely, letting the column default apply. The real payload
 * sent `answer_tags: null`, which the default cannot rescue. Every one of the
 * 26 rows was rejected, and no test could see it.
 */
export function buildEvidenceRows(
  sessionId: string,
  coreAnswers: readonly Answer[],
  personalAnswers: ReadonlyMap<string, string>,
): EvidenceRow[] {
  const core: EvidenceRow[] = coreAnswers.map((a) => ({
    session_id: sessionId,
    item_id: a.itemId,
    item_version: 1,
    answer_value: a.format === "scale" ? String(a.value) : a.optionId,
    option_id: a.format === "single_choice" ? a.optionId : null,
    answer_tags: [],
  }));

  // The personal layer. `answer_tags` carry the structured Career Context
  // Signals the Career Intelligence Engine reads after the assessment. Context
  // items produce none, so they send [] — not null.
  const personal: EvidenceRow[] = [...personalAnswers.entries()].map(([itemId, value]) => ({
    session_id: sessionId,
    item_id: itemId,
    item_version: 1,
    answer_value: value,
    option_id: null,
    answer_tags: reportTagsFor(itemId, value),
  }));

  return [...core, ...personal];
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

    // 1. Split the run into its scored and unscored halves, and validate each
    //    against its own bank. Checked before any write, so an incomplete
    //    buffer never creates a half-finished session.
    //
    //    THE SPLIT IS THE SCORING BOUNDARY. `byItem` — and only `byItem` —
    //    reaches `buildValidatedSnapshot`. A personal answer cannot enter it,
    //    because `CORE_ITEM_BY_ID` does not contain personal item ids and a
    //    `personal` answer carries neither a scale value nor an option id.
    const byItem = new Map<string, Answer>();
    const personal = new Map<string, string>();

    for (const a of data.answers) {
      if (a.format === "personal") {
        if (!isValidPersonalAnswer(a.itemId, a.value)) {
          throw new V31PublicError("invalid_answers", "unknown context or discovery-path answer");
        }
        personal.set(a.itemId, a.value);
        continue;
      }

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

    // 1b. The personal layer: 2 context answers, then exactly the four
    //     Discovery Path items the candidate's own path serves.
    const rawStatus = personal.get(CONTEXT_STATUS_ITEM_ID);
    if (!isContextStatus(rawStatus)) {
      throw new V31PublicError("incomplete_buffer", "no routing answer");
    }
    const contextStatus: ContextStatus = rawStatus;

    for (const item of CONTEXT_ITEMS) {
      if (!personal.has(item.id)) {
        throw new V31PublicError("incomplete_buffer", `context item ${item.id}`);
      }
    }

    const servedAdaptive = adaptiveItemsForStatus(contextStatus);
    for (const item of servedAdaptive) {
      if (!personal.has(item.id)) {
        throw new V31PublicError("incomplete_buffer", `discovery-path item ${item.id}`);
      }
    }
    // An answer to an item outside this run's own path is rejected rather
    // than dropped. The database would refuse it too
    // (CD_ADAPTIVE_PATH_MISMATCH); failing here means failing before a session
    // row exists, so nothing partial is left behind.
    const expectedPersonal = new Set([
      ...CONTEXT_ITEMS.map((i) => i.id),
      ...servedAdaptive.map((i) => i.id),
    ]);
    for (const id of personal.keys()) {
      if (!expectedPersonal.has(id)) {
        throw new V31PublicError("invalid_answers", "answer from another Discovery Path");
      }
    }
    if (servedAdaptive.length !== ADAPTIVE_ITEMS_PER_SESSION) {
      throw new V31PublicError("invalid_answers", "discovery path is not four items");
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

    // 4. Session. `context_status` carries the C1 answer; `adaptive_path` is
    //    deliberately NOT sent. `cd_guard_derive_adaptive_path` derives it
    //    from context_status and overwrites anything supplied, so the path
    //    stored is the database's own conclusion, not the client's claim.
    //    That derivation is also what makes the adaptive evidence below
    //    insertable at all — evidence for an adaptive item is refused unless
    //    the session already carries the matching path.
    const { data: session, error: sessionError } = await ctx.supabase
      .from("cd_sessions")
      .insert({
        definition_version_id: dv.id,
        user_id: ctx.userId,
        locale: data.locale,
        status: "in_progress",
        context_status: contextStatus,
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

    // 5. Evidence — all 26 answers. Metadata (item_version, item_kind,
    //    evidence_class, is_scored, adaptive_path) is derived by the database
    //    from the item registry; only the answer itself is supplied, so a
    //    caller cannot assert that a context answer is scored.
    const rows = buildEvidenceRows(session.id as string, answers, personal);

    const { error: evidenceError } = await ctx.supabase.from("cd_evidence").insert(rows);
    if (evidenceError) {
      // The database's own words, not a summary of them.
      //
      // This previously threw a bare "evidence", which is how a NOT NULL
      // violation on answer_tags reached production looking identical to a
      // network failure: the UI said "Rapporten kunde inte sparas" and the one
      // fact that would have identified it in seconds -- the SQLSTATE and the
      // column name -- was discarded here.
      //
      // Server-side only. `detail` is returned to the client as a short code;
      // the full record goes to the server log.
      console.error("[v31] cd_evidence insert rejected", {
        code: evidenceError.code,
        message: evidenceError.message,
        details: evidenceError.details,
        hint: evidenceError.hint,
        rowCount: rows.length,
        sessionId: session.id,
      });
      throw new V31PublicError(
        "persist_failed",
        `evidence:${evidenceError.code ?? "unknown"}:${evidenceError.message ?? ""}`,
      );
    }

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
