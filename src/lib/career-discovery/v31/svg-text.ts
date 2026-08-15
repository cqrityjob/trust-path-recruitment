/** Escapes text for safe interpolation into hand-assembled SVG markup.
 *  Every dynamic string CareerCard.tsx places into an SVG template goes
 *  through this first — profession titles and first names are candidate
 *  data, not markup, and must never be interpretable as one. */
export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
