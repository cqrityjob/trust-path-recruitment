// A likely duplicate, said BEFORE a second record is made.
//
// Launch testing found two VU1 records on one account: the holder had simply
// added the same course twice, and nothing on the way told them they already
// had it. Two records of one credential split its evidence, its review and its
// history in two, and a reviewer then decides on half of the picture.
//
// This only WARNS. Two records with one catalogue code can be right — a
// renewed appointment with a new number, a second certificate from another
// sitting — so nothing is refused, merged or deleted: the holder is shown what
// they already have, offered the existing record, and may still register a
// separate one once they say that is what it is.

import type { Claim, LifecycleState } from "./types";
import { isPassportCredential } from "./credential-passport";

export interface ExistingCredential {
  readonly id: string;
  readonly code: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly lifecycleState: LifecycleState;
}

/** Records that no longer stand on the Passport: an archived (revoked) or a
 *  replaced (superseded) version is history, not a second copy. */
const NOT_STANDING: ReadonlySet<LifecycleState> = new Set(["revoked", "superseded"]);

/** The holder's standing credentials, in the shape the form compares against. */
export function existingCredentialsOf(claims: readonly Claim[]): ExistingCredential[] {
  return claims
    .filter(
      (c) => isPassportCredential(c) && c.credentialCode && !NOT_STANDING.has(c.lifecycleState),
    )
    .map((c) => ({
      id: c.id,
      code: c.credentialCode as string,
      titleSv: c.titleSv,
      titleEn: c.titleEn || c.titleSv,
      issuedOn: c.issuedOn,
      validUntil: c.validUntil,
      lifecycleState: c.lifecycleState,
    }));
}

/** The standing records of the same catalogue credential, if any. */
export function likelyDuplicatesOf(
  existing: readonly ExistingCredential[],
  code: string | null | undefined,
): ExistingCredential[] {
  if (!code) return [];
  return existing.filter((e) => e.code === code);
}
