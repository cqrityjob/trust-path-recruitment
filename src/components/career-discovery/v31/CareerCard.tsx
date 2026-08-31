// The Career Card — a premium, shareable SVG rendering of the candidate's
// own canonical Top 3.
//
// One data model (career-card.ts's CareerCardData), three canvases. The
// renderer below is the single source of layout for all three: it stacks the
// SAME blocks in the SAME order and only the geometry changes, never the
// content or its hierarchy (Execution Mandate §7/§23). There is deliberately
// no per-format component — three implementations would drift, and a card
// that says something different on LinkedIn from what it says on Instagram
// is a different claim about the same result.
//
// ── FLOW LAYOUT, NOT ABSOLUTE COORDINATES ───────────────────────────────
//
// Every block is placed from a running cursor and reports its own height, so
// a two-line Swedish profession title ("Säkerhetssamordnare") pushes what
// follows down instead of being overlapped by it. The previous version
// positioned blocks at hand-tuned absolute y values and then patched
// collisions one at a time as they were found by eye — the stage badge
// overlapping the first indicator bar on square, the same badge leaving a
// large empty gap on story. `measureCard` exposes the final cursor so a test
// can assert the whole stack fits the canvas rather than a human re-checking
// three formats after every copy change.
//
// Colours are hard-coded to the brand tokens (trust blue #1769AA, deep navy
// background) rather than read from CSS custom properties, because an
// exported PNG has to look right standalone, outside this app's DOM, on
// Instagram or LinkedIn — a var(--accent) that resolves fine on-screen would
// render as nothing once rasterised out of context.

import { escapeSvgText } from "@/lib/career-discovery/v31/svg-text";
import type { CareerCardData, CareerCardFormat } from "@/lib/career-discovery/v31/career-card";
import { CARD_DIMENSIONS } from "@/lib/career-discovery/v31/career-card";

const NAVY = "#0B1420";
const NAVY_DEEP = "#070D16";
const TRUST_BLUE = "#3B9BE0";
const TRUST_BLUE_DIM = "#1769AA";
const INK = "#F4F7FB";
const INK_SOFT = "#C6D3E2";
const MUTED = "#8CA0B8";
const HAIRLINE = "#1B2836";
const FAINT = "#5C6E85";
const FONT = "Sora, 'Helvetica Neue', Arial, sans-serif";

// ── WHY THESE RATIOS ARE PESSIMISTIC ────────────────────────────────────
//
// Approximate advance width as a fraction of the font size, used to decide
// where a title breaks. An over-estimate is safe (it breaks or shrinks
// earlier); an under-estimate overflows the card.
//
// They are measured against the FALLBACK face, not Sora. The exported PNG
// rasterises without the webfont (see CareerCardPreview's note), so the
// image people actually share is set in the system sans — which is wider
// than Sora, and wider again in all-caps. Sizing for Sora is what pushed
// "SÄKERHETSSAMORDNARE" clean off the right edge of the story card: it was
// within budget at Sora's metrics and 200px over at Helvetica's. Confirmed
// by rendering the SVG in a browser with no webfont loaded, which is
// exactly the condition the export runs under.
/** Mixed-case body and secondary titles. */
const GLYPH_RATIO = 0.62;
/** All-caps bold display. Capitals carry no narrow x-height letters, so the
 *  average advance is markedly wider than the same face in mixed case. */
const GLYPH_RATIO_DISPLAY = 0.78;

interface FittedText {
  readonly lines: readonly string[];
  readonly size: number;
}

/** Wrap `text` onto at most `maxLines` lines that each fit `maxWidth`,
 *  shrinking the font size when even that is not enough. Pure. */
function fitText(
  text: string,
  maxWidth: number,
  baseSize: number,
  maxLines: number,
  ratio = GLYPH_RATIO_DISPLAY,
): FittedText {
  let size = baseSize;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const perLine = Math.max(6, Math.floor(maxWidth / (size * ratio)));
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= perLine || current === "") current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => l.length <= perLine)) return { lines, size };
    size = Math.round(size * 0.88);
  }
  // Last resort: a single unbroken word (a Swedish compound, a pasted title)
  // that still does not fit at the smallest size tried. Break it on
  // character count rather than letting it run off the canvas — a hyphenless
  // split is ugly, silently clipping the candidate's own result is worse.
  const perLine = Math.max(6, Math.floor(maxWidth / (size * ratio)));
  const hard: string[] = [];
  for (let i = 0; i < text.length; i += perLine) hard.push(text.slice(i, i + perLine));
  return { lines: hard.slice(0, maxLines), size };
}

/** Geometry for one canvas. Content and its order are identical across all
 *  three; only these numbers differ. */
interface FormatSpec {
  readonly padding: number;
  /** Where the ranked list lives. For LinkedIn's landscape canvas ranks 2-3
   *  and the strengths move into a right-hand column, because stacking six
   *  blocks down 627px would either clip or shrink every one of them to
   *  unreadable. Same blocks, same order, re-flowed — not a second design. */
  readonly twoColumn: boolean;
  readonly eyebrowSize: number;
  readonly nameSize: number;
  readonly rank1TitleSize: number;
  readonly rank1TitleLines: number;
  /** Ranks 2-3. Deliberately well under `rank1TitleSize`: the hero title
   *  shrinks to fit, and a long Swedish compound ("Säkerhetssamordnare")
   *  can shrink until it is no larger than the secondary titles — at which
   *  point the card stops reading as a ranking. Keeping this small preserves
   *  the hierarchy in the worst case rather than only the average one. */
  readonly restTitleSize: number;
  readonly labelSize: number;
  readonly strengthSize: number;
  readonly footerSize: number;
  readonly wordmarkSize: number;
  readonly qrSize: number;
  /** Vertical air between major blocks. */
  readonly gap: number;
}

const SPEC: Readonly<Record<CareerCardFormat, FormatSpec>> = {
  // Story is a full-bleed phone canvas. The type is large because it is
  // read at arm's length in a feed, and because the alternative — the sizes
  // that suit the square card — left roughly 850px of dead space above the
  // footer. `measureCard` is what turned that from an impression into a
  // number; see career-discovery-career-card-check.ts, which now holds both
  // ends of the range so neither overflow nor a vacuum can return.
  story: {
    padding: 92,
    twoColumn: false,
    eyebrowSize: 36,
    nameSize: 46,
    rank1TitleSize: 148,
    rank1TitleLines: 3,
    restTitleSize: 46,
    labelSize: 32,
    strengthSize: 46,
    footerSize: 28,
    wordmarkSize: 46,
    qrSize: 190,
    gap: 104,
  },
  square: {
    padding: 76,
    twoColumn: false,
    eyebrowSize: 26,
    nameSize: 34,
    rank1TitleSize: 82,
    rank1TitleLines: 2,
    restTitleSize: 34,
    labelSize: 23,
    strengthSize: 29,
    footerSize: 21,
    wordmarkSize: 33,
    qrSize: 118,
    gap: 38,
  },
  linkedin: {
    padding: 56,
    twoColumn: true,
    eyebrowSize: 20,
    nameSize: 25,
    rank1TitleSize: 62,
    rank1TitleLines: 3,
    restTitleSize: 25,
    labelSize: 17,
    strengthSize: 22,
    footerSize: 16,
    wordmarkSize: 26,
    qrSize: 96,
    gap: 26,
  },
};

const EYEBROW: Record<"sv" | "en", string> = {
  sv: "MINA KARRIÄRMATCHNINGAR",
  en: "MY SECURITY CAREER MATCHES",
};
const STRENGTHS_LABEL: Record<"sv" | "en", string> = {
  sv: "MINA STARKASTE INDIKATORER",
  en: "MY STRONGEST INDICATORS",
};
// "VERIFIED IN CQRITYJOB", not "VERIFIED". The qualifier is the whole point:
// it says who did the checking and confines the claim to this product, so a
// reader cannot take the line below as a statement by an authority.
const TRUST_LABEL: Record<"sv" | "en", string> = {
  sv: "VERIFIERAT I CQRITYJOB",
  en: "VERIFIED IN CQRITYJOB",
};
const DISCOVER_LINE: Record<"sv" | "en", string> = {
  sv: "Upptäck din karriär inom säkerhet",
  en: "Discover your security career",
};
const TAGLINE: Record<"sv" | "en", string> = {
  sv: "Där förtroende kommer först",
  en: "Where trust comes first",
};

const WORDMARK = "CQrityjob";

/** A rendered block: its markup and the y cursor after it. Keeping the two
 *  together is what makes the stack self-measuring. */
interface Block {
  readonly svg: string;
  readonly y: number;
}

function text(
  x: number,
  y: number,
  content: string,
  opts: {
    size: number;
    fill: string;
    weight?: number;
    anchor?: "start" | "middle" | "end";
    tracking?: number;
  },
): string {
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : "";
  const weight = opts.weight ? ` font-weight="${opts.weight}"` : "";
  const tracking = opts.tracking ? ` letter-spacing="${opts.tracking}"` : "";
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${opts.size}" fill="${opts.fill}"${weight}${anchor}${tracking}>${escapeSvgText(content)}</text>`;
}

/** Rank 1 — the dominant block. Oversized numeral, oversized title, accent
 *  rule. #2 and #3 stay readable but are visibly secondary: that difference
 *  IS the recommendation, and three equal cards would say "interchangeable". */
function topEntry(data: CareerCardData, s: FormatSpec, x: number, width: number, y: number): Block {
  const entry = data.entries[0];
  if (!entry) return { svg: "", y };
  const fitted = fitText(entry.title.toUpperCase(), width, s.rank1TitleSize, s.rank1TitleLines);
  const lineHeight = Math.round(fitted.size * 1.02);

  let cursor = y;
  const parts: string[] = [];

  // The accent rule + "#1" sit on one baseline above the title.
  parts.push(
    `<rect x="${x}" y="${cursor}" width="${Math.round(s.rank1TitleSize * 0.9)}" height="${Math.max(4, Math.round(s.rank1TitleSize * 0.06))}" rx="3" fill="url(#accentLine)" />`,
  );
  cursor += Math.round(s.labelSize * 2.0);
  // Sized from the FITTED title, not the nominal one: a long Swedish title
  // shrinks to fit, and a "#1" scaled from the unshrunk `rank1TitleSize`
  // ended up nearly as large as the profession it numbers.
  const numeralSize = Math.round(fitted.size * 0.5);
  parts.push(
    text(x, cursor, "#1", { size: numeralSize, fill: TRUST_BLUE, weight: 700, tracking: 1 }),
  );
  // Clear the numeral's baseline by the title's own cap height plus a gap.
  // Advancing by a fraction of `rank1TitleSize` instead put the title's cap
  // ABOVE the numeral's baseline whenever the title was large — "#1" was
  // drawn straight through the first letters of "SECURITY COORDINATOR" on
  // square and LinkedIn. Found by rendering, not by reading the numbers.
  cursor += Math.round(fitted.size * 0.78) + Math.round(s.labelSize * 0.6);

  for (const [i, line] of fitted.lines.entries()) {
    parts.push(
      text(x, cursor + i * lineHeight, line, {
        size: fitted.size,
        fill: INK,
        weight: 700,
        tracking: -1,
      }),
    );
  }
  cursor += (fitted.lines.length - 1) * lineHeight + Math.round(s.labelSize * 1.9);

  parts.push(
    text(x, cursor, entry.confidenceLabel.toUpperCase(), {
      size: s.labelSize,
      fill: TRUST_BLUE,
      weight: 600,
      tracking: 2,
    }),
  );
  cursor += Math.round(s.labelSize * 0.6);

  return { svg: parts.join("\n  "), y: cursor };
}

/** Ranks 2 and 3 — a numeral, the title, and the same approved confidence
 *  wording rank 1 carries, at secondary weight. */
function restEntries(
  data: CareerCardData,
  s: FormatSpec,
  x: number,
  width: number,
  y: number,
): Block {
  const rest = data.entries.slice(1);
  if (rest.length === 0) return { svg: "", y };

  const numeralWidth = Math.round(s.restTitleSize * 1.5);
  const titleWidth = width - numeralWidth;
  let cursor = y;
  const parts: string[] = [];

  for (const entry of rest) {
    parts.push(
      `<line x1="${x}" y1="${cursor}" x2="${x + width}" y2="${cursor}" stroke="${HAIRLINE}" stroke-width="1" />`,
    );
    cursor += Math.round(s.restTitleSize * 1.15);
    parts.push(
      text(x, cursor, `#${entry.rank}`, {
        size: Math.round(s.restTitleSize * 0.86),
        fill: TRUST_BLUE_DIM,
        weight: 700,
      }),
    );
    const fitted = fitText(entry.title, titleWidth, s.restTitleSize, 2, GLYPH_RATIO);
    const lineHeight = Math.round(fitted.size * 1.12);
    for (const [i, line] of fitted.lines.entries()) {
      parts.push(
        text(x + numeralWidth, cursor + i * lineHeight, line, {
          size: fitted.size,
          fill: INK_SOFT,
          weight: 600,
        }),
      );
    }
    cursor += (fitted.lines.length - 1) * lineHeight + Math.round(s.labelSize * 1.5);
    parts.push(
      text(x + numeralWidth, cursor, entry.confidenceLabel, {
        size: s.labelSize,
        fill: MUTED,
      }),
    );
    cursor += Math.round(s.gap * 0.7);
  }

  return { svg: parts.join("\n  "), y: cursor };
}

/** The candidate's own three strongest dimensions. Interpuncts, not bars:
 *  a bar invites the reader to compare lengths, which is a quantitative
 *  claim this product does not make (PMR006). */
function strengthsBlock(
  data: CareerCardData,
  s: FormatSpec,
  x: number,
  width: number,
  y: number,
): Block {
  if (data.strengths.length === 0) return { svg: "", y };
  let cursor = y;
  const parts: string[] = [];

  parts.push(
    text(x, cursor, STRENGTHS_LABEL[data.locale], {
      size: s.labelSize,
      fill: MUTED,
      weight: 600,
      tracking: 2,
    }),
  );
  cursor += Math.round(s.strengthSize * 1.5);

  const fitted = fitText(data.strengths.join("  ·  "), width, s.strengthSize, 2, GLYPH_RATIO);
  const lineHeight = Math.round(fitted.size * 1.35);
  for (const [i, line] of fitted.lines.entries()) {
    parts.push(
      text(x, cursor + i * lineHeight, line, { size: fitted.size, fill: INK, weight: 600 }),
    );
  }
  cursor += (fitted.lines.length - 1) * lineHeight;

  return { svg: parts.join("\n  "), y: cursor };
}

/**
 * The trust line — one muted sentence, or nothing at all.
 *
 * ── WHY IT IS DELIBERATELY UNDERPLAYED ─────────────────────────────────
 *
 * This is the only block on the card making a claim that a stranger is meant
 * to rely on, which is exactly why it is set at label size in the muted ink
 * rather than given a badge, a tick, a panel or the accent colour. A card is
 * a professional identity, not a certificate, and a verification statement
 * styled like a seal invites precisely the reading -- "this person is
 * approved" -- that the trust ladder exists to refuse.
 *
 * It sits under the strengths, above the footer rule, and flows like every
 * other block, so `measureCard` accounts for it and the career-card check
 * catches it if it ever pushes content into the footer.
 *
 * `data.trustLine` is composed upstream by `careerCardTrustLine` and is null
 * whenever there is nothing verified or the counts could not be read; this
 * renders nothing in both cases, which is the same card that existed before.
 */
function trustBlock(
  data: CareerCardData,
  s: FormatSpec,
  x: number,
  width: number,
  y: number,
): Block {
  // Returns the INCOMING cursor untouched when there is no line, so a card
  // without one measures exactly as it did before this block existed. The
  // leading gap is added inside the guard for the same reason: adding it
  // outside would make every card in the product very slightly taller,
  // including the ones that render nothing here.
  if (!data.trustLine) return { svg: "", y };
  const parts: string[] = [];
  let cursor = y + Math.round(s.gap * 0.8);

  parts.push(
    text(x, cursor, TRUST_LABEL[data.locale], {
      size: Math.round(s.labelSize * 0.86),
      fill: FAINT,
      weight: 600,
      tracking: 2,
    }),
  );
  cursor += Math.round(s.labelSize * 1.25);

  // Two lines allowed: "3 verifierade intyg · Anställning bekräftad" does not
  // fit one line on story at label size, and shrinking it further would put
  // the card's one load-bearing claim below the footer's own text size.
  const fitted = fitText(data.trustLine, width, Math.round(s.labelSize * 1.02), 2, GLYPH_RATIO);
  const lineHeight = Math.round(fitted.size * 1.32);
  for (const [i, line] of fitted.lines.entries()) {
    parts.push(
      text(x, cursor + i * lineHeight, line, { size: fitted.size, fill: INK_SOFT, weight: 600 }),
    );
  }
  cursor += (fitted.lines.length - 1) * lineHeight;

  return { svg: parts.join("\n  "), y: cursor };
}

interface CardLayout {
  readonly svg: string;
  /** The lowest y any content block reached, before the footer. A test
   *  asserts this clears the footer on every format and locale. */
  readonly contentBottom: number;
  /** The y the footer rule sits on. */
  readonly footerTop: number;
}

function layout(
  data: CareerCardData,
  format: CareerCardFormat,
  qrDataUrl: string | null,
): CardLayout {
  const { width, height } = CARD_DIMENSIONS[format];
  const s = SPEC[format];
  const parts: string[] = [];

  // Footer geometry is fixed to the bottom edge; content flows down from the
  // top and must clear it.
  const footerTop = height - s.padding - Math.round(s.footerSize * 3.4);
  const contentWidth = width - s.padding * 2;

  // ── Masthead ──────────────────────────────────────────────────────────
  let y = s.padding + s.wordmarkSize;
  parts.push(
    text(s.padding, y, WORDMARK, { size: s.wordmarkSize, fill: INK, weight: 700, tracking: -0.5 }),
  );
  y += Math.round(s.gap * 1.1);

  parts.push(
    text(s.padding, y, EYEBROW[data.locale], {
      size: s.eyebrowSize,
      fill: TRUST_BLUE,
      weight: 600,
      tracking: 3,
    }),
  );
  y += Math.round(s.eyebrowSize * 1.6);

  if (data.firstName) {
    parts.push(text(s.padding, y, data.firstName, { size: s.nameSize, fill: MUTED }));
    y += Math.round(s.nameSize * 1.3);
  }
  y += Math.round(s.gap * 0.5);

  // ── The result ────────────────────────────────────────────────────────
  const mainWidth = s.twoColumn ? Math.round(contentWidth * 0.5) - s.gap : contentWidth;
  const asideX = s.padding + Math.round(contentWidth * 0.5) + s.gap;
  const asideWidth = contentWidth - Math.round(contentWidth * 0.5) - s.gap - (s.qrSize + s.gap);

  const top = topEntry(data, s, s.padding, mainWidth, y);
  parts.push(top.svg);

  // On LinkedIn ranks 2-3 and the strengths start beside rank 1, level with
  // the eyebrow, instead of below it.
  const asideStart = s.twoColumn ? s.padding + s.wordmarkSize + Math.round(s.gap * 2.4) : null;
  const restX = s.twoColumn ? asideX : s.padding;
  const restWidth = s.twoColumn ? asideWidth : contentWidth;

  const rest = restEntries(data, s, restX, restWidth, asideStart ?? top.y + s.gap);
  parts.push(rest.svg);

  // The strengths are the last block before the footer, which is exactly the
  // vertical band the QR occupies — on square, "Strategic · Decisive ·
  // Operational" ran straight under the code. Reserve the QR column here.
  // (`asideWidth` already subtracts it on the two-column layout.)
  const strengthsWidth = s.twoColumn ? restWidth : contentWidth - (s.qrSize + s.gap);
  const strengths = strengthsBlock(
    data,
    s,
    restX,
    strengthsWidth,
    s.twoColumn ? rest.y + Math.round(s.gap * 0.6) : rest.y + s.gap,
  );
  parts.push(strengths.svg);

  // The trust line follows the strengths in the same column, reserving the
  // QR gutter exactly as they do.
  const trust = trustBlock(data, s, restX, strengthsWidth, strengths.y);
  parts.push(trust.svg);

  const contentBottom = Math.max(top.y, rest.y, strengths.y, trust.y);

  // ── Footer ────────────────────────────────────────────────────────────
  parts.push(
    `<line x1="${s.padding}" y1="${footerTop}" x2="${width - s.padding}" y2="${footerTop}" stroke="${HAIRLINE}" stroke-width="1" />`,
  );
  parts.push(
    text(s.padding, footerTop + Math.round(s.footerSize * 1.8), DISCOVER_LINE[data.locale], {
      size: s.footerSize,
      fill: INK_SOFT,
      weight: 600,
    }),
  );
  parts.push(
    text(
      s.padding,
      footerTop + Math.round(s.footerSize * 3.1),
      `${WORDMARK} · ${TAGLINE[data.locale]}`,
      { size: s.footerSize, fill: MUTED },
    ),
  );

  // The QR sits above the footer rule, hard against the right edge — the one
  // element with a reserved column on every format, so no reflow can put text
  // underneath it.
  const qrX = width - s.padding - s.qrSize;
  const qrY = footerTop - s.qrSize - Math.round(s.gap * 0.5);
  if (qrDataUrl) {
    parts.push(
      `<rect x="${qrX - 10}" y="${qrY - 10}" width="${s.qrSize + 20}" height="${s.qrSize + 20}" rx="12" fill="${INK}" />`,
      `<image x="${qrX}" y="${qrY}" width="${s.qrSize}" height="${s.qrSize}" href="${qrDataUrl}" />`,
    );
  }
  // The bare domain, not the full path. The path
  // (`cqrityjob.com/security-career-assessment`) is 40 characters and, set
  // end-anchored on the same baseline as the discover line, it ran straight
  // into it on story and square — a real collision, seen by rendering the
  // card rather than by reading the coordinates. The full destination is in
  // the QR; the footer only has to say whose card this is.
  parts.push(
    text(width - s.padding, footerTop + Math.round(s.footerSize * 1.8), "cqrityjob.com", {
      size: s.footerSize,
      fill: MUTED,
      anchor: "end",
    }),
  );
  parts.push(
    text(width - s.padding, footerTop + Math.round(s.footerSize * 3.1), data.definitionVersion, {
      size: s.footerSize,
      fill: FAINT,
      anchor: "end",
    }),
  );

  return { svg: parts.filter(Boolean).join("\n  "), contentBottom, footerTop };
}

/** Renders the complete, self-contained SVG markup for one card. Pure string
 *  assembly — safe to serialise straight to a data: URI for canvas
 *  rasterisation, since every dynamic value is escaped. */
export function renderCareerCardSvg(
  data: CareerCardData,
  format: CareerCardFormat,
  qrDataUrl: string | null,
): string {
  const { width, height } = CARD_DIMENSIONS[format];
  const body = layout(data, format, qrDataUrl);

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${NAVY}" />
      <stop offset="100%" stop-color="${NAVY_DEEP}" />
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${TRUST_BLUE}" />
      <stop offset="100%" stop-color="${TRUST_BLUE_DIM}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.08" cy="0.02" r="0.85">
      <stop offset="0%" stop-color="${TRUST_BLUE}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${TRUST_BLUE}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#glow)" />
  <rect x="0" y="0" width="${width}" height="6" fill="url(#accentLine)" />
  ${body.svg}
</svg>`.trim();
}

/** How much room the content actually took, per format.
 *
 *  Exported so `career-discovery-career-card-check.ts` can assert that every
 *  format, in both locales, with the longest real profession titles in the
 *  catalogue, still clears its own footer — rather than a human re-checking
 *  three canvases by eye after every copy change. */
export function measureCard(
  data: CareerCardData,
  format: CareerCardFormat,
): { contentBottom: number; footerTop: number; overflow: number } {
  const { contentBottom, footerTop } = layout(data, format, null);
  return { contentBottom, footerTop, overflow: Math.max(0, contentBottom - footerTop) };
}

/** On-screen preview. Uses the page's own loaded fonts (unlike the exported
 *  PNG, which falls back to system sans-serif — a known limitation of
 *  SVG-to-canvas rasterisation without embedding the font file). */
/** How much of the viewport's height the preview may occupy. Story is
 *  1080x1920 — at the modal's full width it stands taller than the screen,
 *  and the candidate scrolls past a card they cannot see whole. */
const PREVIEW_MAX_VIEWPORT_HEIGHT = "44vh";
/** The widest the preview ever gets, matching the modal's own measure. */
const PREVIEW_MAX_WIDTH = "28rem";

/**
 * The card, scaled ENTIRE into whatever room the modal has.
 *
 * ── THE DEFECT THIS FIXES (2026-08-29, hosted UAT) ──────────────────────
 *
 * `renderCareerCardSvg` emits `width="1080" height="1920"` — correct and
 * necessary for the export, which rasterises that markup at those exact
 * pixels. Dropped into the DOM, though, those attributes are the SVG's
 * intrinsic size: the element laid itself out 1080px wide inside a ~448px
 * box, and the `overflow-hidden` that rounds the corners quietly cropped
 * the rest. What the candidate saw was the left 40% of their own card, so a
 * long Swedish title ("Säkerhetssamordnare", "Skyddsvakt/Ordningsvakt")
 * ran off the right edge of the PREVIEW while being perfectly inside the
 * exported PNG.
 *
 * The fix is CSS, not markup: the same string still goes to the canvas
 * untouched (see CareerCardCreator's exportPng — one renderer, one call,
 * shared by preview and export), and `svg { width:100%; height:100% }`
 * overrides the presentation attributes for layout only. The viewBox and
 * the default `preserveAspectRatio="xMidYMid meet"` then scale the whole
 * canvas down and centre it, so nothing can be clipped at any size.
 *
 * The box itself is capped on BOTH axes: `max-width` clamps the wide
 * formats, and a width ceiling derived from the aspect ratio
 * (height x width/height) clamps the tall ones, which keeps the ratio exact
 * rather than letterboxing inside an over-tall frame.
 */
export function CareerCardPreview({
  data,
  format,
  qrDataUrl,
}: {
  data: CareerCardData;
  format: CareerCardFormat;
  qrDataUrl: string | null;
}) {
  const { width, height } = CARD_DIMENSIONS[format];
  const svg = renderCareerCardSvg(data, format, qrDataUrl);
  const ratio = (width / height).toFixed(4);
  return (
    <div
      role="img"
      aria-label={cardAltText(data)}
      className="mx-auto overflow-hidden rounded-xl border border-border shadow-sm [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, ${PREVIEW_MAX_WIDTH}, ${ratio} * ${PREVIEW_MAX_VIEWPORT_HEIGHT})`,
      }}
      // Trusted content: every dynamic value passed into renderCareerCardSvg
      // is escaped (see svg-text.ts) and nothing here is user-supplied markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The accessible textual equivalent (Execution Mandate §22) — read this
 *  aloud and every fact on the card is still there, in the same order. */
export function cardAltText(data: CareerCardData): string {
  const sv = data.locale === "sv";
  const bits: string[] = [
    sv ? "Mina karriärmatchningar inom säkerhet." : "My security career matches.",
  ];
  if (data.firstName) bits.push(data.firstName + ".");
  for (const e of data.entries) {
    bits.push(`#${e.rank} ${e.title} — ${e.confidenceLabel}.`);
  }
  if (data.strengths.length > 0) {
    bits.push((sv ? "Starkast i: " : "Strongest in: ") + data.strengths.join(", ") + ".");
  }
  // §34: the exported card is an IMAGE. Everything it claims has to reach a
  // screen reader too, and the trust line is the one thing on it a reader
  // might act on, so it is the last thing that may be left in pixels only.
  if (data.trustLine) {
    bits.push((sv ? "Verifierat i CQrityjob: " : "Verified in CQrityjob: ") + data.trustLine + ".");
  }
  bits.push(
    sv ? "CQrityjob — där förtroende kommer först." : "CQrityjob — where trust comes first.",
  );
  return bits.join(" ");
}
