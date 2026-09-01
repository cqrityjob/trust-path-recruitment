// A saved CQrityjob CV, on its way into a job application.
//
// ── WHAT THIS FILE IS, AND WHAT IT REFUSES TO BE ───────────────────────
//
// It is the ONE place that answers three questions:
//
//   1. Can this saved CV be sent to an employer at all?
//   2. What does the artefact an application stores look like?
//   3. How is that artefact turned back into a document to render?
//
// It is NOT a second CV store, a second document contract or a second
// renderer. `CvSourceBundle`, `StoredPresentation`, `buildSavedCvDocument`
// and `CvDocumentView` are the existing ones and are used unchanged --
// which is the point: an employer looking at a submitted CQrityjob CV is
// looking at the same component, fed by the same builder, that the
// candidate looked at when they chose it.
//
// ── WHY THE SNAPSHOT CARRIES NO TRUST ──────────────────────────────────
//
// `trust-annotations.ts` states the rule in its own header: verification
// provenance "is never stored", on any row, so that a confirmation revoked
// tomorrow disappears from a CV saved in March without anything having to
// go back and rewrite it. An application snapshot is a row like any other,
// so it does not get an exemption -- `applicationCvDocument` builds the
// document with EMPTY annotations and the employer's copy therefore carries
// no verifier attribution at all.
//
// That is deliberately a plainer document, not a poorer one. Verified
// standing reaches an employer through the holder-authorised,
// application-scoped Passport disclosure that already exists and is already
// logged; a CV rendering its own trust lines from a months-old copy would
// be a second, quieter, unauditable answer to the same question. Nothing
// here upgrades anybody's trust because they applied for a job, and nothing
// here can: there is no field for it.

import { z } from "zod";
import type { CvDocument } from "./document";
import type { CvSourceBundle } from "./source-bundle";
import { buildSavedCvDocument, storedPresentationSchema } from "./stored";
import { emptyCvTrustAnnotations } from "./trust-annotations";

export const APPLICATION_CV_SNAPSHOT_VERSION = "application-cv-snapshot-v1" as const;

/* ------------------------------------------------------------------ */
/* 1 · Eligibility                                                     */
/* ------------------------------------------------------------------ */

/**
 * Why a saved CV cannot be sent to an employer.
 *
 * `null` means it can. These are the only two answers, and both are
 * repairable by the person in My Career -- which is why the dialog names a
 * route rather than merely disabling a control.
 */
export type CvApplicationBlock =
  /** Nothing to put at the top of the page. */
  | "no_name"
  /** No employment and no education: a CV with no professional history to
   *  read. Career Discovery results, skills and languages deliberately do
   *  not count — `readiness.ts` sets out why at length, and this is the
   *  same rule, not a second one. */
  | "no_history";

/**
 * Can this saved CV be sent?
 *
 * ── THIS RULE EXISTS IN TWO PLACES ON PURPOSE ────────────────────────
 *
 * The interface has to explain the answer BEFORE somebody submits, and the
 * database has to be the thing that enforces it. So the same predicate is
 * stated here, over the bundle, and again in
 * 20261018090000_job_application_cqrityjob_cv.sql, over the same jsonb.
 * The SQL copy is the boundary; this one is the advance notice. They are
 * cross-referenced in both directions so a change to either is a change
 * somebody has to make twice, deliberately, rather than once, silently.
 *
 * It is not a new approval workflow and it invents no state. `saveCvDraft`
 * already refuses to write a row that `computeCvReadiness` calls
 * `needs_information`; this catches the saved CV whose underlying profile
 * emptied out afterwards.
 */
export function cvApplicationBlock(bundle: CvSourceBundle | null): CvApplicationBlock | null {
  if (!bundle) return "no_name";
  if (!(bundle.identity?.displayName ?? "").trim()) return "no_name";
  const employment = bundle.employment?.length ?? 0;
  const education = bundle.education?.length ?? 0;
  if (employment === 0 && education === 0) return "no_history";
  return null;
}

export function isCvUsableForApplication(bundle: CvSourceBundle | null): boolean {
  return cvApplicationBlock(bundle) === null;
}

/* ------------------------------------------------------------------ */
/* 2 · The stored artefact                                             */
/* ------------------------------------------------------------------ */

/**
 * What an application keeps.
 *
 * Written by the database (see the migration), never posted by a browser --
 * which is what makes "an employer read a CV the candidate composed in a
 * form" structurally impossible rather than merely screened for.
 *
 * `sourceBundle` arrives without `targetJobText` and `presentation` without
 * `tailoringRationale`: neither is rendered on a CV, and either may quote
 * the advertisement of a DIFFERENT employer the candidate tailored an
 * earlier version against. The schema below is `.passthrough()`-free and
 * simply does not model them, so a snapshot written by an older contract
 * that still had them loses them on the way to the page as well.
 */
export const applicationCvSnapshotSchema = z.object({
  snapshot_version: z.string().default(APPLICATION_CV_SNAPSHOT_VERSION),
  cv_document_id: z.string().nullable().default(null),
  cv_updated_at: z.string().nullable().default(null),
  title: z.string().default(""),
  locale: z.enum(["sv", "en"]).default("sv"),
  purpose: z.enum(["general", "targeted"]).default("general"),
  origin: z.enum(["factual", "ai_assisted"]).default("factual"),
  document_version: z.string().default("cv-document-v1"),
  bundle_version: z.string().default("cv-source-bundle-v1"),
  source_bundle: z.unknown().default({}),
  presentation: z.unknown().default({}),
});

export type ApplicationCvSnapshot = z.infer<typeof applicationCvSnapshotSchema>;

/* ------------------------------------------------------------------ */
/* 3 · Back into a document                                            */
/* ------------------------------------------------------------------ */

/**
 * The submitted CV, ready to render.
 *
 * Returns `null` for a snapshot that cannot be read at all. The caller must
 * treat that as "we could not read this", never as "there was no CV" --
 * §14 of the brief and the same rule `CvTrustAnnotations.unavailable`
 * already states for provenance. An application row that says
 * `cv_source = 'cqrityjob_cv'` is a row whose candidate DID send a CV; a
 * parse failure is our problem to report, not their omission to imply.
 */
export function applicationCvDocument(snapshot: ApplicationCvSnapshot): CvDocument | null {
  const bundle = snapshot.source_bundle as CvSourceBundle | undefined;
  if (!bundle || typeof bundle !== "object" || !bundle.identity) return null;

  const stored = storedPresentationSchema.safeParse(snapshot.presentation ?? {});
  return buildSavedCvDocument(
    bundle,
    // A presentation written by an older contract degrades to an empty one
    // rather than throwing: the FACTS are in the bundle and the document
    // still renders. Losing the wording is recoverable; a page an employer
    // cannot open is not. Same fallback `getMyCv` already takes.
    stored.success ? stored.data : storedPresentationSchema.parse({}),
    // See the file header. Never the live Passport, never a stored copy.
    emptyCvTrustAnnotations(),
  );
}
