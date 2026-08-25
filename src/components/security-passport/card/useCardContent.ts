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
import { credentialPresentation } from "@/lib/security-passport/design/credential-symbols";
import { mayShowBadge } from "@/lib/security-passport/recognition";
import type { PassportCardModel, ShareOverlayState } from "@/lib/security-passport/card";
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

export interface CardContent {
  readonly brandLabel: string;
  readonly holderName: string;
  readonly profession: string;
  readonly jurisdiction: string;
  readonly milestone: CardMilestone | null;
  readonly credentials: readonly CredentialPlateProps[];
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

  const credentials: CredentialPlateProps[] = card.credentials.map((c) => {
    const ev = evidenceStyle(c.assertionLevel);
    const overlay = lifecycleOverlay(c.lifecycleState);
    const isCurrent = c.lifecycleState === "active";
    return {
      title: lang === "sv" ? c.titleSv : c.titleEn,
      // A credential that is no longer current must not print the bare word
      // VERIFIED: on a card, beside a name, that reads as a present fact.
      // The verification is real and is not erased — it is stated as the
      // past event it is, and the lifecycle word leads.
      evidenceWord:
        !isCurrent && c.assertionLevel === "verified"
          ? pt("assertion.verified.historical")
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
      issuer: socialSafe ? null : (c.verifierName ?? c.issuerName),
      overlayTone: overlay ? overlay.edge : null,
      symbolCode: c.credentialCode,
      symbolState: credentialPresentation(c.assertionLevel, c.lifecycleState),
    };
  });

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
    milestone,
    credentials,
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
    noVerifiedYet: card.credentials.some((c) => c.assertionLevel === "verified")
      ? pt("card.noVerifiedExperience")
      : pt("card.noVerifiedYet"),
    experience: {
      verifiedDays: card.verifiedExperienceDays,
      reportedDays: card.reportedExperienceDays,
    },
  };
}
