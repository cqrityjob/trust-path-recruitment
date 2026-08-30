// Has the profile moved since this CV was saved?
//
// -- WHY A SAVED CV IS NOT REFRESHED AUTOMATICALLY ----------------------
//
// A saved CV is a DOCUMENT SNAPSHOT. Somebody who exported a CV in March
// and reopens it in June has to see what they sent -- not a document
// quietly rewritten by an edit they made in between. That is the same
// historical-snapshot rule a submitted job application already follows, and
// for the same reason: the copy that went to an employer is the copy that
// matters.
//
// So nothing here mutates anything. It compares the facts frozen into a
// saved document against the facts as they stand now, and reports the
// difference so the person can be OFFERED an update. Whether to take it is
// theirs.
//
// -- WHY THE COMPARISON IS BY ID, AND SHALLOW ---------------------------
//
// The person needs one honest sentence -- "three things changed" -- and a
// list they can read. They do not need a field-level diff of a JSON blob,
// and building one would produce noise on every stored timestamp. So this
// compares the things a reader would actually notice: which employments and
// claims exist, and whether the displayed text of one of them changed.

import type { CvFactClaim, CvFactEmployment, CvSourceBundle } from "./source-bundle";

export const CV_BUNDLE_DIFF_VERSION = "cv-bundle-diff-v1" as const;

export type BundleChangeKind = "added" | "removed" | "changed";

export type BundleSection =
  | "employment"
  | "education"
  | "credentials"
  | "skills"
  | "languages"
  | "identity";

export interface BundleChange {
  readonly kind: BundleChangeKind;
  /** Which section it sits in, for the copy. */
  readonly section: BundleSection;
  /** The source id, where the change concerns one record. Null for identity. */
  readonly sourceId: string | null;
  /** What the person would recognise it by: an employer name, a claim title. */
  readonly label: string;
}

export interface BundleDiff {
  readonly version: typeof CV_BUNDLE_DIFF_VERSION;
  /** True when there is anything at all to tell the person about. */
  readonly hasChanges: boolean;
  readonly changes: readonly BundleChange[];
  /** Ids present in the SAVED bundle and gone from the fresh one. The
   *  presentation reconciler drops their bullets, and the person is told. */
  readonly removedIds: readonly string[];
}

/** One employment's displayed identity, as a comparable string. Excludes
 *  anything a reader would not see, so a stored-format change alone cannot
 *  raise a "your profile changed" banner. */
function employmentSignature(e: CvFactEmployment): string {
  return [e.employerName, e.roleTitle, e.startedOn, e.endedOn ?? "", e.employmentType].join(" ");
}

function claimSignature(c: CvFactClaim): string {
  return [
    c.title,
    c.issuerName ?? "",
    c.issuedOn ?? "",
    c.validUntil ?? "",
    c.level ?? "",
    String(c.verified),
  ].join(" ");
}

function diffGroup<T extends { id: string }>(
  section: BundleSection,
  saved: readonly T[],
  fresh: readonly T[],
  signature: (item: T) => string,
  label: (item: T) => string,
  out: BundleChange[],
  removedIds: string[],
): void {
  const savedById = new Map(saved.map((i) => [i.id, i]));
  const freshById = new Map(fresh.map((i) => [i.id, i]));

  for (const item of fresh) {
    const before = savedById.get(item.id);
    if (!before) {
      out.push({ kind: "added", section, sourceId: item.id, label: label(item) });
    } else if (signature(before) !== signature(item)) {
      out.push({ kind: "changed", section, sourceId: item.id, label: label(item) });
    }
  }
  for (const item of saved) {
    if (!freshById.has(item.id)) {
      out.push({ kind: "removed", section, sourceId: item.id, label: label(item) });
      removedIds.push(item.id);
    }
  }
}

export function diffCvSourceBundles(saved: CvSourceBundle, fresh: CvSourceBundle): BundleDiff {
  const changes: BundleChange[] = [];
  const removedIds: string[] = [];

  diffGroup(
    "employment",
    saved.employment,
    fresh.employment,
    employmentSignature,
    (e) => `${e.roleTitle} - ${e.employerName}`,
    changes,
    removedIds,
  );

  const claimGroups = [
    ["education", saved.education, fresh.education],
    ["credentials", saved.credentials, fresh.credentials],
    ["skills", saved.skills, fresh.skills],
    ["languages", saved.languages, fresh.languages],
  ] as const;

  for (const [section, s, f] of claimGroups) {
    diffGroup(section, s, f, claimSignature, (c) => c.title, changes, removedIds);
  }

  // The header block. One entry rather than five, because "your name and
  // title changed" is one thing a person needs to know about.
  const identityBefore = [
    saved.identity.displayName,
    saved.identity.headline ?? "",
    saved.identity.country ?? "",
    saved.identity.currentProfession ?? "",
    saved.identity.yearsOfExperience ?? "",
  ].join(" ");
  const identityNow = [
    fresh.identity.displayName,
    fresh.identity.headline ?? "",
    fresh.identity.country ?? "",
    fresh.identity.currentProfession ?? "",
    fresh.identity.yearsOfExperience ?? "",
  ].join(" ");
  if (identityBefore !== identityNow) {
    changes.push({
      kind: "changed",
      section: "identity",
      sourceId: null,
      label: fresh.identity.headline ?? fresh.identity.displayName,
    });
  }

  return {
    version: CV_BUNDLE_DIFF_VERSION,
    hasChanges: changes.length > 0,
    changes,
    removedIds,
  };
}
