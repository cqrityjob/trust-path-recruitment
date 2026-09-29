// Social share formats — the socially-safe card, at real export sizes.
//
// ── THE PREVIEW IS THE EXPORT ──────────────────────────────────────────
//
// The frame shows the exact SVG the download rasterises: SocialCardSvg,
// rendered here once and serialised, laid out at the format's true pixel size
// (1080×1080 and so on) and only scaled to fit the page. A preview
// built at review size would look fine and export broken; a preview drawn
// separately from the export would, and did, disagree with it. `onImage`
// hands the parent that same string, so its download button cannot produce
// anything else.
//
// ── THE SAFE SUBSET IS THE ONLY THING AVAILABLE HERE ───────────────────
//
// This component accepts a `SocialCardModel` and nothing else. The full
// Passport model, with its issuers, dates, employers and claim ids, is not
// in scope: it cannot be rendered here because it is not passed here.
//
// ── EVERY FORMAT CARRIES THE SAME TRUST CONTEXT ────────────────────────
//
// Layout changes between square, story, OG and compact. The required
// context does not: brand, holder label, profession, jurisdiction, each
// credential's shield, scope and trust word, and either the link to check
// at source or the line saying the image is a snapshot. A cached image
// outliving its credential is the whole risk this wording exists to cover,
// so no format is permitted to drop it for space.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  passportCardBackground,
  shareFormat,
  type ShareFormat,
} from "@/lib/security-passport/design/trust-system";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { useQrDataUrl } from "@/lib/security-passport/use-qr";
import type { SocialCardModel } from "@/lib/security-passport/social";
import { socialImageStrings } from "@/lib/security-passport/share-image";
import { passportT, type PassportCopyKey, type PassportLang } from "@/lib/security-passport/i18n";
import { SocialCardSvg } from "./SocialCardSvg";
import { svgDataUrl } from "./social-image";

export function SocialFrame({
  model,
  format,
  previewWidth,
  lang: imageLang,
  alt,
  onImage,
}: {
  model: SocialCardModel;
  format: ShareFormat;
  /** Preferred preview width. The frame never exceeds its container, so a
   *  360px preference on a 343px phone column shrinks rather than pushing
   *  the page sideways. */
  previewWidth: number;
  /** The image's language; the reader's when omitted. */
  lang?: PassportLang;
  /** The preview's text alternative, when it is one image of a set. */
  alt?: string;
  /** The SVG this frame shows, once it is complete (a link's QR code drawn),
   *  or null while it is not. The one string a download may rasterise. */
  onImage?: (svg: string | null) => void;
}) {
  const { pt: readerPt, lang: readerLang } = usePassportCopy();
  const lang = imageLang ?? readerLang;
  const spec = shareFormat(format);
  const qr = useQrDataUrl(model.verifyUrl ?? "");
  const pt = useCallback(
    (key: PassportCopyKey) => (lang === readerLang ? readerPt(key) : passportT(key, lang)),
    [lang, readerLang, readerPt],
  );
  const complete = !model.verifyUrl || qr !== null;
  const qrForImage = model.verifyUrl ? qr : null;
  const strings = useMemo(() => socialImageStrings(model, lang, pt), [model, lang, pt]);
  const [svg, setSvg] = useState<string | null>(null);

  // The drawing is rendered, hidden, in this frame's own tree and serialised
  // once it is committed: the string the image below shows and the download
  // rasterises. (Not a second React root from an effect -- React does not
  // render synchronously from inside one.)
  const drawing = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = drawing.current?.querySelector("svg");
    setSvg(node ? new XMLSerializer().serializeToString(node) : null);
  }, [model, format, lang, strings, qrForImage]);

  useEffect(() => {
    onImage?.(complete ? svg : null);
  }, [svg, complete, onImage]);

  return (
    <div
      className="w-full overflow-hidden rounded-lg"
      style={{
        maxWidth: previewWidth,
        aspectRatio: `${spec.width} / ${spec.height}`,
        // The ONE card ground, behind the image while it is drawn.
        background: passportCardBackground(),
      }}
      data-social-frame={format}
    >
      <div hidden ref={drawing}>
        <SocialCardSvg
          model={model}
          format={format}
          lang={lang}
          strings={strings}
          qrDataUrl={qrForImage}
        />
      </div>
      {svg ? (
        <img
          src={svgDataUrl(svg)}
          alt={alt ?? readerPt("social.previewAlt")}
          width={spec.width}
          height={spec.height}
          data-social-preview={format}
          data-social-page={model.page ? `${model.page.index}/${model.page.count}` : undefined}
          data-social-link={model.verifyUrl ? "included" : "none"}
          className="block h-auto w-full"
        />
      ) : null}
    </div>
  );
}
