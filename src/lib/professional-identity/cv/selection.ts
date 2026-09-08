// Which of a person's real facts belong on THIS CV.
//
// ── AN ALLOWLIST, AND WHY IT REPLACED AN EXCLUSION LIST ────────────────
//
// The first version of this file stored what the person had taken OFF, and
// argued for it: an inclusion list that loses an id HIDES a fact somebody
// believed was on their CV, while an exclusion list that loses one merely
// SHOWS a fact they had already shown once. As an argument about typos that
// is sound. As an argument about a security boundary it is exactly backwards.
//
// The failure that matters is not a lost id. It is a MALFORMED, STALE or
// ADVERSARIAL request:
//
//   exclusion model   the list says what to REMOVE. An empty, truncated,
//                     corrupted or replayed list removes nothing, and the
//                     document is built from everything the person has. The
//                     failure mode is DISCLOSURE, and it is silent.
//
//   allowlist model   the list says what to INCLUDE. An empty, truncated,
//                     corrupted or replayed list includes nothing, and the
//                     server refuses the result as having no professional
//                     history. The failure mode is a REFUSAL somebody sees.
//
// A CV carries employment history and credentials. Between "shows too much,
// quietly" and "shows too little, loudly", there is no version of this
// product that should pick the first.
//
// ── AND THE LIST IS A REQUEST, NEVER A LOOKUP ──────────────────────────
//
// What the person GETS is this array INTERSECTED with rows they own that are
// currently active — in SQL, in `cv_source_bundle`, which is the boundary.
// There is no branch in which an id ADDS information: an unknown id, another
// holder's id, a withdrawn credential's id and an id from a CV saved a year
// ago all contribute exactly nothing.
//
// This module is that rule stated in TypeScript, for the picker and the
// preview. It is deliberately NOT the enforcement point. A filter that lived
// only up here was worth nothing at all, because `authenticated` could write
// the table directly — see the header of
// 20261102090000_cv_documents_server_owned.sql, which is where that was
// found and closed.
//
// ── WHAT SELECTION IS NOT ──────────────────────────────────────────────
//
// It is not deletion, and it is not archiving. Leaving an employment off
// changes one CV. It writes nothing to `sp_experience_periods`, nothing to
// `sp_claims`, and the fact stays exactly where it was — which is why the
// screen can offer it back and `omittedFacts` below exists to list it.
//
// It is also not a trust decision. A fact left off is not "unverified"; it is
// not on this document. Nothing here reads or writes an assertion level.

import { z } from "zod";
import type { CvFactClaim, CvFactEmployment, CvSourceBundle } from "./source-bundle";
import type { BundleSection } from "./bundle-diff";

export const CV_SELECTION_VERSION = "cv-selection-v2" as const;

/**
 * The ids the person asked to put ON one CV.
 *
 * One flat array over employment ids and claim ids alike. They are database
 * uuids from two tables and cannot collide, and a reader of the request
 * benefits from "these are the things this person chose" being one list
 * rather than five.
 *
 * Bounded, and uuid-shaped: four hundred identifiers is already far past any
 * career, and an id that is not a uuid is not an id this product issued.
 */
export const cvSelectionSchema = z
  .array(z.string().uuid())
  .max(400)
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

export type CvIncludedIds = readonly string[];

/**
 * Keep only what was asked for.
 *
 * `undefined` means "nobody has narrowed this yet" and keeps everything — the
 * state the picker starts in. An EMPTY ARRAY means "nothing", and stays
 * empty. The two are different requests and must not collapse into each
 * other; the same distinction is drawn in SQL, where NULL keeps what a CV
 * already carries and `ARRAY[]` is refused as having no professional history.
 */
export function keepOnly<T extends { readonly id: string }>(
  rows: readonly T[],
  included: CvIncludedIds | undefined,
): readonly T[] {
  if (included === undefined) return rows;
  const keep = new Set(included);
  return rows.filter((row) => keep.has(row.id));
}

/* ------------------------------------------------------------------ */
/* Reporting what is NOT on the CV                                     */
/* ------------------------------------------------------------------ */

/**
 * One fact the person has, which this CV does not carry.
 *
 * ── WHY THE OMISSIONS ARE REPORTED AT ALL ──────────────────────────────
 *
 * Because a CV is judged by what is missing from it, and the person is the
 * only one who can tell "I left that off deliberately" from "I did not
 * realise it was not there". A quiet omission is indistinguishable from a
 * bug, and a candidate discovers it when an employer asks why their licence
 * is not on their CV.
 *
 * Carries a `label` the person will recognise — an employer name, a
 * credential title — and never an internal id in anything rendered.
 */
export interface CvOmittedFact {
  readonly id: string;
  readonly section: BundleSection;
  readonly label: string;
  /** A second line, where the section has one worth showing: the role for
   *  an employment, the issuer for a credential. Null otherwise. */
  readonly detail: string | null;
}

function claimOmission(section: BundleSection, claim: CvFactClaim): CvOmittedFact {
  return { id: claim.id, section, label: claim.title, detail: claim.issuerName };
}

function employmentOmission(fact: CvFactEmployment): CvOmittedFact {
  return {
    id: fact.id,
    section: "employment",
    label: fact.employerName,
    detail: fact.roleTitle,
  };
}

/**
 * Everything in `full` that `carried` does not contain.
 *
 * Computed by difference rather than from the request, deliberately. The
 * request says what somebody ASKED for; this says what is actually absent —
 * which also covers a record added to the profile after the CV was saved, and
 * is therefore the honest answer to "what is not on this CV" rather than the
 * answer to a different question.
 */
export function omittedFacts(
  full: CvSourceBundle,
  carried: CvSourceBundle,
): readonly CvOmittedFact[] {
  const present = new Set<string>();
  for (const e of carried.employment) present.add(e.id);
  for (const group of [carried.education, carried.credentials, carried.skills, carried.languages]) {
    for (const c of group) present.add(c.id);
  }

  const out: CvOmittedFact[] = [];
  for (const e of full.employment) {
    if (!present.has(e.id)) out.push(employmentOmission(e));
  }
  const claimGroups: readonly (readonly [BundleSection, readonly CvFactClaim[]])[] = [
    ["education", full.education],
    ["credentials", full.credentials],
    ["skills", full.skills],
    ["languages", full.languages],
  ];
  for (const [section, claims] of claimGroups) {
    for (const c of claims) {
      if (!present.has(c.id)) out.push(claimOmission(section, c));
    }
  }
  return out;
}

/** Every selectable id in a bundle: the picker's universe, and the starting
 *  selection for a CV nobody has narrowed yet. */
export function selectableIds(bundle: CvSourceBundle): readonly string[] {
  const ids: string[] = [];
  for (const e of bundle.employment) ids.push(e.id);
  for (const group of [bundle.education, bundle.credentials, bundle.skills, bundle.languages]) {
    for (const c of group) ids.push(c.id);
  }
  return ids;
}

/**
 * Does this selection leave a document worth sending?
 *
 * The same predicate `readiness.ts` and `application-source.ts` apply, and the
 * same one `cv_bundle_is_ready` applies in SQL — asked here so the refusal is
 * a sentence beside the checkboxes rather than an error after a button.
 *
 * Skills, languages and a Career Discovery result deliberately do not count.
 * `readiness.ts` sets out why at length and this is that rule, not a second.
 */
export function selectionHasHistory(
  bundle: CvSourceBundle,
  included: CvIncludedIds | undefined,
): boolean {
  return (
    keepOnly(bundle.employment, included).length > 0 ||
    keepOnly(bundle.education, included).length > 0
  );
}
