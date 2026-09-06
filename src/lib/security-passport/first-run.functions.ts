// Security Passport — the first run's three server calls.
//
// ── WHY THIS IS A SEPARATE FILE ────────────────────────────────────────
//
// `passport.functions.ts` owns the profile, the snapshot and corrections;
// `entries.functions.ts` owns the ongoing add/edit path. The first run is
// neither: it is one operation that spans both tables plus the profile plus
// the audit log, and it has to be atomic. Putting it in either file would put
// a transaction-shaped thing next to a row-shaped thing and invite the next
// person to reuse half of it.
//
// ── THREE CALLS, AND WHY NOT TWO ───────────────────────────────────────
//
//   saveFirstRunDraft   the debounced autosave. Writes answers and step, and
//                       leaves onboarding `in_progress`. This is what "Save
//                       and exit" performs — no merit, no declaration.
//
//   completeFirstMerit  the one atomic operation, in the database.
//
//   readBackFirstMerit  the exact subject, by id, read as a separate request
//                       AFTER the write. The browser compares what came back
//                       against what it sent and decides what to say.
//
// The readback is genuinely separate on purpose. A completion that answered
// "saved, and here is the row" would be one server telling itself the truth;
// the point is that the CLIENT asks again, over a new request, and only says
// "saved" when the row it asked for comes back saying what it should.
//
// ── WHAT THIS FILE CANNOT DO ───────────────────────────────────────────
//
// Nothing here writes `assertion_level`, `lifecycle_state`,
// `verified_by_user_id` or `verified_at`, and no branch could: the merit is
// created inside `sp_passport_complete_first_merit`, whose body cannot even
// NAME those columns (asserted by the migration's own postflight and by
// supabase/tests/security_passport_first_merit_test.sql).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isCalendarDate } from "./dates";
import { FIRST_MERIT_KINDS, type PersistedMerit } from "./first-run";
import { PASSPORT_QUESTION_VERSION } from "./passport.functions";

/* ------------------------------------------------------------------ */
/* The draft                                                           */
/* ------------------------------------------------------------------ */

const draftInput = z.object({
  step: z.number().int().min(0).max(10),
  answers: z.record(z.string(), z.string().max(400)),
});

/**
 * Autosave, and the whole of "Save and exit".
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ────────────────────────────────
 *
 * `declared_accurate_at` and `onboarding_state = 'completed'`. A draft is an
 * unfinished answer, and the previous implementation's real defect was that
 * "Save and exit" and "Finish" were the SAME function call — so leaving the
 * flow recorded a truthfulness declaration and closed onboarding on a
 * Passport with nothing in it.
 *
 * The state it writes is `in_progress`, always, which is what an unfinished
 * answer is.
 */
export const saveFirstRunDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => draftInput.parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { supabase, userId } = context;

    type ProfileUpdate = Database["public"]["Tables"]["sp_passport_profiles"]["Update"];
    const patch: ProfileUpdate = {
      onboarding_step: data.step,
      onboarding_answers: data.answers,
      onboarding_state: "in_progress",
      question_version: PASSPORT_QUESTION_VERSION,
    };

    const { data: row, error } = await supabase
      .from("sp_passport_profiles")
      .update(patch)
      .eq("holder_user_id", userId)
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    // An UPDATE against a row that does not exist affects nothing and reports
    // no error, which is how a holder used to watch a save succeed and change
    // nothing. The Passport must exist before a draft can be saved against it,
    // and the journey creates it on screen 1 — so this is a real failure.
    if (!row) throw new Error("SP_PASSPORT_MISSING");

    return { savedAt: (row as { updated_at: string }).updated_at };
  });

/* ------------------------------------------------------------------ */
/* The completion                                                      */
/* ------------------------------------------------------------------ */

const completionInput = z
  .object({
    /** Minted by the browser BEFORE the first attempt and autosaved into the
     *  draft, so a refresh, a retry and a second tab all carry the same key. */
    operationId: z.string().uuid(),
    meritKind: z.enum(FIRST_MERIT_KINDS),
    title: z.string().min(1).max(200),
    organisation: z.string().min(1).max(200),
    /** Empty means NOT STATED. It is never turned into a country here. */
    country: z.string().max(2).nullable(),
    startedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
    endedOn: z.string().refine(isCalendarDate, { message: "SP_INVALID_DATE" }).nullable(),
    /** The holder ticked the box. Not a default, not inferred from having
     *  pressed Save: the server refuses anything but an explicit true, and
     *  the database refuses it again. */
    declared: z.literal(true),
  })
  .refine((v) => v.endedOn === null || v.startedOn === null || v.endedOn > v.startedOn, {
    message: "SP_PERIOD_END_BEFORE_START",
    path: ["endedOn"],
  });

export interface FirstMeritResult {
  readonly subjectKind: "experience" | "claim";
  readonly subjectId: string;
  /** False when this call replayed an operation that had already run. The
   *  journey shows the same confirmation either way — the holder submitted
   *  once and their merit exists, which is all "created" was ever about. */
  readonly created: boolean;
}

/**
 * The whole first run, committed once or not at all.
 *
 * This is a thin wrapper over one RPC, and that thinness is the design. Every
 * rule — the declaration, the required values, the country, idempotency, the
 * audit events, the onboarding transition — is enforced inside a single
 * database transaction, where a partial failure is impossible. A TypeScript
 * function cannot offer that: it can only make four requests and hope.
 */
export const completeFirstMerit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => completionInput.parse(data))
  .handler(async ({ context, data }): Promise<FirstMeritResult> => {
    const { supabase } = context;

    const { data: rows, error } = await supabase.rpc("sp_passport_complete_first_merit", {
      _operation_id: data.operationId,
      _merit_kind: data.meritKind,
      _title: data.title,
      _organisation: data.organisation,
      // `null`, not "". An empty string would be a country of two blank
      // characters as far as the parameter is concerned; null is "nobody said".
      _country: data.country && data.country.trim() !== "" ? data.country.trim() : null,
      _started_on: data.startedOn,
      _ended_on: data.endedOn,
      _declared: data.declared,
    } as never);
    if (error) throw new Error(error.message);

    const row = (rows as unknown as readonly FirstMeritRow[] | null)?.[0];
    // A completion that returns nothing is NOT a success. The old code's
    // habit of coalescing an empty answer into a benign default is exactly
    // what let "your merit is saved" appear over nothing.
    if (!row?.subject_id) throw new Error("SP_FIRST_MERIT_NO_RESULT");

    return {
      subjectKind: row.subject_kind === "claim" ? "claim" : "experience",
      subjectId: row.subject_id,
      created: Boolean(row.created),
    };
  });

type FirstMeritRow = {
  subject_kind: string;
  subject_id: string;
  created: boolean;
};

/* ------------------------------------------------------------------ */
/* The readback                                                        */
/* ------------------------------------------------------------------ */

/**
 * Read one merit back, by the exact id the completion returned.
 *
 * Scoped by RLS to the caller and filtered on `holder_user_id` as well, so a
 * guessed id answers `null` rather than somebody else's row.
 *
 * `null` means "no such row for you". It does NOT mean the save failed — the
 * caller distinguishes a null answer from a thrown one, and treats a thrown
 * one as unknown. See `confirmReadback` in first-run.ts, which is where those
 * three outcomes are named.
 */
export const readBackFirstMerit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ subjectKind: z.enum(["experience", "claim"]), subjectId: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<PersistedMerit | null> => {
    const { supabase, userId } = context;

    if (data.subjectKind === "experience") {
      const { data: row, error } = await supabase
        .from("sp_experience_periods")
        .select("id, role_title, employer_name, assertion_level, lifecycle_state")
        .eq("id", data.subjectId)
        .eq("holder_user_id", userId)
        .maybeSingle();
      // Thrown, never swallowed into null: "we could not read it" and "it is
      // not there" are different sentences, and only one of them may be said
      // to somebody who has just saved their first professional record.
      if (error) throw new Error(error.message);
      if (!row) return null;
      const r = row as {
        id: string;
        role_title: string;
        employer_name: string;
        assertion_level: string;
        lifecycle_state: string;
      };
      return {
        id: r.id,
        kind: "experience",
        title: r.role_title,
        organisation: r.employer_name,
        assertionLevel: r.assertion_level,
        lifecycleState: r.lifecycle_state,
      };
    }

    const { data: row, error } = await supabase
      .from("sp_claims")
      .select("id, title, claimed_issuer_name, assertion_level, lifecycle_state")
      .eq("id", data.subjectId)
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const r = row as {
      id: string;
      title: string;
      claimed_issuer_name: string | null;
      assertion_level: string;
      lifecycle_state: string;
    };
    return {
      id: r.id,
      kind: "claim",
      title: r.title,
      organisation: r.claimed_issuer_name,
      assertionLevel: r.assertion_level,
      lifecycleState: r.lifecycle_state,
    };
  });
