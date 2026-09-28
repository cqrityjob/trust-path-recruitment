// Security Passport — the social card, as the image a holder downloads.
//
// ── ONE DRAWING, PREVIEWED AND EXPORTED ────────────────────────────────
//
// The preview used to be one drawing (SocialFrame, in HTML) and the download
// another (an SVG string built separately), and they disagreed: a seal in
// one, a rosette in the other, different words under each credential. Now
// there is one. SocialFrame renders this component, serialises it once and
// shows exactly that string as an image; the download rasterises exactly that
// string with `svgToPngBlob`. What a holder previews is, byte for byte, what
// they download. social-image.tsx does the same off-screen, for a format no
// frame is showing.
//
// ── THE SHARED CARD'S VOCABULARY, NOT A THIRD ONE ──────────────────────
//
// The ground, the brand, the rule, and for each credential the shield
// (`ShieldMark`), its abbreviation (`shieldMarkText`), where it applies
// (`resolveCredentialScope` and `ScopeMark`: a drawn flag, a globe, or
// nothing when nobody stated it) and its trust word from the shared labeller
// — the pieces RecipientPassportCard draws a disclosure with. Nothing here
// decides trust or scope. No milestone emblem: the shared card has none.
//
// ── WHAT IT PRINTS, AND WHAT IT NEVER PRINTS ───────────────────────────
//
// Only `SocialCardModel`, which cannot carry an issuer, a date, a number, an
// employer or a scope restriction. A link and its QR code only when the model
// carries one (`verifyUrl`); otherwise a line saying the image is a snapshot,
// because a cached image outlives what it shows.
//
// Plain SVG attributes only -- no class, no stylesheet, no external font or
// image -- so it renders the same as an image and on a canvas.

import type { ReactNode } from "react";
import {
  PASSPORT_CARD_SURFACE,
  TRUST_PALETTE,
  passportCardSvgStops,
  shareFormat,
  type ShareFormat,
} from "@/lib/security-passport/design/trust-system";
import { FONT_STACK, wrap } from "@/lib/security-passport/social-export";
import type { SocialCardModel } from "@/lib/security-passport/social";
import type { SocialImageStrings } from "@/lib/security-passport/share-image";
import { resolveCredentialScope, shieldMarkText } from "@/lib/security-passport/credential-shield";
import { passportT, type PassportLang } from "@/lib/security-passport/i18n";
import { ScopeMark, ShieldMark } from "../CredentialShield";
import { BrandGlyph } from "../card/CardPrimitives";

/** The shared card's rim tones (RecipientPassportCard). */
const RIM = "#65b8c4";
const RIM_BRIGHT = "#a5f3fc";

/** The trust word's tone on the navy ground, as the shared card gives it.
 *  Supplementary: the word itself and the shield's treatment carry the state. */
const WORD_TONE: Readonly<Record<string, string>> = {
  verified: RIM_BRIGHT,
  documented: TRUST_PALETTE.ink,
  self_declared: TRUST_PALETTE.inkMuted,
};

export interface SocialCardSvgProps {
  readonly model: SocialCardModel;
  readonly format: ShareFormat;
  /** The image's language: its credential names already are. */
  readonly lang: PassportLang;
  readonly strings: SocialImageStrings;
  /** The QR code of `model.verifyUrl`. Never drawn without a link. */
  readonly qrDataUrl: string | null;
}

const r = (n: number) => Math.round(n * 10) / 10;

/** A generous width estimate, as elsewhere in the exports: an early wrap is
 *  invisible, an overflow is not. */
const charsFor = (width: number, size: number) => Math.max(6, Math.floor(width / (size * 0.56)));

function Text({
  x,
  y,
  size,
  fill,
  weight = 400,
  anchor,
  spacing,
  children,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  children: string;
}) {
  return (
    <text
      x={r(x)}
      y={r(y)}
      fontFamily={FONT_STACK}
      fontSize={r(size)}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={spacing === undefined ? undefined : r(spacing)}
    >
      {children}
    </text>
  );
}

/** A URL has no spaces to wrap at; it breaks where it must. */
function urlLines(url: string, perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < url.length && lines.length < maxLines; i += perLine) {
    lines.push(url.slice(i, i + perLine));
  }
  return lines;
}

interface Laid {
  readonly nodes: ReactNode[];
  readonly fits: boolean;
}

function layout(p: SocialCardSvgProps, s: number): Laid {
  const { width: W, height: H } = shareFormat(p.format);
  const landscape = W > H;
  const base = landscape ? W / 1200 : W / 1080;
  const u = base * s;
  const pad = (landscape ? 56 : 84) * base;
  const contentW = W - pad * 2;
  const link = p.model.verifyUrl;
  const qr = link ? p.qrDataUrl : null;
  const nodes: ReactNode[] = [];

  // ── Footer, measured first: everything above must end before it ─────
  let footerTop: number;
  const qrSize = (landscape ? 132 : 150) * u;
  if (link) {
    if (landscape) {
      const at = H - pad;
      footerTop = at - 50 * u;
      nodes.push(
        <Text key="f-verify" x={pad} y={at - 26 * u} size={19 * u} fill={TRUST_PALETTE.inkMuted}>
          {p.strings.verifyAtSource}
        </Text>,
        <Text key="f-url" x={pad} y={at} size={16 * u} fill={TRUST_PALETTE.inkFaint}>
          {urlLines(link, charsFor(contentW, 16 * u), 1)[0] ?? ""}
        </Text>,
      );
    } else {
      const qrY = H - pad - qrSize;
      footerTop = qrY - 10 * u;
      const tx = pad + qrSize + 32 * u;
      const tw = W - pad - tx;
      let ty = qrY + 30 * u;
      wrap(p.strings.verifyAtSource, charsFor(tw, 24 * u), 2).forEach((line, i) => {
        nodes.push(
          <Text key={`f-verify-${i}`} x={tx} y={ty} size={24 * u} fill={TRUST_PALETTE.inkMuted}>
            {line}
          </Text>,
        );
        ty += 32 * u;
      });
      ty += 6 * u;
      urlLines(link, charsFor(tw, 19 * u), 3).forEach((line, i) => {
        nodes.push(
          <Text key={`f-url-${i}`} x={tx} y={ty} size={19 * u} fill={TRUST_PALETTE.inkFaint}>
            {line}
          </Text>,
        );
        ty += 26 * u;
      });
      if (p.strings.staleWarning) {
        nodes.push(
          <Text
            key="f-stale"
            x={tx}
            y={ty + 6 * u}
            size={20 * u}
            weight={600}
            fill={TRUST_PALETTE.amber}
          >
            {p.strings.staleWarning}
          </Text>,
        );
      }
    }
  } else {
    const size = (landscape ? 18 : 22) * u;
    const lines = wrap(p.strings.snapshotNote, charsFor(contentW, size), 2);
    const lineH = size * 1.36;
    let ty = H - pad - (lines.length - 1) * lineH;
    footerTop = ty - size - 22 * u;
    nodes.push(
      <line
        key="f-rule"
        x1={r(pad)}
        y1={r(footerTop + 6 * u)}
        x2={r(W - pad)}
        y2={r(footerTop + 6 * u)}
        stroke={RIM}
        strokeOpacity={0.27}
        strokeWidth={r(Math.max(1, 1.5 * u))}
      />,
    );
    lines.forEach((line, i) => {
      nodes.push(
        <Text key={`f-note-${i}`} x={pad} y={ty} size={size} fill={TRUST_PALETTE.inkMuted}>
          {line}
        </Text>,
      );
      ty += lineH;
    });
  }
  // `qr` is the only gate: it is null unless the model carries a link.
  if (qr) {
    const qx = landscape ? W - pad - qrSize : pad;
    const qy = landscape ? pad : H - pad - qrSize;
    nodes.push(
      <rect
        key="qr-ground"
        x={r(qx - 10 * u)}
        y={r(qy - 10 * u)}
        width={r(qrSize + 20 * u)}
        height={r(qrSize + 20 * u)}
        rx={r(8 * u)}
        fill="#FFFFFF"
      />,
      <image
        key="qr"
        x={r(qx)}
        y={r(qy)}
        width={r(qrSize)}
        height={r(qrSize)}
        href={qr}
        preserveAspectRatio="none"
      />,
    );
  }

  // ── Identity band ────────────────────────────────────────────────────
  // Beside a landscape QR code the text keeps to its own column.
  const headW = landscape && qr ? contentW - qrSize - 36 * u : contentW;
  let y = pad;
  const glyph = 34 * u;
  nodes.push(
    <g key="brand" transform={`translate(${r(pad)} ${r(y)})`}>
      <BrandGlyph tone={TRUST_PALETTE.ink} height={r(glyph)} />
    </g>,
    <Text
      key="wordmark"
      x={pad + glyph * 0.9 + 12 * u}
      y={y + glyph * 0.8}
      size={30 * u}
      weight={600}
      fill={TRUST_PALETTE.ink}
    >
      CQrityjob
    </Text>,
  );
  y += glyph + 36 * u;
  nodes.push(
    <Text key="micro" x={pad} y={y} size={18 * u} weight={600} spacing={4.5 * u} fill={RIM_BRIGHT}>
      {p.strings.brand.toUpperCase()}
    </Text>,
  );
  y += 26 * u;

  const nameSize = (landscape ? 58 : 72) * u;
  for (const [i, line] of wrap(p.model.holderLabel, charsFor(headW, nameSize), 2).entries()) {
    y += nameSize * 1.12;
    nodes.push(
      <Text key={`name-${i}`} x={pad} y={y} size={nameSize} weight={600} fill={TRUST_PALETTE.ink}>
        {line}
      </Text>,
    );
  }
  y += 14 * u;
  for (const [i, line] of wrap(p.strings.professionLine, charsFor(headW, 28 * u), 2).entries()) {
    y += 36 * u;
    nodes.push(
      <Text key={`prof-${i}`} x={pad} y={y} size={28 * u} fill={TRUST_PALETTE.inkMuted}>
        {line}
      </Text>,
    );
  }
  y += 32 * u;
  // Never through a landscape QR code, however short the name above it.
  if (landscape && qr) y = Math.max(y, pad + qrSize + 24 * u);
  nodes.push(
    <line
      key="rule"
      x1={r(pad)}
      y1={r(y)}
      x2={r(W - pad)}
      y2={r(y)}
      stroke={RIM}
      strokeOpacity={0.6}
      strokeWidth={r(Math.max(1, 2 * u))}
    />,
  );
  y += 40 * u;

  // ── The credentials, as the shared card's shields ────────────────────
  const credentials = p.model.credentials;
  // A place and a trust word are one line each. Where one would run into the
  // next column, the whole card is drawn smaller instead.
  let columnsFit = true;
  if (credentials.length === 0) {
    nodes.push(
      <rect
        key="none-box"
        x={r(pad)}
        y={r(y)}
        width={r(contentW)}
        height={r(64 * u)}
        rx={r(12 * u)}
        fill="none"
        stroke={TRUST_PALETTE.inkFaint}
        strokeOpacity={0.4}
        strokeDasharray={`${r(8 * u)} ${r(6 * u)}`}
      />,
      <Text
        key="none"
        x={pad + 24 * u}
        y={y + 40 * u}
        size={20 * u}
        spacing={2.5 * u}
        fill={TRUST_PALETTE.inkMuted}
      >
        {p.strings.noVerified.toUpperCase()}
      </Text>,
    );
    y += 64 * u;
  } else {
    const slotW = contentW / 3;
    const x0 = pad + (contentW - credentials.length * slotW) / 2;
    const shield = 92 * u;
    const top = y;
    let bottom = y;
    credentials.forEach((c, i) => {
      const cx = x0 + slotW * (i + 0.5);
      const name = p.lang === "sv" ? c.nameSv : c.nameEn;
      const scope = resolveCredentialScope(
        {
          global: c.scope.global,
          jurisdictionCode: c.scope.jurisdictionCode,
          subJurisdictionCode: c.scope.subJurisdictionCode,
        },
        p.lang,
      );
      nodes.push(
        <g key={`shield-${c.id}`} transform={`translate(${r(cx - shield / 2)} ${r(top)})`}>
          <ShieldMark state={c.state} size={r(shield)} />
        </g>,
      );
      let cy = top + shield + 36 * u;
      nodes.push(
        <Text
          key={`mark-${c.id}`}
          x={cx}
          y={cy}
          size={30 * u}
          weight={700}
          anchor="middle"
          fill={TRUST_PALETTE.ink}
        >
          {shieldMarkText({ code: c.code, name }) ?? "—"}
        </Text>,
      );
      cy += 8 * u;
      for (const [j, line] of wrap(name, charsFor(slotW - 28 * u, 21 * u), 3).entries()) {
        cy += 27 * u;
        nodes.push(
          <Text
            key={`name-${c.id}-${j}`}
            x={cx}
            y={cy}
            size={21 * u}
            weight={500}
            anchor="middle"
            fill={TRUST_PALETTE.ink}
          >
            {line}
          </Text>,
        );
      }
      // "Not stated" is a fact for the Passport's row, where it can be
      // corrected; on a shield it would read as a property of the credential.
      if (scope.kind !== "not_stated") {
        cy += 14 * u;
        const markH = 20 * u;
        const markW = scope.flag ? Math.round(markH) * 1.5 : markH;
        const labelSize = 19 * u;
        const labelW = scope.label.length * labelSize * 0.55;
        if (markW + 8 * u + labelW > slotW - 16 * u) columnsFit = false;
        const sx = cx - (markW + 8 * u + labelW) / 2;
        nodes.push(
          <g
            key={`scope-${c.id}`}
            transform={`translate(${r(sx)} ${r(cy)})`}
            color={TRUST_PALETTE.inkMuted}
          >
            <ScopeMark scope={scope} size={Math.round(markH)} />
          </g>,
          <Text
            key={`scope-label-${c.id}`}
            x={sx + markW + 8 * u}
            y={cy + markH * 0.78}
            size={labelSize}
            fill={TRUST_PALETTE.inkMuted}
          >
            {scope.label}
          </Text>,
        );
        cy += markH;
      }
      cy += 30 * u;
      const word = passportT(c.statusWordKey, p.lang).toUpperCase();
      // Spaced bold capitals run wider than charsFor's average.
      if (word.length * (17 * u * 0.72 + 2.4 * u) > slotW - 16 * u) columnsFit = false;
      nodes.push(
        <Text
          key={`word-${c.id}`}
          x={cx}
          y={cy}
          size={17 * u}
          weight={600}
          spacing={2.4 * u}
          anchor="middle"
          fill={WORD_TONE[c.state] ?? TRUST_PALETTE.inkMuted}
        >
          {word}
        </Text>,
      );
      bottom = Math.max(bottom, cy + 12 * u);
    });
    for (let i = 1; i < credentials.length; i += 1) {
      const x = x0 + slotW * i;
      nodes.push(
        <line
          key={`divider-${i}`}
          x1={r(x)}
          y1={r(top)}
          x2={r(x)}
          y2={r(bottom)}
          stroke={TRUST_PALETTE.ink}
          strokeOpacity={0.15}
          strokeWidth={r(Math.max(1, 1.5 * u))}
        />,
      );
    }
    y = bottom;
  }

  return { nodes, fits: columnsFit && y + 24 * u <= footerTop };
}

/**
 * The whole card at its format's true pixel size.
 *
 * Laid out at the largest scale at which everything fits above the footer --
 * a long name, a two-line title and three credentials still fit a 720×400
 * card, smaller, rather than running into the QR code.
 */
export function SocialCardSvg(props: SocialCardSvgProps) {
  const { width: W, height: H } = shareFormat(props.format);
  const start = props.format === "story" ? 1.35 : 1;
  let laid = layout(props, start);
  for (let s = start - 0.05; !laid.fits && s >= 0.5; s -= 0.05) laid = layout(props, s);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      data-social-card={props.format}
    >
      {/* The one card ground -- see PASSPORT_CARD_SURFACE. No engraving:
          nothing is drawn behind the text, the shields or the QR code. */}
      <defs>
        <linearGradient
          id="sp-social-ground"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
          dangerouslySetInnerHTML={{ __html: passportCardSvgStops() }}
        />
      </defs>
      <rect width={W} height={H} fill="url(#sp-social-ground)" />
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        fill="none"
        stroke={PASSPORT_CARD_SURFACE.border}
        strokeWidth={2}
      />
      {laid.nodes}
    </svg>
  );
}
