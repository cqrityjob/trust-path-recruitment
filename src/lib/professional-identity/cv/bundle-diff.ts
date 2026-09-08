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
  /**
   * The displayed text as the SAVED CV has it, and as the profile has it now.
   *
   * ── WHY THE VALUES AND NOT JUST THE FACT OF A CHANGE ──────────────────
   *
   * "Ändrat · Anställningar · Väktare – Nordic Security AB" tells somebody
   * that something moved and not what. They are then asked to confirm an
   * update whose content they cannot see, on a document they will send to an
   * employer — which is a confirmation dialog in shape only.
   *
   * Both are null for an addition and a removal, where one side does not
   * exist and inventing an empty string to fill the column would read as
   * "changed to nothing".
   */
  readonly before: string | null;
  readonly after: string | null;
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
    // NOT the verification state. It is not career content, it is the
    // Passport's current answer about the claim -- derived live on every
    // open -- and a "your profile has changed" banner that fired on it would
    // be reporting something the document never froze.
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
    const previous = savedById.get(item.id);
    if (!previous) {
      out.push({
        kind: "added",
        section,
        sourceId: item.id,
        label: label(item),
        before: null,
        after: describe(item),
      });
    } else if (signature(previous) !== signature(item)) {
      out.push({
        kind: "changed",
        section,
        sourceId: item.id,
        label: label(item),
        // The signature is what DECIDED there was a change; `describe` is
        // what a person READS. They are separate on purpose: the signature
        // may include a field nobody sees, and a reader shown a difference
        // they cannot see would rightly stop trusting the banner.
        before: describe(previous),
        after: describe(item),
      });
    }
  }
  for (const item of saved) {
    if (!freshById.has(item.id)) {
      out.push({
        kind: "removed",
        section,
        sourceId: item.id,
        label: label(item),
        before: describe(item),
        after: null,
      });
      removedIds.push(item.id);
    }
  }
}

/** One fact as a person reads it. Employment and claims share this because
 *  both are "a name, and the dates or issuer that pin it down". */
function describe(item: unknown): string {
  const r = item as Partial<CvFactEmployment & CvFactClaim>;
  if (r.employerName !== undefined) {
    const from = (r.startedOn ?? "").slice(0, 7);
    const to = r.endedOn ? r.endedOn.slice(0, 7) : "";
    return [`${r.roleTitle ?? ""} · ${r.employerName}`.trim(), to ? `${from} – ${to}` : from]
      .filter((p) => p.length > 0)
      .join(" · ");
  }
  return [r.title ?? "", r.issuerName ?? "", (r.issuedOn ?? "").slice(0, 4), r.level ?? ""]
    .filter((p) => p.length > 0)
    .join(" · ");
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
    saved.identity.countrySubdivision ?? "",
    saved.identity.currentProfession ?? "",
    saved.identity.yearsOfExperience ?? "",
  ].join(" ");
  const identityNow = [
    fresh.identity.displayName,
    fresh.identity.headline ?? "",
    fresh.identity.country ?? "",
    fresh.identity.countrySubdivision ?? "",
    fresh.identity.currentProfession ?? "",
    fresh.identity.yearsOfExperience ?? "",
  ].join(" ");
  if (identityBefore !== identityNow) {
    changes.push({
      kind: "changed",
      section: "identity",
      sourceId: null,
      label: fresh.identity.headline ?? fresh.identity.displayName,
      before: identityBefore.trim(),
      after: identityNow.trim(),
    });
  }

  return {
    version: CV_BUNDLE_DIFF_VERSION,
    hasChanges: changes.length > 0,
    changes,
    removedIds,
  };
}
