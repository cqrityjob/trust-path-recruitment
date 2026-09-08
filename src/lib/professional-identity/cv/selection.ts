// Which of a person's real facts belong on THIS CV.
//
// ── WHY SELECTION IS APPLIED TO THE BUNDLE, NOT TO THE RENDERER ────────
//
// The obvious implementation is a filter in `CvDocumentView`: keep every
// fact in the source bundle and simply do not draw the ones the person
// deselected. It renders correctly, it is two lines, and it is wrong.
//
// A saved CV's `source_bundle` is COPIED, verbatim, onto a job application
// when the candidate applies with it (20261018090000). That copy is
// employer-readable by design — it is the artefact the employer received.
// So a renderer-side filter would produce a document that visibly omits an
// employment while the row underneath it still carried the employer name,
// the role and the dates, one `select` away from the recruiter who was
// never meant to see them.
//
// "Deselected" has to mean GONE, not HIDDEN. So the exclusion is applied
// where the facts are assembled — `buildCvSourceBundle` — and everything
// downstream (the model prompt, the validator's allowlist, the rendered
// document, the print export, the application snapshot) inherits an
// absence rather than re-implementing a rule.
//
// ── WHY AN EXCLUSION LIST AND NOT AN INCLUSION LIST ────────────────────
//
// Both express the same choice; they fail differently, and only the failure
// modes matter.
//
// An inclusion list that loses an id HIDES a fact the person believed was
// on their CV. An exclusion list that loses an id SHOWS a fact they had
// already decided to show once. The first is a document that silently
// misrepresents somebody's history by omission; the second is a document
// that is merely fuller than intended and visibly so, in a preview the
// person reads before saving.
//
// It also gives "update from profile" the right default: a newly recorded
// employment is not in the exclusion list, so it arrives on the CV and is
// seen, rather than being silently absent because nobody remembered to add
// its id to a list.
//
// ── WHAT SELECTION IS NOT ──────────────────────────────────────────────
//
// It is not deletion, and it is not archiving. Excluding an employment
// changes one CV. It writes nothing to `sp_experience_periods`, nothing to
// `sp_claims`, and the fact stays exactly where it was — which is why the
// screen can offer it back and `omittedFacts` below exists to list it.
//
// It is also not a trust decision. A deselected credential is not
// "unverified"; it is not on this document. Nothing here reads or writes an
// assertion level.

import { z } from "zod";
import type { CvFactClaim, CvFactEmployment, CvSourceBundle } from "./source-bundle";
import type { BundleSection } from "./bundle-diff";

export const CV_SELECTION_VERSION = "cv-selection-v1" as const;

/**
 * The ids kept OFF one CV.
 *
 * One flat set over employment ids and claim ids alike. They are database
 * uuids from two tables and cannot collide, and a reader of the stored row
 * benefits from "these are the things this person took off" being one list
 * rather than five.
 */
export const cvSelectionSchema = z
  .array(z.string().min(1))
  .max(400)
  .default([])
  .transform((ids) => Array.from(new Set(ids)));

export type CvExcludedIds = readonly string[];

/** Nothing excluded — a CV that shows everything the person has. */
export function emptySelection(): CvExcludedIds {
  return [];
}

export function isExcluded(excluded: CvExcludedIds, id: string): boolean {
  return excluded.includes(id);
}

/**
 * Drop the excluded rows from one group.
 *
 * Exported so `source-bundle.ts` has exactly one implementation to call for
 * all five groups, rather than five `.filter()` calls that could drift.
 */
export function withoutExcluded<T extends { readonly id: string }>(
  rows: readonly T[],
  excluded: CvExcludedIds,
): readonly T[] {
  if (excluded.length === 0) return rows;
  const drop = new Set(excluded);
  return rows.filter((row) => !drop.has(row.id));
}

/**
 * Keep an exclusion list from growing without limit.
 *
 * An id whose record no longer exists is not an exclusion any more, it is
 * litter — and litter in a stored list is what eventually collides with a
 * newly issued id. Applied whenever a CV is rebuilt against fresh facts.
 */
export function pruneExclusions(excluded: CvExcludedIds, live: ReadonlySet<string>): CvExcludedIds {
  return excluded.filter((id) => live.has(id));
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
 * Computed by difference rather than from the exclusion list, deliberately.
 * The exclusion list says what somebody CHOSE to leave off; this says what
 * is actually absent — which also covers a record added to the profile
 * after the CV was saved, and is therefore the honest answer to "what is
 * not on this CV" rather than the answer to a different question.
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

/** Every selectable id in a bundle, for pruning and for the picker. */
export function selectableIds(bundle: CvSourceBundle): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const e of bundle.employment) ids.add(e.id);
  for (const group of [bundle.education, bundle.credentials, bundle.skills, bundle.languages]) {
    for (const c of group) ids.add(c.id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Changing the selection on a CV that is already saved                */
/* ------------------------------------------------------------------ */

/**
 * Re-select over a SAVED bundle without silently accepting unrelated drift.
 *
 * ── THE TRAP THIS AVOIDS ───────────────────────────────────────────────
 *
 * The easy implementation of "let me put my old job back on this CV" is to
 * rebuild the bundle from the live profile with the new exclusion list. It
 * is one line and it quietly does something the person did not ask for: a
 * saved CV is a snapshot, and rebuilding it applies EVERY change made to
 * the profile since it was saved — a corrected employer name, a re-dated
 * period, a renamed credential — under a click that said "add my old job".
 *
 * That is the exact behaviour `bundle-diff.ts` exists to prevent. Drift is
 * offered, reviewed and accepted deliberately; it is not smuggled in
 * alongside an unrelated edit.
 *
 * So the two directions are not symmetrical, and they should not be:
 *
 *   REMOVING  is a pure filter over the saved snapshot. Nothing is read,
 *             nothing else can change, and the fact simply leaves.
 *   ADDING    needs the record, and the saved snapshot does not contain it
 *             — that is what excluded means. So exactly the facts NAMED in
 *             `added` are taken from the live profile, and nothing else is.
 *
 * `added` is an explicit list rather than "everything not excluded", and
 * that distinction is the whole safety property. Deriving additions from
 * the exclusion list would mean an employment recorded in the profile last
 * week arrives on the CV the next time somebody unticks an unrelated
 * language — a change nobody asked for, applied under a click that said
 * something else.
 *
 * A fact already in the snapshot keeps its frozen values even when the live
 * profile disagrees. The drift banner still reports the disagreement, and
 * taking it is still a separate, explicit act.
 */
export function reselectSavedBundle(
  saved: CvSourceBundle,
  fresh: CvSourceBundle,
  excluded: CvExcludedIds,
  added: CvExcludedIds = [],
): CvSourceBundle {
  const drop = new Set(excluded);
  const take = new Set(added);
  const keep = <T extends { readonly id: string }>(rows: readonly T[]) =>
    rows.filter((row) => !drop.has(row.id));

  /** Rows from the saved snapshot, plus the specific rows asked for. Frozen
   *  values win for anything already carried. */
  const merge = <T extends { readonly id: string }>(
    savedRows: readonly T[],
    freshRows: readonly T[],
  ): readonly T[] => {
    const kept = keep(savedRows);
    const present = new Set(kept.map((r) => r.id));
    const addedRows = freshRows.filter(
      (r) => take.has(r.id) && !drop.has(r.id) && !present.has(r.id),
    );
    return [...kept, ...addedRows];
  };

  const employment = [...merge(saved.employment, fresh.employment)].sort((a, b) =>
    b.startedOn.localeCompare(a.startedOn),
  );

  return {
    ...saved,
    employment,
    education: merge(saved.education, fresh.education),
    credentials: merge(saved.credentials, fresh.credentials),
    skills: merge(saved.skills, fresh.skills),
    languages: merge(saved.languages, fresh.languages),
  };
}
