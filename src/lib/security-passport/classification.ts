// Security Passport — the canonical classifier.
//
// ONE answer to "which section does this fact belong in", consumed by every
// surface that will ever have sections: the private Passport, the finite card,
// the share preview, the recipient view and any export. Pure, deterministic and
// free of React, Supabase and copy — so the server, the browser and a guard
// script all get the identical answer from the identical function.
//
// ══ WHY ONE CLASSIFIER AND NOT ONE PER SURFACE ═════════════════════════
//
// This product has already paid for the alternative. The Passport overview
// read every lifecycle row and My Career read `active` rows only, and both
// called the result "your merits": one holder, one label, two totals. The fix
// was `isCurrentMerit` — one predicate, every caller. This is the same fix at
// the next level up, before the card, the preview and the recipient page each
// grow their own opinion of what "international" means.
//
// ══ THE ORDER IS THE CONTRACT ══════════════════════════════════════════
//
// The buckets are tried in a fixed order and the FIRST match wins, so every
// row lands in exactly one. The order is not arbitrary — each rule is there
// because the rule below it would otherwise claim the row:
//
//   1. draft                  private work in progress. Never a card, never a
//                             recipient, never an export. First, because a
//                             draft CPP is still a draft.
//   2. historical             expired, revoked, superseded, disputed or
//                             withdrawn — plus `retired` and `challenged`,
//                             which the architecture names and the column's
//                             CHECK does not carry yet. Before every "current"
//                             rule, so a revoked licence can never be
//                             presented as a current-market credential.
//   3. NOT CURRENT            the fail-closed gate. Anything whose lifecycle
//                             state is neither draft nor historical nor the
//                             one CURRENT state lands in `other_self_declared`
//                             and is presented as nothing more. See below.
//   4. international          a CURRENT claim on a governed
//                             `global_professional` definition.
//   5. current market         a CURRENT claim on a governed
//                             `national_regulated` definition whose
//                             jurisdiction matches where the holder works.
//   6. other country          the same, from elsewhere, grouped by ITS OWN
//                             jurisdiction — never the holder's.
//   7. merit sections         education, training, membership, language,
//                             skill, document.
//   8. other self-declared    everything left. Legacy and free-text rows land
//                             here and are labelled as what they are.
//
// Eight RULES, eleven BUCKETS: rules 5 and 6 are one branch with two answers,
// and `merit sections` is six buckets chosen by claim type. `PassportBucket`
// lists all eleven and `EVERY_BUCKET` pins the count, because an earlier
// revision of this comment said "seven" and nothing failed when it was wrong.
//
// ══ THE LIFECYCLE GATE FAILS CLOSED ════════════════════════════════════
//
// Rule 3 is a trust boundary, and it is stated positively. `isCurrentMerit`
// in ./types is this repository's ONE definition of a current merit — the
// same predicate the Passport overview, My Career and the share policy use —
// and today it means exactly `active`, which is what `sp_claims`'s CHECK
// allows alongside draft, expired, revoked, superseded, disputed and
// withdrawn.
//
// The gate matters because this function is PURE and exported: it classifies
// whatever it is handed, and the database CHECK constrains only what the
// database stores. A future migration adding a state, a fixture, a test
// double, a share payload assembled elsewhere or a malformed row can all
// reach it with a string this file has never seen. Listing the states that
// are NOT current would let every one of those be presented as a current,
// governed, international credential — an unrecognised string is exactly the
// input an attacker or a bug supplies. So the rule is inverted: a claim is
// presented as current only when it SAYS it is current, and everything else
// is honestly labelled as self-declared rather than silently promoted.
//
// ══ WHAT IT REFUSES TO DO ══════════════════════════════════════════════
//
// It does not upgrade. A row reaches bucket 3 only because its DEFINITION
// declares `global_professional`; a free-text claim titled "CPP", "ASIS" or
// "CISSP" carries no credential code, declares no scope and falls to bucket 7
// where it belongs. There is no title matching, no abbreviation matching and
// no issuer-name matching anywhere in this file, and
// `scripts/passport-global-certification-check.ts` fails the build if any
// appears.
//
// It does not rewrite. Changing work country moves a row between buckets 4 and
// 5 and changes nothing stored: `classify` takes the work location as an
// argument and returns a bucket, and there is no setter in this module at all.
//
// It does not rank a holder's preference. `compareForHighlight` is a total
// order over BUCKET, then trust, then lifecycle recency, then the claim id, so
// the output is independent of the order the rows arrived in and a holder
// cannot push a weaker claim above a stronger one. Bucket comes FIRST — see
// `compareForHighlight`, which documents why and what the alternative would
// mean. An earlier revision of this comment omitted the bucket term and read
// as though trust led; the implementation has always compared bucket first.

import {
  isGlobalCertification,
  isNationalCredential,
  type ScopedCredentialDefinition,
} from "./certification-scope";
import { isRelevantToWorkLocation, type WorkLocation } from "./jurisdiction-relevance";
// The ONE definition of a current merit in this repository. Imported rather
// than restated: a second opinion about what "current" means is the exact
// defect `isCurrentMerit` was introduced to end.
import { isCurrentMerit } from "./types";

/** The seven buckets. Every classified row carries exactly one. */
export type PassportBucket =
  | "draft"
  | "historical"
  | "international_certification"
  | "current_market_credential"
  | "other_country_credential"
  | "education_and_training"
  | "membership"
  | "language"
  | "skill"
  | "document"
  | "other_self_declared";

/** Every bucket, exactly once, pinned so the count is checked rather than
 *  described. The comment above this module once said "seven buckets" while
 *  the union carried eleven, and nothing failed — a prose count that no test
 *  reads is a claim, not a fact. `EVERY_BUCKET` is what the executable suite
 *  asserts against, so adding a bucket without deciding whether it is
 *  disclosable is a build failure rather than a silent default. */
export const EVERY_BUCKET: readonly PassportBucket[] = [
  "draft",
  "historical",
  "international_certification",
  "current_market_credential",
  "other_country_credential",
  "education_and_training",
  "membership",
  "language",
  "skill",
  "document",
  "other_self_declared",
] as const;

/** The buckets a recipient or a card may ever see.
 *
 *  `draft` is absent and that is the whole list's reason for existing: a draft
 *  is the holder's unfinished private work, and a surface that could render one
 *  would publish something nobody finished saying. */
export const DISCLOSABLE_BUCKETS: readonly PassportBucket[] = [
  "historical",
  "international_certification",
  "current_market_credential",
  "other_country_credential",
  "education_and_training",
  "membership",
  "language",
  "skill",
  "document",
  "other_self_declared",
] as const;

export function isDisclosableBucket(bucket: PassportBucket): boolean {
  return DISCLOSABLE_BUCKETS.includes(bucket);
}

/**
 * The lifecycle states that make a fact historical rather than current.
 *
 * Named here rather than reusing `isArchivedMerit` verbatim because this list
 * is the classifier's contract and has to include the states the Passport does
 * not yet store — `retired` and `challenged` are in the product architecture
 * and not yet in the column's CHECK. Listing them now means the classifier does
 * not need editing on the day they arrive, and an unknown state still fails
 * closed into `other_self_declared` rather than into "current".
 */
const HISTORICAL_STATES: readonly string[] = [
  "expired",
  "revoked",
  "superseded",
  "retired",
  "challenged",
  // `disputed` is this schema's name for a challenged claim.
  "disputed",
  "withdrawn",
] as const;

export function isHistoricalState(state: string): boolean {
  return HISTORICAL_STATES.includes(state);
}

/** Which merit section a non-credential claim type belongs to. A table rather
 *  than a chain of ifs, so an unmapped claim type is `undefined` and falls
 *  through to `other_self_declared` instead of silently joining a section. */
const CLAIM_TYPE_BUCKET: Readonly<Record<string, PassportBucket>> = {
  education: "education_and_training",
  training: "education_and_training",
  professional_membership: "membership",
  language: "language",
  skill: "skill",
  specialisation: "skill",
  document: "document",
};

/** What the classifier needs from one claim.
 *
 *  Structural, and deliberately small. It takes no title, no issuer name and no
 *  evidence: a classifier that could read them could match on them, and every
 *  defect this module exists to prevent begins with a match on one. */
export interface ClassifiableClaim {
  readonly id: string;
  readonly claimType: string;
  readonly lifecycleState: string;
  readonly assertionLevel: string;
  /** Null for a free-text claim. A code alone classifies nothing — the
   *  DEFINITION it resolves to is what carries the scope. */
  readonly credentialCode: string | null;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  /** The governed definition this claim resolves to, or null when it resolves
   *  to none. NOT looked up here: the caller reads the catalogue once and hands
   *  it in, so this module stays pure and a missing definition is an explicit
   *  null rather than a silent fetch failure. */
  readonly definition: ScopedCredentialDefinition | null;
  /** Used only as the final, stable tie-breaker in `compareForHighlight`. */
  readonly issuedOn?: string | null;
}

export interface ClassifiedClaim<T extends ClassifiableClaim> {
  readonly claim: T;
  readonly bucket: PassportBucket;
  /** For `other_country_credential`, the credential's OWN jurisdiction — the
   *  key its group is titled by. Null for every other bucket, including
   *  `international_certification`: a portable certification has no country and
   *  must not be grouped under one. */
  readonly groupKey: string | null;
}

/**
 * Which bucket one claim belongs in, for one work location.
 *
 * `work` affects buckets 4 and 5 and nothing else. It is an argument rather
 * than a property of the claim precisely so that changing it cannot change the
 * claim: there is nowhere for a work country to be written to from here.
 */
export function classify<T extends ClassifiableClaim>(
  claim: T,
  work: WorkLocation,
): ClassifiedClaim<T> {
  // 1. A draft is private work in progress, whatever it is a draft OF.
  if (claim.lifecycleState === "draft") {
    return { claim, bucket: "draft", groupKey: null };
  }

  // 2. History, before anything can call itself current.
  if (isHistoricalState(claim.lifecycleState)) {
    return { claim, bucket: "historical", groupKey: null };
  }

  // 3. THE FAIL-CLOSED GATE. Everything below this line presents a claim as
  //    something a reader is entitled to rely on today, so nothing reaches it
  //    without SAYING it is current. An unrecognised, future or malformed
  //    lifecycle value is not evidence of currency, and treating it as one
  //    would let a single unexpected string promote a row into the
  //    international or current-market section.
  //
  //    It lands in `other_self_declared`: the honest "we have no governed
  //    statement about this" bucket. Deliberately not `historical`, which
  //    would assert the claim USED to be true, and deliberately not `draft`,
  //    which would both mislabel a finished claim as the holder's private
  //    work and — because `draft` is the one bucket outside
  //    `DISCLOSABLE_BUCKETS` — silently drop it from a share the holder
  //    believes is complete.
  if (!isCurrentMerit(claim.lifecycleState)) {
    return { claim, bucket: "other_self_declared", groupKey: null };
  }

  // 4. An international professional certification — because its DEFINITION
  //    says so. Not because it has no country: buckets below are full of
  //    things with no country.
  if (isGlobalCertification(claim.definition)) {
    return { claim, bucket: "international_certification", groupKey: null };
  }

  // 5 and 6. A REGULATED NATIONAL CREDENTIAL — again because its definition
  //    says so, and only then. A jurisdiction is provenance, not authority: a
  //    course taken in Sweden, a degree awarded in Sweden and a language
  //    learned in Sweden all carry `SE` and none of them is a credential the
  //    Swedish state granted. Testing `claim.jurisdictionCode` alone, as this
  //    branch once did, presented every one of them as a current-market
  //    regulated credential.
  //
  //    `isNationalCredential` reads the declared `national_regulated` scope
  //    and nothing else, so an UNDECLARED scope is neither global nor
  //    national and falls through to the factual sections below — the same
  //    direction of failure the scope module is built to fail in.
  //
  //    The jurisdiction is still required: a national credential with no
  //    jurisdiction has no heading to appear under, and inventing one from
  //    the holder's work country is the misrepresentation rules 5 and 6 exist
  //    to prevent. The database's `sp_credential_type_national_scope_bound`
  //    makes that combination unreachable through the catalogue; this is what
  //    happens if it ever arrives anyway.
  if (isNationalCredential(claim.definition) && claim.jurisdictionCode) {
    return isRelevantToWorkLocation(claim, work)
      ? { claim, bucket: "current_market_credential", groupKey: null }
      : {
          claim,
          bucket: "other_country_credential",
          // Its own jurisdiction. Grouping a Swedish credential under the
          // holder's Dubai heading is the exact misrepresentation the
          // three-market foundation exists to prevent.
          groupKey: claim.subJurisdictionCode ?? claim.jurisdictionCode,
        };
  }

  // 7. The factual merit sections. A training course or a degree keeps its
  //    own section whether or not it records where it was taken.
  const byType = CLAIM_TYPE_BUCKET[claim.claimType];
  if (byType) return { claim, bucket: byType, groupKey: null };

  // 8. Everything left, honestly labelled. A free-text "CPP" arrives here and
  //    stays here until its holder explicitly replaces it with the governed
  //    definition. Nothing in this file will do that for them.
  return { claim, bucket: "other_self_declared", groupKey: null };
}

/**
 * Classify a whole Passport.
 *
 * Every input row appears in the output exactly once — asserted by the suite,
 * because "exactly once" is the property that stops a page telling somebody
 * their licence is both current and archived.
 */
export function classifyAll<T extends ClassifiableClaim>(
  claims: readonly T[],
  work: WorkLocation,
): readonly ClassifiedClaim<T>[] {
  return claims.map((claim) => classify(claim, work));
}

/** The classified rows of one bucket, in input order. Ordering for DISPLAY is
 *  `compareForHighlight`; this preserves what it was given so a caller that
 *  wants source order can have it. */
export function inBucket<T extends ClassifiableClaim>(
  classified: readonly ClassifiedClaim<T>[],
  bucket: PassportBucket,
): readonly ClassifiedClaim<T>[] {
  return classified.filter((c) => c.bucket === bucket);
}

/** `other_country_credential` rows grouped by their own jurisdiction, with the
 *  group keys in a stable alphabetical order rather than first-seen order — so
 *  two holders with the same credentials see the same headings in the same
 *  sequence regardless of the order the rows came back in. */
export function groupByJurisdiction<T extends ClassifiableClaim>(
  classified: readonly ClassifiedClaim<T>[],
): readonly { readonly jurisdiction: string; readonly claims: readonly ClassifiedClaim<T>[] }[] {
  const groups = new Map<string, ClassifiedClaim<T>[]>();
  for (const row of classified) {
    if (row.bucket !== "other_country_credential" || row.groupKey === null) continue;
    const existing = groups.get(row.groupKey);
    if (existing) existing.push(row);
    else groups.set(row.groupKey, [row]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([jurisdiction, claims]) => ({ jurisdiction, claims }));
}

/* ------------------------------------------------------------------ */
/* Deterministic ordering                                              */
/* ------------------------------------------------------------------ */

/**
 * Trust rank, used ONLY for ordering.
 *
 * Deliberately not exported, not printed, not summed and not shown to anybody.
 * `assertionAtLeast` in types.ts exists for the same reason and with the same
 * restriction: the moment a trust rank becomes a number a reader can see, it is
 * a score, and this product does not have one.
 */
const TRUST_RANK: Readonly<Record<string, number>> = {
  verified: 3,
  document_provided: 2,
  self_declared: 1,
};

/** Bucket rank for highlight selection. International certifications and
 *  current-market credentials are the two a reader is most likely to be asking
 *  about; history never outranks a current fact. */
const BUCKET_RANK: Readonly<Record<PassportBucket, number>> = {
  current_market_credential: 1,
  international_certification: 2,
  other_country_credential: 3,
  education_and_training: 4,
  membership: 5,
  skill: 6,
  language: 7,
  document: 8,
  other_self_declared: 9,
  historical: 10,
  draft: 11,
};

/**
 * A TOTAL order over classified claims, for a future highlight selection.
 *
 * Phase 1 defines it and uses it for nothing visible. It is here now because
 * the card is Phase 2's and a card that picks its own three highlights would
 * be the fourth surface in this codebase to invent its own opinion of
 * "important".
 *
 * ── THE ORDER, EXACTLY AS IMPLEMENTED ──────────────────────────────────
 *
 *   1. BUCKET      `BUCKET_RANK` below, current-market first.
 *   2. trust       verified > document_provided > self_declared. An
 *                  unrecognised assertion level ranks 0 — below every known
 *                  one — so an unknown value can never outrank a real
 *                  verification.
 *   3. recency     more recently issued first; a missing date sorts last.
 *   4. claim id    the stable, unique tie-break.
 *
 * BUCKET LEADS, and that is a deliberate product statement rather than an
 * accident: a self-declared licence for the market the holder actually works
 * in outranks a verified certificate from a country they left. The
 * alternative — trust first — would surface the strongest EVIDENCE regardless
 * of where it applies. Both are defensible; this file implements bucket-first
 * and the executable suite asserts it, so changing it is a visible product
 * decision with a failing test attached, not a quiet edit.
 *
 * Total, and that word is load-bearing. Every comparison falls through to the
 * claim id, which is unique, so `sort` produces the same sequence for any input
 * permutation and the suite can assert exactly that by shuffling. A comparator
 * that could return 0 for two different rows would make the output depend on
 * the order the database happened to return them in.
 *
 * The holder appears nowhere in it. There is no "pinned", no "featured" and no
 * manual position, because a holder who could rank a self-declared claim above
 * a document-reviewed one would have been given a way to mislead a reader that
 * the trust vocabulary spends this entire codebase refusing.
 */
export function compareForHighlight<T extends ClassifiableClaim>(
  a: ClassifiedClaim<T>,
  b: ClassifiedClaim<T>,
): number {
  const bucket = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
  if (bucket !== 0) return bucket;

  const trust =
    (TRUST_RANK[b.claim.assertionLevel] ?? 0) - (TRUST_RANK[a.claim.assertionLevel] ?? 0);
  if (trust !== 0) return trust;

  // More recently issued first. A missing date sorts last rather than being
  // treated as very old or very new — it is neither, and guessing either way
  // would move a row a holder never dated.
  const aDate = a.claim.issuedOn ?? "";
  const bDate = b.claim.issuedOn ?? "";
  if (aDate !== bDate) {
    if (aDate === "") return 1;
    if (bDate === "") return -1;
    return aDate < bDate ? 1 : -1;
  }

  // The stable tie-break. Unique, so the order is total.
  return a.claim.id < b.claim.id ? -1 : a.claim.id > b.claim.id ? 1 : 0;
}

/** Deterministically ordered, whatever order the rows arrived in. */
export function orderForDisplay<T extends ClassifiableClaim>(
  classified: readonly ClassifiedClaim<T>[],
): readonly ClassifiedClaim<T>[] {
  return [...classified].sort(compareForHighlight);
}
