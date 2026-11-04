// Security Passport — completing the /passport/start setup (BUG-04, app half).
//
// One call, through the holder's own session: `sp_passport_complete_setup`
// (20270323090000). The DATABASE decides everything that matters:
//
//   * the holder's declaration is required on every call, and `_declared` is
//     sent only when the holder ticked the box on this screen -- the validator
//     below accepts nothing but `declared: true`, so no caller can complete
//     without one and no code path can fill one in;
//   * at least one CURRENT Passport merit (an active Passport credential or an
//     active employment) is required;
//   * it is idempotent: a completed Passport is left exactly as it is, so a
//     double click, a retry or a stale tab completes nothing twice;
//   * the Passport number is assigned by sp_passport_number_on_complete_trg in
//     the same transaction. Nothing here computes, supplies or caches one; the
//     number shown afterwards is read back from sp_my_passport_number().
//
// ── A REFUSAL IS NOT A LOST RESPONSE ──────────────────────────────────
//
// The refusals below are raised before the function writes anything, so the
// screen may say what is missing. Anything else (a dropped connection, a 500)
// may have completed the Passport with the response lost on the way back, so
// the screen never says "nothing changed" for it: it reads the setup again
// and shows what the database now holds (see classifySetupCompletionFailure).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SetupCompletionRefusal = "declaration" | "noMerit" | "signedOut";
export type SetupCompletionFailure = SetupCompletionRefusal | "indeterminate";

/** The server's own refusal codes, each raised before any write. */
const REFUSALS: readonly (readonly [string, SetupCompletionRefusal])[] = [
  ["SP_DECLARATION_REQUIRED", "declaration"],
  ["SP_NO_CURRENT_MERIT", "noMerit"],
  ["SP_NOT_AUTHENTICATED", "signedOut"],
  ["SP_SESSION_REVOKED", "signedOut"],
  // requireSupabaseAuth's refusals: the request never reached the database.
  ["Unauthorized", "signedOut"],
];

export function classifySetupCompletionFailure(error: unknown): SetupCompletionFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const [code, kind] of REFUSALS) if (message.includes(code)) return kind;
  return "indeterminate";
}

// The number is NOT returned here. Reading it is a second call that can fail
// after the completion committed, and "no number" would then be a false
// statement about a numbered holder; the completed screen reads it through
// getMyPassportNumber, which says when it could not answer.
export const completePassportSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ declared: z.literal(true) })
      .strict()
      .parse(data),
  )
  .handler(async ({ context }): Promise<{ completed: true }> => {
    const { error } = await context.supabase.rpc("sp_passport_complete_setup", {
      _declared: true,
    });
    // The database's own code travels as the message, so the screen can tell
    // a refusal from a lost response.
    if (error) throw new Error(error.message);
    return { completed: true };
  });
