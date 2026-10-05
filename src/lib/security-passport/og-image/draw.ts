// Security Passport — the 1200×630 preview card, drawn.
//
// Navy ground, the Passport's own palette (TRUST_PALETTE), the number as the
// largest figure, the holder's name, their country, then one row per approved
// credential: a shield whose OUTLINE tells the evidence level (dashed:
// self-declared, solid: documented, doubled with a check: verified) and the
// level in words beside it. Colour is never the only signal; gold is reserved
// for verified, as everywhere else in the product.
//
// The founder line is a product designation, drawn as plain text under the
// name in the brand blue. It takes no shield and never the gold that is
// reserved for verified credentials, so it cannot be read as a qualification.

import { TRUST_PALETTE } from "../design/trust-system";
import {
  Canvas,
  circle,
  cubic,
  hex,
  positive,
  reversed,
  roundRect,
  stroke,
  type Point,
  type Polygon,
  type RGB,
} from "./raster";
import { fit, measure, textPolygons, wrap, type FaceName } from "./text";
import type { ImageMerit, ImageModel, ShieldState } from "./model";

export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

const C = {
  navy: hex(TRUST_PALETTE.navy),
  navyDeep: hex(TRUST_PALETTE.navyDeep),
  navyRaised: hex(TRUST_PALETTE.navyRaised),
  blue: hex(TRUST_PALETTE.blueLuminous),
  gold: hex(TRUST_PALETTE.goldBright),
  ink: hex(TRUST_PALETTE.ink),
  muted: hex(TRUST_PALETTE.inkMuted),
  faint: hex(TRUST_PALETTE.inkFaint),
  steel: hex(TRUST_PALETTE.steel),
} as const;

const MARGIN = 56;
const LEFT_W = 420;
const RIGHT_X = 540;
const RIGHT_W = IMAGE_WIDTH - MARGIN - RIGHT_X;
const ROW_H = 74;

function text(
  canvas: Canvas,
  face: FaceName,
  value: string,
  x: number,
  baseline: number,
  size: number,
  color: RGB,
  tracking = 0,
  alpha = 1,
): void {
  canvas.fill(textPolygons(face, value, x, baseline, size, tracking), color, alpha);
}

/** A shield outline in a unit box (0..1 wide, 0..1 tall), clockwise, placed
 *  with its top-left at (x, y) and `h` tall. */
function shieldOutline(x: number, y: number, h: number): Point[] {
  const w = h * 0.86;
  const p = (u: number, v: number): Point => [x + u * w, y + v * h];
  const pts: Point[] = [p(0.5, 0), p(1, 0.14), p(1, 0.52)];
  pts.push(...cubic(p(1, 0.52), p(1, 0.8), p(0.72, 0.93), p(0.5, 1), 10));
  pts.push(...cubic(p(0.5, 1), p(0.28, 0.93), p(0, 0.8), p(0, 0.52), 10));
  pts.push(p(0, 0.14));
  return pts;
}

function inset(points: readonly Point[], cx: number, cy: number, k: number): Point[] {
  return points.map(([px, py]) => [cx + (px - cx) * k, cy + (py - cy) * k] as Point);
}

/** The evidence shield. Shape and glyph carry the level; colour backs them. */
function drawShield(canvas: Canvas, state: ShieldState, x: number, y: number, h: number): void {
  const w = h * 0.86;
  const cx = x + w / 2;
  const cy = y + h * 0.52;
  const outline = shieldOutline(x, y, h);
  const ink = state === "verified" ? C.gold : state === "documented" ? C.blue : C.steel;
  const t = Math.max(2, h * 0.07);

  // A quiet plate behind the glyph, so the shield reads on any ground.
  canvas.fill([positive(inset(outline, cx, cy, 0.9))], C.navyRaised, 1);

  if (state === "self_declared") {
    // Dashed: the holder's own word, not yet looked at by anyone else.
    canvas.fill(stroke(outline, t, { closed: true, dash: [h * 0.16, h * 0.1] }), ink, 1);
    canvas.fill([circle(cx, cy, h * 0.08)], ink, 1);
    canvas.fill([reversed(circle(cx, cy, h * 0.045, 20))], ink, 1);
    return;
  }
  canvas.fill(stroke(outline, t, { closed: true }), ink, 1);
  if (state === "documented") {
    // Solid, with a document glyph: CQrityjob has seen the document.
    const lw = h * 0.3;
    for (let i = 0; i < 3; i += 1) {
      const ly = cy - h * 0.14 + i * h * 0.14;
      canvas.fill(
        stroke(
          [
            [cx - lw / 2, ly],
            [cx + lw / 2 - (i === 2 ? lw * 0.4 : 0), ly],
          ],
          h * 0.05,
        ),
        ink,
        1,
      );
    }
    return;
  }
  // Verified: a second, inner rim and a check — the full treatment.
  canvas.fill(
    stroke(inset(outline, cx, cy, 0.78), Math.max(1.4, t * 0.55), { closed: true }),
    ink,
    1,
  );
  canvas.fill(
    stroke(
      [
        [cx - h * 0.17, cy + h * 0.0],
        [cx - h * 0.04, cy + h * 0.14],
        [cx + h * 0.2, cy - h * 0.14],
      ],
      Math.max(2.4, h * 0.075),
    ),
    ink,
    1,
  );
}

function wordColor(state: ShieldState): RGB {
  return state === "verified" ? C.gold : state === "documented" ? C.blue : C.muted;
}

function drawRow(canvas: Canvas, m: ImageMerit, y: number): void {
  const shieldH = 50;
  drawShield(canvas, m.state, RIGHT_X, y + 6, shieldH);
  const tx = RIGHT_X + shieldH * 0.86 + 22;
  const tw = RIGHT_W - (tx - RIGHT_X);
  text(canvas, "textBold", fit("textBold", m.title, 27, tw), tx, y + 30, 27, C.ink);
  text(canvas, "text", m.word, tx, y + 56, 19, wordColor(m.state));
}

export function drawImage(model: ImageModel): Canvas {
  const canvas = new Canvas(IMAGE_WIDTH, IMAGE_HEIGHT, C.navy);
  canvas.gradient([
    { offset: 0, color: C.navyRaised },
    { offset: 0.46, color: C.navy },
    { offset: 1, color: C.navyDeep },
  ]);

  // Hairline frame, as on the on-screen card.
  const frame = roundRect(14, 14, IMAGE_WIDTH - 28, IMAGE_HEIGHT - 28, 22);
  canvas.fill(
    [frame, reversed(roundRect(15.5, 15.5, IMAGE_WIDTH - 31, IMAGE_HEIGHT - 31, 20.5))],
    C.ink,
    0.14,
  );

  // ── left column: who ─────────────────────────────────────────────────
  let y = MARGIN + 18;
  text(canvas, "heading", model.strings.brand, MARGIN, y, 24, C.blue);
  y += 30;
  text(canvas, "textBold", model.strings.label.toUpperCase(), MARGIN, y, 15, C.muted, 3);

  y += 118;
  if (model.passportNumber !== null) {
    text(canvas, "heading", `#${model.passportNumber}`, MARGIN, y, 104, C.ink);
  }
  y += 70;
  if (model.name) {
    const lines = wrap("heading", model.name, 38, LEFT_W, 2);
    for (const line of lines) {
      text(canvas, "heading", line, MARGIN, y, 38, C.ink);
      y += 46;
    }
  }
  if (model.founder) {
    text(canvas, "textBold", fit("textBold", model.founder, 21, LEFT_W), MARGIN, y + 2, 21, C.blue);
    y += 34;
  }
  if (model.country) {
    text(canvas, "text", fit("text", model.country, 22, LEFT_W), MARGIN, y + 4, 22, C.muted);
  }

  // ── divider ──────────────────────────────────────────────────────────
  canvas.fill(
    [
      positive([
        [RIGHT_X - 40, MARGIN],
        [RIGHT_X - 39, MARGIN],
        [RIGHT_X - 39, IMAGE_HEIGHT - MARGIN - 40],
        [RIGHT_X - 40, IMAGE_HEIGHT - MARGIN - 40],
      ]),
    ],
    C.ink,
    0.12,
  );

  // ── right column: what ───────────────────────────────────────────────
  let ry = MARGIN + 6;
  if (model.merits.length === 0) {
    text(
      canvas,
      "textBold",
      fit("textBold", model.strings.none, 26, RIGHT_W),
      RIGHT_X,
      ry + 34,
      26,
      C.muted,
    );
  } else {
    for (const m of model.merits) {
      drawRow(canvas, m, ry);
      ry += ROW_H;
    }
    if (model.hidden > 0) {
      text(
        canvas,
        "textBold",
        fit("textBold", model.strings.more, 21, RIGHT_W),
        RIGHT_X,
        ry + 22,
        21,
        C.muted,
      );
    }
  }

  // ── footer: the image is not the record ──────────────────────────────
  text(
    canvas,
    "text",
    fit("text", model.strings.footer, 17, IMAGE_WIDTH - MARGIN * 2),
    MARGIN,
    IMAGE_HEIGHT - 36,
    17,
    C.faint,
  );
  return canvas;
}

export { measure };
