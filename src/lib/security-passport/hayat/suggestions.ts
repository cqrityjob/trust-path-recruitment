// HAYAT — putting a reading into the form without taking the form away from
// the holder.
//
// Three rules, and every function here exists to keep one of them:
//
//   1. WHAT THE HOLDER TYPED WINS. A reading fills an EMPTY field. Where the
//      holder already wrote something different, their value stays and the
//      document's value is shown beside it as a choice.
//   2. AN UNCERTAIN VALUE IS NEVER FILLED. It is offered, and the holder picks.
//   3. A READING BELONGS TO ITS FILE. When the file is replaced or removed,
//      every value HAYAT filled that the holder has not since edited is taken
//      back out. A value the holder edited is theirs and stays.
//
// Pure: no React, no clock, no I/O -- so the rules can be tested as rules.

import type { DocumentReading, FieldReading, SuggestibleField, UncertaintyReason } from "./types";

export const SUGGESTIBLE_FIELDS: readonly SuggestibleField[] = [
  "identifier",
  "issued_on",
  "valid_until",
  "issuer_name",
];

/** The slice of the form's draft HAYAT may touch. */
export type SuggestibleDraft = {
  identifier: string;
  issued_on: string;
  valid_until: string;
  issuer_name?: string;
  no_expiry: boolean | null;
};

/** field -> the exact value HAYAT put there. The field is "read by HAYAT" only
 *  while the draft still holds that exact value. */
export type HayatMarks = Partial<Record<SuggestibleField, string>>;

export type FieldNotice =
  | { readonly kind: "filled"; readonly value: string }
  | { readonly kind: "agrees"; readonly value: string }
  | { readonly kind: "conflict"; readonly documentValue: string }
  | {
      readonly kind: "choose";
      readonly candidates: readonly string[];
      readonly reason: UncertaintyReason;
    }
  /** The document states an expiry but the holder ticked "no expiry". */
  | { readonly kind: "no_expiry_conflict"; readonly documentValue: string }
  | { readonly kind: "not_found" };

export type FieldNotices = Partial<Record<SuggestibleField, FieldNotice>>;

const current = (draft: SuggestibleDraft, field: SuggestibleField): string =>
  (draft[field] ?? "").trim();

export const isReadByHayat = (
  draft: SuggestibleDraft,
  marks: HayatMarks,
  field: SuggestibleField,
): boolean => marks[field] !== undefined && current(draft, field) === marks[field];

function noticeFor(
  field: SuggestibleField,
  reading: FieldReading,
  draft: SuggestibleDraft,
): FieldNotice {
  if (reading.state === "not_found") return { kind: "not_found" };
  if (reading.state === "uncertain") {
    const typed = current(draft, field);
    if (typed && reading.candidates.includes(typed)) return { kind: "agrees", value: typed };
    return { kind: "choose", candidates: reading.candidates, reason: reading.reason };
  }
  if (field === "valid_until" && draft.no_expiry === true)
    return { kind: "no_expiry_conflict", documentValue: reading.value };
  const typed = current(draft, field);
  if (typed === "") return { kind: "filled", value: reading.value };
  if (typed.toLocaleLowerCase() === reading.value.toLocaleLowerCase())
    return { kind: "agrees", value: typed };
  return { kind: "conflict", documentValue: reading.value };
}

export function applyReading<D extends SuggestibleDraft>(
  draft: D,
  reading: DocumentReading,
  applicable: readonly SuggestibleField[],
): { draft: D; marks: HayatMarks; notices: FieldNotices } {
  const next = { ...draft };
  const marks: HayatMarks = {};
  const notices: FieldNotices = {};
  for (const field of applicable) {
    const notice = noticeFor(field, reading.fields[field], draft);
    notices[field] = notice;
    if (notice.kind === "filled") {
      next[field] = notice.value;
      marks[field] = notice.value;
    }
  }
  return { draft: next, marks, notices };
}

/** The holder chose a document value (a conflict, or one of several candidates). */
export function acceptValue<D extends SuggestibleDraft>(
  draft: D,
  marks: HayatMarks,
  notices: FieldNotices,
  field: SuggestibleField,
  value: string,
): { draft: D; marks: HayatMarks; notices: FieldNotices } {
  const next = { ...draft, [field]: value };
  // Choosing the document's expiry is choosing that the credential expires.
  if (field === "valid_until") next.no_expiry = null;
  return {
    draft: next,
    marks: { ...marks, [field]: value },
    notices: { ...notices, [field]: { kind: "filled", value } },
  };
}

/** The file went away: take back what HAYAT filled and the holder left alone. */
export function withdrawReading<D extends SuggestibleDraft>(draft: D, marks: HayatMarks): D {
  const next = { ...draft };
  for (const field of SUGGESTIBLE_FIELDS) if (isReadByHayat(draft, marks, field)) next[field] = "";
  return next;
}
