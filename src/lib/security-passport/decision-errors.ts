// Security Passport — turning a database refusal into something a reviewer
// can act on, without telling them how the database is built.
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────
//
// `sp_verifier_decide` refuses for several genuinely different reasons, and
// the difference matters to the person holding the mouse:
//
//   * "you may not verify your own claim"     — never retry, find another reviewer
//   * "this request was already decided"      — reload, the work is done
//   * "an approval must state a method"       — fix one field
//   * "the validity period is the wrong way round" — fix two fields
//
// Showing one "try again" for all of them is what produced the reported
// defect report: a reviewer retried an action that could never succeed.
//
// ── WHY A CODE AND NOT THE MESSAGE ─────────────────────────────────────
//
// The raw error is a Postgres message. It can name constraints, functions and
// columns, and for the authorization refusals it describes the shape of the
// security model. None of that belongs in a browser. So the server classifies
// the raw text into one of the codes below, logs the raw text where operators
// can read it, and sends only the code. The browser turns the code into
// copy in the reader's language and knows nothing else.
//
// ── FAIL CLOSED ────────────────────────────────────────────────────────
//
// Anything unrecognised becomes `unknown`, which reads as a temporary failure
// and invites a retry. That is the safe direction: a new refusal the database
// learns tomorrow must not be narrated by guesswork here, and must never be
// presented as success.

export const DECISION_ERROR_CODES = [
  /** The caller is the holder. `SP_SELF_VERIFICATION_FORBIDDEN`. */
  "self_verification",
  /** The caller is not a verifier, or not a representative of that employer. */
  "not_authorised",
  /** Already approved, rejected or withdrawn — no second decision. */
  "already_decided",
  /** The request no longer exists. */
  "not_found",
  /** An approval was submitted without a verification method. */
  "method_required",
  /** An approval named a method the deciding party has no standing to use:
   *  a CQrityjob review recorded as an employer or issuer confirmation, an
   *  employer attestation recorded as anything but employer_confirmation, or
   *  issuer_confirmation anywhere -- `SP_ISSUER_CONFIRMATION_NOT_AVAILABLE`,
   *  `SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW`,
   *  `SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION` (20261029090000).
   *  Never retry as-is: the form no longer offers the combination, so reaching
   *  this means a stale bundle or a crafted call. */
  "method_not_permitted",
  /** A rejection or a clarification request was submitted with no
   *  candidate-facing reason.
   *
   *  A holder who is told "we could not verify this" and nothing else has
   *  been given an outcome they can neither act on nor argue with, which is
   *  the same as being told nothing. The reason is therefore mandatory in
   *  the reviewer form, in the server function, and in `sp_verifier_decide`
   *  itself — `SP_DECISION_REQUIRES_HOLDER_MESSAGE`.
   *
   *  Note that this is the CANDIDATE-facing `holder_message`. The internal
   *  `decision_note` stays optional and stays private; requiring one has
   *  nothing to do with the other. */
  "holder_message_required",
  /** Validity dates missing, out of order, or short of what the credential needs. */
  "invalid_validity",
  /** The credential taxonomy needs an issuing authority named. */
  "issuer_required",
  /** The entry moved (withdrawn, superseded, revoked) while the review was open. */
  "entry_not_active",
  /** Anything else. Fail closed: temporary, retryable, unexplained. */
  "unknown",
] as const;

export type DecisionErrorCode = (typeof DECISION_ERROR_CODES)[number];

/** Prefix on the Error the server function throws, so the browser can tell a
 *  classified domain refusal from a network or framework failure. */
export const DECISION_ERROR_PREFIX = "SP_DECISION:";

/** Ordered because the first match wins and some raw messages carry more than
 *  one marker — an authorization refusal that also mentions a constraint must
 *  classify as the refusal, not the constraint. */
const RULES: readonly { readonly needle: string; readonly code: DecisionErrorCode }[] = [
  { needle: "SP_SELF_VERIFICATION_FORBIDDEN", code: "self_verification" },
  { needle: "SP_NOT_VERIFIER", code: "not_authorised" },
  { needle: "SP_NOT_EMPLOYER_REPRESENTATIVE", code: "not_authorised" },
  // An employer attestation aimed at a credential rather than at employment.
  // Classified as "not authorised" rather than given a code of its own: it is
  // precisely a statement that this decider has no standing over this object,
  // which is what that copy already says. A reviewer cannot reach it from the
  // form — only a request that predates the constraint, or a crafted call, can
  // produce it — so a dedicated sentence would be copy nobody reads, and
  // falling through to `unknown` would invite a retry that can never succeed.
  { needle: "SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY", code: "not_authorised" },
  { needle: "SP_REQUEST_ALREADY_DECIDED", code: "already_decided" },
  { needle: "SP_REQUEST_NOT_FOUND", code: "not_found" },
  { needle: "SP_APPROVAL_REQUIRES_METHOD", code: "method_required" },
  { needle: "SP_ISSUER_CONFIRMATION_NOT_AVAILABLE", code: "method_not_permitted" },
  { needle: "SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW", code: "method_not_permitted" },
  {
    needle: "SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION",
    code: "method_not_permitted",
  },
  { needle: "SP_DECISION_REQUIRES_HOLDER_MESSAGE", code: "holder_message_required" },
  { needle: "SP_CREDENTIAL_REQUIRES_VALID_UNTIL", code: "invalid_validity" },
  { needle: "sp_claim_validity_ordered", code: "invalid_validity" },
  { needle: "SP_CREDENTIAL_REQUIRES_ISSUER", code: "issuer_required" },
  { needle: "SP_LIFECYCLE_TRANSITION_NOT_ALLOWED", code: "entry_not_active" },
  { needle: "SP_TRUST_FIELD_IMMUTABLE", code: "entry_not_active" },
];

/** Raw database or server message in, safe code out. Never throws. */
export function classifyDecisionError(raw: unknown): DecisionErrorCode {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  if (!text) return "unknown";
  const found = RULES.find((r) => text.includes(r.needle));
  return found ? found.code : "unknown";
}

/** Reads a code back off an Error thrown by the decision server function.
 *  Anything that is not one of ours — a fetch failure, a framework error —
 *  is `unknown`, which is the same fail-closed answer. */
export function decisionErrorCodeFrom(err: unknown): DecisionErrorCode {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const at = text.indexOf(DECISION_ERROR_PREFIX);
  if (at === -1) return "unknown";
  const tail = text.slice(at + DECISION_ERROR_PREFIX.length).trim();
  const code = tail.split(/[^a-z_]/)[0] as DecisionErrorCode;
  return (DECISION_ERROR_CODES as readonly string[]).includes(code) ? code : "unknown";
}
