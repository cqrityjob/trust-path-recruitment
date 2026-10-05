// Security Passport — text for the server-drawn preview image.
//
// Glyph outlines come from the same OFL faces the site serves (embedded, see
// fonts.generated.ts). A run is measured with the font's own advances and
// kerning, wrapped or shortened to a width, and turned into polygons the
// rasteriser fills.

import opentype, { type Font, type PathCommand } from "@shuding/opentype.js";
import { manropeBoldBase64, manropeMediumBase64, soraBoldBase64 } from "./fonts.generated";
import { cubic, quad, type Point, type Polygon } from "./raster";

export type FaceName = "heading" | "text" | "textBold";

const BASE64: Readonly<Record<FaceName, string>> = {
  heading: soraBoldBase64,
  text: manropeMediumBase64,
  textBold: manropeBoldBase64,
};

const parsed = new Map<FaceName, Font>();

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** A parsed face, kept for the life of the isolate: parsing is the only
 *  expensive step and the bytes never change. */
export function face(name: FaceName): Font {
  let f = parsed.get(name);
  if (!f) {
    f = opentype.parse(decode(BASE64[name]));
    parsed.set(name, f);
  }
  return f;
}

/** Whether every character of `text` has a glyph in the face. A name the
 *  face cannot draw must not become a row of empty boxes on a public image. */
export function canDraw(name: FaceName, text: string): boolean {
  const f = face(name);
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (f.charToGlyphIndex(ch) === 0) return false;
  }
  return true;
}

/** `text` with every character the face cannot draw removed. */
export function drawable(name: FaceName, text: string): string {
  const f = face(name);
  let out = "";
  for (const ch of text) {
    if (/\s/.test(ch) || f.charToGlyphIndex(ch) !== 0) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function measure(name: FaceName, text: string, size: number, tracking = 0): number {
  const w = face(name).getAdvanceWidth(text, size, { kerning: true });
  return w + tracking * Math.max(0, [...text].length - 1);
}

/** Shorten `text` with an ellipsis until it fits `maxWidth`. */
export function fit(name: FaceName, text: string, size: number, maxWidth: number): string {
  if (measure(name, text, size) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join("").trimEnd()}…`;
    if (measure(name, candidate, size) <= maxWidth) return candidate;
  }
  return "…";
}

/** Greedy word wrap into at most `maxLines`; the last line is shortened with
 *  an ellipsis if text remains. */
export function wrap(
  name: FaceName,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i += 1) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(name, next, size) <= maxWidth || !line) {
      line = next;
    } else {
      if (lines.length === maxLines - 1) break;
      lines.push(line);
      line = words[i];
    }
  }
  const rest = [line, ...words.slice(i + 1)].filter(Boolean);
  if (i < words.length && lines.length === maxLines - 1) {
    lines.push(fit(name, [line, ...words.slice(i)].filter(Boolean).join(" "), size, maxWidth));
  } else if (rest.length > 0 && line) {
    lines.push(fit(name, line, size, maxWidth));
  }
  return lines.slice(0, maxLines).map((l) => fit(name, l, size, maxWidth));
}

/** The outline of a run, baseline at `y`, as polygons. */
export function textPolygons(
  name: FaceName,
  text: string,
  x: number,
  y: number,
  size: number,
  tracking = 0,
): Polygon[] {
  const f = face(name);
  const polys: Polygon[] = [];
  const addPath = (commands: readonly PathCommand[]) => {
    let current: Point[] = [];
    let at: Point = [0, 0];
    const flush = () => {
      if (current.length > 2) polys.push(current);
      current = [];
    };
    for (const c of commands) {
      switch (c.type) {
        case "M":
          flush();
          at = [c.x as number, c.y as number];
          current = [at];
          break;
        case "L":
          at = [c.x as number, c.y as number];
          current.push(at);
          break;
        case "Q": {
          const end: Point = [c.x as number, c.y as number];
          current.push(...quad(at, [c.x1 as number, c.y1 as number], end, 8));
          at = end;
          break;
        }
        case "C": {
          const end: Point = [c.x as number, c.y as number];
          current.push(
            ...cubic(
              at,
              [c.x1 as number, c.y1 as number],
              [c.x2 as number, c.y2 as number],
              end,
              10,
            ),
          );
          at = end;
          break;
        }
        case "Z":
          flush();
          break;
      }
    }
    flush();
  };

  if (tracking === 0) {
    addPath(f.getPath(text, x, y, size, { kerning: true }).commands);
  } else {
    let cx = x;
    for (const ch of text) {
      addPath(f.getPath(ch, cx, y, size).commands);
      cx += f.getAdvanceWidth(ch, size) + tracking;
    }
  }
  return polys;
}
