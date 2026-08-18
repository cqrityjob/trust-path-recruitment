// Security Passport — the Passport Card contract.
//
// ── THE CARD IS GENERATED, NOT AUTHORED ────────────────────────────────
//
// Everything the card says is derived here, from the holder's entries and
// their current state. There is no parameter for the assertion level, the
// lifecycle state, the issuer, the verifier, the dates, the jurisdiction or
// the recognition — so no caller, and no future edit to a component, can
// supply one (Product Architecture v1.1 §5.1).
//
// What the holder controls lives elsewhere entirely: whether to share,
// which package, which optional items, to whom, for how long, and whether
// to revoke (disclosure.ts).
//
// ── WHICH CREDENTIALS APPEAR ───────────────────────────────────────────
//
// At most three, chosen by evidence strength and then by recency — never by
// holder preference. Expired and disputed entries are eligible and are
// shown with their state rather than quietly dropped: a card that hides an
// expired licence is less trustworthy than one that shows it expired.

import { totalsByEvidenceLevel } from "./experience";
import { recognitionFor, type RecognitionState } from "./recognition";
import { validityOf } from "./validity";
import type {
  AssertionLevel,
  Claim,
  ExperiencePeriod,
  IsoDate,
  LifecycleState,
  PassportHolder,
} from "./types";

export type PassportCardState = "empty" | "self_declared_only" | "partially_verified" | "verified";

export type ShareOverlayState = "none" | "share_expired" | "share_revoked";

/**
 * One credential as the card presents it.
 *
 * ── WHY THIS TYPE EXISTS RATHER THAN REUSING `Claim` ───────────────────
 *
 * `lifecycleState` here is the EFFECTIVE state on the evaluation date, not
 * the stored one. Expiry is derived from `validUntil` at read time (see
 * validity.ts) precisely because nothing writes `expired` on the day a
 * licence lapses — so a card built from stored state alone would print a
 * lapsed authorisation as VERIFIED with nothing qualifying it. The card is
 * the artifact people screenshot; that is the worst possible place for it.
 *
 * The field keeps its name so every consumer reads the derived value by
 * default. Opting back into the stored value has to be deliberate.
 */
export interface CardCredential {
  readonly id: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly credentialCode: string | null;
  readonly issuerName: string;
  readonly verifierName: string | null;
  readonly assertionLevel: AssertionLevel;
  /** Effective on the evaluation date. */
  readonly lifecycleState: LifecycleState;
  /** True when the stored state was overtaken by the calendar. */
  readonly lapsed: boolean;
  readonly validUntil: IsoDate | null;
}

export interface PassportCardModel {
  readonly holderDisplayName: string;
  readonly professionTitleSv: string;
  readonly professionTitleEn: string;
  readonly jurisdictionCode: string;
  readonly state: PassportCardState;
  /** Null unless the whole qualifying threshold is verified. */
  readonly recognition: RecognitionState;
  /** Overlap-free VERIFIED time, in days, as of the evaluation date. The card
   *  renders it as the five experience segments plus the exact duration; both
   *  come from this one number so the mark and the text cannot disagree.
   *  Computed by `totalsByEvidenceLevel`, which unions intervals rather than
   *  summing them, so two concurrent jobs count once. Elapsed calendar time,
   *  not FTE-weighted: the segments count time in the profession, and
   *  discounting a part-time year would be a judgement, not a count. */
  readonly verifiedExperienceDays: number;
  /** Everything the holder has reported, verified or not. Shown separately and
   *  neutrally: a holder with unverified years is not at zero, and pretending
   *  otherwise pushes people to overclaim. */
  readonly reportedExperienceDays: number;
  readonly credentials: readonly CardCredential[];
  readonly containsExpired: boolean;
  readonly containsDisputed: boolean;
  /** Distinct attributions behind the shown credentials. */
  readonly attributions: readonly string[];
}

const CARD_CREDENTIAL_LIMIT = 3;

function evidenceRank(claim: CardCredential): number {
  if (claim.assertionLevel === "verified") return 2;
  if (claim.assertionLevel === "document_provided") return 1;
  return 0;
}

/** Recency by the date the credential's validity begins or ends. Card
 *  credentials no longer carry `issuedOn`, and `validUntil` is the more
 *  useful ordering for an appointment anyway. */
function recency(claim: CardCredential): number {
  return claim.validUntil ? Date.parse(claim.validUntil) : 0;
}

function deriveState(
  periods: readonly ExperiencePeriod[],
  claims: readonly Claim[],
): PassportCardState {
  if (periods.length === 0 && claims.length === 0) return "empty";

  const anyVerified =
    periods.some((p) => p.assertionLevel === "verified") ||
    claims.some((c) => c.assertionLevel === "verified");
  if (!anyVerified) return "self_declared_only";

  const allVerified =
    periods.every((p) => p.assertionLevel === "verified") &&
    claims.every((c) => c.assertionLevel === "verified");
  return allVerified ? "verified" : "partially_verified";
}

/** A claim as of the evaluation date, with expiry applied. */
function toCardCredential(claim: Claim, evaluationOn: IsoDate): CardCredential {
  const validity = validityOf(claim.lifecycleState, claim.validUntil, evaluationOn);
  return {
    id: claim.id,
    titleSv: claim.titleSv,
    titleEn: claim.titleEn,
    credentialCode: claim.credentialCode,
    issuerName: claim.issuerName,
    verifierName: claim.verifierName,
    assertionLevel: claim.assertionLevel,
    lifecycleState: validity.effectiveState,
    lapsed: validity.hasExpired,
    validUntil: claim.validUntil,
  };
}

export function buildPassportCard(
  holder: PassportHolder,
  evaluationOn: IsoDate,
): PassportCardModel {
  const totals = totalsByEvidenceLevel(holder.periods, evaluationOn);
  const recognition = recognitionFor(totals);

  // Expiry is applied BEFORE the card is assembled, so every downstream
  // consumer — plates, symbols, state words, the exported PNG — reads the
  // state that is true today rather than the one stored last year.
  const dated = holder.claims.map((c) => toCardCredential(c, evaluationOn));

  const credentials = [...dated]
    .sort((a, b) => evidenceRank(b) - evidenceRank(a) || recency(b) - recency(a))
    .slice(0, CARD_CREDENTIAL_LIMIT);

  const attributions = Array.from(
    new Set(
      credentials
        .map((c) => c.verifierName ?? c.issuerName)
        .filter((name): name is string => Boolean(name) && name !== "—"),
    ),
  );

  return {
    holderDisplayName: holder.displayName,
    professionTitleSv: holder.professionTitleSv,
    professionTitleEn: holder.professionTitleEn,
    jurisdictionCode: holder.jurisdictionCode,
    state: deriveState(holder.periods, holder.claims),
    recognition,
    verifiedExperienceDays: totals.verified.elapsedDays,
    reportedExperienceDays: totals.reported.elapsedDays,

    credentials,
    // Derived, so a licence that lapsed yesterday is reported today. The
    // whole card carries the warning, not only the plate.
    containsExpired:
      dated.some((c) => c.lifecycleState === "expired") ||
      holder.periods.some((p) => p.lifecycleState === "expired"),
    containsDisputed:
      dated.some((c) => c.lifecycleState === "disputed") ||
      holder.periods.some((p) => p.lifecycleState === "disputed"),
    attributions,
  };
}
