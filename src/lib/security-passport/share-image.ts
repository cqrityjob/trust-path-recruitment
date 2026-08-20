// Security Passport — one way to turn a social card model into a PNG.
//
// The same fifteen lines of label plumbing had been copied into the share
// route, the channel panel and the LinkedIn walkthrough. Three copies of a
// function that decides what text goes ON an exported image is three chances
// for one of them to start saying something the others do not — on the one
// artifact that leaves CQrityjob's control entirely.
//
// The safe subset is still decided upstream by `buildSocialCard`; nothing
// here can widen it. This module only renders what that model already
// contains.

import { buildSocialSvg, svgToPngBlob } from "./social-export";
import { shareFormat, type ShareFormat } from "./design/trust-system";
import type { SocialCardModel } from "./social";
import type { PassportCopyKey, PassportLang } from "./i18n";

export type PassportTranslate = (key: PassportCopyKey) => string;

/** Renders the card at a given format. Throws only if the browser cannot
 *  rasterise; callers decide whether that blocks them. */
export async function renderShareImage(
  model: SocialCardModel,
  format: ShareFormat,
  lang: PassportLang,
  pt: PassportTranslate,
  qrDataUrl: string | null,
): Promise<Blob> {
  const spec = shareFormat(format);
  const svg = buildSocialSvg(
    model,
    format,
    lang,
    {
      brand: pt("card.brand"),
      professionLine: `${lang === "sv" ? model.professionTitleSv : model.professionTitleEn} · ${model.jurisdictionCode}`,
      verifiedLabel: pt("assertion.verified"),
      yearsLabel: pt("recognition.years"),
      verifyAtSource: pt("card.verifyAtSource"),
      noVerifiedYet:
        model.verifiedCredentials.length > 0
          ? pt("card.noVerifiedExperience")
          : pt("card.noVerifiedYet"),
      staleWarning: model.staleWarning ? pt("card.shareExpired") : null,
    },
    qrDataUrl,
  );
  return svgToPngBlob(svg, spec.width, spec.height);
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
