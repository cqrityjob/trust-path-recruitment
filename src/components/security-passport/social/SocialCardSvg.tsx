// Security Passport — the ONE Passport image a holder previews, downloads and
// shares.
//
// ── ONE HOLDER, ONE PASSPORT, ONE IMAGE ────────────────────────────────
//
// Whatever the holder selected is on this one drawing: four credentials, six,
// eleven. There is no second image, no "1 / 2", and no count at which one
// begins. The previous version drew three columns and turned a larger
// selection into a set of images; that treated the drawing's columns as a
// product rule. The rule is the other way round: the layout adapts to the
// credentials (owner decision, 2026-09-29).
//
// ── HOLDER → JURISDICTION → SHIELDS → TRUST STATE ──────────────────────
//
// The holder's identity leads and stays dominant. Under it the credentials
// are grouped by where they apply (passport-groups.ts): one heading per
// controlled scope -- a flag and "SVERIGE", a globe and "GLOBAL", or the
// unplaced credentials under their own honest heading -- with every shield of
// that scope beneath it. Each shield keeps its own treatment, abbreviation,
// name and trust word: a group never makes its members look collectively
// verified, and a heading never says anything about trust.
//
// ── THE LAYOUT ADAPTS; THE CREDENTIALS DO NOT ──────────────────────────
//
// Five density tiers, from the spacious three-shield presentation down to a
// compact grid, are tried in order until the whole Passport fits above the
// footer. A tier changes shield size, type size, how many lines a name gets
// and how many shields share a row -- never which credentials are drawn. No
// critical text (an abbreviation, a name, a trust word, a heading) is ever
// drawn below `READABILITY_FLOOR`: a Passport that would need smaller text
// than that is reported as not fitting (`data-passport-fits`), which the
// guards refuse, rather than silently shrunk or silently cut.
//
// ── ONE DRAWING, PREVIEWED AND EXPORTED ────────────────────────────────
//
// SocialFrame renders this component, serialises it once and shows exactly
// that string as an image; the download and the device share rasterise
// exactly that string. What a holder previews is, byte for byte, what they
// share. Plain SVG attributes only -- no class, no stylesheet, no external
// font or image -- so it renders the same as an image and on a canvas.
//
// ── WHAT IT PRINTS, AND WHAT IT NEVER PRINTS ───────────────────────────
//
// Only `SocialCardModel`, which cannot carry an issuer, a date, a number, an
// employer or a scope restriction. A link and its QR code only when the model
// carries one (`verifyUrl`); otherwise a line saying the image is a snapshot,
// because a cached image outlives what it shows.

import type { ReactNode } from "react";
import {
  PASSPORT_CARD_SURFACE,
  TRUST_PALETTE,
  passportCardSvgStops,
  shareFormat,
  type ShareFormat,
} from "@/lib/security-passport/design/trust-system";
import { FONT_STACK, wrap } from "@/lib/security-passport/social-export";
import type { SocialCardModel, SocialCredentialName } from "@/lib/security-passport/social";
import type { SocialImageStrings } from "@/lib/security-passport/share-image";
import { shieldMarkText, type CredentialScope } from "@/lib/security-passport/credential-shield";
import { credentialMark } from "@/lib/security-passport/credentials";
import {
  groupPassportCredentials,
  passportDensity,
  type PassportGroup,
} from "@/lib/security-passport/passport-groups";
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

/**
 * The smallest a critical text may be drawn, in the format's own pixels per
 * 1080 of width (1200 for a landscape format). 14 px on a 1080-wide image is
 * the floor below which an abbreviation or a trust word stops being readable
 * once a platform scales the image to a phone. Nothing critical is drawn
 * smaller; a Passport that would need it does not fit, and says so.
 */
export const READABILITY_FLOOR = 14;

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

/** Width per character in em, by weight: generous, so a line that only
 *  nearly fits is drawn smaller rather than clipped. */
const EM = { regular: 0.56, medium: 0.58, bold: 0.62, caps: 0.72 } as const;

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

/**
 * A line that must stay inside `maxW`: drawn at `size` when it fits, smaller
 * down to the floor when it does not, and at the floor shortened with an
 * ellipsis rather than ever drawn past its space or below the floor.
 */
function fitLine(
  text: string,
  size: number,
  em: number,
  maxW: number,
  floor: number,
  spacing = 0,
): { text: string; size: number } {
  // A hair of tolerance: the shrunk size is solved from this same estimate,
  // and floating point must not turn "exactly fits" into an ellipsis.
  const width = (t: string, s: number) => t.length * (s * em + spacing) - 0.01;
  if (width(text, size) <= maxW) return { text, size };
  const shrunk = Math.max(floor, (maxW / text.length - spacing) / em);
  if (width(text, shrunk) <= maxW) return { text, size: shrunk };
  let t = text;
  while (t.length > 1 && width(`${t}…`, floor) > maxW) t = t.slice(0, -1);
  return { text: `${t}…`, size: floor };
}

/** "EGENRAPPORTERAD" → "Egenrapporterad", as the HTML shield sets its word. */
function sentenceCase(word: string): string {
  const lower = word.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

/* ------------------------------------------------------------------ */
/* Density tiers                                                       */
/* ------------------------------------------------------------------ */

interface Tier {
  readonly id: "spacious" | "roomy" | "medium" | "dense" | "compact" | "micro";
  readonly shield: number;
  readonly mark: number;
  readonly name: number;
  /** Lines a name gets when the shield carries a GOVERNED mark. A name-derived
   *  or absent mark does not identify the credential on its own ("SIA" is two
   *  licences), so such a name always gets at least two lines. */
  readonly nameLines: number;
  readonly word: number;
  /** Spaced capitals, as the spacious card has always worn its trust word;
   *  the denser tiers set the same word in normal case so it keeps its size. */
  readonly wordCaps: boolean;
  readonly cellW: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly header: number;
  readonly flag: number;
  /** Space between a group's heading and its shields, rule included. */
  readonly headPad: number;
  /** How much of its full size the identity band keeps at this tier. The
   *  holder stays the largest thing on the image at every tier; a dense
   *  Passport simply gives the credentials a little more of the height. */
  readonly identity: number;
}

const TIERS: readonly Tier[] = [
  {
    id: "spacious",
    shield: 92,
    mark: 30,
    name: 21,
    nameLines: 3,
    word: 17,
    wordCaps: true,
    cellW: 280,
    gapX: 12,
    gapY: 30,
    header: 18,
    flag: 20,
    headPad: 24,
    identity: 1,
  },
  {
    id: "roomy",
    shield: 84,
    mark: 28,
    name: 20,
    nameLines: 3,
    word: 16,
    wordCaps: true,
    cellW: 226,
    gapX: 2,
    gapY: 28,
    header: 18,
    flag: 20,
    headPad: 24,
    identity: 1,
  },
  {
    id: "medium",
    shield: 72,
    mark: 26,
    name: 19,
    nameLines: 2,
    word: 15,
    wordCaps: true,
    cellW: 214,
    gapX: 12,
    gapY: 26,
    header: 17,
    flag: 18,
    headPad: 22,
    identity: 1,
  },
  {
    id: "dense",
    shield: 60,
    mark: 22,
    name: 17,
    nameLines: 2,
    word: 15,
    wordCaps: false,
    cellW: 174,
    gapX: 10,
    gapY: 22,
    header: 16,
    flag: 16,
    headPad: 20,
    identity: 0.95,
  },
  {
    id: "compact",
    shield: 50,
    mark: 20,
    name: 15,
    nameLines: 2,
    word: 14,
    wordCaps: false,
    cellW: 152,
    gapX: 8,
    gapY: 18,
    header: 15,
    flag: 15,
    headPad: 18,
    identity: 0.9,
  },
  {
    id: "micro",
    shield: 44,
    mark: 18,
    name: 14,
    nameLines: 0,
    word: 14,
    wordCaps: false,
    cellW: 140,
    gapX: 6,
    gapY: 14,
    header: 14,
    flag: 14,
    headPad: 16,
    identity: 0.85,
  },
];

/* ------------------------------------------------------------------ */
/* The credential area: groups → blocks → bands                        */
/* ------------------------------------------------------------------ */

interface Cell {
  readonly c: SocialCredentialName;
  readonly mark: { text: string; size: number } | null;
  readonly name: readonly { text: string; size: number }[];
  readonly word: { text: string; size: number };
  readonly height: number;
}

interface Block {
  readonly group: PassportGroup;
  readonly header: { text: string; size: number };
  readonly cells: readonly Cell[];
  readonly cols: number;
  readonly rows: readonly (readonly Cell[])[];
  readonly width: number;
  readonly height: number;
}

interface Band {
  readonly blocks: readonly Block[];
  readonly width: number;
  readonly height: number;
}

interface Area {
  readonly x: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

interface Geometry {
  readonly tier: Tier;
  readonly bands: readonly Band[];
  readonly height: number;
  /** True when every group's shields sit on one row: the arrangement the
   *  search prefers, so four credentials of one country are four across
   *  rather than three and an orphan. */
  readonly singleRows: boolean;
}

function measureCell(
  c: SocialCredentialName,
  tier: Tier,
  u: number,
  floor: number,
  lang: PassportLang,
): Cell {
  const cellW = tier.cellW * u;
  const inner = cellW - 10 * u;
  const fullName = lang === "sv" ? c.nameSv : c.nameEn;
  const governed = credentialMark(c.code) !== null;
  const markText = shieldMarkText({ code: c.code, name: fullName });
  // In the denser tiers a name does not repeat the abbreviation drawn just
  // above it: "SIRA" over "Security Cadre Card — Security Supervisor" keeps
  // the words that tell two cadre cards apart.
  const name =
    !tier.wordCaps && markText && !governed && fullName.startsWith(markText)
      ? fullName.slice(markText.length).replace(/^[\s,:;–—-]+/u, "") || fullName
      : fullName;
  const mark = markText ? fitLine(markText, tier.mark * u, EM.bold, inner, floor) : null;
  // A governed mark identifies the credential on its own; a name-derived mark
  // ("SIA", "SIRA") is shared by several, so its name keeps three lines.
  const lines =
    governed && markText ? tier.nameLines : Math.max(tier.id === "micro" ? 2 : 3, tier.nameLines);
  const nameLines =
    lines === 0
      ? []
      : wrap(name, charsFor(inner, tier.name * u), lines).map((line) =>
          fitLine(line, tier.name * u, EM.medium, inner, floor),
        );
  const wordRaw = passportT(c.statusWordKey, lang);
  // The same word at every tier: spaced capitals where there is room, and in
  // the denser tiers written as the HTML shield writes it ("Egenrapporterad"),
  // which keeps it at full size where capitals would have to shrink.
  const word = tier.wordCaps
    ? fitLine(wordRaw.toUpperCase(), tier.word * u, EM.caps, inner, floor, 2.2 * u)
    : fitLine(sentenceCase(wordRaw), tier.word * u, EM.medium, inner, floor);
  let h = tier.shield * u;
  if (mark) h += 10 * u + mark.size;
  h += nameLines.reduce((sum, l) => sum + l.size * 1.3, 0) + (nameLines.length ? 4 * u : 0);
  h += 10 * u + word.size + 4 * u;
  return { c, mark, name: nameLines, word, height: h };
}

function scopeMarkWidth(scope: CredentialScope, size: number): number {
  return scope.flag ? Math.round(size) * 1.5 : size;
}

function measureBlock(
  group: PassportGroup,
  tier: Tier,
  u: number,
  floor: number,
  maxCols: number,
  areaW: number,
  lang: PassportLang,
  notStated: string,
): Block {
  const cells = group.credentials.map((c) => measureCell(c, tier, u, floor, lang));
  const cols = Math.max(1, Math.min(cells.length, maxCols));
  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const cellsW = cols * tier.cellW * u + (cols - 1) * tier.gapX * u;
  const label = (group.scope.kind === "not_stated" ? notStated : group.scope.label).toUpperCase();
  const markW = scopeMarkWidth(group.scope, tier.flag * u);
  const header = fitLine(label, tier.header * u, EM.caps, areaW - markW - 8 * u, floor, 2 * u);
  const headerW = markW + 8 * u + header.text.length * (header.size * EM.caps + 2 * u);
  const headerH = (tier.flag + tier.headPad) * u;
  const rowsH = rows.reduce((sum, row) => sum + Math.max(...row.map((c) => c.height)), 0);
  return {
    group,
    header,
    cells,
    cols,
    rows,
    width: Math.max(cellsW, headerW),
    height: headerH + rowsH + (rows.length - 1) * tier.gapY * u,
  };
}

/** Blocks flow left to right into bands, wrapping where the next would not
 *  fit; a block wider than the area gets a band of its own. */
function flowBands(blocks: readonly Block[], areaW: number, gap: number): Band[] {
  const bands: Band[] = [];
  let current: Block[] = [];
  let used = 0;
  const close = () => {
    if (current.length === 0) return;
    bands.push({
      blocks: current,
      width: used,
      height: Math.max(...current.map((b) => b.height)),
    });
    current = [];
    used = 0;
  };
  for (const b of blocks) {
    const needed = current.length ? used + gap + b.width : b.width;
    if (current.length && needed > areaW) close();
    used = current.length ? used + gap + b.width : b.width;
    current.push(b);
  }
  close();
  return bands;
}

function measure(
  groups: readonly PassportGroup[],
  tier: Tier,
  u: number,
  floor: number,
  area: Area,
  lang: PassportLang,
  notStated: string,
): Geometry {
  const maxCols = Math.max(
    1,
    Math.floor((area.width + tier.gapX * u) / ((tier.cellW + tier.gapX) * u)),
  );
  const blocks = groups.map((g) =>
    measureBlock(g, tier, u, floor, maxCols, area.width, lang, notStated),
  );
  const bands = flowBands(blocks, area.width, 32 * u);
  const height = bands.reduce((sum, b) => sum + b.height, 0) + (bands.length - 1) * tier.gapY * u;
  return { tier, bands, height, singleRows: blocks.every((b) => b.rows.length === 1) };
}

function drawCredentials(geometry: Geometry, u: number, area: Area, nodes: ReactNode[]): number {
  const { tier, bands } = geometry;
  let y = area.top;
  for (const band of bands) {
    let x = area.x + (area.width - band.width) / 2;
    for (const block of band.blocks) {
      const g = block.group;
      // ── Heading: the shared scope, once ─────────────────────────────
      const flagH = tier.flag * u;
      const markW = scopeMarkWidth(g.scope, flagH);
      const headerTone =
        g.scope.kind === "not_stated" ? TRUST_PALETTE.inkFaint : TRUST_PALETTE.inkMuted;
      nodes.push(
        <g key={`group-mark-${g.key}`} transform={`translate(${r(x)} ${r(y)})`} color={headerTone}>
          <ScopeMark scope={g.scope} size={Math.round(flagH)} />
        </g>,
        <Text
          key={`group-label-${g.key}`}
          x={x + markW + 8 * u}
          y={y + flagH * 0.82}
          size={block.header.size}
          weight={600}
          spacing={2 * u}
          fill={headerTone}
        >
          {block.header.text}
        </Text>,
        <line
          key={`group-rule-${g.key}`}
          x1={r(x)}
          y1={r(y + flagH + (tier.headPad / 3) * u)}
          x2={r(x + block.width)}
          y2={r(y + flagH + (tier.headPad / 3) * u)}
          stroke={RIM}
          strokeOpacity={0.35}
          strokeWidth={r(Math.max(1, 1.2 * u))}
        />,
      );
      // ── Its shields ──────────────────────────────────────────────────
      let cy = y + flagH + tier.headPad * u;
      for (const row of block.rows) {
        const rowW = row.length * tier.cellW * u + (row.length - 1) * tier.gapX * u;
        let cx = x + (block.width - rowW) / 2 + (tier.cellW * u) / 2;
        for (const cell of row) {
          const c = cell.c;
          const shield = tier.shield * u;
          nodes.push(
            <g
              key={`shield-${c.id}`}
              data-passport-shield={c.id}
              data-passport-group={g.key}
              transform={`translate(${r(cx - shield / 2)} ${r(cy)})`}
            >
              <ShieldMark state={c.state} size={r(shield)} />
            </g>,
          );
          let ty = cy + shield;
          if (cell.mark) {
            ty += 10 * u + cell.mark.size;
            nodes.push(
              <Text
                key={`mark-${c.id}`}
                x={cx}
                y={ty - cell.mark.size * 0.12}
                size={cell.mark.size}
                weight={700}
                anchor="middle"
                fill={TRUST_PALETTE.ink}
              >
                {cell.mark.text}
              </Text>,
            );
          }
          for (const [j, line] of cell.name.entries()) {
            ty += line.size * 1.3;
            nodes.push(
              <Text
                key={`name-${c.id}-${j}`}
                x={cx}
                y={ty - line.size * 0.25}
                size={line.size}
                weight={500}
                anchor="middle"
                fill={TRUST_PALETTE.ink}
              >
                {line.text}
              </Text>,
            );
          }
          if (cell.name.length) ty += 4 * u;
          ty += 10 * u + cell.word.size;
          nodes.push(
            <Text
              key={`word-${c.id}`}
              x={cx}
              y={ty - cell.word.size * 0.18}
              size={cell.word.size}
              weight={600}
              spacing={tier.wordCaps ? 2.2 * u : undefined}
              anchor="middle"
              fill={WORD_TONE[c.state] ?? TRUST_PALETTE.inkMuted}
            >
              {cell.word.text}
            </Text>,
          );
          cx += (tier.cellW + tier.gapX) * u;
        }
        cy += Math.max(...row.map((c) => c.height)) + tier.gapY * u;
      }
      x += block.width + 32 * u;
    }
    y += band.height + tier.gapY * u;
  }
  return y;
}

/* ------------------------------------------------------------------ */
/* The whole card                                                      */
/* ------------------------------------------------------------------ */

interface Laid {
  readonly nodes: ReactNode[];
  readonly fits: boolean;
  /** How far the credentials run past their area, in the format's pixels;
   *  zero when they fit. Reported, never hidden. */
  readonly overflow: number;
  /** Fits, and no group had to wrap its shields onto a second row. */
  readonly clean: boolean;
  readonly tier: Tier["id"];
  readonly groups: readonly PassportGroup[];
}

function layout(p: SocialCardSvgProps, s: number, tier: Tier): Laid {
  const { width: W, height: H } = shareFormat(p.format);
  const landscape = W > H;
  const base = landscape ? W / 1200 : W / 1080;
  const u = base * s;
  const floor = READABILITY_FLOOR * base;
  const pad = (landscape ? 56 : 84) * base;
  const contentW = W - pad * 2;
  const link = p.model.verifyUrl;
  const qr = link ? p.qrDataUrl : null;
  const nodes: ReactNode[] = [];
  const groups = groupPassportCredentials(p.model.credentials, p.lang);

  // ── Landscape: identity and footer in a column; the Passport beside it ─
  // A landscape format is short. The holder, the brand and the footer share
  // the left column so the credentials get the full height on the right.
  const leftW = landscape ? Math.round(contentW * 0.28) : contentW;

  // ── Footer, measured first: everything above must end before it ─────
  let footerTop: number;
  const qrSize = (landscape ? 120 : 150) * u;
  if (link) {
    if (landscape) {
      const qrY = H - pad - qrSize;
      footerTop = qrY - 18 * u;
      const tx = pad + qrSize + 14 * u;
      const tw = leftW - qrSize - 14 * u;
      let ty = qrY + 18 * u;
      wrap(p.strings.verifyAtSource, charsFor(tw, 15 * u), 3).forEach((line, i) => {
        nodes.push(
          <Text key={`f-verify-${i}`} x={tx} y={ty} size={15 * u} fill={TRUST_PALETTE.inkMuted}>
            {line}
          </Text>,
        );
        ty += 20 * u;
      });
      ty += 4 * u;
      urlLines(link, charsFor(tw, 14 * u), 5).forEach((line, i) => {
        nodes.push(
          <Text key={`f-url-${i}`} x={tx} y={ty} size={14 * u} fill={TRUST_PALETTE.inkFaint}>
            {line}
          </Text>,
        );
        ty += 18 * u;
      });
    } else {
      // Portrait: the QR code sits beside the identity band, top right, and
      // the footer holds only the words and the address -- so the QR code
      // costs the credentials no height.
      const size = 22 * u;
      const urls = urlLines(link, charsFor(contentW, 19 * u), 3);
      let ty = H - pad - (urls.length - 1) * 26 * u;
      const verifyY = ty - 32 * u;
      footerTop = verifyY - size - 22 * u;
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
        <Text key="f-verify" x={pad} y={verifyY} size={size} fill={TRUST_PALETTE.inkMuted}>
          {p.strings.verifyAtSource}
        </Text>,
      );
      urls.forEach((line, i) => {
        nodes.push(
          <Text key={`f-url-${i}`} x={pad} y={ty} size={19 * u} fill={TRUST_PALETTE.inkFaint}>
            {line}
          </Text>,
        );
        ty += 26 * u;
      });
      if (p.strings.staleWarning) {
        nodes.push(
          <Text
            key="f-stale"
            x={pad}
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
    const size = (landscape ? 16 : 22) * u;
    const lines = wrap(p.strings.snapshotNote, charsFor(leftW, size), landscape ? 4 : 2);
    const lineH = size * 1.36;
    let ty = H - pad - (lines.length - 1) * lineH;
    footerTop = ty - size - 22 * u;
    nodes.push(
      <line
        key="f-rule"
        x1={r(pad)}
        y1={r(footerTop + 6 * u)}
        x2={r(pad + leftW)}
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
  const qrX = landscape ? pad : W - pad - qrSize;
  const qrY = landscape ? H - pad - qrSize : pad;
  if (qr) {
    nodes.push(
      <rect
        key="qr-ground"
        x={r(qrX - 10 * u)}
        y={r(qrY - 10 * u)}
        width={r(qrSize + 20 * u)}
        height={r(qrSize + 20 * u)}
        rx={r(8 * u)}
        fill="#FFFFFF"
      />,
      <image
        key="qr"
        x={r(qrX)}
        y={r(qrY)}
        width={r(qrSize)}
        height={r(qrSize)}
        href={qr}
        preserveAspectRatio="none"
      />,
    );
  }

  // ── Identity band ────────────────────────────────────────────────────
  // Portrait: across the top. Landscape: the left column.
  // Beside a portrait QR code the identity keeps to its own column.
  const headW = !landscape && qr ? leftW - qrSize - 36 * u : leftW;
  const iu = u * tier.identity;
  let y = pad;
  const glyph = 34 * iu;
  nodes.push(
    <g key="brand" transform={`translate(${r(pad)} ${r(y)})`}>
      <BrandGlyph tone={TRUST_PALETTE.ink} height={r(glyph)} />
    </g>,
    <Text
      key="wordmark"
      x={pad + glyph * 0.9 + 12 * iu}
      y={y + glyph * 0.8}
      size={30 * iu}
      weight={600}
      fill={TRUST_PALETTE.ink}
    >
      CQrityjob
    </Text>,
  );
  y += glyph + 36 * iu;
  nodes.push(
    <Text
      key="micro"
      x={pad}
      y={y}
      size={18 * iu}
      weight={600}
      spacing={4.5 * iu}
      fill={RIM_BRIGHT}
    >
      {p.strings.brand.toUpperCase()}
    </Text>,
  );
  y += 26 * iu;

  const fullName = (landscape ? 56 : 72) * iu;
  const nameLines = wrap(p.model.holderLabel, charsFor(headW, fullName), 2);
  // A name wraps at its spaces. A single word wider than the line -- a long
  // double surname -- is drawn smaller instead of running past the edge.
  const widestName = Math.max(1, ...nameLines.map((line) => line.length));
  const nameSize = Math.min(fullName, headW / (widestName * EM.bold));
  for (const [i, line] of nameLines.entries()) {
    y += nameSize * 1.12;
    nodes.push(
      <Text key={`name-${i}`} x={pad} y={y} size={nameSize} weight={600} fill={TRUST_PALETTE.ink}>
        {line}
      </Text>,
    );
  }
  y += 14 * iu;
  // The profession line breaks at its own separator before it breaks at a
  // space, so a narrow column reads "Väktare" / "Sverige", never "· Sverige".
  const profSize = (landscape ? 24 : 28) * iu;
  // The Passport number and, for the one founder, the designation are their own
  // lines, in their own tone: the designation is a product label, never to be
  // read as a title the holder earned or a credential someone verified.
  const idLines: { key: string; text: string; fill: string; weight: number }[] = [];
  if (p.strings.numberLine) {
    idLines.push({ key: "number", text: p.strings.numberLine, fill: RIM_BRIGHT, weight: 600 });
  }
  if (p.strings.designationLine) {
    idLines.push({
      key: "designation",
      text: p.strings.designationLine,
      fill: TRUST_PALETTE.ink,
      weight: 600,
    });
  }
  for (const line of idLines) {
    y += profSize * 1.3;
    nodes.push(
      <Text
        key={`id-${line.key}`}
        x={pad}
        y={y}
        size={profSize}
        weight={line.weight}
        fill={line.fill}
      >
        {line.text}
      </Text>,
    );
  }
  // No title is no line at all: never a sentence about what the holder lacks.
  const profText = p.strings.professionLine.trim();
  const profLines = !profText
    ? []
    : landscape
      ? profText
          .split(" · ")
          .flatMap((segment) => wrap(segment, charsFor(headW, profSize), 2))
          .slice(0, 4)
      : wrap(profText, charsFor(headW, profSize), 2);
  for (const [i, line] of profLines.entries()) {
    y += profSize * 1.3;
    nodes.push(
      <Text key={`prof-${i}`} x={pad} y={y} size={profSize} fill={TRUST_PALETTE.inkMuted}>
        {line}
      </Text>,
    );
  }
  y += 32 * iu;

  let area: Area;
  if (landscape) {
    const divider = pad + leftW + 24 * u;
    nodes.push(
      <line
        key="rule"
        x1={r(divider)}
        y1={r(pad)}
        x2={r(divider)}
        y2={r(H - pad)}
        stroke={RIM}
        strokeOpacity={0.6}
        strokeWidth={r(Math.max(1, 2 * u))}
      />,
    );
    const x = divider + 28 * u;
    area = { x, width: W - pad - x, top: pad + 4 * u, bottom: H - pad };
    // The identity column must end above its own footer too.
    if (y > footerTop)
      return { nodes, fits: false, overflow: y - footerTop, clean: false, tier: tier.id, groups };
  } else {
    // Never through a portrait QR code, however short the name beside it.
    if (qr) y = Math.max(y, pad + qrSize + 24 * u);
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
    area = { x: pad, width: contentW, top: y + 36 * iu, bottom: footerTop - 20 * iu };
  }

  // ── The credentials: every one, grouped by scope ─────────────────────
  if (p.model.credentials.length === 0) {
    nodes.push(
      <rect
        key="none-box"
        x={r(area.x)}
        y={r(area.top)}
        width={r(area.width)}
        height={r(64 * u)}
        rx={r(12 * u)}
        fill="none"
        stroke={TRUST_PALETTE.inkFaint}
        strokeOpacity={0.4}
        strokeDasharray={`${r(8 * u)} ${r(6 * u)}`}
      />,
      <Text
        key="none"
        x={area.x + 24 * u}
        y={area.top + 40 * u}
        size={20 * u}
        spacing={2.5 * u}
        fill={TRUST_PALETTE.inkMuted}
      >
        {p.strings.noVerified.toUpperCase()}
      </Text>,
    );
    const fits = area.top + 64 * u <= area.bottom;
    return { nodes, fits, overflow: 0, clean: fits, tier: tier.id, groups };
  }

  const geometry = measure(groups, tier, u, floor, area, p.lang, p.strings.notStated);
  const areaH = area.bottom - area.top;
  const fits = geometry.height <= areaH;
  // Spare height is shared: a small Passport sits a little below the rule
  // rather than leaving the whole lower half empty, and never so far down that
  // it stops reading as the section under the holder.
  // A Story is read with its top and bottom under the platform's own chrome,
  // so there the Passport sits nearer the middle.
  const slackCap = H / W > 1.5 ? 0.4 : 0.15;
  const slack = fits ? Math.min((areaH - geometry.height) / 2, areaH * slackCap) : 0;
  drawCredentials(geometry, u, { ...area, top: area.top + slack }, nodes);
  return {
    nodes,
    fits,
    overflow: Math.max(0, Math.round(geometry.height - areaH)),
    clean: fits && geometry.singleRows,
    tier: tier.id,
    groups,
  };
}

/**
 * The whole Passport at its format's true pixel size.
 *
 * Each density tier is tried, the spacious one first and at the largest scale
 * first, until the whole Passport fits above the footer. The credentials are
 * the same at every tier; only their size and arrangement change. If not
 * even the densest tier fits at the readability floor, the drawing is still
 * complete -- nothing is cut -- and `data-passport-fits="false"` says so.
 */
export function SocialCardSvg(props: SocialCardSvgProps) {
  const { width: W, height: H } = shareFormat(props.format);
  const start = props.format === "story" ? 1.35 : 1;
  // First the tier that fits with every group on one row, the most spacious
  // first; failing that, the most spacious tier that fits at all; failing
  // that, the densest tier, complete and marked as not fitting.
  const attempts: Laid[] = [];
  const found = (accept: (laid: Laid) => boolean): Laid | null => {
    for (const tier of TIERS) {
      for (let s = start; s >= 0.999; s -= 0.05) {
        const laid = layout(props, s, tier);
        attempts.push(laid);
        if (accept(laid)) return laid;
      }
    }
    return null;
  };
  const laid =
    found((l) => l.clean) ??
    attempts.find((l) => l.fits) ??
    layout(props, 1, TIERS[TIERS.length - 1]!);
  const credentials = props.model.credentials;
  const description = laid.groups
    .map((g) => {
      const label = g.scope.kind === "not_stated" ? props.strings.notStated : g.scope.label;
      const names = g.credentials
        .map((c) => {
          const name = props.lang === "sv" ? c.nameSv : c.nameEn;
          return `${name} (${passportT(c.statusWordKey, props.lang)})`;
        })
        .join(", ");
      return `${label}: ${names}`;
    })
    .join(". ");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby="sp-passport-title sp-passport-desc"
      data-social-card={props.format}
      data-passport-credentials={credentials.length}
      data-passport-groups={laid.groups.length}
      data-passport-density={passportDensity(credentials.length)}
      data-passport-tier={laid.tier}
      data-passport-fits={laid.fits ? "true" : "false"}
      data-passport-overflow={laid.overflow}
    >
      {/* The Passport, in words, for whoever cannot see the drawing: the
          holder, then every group and every credential with its own trust
          word -- the same facts the shields show, in the same order. */}
      <title id="sp-passport-title">{`${props.strings.brand} · ${props.model.holderLabel}`}</title>
      <desc id="sp-passport-desc">{description}</desc>
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
