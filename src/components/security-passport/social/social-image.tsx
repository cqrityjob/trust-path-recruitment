// Security Passport — the social card as a string and as a PNG, where no
// frame is on screen.
//
// SocialFrame renders SocialCardSvg, serialises it and shows that string; its
// download rasterises the same string. These are the same steps for a format
// nothing is previewing (the share panels' format buttons, a device share),
// so the file is the image the frame would show for the same props.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { shareFormat, type ShareFormat } from "@/lib/security-passport/design/trust-system";
import { svgToPngBlob } from "@/lib/security-passport/social-export";
import type { SocialCardModel } from "@/lib/security-passport/social";
import { socialImageStrings, type PassportTranslate } from "@/lib/security-passport/share-image";
import type { PassportLang } from "@/lib/security-passport/i18n";
import { SocialCardSvg, type SocialCardSvgProps } from "./SocialCardSvg";

/**
 * The card as one SVG string: rendered once, off-screen, and serialised with
 * the same component and serialiser SocialFrame uses.
 *
 * Browser only, and from an event handler: React will not render another root
 * synchronously from inside a render or an effect.
 */
export function socialCardSvgString(props: SocialCardSvgProps): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<SocialCardSvg {...props} />));
    const svg = host.querySelector("svg");
    return svg ? new XMLSerializer().serializeToString(svg) : "";
  } finally {
    root.unmount();
  }
}

/** The string as an image source, for the preview. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The PNG of one format. */
export async function renderSocialImage(
  model: SocialCardModel,
  format: ShareFormat,
  lang: PassportLang,
  pt: PassportTranslate,
  qrDataUrl: string | null,
): Promise<Blob> {
  const spec = shareFormat(format);
  const svg = socialCardSvgString({
    model,
    format,
    lang,
    strings: socialImageStrings(model, lang, pt),
    qrDataUrl: model.verifyUrl ? qrDataUrl : null,
  });
  return svgToPngBlob(svg, spec.width, spec.height);
}
