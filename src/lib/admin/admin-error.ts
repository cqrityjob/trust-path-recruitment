// The Admin Portal's error contract.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// An admin cancelled a test assignment and the dialog answered:
//
//     ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED
//
// That string is not a message. It is an internal constant, and it was reached
// by mapping one SQLSTATE -- 23514, check_violation -- onto one sentence, when
// five unrelated conditions inside admin_cancel_assessment_assignment() and the
// assessment_assignments table can all raise it. The admin could not tell "type
// a reason" from "this one is already finished", and neither could support.
//
// 20261028090000 fixed the database half: every refusal now names itself with a
// stable ADMIN_CANCEL_* identifier. This module is the other half. It turns
// whatever a server function threw into ONE of a closed set of codes, and each
// code has copy in Swedish and English.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// Nothing an admin reads may originate from the database, PostgREST, or a
// constant in this repository. Not a SQLSTATE, not a constraint name, not a
// SCREAMING_SNAKE identifier, not a stack. Those belong in logs.
//
// The one deliberate exception is `unknown_error`, whose copy ends with the
// unrecognised code -- so a person on a support call has something to quote.
// That is the same trade EmployerDecisionPanel already makes, and it exists
// because the first version of that panel threw the code away and a customer's
// failure became unrecoverable.
//
// ── HOW A CODE TRAVELS ──────────────────────────────────────────────────────
//
// Server functions throw AdminMutationError, which carries `code` as a property
// AND as its `message`. Both, deliberately: TanStack Start's serialization of a
// custom Error subclass across the server boundary is not something this
// contract should depend on, and `message` is known to survive it -- that is how
// the raw identifier reached a browser in the first place. adminErrorCode()
// reads the property first and falls back to parsing the message, so it is
// correct either way.
//
// Scope note: this PR wires the layer into the assignment cancellation path
// only. The remaining admin routes still render `e.message`; they are the
// second Admin Portal reliability PR, and scripts/admin-error-contract-check.ts
// carries the explicit list so the debt is counted rather than forgotten.

import type { TranslationKey } from "@/i18n/dictionaries";

/** The closed set of things the Admin Portal can tell a person went wrong.
 *
 *  Deliberately small. A code earns its place by leading to DIFFERENT ACTION --
 *  "type a reason" and "this cannot be cancelled any more" are two codes because
 *  the admin does two different things next. Two database refusals that call for
 *  the same response share one code. */
export const ADMIN_ERROR_CODES = [
  "cancellation_reason_required",
  "cancellation_reason_too_long",
  "assignment_not_cancellable",
  "assignment_state_inconsistent",
  "not_found",
  "permission_denied",
  "network_error",
  "unknown_error",
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

/** Copy for every code, in both languages. The guard script fails the build if
 *  a code is missing an entry here, or an entry is missing from either
 *  dictionary. */
export const ADMIN_ERROR_COPY: Record<AdminErrorCode, TranslationKey> = {
  cancellation_reason_required: "admin.actionError.cancellationReasonRequired",
  cancellation_reason_too_long: "admin.actionError.cancellationReasonTooLong",
  assignment_not_cancellable: "admin.actionError.assignmentNotCancellable",
  assignment_state_inconsistent: "admin.actionError.assignmentStateInconsistent",
  not_found: "admin.actionError.notFound",
  permission_denied: "admin.actionError.permissionDenied",
  network_error: "admin.actionError.networkError",
  unknown_error: "admin.actionError.unknown",
};

/** Every identifier a server function or RPC can put in front of an admin,
 *  mapped to what the admin is told.
 *
 *  Three generations of identifier are in here on purpose:
 *
 *    ADMIN_CANCEL_*   raised by admin_cancel_assessment_assignment() as of
 *                     20261028090000.
 *    ASSIGNMENT_*     thrown by the server function wrapper.
 *    the legacy pair  ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED and the
 *                     old un-prefixed shape.
 *
 *  The legacy entry is not dead weight. Lovable rebuilds from origin/main the
 *  moment this merges, and canonical migrations run when somebody applies them
 *  -- so there is a window in which this code is live against a database that
 *  still has the old function. In that window the old identifier is what
 *  arrives, and an admin must still get a sentence rather than a constant. It
 *  can be removed once 20261028090000 is recorded as applied. */
const CODE_MAP: Record<string, AdminErrorCode> = {
  // 20261028090000 — one identifier per condition.
  ADMIN_CANCEL_REASON_REQUIRED: "cancellation_reason_required",
  ADMIN_CANCEL_REASON_TOO_LONG: "cancellation_reason_too_long",
  ADMIN_CANCEL_NOT_CANCELLABLE: "assignment_not_cancellable",
  ADMIN_CANCEL_STATE_INCONSISTENT: "assignment_state_inconsistent",
  ADMIN_CANCEL_NOT_FOUND: "not_found",
  ADMIN_CANCEL_FORBIDDEN: "permission_denied",
  ADMIN_CANCEL_NOT_AUTHENTICATED: "permission_denied",

  // The server function wrapper's own vocabulary.
  ASSIGNMENT_NOT_FOUND: "not_found",
  ASSIGNMENT_LOAD_FAILED: "unknown_error",
  ASSIGNMENT_CANCEL_FAILED: "unknown_error",
  FORBIDDEN_ADMIN_REQUIRED: "permission_denied",
  FORBIDDEN: "permission_denied",
  ROLE_CHECK_FAILED: "permission_denied",

  // Pre-20261028090000 databases. See the note above before deleting.
  ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED: "assignment_not_cancellable",
};

/** A server-function failure carrying a code the client can act on.
 *
 *  `message` is set to the code and never to the database's wording. A thrown
 *  Error's message is the one thing guaranteed to cross the server boundary,
 *  and if it ever gets rendered directly by mistake, the worst case is a stable
 *  identifier rather than a row dump with a recipient's email in it. */
export class AdminMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdminMutationError";
  }
}

/** Server side: turn a PostgREST error into an AdminMutationError.
 *
 *  A recognised ADMIN_* identifier at the front of the message is deliberate
 *  wording from whoever raised it and is carried through. Anything else is an
 *  unexpected database error -- a constraint name, a SQLSTATE, a fragment of a
 *  row -- and is logged here and replaced, exactly as academy-employer's fail()
 *  does for the employer surfaces. */
export function adminFail(
  scope: string,
  error: { message?: string | null; code?: string | null } | null | undefined,
  fallback: string,
): AdminMutationError {
  const identifier = /\bADMIN_[A-Z_]+\b/.exec(error?.message ?? "");
  if (identifier) return new AdminMutationError(identifier[0]);
  console.error(`[${scope}] unexpected database error`, {
    sqlstate: error?.code ?? null,
    message: error?.message ?? null,
  });
  return new AdminMutationError(fallback);
}

/** Identifier-shaped and therefore safe to show.
 *
 *  `unknown_error`'s copy quotes `raw`, so `raw` is the one value in this module
 *  that reaches a browser unmapped -- and an unrecognised failure's message is
 *  exactly where a constraint name, a relation name or a DETAIL line containing
 *  the failing row (recipient email included) would be. Anything that is not a
 *  bare SCREAMING_SNAKE token is therefore not quoted; the full text goes to
 *  the console instead, where an engineer can read it and a support ticket
 *  cannot.
 *
 *  Caught by the render proof in scripts/admin-error-contract-check.tsx, which
 *  rendered a real constraint violation and found the whole row in the DOM. */
const QUOTABLE = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Client side: what should this person be told?
 *
 *  Returns the code AND a quotable identifier, because `unknown_error`'s copy
 *  names it. Never returns null -- an admin staring at a failed button always
 *  gets a sentence. */
export function adminErrorCode(error: unknown): { code: AdminErrorCode; raw: string } {
  const withCode = error as { code?: unknown; message?: unknown } | null;

  // The property first, the message second. Either may be the one that survived.
  const candidates = [withCode?.code, withCode?.message]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.trim());

  for (const candidate of candidates) {
    if (CODE_MAP[candidate]) return { code: CODE_MAP[candidate], raw: candidate };
    // A message that merely BEGINS with an identifier, for the case where a
    // refusal reaches the client without passing through adminFail().
    const identifier = /\b(ADMIN_[A-Z_]+|ASSIGNMENT_[A-Z_]+|FORBIDDEN[A-Z_]*)\b/.exec(candidate);
    if (identifier && CODE_MAP[identifier[0]]) {
      return { code: CODE_MAP[identifier[0]], raw: identifier[0] };
    }
  }

  // A fetch that never reached the server has no code and a browser-authored
  // message. Told apart because the admin's next move differs: retry, versus
  // report it.
  const message = candidates[0] ?? "";
  if (/network|fetch|failed to fetch|load failed/i.test(message)) {
    return { code: "network_error", raw: "NETWORK" };
  }

  // Unrecognised. The message is whatever the layer below produced, so it is
  // logged rather than quoted, and only an identifier-shaped token is passed on
  // for the copy to name.
  if (message && !QUOTABLE.test(message)) {
    console.error("[admin] unmapped action failure", message);
  }
  return {
    code: "unknown_error",
    raw: QUOTABLE.test(message) ? message : "UNMAPPED",
  };
}

/** The maximum cancellation reason length, in characters after trimming.
 *
 *  One number, three enforcement points: this constant bounds the textarea, the
 *  server function's zod schema, and admin_cancel_assessment_assignment()'s own
 *  `char_length(_clean_reason) > 2000`. The guard script asserts all three still
 *  agree -- before this, only the database knew, so an admin discovered the
 *  ceiling by having a long reason rejected with no explanation. */
export const CANCELLATION_REASON_MAX = 2000;

/** The statuses an assignment can be cancelled from.
 *
 *  Authoritative copy lives in the SQL; this is the frontend's mirror of it, so
 *  the button is not offered where the backend would refuse. The guard script
 *  asserts the two lists are identical, because nothing else would notice if
 *  they drifted. */
export const CANCELLABLE_ASSIGNMENT_STATUSES = ["invited", "opened", "started"] as const;
