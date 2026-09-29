// Security Passport — every word printed on a social image, in one place.
//
// The same fifteen lines of label plumbing had been copied into the share
// route, the channel panel and the LinkedIn walkthrough. Three copies of a
// function that decides what text goes ON an exported image is three chances
// for one of them to start saying something the others do not — on the one
// artifact that leaves CQrityjob's control entirely.
//
// The safe subset is still decided upstream by `buildSocialCard` /
// `buildSelectedSocialCard`; nothing here can widen it. This module only words
// what that model already contains. The drawing is SocialCardSvg, and the one
// rasteriser is `svgToPngBlob`.

import { joinTitles } from "./identity/presentation";
import { formatJurisdiction, titleWithJurisdictionOnce } from "./format";
import type { SocialCardModel } from "./social";
import type { PassportCopyKey, PassportLang } from "./i18n";

/** The ONE image's file name: the holder's Passport, in this format. There is
 *  no "-1-of-2": one holder, one Passport, one file. */
export function socialImageFileName(format: string): string {
  return `cqrityjob-passport-${format}.png`;
}

export type PassportTranslate = (key: PassportCopyKey) => string;

export interface SocialImageStrings {
  /** The micro label under the brand mark. */
  readonly brand: string;
  readonly professionLine: string;
  /** Printed beside the QR code, only when the image carries a link. */
  readonly verifyAtSource: string;
  /** Printed instead when it carries none: an image is not the record. */
  readonly snapshotNote: string;
  readonly noVerified: string;
  readonly staleWarning: string | null;
  /** The heading over the credentials nobody placed in a jurisdiction. */
  readonly notStated: string;
}

export function socialImageStrings(
  model: SocialCardModel,
  lang: PassportLang,
  pt: PassportTranslate,
): SocialImageStrings {
  return {
    brand: pt("card.brand"),
    professionLine: titleWithJurisdictionOnce(
      joinTitles(model.titles, lang, pt("identity.none")),
      formatJurisdiction(model.jurisdictionCode, lang),
    ),
    verifyAtSource: pt("card.verifyAtSource"),
    snapshotNote: pt("social.snapshotNote"),
    noVerified: pt("card.noVerifiedYet"),
    staleWarning: model.staleWarning ? pt("card.shareExpired") : null,
    notStated: pt("scope.notStated"),
  };
}

/** Hands a rendered blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick: revoking synchronously races the click in
  // Safari and produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
