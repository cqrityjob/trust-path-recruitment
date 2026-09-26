// HAYAT — processing limits.
//
// The 8 MB upload limit bounds the FILE. It does not bound the WORK: a 200 kB
// PDF can declare four hundred pages, and a 2 MB PNG can decode to a
// 20 000 x 20 000 bitmap that takes 1.6 GB of browser memory before OCR has
// read a single character. These are the limits on the work.
//
// They are deliberately conservative. A certificate is one or two pages; a
// document that needs more than this is not the document this form is for,
// and the holder can always type the three values themselves.

export const HAYAT_LIMITS = {
  /** Pages read from a PDF. Later pages are ignored, and the form says so. */
  maxPages: 3,
  /** A PDF declaring more than this is refused outright rather than sampled. */
  maxDeclaredPages: 50,
  /** Refuse to decode an image larger than this (width x height). */
  maxSourcePixels: 40_000_000,
  /** Longest edge handed to OCR. Larger images are downscaled first. */
  maxOcrEdge: 2600,
  /** Longest edge of the small copies used to find a sideways page's orientation. */
  orientationProbeEdge: 1100,
  /** Pixel budget for one rendered PDF page. */
  maxRenderPixels: 6_500_000,
  /** Render scale for a scanned PDF page before the pixel budget applies. */
  renderScale: 2,
  /** Wall-clock budget for one reading, engine start-up included. */
  timeoutMs: 60_000,
  /** A page with fewer embedded characters than this is treated as a scan. */
  minEmbeddedChars: 40,
  /** Longest line and total text kept, so a hostile PDF cannot flood the parser. */
  maxLineLength: 400,
  maxLines: 600,
  /** OCR word confidence (0..1) below which a value is not filled automatically. */
  minOcrConfidence: 0.8,
} as const;

/** Bumped whenever parsing rules change, so a reading can be attributed. */
// /2 (20261214, India entry): compact day-month-year dates ("03-Apr-2023"),
// "date of issuance", "name of candidate", and printed titles set aside when a
// name is compared. Ambiguous numeric dates are still never resolved.
export const HAYAT_READER_VERSION = "hayat-reader/2";
