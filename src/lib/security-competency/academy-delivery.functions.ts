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

/** Map a database refusal onto a code the UI can act on, keeping the real
 *  message for the log. A bare "something went wrong" here would repeat the
 *  mistake that made the cd_evidence defect so slow to diagnose. */
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
  return new AcademyDeliveryError(fallback, dbMessage);
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
