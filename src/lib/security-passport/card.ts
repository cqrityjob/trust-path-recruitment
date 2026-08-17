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
import type { Claim, ExperiencePeriod, IsoDate, PassportHolder } from "./types";

export type PassportCardState = "empty" | "self_declared_only" | "partially_verified" | "verified";

export type ShareOverlayState = "none" | "share_expired" | "share_revoked";

export interface PassportCardModel {
  readonly holderDisplayName: string;
  readonly professionTitleSv: string;
  readonly professionTitleEn: string;
  readonly jurisdictionCode: string;
  readonly state: PassportCardState;
  /** Null unless the whole qualifying threshold is verified. */
  readonly recognition: RecognitionState;
  readonly credentials: readonly Claim[];
  readonly containsExpired: boolean;
  readonly containsDisputed: boolean;
  /** Distinct attributions behind the shown credentials. */
  readonly attributions: readonly string[];
}

const CARD_CREDENTIAL_LIMIT = 3;

function evidenceRank(claim: Claim): number {
  if (claim.assertionLevel === "verified") return 2;
  if (claim.assertionLevel === "document_provided") return 1;
  return 0;
}

function recency(claim: Claim): number {
  return claim.issuedOn ? Date.parse(claim.issuedOn) : 0;
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

export function buildPassportCard(
  holder: PassportHolder,
  evaluationOn: IsoDate,
): PassportCardModel {
  const totals = totalsByEvidenceLevel(holder.periods, evaluationOn);
  const recognition = recognitionFor(totals);

  const credentials = [...holder.claims]
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
    credentials,
    containsExpired:
      holder.claims.some((c) => c.lifecycleState === "expired") ||
      holder.periods.some((p) => p.lifecycleState === "expired"),
    containsDisputed:
      holder.claims.some((c) => c.lifecycleState === "disputed") ||
      holder.periods.some((p) => p.lifecycleState === "disputed"),
    attributions,
  };
}
