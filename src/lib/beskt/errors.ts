// Turning a governed database refusal into something a person can act on.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// Every BESKT mutation is a `SECURITY DEFINER` RPC that refuses by raising,
// and it raises with a machine code and an operator-facing sentence:
//
//   BCP_STALE_REVISION: the draft is at revision 4 but the request expected
//   revision 3. Reload and retry.
//
// That text is written for whoever is reading the database log. Putting it on
// a candidate's screen is wrong twice over. It is not a sentence they can act
// on -- "revision" is our word, not theirs -- and it leaks the shape of the
// schema: table names, policy names, column names, and in the worst case a
// Postgres error with a query fragment in it.
//
// So the rule here is simple and absolute: the screen shows OUR sentence,
// chosen by code, in the reader's own language. The original never reaches
// the DOM.
//
// ── WHAT IS AND IS NOT LEAKED ───────────────────────────────────────────
//
// The CODE is ours: we wrote it, it names a governed refusal, and it appears
// in the migration this repository reviews. Mapping it to a sentence tells the
// reader what happened and nothing about how the database is built. The
// MESSAGE after the colon is the part that can carry identifiers, so it is
// dropped on the floor for display and kept only where the project's own
// logging rules already allow an operator to see it.
//
// An unrecognised failure -- a network error, a Postgres error we never
// raised, a bug -- gets the generic sentence. That is deliberate: a failure we
// did not anticipate is exactly the one whose text we cannot vouch for.

import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * Every governed refusal the candidate or employer surfaces can actually
 * reach, mapped to the sentence we are willing to show.
 *
 * Codes the UI cannot provoke are deliberately absent rather than mapped to a
 * guess: `BCP_PROOF` is a migration-time assertion, `BCP_APPEND_ONLY` and the
 * `*_IMMUTABLE` family are trigger invariants that fire only against a direct
 * table write, which no client can make. If one of those ever did surface it
 * would mean something is wrong that a reassuring sentence should not paper
 * over, and the generic text is the honest answer.
 */
const MESSAGE_FOR_CODE: Readonly<Record<string, TranslationKey>> = {
  // ---- The draft moved under the candidate --------------------------------
  BCP_STALE_REVISION: "beskt.error.staleRevision",
  BCP_REVISION_REQUIRED: "beskt.error.staleRevision",
  BCP_RESPONSE_REVISION: "beskt.error.staleRevision",
  BCP_ASSIGNMENT_REVISION: "beskt.error.staleRevision",

  // ---- Submission ----------------------------------------------------------
  BCP_INCOMPLETE: "beskt.error.incomplete",
  BCP_ANSWER_INCOMPLETE: "beskt.error.incomplete",
  BCP_ALREADY_SUBMITTED: "beskt.error.alreadySubmitted",
  BCP_ANSWER_FROZEN: "beskt.error.alreadySubmitted",
  BCP_NO_OPEN_DRAFT: "beskt.error.alreadySubmitted",

  // ---- The notice ----------------------------------------------------------
  BCP_NOTICE_NOT_ACKNOWLEDGED: "beskt.error.noticeNotAcknowledged",
  BCP_NOTICE_ALREADY_ACKNOWLEDGED: "beskt.error.noticeAlreadyAcknowledged",
  BCP_NOTICE_HASH_MISMATCH: "beskt.error.noticeMoved",
  BCP_NOTICE_VERSION_MISMATCH: "beskt.error.noticeMoved",
  BCP_NOTICE_VERSION_UNKNOWN: "beskt.error.noticeMoved",
  BCP_NOTICE_COPY_UNGOVERNED: "beskt.error.noticeMoved",
  BCP_NOTICE_LOCALE_UNSUPPORTED: "beskt.error.noticeLocale",

  // ---- The governed method moved or is not offerable ----------------------
  BCP_CONTENT_HASH_MISMATCH: "beskt.error.methodMoved",
  BCP_METHOD_CONTENT_MOVED: "beskt.error.methodMoved",
  BCP_METHOD_NOT_PUBLISHED: "beskt.error.methodUnavailable",
  BCP_METHOD_NOT_CANDIDATE_SAFE: "beskt.error.methodUnavailable",
  BCP_METHOD_VERSION_NOT_FOUND: "beskt.error.methodUnavailable",
  BCP_METHOD_MODE_NOT_PERMITTED: "beskt.error.methodUnavailable",
  BCP_PROFILE_MODE_NOT_PERMITTED: "beskt.error.methodUnavailable",
  BCP_PROFILE_NOT_IN_VERSION: "beskt.error.profileNotInMethod",
  BCP_NOT_ASSIGNABLE: "beskt.error.notAssignable",

  // ---- Starting from an application ---------------------------------------
  BCP_ASSIGNMENT_EXISTS: "beskt.error.assignmentExists",
  BCP_APPLICATION_NOT_FOUND: "beskt.error.applicationNotFound",
  BCP_APPLICATION_WITHDRAWN: "beskt.error.applicationWithdrawn",
  BCP_CANDIDATE_UNKNOWN: "beskt.error.applicationNotFound",
  BCP_EMPLOYER_NOT_FOUND: "beskt.error.notAuthorised",
  BCP_EMPLOYER_NOT_ACTIVE: "beskt.error.employerNotActive",
  BCP_CROSS_TENANT_JOB: "beskt.error.notAuthorised",

  // ---- Cancellation --------------------------------------------------------
  BCP_ASSIGNMENT_CANCELLED: "beskt.error.assignmentCancelled",
  BCP_ASSIGNMENT_TRANSITION: "beskt.error.cannotCancelNow",
  BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE: "beskt.error.cannotCancelNow",

  // ---- Access --------------------------------------------------------------
  BCP_NOT_AUTHORISED: "beskt.error.notAuthorised",
  BCP_NOT_CANDIDATE: "beskt.error.notAuthorised",
  BCP_NOT_EMPLOYER_MEMBER: "beskt.error.notAuthorised",
  BCP_NOT_PLATFORM_ADMIN: "beskt.error.notAuthorised",
  BCP_NOT_AUTHENTICATED: "beskt.error.notAuthenticated",
  BCP_ASSIGNMENT_NOT_FOUND: "beskt.error.assignmentNotFound",
  BCP_NOT_AVAILABLE_YET: "beskt.error.notAvailableYet",

  // ---- An answer the governed content does not admit -----------------------
  BCP_ITEM_NOT_VISIBLE: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_IN_VERSION: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_IN_PROFILE: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_PERMITTED: "beskt.error.itemNotVisible",
  BCP_ITEM_NOT_CANDIDATE_PHASE: "beskt.error.itemNotVisible",
  BCP_OPTION_NOT_IN_ITEM: "beskt.error.optionNotInItem",
  BCP_ORAL_NOT_ALLOWED: "beskt.error.oralNotAllowed",
  BCP_ANSWER_STATE_UNKNOWN: "beskt.error.answerRejected",
  BCP_ANSWERS_NOT_STRUCTURED: "beskt.error.answerRejected",

  // ---- Idempotency ---------------------------------------------------------
  BCP_OPERATION_PAYLOAD_MISMATCH: "beskt.error.operationConflict",
  BCP_OPERATION_ACTOR_MISMATCH: "beskt.error.operationConflict",
  BCP_OPERATION_ID_REQUIRED: "beskt.error.operationConflict",
};

/** What the reader is told when we do not recognise the failure. */
export const BESKT_GENERIC_ERROR: TranslationKey = "beskt.error.generic";

/**
 * The governed code at the head of a raised message, if there is one.
 *
 * PostgREST wraps the raise, so the code can arrive anywhere in the string
 * rather than only at position 0 -- `bcp_submit` refusing through a server
 * function reaches the browser as a message that has already been through two
 * layers. Matching the token anywhere is therefore correct; requiring it at
 * the start silently fell through to the generic text for every real refusal.
 */
export function besktErrorCode(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = /\bBCP_[A-Z_]+\b/.exec(raw);
  return m ? m[0] : null;
}

/**
 * The translation key to SHOW for a failure. Never the original text.
 *
 * Returns the generic key for anything unrecognised, which includes every
 * network failure and every error we did not raise ourselves.
 */
export function besktErrorKey(error: unknown): TranslationKey {
  const code = besktErrorCode(error);
  if (code === null) return BESKT_GENERIC_ERROR;
  return MESSAGE_FOR_CODE[code] ?? BESKT_GENERIC_ERROR;
}

/** The codes this module claims to translate — the guard reads this. */
export const BESKT_TRANSLATED_CODES: readonly string[] = Object.keys(MESSAGE_FOR_CODE);
