// HAYAT — the verification model: separate checks, one deterministic rule.
//
// ── NO AVERAGES ────────────────────────────────────────────────────────
//
// Each check below answers one question and answers it on its own. There is no
// score, and no check can buy back another: a perfect signature from an issuer
// nobody approved is not "mostly verified", and a trusted source that cannot
// say whose credential it is has verified a credential, not a person's claim
// to it.
//
// ── UNKNOWN IS NOT PASSED ──────────────────────────────────────────────
//
// `unknown` means nobody looked, or the thing that was asked did not answer.
// It never rounds up. In particular a status source that is missing or silent
// is `unknown`, never "not revoked".
//
// ── WHAT IS NOT AN INPUT ───────────────────────────────────────────────
//
// OCR output, holder edits, model confidence, how the document looks, and any
// flag a browser sends. None of them appears in `HayatChecks`, so none of them
// can move the result. The rule is pure and runs only on the server.

export type CheckResult = "passed" | "failed" | "unknown" | "not_applicable";

export type CheckKey =
  | "supported_profile" // a format HAYAT can actually verify
  | "approved_issuer_for_claim_type" // H: trusted issuer, authorised for THIS credential
  | "authoritative_evidence" // A: signature or original record checks out
  | "claim_matches_evidence" // A: what the holder claimed is what the evidence says
  | "subject_binding" // Y: the credential belongs to this account
  | "validity" // A: dates
  | "revocation" // A: status, where the issuer offers one
  | "freshness"; // A: the evidence is recent enough under the issuer's policy

export const CHECK_KEYS: readonly CheckKey[] = [
  "supported_profile",
  "approved_issuer_for_claim_type",
  "authoritative_evidence",
  "claim_matches_evidence",
  "subject_binding",
  "validity",
  "revocation",
  "freshness",
];

/** Stable, machine-readable reasons. The UI maps them to words; nothing else
 *  about a check is ever shown or logged. */
export type ReasonCode =
  | "ok"
  | "no_verifiable_source" // an uploaded document with no signed credential in it
  | "profile_not_supported"
  | "data_integrity_proof_not_supported"
  | "malformed_credential"
  | "issuer_not_trusted"
  | "issuer_not_authorised_for_type"
  | "signature_invalid"
  | "signing_key_not_trusted"
  | "claim_field_mismatch"
  | "binding_not_present"
  | "binding_mismatch"
  | "account_email_not_confirmed"
  | "not_yet_valid"
  | "expired"
  | "revoked"
  | "status_not_offered_accepted_by_policy"
  | "status_not_offered"
  | "status_type_not_supported"
  | "status_source_not_allowed"
  | "status_source_unavailable"
  | "evidence_too_old"
  | "not_evaluated";

export interface Check {
  readonly key: CheckKey;
  readonly result: CheckResult;
  readonly reason: ReasonCode;
}

export type HayatChecks = Readonly<Record<CheckKey, Check>>;

/** What Passport shows. One row per line of the specification's result table. */
export type HayatStatus =
  | "verified"
  | "source_verified_binding_missing"
  | "action_needed"
  | "cannot_verify_automatically"
  | "temporarily_unavailable"
  | "mismatch"
  | "expired"
  | "revoked"
  | "recheck_needed";

/** How far the credential-to-account link actually got. Email control is
 *  control of an address. It is not identity proofing, and is never shown as it. */
export type BindingLevel = "none" | "email_control";

export interface HayatDecision {
  readonly status: HayatStatus;
  readonly checks: HayatChecks;
  /** The reasons that decided the status, most decisive first. */
  readonly reasons: readonly ReasonCode[];
  readonly bindingLevel: BindingLevel;
  /** True when the issuer offers no status source and its policy accepts that:
   *  the scope limitation the UI must state beside a positive result. */
  readonly revocationNotCovered: boolean;
  readonly ruleVersion: string;
  readonly adapter: string | null;
  readonly checkedAt: string;
}

export const HAYAT_RULE_VERSION = "hayat-rules/1";

export const check = (key: CheckKey, result: CheckResult, reason: ReasonCode): Check => ({
  key,
  result,
  reason,
});

/** Every check starts here. A check nobody ran is unknown, not passed. */
export function unevaluated(): Record<CheckKey, Check> {
  const out = {} as Record<CheckKey, Check>;
  for (const key of CHECK_KEYS) out[key] = check(key, "unknown", "not_evaluated");
  return out;
}

const ok = (c: Check) => c.result === "passed" || c.result === "not_applicable";

/**
 * The rule. Order is precedence: the first line that applies is the answer.
 *
 *   verified = every mandatory check passed (or is explicitly not applicable)
 *
 * `not_applicable` is only ever produced for `revocation` under an issuer
 * policy that documents and accepts the absence of a status source, and for
 * `claim_matches_evidence` fields the holder left empty.
 */
export function decide(
  checks: HayatChecks,
  meta: { bindingLevel: BindingLevel; adapter: string | null; checkedAt: string },
): HayatDecision {
  const because = (status: HayatStatus, ...keys: CheckKey[]): HayatDecision => ({
    status,
    checks,
    reasons: keys.map((k) => checks[k].reason),
    bindingLevel: checks.subject_binding.result === "passed" ? meta.bindingLevel : "none",
    revocationNotCovered: checks.revocation.result === "not_applicable",
    ruleVersion: HAYAT_RULE_VERSION,
    adapter: meta.adapter,
    checkedAt: meta.checkedAt,
  });
  const c = checks;

  if (!ok(c.supported_profile)) return because("cannot_verify_automatically", "supported_profile");
  // A broken signature stops everything after it: nothing in an altered
  // credential can be believed -- not its achievement, its dates or its status
  // pointer -- so it is answered before the issuer's scope is even considered.
  if (c.authoritative_evidence.result === "failed")
    return because("action_needed", "authoritative_evidence");
  if (!ok(c.approved_issuer_for_claim_type))
    return because("cannot_verify_automatically", "approved_issuer_for_claim_type");
  if (!ok(c.authoritative_evidence))
    return because("cannot_verify_automatically", "authoritative_evidence");

  if (c.revocation.result === "failed") return because("revoked", "revocation");
  if (c.validity.result === "failed")
    return because(c.validity.reason === "expired" ? "expired" : "action_needed", "validity");
  // An outage is an outage. It is not evidence about the credential.
  if (c.revocation.reason === "status_source_unavailable")
    return because("temporarily_unavailable", "revocation");
  if (c.claim_matches_evidence.result === "failed")
    return because("mismatch", "claim_matches_evidence");
  if (!ok(c.revocation)) return because("cannot_verify_automatically", "revocation");
  if (!ok(c.validity) || !ok(c.claim_matches_evidence))
    return because("action_needed", "validity", "claim_matches_evidence");
  if (!ok(c.subject_binding)) return because("source_verified_binding_missing", "subject_binding");
  if (c.freshness.result === "failed") return because("recheck_needed", "freshness");
  if (!ok(c.freshness)) return because("action_needed", "freshness");
  return because("verified", "authoritative_evidence");
}

/**
 * An uploaded PDF, scan or photograph with no signed credential inside it.
 *
 * This is the honest result for almost every document today, so it is a named
 * constant path rather than a special case buried in a caller: the document
 * was read, and nothing about it can be verified automatically. Looking
 * authentic is not evidence.
 */
export function unverifiableDocument(checkedAt: string): HayatDecision {
  const checks = unevaluated();
  checks.supported_profile = check("supported_profile", "failed", "no_verifiable_source");
  return decide(checks, { bindingLevel: "none", adapter: null, checkedAt });
}

/** A previously positive decision, looked at again later with no new evidence. */
export function ageDecision(
  previous: HayatDecision,
  now: Date,
  maxEvidenceAgeDays: number,
): HayatDecision {
  if (previous.status !== "verified") return previous;
  const ageDays = (now.getTime() - new Date(previous.checkedAt).getTime()) / 86_400_000;
  if (!(ageDays > maxEvidenceAgeDays)) return previous;
  const checks = {
    ...previous.checks,
    freshness: check("freshness", "failed", "evidence_too_old"),
  };
  return decide(checks, {
    bindingLevel: previous.bindingLevel,
    adapter: previous.adapter,
    checkedAt: previous.checkedAt,
  });
}
