import { PRIVACY, TERMS, type LegalDocument } from "./documents";

// ── IS A DOCUMENT FINAL? ────────────────────────────────────────────────
//
// The owner's texts carry bracketed decisions not yet made ("[Ange …]",
// "[Länk …]", "[publiceringsdatum]"). A document with even one of them is a
// DRAFT, and the product says so: a banner on the page, noindex, no sitemap
// entry, and an acceptance recorded against the draft version, never against
// the final one. A document becomes final when its last gap is filled AND
// the owner has approved it (OWNER_APPROVED); then everywhere at once.

export const OPEN_POINT = /\[(?:Ange|ange|Länk|länk|publiceringsdatum)[^\]]*\]/g;

/** Every undecided point in a document, in reading order. */
export function openPoints(doc: LegalDocument): string[] {
  const out: string[] = [];
  const scan = (t: string) => out.push(...(t.match(OPEN_POINT) ?? []));
  scan(doc.date);
  for (const s of [{ heading: "", blocks: doc.intro }, ...doc.sections]) {
    scan(s.heading);
    for (const b of s.blocks) {
      if (b.type === "p" || b.type === "placeholder") scan(b.text);
      else if (b.type === "list") b.items.forEach(scan);
      else [...b.head, ...b.rows.flat()].forEach(scan);
    }
  }
  return out;
}

/** The owner's explicit approval of the text as published, one per document.
 *  Filling the last gap is not enough: a document with no open points is
 *  still a draft until the owner approves it here, in a reviewed change. */
export const OWNER_APPROVED = { terms: false, privacy: false } as const;

export const TERMS_FINAL = openPoints(TERMS).length === 0 && OWNER_APPROVED.terms;
export const PRIVACY_FINAL = openPoints(PRIVACY).length === 0 && OWNER_APPROVED.privacy;

/** What an account records when it accepts the terms. A draft's acceptance
 *  is recorded as a draft's, so the final text is asked for again. */
export const ACCEPTED_TERMS_VERSION = TERMS_FINAL ? TERMS.date : `${TERMS.date}-utkast`;
