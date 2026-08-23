// Security Passport — exportable social assets.
//
// ── WHY A PURPOSE-BUILT SVG AND NOT A SCREENSHOT OF THE DOM ────────────
//
// The obvious route is a DOM-to-image library pointed at <SocialFrame>. It
// was rejected for two reasons, in this order:
//
//   1. Correctness. Those libraries inline computed styles and rasterise
//      whatever the browser happened to lay out — web fonts that had not
//      loaded, a Tailwind class that resolved differently at 375px, a
//      cropped edge. The artifact people keep would be a lottery.
//   2. Provenance. A serialiser walks the live tree, so what lands in the
//      exported image is whatever is in that tree. This module can only put
//      in what it is given, and it is given `SocialCardModel` — the type
//      that structurally cannot carry an employer, an issuer, a date or a
//      certificate number.
//
// The output is one self-contained SVG string: no external font, no
// external image, no CSS. The QR arrives as a data URL, so the SVG can be
// drawn onto a canvas without tainting it and `toBlob` still works.
//
// ── THE IMAGE IS NOT THE CREDENTIAL ────────────────────────────────────
//
// Every format carries the verification URL and the "check at source" line,
// because a cached image outlives the thing it depicts. That line is not
// decoration; it is what stops the image being mistaken for the record.

import {
  SHARE_FORMATS,
  TRUST_PALETTE,
  milestoneStyle,
  shareFormat,
  type ShareFormat,
} from "./design/trust-system";
import { SYMBOL_CODES, SYMBOL_VIEWBOX, credentialSymbolMarkup } from "./design/credential-symbols";
import type { SocialCardModel } from "./social";
import type { PassportLang } from "./i18n";

export { SHARE_FORMATS };

/** Escapes text for XML content. Every string here originates from a holder
 *  — a name, a credential title — so it is never interpolated raw. */
function esc(value: string): string {
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
function wrap(text: string, maxChars: number, maxLines: number): string[] {
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

const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, -apple-system, sans-serif";

export interface SocialExportStrings {
  readonly brand: string;
  readonly professionLine: string;
  readonly verifiedLabel: string;
  readonly yearsLabel: string;
  readonly verifyAtSource: string;
  readonly noVerifiedYet: string;
  readonly staleWarning: string | null;
}

/** Guilloche-flavoured background: concentric hairline arcs, the engraving
 *  vocabulary the Passport Card already uses. Cheap in bytes, and it is what
 *  makes an exported PNG recognisably the same object as the card on screen
 *  rather than a generic banner. */
function engraving(width: number, height: number): string {
  const parts: string[] = [];
  const cx = width * 0.82;
  const cy = height * 0.18;
  for (let i = 0; i < 14; i += 1) {
    const r = width * 0.08 + i * (width * 0.035);
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${TRUST_PALETTE.blueLuminous}" stroke-opacity="0.06" stroke-width="1"/>`,
    );
  }
  for (let i = 0; i < 10; i += 1) {
    const y = height * 0.62 + i * (height * 0.012);
    parts.push(
      `<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" stroke="${TRUST_PALETTE.blueLuminous}" stroke-opacity="0.04" stroke-width="1"/>`,
    );
  }
  return parts.join("");
}

function seal(cx: number, cy: number, r: number, rim: string, rimBright: string): string {
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${rim}" stroke-width="${(r * 0.06).toFixed(1)}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.86).toFixed(1)}" fill="none" stroke="${rimBright}" stroke-opacity="0.7" stroke-width="${(r * 0.02).toFixed(1)}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.72).toFixed(1)}" fill="${rim}" fill-opacity="0.12"/>`,
  ].join("");
}

export function buildSocialSvg(
  model: SocialCardModel,
  format: ShareFormat,
  lang: PassportLang,
  strings: SocialExportStrings,
  qrDataUrl: string | null,
): string {
  const spec = shareFormat(format);
  const { width: W, height: H } = spec;
  const compact = format === "compact" || format === "og";
  const pad = Math.round(W * (compact ? 0.055 : 0.085));

  const mStyle = milestoneStyle(model.milestoneYears);

  const scale = compact ? W / 1200 : W / 1080;
  const fs = (n: number) => Math.round(n * scale);

  let y = pad + fs(compact ? 44 : 70);
  const body: string[] = [];

  // Brand
  body.push(
    `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(30)}" font-weight="700" letter-spacing="${fs(3)}" fill="${TRUST_PALETTE.ink}">${esc(strings.brand.toUpperCase())}</text>`,
  );
  y += fs(compact ? 18 : 26);
  body.push(
    `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="${TRUST_PALETTE.gold}" stroke-opacity="0.6" stroke-width="${Math.max(1, fs(2))}"/>`,
  );

  // Holder
  y += fs(compact ? 62 : 96);
  for (const line of wrap(model.holderLabel, compact ? 26 : 20, 2)) {
    body.push(
      `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(compact ? 60 : 76)}" font-weight="600" fill="${TRUST_PALETTE.ink}">${esc(line)}</text>`,
    );
    y += fs(compact ? 66 : 84);
  }

  body.push(
    `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(30)}" letter-spacing="${fs(2)}" fill="${TRUST_PALETTE.inkMuted}">${esc(strings.professionLine)}</text>`,
  );

  // Milestone — the single permitted prominent number, and only when the
  // whole threshold is verified. Nothing else on this image is a figure.
  if (model.milestoneYears !== null && !model.staleWarning) {
    const r = fs(compact ? 78 : 110);
    const cx = W - pad - r;
    const cy = compact ? Math.round(H * 0.5) : Math.round(H * 0.42);
    body.push(seal(cx, cy, r, mStyle.rim, mStyle.rimBright));
    body.push(
      `<text x="${cx}" y="${cy + fs(compact ? 6 : 10)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${fs(compact ? 66 : 92)}" font-weight="700" fill="${TRUST_PALETTE.ink}">${model.milestoneYears}</text>`,
      `<text x="${cx}" y="${cy + fs(compact ? 40 : 56)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${fs(20)}" letter-spacing="${fs(2)}" fill="${TRUST_PALETTE.inkMuted}">${esc(strings.yearsLabel.toUpperCase())}</text>`,
      `<text x="${cx}" y="${cy + r + fs(38)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="${fs(20)}" letter-spacing="${fs(2)}" fill="${mStyle.rimBright}">${esc(strings.verifiedLabel.toUpperCase())}</text>`,
    );
  }

  // Verified credential NAMES only. No issuer, no date, no number — the
  // model has no field for any of them.
  y += fs(compact ? 54 : 96);
  if (model.verifiedCredentials.length === 0) {
    body.push(
      `<text x="${pad}" y="${y}" font-family="${FONT_STACK}" font-size="${fs(26)}" fill="${TRUST_PALETTE.inkFaint}">${esc(strings.noVerifiedYet)}</text>`,
    );
  } else {
    for (const cred of model.verifiedCredentials) {
      const name = lang === "sv" ? cred.nameSv : cred.nameEn;
      const rowH = fs(64);
      body.push(
        `<rect x="${pad}" y="${y - fs(34)}" width="${W - pad * 2}" height="${rowH}" rx="${fs(8)}" fill="${TRUST_PALETTE.navyRaised}" stroke="${TRUST_PALETTE.gold}" stroke-opacity="0.35"/>`,
      );
      // The credential mark, identical geometry to the on-screen card.
      // Everything in this list is verified and active, so the approved
      // state is the only one that can be exported.
      const symSize = fs(48);
      const symX = pad + fs(10);
      const symY = y - fs(34) + Math.round((rowH - symSize) / 2);
      if (cred.code) {
        body.push(
          `<g transform="translate(${symX} ${symY}) scale(${(symSize / SYMBOL_VIEWBOX).toFixed(4)})">${credentialSymbolMarkup(cred.code, "verified")}</g>`,
        );
      }
      const textX = cred.code ? symX + symSize + fs(16) : pad + fs(20);
      body.push(
        `<text x="${textX}" y="${y + fs(6)}" font-family="${FONT_STACK}" font-size="${fs(28)}" fill="${TRUST_PALETTE.ink}">${esc(wrap(name, compact ? 40 : 30, 1)[0] ?? "")}</text>`,
      );
      y += fs(compact ? 70 : 84);
    }
  }

  // Verification block, always last and always present.
  const qrSize = fs(compact ? 96 : 150);
  const qrX = pad;
  const qrY = H - pad - qrSize;
  if (qrDataUrl) {
    body.push(
      `<rect x="${qrX - fs(8)}" y="${qrY - fs(8)}" width="${qrSize + fs(16)}" height="${qrSize + fs(16)}" rx="${fs(6)}" fill="#FFFFFF"/>`,
      `<image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="${qrDataUrl}" preserveAspectRatio="none"/>`,
    );
  }

  const textX = qrDataUrl ? qrX + qrSize + fs(28) : pad;
  body.push(
    `<text x="${textX}" y="${qrY + fs(30)}" font-family="${FONT_STACK}" font-size="${fs(24)}" letter-spacing="${fs(1)}" fill="${TRUST_PALETTE.inkMuted}">${esc(strings.verifyAtSource)}</text>`,
    `<text x="${textX}" y="${qrY + fs(66)}" font-family="${FONT_STACK}" font-size="${fs(22)}" fill="${TRUST_PALETTE.inkFaint}">${esc(model.verifyUrl)}</text>`,
  );

  if (strings.staleWarning) {
    body.push(
      `<text x="${textX}" y="${qrY + fs(102)}" font-family="${FONT_STACK}" font-size="${fs(22)}" font-weight="600" fill="${TRUST_PALETTE.amber}">${esc(strings.staleWarning)}</text>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="sp-ground" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${TRUST_PALETTE.navy}"/>`,
    `<stop offset="100%" stop-color="${TRUST_PALETTE.navyDeep}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#sp-ground)"/>`,
    engraving(W, H),
    `<rect x="${Math.round(pad / 2)}" y="${Math.round(pad / 2)}" width="${W - pad}" height="${H - pad}" fill="none" stroke="${TRUST_PALETTE.gold}" stroke-opacity="0.25" stroke-width="${Math.max(1, fs(2))}"/>`,
    body.join(""),
    `</svg>`,
  ].join("");
}

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
      `<g transform="translate(${x} ${symbolY}) scale(${(symbolSize / SYMBOL_VIEWBOX).toFixed(4)})">${credentialSymbolMarkup(code, "self_declared")}</g>`,
    );
  });

  body.push(
    `<text x="${pad}" y="${H - pad + 6}" font-family="${FONT_STACK}" font-size="${fs(22)}" fill="${TRUST_PALETTE.inkFaint}">${esc(strings.note)}</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="sp-og-ground" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${TRUST_PALETTE.navyRaised}"/>`,
    `<stop offset="100%" stop-color="${TRUST_PALETTE.navyDeep}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#sp-og-ground)"/>`,
    engraving(W, H),
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
