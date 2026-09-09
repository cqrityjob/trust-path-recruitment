/**
 * PR-P0a negative controls — six mutations.
 *
 * Two prove the token-entry response headers are actually asserted. Four prove
 * that each of the four CR/LF rejection layers in `safeReturnPath` is
 * load-bearing.
 *
 * ── WHY THE FOUR LAYERS NEEDED SEPARATE PREDICATES ─────────────────────
 *
 * End to end the layers overlap. A raw "\r" survives percent-decoding, so if
 * the raw layer were deleted the once-decoded layer would still refuse the
 * value and `safeReturnPath` would still fall back. An end-to-end test would
 * pass, and the deletion would ship.
 *
 * There is no input that ONLY the raw layer catches, so no end-to-end case can
 * prove that layer is doing work. The layers are therefore exported
 * individually from safe-redirect.ts and asserted individually in
 * public-assessment-auth-check.ts, and these controls disable them one at a
 * time. That is the difference between four assertions and four assertions
 * that would notice.
 *
 * Run: bun run negative-controls:p0a
 */

import { runControls, type Mutation } from "./runner";

const SHARE = "src/lib/security-passport/share-transport.ts";
const REDIRECT = "src/lib/auth/safe-redirect.ts";
const SHARE_GUARD = "passport-share-transport:check";
const REDIRECT_GUARD = "public-assessment-auth:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "SHARE-TRANSPORT-CACHE",
    defect: "the token-entry response reverts to a bare no-store",
    file: SHARE,
    find: '"Cache-Control": "private, no-store",',
    replace: '"Cache-Control": "no-store",',
    guard: SHARE_GUARD,
    expect: 'Cache-Control must be "private, no-store"',
  },
  {
    id: "SHARE-TRANSPORT-ROBOTS",
    defect: "noarchive is dropped, so a crawler may still offer a cached copy",
    file: SHARE,
    find: '"X-Robots-Tag": "noindex, nofollow, noarchive",',
    replace: '"X-Robots-Tag": "noindex, nofollow",',
    guard: SHARE_GUARD,
    expect: "X-Robots-Tag must include noarchive",
  },
  {
    id: "SAFE-REDIRECT-CRLF-RAW",
    defect: "layer 1 stops seeing a line terminator in the raw value",
    file: REDIRECT,
    find: "export function rawHasLineBreak(raw: string): boolean {\n  return LINE_BREAKING.test(raw);\n}",
    replace: "export function rawHasLineBreak(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "raw CR/LF accepted: case 1",
  },
  {
    id: "SAFE-REDIRECT-CRLF-1",
    defect: "layer 2 stops inspecting the once-decoded value",
    file: REDIRECT,
    find: "export function decodedOnceHasLineBreak(raw: string): boolean {\n  const once = decodeOnceForInspection(raw);\n  if (once === null) return true;\n  return LINE_BREAKING.test(once);\n}",
    replace:
      "export function decodedOnceHasLineBreak(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "single-encoded CR/LF accepted: case 4",
  },
  {
    id: "SAFE-REDIRECT-CRLF-2",
    defect: "layer 3 stops inspecting the twice-decoded value",
    file: REDIRECT,
    find: "export function decodedTwiceHasLineBreak(raw: string): boolean {\n  const once = decodeOnceForInspection(raw);\n  if (once === null) return true;\n  const twice = decodeOnceForInspection(once);\n  if (twice === null) return true;\n  return LINE_BREAKING.test(twice);\n}",
    replace:
      "export function decodedTwiceHasLineBreak(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "double-encoded CR/LF accepted: case 9",
  },
  {
    id: "SAFE-REDIRECT-CRLF-PATTERN",
    defect: "layer 4 stops refusing encoded CR/LF at any depth",
    file: REDIRECT,
    find: "export function hasEncodedLineBreak(raw: string): boolean {\n  return ENCODED_LINE_BREAK.test(raw);\n}",
    replace:
      "export function hasEncodedLineBreak(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "encoded CR/LF pattern accepted: case 15",
  },
];

runControls("p0a", MUTATIONS);
