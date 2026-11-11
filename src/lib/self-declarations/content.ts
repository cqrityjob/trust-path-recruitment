// Voluntary self-declarations — what an uploaded file actually is.
//
// Nothing here trusts what the request says about itself. The order matters:
//
//   1. the ENCODED text is bounded before anything is decoded, so a huge
//      body is refused without allocating its decoded form;
//   2. the base64 is strict and canonical -- no whitespace, no URL alphabet,
//      no stray padding, and it must re-encode to exactly what was sent;
//   3. the decoded size is bounded;
//   4. the real content is recognised from its own bytes, and must be the
//      type the request declared. A file's name and its declared MIME type
//      are claims; the signature is the fact.
//
// The same recognition runs again on the bytes read BACK from Storage before
// the server vouches for them (document-store.server.ts), so a direct upload
// cannot put anything else behind a declared hash and type.
//
// Pure: no I/O. `Buffer` is used for decoding and exists wherever this runs
// (the server function and the tests).

import { DOCUMENT_ALLOWED_MIME, DOCUMENT_MAX_BYTES, type DocumentMime } from "./model";

/** Base64 expands 3 bytes to 4 characters, padded to a multiple of four. */
export const DOCUMENT_MAX_ENCODED_LENGTH = Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4;

export type ContentRejection =
  | "encoded_too_large"
  | "not_base64"
  | "empty"
  | "too_large"
  | "unrecognised"
  | "type_mismatch";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Strict, canonical base64 only. Returns null for anything else. */
export function decodeStrictBase64(text: string): Uint8Array | null {
  if (text.length === 0 || text.length % 4 !== 0 || !BASE64.test(text)) return null;
  const bytes = Buffer.from(text, "base64");
  // Node's decoder is lenient; canonical input round-trips exactly.
  if (bytes.toString("base64") !== text) return null;
  return new Uint8Array(bytes);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, i) => bytes[at + i] === byte);
}

function lastIndexOf(bytes: Uint8Array, needle: readonly number[], within: number): number {
  const from = Math.max(0, bytes.length - within);
  for (let i = bytes.length - needle.length; i >= from; i -= 1) {
    if (needle.every((byte, j) => bytes[i + j] === byte)) return i;
  }
  return -1;
}

const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));
const PDF_HEADER = ascii("%PDF-");
const PDF_EOF = ascii("%%EOF");
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR = [0x00, 0x00, 0x00, 0x0d, ...ascii("IHDR")];
const PNG_IEND = [0x00, 0x00, 0x00, 0x00, ...ascii("IEND"), 0xae, 0x42, 0x60, 0x82];
const JPEG_SOI = [0xff, 0xd8, 0xff];
const JPEG_EOI = [0xff, 0xd9];

function isPdf(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, PDF_HEADER)) return false;
  // "%PDF-1.7" / "%PDF-2.0": a digit, a dot, a digit.
  const [major, dot, minor] = [bytes[5], bytes[6], bytes[7]];
  const digit = (b: number | undefined) => b !== undefined && b >= 0x30 && b <= 0x39;
  if (!digit(major) || dot !== 0x2e || !digit(minor)) return false;
  return lastIndexOf(bytes, PDF_EOF, 1024) !== -1;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, PNG_SIGNATURE) &&
    startsWith(bytes, PNG_IHDR, PNG_SIGNATURE.length) &&
    bytes.length >= PNG_SIGNATURE.length + 25 + PNG_IEND.length &&
    startsWith(bytes, PNG_IEND, bytes.length - PNG_IEND.length)
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, JPEG_SOI)) return false;
  // The fourth byte is a marker: an application or table segment, never fill.
  const marker = bytes[3];
  if (marker === undefined || marker < 0xc0 || marker === 0xff) return false;
  return startsWith(bytes, JPEG_EOI, bytes.length - JPEG_EOI.length);
}

/** The type the bytes themselves are, or null. Never looks at a name or a claim. */
export function sniffDocumentMime(bytes: Uint8Array): DocumentMime | null {
  if (isPdf(bytes)) return "application/pdf";
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  return null;
}

export type ContentCheck =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: ContentRejection };

/** Size and real type of decoded bytes against a declared type. */
export function checkDocumentBytes(bytes: Uint8Array, declaredMime: string): ContentCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > DOCUMENT_MAX_BYTES) return { ok: false, reason: "too_large" };
  const actual = sniffDocumentMime(bytes);
  if (actual === null) return { ok: false, reason: "unrecognised" };
  if (
    !(DOCUMENT_ALLOWED_MIME as readonly string[]).includes(declaredMime) ||
    actual !== declaredMime
  ) {
    return { ok: false, reason: "type_mismatch" };
  }
  return { ok: true, bytes };
}

/** The whole gate for a request body: bound, decode strictly, bound, recognise. */
export function validateEncodedDocument(contentBase64: string, declaredMime: string): ContentCheck {
  if (contentBase64.length > DOCUMENT_MAX_ENCODED_LENGTH) {
    return { ok: false, reason: "encoded_too_large" };
  }
  const bytes = decodeStrictBase64(contentBase64);
  if (bytes === null)
    return { ok: false, reason: contentBase64.length === 0 ? "empty" : "not_base64" };
  return checkDocumentBytes(bytes, declaredMime);
}
