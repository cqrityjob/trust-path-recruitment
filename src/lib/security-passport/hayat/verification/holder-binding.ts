// HAYAT — binding a credential to the account that submitted it.
//
// Both supported formats let the issuer say who a credential was issued to
// without publishing the address: a SHA-256 hash of the recipient's email,
// optionally salted. A verifier that already knows an address can test it.
//
// What that proves is narrow and is labelled as narrowly: the account's
// CONFIRMED email is the address the issuer issued to. That is control of an
// email address. It is not identity proofing, and a holder who registered with
// the issuer under a different address simply does not bind -- which HAYAT
// reports as a missing binding, never as a suspicion.

import { check, type Check } from "./model";

export interface RecipientIdentity {
  readonly hashed: boolean;
  /** "sha256$<hex>" when hashed, otherwise the address itself. */
  readonly identity: string;
  readonly salt: string | null;
}

export interface BindingAccount {
  readonly email: string | null;
  readonly emailConfirmed: boolean;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function emailBindingCheck(
  identities: readonly RecipientIdentity[],
  account: BindingAccount,
): Promise<Check> {
  if (identities.length === 0) return check("subject_binding", "unknown", "binding_not_present");
  if (!account.email || !account.emailConfirmed)
    return check("subject_binding", "unknown", "account_email_not_confirmed");
  // Issuers hash the address as they stored it; Credly documents lower case.
  const spellings = [...new Set([account.email.toLowerCase(), account.email])];
  for (const identity of identities) {
    if (!identity.hashed) {
      if (identity.identity.toLowerCase() === account.email.toLowerCase())
        return check("subject_binding", "passed", "ok");
      continue;
    }
    const [algorithm, expected] = identity.identity.split("$");
    if (algorithm !== "sha256" || !expected) continue;
    for (const spelling of spellings)
      if ((await sha256Hex(spelling + (identity.salt ?? ""))) === expected.toLowerCase())
        return check("subject_binding", "passed", "ok");
  }
  // Somebody else's credential, or the same person under another address.
  // HAYAT cannot tell which and says neither.
  return check("subject_binding", "failed", "binding_mismatch");
}
