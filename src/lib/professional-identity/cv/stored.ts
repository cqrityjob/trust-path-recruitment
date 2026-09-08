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
//
// -- CONTACT DETAILS ARE PRESENTATION, AND NOTHING ELSE ----------------
//
// `contact` sits in the stored presentation rather than in the bundle, and
// the distinction is the same one this file already draws. An email address
// is not a career FACT this product vouches for: nobody verified it, it
// carries no assertion level, and no verification mark is reachable from
// it -- `CvContactDetails` has no field that could carry one. It is the
// person's own note to the reader about how to reply, which is exactly what
// a presentation edit is.
//
// It is stored per CV, not per account, because the choice is per document:
// a person may put their telephone number on a CV they send to one employer
// and not on the one they hand round at a fair.
//
// -- THE SELECTION IS NOT STORED HERE, AND THAT IS THE POINT -----------
//
// An earlier version kept an `excludedIds` list beside the wording. It does
// not any more, because the bundle IS the selection: `source_bundle` contains
// exactly the facts this CV carries and nothing else, so there is no second
// place for the two to disagree and no list to go stale against the records
// it names. What is not on the CV is computed by DIFFERENCE against the live
// profile (`omittedFacts`), which also covers a record added since.

import { z } from "zod";
import type { CvContactDetails, CvDocument } from "./document";
import { buildFactualCvDocument, NO_CV_CONTACT } from "./document";
import { emptyCvTrustAnnotations, type CvTrustAnnotations } from "./trust-annotations";
import type { CvSourceBundle } from "./source-bundle";
import type { CvPresentation } from "./schema";

export const CV_STORED_PRESENTATION_VERSION = "cv-stored-presentation-v1" as const;

/** Who wrote this particular field, as it currently stands. */
export const authorSchema = z.enum(["ai", "person"]);
export type Author = z.infer<typeof authorSchema>;

/**
 * The contact block, as stored.
 *
 * Both a VALUE and a SWITCH per field, rather than "empty means hidden".
 * Somebody who turns their telephone number off before sending a CV to one
 * employer should not have to retype it for the next one, and a product that
 * silently discards it teaches people to keep it in a text file instead.
 */
export const storedContactSchema = z
  .object({
    email: z.string().max(320).default(""),
    phone: z.string().max(40).default(""),
    showEmail: z.boolean().default(false),
    showPhone: z.boolean().default(false),
  })
  .default({ email: "", phone: "", showEmail: false, showPhone: false });

export type StoredContact = z.infer<typeof storedContactSchema>;

export const EMPTY_STORED_CONTACT: StoredContact = {
  email: "",
  phone: "",
  showEmail: false,
  showPhone: false,
};

/** The stored block, reduced to what the page may actually print. */
export function resolveCvContact(contact: StoredContact): CvContactDetails {
  const email = contact.showEmail ? contact.email.trim() : "";
  const phone = contact.showPhone ? contact.phone.trim() : "";
  return { email: email || null, phone: phone || null };
}

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
  /** Shown only where `show*` says so. An address the product happens to
   *  know is not an address somebody agreed to publish. */
  contact: storedContactSchema,
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

/** What a caller carries across a save: the editorial choices that are not
 *  wording, and that a regenerated draft must never silently reset. */
export interface CvPresentationSettings {
  readonly contact: StoredContact;
}

export const DEFAULT_CV_PRESENTATION_SETTINGS: CvPresentationSettings = {
  contact: EMPTY_STORED_CONTACT,
};

/** A document nothing generated: the person's own facts, their own headline,
 *  no prose written on their behalf. */
export function factualStoredPresentation(
  bundle: CvSourceBundle,
  settings: CvPresentationSettings = DEFAULT_CV_PRESENTATION_SETTINGS,
): StoredPresentation {
  return {
    storedVersion: CV_STORED_PRESENTATION_VERSION,
    headline: bundle.identity.headline ?? bundle.identity.currentProfession ?? "",
    summary: "",
    experience: bundle.employment.map((e) => ({ sourceId: e.id, bullets: [] })),
    emphasisedClaimIds: [],
    tailoringRationale: "",
    contact: settings.contact,
    authorship: { headline: "person", summary: "person", bullets: {} },
  };
}

/** A validated model draft, on its way to being saved. Everything it wrote
 *  is marked as its own; nothing here is quietly attributed to the person. */
export function storedFromAiPresentation(
  presentation: CvPresentation,
  /** The person's own editorial choices, carried across.
   *
   *  A model drafts WORDING. It does not decide whether somebody's telephone
   *  number is printed, so accepting a new draft must not reset that.
   *  (Which FACTS a CV carries is not here at all any more: the bundle is
   *  the selection, and it is rebuilt in SQL from an allowlist the person
   *  sent -- so a draft has no field through which it could change one.) */
  settings: CvPresentationSettings = DEFAULT_CV_PRESENTATION_SETTINGS,
): StoredPresentation {
  const bullets: Record<string, Author> = {};
  for (const item of presentation.experience) bullets[item.sourceId] = "ai";
  return {
    storedVersion: CV_STORED_PRESENTATION_VERSION,
    headline: presentation.headline,
    summary: presentation.summary,
    experience: presentation.experience.map((e) => ({
      sourceId: e.sourceId,
      bullets: [...e.bullets],
    })),
    emphasisedClaimIds: [...presentation.emphasisedClaimIds],
    tailoringRationale: presentation.tailoringRationale,
    contact: settings.contact,
    authorship: { headline: "ai", summary: "ai", bullets },
  };
}

/* ------------------------------------------------------------------ */
/* Reconciliation lives in SQL now                                     */
/* ------------------------------------------------------------------ */
//
// `reconcileStoredPresentation` used to sit here: it dropped bullets for an
// employment the fresh bundle no longer contained, appended entries for new
// ones, and pruned dead ids. Every one of those is now done by `cv_save`, in
// the same statement that writes the row, because the bundle and the wording
// have to agree and two round trips could not guarantee that they did.
//
// It is not re-implemented here as a "preview" of the same thing. The one
// place a rule like this can be wrong quietly is the second copy of it.

/* ------------------------------------------------------------------ */
/* A person's own edit                                                 */
/* ------------------------------------------------------------------ */

/** What a person may change about the WORDING of a saved CV.
 *
 *  Read this list as the boundary it is: there is no employer, no role title,
 *  no date, no institution and no credential name, so no edit can carry one.
 *  Which FACTS the CV carries is not here either -- that is an allowlist of
 *  ids, resolved against the person's own records in SQL. */
export interface CvPersonEdit {
  readonly headline?: string;
  readonly summary?: string;
  readonly bullets?: readonly { readonly sourceId: string; readonly bullets: readonly string[] }[];
}

/**
 * Fold a person's edit onto the wording that is stored.
 *
 * ── WHY THIS IS A PURE FUNCTION AND NOT SIX LINES IN A HANDLER ─────────
 *
 * Because of the authorship rule, which is the one thing here that is easy to
 * get subtly wrong and impossible to notice: once somebody edits a drafted
 * sentence it is THEIR sentence, and the "AI" badge has to come off it.
 * Leaving it on labels a person's own words as machine-written, on the one
 * screen in this product whose entire argument is that it does not tell small
 * lies about provenance.
 *
 * A field the person did not touch keeps whatever authorship it had. A field
 * they touched and left identical was not an edit and keeps it too.
 */
export function applyPersonEdit(
  stored: StoredPresentation,
  edit: CvPersonEdit,
): StoredPresentation {
  const headlineChanged = edit.headline !== undefined && edit.headline !== stored.headline;
  const summaryChanged = edit.summary !== undefined && edit.summary !== stored.summary;

  const bullets = { ...stored.authorship.bullets };
  if (edit.bullets) {
    for (const item of edit.bullets) {
      const before = stored.experience.find((e) => e.sourceId === item.sourceId);
      const same =
        before !== undefined &&
        before.bullets.length === item.bullets.length &&
        before.bullets.every((b, i) => b === item.bullets[i]);
      // Set explicitly rather than deleted. A missing key already READS as
      // "person", so both express the same thing -- but a stored row that
      // says so out loud is one a person can audit without knowing the
      // schema's default.
      if (!same) bullets[item.sourceId] = "person";
    }
  }

  return {
    ...stored,
    headline: edit.headline ?? stored.headline,
    summary: edit.summary ?? stored.summary,
    // Mapped over what is ALREADY there, never replaced by what arrived. A
    // bullet naming an employment this CV does not carry simply matches
    // nothing -- the same rule the validator applies to a model's citations,
    // and the same one `cv_normalise_presentation` applies again in SQL
    // against the bundle. A client cannot introduce a reference through this
    // door, and the order is the document's, not the request's.
    experience: edit.bullets
      ? stored.experience.map((e) => {
          const next = edit.bullets!.find((b) => b.sourceId === e.sourceId);
          return next ? { sourceId: e.sourceId, bullets: [...next.bullets] } : e;
        })
      : stored.experience,
    authorship: {
      headline: headlineChanged ? "person" : stored.authorship.headline,
      summary: summaryChanged ? "person" : stored.authorship.summary,
      bullets,
    },
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
  const base = buildFactualCvDocument(bundle, trust, resolveCvContact(stored.contact));
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
  /**
   * The language the DOCUMENT is written in.
   *
   * A presentation choice, and a narrow one: it decides the section
   * headings, the date words and the trust attribution lines, all of which
   * this product owns in both languages. It does NOT translate anything the
   * person or the model wrote -- there is no translation step here, and
   * inventing one would be putting words in somebody's mouth in a language
   * they did not choose them in. The screen says so before the switch.
   */
  locale: z.enum(["sv", "en"]).optional(),
  headline: z.string().max(160).optional(),
  summary: z.string().max(4000).optional(),
  /** Contact details and whether each is printed. Not a fact, not verified,
   *  and structurally incapable of carrying a verification mark. */
  contact: z
    .object({
      email: z.string().max(320),
      phone: z.string().max(40),
      showEmail: z.boolean(),
      showPhone: z.boolean(),
    })
    .partial()
    .optional(),
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

  if (edit.contact) {
    // No authorship flag: contact details have no drafted variant. A model
    // has never written one and cannot -- `cvPresentationOutput` has no
    // field for an address -- so there is no "AI" badge to take off.
    next = {
      ...next,
      contact: {
        email: (edit.contact.email ?? next.contact.email).trim(),
        phone: (edit.contact.phone ?? next.contact.phone).trim(),
        showEmail: edit.contact.showEmail ?? next.contact.showEmail,
        showPhone: edit.contact.showPhone ?? next.contact.showPhone,
      },
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
