// Security Passport — a small, dependency-light software rasteriser.
//
// ── WHY THIS EXISTS INSTEAD OF A WASM RENDERER ─────────────────────────
//
// The personal link-preview image is drawn on the SERVER from the controlled
// public payload. Production serves the application from a Cloudflare Worker,
// and a Worker may not compile WebAssembly from bytes at run time: the usual
// `satori` + `resvg-wasm` pair needs the build to hand the Worker precompiled
// wasm modules, which is a bundler behaviour that cannot be proved from a
// source checkout and fails as a silent 500 on the one request a link-preview
// crawler makes. This module needs no wasm, no canvas, no native binary and no
// file system, so the same code runs in a Worker, in Node and in the unit
// check that pins its pixels.
//
// It does exactly four things: fill anti-aliased polygons (glyph outlines,
// rounded rectangles, shields), stroke polylines (rings, dashes, a check
// mark), paint a vertical gradient, and encode the result as a PNG.
//
// ── HOW THE ANTI-ALIASING WORKS ────────────────────────────────────────
//
// Each polygon edge adds its signed area to an accumulation buffer; a running
// sum along each row then gives exact coverage per pixel (the technique used by
// font-rs and stb_truetype's v2 rasteriser). Two polygons of opposite winding
// cancel, which is how a ring gets its hole. Coverage is clamped to 0..1, so
// overlapping same-winding shapes (a stroke's segments) simply merge.

import { zlibSync } from "fflate";

export type RGB = readonly [number, number, number];
export type Point = readonly [number, number];
export type Polygon = readonly Point[];

/** `#rrggbb` to a triple. Throws on anything else, so a typo cannot paint a
 *  card in the wrong colour without a failing check. */
export function hex(color: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) throw new Error(`Not a #rrggbb colour: ${color}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Canvas {
  /** RGB, opaque. A link-preview image has no transparency to preserve. */
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    background: RGB,
  ) {
    this.data = new Uint8ClampedArray(width * height * 3);
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = background[0];
      this.data[i + 1] = background[1];
      this.data[i + 2] = background[2];
    }
  }

  /** A vertical gradient through `stops` (offset 0..1), painted over the
   *  whole canvas. */
  gradient(stops: readonly { readonly offset: number; readonly color: RGB }[]): void {
    for (let y = 0; y < this.height; y += 1) {
      const t = this.height === 1 ? 0 : y / (this.height - 1);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i += 1) {
        if (t >= stops[i].offset && t <= stops[i + 1].offset) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const span = b.offset - a.offset;
      const k = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - a.offset) / span));
      const r = a.color[0] + (b.color[0] - a.color[0]) * k;
      const g = a.color[1] + (b.color[1] - a.color[1]) * k;
      const bl = a.color[2] + (b.color[2] - a.color[2]) * k;
      let o = y * this.width * 3;
      for (let x = 0; x < this.width; x += 1) {
        this.data[o++] = r;
        this.data[o++] = g;
        this.data[o++] = bl;
      }
    }
  }

  /** Fill polygons with `color` at `alpha`. Nonzero-ish winding: opposite
   *  windings cancel (a hole), same windings merge. */
  fill(polys: readonly Polygon[], color: RGB, alpha = 1): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of polys) {
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) return;
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(this.width, Math.ceil(maxX) + 1);
    const y1 = Math.min(this.height, Math.ceil(maxY) + 1);
    if (x1 <= x0 || y1 <= y0) return;

    const w = x1 - x0;
    const h = y1 - y0;
    // +2 columns of slack: an edge's spill into the next pixel never wraps.
    const stride = w + 2;
    const acc = new Float32Array(stride * h + 2);

    for (const poly of polys) {
      for (let i = 0; i < poly.length; i += 1) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        accumulateEdge(acc, stride, w, h, p[0] - x0, p[1] - y0, q[0] - x0, q[1] - y0);
      }
    }

    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      let o = ((y0 + y) * this.width + x0) * 3;
      for (let x = 0; x < w; x += 1) {
        sum += acc[y * stride + x];
        const cov = Math.min(1, Math.abs(sum)) * alpha;
        if (cov > 0.002) {
          const inv = 1 - cov;
          this.data[o] = this.data[o] * inv + color[0] * cov;
          this.data[o + 1] = this.data[o + 1] * inv + color[1] * cov;
          this.data[o + 2] = this.data[o + 2] * inv + color[2] * cov;
        }
        o += 3;
      }
    }
  }

  /** The canvas as a PNG (8-bit RGB, no interlace). */
  toPng(): Uint8Array<ArrayBuffer> {
    const rowBytes = this.width * 3;
    const raw = new Uint8Array((rowBytes + 1) * this.height);
    for (let y = 0; y < this.height; y += 1) {
      raw[y * (rowBytes + 1)] = 0; // filter: none
      raw.set(this.data.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
    }
    const idat = zlibSync(raw, { level: 1 });
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, this.width);
    dv.setUint32(4, this.height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour
    return concat([
      PNG_SIGNATURE,
      chunk("IHDR", ihdr),
      chunk("IDAT", idat),
      chunk("IEND", new Uint8Array(0)),
    ]);
  }
}

/** Signed-area accumulation of one edge (after font-rs). Coordinates are
 *  relative to the buffer; the buffer is `w` wide plus slack. */
function accumulateEdge(
  acc: Float32Array,
  stride: number,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  if (ay === by) return;
  let dir = 1;
  let px = ax;
  let py = ay;
  let qx = bx;
  let qy = by;
  if (ay > by) {
    dir = -1;
    px = bx;
    py = by;
    qx = ax;
    qy = ay;
  }
  const dxdy = (qx - px) / (qy - py);
  let x = px;
  let yStart = Math.floor(py);
  if (py < 0) {
    x -= py * dxdy;
    yStart = 0;
  }
  const yEnd = Math.min(h, Math.ceil(qy));
  for (let y = yStart; y < yEnd; y += 1) {
    const rowStart = y * stride;
    const dy = Math.min(y + 1, qy) - Math.max(y, py);
    if (dy <= 0) continue;
    const xNext = x + dxdy * dy;
    const d = dy * dir;
    const lo = Math.min(x, xNext);
    const hi = Math.max(x, xNext);
    const loFloor = Math.floor(lo);
    const hiCeil = Math.ceil(hi);
    const i0 = clampInt(loFloor, 0, w);
    if (hiCeil <= loFloor + 1) {
      const xmf = 0.5 * (x + xNext) - loFloor;
      acc[rowStart + i0] += d - d * xmf;
      acc[rowStart + clampInt(loFloor + 1, 0, w + 1)] += d * xmf;
    } else {
      const s = 1 / (hi - lo);
      const x0f = lo - loFloor;
      const a0 = 0.5 * s * (1 - x0f) * (1 - x0f);
      const x1f = hi - hiCeil + 1;
      const am = 0.5 * s * x1f * x1f;
      acc[rowStart + i0] += d * a0;
      if (hiCeil === loFloor + 2) {
        acc[rowStart + clampInt(loFloor + 1, 0, w + 1)] += d * (1 - a0 - am);
      } else {
        const a1 = s * (1.5 - x0f);
        acc[rowStart + clampInt(loFloor + 1, 0, w + 1)] += d * (a1 - a0);
        for (let xi = loFloor + 2; xi < hiCeil - 1; xi += 1) {
          acc[rowStart + clampInt(xi, 0, w + 1)] += d * s;
        }
        const a2 = a1 + (hiCeil - loFloor - 3) * s;
        acc[rowStart + clampInt(hiCeil - 1, 0, w + 1)] += d * (1 - a2 - am);
      }
      acc[rowStart + clampInt(hiCeil, 0, w + 1)] += d * am;
    }
    x = xNext;
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── geometry helpers ───────────────────────────────────────────────────

/** Flatten a quadratic Bézier into `steps` segments (excluding the start). */
export function quad(p0: Point, p1: Point, p2: Point, steps = 10): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return out;
}

/** Flatten a cubic Bézier into `steps` segments (excluding the start). */
export function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 12): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** A rounded rectangle, clockwise. */
export function roundRect(x: number, y: number, w: number, h: number, r: number): Polygon {
  const k = Math.min(r, w / 2, h / 2);
  const pts: Point[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 8; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 8);
      pts.push([cx + k * Math.cos(a), cy + k * Math.sin(a)]);
    }
  };
  arc(x + w - k, y + k, -Math.PI / 2);
  arc(x + w - k, y + h - k, 0);
  arc(x + k, y + h - k, Math.PI / 2);
  arc(x + k, y + k, Math.PI);
  return pts;
}

/** The reverse winding of a polygon, to cut a hole. */
export function reversed(poly: Polygon): Polygon {
  return [...poly].reverse();
}

/** Signed area; positive for clockwise on a y-down canvas. */
export function area(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/** The polygon wound so its signed area is positive. Stroke segments use this
 *  so that every segment of one stroke merges instead of cancelling. */
export function positive(poly: Polygon): Polygon {
  return area(poly) >= 0 ? poly : reversed(poly);
}

/** A circle as a polygon, clockwise. */
export function circle(cx: number, cy: number, r: number, steps = 28): Polygon {
  const pts: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (Math.PI * 2 * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return positive(pts);
}

/**
 * A stroke along a polyline as a set of polygons: one quad per segment plus a
 * disc at each vertex for round joins and caps. With `dash`, the line is cut
 * into `on`/`off` lengths (continuing around a closed path).
 */
export function stroke(
  path: readonly Point[],
  width: number,
  options: { readonly closed?: boolean; readonly dash?: readonly [number, number] } = {},
): Polygon[] {
  const pts = options.closed ? [...path, path[0]] : [...path];
  const out: Polygon[] = [];
  const half = width / 2;
  const dash = options.dash;
  let carried = 0; // distance along the whole path
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    // Walk the segment, emitting the "on" parts.
    let t = 0;
    while (t < len) {
      let tEnd = len;
      let on = true;
      if (dash) {
        const period = dash[0] + dash[1];
        const phase = (carried + t) % period;
        if (phase < dash[0]) {
          tEnd = Math.min(len, t + (dash[0] - phase));
        } else {
          on = false;
          tEnd = Math.min(len, t + (period - phase));
        }
      }
      if (on) {
        const sx = ax + ux * t;
        const sy = ay + uy * t;
        const ex = ax + ux * tEnd;
        const ey = ay + uy * tEnd;
        const nx = -uy * half;
        const ny = ux * half;
        out.push(
          positive([
            [sx + nx, sy + ny],
            [ex + nx, ey + ny],
            [ex - nx, ey - ny],
            [sx - nx, sy - ny],
          ]),
        );
        if (!dash) out.push(circle(sx, sy, half, 14));
        else {
          out.push(circle(sx, sy, half, 14));
          out.push(circle(ex, ey, half, 14));
        }
      }
      t = tEnd;
    }
    carried += len;
  }
  if (!dash && pts.length > 0) {
    const last = pts[pts.length - 1];
    out.push(circle(last[0], last[1], half, 14));
  }
  return out;
}

// ── PNG plumbing ───────────────────────────────────────────────────────

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
