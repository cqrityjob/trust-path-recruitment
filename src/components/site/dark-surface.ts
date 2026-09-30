// One look for every dark, film-backed surface on the public site — the
// homepage hero and /plattformen. Both films sit on the same `night` surface
// (styles.css), both are graded to the same cool blue, and everything laid
// over them comes from here, so the two pages cannot drift into different
// shades of glass, white or focus ring.

/** Frosted glass for cards and pills over a film. */
export const GLASS = "border border-white/20 bg-white/10 backdrop-blur-md";
/** …and its hover, for glass that is a control. */
export const GLASS_HOVER = "hover:border-white/40 hover:bg-white/15";
/** The focus ring on a dark surface. */
export const FOCUS_ON_DARK =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-night";

/** The three text weights on a dark surface. */
export const ON_DARK = {
  lead: "text-white/85",
  body: "text-white/80",
  eyebrow: "text-white/70",
} as const;

/** The page-top headline on a dark surface — the hero's scale. */
export const DARK_H1 =
  "text-balance text-[2.2rem] font-semibold leading-[1.04] tracking-tight text-white [hyphens:auto] sm:text-[3rem] lg:text-[4.25rem] lg:[hyphens:none]";
