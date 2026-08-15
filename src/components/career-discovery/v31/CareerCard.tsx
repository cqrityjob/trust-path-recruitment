// The Career Card — a premium, shareable SVG rendering of a single
// recommendation from the candidate's own frozen v3.1 result.
//
// One data model (career-card.ts's CareerCardData), three formats. The SVG
// below is the single source of layout for all three: renderCareerCardSvg
// picks positions from CARD_DIMENSIONS and a format-specific layout table,
// never a second component per format (Execution Mandate §7/§23).
//
// Colours are hard-coded to the brand tokens (trust blue #1769AA, deep navy
// background) rather than read from CSS custom properties, because an
// exported PNG has to look right standalone, outside this app's DOM, on
// Instagram or LinkedIn — a var(--accent) that resolves fine on-screen would
// render as nothing once rasterised out of context.

import { escapeSvgText } from "@/lib/career-discovery/v31/svg-text";
import type { CareerCardData, CareerCardFormat } from "@/lib/career-discovery/v31/career-card";
import { CARD_DIMENSIONS, DISCOVER_URL_PATH } from "@/lib/career-discovery/v31/career-card";

const NAVY = "#0B1420";
const NAVY_DEEP = "#070D16";
const TRUST_BLUE = "#3B9BE0";
const TRUST_BLUE_DIM = "#1769AA";
const INK = "#F4F7FB";
const MUTED = "#8CA0B8";
const BAR_TRACK = "#1B2836";

/** Approximate advance width of Sora at weight 700, as a fraction of the
 *  font size. Only used to decide where to break a long profession title —
 *  an over-estimate is safe (it breaks earlier), an under-estimate would
 *  overflow the card, which is why long Germanic Swedish titles like
 *  "Säkerhetssamordnare" previously ran off the edge. */
const GLYPH_RATIO = 0.6;

/** Wraps a title onto at most `maxLines` lines that each fit `maxWidth`,
 *  shrinking the font size when even that is not enough. Pure. */
function fitTitle(
  title: string,
  maxWidth: number,
  baseSize: number,
  maxLines = 2,
): { lines: string[]; size: number } {
  let size = baseSize;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const perLine = Math.max(6, Math.floor(maxWidth / (size * GLYPH_RATIO)));
    const lines: string[] = [];
    let current = "";
    for (const word of title.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= perLine || current === "") {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => l.length <= perLine)) {
      return { lines, size };
    }
    size = Math.round(size * 0.86);
  }
  return { lines: [title], size };
}

interface Layout {
  padding: number;
  eyebrowY: number;
  titleY: number;
  titleSize: number;
  framingY: number;
  stageBadgeY: number;
  nameY: number;
  indicatorsStartY: number;
  indicatorGap: number;
  qrSize: number;
  qrY: number;
  footerY: number;
  wordmarkY: number;
}

function layoutFor(format: CareerCardFormat): Layout {
  const { width, height } = CARD_DIMENSIONS[format];
  if (format === "linkedin") {
    return {
      padding: 64,
      eyebrowY: 110,
      titleY: 210,
      titleSize: 72,
      framingY: 270,
      stageBadgeY: 330,
      nameY: 400,
      indicatorsStartY: 430,
      indicatorGap: 46,
      qrSize: 120,
      qrY: height - 64 - 120,
      footerY: height - 44,
      wordmarkY: 56,
    };
  }
  // story and square share the same vertical rhythm, scaled by height.
  const centerBias = format === "story" ? 0.32 : 0.24;
  return {
    padding: 80,
    eyebrowY: Math.round(height * 0.14),
    titleY: Math.round(height * 0.14) + 90,
    titleSize: format === "story" ? 84 : 76,
    framingY: Math.round(height * 0.14) + 150,
    stageBadgeY: Math.round(height * 0.14) + 220,
    nameY: Math.round(height * centerBias) + 40,
    indicatorsStartY: Math.round(height * centerBias) + 90,
    indicatorGap: 84,
    qrSize: 168,
    qrY: height - 80 - 168,
    footerY: height - 56,
    wordmarkY: 72,
  };
}

/** Renders the complete, self-contained SVG markup for one card. Pure
 *  string assembly — safe to serialise straight to a data: URI for canvas
 *  rasterisation, since every dynamic value is escaped. */
export function renderCareerCardSvg(
  data: CareerCardData,
  format: CareerCardFormat,
  qrDataUrl: string | null,
): string {
  const { width, height } = CARD_DIMENSIONS[format];
  const L = layoutFor(format);
  const FONT = "Sora, 'Helvetica Neue', Arial, sans-serif";

  const eyebrow = data.locale === "sv" ? "MIN SÄKERHETSKARRIÄR-DNA" : "MY SECURITY CAREER DNA";
  const wordmark = "CQrityjob";
  const tagline = data.locale === "sv" ? "Där förtroende kommer först" : "Where trust comes first";
  const discoverLine =
    data.locale === "sv" ? "Upptäck din karriär inom säkerhet" : "Discover your security career";

  const contentWidth = width - L.padding * 2;
  const title = fitTitle(data.professionTitle.toUpperCase(), contentWidth, L.titleSize);
  // Everything below the title slides down by the height of any second line,
  // so a two-line Swedish title never collides with the framing text.
  const shift = (title.lines.length - 1) * Math.round(title.size * 1.06);

  const indicatorBars = data.indicators
    .map((ind, i) => {
      const y = L.indicatorsStartY + shift + i * L.indicatorGap;
      const barWidth = width - L.padding * 2 - 220;
      const filled = Math.max(6, Math.round(barWidth * ind.value));
      return `
        <text x="${L.padding}" y="${y}" font-family="${FONT}" font-size="26" fill="${MUTED}" letter-spacing="0.5">${escapeSvgText(ind.label)}</text>
        <rect x="${L.padding + 220}" y="${y - 22}" width="${barWidth}" height="14" rx="7" fill="${BAR_TRACK}" />
        <rect x="${L.padding + 220}" y="${y - 22}" width="${filled}" height="14" rx="7" fill="${TRUST_BLUE}" />
      `;
    })
    .join("");

  const nameLine = data.firstName
    ? `<text x="${L.padding}" y="${L.nameY + shift - 60}" font-family="${FONT}" font-size="28" fill="${MUTED}">${escapeSvgText(data.firstName)}</text>`
    : "";

  const qr = qrDataUrl
    ? `<image x="${width - L.padding - L.qrSize}" y="${L.qrY}" width="${L.qrSize}" height="${L.qrSize}" href="${qrDataUrl}" />`
    : "";

  const stageBadgeWidth = Math.max(220, data.stageLabel.length * 17 + 64);

  const titleLines = title.lines
    .map(
      (line, i) =>
        `<text x="${L.padding}" y="${L.titleY + i * Math.round(title.size * 1.06)}" font-family="${FONT}" font-size="${title.size}" font-weight="700" fill="${INK}" letter-spacing="-1">${escapeSvgText(line)}</text>`,
    )
    .join("");

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${NAVY}" />
      <stop offset="100%" stop-color="${NAVY_DEEP}" />
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${TRUST_BLUE}" />
      <stop offset="100%" stop-color="${TRUST_BLUE_DIM}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.06" r="0.75">
      <stop offset="0%" stop-color="${TRUST_BLUE}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${TRUST_BLUE}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#glow)" />
  <rect x="0" y="0" width="${width}" height="6" fill="url(#accentLine)" />

  <text x="${L.padding}" y="${L.wordmarkY}" font-family="${FONT}" font-size="30" font-weight="700" fill="${INK}">${wordmark}</text>
  <text x="${L.padding}" y="${L.wordmarkY + 30}" font-family="${FONT}" font-size="18" fill="${MUTED}" letter-spacing="0.5">${escapeSvgText(tagline.toUpperCase())}</text>

  <text x="${L.padding}" y="${L.eyebrowY}" font-family="${FONT}" font-size="24" font-weight="600" fill="${TRUST_BLUE}" letter-spacing="2">${eyebrow}</text>

  ${titleLines}

  <text x="${L.padding}" y="${L.framingY + shift}" font-family="${FONT}" font-size="28" fill="${MUTED}">${escapeSvgText(data.framingLine)}</text>

  <rect x="${L.padding}" y="${L.stageBadgeY + shift - 34}" width="${stageBadgeWidth}" height="52" rx="26" fill="none" stroke="${TRUST_BLUE}" stroke-width="2" />
  <text x="${L.padding + stageBadgeWidth / 2}" y="${L.stageBadgeY + shift}" font-family="${FONT}" font-size="24" font-weight="600" fill="${TRUST_BLUE}" text-anchor="middle" letter-spacing="1">${escapeSvgText(data.stageLabel.toUpperCase())}</text>

  ${nameLine}
  ${indicatorBars}

  ${qr}
  <text x="${width - L.padding - L.qrSize / 2}" y="${L.qrY + L.qrSize + 34}" font-family="${FONT}" font-size="18" fill="${MUTED}" text-anchor="middle">${escapeSvgText(discoverLine)}</text>

  <line x1="${L.padding}" y1="${L.footerY - 30}" x2="${width - L.padding}" y2="${L.footerY - 30}" stroke="${BAR_TRACK}" stroke-width="1" />
  <text x="${L.padding}" y="${L.footerY}" font-family="${FONT}" font-size="18" fill="${MUTED}">cqrityjob.com${escapeSvgText(DISCOVER_URL_PATH)}</text>
  <text x="${width - L.padding}" y="${L.footerY}" font-family="${FONT}" font-size="18" fill="${MUTED}" text-anchor="end">${escapeSvgText(data.definitionVersion)}</text>
</svg>`.trim();
}

/** On-screen preview. Uses the page's own loaded fonts (unlike the exported
 *  PNG, which falls back to system sans-serif — a known limitation of
 *  SVG-to-canvas rasterisation without embedding the font file). */
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
  return (
    <div
      role="img"
      aria-label={cardAltText(data)}
      className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-border shadow-sm"
      style={{ aspectRatio: `${width} / ${height}` }}
      // Trusted content: every dynamic value passed into renderCareerCardSvg
      // is escaped (see svg-text.ts) and nothing here is user-supplied markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The accessible textual equivalent (Execution Mandate §22) — read this
 *  aloud and every fact on the card is still there. */
export function cardAltText(data: CareerCardData): string {
  const bits = [
    data.locale === "sv" ? "Min säkerhetskarriär-DNA." : "My security career DNA.",
    `${data.professionTitle} — ${data.framingLine}.`,
    data.stageLabel + ".",
  ];
  if (data.firstName) bits.unshift(data.firstName + ".");
  if (data.indicators.length > 0) {
    bits.push(
      (data.locale === "sv" ? "Starkast i: " : "Strongest in: ") +
        data.indicators.map((i) => i.label).join(", ") +
        ".",
    );
  }
  return bits.join(" ");
}
