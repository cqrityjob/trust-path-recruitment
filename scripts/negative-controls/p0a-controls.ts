/**
 * PR-P0a negative controls — six mutations, plus five for the control-character layers (2026-10-03).
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
  // ── TAB, NUL and the rest of C0, and DEL (2026-10-03) ───────────────────
  //
  // "/\t/evil.test" is accepted by every structural check and becomes
  // "//evil.test" once a URL parser has deleted the TAB. The same four layers
  // exist for control characters; each is disabled on its own here.
  {
    id: "SAFE-REDIRECT-CTRL-RAW",
    defect:
      "layer 5 stops seeing a TAB or NUL in the raw value, so '/<TAB>/evil.test' is a return path",
    file: REDIRECT,
    find: "export function rawHasControlChar(raw: string): boolean {\n  return CONTROL_CHARS.test(raw);\n}",
    replace:
      "export function rawHasControlChar(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "raw TAB accepted",
  },
  {
    id: "SAFE-REDIRECT-CTRL-1",
    defect: "layer 6 stops inspecting the once-decoded value for a control character",
    file: REDIRECT,
    find: "export function decodedOnceHasControlChar(raw: string): boolean {\n  const once = decodeOnceForInspection(raw);\n  if (once === null) return true;\n  return CONTROL_CHARS.test(once);\n}",
    replace:
      "export function decodedOnceHasControlChar(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "single-encoded TAB accepted",
  },
  {
    id: "SAFE-REDIRECT-CTRL-2",
    defect: "layer 7 stops inspecting the twice-decoded value for a control character",
    file: REDIRECT,
    find: "export function decodedTwiceHasControlChar(raw: string): boolean {\n  const once = decodeOnceForInspection(raw);\n  if (once === null) return true;\n  const twice = decodeOnceForInspection(once);\n  if (twice === null) return true;\n  return CONTROL_CHARS.test(twice);\n}",
    replace:
      "export function decodedTwiceHasControlChar(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "double-encoded TAB accepted",
  },
  {
    id: "SAFE-REDIRECT-CTRL-PATTERN",
    defect: "layer 8 stops refusing an encoded control character at any depth",
    file: REDIRECT,
    find: "export function hasEncodedControlChar(raw: string): boolean {\n  return ENCODED_CONTROL_CHAR.test(raw);\n}",
    replace:
      "export function hasEncodedControlChar(raw: string): boolean {\n  return raw.length < 0;\n}",
    guard: REDIRECT_GUARD,
    expect: "deeply encoded control pattern accepted",
  },
  {
    id: "SAFE-REDIRECT-CTRL-NOT-CALLED",
    defect:
      "safeReturnPath stops consulting the control-character layers, so the predicates exist and nothing uses them",
    file: REDIRECT,
    find: "  if (rawHasControlChar(raw)) return fallback;\n  if (decodedOnceHasControlChar(raw)) return fallback;\n  if (decodedTwiceHasControlChar(raw)) return fallback;\n  if (hasEncodedControlChar(raw)) return fallback;\n",
    replace: "",
    guard: REDIRECT_GUARD,
    expect: "control character falls back: a raw TAB makes",
  },
];

runControls("p0a", MUTATIONS);
