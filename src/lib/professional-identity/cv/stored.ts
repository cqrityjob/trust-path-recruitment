// What actually lives in cv_documents.presentation, and how a saved
// document is turned back into something renderable.
//
// -- THE EDITING CONTRACT, STATED AS TYPES ------------------------------
//
// Two kinds of change look identical in a text box and are not the same
// thing at all:
//
//   PRESENTATION EDIT   "Responsible for security operations" ->
//                       "Led security operations". The person is
//                       rephrasing their own account of their own work.
//                       Saved here.
//
//   FACTUAL CORRECTION  employer "Company A" -> "Company B". That is not a
//                       rewording, it is a different job. It belongs to the
//                       record that owns it, and the CV editor must not be
//                       a back door into it.
//
// The separation is structural, not a rule somebody has to remember: the
// stored presentation has NO field for an employer, a role title, a date,
// an institution or a credential name. A CV editor cannot write one because
// there is nowhere to put it. The screen offers "Redigera i yrkesprofilen"
// instead, and the facts come back from the snapshot on every render.
//
// -- WHY THE STORED SCHEMA IS LOOSER THAN THE AI SCHEMA -----------------
//
// `cvPresentationOutput` requires a summary of at least 40 characters and a
// headline of at least 3. Those minimums exist to stop a MODEL emitting a
// stub and calling it a draft. They must not constrain a PERSON: somebody
// may legitimately delete the summary entirely, or write four words. So the
// stored schema permits empty strings, and the AI schema keeps its floors.
// Applying a model's floor to a human's own words would be the product
// telling somebody their CV is wrong because it is short.
//
// -- AUTHORSHIP IS RECORDED PER FIELD ----------------------------------
//
// Once a person edits a drafted sentence it is THEIR sentence, and the "AI"
// badge has to come off it. Leaving the badge on would be labelling
// somebody's own words as machine-written -- a small dishonesty, on the one
// screen in this product whose entire argument is that it does not tell
// small lies about provenance.

import { z } from "zod";
import type { CvDocument } from "./document";
import { buildFactualCvDocument } from "./document";
import { emptyCvTrustAnnotations, type CvTrustAnnotations } from "./trust-annotations";
import type { CvSourceBundle } from "./source-bundle";
import type { CvPresentation } from "./schema";

export const CV_STORED_PRESENTATION_VERSION = "cv-stored-presentation-v1" as const;

/** Who wrote this particular field, as it currently stands. */
export const authorSchema = z.enum(["ai", "person"]);
export type Author = z.infer<typeof authorSchema>;

export const storedPresentationSchema = z.object({
  storedVersion: z.literal(CV_STORED_PRESENTATION_VERSION).default(CV_STORED_PRESENTATION_VERSION),
  headline: z.string().max(160).default(""),
  summary: z.string().max(4000).default(""),
  experience: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        bullets: z.array(z.string().max(600)).max(8).default([]),
      }),
    )
    .max(40)
    .default([]),
  emphasisedClaimIds: z.array(z.string().min(1)).max(60).default([]),
  tailoringRationale: z.string().max(600).default(""),
  authorship: z
    .object({
      headline: authorSchema.default("person"),
      summary: authorSchema.default("person"),
      /** Keyed by employment sourceId. A missing key reads as "person". */
      bullets: z.record(z.string(), authorSchema).default({}),
    })
    .default({ headline: "person", summary: "person", bullets: {} }),
});

export type StoredPresentation = z.infer<typeof storedPresentationSchema>;

/** A document nothing generated: the person's own facts, their own headline,
 *  no prose written on their behalf. */
export function factualStoredPresentation(bundle: CvSourceBundle): StoredPresentation {
  return {
    storedVersion: CV_STORED_PRESENTATION_VERSION,
    headline: bundle.identity.headline ?? bundle.identity.currentProfession ?? "",
    summary: "",
    experience: bundle.employment.map((e) => ({ sourceId: e.id, bullets: [] })),
    emphasisedClaimIds: [],
    tailoringRationale: "",
    authorship: { headline: "person", summary: "person", bullets: {} },
  };
}

/** A validated model draft, on its way to being saved. Everything it wrote
 *  is marked as its own; nothing here is quietly attributed to the person. */
export function storedFromAiPresentation(presentation: CvPresentation): StoredPresentation {
  const bullets: Record<string, Author> = {};
  for (const item of presentation.experience) bullets[item.sourceId] = "ai";
  return {
    storedVersion: CV_STORED_PRESENTATION_VERSION,
    headline: presentation.headline,
    summary: presentation.summary,
    experience: presentation.experience.map((e) => ({ sourceId: e.sourceId, bullets: [...e.bullets] })),
    emphasisedClaimIds: [...presentation.emphasisedClaimIds],
    tailoringRationale: presentation.tailoringRationale,
    authorship: { headline: "ai", summary: "ai", bullets },
  };
}

/* ------------------------------------------------------------------ */
/* Reconciliation                                                      */
/* ------------------------------------------------------------------ */

export interface ReconcileResult {
  readonly presentation: StoredPresentation;
  /** Employment ids the presentation referred to that the bundle no longer
   *  contains. Reported so the screen can say so rather than silently
   *  losing a section the person wrote. */
  readonly droppedIds: readonly string[];
}

/**
 * Make a stored presentation consistent with a bundle.
 *
 * Needed in exactly one place: when somebody takes "update from profile" and
 * the fresh bundle no longer contains an employment they had written bullets
 * for. Dropping it silently would delete the person's own writing without
 * telling them, so the dropped ids come back with it.
 *
 * It never ADDS bullets. A newly-appearing employment gets an entry with no
 * bullets, which renders as employer, role and dates -- an ordinary CV line.
 */
export function reconcileStoredPresentation(
  stored: StoredPresentation,
  bundle: CvSourceBundle,
): ReconcileResult {
  const liveEmployment = new Set(bundle.employment.map((e) => e.id));
  const liveClaims = new Set(
    [...bundle.education, ...bundle.credentials, ...bundle.skills, ...bundle.languages].map(
      (c) => c.id,
    ),
  );

  const kept = stored.experience.filter((e) => liveEmployment.has(e.sourceId));
  const droppedIds = stored.experience
    .filter((e) => !liveEmployment.has(e.sourceId))
    .map((e) => e.sourceId);

  const keptIds = new Set(kept.map((e) => e.sourceId));
  const appended = bundle.employment
    .filter((e) => !keptIds.has(e.id))
    .map((e) => ({ sourceId: e.id, bullets: [] as string[] }));

  const bullets: Record<string, Author> = {};
  for (const [id, author] of Object.entries(stored.authorship.bullets)) {
    if (liveEmployment.has(id)) bullets[id] = author;
  }

  return {
    presentation: {
      ...stored,
      experience: [...kept, ...appended],
      emphasisedClaimIds: stored.emphasisedClaimIds.filter((id) => liveClaims.has(id)),
      authorship: { ...stored.authorship, bullets },
    },
    droppedIds,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * Turn a saved row back into the document the renderer already knows.
 *
 * Every FACT comes from the bundle, exactly as it does for a freshly
 * generated document -- there is no second rendering path for saved CVs to
 * drift down. The stored presentation supplies wording and order, and the
 * per-field authorship decides which lines still carry an "AI" mark.
 */
export function buildSavedCvDocument(
  bundle: CvSourceBundle,
  stored: StoredPresentation,
  trust: CvTrustAnnotations = emptyCvTrustAnnotations(),
): CvDocument {
  // Trust is a PARAMETER, not something read back out of `stored`. A saved
  // CV records bullets and ids; the verification standing of the facts those
  // ids point at is re-derived from the live Passport on every open. That is
  // what makes a revoked confirmation vanish from a CV saved in March
  // without anything having to go back and rewrite the saved row.
  const base = buildFactualCvDocument(bundle, trust);
  const byId = new Map(bundle.employment.map((e) => [e.id, e]));

  const ordered = stored.experience
    .map((item) => {
      const fact = byId.get(item.sourceId);
      if (!fact) return null;
      return {
        fact,
        bullets: item.bullets,
        bulletsAreAiWritten: (stored.authorship.bullets[item.sourceId] ?? "person") === "ai",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const used = new Set(ordered.map((o) => o.fact.id));
  const emphasised = new Set(stored.emphasisedClaimIds);
  const reorder = <T extends { id: string }>(claims: readonly T[]): readonly T[] => [
    ...claims.filter((c) => emphasised.has(c.id)),
    ...claims.filter((c) => !emphasised.has(c.id)),
  ];

  const hasDraftedProse =
    stored.authorship.headline === "ai" ||
    stored.authorship.summary === "ai" ||
    Object.values(stored.authorship.bullets).some((a) => a === "ai");

  return {
    ...base,
    // "ai_assisted" means a model contributed wording that is STILL on the
    // page. A person who rewrote every drafted line owns the document
    // outright, and it stops claiming otherwise.
    origin: hasDraftedProse ? "ai_assisted" : "factual",
    headline: stored.headline || base.headline,
    headlineIsAiWritten: stored.authorship.headline === "ai" && stored.headline.length > 0,
    summary: stored.summary.length > 0 ? stored.summary : null,
    summaryIsAiWritten: stored.authorship.summary === "ai" && stored.summary.length > 0,
    experience: ordered,
    skills: reorder(base.skills),
    languages: reorder(base.languages),
    credentials: reorder(base.credentials),
    tailoringRationale: stored.tailoringRationale || null,
    omittedEmployment: bundle.employment.filter((e) => !used.has(e.id)),
  };
}

/* ------------------------------------------------------------------ */
/* The edit payload                                                    */
/* ------------------------------------------------------------------ */

/**
 * What a person may change about a saved CV.
 *
 * Read this list as the security boundary it is. There is no employer, no
 * role title, no date, no institution and no credential name, so no edit
 * arriving at the server can carry one -- the same structural argument the
 * AI output schema makes, applied to the other writer.
 */
export const cvEditSchema = z.object({
  cvId: z.string().uuid(),
  title: z.string().max(200).optional(),
  headline: z.string().max(160).optional(),
  summary: z.string().max(4000).optional(),
  /** Bullets for one employment, replacing that employment's list. */
  bullets: z
    .array(z.object({ sourceId: z.string().min(1), bullets: z.array(z.string().max(600)).max(8) }))
    .max(40)
    .optional(),
  /** Order only. Ids must already exist in the saved bundle. */
  experienceOrder: z.array(z.string().min(1)).max(40).optional(),
});

export type CvEdit = z.infer<typeof cvEditSchema>;

/**
 * Apply a person's edit to a stored presentation.
 *
 * Pure, so the whole editing contract is testable without a database. Every
 * field the person actually changed flips to `person` authorship; a field
 * they left alone keeps whatever it had.
 *
 * Ids that are not in the bundle are IGNORED rather than stored. A client
 * cannot introduce a reference to something that is not in this person's own
 * record, which is the same rule the anti-fabrication validator applies to
 * the model.
 */
export function applyCvEdit(
  stored: StoredPresentation,
  edit: CvEdit,
  bundle: CvSourceBundle,
): StoredPresentation {
  const liveEmployment = new Set(bundle.employment.map((e) => e.id));
  let next: StoredPresentation = { ...stored, authorship: { ...stored.authorship } };

  if (edit.headline !== undefined && edit.headline !== stored.headline) {
    next = {
      ...next,
      headline: edit.headline,
      authorship: { ...next.authorship, headline: "person" },
    };
  }

  if (edit.summary !== undefined && edit.summary !== stored.summary) {
    next = {
      ...next,
      summary: edit.summary,
      authorship: { ...next.authorship, summary: "person" },
    };
  }

  if (edit.bullets) {
    const bulletAuthors = { ...next.authorship.bullets };
    const byId = new Map(next.experience.map((e) => [e.sourceId, e]));
    for (const item of edit.bullets) {
      if (!liveEmployment.has(item.sourceId)) continue;
      const before = byId.get(item.sourceId);
      const changed =
        !before ||
        before.bullets.length !== item.bullets.length ||
        before.bullets.some((b, i) => b !== item.bullets[i]);
      byId.set(item.sourceId, { sourceId: item.sourceId, bullets: item.bullets });
      if (changed) bulletAuthors[item.sourceId] = "person";
    }
    next = {
      ...next,
      experience: next.experience.map((e) => byId.get(e.sourceId) ?? e),
      authorship: { ...next.authorship, bullets: bulletAuthors },
    };
  }

  if (edit.experienceOrder) {
    const byId = new Map(next.experience.map((e) => [e.sourceId, e]));
    const ordered = edit.experienceOrder
      .filter((id) => liveEmployment.has(id) && byId.has(id))
      .map((id) => byId.get(id)!);
    const rest = next.experience.filter((e) => !edit.experienceOrder!.includes(e.sourceId));
    next = { ...next, experience: [...ordered, ...rest] };
  }

  return next;
}
