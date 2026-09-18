// HAYAT — document reading: the type spine.
//
// ── TWO THINGS THAT MUST NEVER BE FOLDED INTO ONE ──────────────────────
//
// "Document read" and "credential verified" are different facts. Everything in
// this file describes the FIRST: what a machine could read off a document the
// holder chose, offered back to the holder as an editable suggestion.
//
// Nothing here is a trust signal. A reading is produced in the holder's own
// browser from a file the holder controls, so on the server it is exactly as
// trustworthy as anything else the holder types -- which is to say it is a
// claim. The verification model lives in ./verification and takes none of
// these types as evidence.

/** Where a line of text came from. Embedded PDF text is exact; OCR is a guess
 *  with a confidence attached, and the parser treats the two differently. */
export type TextSource = "pdf_text" | "ocr";

export interface TextLine {
  /** 1-based page. An image is page 1. */
  readonly page: number;
  readonly text: string;
  readonly source: TextSource;
  /** 0..1 for OCR (the weakest word on the line), null for embedded text. */
  readonly confidence: number | null;
}

export interface DocumentText {
  readonly lines: readonly TextLine[];
  readonly pageCount: number;
  /** Pages actually read; fewer than pageCount when the page limit applied. */
  readonly pagesRead: number;
}

/** Every way a reading can fail, named so the form can offer a next action
 *  instead of a shrug. None of them loses the form. */
export type ReadFailure =
  | "unsupported_format" // HEIC and anything else the browser cannot decode
  | "encrypted" // password-protected PDF
  | "unreadable" // corrupt, truncated or not what its MIME type says
  | "too_large_to_process" // pixel budget exceeded: a decode bomb or a poster scan
  | "timeout"
  | "no_text" // read fine, nothing legible on it
  | "engine_unavailable"; // the reader itself could not start (offline, blocked worker)

export type ReadOutcome =
  | { readonly ok: true; readonly text: DocumentText }
  | { readonly ok: false; readonly reason: ReadFailure };

/**
 * The replaceable seam. The browser implementation (pdf.js + Tesseract.js) is
 * one implementation; a server-side worker would be another, and the form
 * does not know which it is talking to.
 *
 * `signal` is not optional: a reading that cannot be abandoned is a reading
 * that can fill the form after the holder has replaced the file.
 */
export interface DocumentReader {
  read(file: Blob, mimeType: string, signal: AbortSignal): Promise<ReadOutcome>;
}

/** Why a value that WAS found is nevertheless not filled in automatically. */
export type UncertaintyReason =
  | "low_ocr_confidence"
  | "confusable_characters" // O/0, I/1, S/5, B/8 in an OCR'd identifier
  | "several_candidates"
  | "ambiguous_day_month" // 03/04/2026
  | "inconsistent_dates"; // expiry before issue

export interface Provenance {
  readonly page: number;
  /** The line the value was read from, for the holder to compare. Shown only in
   *  the holder's own form; never stored, never sent anywhere. */
  readonly excerpt: string;
}

export type FieldReading =
  | { readonly state: "read"; readonly value: string; readonly provenance: Provenance }
  | {
      readonly state: "uncertain";
      /** Candidate values, best first. Never applied without the holder choosing. */
      readonly candidates: readonly string[];
      readonly reason: UncertaintyReason;
      readonly provenance: Provenance;
    }
  | { readonly state: "not_found" };

export type ComparisonResult =
  /** The document names what the holder selected. */
  | { readonly state: "match" }
  /** The document names a DIFFERENT catalogue entry and not the selected one. */
  | { readonly state: "different"; readonly found: string }
  | { readonly state: "not_found" }
  /** Nothing governed to compare against (e.g. issuer is stated on the document). */
  | { readonly state: "not_applicable" };

export type HolderNameComparison =
  | { readonly state: "match" | "differs"; readonly nameOnDocument: string }
  | { readonly state: "not_found" | "not_compared"; readonly nameOnDocument: string | null };

/** The fields HAYAT may suggest. Exactly the form's own field names. */
export type SuggestibleField = "identifier" | "issued_on" | "valid_until" | "issuer_name";

export interface DocumentReading {
  readonly fields: Readonly<Record<SuggestibleField, FieldReading>>;
  readonly issuer: ComparisonResult;
  readonly credentialType: ComparisonResult;
  readonly holderName: HolderNameComparison;
  readonly usedOcr: boolean;
  readonly pageCount: number;
  readonly pagesRead: number;
}

/** What the parser compares the document against: the holder's SELECTION and
 *  the rest of the governed catalogue, never free text from the document. */
export interface ReadingContext {
  readonly selected: {
    readonly code: string;
    /** Every governed name for the selected definition: sv, en, abbreviation. */
    readonly names: readonly string[];
    /** Governed issuer names. Search aliases are deliberately NOT used: they are
     *  approved for the catalogue search only and must never be rendered, and a
     *  mismatch message renders what it matched. Empty when stated on document. */
    readonly issuerNames: readonly string[];
    readonly issuerStatedOnDocument: boolean;
  };
  readonly others: readonly {
    readonly code: string;
    /** What a mismatch is reported AS: the governed name in the form's language.
     *  Matching may use an abbreviation; the holder is only ever shown this. */
    readonly label: string;
    readonly names: readonly string[];
    readonly issuerLabel: string;
    readonly issuerNames: readonly string[];
  }[];
  /** The account's display name, when the caller has one. */
  readonly accountName: string | null;
  /** Today, YYYY-MM-DD. Injected so tests are not clock-dependent. */
  readonly today: string;
}
