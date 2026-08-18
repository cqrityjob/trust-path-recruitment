// Academy participant delivery — the server side of the assessment run.
//
// ── WHY THERE IS ALMOST NO LOGIC HERE ──────────────────────────────────
//
// Every rule that matters lives in the database: which items a participant may
// see, what may be returned about them, whether an answer may still be saved,
// how a response becomes evidence, and when an attempt is scored. This file
// calls five RPCs and translates their errors into something a UI can render.
//
// That is deliberate. A scoring rule implemented here would be a rule the SQL
// suite cannot test and a second service could bypass. The one in the database
// is the only one.
//
// In particular: NOTHING here filters the delivery payload. It cannot leak an
// answer key by omission, because scp_get_attempt_items has no key to return —
// the columns are absent from its return type, asserted by an in-migration
// guard on the function's own signature.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx, RpcRow } from "./rpc-types";

/** One item as the participant sees it. Labels only — never a key or a score. */
export type AcademyItem = {
  itemVersionId: string;
  displayOrder: number;
  itemFormat:
    | "sjt_best_response"
    | "sjt_best_worst"
    | "sjt_rate_effectiveness"
    | "constructed_response";
  scenario: string;
  prompt: string;
  isSafetyCritical: boolean;
  options: { optionId: string; optionKey: string; label: string }[];
  savedOptionId: string | null;
  savedBestId: string | null;
  savedWorstId: string | null;
  savedText: string | null;
};

export type AcademyDeliveryErrorCode =
  | "not_found"
  | "not_open"
  | "item_not_on_form"
  | "incomplete"
  | "incomplete_best_worst"
  | "load_failed"
  | "save_failed"
  | "submit_failed";

export class AcademyDeliveryError extends Error {
  constructor(
    readonly code: AcademyDeliveryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AcademyDeliveryError";
  }
}

/** Map a database refusal onto a code the UI can act on.
 *
 *  A recognised SCP_* refusal is deliberate, participant-safe wording written
 *  by whoever raised it, so it is carried through. Anything else is an
 *  UNEXPECTED database error — a constraint name, a SQLSTATE, a fragment of
 *  SQL — and must never reach a candidate or an employer. It is logged
 *  server-side, in full, and replaced with a neutral message.
 *
 *  This is not "a bare something-went-wrong": the code still tells the UI what
 *  happened, and the real text is one log line away for whoever is debugging.
 *  What changes is that the participant no longer sees
 *  `scp_evidence_safety_is_specified` when a submission fails. */
function classify(dbMessage: string, fallback: AcademyDeliveryErrorCode): AcademyDeliveryError {
  if (dbMessage.includes("SCP_ATTEMPT_NOT_YOURS")) {
    return new AcademyDeliveryError("not_found", dbMessage);
  }
  if (
    dbMessage.includes("SCP_ATTEMPT_NOT_OPEN") ||
    dbMessage.includes("SCP_ATTEMPT_ALREADY_SUBMITTED")
  ) {
    return new AcademyDeliveryError("not_open", dbMessage);
  }
  if (dbMessage.includes("SCP_ITEM_NOT_ON_FORM")) {
    return new AcademyDeliveryError("item_not_on_form", dbMessage);
  }
  if (dbMessage.includes("SCP_INCOMPLETE_ATTEMPT")) {
    return new AcademyDeliveryError("incomplete", dbMessage);
  }
  if (dbMessage.includes("SCP_INCOMPLETE_BEST_WORST")) {
    return new AcademyDeliveryError("incomplete_best_worst", dbMessage);
  }
  if (dbMessage.includes("SCP_RESPONSE_SHAPE")) {
    return new AcademyDeliveryError("save_failed", dbMessage);
  }

  // Unrecognised. Keep the detail in the server log, give the caller nothing.
  console.error("[academy-delivery] unexpected database error", dbMessage);
  return new AcademyDeliveryError(fallback, "UNEXPECTED_ERROR");
}

const LANGUAGE = { sv: "sv-SE", en: "en-GB" } as const;

/**
 * The items for an attempt, in form order, with any answers already saved.
 *
 * Returns an empty list rather than an error when the attempt is not the
 * caller's — the RPC gives no signal about whether it exists, and neither
 * does this.
 */
export const getAcademyAttemptItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ attemptId: z.string().uuid(), locale: z.enum(["sv", "en"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AcademyItem[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_get_attempt_items", {
      _attempt_id: data.attemptId,
      _language: LANGUAGE[data.locale],
    });
    if (error) throw classify(error.message ?? "", "load_failed");

    return (rows ?? []).map(
      (r: RpcRow): AcademyItem => ({
        itemVersionId: String(r.item_version_id),
        displayOrder: Number(r.display_order),
        itemFormat: r.item_format as AcademyItem["itemFormat"],
        scenario: String(r.scenario),
        prompt: String(r.prompt),
        isSafetyCritical: Boolean(r.is_safety_critical),
        options: (Array.isArray(r.options) ? r.options : []).map((o: RpcRow) => ({
          optionId: String(o.option_id),
          optionKey: String(o.option_key),
          label: String(o.label),
        })),
        savedOptionId: r.saved_option_id ? String(r.saved_option_id) : null,
        savedBestId: r.saved_best_id ? String(r.saved_best_id) : null,
        savedWorstId: r.saved_worst_id ? String(r.saved_worst_id) : null,
        savedText: r.saved_text ? String(r.saved_text) : null,
      }),
    );
  });

/** Where an attempt stands, as far as the participant is allowed to know.
 *
 *  Read straight off the attempt row, which `scp_attempts_own_select` already
 *  lets a participant see for their own attempt only. It exists because the
 *  item payload alone cannot tell the difference between "not started" and
 *  "already handed in" — `scp_get_attempt_items` keeps returning items after
 *  submission, so a reload would otherwise offer to resume a run that is
 *  closed, and the participant would only discover it by pressing submit
 *  again.
 *
 *  Deliberately four fields. Not the reviews, not the evidence, not the
 *  scoring state: a participant may know that their answers are in and that a
 *  person still has to read one, and nothing further. */
export type AcademyAttemptState = {
  status: "in_progress" | "submitted" | "scored" | "released" | "abandoned";
  isOpen: boolean;
};

export const getAcademyAttemptState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AcademyAttemptState | null> => {
    const ctx = context as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("scp_attempts")
      .select("status")
      .eq("id", data.attemptId)
      .maybeSingle();
    // No row means "not yours, or does not exist" — RLS makes those the same
    // answer, and so does this. The caller treats null exactly like an empty
    // item list.
    if (error) throw classify(error.message ?? "", "load_failed");
    if (!row) return null;
    const status = String(row.status) as AcademyAttemptState["status"];
    return { status, isOpen: status === "in_progress" };
  });

/** Save or replace one answer. Idempotent — the RPC upserts on (attempt, item). */
export const saveAcademyResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        itemVersionId: z.string().uuid(),
        selectedOptionId: z.string().uuid().nullable().default(null),
        bestOptionId: z.string().uuid().nullable().default(null),
        worstOptionId: z.string().uuid().nullable().default(null),
        responseText: z.string().max(4000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ responseId: string }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_save_response", {
      _attempt_id: data.attemptId,
      _item_version_id: data.itemVersionId,
      _selected_option_id: data.selectedOptionId,
      _best_option_id: data.bestOptionId,
      _worst_option_id: data.worstOptionId,
      _response_text: data.responseText,
    });
    if (error) throw classify(error.message ?? "", "save_failed");
    return { responseId: String(id) };
  });

/**
 * Submit. This is the one-way door: after it, answers are evidence.
 *
 * The result distinguishes what was scored from what went to a person, because
 * a participant who wrote a free-text answer deserves to be told that a human
 * will read it rather than being shown a result that quietly is not final.
 */
export const submitAcademyAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ evidenceWritten: number; reviewsOpened: number; attemptStatus: string }> => {
      const ctx = context as Ctx;
      const { data: rows, error } = await ctx.supabase.rpc("scp_submit_attempt", {
        _attempt_id: data.attemptId,
      });
      if (error) throw classify(error.message ?? "", "submit_failed");
      const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow | undefined;
      return {
        evidenceWritten: Number(r?.evidence_written ?? 0),
        reviewsOpened: Number(r?.reviews_opened ?? 0),
        attemptStatus: String(r?.attempt_status ?? "unknown"),
      };
    },
  );
