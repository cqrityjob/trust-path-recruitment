// Security Passport — the first run's server calls.
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
// ── FOUR CALLS ────────────────────────────────────────────────────────
//
//   ensureFirstRunPassport  the Passport and its creation receipt, in one
//                           database transaction. Idempotent, concurrent-safe,
//                           and it repairs a legacy profile with no receipt.
//
//   saveFirstRunDraft       the debounced autosave, and the whole of "Save and
//                           exit". Carries a REVISION, and the database
//                           refuses a stale one and refuses to reopen a
//                           completed onboarding.
//
//   completeFirstMerit      the one atomic operation, in the database.
//
//   readBackFirstMerit      the exact subject, by id, read as a separate
//                           request AFTER the write, with every fact the form
//                           submitted. The browser compares and decides.
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
import {
  DRAFT_COMPLETED,
  DRAFT_NO_PASSPORT,
  DRAFT_STALE,
  FIRST_MERIT_KINDS,
  type PersistedMerit,
} from "./first-run";
import { PASSPORT_QUESTION_VERSION } from "./passport.functions";

/* ------------------------------------------------------------------ */
/* The Passport                                                        */
/* ------------------------------------------------------------------ */

export interface EnsurePassportResult {
  readonly created: boolean;
  /** True when a legacy profile that had no creation receipt was repaired.
   *  Surfaced rather than swallowed: it is the honest answer to "did anything
   *  happen", and it is the state a support question would turn on. */
  readonly repaired: boolean;
}

/**
 * Create the caller's Passport, atomically with its creation receipt.
 *
 * This used to be an upsert followed by a SEPARATE event insert. If the second
 * failed, the profile survived — and every retry saw a profile and repaired
 * nothing, leaving an account whose Passport existed with no record of when or
 * by whom it was created. Both writes are now one database transaction.
 */
export const ensureFirstRunPassport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnsurePassportResult> => {
    const { supabase } = context;

    const { data, error } = await supabase.rpc("sp_passport_ensure", {
      _question_version: PASSPORT_QUESTION_VERSION,
    } as never);
    if (error) throw new Error(error.message);

    const row = (data as unknown as readonly { created: boolean; repaired: boolean }[] | null)?.[0];
    // An answer with no row is not a success. The function always returns one.
    if (!row) throw new Error("SP_PASSPORT_ENSURE_NO_RESULT");
    return { created: Boolean(row.created), repaired: Boolean(row.repaired) };
  });

/* ------------------------------------------------------------------ */
/* The draft                                                           */
/* ------------------------------------------------------------------ */

const draftInput = z.object({
  step: z.number().int().min(0).max(10),
  answers: z.record(z.string(), z.string().max(400)),
  /** Strictly increasing per save. The database refuses anything that is not
   *  greater than what it already holds, which is what makes two saves in
   *  flight land in order. */
  revision: z.number().int().min(1).max(1_000_000),
});

export interface DraftSaveResult {
  readonly savedAt: string;
  readonly revision: number;
}

/**
 * Autosave, and the whole of "Save and exit".
 *
 * ── ORDERED, BECAUSE THE NETWORK IS NOT ────────────────────────────────
 *
 * The write is ONE conditional UPDATE:
 *
 *   SET  onboarding_answers = …, onboarding_draft_revision = :revision
 *   WHERE holder_user_id = me
 *     AND onboarding_draft_revision < :revision
 *     AND onboarding_state <> 'completed'
 *
 * so the comparison and the write cannot be separated. Save A with older
 * answers arriving after save B with newer ones matches nothing and changes
 * nothing; and a save still in flight when a completion commits cannot put a
 * finished Passport back into `in_progress`. A React-side queue cannot give
 * either guarantee, because two tabs are two Reacts.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ────────────────────────────────
 *
 * `declared_accurate_at` and `onboarding_state = 'completed'`. A draft is an
 * unfinished answer, and the previous implementation's real defect was that
 * "Save and exit" and "Finish" were the SAME function call — so leaving the
 * flow recorded a truthfulness declaration and closed onboarding on a Passport
 * with nothing in it.
 */
export const saveFirstRunDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => draftInput.parse(data))
  .handler(async ({ context, data }): Promise<DraftSaveResult> => {
    const { supabase, userId } = context;

    type ProfileUpdate = Database["public"]["Tables"]["sp_passport_profiles"]["Update"];
    const patch: ProfileUpdate = {
      onboarding_step: data.step,
      onboarding_answers: data.answers,
      onboarding_state: "in_progress",
      onboarding_draft_revision: data.revision,
      question_version: PASSPORT_QUESTION_VERSION,
    };

    const { data: row, error } = await supabase
      .from("sp_passport_profiles")
      .update(patch)
      .eq("holder_user_id", userId)
      .lt("onboarding_draft_revision", data.revision)
      .neq("onboarding_state", "completed")
      .select("updated_at, onboarding_draft_revision")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (row) {
      const saved = row as { updated_at: string; onboarding_draft_revision: number };
      return { savedAt: saved.updated_at, revision: saved.onboarding_draft_revision };
    }

    // ── NOTHING MATCHED. WHICH RULE REFUSED? ─────────────────────────
    //
    // "The update affected no rows" is three different situations, and the
    // caller has to tell them apart: a Passport that does not exist yet, a
    // holder who finished in another tab, and a stale save that has been
    // overtaken. Only the first is an error worth showing.
    const { data: current, error: readError } = await supabase
      .from("sp_passport_profiles")
      .select("onboarding_state, onboarding_draft_revision")
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    if (!current) throw new Error(DRAFT_NO_PASSPORT);
    const state = current as { onboarding_state: string; onboarding_draft_revision: number };
    if (state.onboarding_state === "completed") throw new Error(DRAFT_COMPLETED);
    throw new Error(`${DRAFT_STALE}:${state.onboarding_draft_revision}`);
  });

/* ------------------------------------------------------------------ */
/* The completion                                                      */
/* ------------------------------------------------------------------ */

const completionInput = z
  .object({
    /** Minted by the browser and PERSISTED into the draft BEFORE the first
     *  attempt, so a refresh, a retry and a second tab all carry the same
     *  key. Never regenerated because a response was lost. */
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
 * rule — the declaration, the required values, the country, idempotency
 * against a record no client can write, the audit events, the onboarding
 * transition, and the refusal to mint a SECOND first merit — is enforced
 * inside a single database transaction, where a partial failure is impossible.
 * A TypeScript function cannot offer that: it can only make four requests and
 * hope.
 *
 * Retrying with the SAME operation id is the reconciliation path. It is safe by
 * construction: the server proves the operation is the caller's, carries the
 * same fingerprint of the same facts, and points at a subject that still
 * exists and still belongs to them, before answering.
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
 * EVERY fact the form can submit comes back, because every one of them is a
 * fact the confirmation screen implicitly vouches for. The first version
 * returned the identity and the trust columns only, so a merit stored with the
 * wrong country or the wrong start date still rendered "your merit is saved".
 *
 * Scoped by RLS to the caller and filtered on `holder_user_id` as well, so a
 * guessed id answers `null` rather than somebody else's row.
 *
 * `null` means "no such row for you". It does NOT mean the save failed — the
 * caller distinguishes a null answer from a thrown one, and treats a thrown
 * one as unknown. See `checkReadback` in first-run.ts, which is where those
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
        .select(
          "id, role_title, employer_name, jurisdiction_code, started_on, ended_on, assertion_level, lifecycle_state",
        )
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
        jurisdiction_code: string | null;
        started_on: string | null;
        ended_on: string | null;
        assertion_level: string;
        lifecycle_state: string;
      };
      return {
        id: r.id,
        kind: "experience",
        title: r.role_title,
        organisation: r.employer_name,
        country: r.jurisdiction_code,
        startedOn: r.started_on,
        endedOn: r.ended_on,
        assertionLevel: r.assertion_level,
        lifecycleState: r.lifecycle_state,
      };
    }

    const { data: row, error } = await supabase
      .from("sp_claims")
      .select(
        "id, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_until, assertion_level, lifecycle_state",
      )
      .eq("id", data.subjectId)
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const r = row as {
      id: string;
      title: string;
      claimed_issuer_name: string | null;
      jurisdiction_code: string | null;
      issued_on: string | null;
      valid_until: string | null;
      assertion_level: string;
      lifecycle_state: string;
    };
    return {
      id: r.id,
      kind: "claim",
      title: r.title,
      organisation: r.claimed_issuer_name,
      // A first-run claim is written with no country at all. Reading it back
      // proves that, rather than assuming it.
      country: r.jurisdiction_code,
      startedOn: r.issued_on,
      endedOn: r.valid_until,
      assertionLevel: r.assertion_level,
      lifecycleState: r.lifecycle_state,
    };
  });
