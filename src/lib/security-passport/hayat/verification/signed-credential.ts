// HAYAT — the first verification adapter: an Open Badges 3.0 credential secured
// as a compact JWS (the "VC-JWT" proof format), checked against pinned keys.
//
// ── WHY THIS FORMAT, AND ONLY THIS FORMAT ──────────────────────────────
//
// It is the one path that is demonstrably available without anybody's
// permission: the evidence is a signature, the verification is arithmetic, and
// the only thing that must be established out of band is the issuer's key.
// There is no API to be granted access to and no terms to breach.
//
// Verification uses `jose` over WebCrypto, which is what the deployed runtime
// (Cloudflare Workers) provides natively. Nothing cryptographic is written
// here: this file decides WHICH key and WHICH algorithm are acceptable and
// what the verified content means, and hands the mathematics to the library.
//
// Deliberately NOT supported, and reported as such rather than guessed at:
//
//   * embedded Data Integrity proofs (JSON-LD canonicalisation; the candidate
//     library is @digitalbazaar/vc, which needs a context loader -- a second
//     SSRF surface -- and is not installed until an issuer actually needs it);
//   * Blockcerts (no Blockcerts input exists);
//   * verifiable PRESENTATIONS. Holder binding here is the issuer's own
//     recipient identity matched to the account's confirmed email, so there is
//     no presentation to replay; wallet presentation with a nonce is later work.
//
// Everything in `credential` is attacker-controlled until the signature
// verifies, and the claim fields are holder-typed. Neither is trusted.

import { compactVerify, decodeJwt, decodeProtectedHeader, importJWK } from "jose";
import { check, decide, unevaluated, type Check, type CheckKey, type HayatDecision } from "./model";
import type { IssuerPolicy, SigningAlgorithm } from "./issuer-registry";
import { emailBindingCheck, type RecipientIdentity } from "./holder-binding";
import { safeFetchJson } from "./safe-fetch";

export const SIGNED_CREDENTIAL_ADAPTER = "ob3-vc-jwt/1";

export interface AssessmentInput {
  /** Untrusted: whatever was found baked into the uploaded image. */
  readonly credential: string;
  /** Untrusted: what the holder selected and typed. */
  readonly claim: {
    readonly definitionCode: string;
    readonly issuedOn: string | null;
    readonly validUntil: string | null;
  };
  /** Trusted: read from the authenticated session by the server, never sent. */
  readonly account: { readonly email: string | null; readonly emailConfirmed: boolean };
}

export interface AssessmentDeps {
  readonly registry: readonly IssuerPolicy[];
  readonly now: Date;
  readonly fetchImpl?: typeof fetch;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const day = (v: unknown): string | null => {
  const s = text(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const instant = (v: unknown): number | null => {
  const s = text(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : t;
};

const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ACCEPTED: readonly SigningAlgorithm[] = ["EdDSA", "ES256", "RS256"];

export async function assessSignedCredential(
  input: AssessmentInput,
  deps: AssessmentDeps,
): Promise<HayatDecision> {
  const checks = unevaluated();
  const set = (c: Check) => {
    checks[c.key as CheckKey] = c;
  };
  const finish = () =>
    decide(checks, {
      bindingLevel: "email_control",
      adapter: SIGNED_CREDENTIAL_ADAPTER,
      checkedAt: deps.now.toISOString(),
    });

  // ── Profile ──────────────────────────────────────────────────────────
  const raw = input.credential.trim();
  if (raw.startsWith("{")) {
    set(check("supported_profile", "failed", "data_integrity_proof_not_supported"));
    return finish();
  }
  if (!COMPACT_JWS.test(raw)) {
    set(check("supported_profile", "failed", "malformed_credential"));
    return finish();
  }
  let header: { alg?: string; kid?: string };
  let claimed: Json;
  try {
    header = decodeProtectedHeader(raw);
    const payload = decodeJwt(raw) as Json;
    claimed = isObject(payload.vc) ? payload.vc : payload;
  } catch {
    set(check("supported_profile", "failed", "malformed_credential"));
    return finish();
  }
  const types = asArray(claimed.type).filter((t): t is string => typeof t === "string");
  const isBadge =
    types.includes("VerifiableCredential") &&
    (types.includes("OpenBadgeCredential") || types.includes("AchievementCredential"));
  if (!isBadge) {
    set(check("supported_profile", "failed", "profile_not_supported"));
    return finish();
  }
  set(check("supported_profile", "passed", "ok"));

  // ── Issuer: chosen by the registry, keyed by the id the credential names.
  // Naming an approved issuer proves nothing yet; the signature below is what
  // ties the content to that issuer's pinned key.
  const issuerId =
    text(claimed.issuer) ?? (isObject(claimed.issuer) ? text(claimed.issuer.id) : null);
  const policy = issuerId ? deps.registry.find((p) => p.issuerId === issuerId) : undefined;
  if (!policy) {
    set(check("approved_issuer_for_claim_type", "failed", "issuer_not_trusted"));
    return finish();
  }

  // ── Signature ────────────────────────────────────────────────────────
  const algorithms = policy.algorithms.filter((a) => ACCEPTED.includes(a));
  const key = policy.keys.find((k) => k.kid === header.kid);
  if (!key || !header.alg || !algorithms.includes(header.alg as SigningAlgorithm)) {
    set(check("authoritative_evidence", "failed", "signing_key_not_trusted"));
    return finish();
  }
  let credential: Json;
  try {
    const verified = await compactVerify(raw, await importJWK(key, header.alg), { algorithms });
    const payload = JSON.parse(new TextDecoder().decode(verified.payload)) as Json;
    if (text(payload.iss) && payload.iss !== policy.issuerId) throw new Error("iss");
    credential = isObject(payload.vc) ? payload.vc : payload;
  } catch {
    set(check("authoritative_evidence", "failed", "signature_invalid"));
    return finish();
  }
  set(check("authoritative_evidence", "passed", "ok"));

  // From here on `credential` is what the issuer actually signed.

  // ── Scope: is this issuer authorised for THIS credential type?
  const subject = isObject(credential.credentialSubject) ? credential.credentialSubject : {};
  const achievementId = isObject(subject.achievement) ? text(subject.achievement.id) : null;
  const permitted = policy.achievements[input.claim.definitionCode] ?? [];
  set(
    achievementId && permitted.includes(achievementId)
      ? check("approved_issuer_for_claim_type", "passed", "ok")
      : check("approved_issuer_for_claim_type", "failed", "issuer_not_authorised_for_type"),
  );

  // ── Claim vs evidence: only fields the holder actually stated.
  const issued =
    day(credential.validFrom) ?? day(credential.issuanceDate) ?? day(credential.awardedDate);
  const until = day(credential.validUntil) ?? day(credential.expirationDate);
  const disagrees =
    (input.claim.issuedOn !== null && input.claim.issuedOn !== issued) ||
    (input.claim.validUntil !== null && input.claim.validUntil !== until);
  set(
    disagrees
      ? check("claim_matches_evidence", "failed", "claim_field_mismatch")
      : check("claim_matches_evidence", "passed", "ok"),
  );

  // ── Holder binding: the issuer's recipient identity vs the confirmed account email.
  set(await bindingCheck(subject, input.account));

  // ── Validity
  const now = deps.now.getTime();
  const from = instant(credential.validFrom) ?? instant(credential.issuanceDate);
  const to = instant(credential.validUntil) ?? instant(credential.expirationDate);
  if (from !== null && from > now) set(check("validity", "failed", "not_yet_valid"));
  else if (to !== null && to <= now) set(check("validity", "failed", "expired"));
  else set(check("validity", "passed", "ok"));

  // ── Revocation
  set(await revocationCheck(credential, policy, deps.fetchImpl));

  // The evidence was evaluated just now; ageing is `ageDecision`'s business.
  set(check("freshness", "passed", "ok"));
  return finish();
}

async function bindingCheck(subject: Json, account: AssessmentInput["account"]): Promise<Check> {
  const identities: RecipientIdentity[] = asArray(subject.identifier)
    .filter(isObject)
    .filter((i) => String(i.identityType ?? "").toLowerCase() === "emailaddress")
    .flatMap((i) => {
      const identity = text(i.identityHash);
      return identity ? [{ hashed: i.hashed === true, identity, salt: text(i.salt) }] : [];
    });
  return emailBindingCheck(identities, account);
}

async function revocationCheck(
  credential: Json,
  policy: IssuerPolicy,
  fetchImpl: typeof fetch | undefined,
): Promise<Check> {
  const status = asArray(credential.credentialStatus).filter(isObject)[0];
  if (!status)
    return policy.revocation === "not_offered_accepted"
      ? check("revocation", "not_applicable", "status_not_offered_accepted_by_policy")
      : check("revocation", "unknown", "status_not_offered");
  if (status.type !== "1EdTechRevocationList")
    return check("revocation", "unknown", "status_type_not_supported");
  const url = text(status.id);
  if (!url) return check("revocation", "unknown", "status_type_not_supported");

  // Two attempts, then an honest "unavailable". Never an unbounded retry.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await safeFetchJson(url, { allowedHosts: policy.statusHosts, fetchImpl });
    if (!result.ok && result.kind === "refused")
      return check("revocation", "unknown", "status_source_not_allowed");
    if (!result.ok) continue;
    const list = isObject(result.body) ? result.body.revokedCredentials : undefined;
    if (!Array.isArray(list)) continue;
    const revoked = list.some(
      (entry) => entry === credential.id || (isObject(entry) && entry.id === credential.id),
    );
    return revoked ? check("revocation", "failed", "revoked") : check("revocation", "passed", "ok");
  }
  return check("revocation", "unknown", "status_source_unavailable");
}
