// Return-URL (redirect/next) allow-list.
//
// Used by every route that accepts a post-auth redirect destination: the
// unified entrance (/login, /signup), the four compatibility redirects that
// preceded it (/candidate/login, /candidate/register, /employer/login,
// /employer/register) and /auth. Never trust a browser-supplied redirect
// value beyond what this function allows through — this is the concrete
// mitigation for open-redirect and external-navigation abuse, per
// docs/auth/candidate-employer-portal-spec-v1.md §11.

/** Every path that renders or redirects to an authentication surface.
 *  Returning to one after signing in is a loop, never a destination. */
export const AUTH_SURFACES: readonly string[] = [
  "/login",
  "/signup",
  "/auth",
  "/candidate/login",
  "/candidate/register",
  "/employer/login",
  "/employer/register",
  "/admin/login",
  "/reset-password",
];

/** CR, LF and the two Unicode line terminators.
 *
 *  U+2028 and U+2029 are here because they terminate a line for a JavaScript
 *  parser and for some header writers even though they are not CR or LF, so a
 *  check that names only \r and \n has a gap exactly where a value gets
 *  interpolated into a script or a header. */
const LINE_BREAKING = /[\r\n\u2028\u2029]/;

/** Any depth of percent-encoded CR or LF: %0d, %250d, %25250d, and the LF
 *  forms, in either case. */
const ENCODED_LINE_BREAK = /%(25)*0[ad]/i;

/**
 * Percent-decode once, for INSPECTION only.
 *
 * Returns null when the value is not decodable — a malformed escape such as a
 * lone "%" or "%zz" makes `decodeURIComponent` throw, and a caller that cannot
 * be decoded cannot be inspected, so it is refused rather than guessed at.
 *
 * The decoded value is never returned to a caller and never navigated to.
 */
function decodeOnceForInspection(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

// ── FOUR LAYERS, EXPORTED SEPARATELY, AND WHY ─────────────────────────────
//
// These read as redundant end to end, and for most inputs they are: a raw
// "\r" survives decoding, so the once-decoded layer would catch it even if
// the raw layer were deleted. That overlap is the point of defence in depth,
// but it also means a test that only calls safeReturnPath cannot tell which
// layer did the work — delete the raw check and every case still fails
// closed, so the test still passes and the deletion ships.
//
// So each layer is its own exported predicate and each is asserted directly.
// A guard can then prove that the raw layer is load-bearing without having to
// find an input that ONLY the raw layer catches, which for this class of
// input does not exist.
//
// They are exported for that reason and no other. `safeReturnPath` remains
// the only function a caller should use to decide a destination.

/** Layer 1 — a line terminator in the value exactly as supplied. */
export function rawHasLineBreak(raw: string): boolean {
  return LINE_BREAKING.test(raw);
}

/** Layer 2 — what one downstream decoder would see. Undecodable is a break:
 *  a value that cannot be inspected is not a value that can be trusted. */
export function decodedOnceHasLineBreak(raw: string): boolean {
  const once = decodeOnceForInspection(raw);
  if (once === null) return true;
  return LINE_BREAKING.test(once);
}

/** Layer 3 — what two decoders in series would see. */
export function decodedTwiceHasLineBreak(raw: string): boolean {
  const once = decodeOnceForInspection(raw);
  if (once === null) return true;
  const twice = decodeOnceForInspection(once);
  if (twice === null) return true;
  return LINE_BREAKING.test(twice);
}

/** Layer 4 — any remaining encoding depth, read off the raw string.
 *
 *  Decoding twice is not decoding forever: a value encoded three times passes
 *  layers 2 and 3 with no terminator in sight and is then handed to something
 *  that decodes once more. This layer refuses the shape regardless of depth. */
export function hasEncodedLineBreak(raw: string): boolean {
  return ENCODED_LINE_BREAK.test(raw);
}

export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 500) return fallback;

  // The value returned at the end is always `raw`. The layers below decode
  // only to inspect; if a decoded form were returned, this function would be
  // performing the unescaping it exists to defend against.
  if (rawHasLineBreak(raw)) return fallback;
  if (decodedOnceHasLineBreak(raw)) return fallback;
  if (decodedTwiceHasLineBreak(raw)) return fallback;
  if (hasEncodedLineBreak(raw)) return fallback;

  // Must start with a single "/" — rejects protocol-relative ("//evil.com"),
  // absolute URLs ("https://..."), and anything not path-shaped.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Browsers normalise a backslash to a forward slash in the authority
  // position, so "/\\evil.test" and "/\evil.test" navigate OFF-SITE exactly
  // like "//evil.test". The leading-"//" check above does not see them.
  // Found by scripts/public-assessment-auth-check.ts, not by review.
  if (raw.startsWith("/\\") || raw.startsWith("\\")) return fallback;
  if (raw.includes("\\")) return fallback;
  // Rejects "javascript:", "https://", embedded scheme markers anywhere in
  // the string (defence in depth beyond the leading-character check above).
  if (raw.includes("://")) return fallback;
  // Never redirect back into an auth surface — loop prevention.
  //
  // The list grew when the four portal doors collapsed into one. It is
  // written as a prefix sweep rather than four equality checks because the
  // dangerous forms are the ones with a query string on them: a
  // "/login?redirect=/login?redirect=..." chain is what actually produces
  // the loop, and an equality check does not see it.
  //
  // /candidate/* and /employer/register are themselves redirects ONTO
  // /login now, so returning to one of them is a two-hop loop rather than a
  // one-hop one. Same defect, so the same refusal.
  for (const surface of AUTH_SURFACES) {
    if (raw === surface || raw.startsWith(`${surface}?`) || raw.startsWith(`${surface}/`)) {
      return fallback;
    }
  }
  return raw;
}

/** Split a validated return path into the parts TanStack Router needs.
 *
 *  `navigate({ to })` does not parse a query string out of `to` — passing
 *  "/a/b?x=1" navigates to a literal path containing "?", silently losing
 *  the params. Career Discovery carries its session uuid in the query
 *  string, so the return target must be split before navigating.
 *
 *  Always run the raw value through safeReturnPath FIRST; this function
 *  assumes an already-validated internal path and does not re-check origin. */
export function splitReturnPath(safePath: string): {
  to: string;
  search: Record<string, string>;
} {
  const hashIndex = safePath.indexOf("#");
  const withoutHash = hashIndex === -1 ? safePath : safePath.slice(0, hashIndex);
  const q = withoutHash.indexOf("?");
  if (q === -1) return { to: withoutHash, search: {} };

  const to = withoutHash.slice(0, q);
  const search: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(withoutHash.slice(q + 1))) {
    search[k] = v;
  }
  return { to, search };
}
