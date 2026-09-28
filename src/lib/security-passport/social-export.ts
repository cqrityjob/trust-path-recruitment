// Security Passport — exportable social assets.
//
// ── WHY A PURPOSE-BUILT SVG AND NOT A SCREENSHOT OF THE DOM ────────────
//
// The obvious route is a DOM-to-image library pointed at a rendered card. It
// was rejected for two reasons, in this order:
//
//   1. Correctness. Those libraries inline computed styles and rasterise
//      whatever the browser happened to lay out — web fonts that had not
//      loaded, a Tailwind class that resolved differently at 375px, a
//      cropped edge. The artifact people keep would be a lottery.
//   2. Provenance. A serialiser walks the live tree, so what lands in the
//      exported image is whatever is in that tree. The social card can only
//      put in what it is given, and it is given `SocialCardModel` — the type
//      that structurally cannot carry an employer, an issuer, a date or a
//      certificate number.
//
// The personal card is drawn by SocialCardSvg (components/security-passport/
// social), from the shared card's own shield and flag components; this module
// holds what every export shares: the formats, the text helpers, the generic
// link preview and the one rasteriser. Everything an SVG here references is
// inline or a data URL, so the canvas it is drawn on is never tainted.
//
// ── THE IMAGE IS NOT THE CREDENTIAL ────────────────────────────────────
//
// A cached image outlives the thing it depicts. So an image with a link says
// "check at source" beside it, and an image without one says it is a
// snapshot. That line is not decoration; it is what stops the image being
// mistaken for the record.

import { SHARE_FORMATS, TRUST_PALETTE, passportCardSvgStops } from "./design/trust-system";
import { SYMBOL_CODES, SYMBOL_VIEWBOX, credentialSymbolMarkup } from "./design/credential-symbols";
import { credentialMark } from "./credentials";

export { SHARE_FORMATS };

/** Escapes text for XML content. Every string here originates from a holder
 *  — a name, a credential title — so it is never interpolated raw. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Naive width estimate so a long credential name wraps instead of running
 *  off the canvas. SVG has no text metrics before render, and loading a font
 *  to measure would reintroduce the external dependency this module exists
 *  to avoid. Deliberately generous: a slightly early wrap is invisible, an
 *  overflow is not. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  }
  return lines;
}

export const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, -apple-system, sans-serif";

/**
 * The GENERIC branded link preview, 1200×630.
 *
 * ── WHY THE PUBLIC PREVIEW IS DELIBERATELY IMPERSONAL ──────────────────
 *
 * `og:image` is fetched and cached by every platform that sees the link,
 * and a cached image cannot be revoked. A personalised preview would
 * therefore be a durable public artifact that outlives the share it came
 * from — the exact failure the recipient page exists to avoid.
 *
 * So the image a crawler receives says what CQrityjob Security Passport is
 * and nothing whatsoever about the holder: no name, no credential, no
 * milestone, no jurisdiction. It is safe to cache forever because it is
 * true forever, and it is identical for every share, so possessing it
 * reveals not even that a particular share exists.
 *
 * The holder's personalised card is still produced — they download it from
 * the sharing centre and attach it deliberately, which keeps the decision
 * to publish their own credentials with them.
 *
 * Rendered from this module rather than hand-drawn so the asset stays
 * traceable to the same palette and engraving vocabulary as every other
 * Passport surface. Regenerate with scripts/generate-og-image.mjs.
 */
export function buildGenericOgSvg(strings: {
  readonly brand: string;
  readonly title: string;
  readonly subtitle: string;
  readonly note: string;
}): string {
  const W = 1200;
  const H = 630;
  const pad = 72;
  const fs = (n: number) => n;

  const body: string[] = [];

  body.push(
    `<text x="${pad}" y="${pad + 40}" font-family="${FONT_STACK}" font-size="${fs(28)}" font-weight="700" letter-spacing="${fs(4)}" fill="${TRUST_PALETTE.goldBright}">${esc(strings.brand.toUpperCase())}</text>`,
    `<line x1="${pad}" y1="${pad + 66}" x2="${W - pad}" y2="${pad + 66}" stroke="${TRUST_PALETTE.gold}" stroke-opacity="0.55" stroke-width="2"/>`,
  );

  let y = pad + 170;
  for (const line of wrap(strings.title, 30, 2)) {
    body.push(
      `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(64)}" font-weight="600" fill="${TRUST_PALETTE.ink}">${esc(line)}</text>`,
    );
    y += fs(76);
  }

  y += fs(12);
  for (const line of wrap(strings.subtitle, 58, 2)) {
    body.push(
      `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(28)}" fill="${TRUST_PALETTE.inkMuted}">${esc(line)}</text>`,
    );
    y += fs(40);
  }

  // The four credential marks, as the product's own vocabulary. Generic:
  // these are the credentials the product supports, not anyone's holdings.
  const symbolSize = 84;
  const symbolY = H - pad - symbolSize - 54;
  SYMBOL_CODES.forEach((code, i) => {
    const x = pad + i * (symbolSize + 20);
    body.push(
      `<g transform="translate(${x} ${symbolY}) scale(${(symbolSize / SYMBOL_VIEWBOX).toFixed(4)})">${credentialSymbolMarkup(code, "self_declared", credentialMark(code))}</g>`,
    );
  });

  body.push(
    `<text x="${pad}" y="${H - pad + 6}" font-family="${FONT_STACK}" font-size="${fs(22)}" fill="${TRUST_PALETTE.inkFaint}">${esc(strings.note)}</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="sp-og-ground" x1="0" y1="0" x2="0" y2="1">`,
    passportCardSvgStops(),
    `</linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#sp-og-ground)"/>`,
    `<rect x="${pad / 2}" y="${pad / 2}" width="${W - pad}" height="${H - pad}" fill="none" stroke="${TRUST_PALETTE.gold}" stroke-opacity="0.28" stroke-width="2"/>`,
    body.join(""),
    `</svg>`,
  ].join("");
}

/** SVG string → PNG blob at the format's full pixel size.
 *
 *  Everything referenced by the SVG is inline or a data URL, so the canvas
 *  is never tainted and `toBlob` succeeds. A tainted canvas would throw at
 *  exactly the moment the holder pressed download. */
export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg_render_failed"));
    img.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
      "image/png",
    );
  });
}
