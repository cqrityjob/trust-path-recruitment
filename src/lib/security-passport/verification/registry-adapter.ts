// Security Passport — checking a credential against an official register.
//
// ── WHY THIS IS AN INTERFACE WITH ONE IMPLEMENTATION ───────────────────
//
// The SIA publishes a register of licence holders. SIRA publishes a document
// verification portal. Both would let a verifier confirm, in seconds, that a
// licence number belongs to the person in front of them.
//
// Neither is integrated here, and the manual implementation below is the only
// one that exists. That is a deliberate stopping point, not an unfinished
// sprint:
//
//   * Automating requests against a public website is a decision about that
//     site's terms, its rate limits and its operator's expectations — not a
//     technical convenience. `rolh.services.sia.homeoffice.gov.uk` is a
//     service for people checking one licence, and scraping it at volume is
//     not what it is published for.
//   * `portal.sira.gov.ae` did not answer our own source monitor at all, so
//     any "integration" with it today would be an integration with a guess.
//
// So the shape is settled now, when it is cheap, and an automated provider
// becomes an added implementation rather than a rewrite of every call site.
// Enabling one requires a confirmed authorised technical route — an API, a
// documented bulk-check facility, or written permission — and nothing here
// should be read as suggesting that route exists yet.
//
// ── WHAT A CHECK RECORDS, AND WHAT IT MUST NOT ─────────────────────────
//
// A register check answers one narrow question: on this date, at this URL, did
// the official register show this credential as current? It records the
// answer, the source, the timestamp and who looked.
//
// It records NOTHING about why a licence was granted or refused. The SIA's
// decision rests on a criminal-record and suitability investigation; CQrityjob
// verifies the LICENCE, never the investigation behind it, and there is no
// field here in which such a thing could be written down.

import type { IsoDate } from "../types";

/** What the register said. Words, never a score, and never an inference.
 *
 *  `could_not_be_determined` is a first-class outcome rather than a failure:
 *  a register that is down, a number that returns nothing, and a page whose
 *  format changed are all cases where the honest answer is "we could not
 *  tell", and collapsing any of them into "not found" would assert something
 *  nobody checked. */
export type RegistryOutcome =
  | "shown_as_current"
  | "shown_as_not_current"
  | "not_found"
  | "could_not_be_determined";

export interface RegistryCheckRequest {
  readonly credentialCode: string;
  /** The licence or card number, exactly as printed. Private throughout: it
   *  is a lookup key into somebody else's register and never appears on a
   *  card, a social image or a disclosure. */
  readonly reference: string;
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
  /** Who is performing the check. Recorded so a result is attributable; a
   *  check nobody is accountable for is not a verification. */
  readonly verifierUserId: string;
  readonly checkedOn: IsoDate;
}

export interface RegistryCheckResult {
  readonly outcome: RegistryOutcome;
  /** The official page the check was made against. */
  readonly sourceUrl: string;
  readonly sourceKey: string;
  readonly checkedAt: string;
  readonly verifierUserId: string;
  /** How the check was made. Present so a reader can tell a human lookup from
   *  an automated one without inferring it from anything else. */
  readonly method: "manual_register_lookup" | "authorised_api";
  /** What the verifier observed, in their own words. Optional, bounded, and
   *  explicitly NOT a place for anything about the suitability investigation
   *  behind the licence. */
  readonly note: string | null;
}

export interface RegistryAdapter {
  readonly id: string;
  /** Whether this adapter can answer for a given credential at all. Asked
   *  rather than assumed, so an unsupported market gets "could not be
   *  determined" instead of a confident wrong answer. */
  supports(request: RegistryCheckRequest): boolean;
  check(request: RegistryCheckRequest): Promise<RegistryCheckResult>;
}

/** Where each market's register lives. The keys match the rows seeded into
 *  sp_regulatory_sources by 20260907090000, so a check and the source monitor
 *  are always talking about the same page. */
const REGISTERS: Readonly<Record<string, { sourceKey: string; url: string }>> = {
  GB: {
    sourceKey: "gb_sia_public_register",
    url: "https://rolh.services.sia.homeoffice.gov.uk/",
  },
  "AE-DU": {
    sourceKey: "ae_du_sira_portal",
    url: "https://portal.sira.gov.ae/web",
  },
};

function registerFor(request: RegistryCheckRequest) {
  return REGISTERS[request.subJurisdictionCode ?? request.jurisdictionCode] ?? null;
}

/**
 * The only adapter that exists: a human looked, and recorded what they saw.
 *
 * It performs no network request. `check` exists to give the manual path the
 * same shape as an automated one would have, so that adding a provider later
 * changes one registration rather than every caller — and so that a manual
 * result carries a source URL and a timestamp exactly as an automated one
 * would, rather than being a free-text note somebody typed.
 */
export function manualRegistryAdapter(
  observed: (request: RegistryCheckRequest) => { outcome: RegistryOutcome; note?: string },
): RegistryAdapter {
  return {
    id: "manual",
    supports: (request) => registerFor(request) !== null,
    async check(request) {
      const register = registerFor(request);

      // No register for this market means the honest answer is that we could
      // not tell — not "not found", which would read as a statement about the
      // credential rather than about our own reach.
      if (!register) {
        return {
          outcome: "could_not_be_determined",
          sourceUrl: "",
          sourceKey: "",
          checkedAt: new Date().toISOString(),
          verifierUserId: request.verifierUserId,
          method: "manual_register_lookup",
          note: null,
        };
      }

      const { outcome, note } = observed(request);
      return {
        outcome,
        sourceUrl: register.url,
        sourceKey: register.sourceKey,
        checkedAt: new Date().toISOString(),
        verifierUserId: request.verifierUserId,
        method: "manual_register_lookup",
        note: note?.trim() ? note.trim().slice(0, 500) : null,
      };
    },
  };
}

/**
 * Whether a register outcome may raise a claim to VERIFIED.
 *
 * Only one of the four does. `not_found` and `could_not_be_determined` are
 * explicitly NOT evidence of anything — a register that was unreachable says
 * nothing about the person — and treating either as a negative finding would
 * let an outage become an accusation.
 */
export function outcomeSupportsVerification(outcome: RegistryOutcome): boolean {
  return outcome === "shown_as_current";
}

/**
 * Whether an outcome is grounds for a human to look again.
 *
 * Separate from the question above on purpose: "somebody should check this"
 * and "this is verified" are different decisions, and a single boolean would
 * force them to share an answer.
 */
export function outcomeNeedsHumanReview(outcome: RegistryOutcome): boolean {
  return outcome !== "shown_as_current";
}
