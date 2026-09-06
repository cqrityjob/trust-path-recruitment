// Security Passport — the shared card content model.
//
// All three directions consume this. They differ in LAYOUT and MATERIAL
// only; the semantic content is computed once, here.
//
// That is not merely tidy. The owner's brief requires that no format and no
// direction may drop required trust context, and the cheapest way to
// guarantee that is to leave the directions no opportunity to assemble
// content of their own. A direction that wanted to omit a lifecycle word
// would have to change this file, where the omission would be obvious.

import { professionLine } from "@/lib/security-passport/identity/presentation";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { useQrDataUrl } from "@/lib/security-passport/use-qr";
import {
  evidenceStyle,
  lifecycleOverlay,
  milestoneStyle,
  type MilestoneStyle,
} from "@/lib/security-passport/design/trust-system";
import {
  credentialPresentationOf,
  effectiveAssertionLevel,
  effectiveTrust,
} from "@/lib/security-passport/trust-presentation";
import { mayShowBadge } from "@/lib/security-passport/recognition";
import type {
  CardCredential,
  PassportCardModel,
  ShareOverlayState,
} from "@/lib/security-passport/card";
import { marketDisplayName } from "@/lib/security-passport/market-profiles";
import type { CredentialPlateProps } from "./CardPrimitives";

export interface CardDirectionProps {
  readonly card: PassportCardModel;
  readonly shareOverlay?: ShareOverlayState;
  readonly verifyUrl: string;
  /** Suppresses issuer text and the attribution line. Set for the
   *  socially-shared surfaces, where issuer identity would amount to
   *  publishing an employment history. */
  readonly socialSafe?: boolean;
  readonly className?: string;
}

export interface CardMilestone {
  readonly years: number;
  readonly yearsLabel: string;
  readonly verifiedLabel: string;
  readonly style: MilestoneStyle;
}

/** One market, as the evidence band prints it.
 *
 *  ── WHY THE CARD GROUPS AT ALL ────────────────────────────────────────
 *
 *  The evidence band was a flat list of plates with the work location printed
 *  separately above it. For a holder with Swedish credentials working in Dubai
 *  that card showed four Swedish plates under the heading "Dubai, Förenade
 *  Arabemiraten" — and the card is the artefact that leaves the product and
 *  gets forwarded. Nothing on it said the plates were Swedish, so the layout
 *  itself made the transfer claim.
 *
 *  Each group now names its own market and counts only what is verified AND
 *  current in it. The current work market is stated separately, and when the
 *  holder has no verified credential there the card says so rather than
 *  letting the markets above stand in for it. */
export interface CardMarketGroup {
  readonly marketCode: string;
  readonly displayName: string;
  readonly verifiedCount: number;
  readonly verifiedLabel: string;
  readonly plates: readonly CredentialPlateProps[];
  readonly isCurrentWorkMarket: boolean;
}

export interface CardContent {
  readonly brandLabel: string;
  readonly holderName: string;
  readonly profession: string;
  readonly jurisdiction: string;
  /** Label for `jurisdiction`. The work location is a separate fact from the
   *  derived professional title and must never be concatenated with it. */
  readonly workLabel: string;
  readonly milestone: CardMilestone | null;
  readonly credentials: readonly CredentialPlateProps[];
  /** The same evidence, grouped by the market each credential belongs to. */
  readonly markets: readonly CardMarketGroup[];
  readonly marketsLabel: string;
  readonly currentMarketLabel: string;
  /** Printed under the current work market when the holder has verified
   *  nothing there yet. The absence is stated so the markets listed above it
   *  cannot be read as covering it. */
  readonly noVerifiedInCurrentMarket: string | null;
  readonly attributions: string | null;
  readonly verifyLabel: string;
  readonly verifyAtSource: string;
  readonly snapshotNote: string;
  readonly qrDataUrl: string | null;
  /** Present when the underlying share is expired or revoked. */
  readonly shareWarning: string | null;
  readonly stateWords: readonly string[];
  readonly emptyHeading: string;
  readonly emptyBody: string;
  readonly noVerifiedYet: string;
  /** Overlap-free verified and reported time, carried straight from the card
   *  model so the segments on the card, the figure beside them and the
   *  recipient page all read the same number. */
  readonly experience: {
    readonly verifiedDays: number;
    readonly reportedDays: number;
  };
}

export function useCardContent(
  card: PassportCardModel,
  verifyUrl: string,
  shareOverlay: ShareOverlayState = "none",
  socialSafe = false,
): CardContent {
  const { pt, lang } = usePassportCopy();
  const qrDataUrl = useQrDataUrl(verifyUrl);

  const recognition = card.recognition;
  const mStyle = milestoneStyle(recognition.earnedYears);

  const milestone: CardMilestone | null = mayShowBadge(recognition)
    ? {
        years: recognition.earnedYears as number,
        // "1 YEARS" is the kind of detail that undermines a credential more
        // than its size suggests: it reads as machine output on an artifact
        // whose whole job is to look considered.
        yearsLabel:
          (recognition.earnedYears as number) >= 20
            ? pt("recognition.yearsPlus")
            : (recognition.earnedYears as number) === 1
              ? pt("duration.year")
              : pt("recognition.years"),
        verifiedLabel: pt("recognition.badgePrefix"),
        style: mStyle,
      }
    : null;

  const toPlate = (c: CardCredential): CredentialPlateProps => {
    const ev = evidenceStyle(effectiveAssertionLevel(c));
    const overlay = lifecycleOverlay(c.lifecycleState);
    const isCurrent = c.lifecycleState === "active";
    return {
      title: lang === "sv" ? c.titleSv : c.titleEn,
      // A credential that is no longer current must not print the bare word
      // VERIFIED: on a card, beside a name, that reads as a present fact.
      // The verification is real and is not erased — it is stated as the
      // past event it is, and the lifecycle word leads.
      evidenceWord:
        // The OUTWARD level word. A CQrityjob review is Documented, current or
        // not; a source confirmation is Source-confirmed while current and
        // "previously verified" once it has lapsed.
        effectiveTrust(c) === "documented"
          ? pt("trust.level.documented")
          : effectiveTrust(c) === "source_confirmed"
            ? isCurrent
              ? pt("trust.level.source_verified")
              : pt("assertion.verified.historical")
            : pt(`assertion.${c.assertionLevel}` as const),
      // The lifecycle word appears only when it qualifies the entry.
      // "Active" beside every plate is noise; "Expired" is the point.
      lifecycleWord: isCurrent ? null : pt(`lifecycle.${c.lifecycleState}` as const),
      // Drives which word the plate prints first.
      lifecycleLeads: !isCurrent,
      edge: ev.edge,
      edgeStyle: ev.edgeStyle,
      fill: ev.fill,
      textTone: ev.text,
      premium: ev.premium,
      // The plate's issuer line is the ISSUER. It used to prefer
      // `verifierName`, which put a verification fact under a field
      // documented as "Issuer text" and, when there was no verifier, fell
      // back to the issuer anyway -- so the line meant one thing or the
      // other with nothing on the card to say which.
      issuer: socialSafe ? null : c.issuerName,
      overlayTone: overlay ? overlay.edge : null,
      symbolCode: c.credentialCode,
      symbolState: credentialPresentationOf(c, c.lifecycleState),
    };
  };

  const credentials: CredentialPlateProps[] = card.credentials.map(toPlate);

  // ── PER-MARKET EVIDENCE ────────────────────────────────────────────
  //
  // Verified-and-current first, because the count beside the market name
  // refers to exactly those. Lapsed and self-declared credentials still print
  // — they are true — but below, and they are not counted.
  const markets: CardMarketGroup[] = card.marketProfiles.map((p) => {
    const count = p.verifiedCredentials.length;
    return {
      marketCode: p.marketCode,
      displayName: marketDisplayName(p, lang),
      verifiedCount: count,
      verifiedLabel: count === 1 ? pt("market.verified.one") : pt("market.verified.many"),
      plates: [...p.verifiedCredentials, ...p.pendingCredentials, ...p.otherClaims].map(toPlate),
      isCurrentWorkMarket: p.isCurrentWorkMarket,
    };
  });

  // "No verified credentials in this market yet" is printed only when the
  // holder HAS named a work market. With no market named there is nothing for
  // the sentence to be about, and printing it would invent a gap.
  const currentGroup = markets.find((m) => m.isCurrentWorkMarket) ?? null;
  const noVerifiedInCurrentMarket =
    card.jurisdictionCode && (currentGroup === null || currentGroup.verifiedCount === 0)
      ? pt("market.currentMarket.none")
      : null;

  const stateWords: string[] = [];
  if (card.containsExpired) stateWords.push(pt("card.containsExpired"));
  if (card.containsDisputed) stateWords.push(pt("card.containsDisputed"));

  const shareWarning =
    shareOverlay === "share_expired"
      ? pt("card.shareExpired")
      : shareOverlay === "share_revoked"
        ? pt("card.shareRevoked")
        : null;

  return {
    brandLabel: pt("card.brand"),
    holderName: card.holderDisplayName,
    profession: professionLine(card.identity, lang, pt("identity.none")),
    jurisdiction: formatWorkLocation(card.jurisdictionCode, card.subJurisdictionCode, lang),
    workLabel: pt("card.workLabel"),
    milestone,
    credentials,
    markets,
    marketsLabel: pt("card.verifiedMarkets"),
    currentMarketLabel: pt("card.currentWorkMarket"),
    noVerifiedInCurrentMarket,
    attributions:
      socialSafe || card.attributions.length === 0 ? null : card.attributions.join(", "),
    verifyLabel: pt("card.verifyNow"),
    verifyAtSource: pt("card.verifyAtSource"),
    snapshotNote: pt("card.snapshotNote"),
    qrDataUrl,
    shareWarning,
    stateWords,
    emptyHeading: pt("card.emptyState"),
    emptyBody: pt("card.emptyBody"),
    // The empty milestone slot must not contradict a VERIFIED plate below
    // it: with verified credentials present, the missing thing is verified
    // EXPERIENCE, and the label says so.
    noVerifiedYet: card.credentials.some((c) => {
      const t = effectiveTrust(c);
      return t === "documented" || t === "source_confirmed";
    })
      ? pt("card.noVerifiedExperience")
      : pt("card.noVerifiedYet"),
    experience: {
      verifiedDays: card.verifiedExperienceDays,
      reportedDays: card.reportedExperienceDays,
    },
  };
}
