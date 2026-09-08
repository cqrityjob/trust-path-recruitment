// Saved CV documents -- the persistence half.
//
// -- WHERE THE BOUNDARY ACTUALLY IS ------------------------------------
//
// This file used to open with a paragraph explaining that "the bundle is
// rebuilt on the server from the caller's own RLS-scoped reads on every
// write", so "a client-supplied bundle would let somebody put text into the
// facts this product then vouches for". Every word of that was true about
// THIS FILE and false about the system.
//
// `cv_documents` granted `authenticated` INSERT and UPDATE, with row-level
// security that checked ownership and nothing else. A signed-in holder did
// not have to come through here at all: the Supabase Data API is a documented
// HTTP endpoint and their token is in their own session, so a POST carrying
// their own owner_user_id and an invented `source_bundle` satisfied every
// policy on the table -- and `sp_submit_application_with_cv_source` then
// copied it onto an employer-readable job application.
//
// 20261102090000 closed that. `authenticated` now holds SELECT and nothing
// else, and every write goes through a SECURITY DEFINER function that takes
// the owner from `auth.uid()` and derives every factual value from the
// caller's own active Passport and profile rows.
//
// So this file is no longer a boundary and does not claim to be one. It is a
// TYPED CALLER of four database functions:
//
//   cv_create                idempotent by operation id
//   cv_save                  one write for facts, wording and settings alike
//   cv_refresh_from_profile  re-derive values for what this CV carries
//   cv_delete                revision-checked
//
// What it still owns is worth stating, because it is easy to mistake for
// nothing: the anti-fabrication SWEEP over generated prose
// (`validateCvPresentation` -- fabricated years, invented quantities,
// verification language), which is a text check the database has no business
// doing, and the refusal vocabulary the screens render.
//
// -- WHAT A SAVED CV IS, AND IS NOT ------------------------------------
//
// A PRESENTATION DOCUMENT over facts that live somewhere else. It stores the
// arrangement, the wording and the purpose, and a SNAPSHOT of the facts so
// that reopening it shows what was sent rather than something quietly
// rewritten since. It is not, and must never become, a second employment
// database:
//
//   * nothing here writes security_career_profiles, sp_experience_periods,
//     sp_claims, sp_passport_profiles or profiles. Not one statement, and
//     cv_documents_server_owned_test asserts it over the whole directory.
//   * no payload has a field for an employer, a role title, a date, an
//     institution or a credential name, so a factual correction cannot
//     arrive through this door even by mistake.
//   * facts are re-read from the saved snapshot on every render, never from
//     anything the client sent.
//
// -- THE REFUSALS, AND WHY THEY ARE CODES -----------------------------
//
// Every write can be refused, and the screens have to say something specific
// and true about each one. A stale tab must be told to reload, a duplicate
// submission must not look like a failure, and neither must ever be shown as
// "something went wrong". The codes come from the database unchanged; the
// mapping below turns a PostgREST error into one of them and refuses to
// invent a code it does not recognise.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readProfessionalIdentity } from "../identity.functions";
import type { ProfessionalIdentityV1 } from "../types";
import { buildCvSourceBundle, type CvSourceBundle } from "./source-bundle";
import { buildCvTrustAnnotations } from "./trust-annotations";
import { computeCvReadiness } from "./readiness";
import { cvPresentationOutput } from "./schema";
import { validateCvPresentation, type CvViolation } from "./validation";
import { diffCvSourceBundles, type BundleDiff } from "./bundle-diff";
import { cvApplicationBlock, type CvApplicationBlock } from "./application-source";
import {
  applyPersonEdit,
  buildSavedCvDocument,
  storedContactSchema,
  storedPresentationSchema,
  type StoredPresentation,
} from "./stored";
import { cvSelectionSchema, omittedFacts, selectableIds, type CvOmittedFact } from "./selection";
import type { CvDocument } from "./document";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScopedClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** MVP, and the number is a product decision rather than a technical one:
 *  a person keeps a handful of tailored CVs, not a document library. */
const MAX_SAVED_CVS = 25;
const MAX_TARGET_JOB_CHARS = 12_000;

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface CvSummary {
  readonly cvId: string;
  readonly title: string;
  readonly purpose: "general" | "targeted";
  readonly locale: "sv" | "en";
  readonly origin: "factual" | "ai_assisted";
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface SavedCv {
  readonly cvId: string;
  readonly title: string;
  readonly purpose: "general" | "targeted";
  readonly locale: "sv" | "en";
  /** The document to render. Facts from the snapshot, wording from the
   *  stored presentation, authorship per field. */
  readonly document: CvDocument;
  /** The frozen facts, so the editor can show what is source-bound. */
  readonly bundle: CvSourceBundle;
  readonly presentation: StoredPresentation;
  readonly providerMode: string | null;
  readonly modelId: string | null;
  readonly updatedAt: string;
  /**
   * How the profile has moved since this was saved. Never applied on its
   * own -- it exists so the screen can OFFER an update. A saved CV is a
   * snapshot and is not rewritten behind the person's back.
   */
  readonly profileDrift: BundleDiff;
  /**
   * What this person HAS that this CV does not carry.
   *
   * Rendered as a list they can put back, and it is the answer to a
   * question a saved CV otherwise leaves unanswerable: a fact is missing
   * either because they took it off or because they never noticed it was
   * absent, and only they can tell those apart. Computed by difference
   * against the live profile, so it also covers a record added after the CV
   * was saved.
   */
  readonly omitted: readonly CvOmittedFact[];
  /** The account email, so the edit screen can offer the same prefill the
   *  creator does. A CV saved before contact details existed has an empty
   *  field, and making the person retype an address the product already
   *  holds is the friction this whole feature exists to remove. Never turned
   *  on by this: the switch stays where the person left it. */
  readonly accountEmail: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function parseStored(value: unknown): StoredPresentation {
  const parsed = storedPresentationSchema.safeParse(value ?? {});
  // A row written by an older contract, or hand-edited, degrades to an
  // empty presentation rather than throwing: the FACTS are in the bundle
  // and the document still renders. Losing the wording is recoverable;
  // a page that will not open is not.
  return parsed.success ? parsed.data : storedPresentationSchema.parse({});
}

function parseBundle(value: unknown): CvSourceBundle {
  return (value ?? {}) as CvSourceBundle;
}

async function loadOwnRow(supabase: ScopedClient, userId: string, cvId: string): Promise<Row> {
  // The `.eq("owner_user_id")` is defence in depth, not the boundary. RLS
  // is the boundary; this makes the intent legible and keeps a mistake in
  // one layer from being the only thing standing between two people's CVs.
  const { data, error } = await supabase
    .from("cv_documents")
    .select(
      "id, title, locale, purpose, origin, source_bundle, presentation, provider_mode, model_id, updated_at",
    )
    .eq("id", cvId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not open that CV.");
  if (!data) throw new Error("CV_NOT_FOUND");
  return data as Row;
}

/** Rebuild the bundle as it stands NOW, for drift detection and refresh.
 *
 *  Returns the identity alongside it because the caller needs BOTH and this
 *  is the read that already fetched it. Trust annotations come from the live
 *  identity, never from the saved bundle -- see below -- and making that a
 *  second `readProfessionalIdentity` would double the cost of opening a CV
 *  for information already in hand. */
async function freshIdentityAndBundle(
  supabase: ScopedClient,
  userId: string,
  locale: "sv" | "en",
  saved: CvSourceBundle,
): Promise<{
  identity: ProfessionalIdentityV1;
  /** Rebuilt for exactly the facts this CV carries -- the right comparison
   *  for DRIFT. */
  bundle: CvSourceBundle;
  /** Without them — the right comparison for "what is not on this CV".
   *
   *  Two bundles rather than one because the two questions are different and
   *  answering both from one would get one of them wrong: comparing a
   *  narrowed saved bundle against an unfiltered fresh one reports every
   *  fact the person left off as newly "added", which is a drift banner that
   *  fires on a choice they made on purpose. Both are pure builds over the
   *  same single identity read; the second costs no query. */
  full: CvSourceBundle;
}> {
  const identity = await readProfessionalIdentity(supabase, userId);
  const common = {
    identity,
    locale,
    includeCareerInsight: saved.careerInsight !== null,
    targetJobText: saved.targetJobText,
  } as const;
  return {
    identity,
    // THE SAVED BUNDLE IS THE SELECTION. There is no stored list of ids to
    // consult and none to go stale: what this CV carries is exactly what is
    // in its own bundle, so drift is compared against a fresh build of those
    // same facts.
    bundle: buildCvSourceBundle({ ...common, includedIds: selectableIds(saved) }),
    full: buildCvSourceBundle(common),
  };
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export const listMyCvs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CvSummary[]> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const { data, error } = await supabase
      .from("cv_documents")
      .select("id, title, purpose, locale, origin, updated_at, created_at")
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(MAX_SAVED_CVS);
    if (error) throw new Error("Could not load your saved CVs.");
    return ((data ?? []) as Row[]).map((r) => ({
      cvId: String(r.id),
      title: String(r.title ?? ""),
      purpose: (r.purpose === "targeted" ? "targeted" : "general") as "general" | "targeted",
      locale: (r.locale === "en" ? "en" : "sv") as "sv" | "en",
      origin: (r.origin === "ai_assisted" ? "ai_assisted" : "factual") as "factual" | "ai_assisted",
      updatedAt: String(r.updated_at),
      createdAt: String(r.created_at),
    }));
  });

export const getMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cvId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<SavedCv> => {
    const { supabase, userId, claims } = context as {
      supabase: ScopedClient;
      userId: string;
      claims: Record<string, unknown>;
    };
    const row = await loadOwnRow(supabase, userId, data.cvId);

    const bundle = parseBundle(row.source_bundle);
    const stored = parseStored(row.presentation);
    const locale = (row.locale === "en" ? "en" : "sv") as "sv" | "en";

    // ── FACTS FROM THE SAVED BUNDLE, TRUST FROM TODAY ─────────────────
    //
    // A saved CV deliberately freezes its FACTS: the employer names, roles
    // and dates are the ones the person reviewed and accepted, and drift
    // against the live profile is reported rather than silently applied.
    //
    // Verification standing is the exact opposite, and must be. Trust is not
    // a property of the document, it is the Passport's current answer about
    // the underlying claim -- so it is read live on every open, from the
    // identity `freshIdentityAndBundle` has already fetched. A confirmation
    // revoked yesterday is gone from this CV today, without anything having
    // rewritten the saved row, because there was never a copy of it here to
    // go stale.
    const fresh = await freshIdentityAndBundle(supabase, userId, locale, bundle);

    return {
      cvId: String(row.id),
      title: String(row.title ?? ""),
      purpose: (row.purpose === "targeted" ? "targeted" : "general") as "general" | "targeted",
      locale,
      document: buildSavedCvDocument(bundle, stored, buildCvTrustAnnotations(fresh.identity)),
      bundle,
      presentation: stored,
      providerMode: (row.provider_mode as string | null) ?? null,
      modelId: (row.model_id as string | null) ?? null,
      updatedAt: String(row.updated_at),
      profileDrift: diffCvSourceBundles(bundle, fresh.bundle),
      // Against the SAVED bundle, not against the exclusion list: a record
      // added to the profile since this CV was saved is also not on it, and
      // the person needs to know that just as much.
      omitted: omittedFacts(fresh.full, bundle),
      accountEmail: typeof claims?.email === "string" ? claims.email : null,
    };
  });

/* ------------------------------------------------------------------ */
/* Read - for the job application dialog                               */
/* ------------------------------------------------------------------ */

export interface ApplicationCvOption {
  readonly cvId: string;
  readonly title: string;
  readonly purpose: "general" | "targeted";
  readonly locale: "sv" | "en";
  readonly updatedAt: string;
  /** Why this CV cannot be sent, or null when it can. Never a bare
   *  boolean: "you cannot use this" without "because there is no
   *  employment on it" is a dead end, and the dialog turns the reason into
   *  a route back to My Career. */
  readonly block: CvApplicationBlock | null;
}

/**
 * The saved CVs a candidate could apply with.
 *
 * -- WHY THIS IS NOT `listMyCvs` WITH A FLAG --------------------------
 *
 * `listMyCvs` answers "what have I saved" for the CV list, and reads only
 * summary columns. This answers "what could I send", which needs the
 * snapshot's facts to decide -- a different read for a different question,
 * rather than one query made expensive for every caller.
 *
 * The bundle is read and then DISCARDED. What crosses back to the browser
 * is a title, a date and a reason; the employment history that decided the
 * reason never leaves the server, because the apply dialog has no use for
 * it and a payload nobody needs is a payload that leaks eventually.
 *
 * -- AND WHY IT THROWS ------------------------------------------------
 *
 * A read failure is NOT an empty list. Returning `[]` here would put "you
 * have no CQrityjob CV" in front of somebody who has three, and push them
 * to upload one they already own. The caller renders "we could not load
 * your CVs" and keeps the upload path open -- section 14 of the brief, and
 * the same rule `getMyPassport` was corrected for.
 */
export const listMyApplicationCvOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApplicationCvOption[]> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const { data, error } = await supabase
      .from("cv_documents")
      .select("id, title, purpose, locale, updated_at, source_bundle")
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(MAX_SAVED_CVS);
    if (error) {
      console.error("[cv] listMyApplicationCvOptions failed", error);
      throw new Error("CV_LIST_UNAVAILABLE");
    }
    return ((data ?? []) as Row[]).map((r) => ({
      cvId: String(r.id),
      title: String(r.title ?? ""),
      purpose: (r.purpose === "targeted" ? "targeted" : "general") as "general" | "targeted",
      locale: (r.locale === "en" ? "en" : "sv") as "sv" | "en",
      updatedAt: String(r.updated_at),
      block: cvApplicationBlock(parseBundle(r.source_bundle)),
    }));
  });

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/**
 * The codes a write can come back with.
 *
 * Every one is a specific, true thing a screen can say. `CV_UNKNOWN` is the
 * deliberate catch-all: a code this build has no words for is reported as
 * unknown rather than guessed at, because showing somebody a confident
 * sentence about a failure nobody recognised is how an outage becomes a lie.
 */
export type CvWriteRefusal =
  | "CV_NOT_AUTHENTICATED"
  | "CV_NOT_FOUND"
  | "CV_CHANGED"
  | "CV_REQUEST_CONFLICT"
  | "CV_NOT_READY"
  | "CV_LIMIT_REACHED"
  | "CV_CONTACT_INVALID"
  | "CV_UNKNOWN";

const KNOWN_REFUSALS: readonly CvWriteRefusal[] = [
  "CV_NOT_AUTHENTICATED",
  "CV_NOT_FOUND",
  "CV_CHANGED",
  "CV_REQUEST_CONFLICT",
  "CV_NOT_READY",
  "CV_LIMIT_REACHED",
  "CV_CONTACT_INVALID",
];

/** An error thrown by a CV write, carrying the code the screen renders. */
export class CvWriteError extends Error {
  constructor(readonly code: CvWriteRefusal) {
    super(code);
    this.name = "CvWriteError";
  }
}

/**
 * Turn a PostgREST error into a refusal.
 *
 * The database raises its codes as the exception MESSAGE, so the match is on
 * the message and it is an exact membership test rather than a substring
 * search: `includes("CV_CHANGED")` would also match a future
 * `CV_CHANGED_BY_ADMIN` and quietly tell somebody the wrong thing.
 *
 * Nothing from the database is passed through to the person. `error.message`
 * can carry a constraint name, a column list or a row's contents, and none of
 * that belongs on a candidate's screen.
 */
function refuse(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  const found = KNOWN_REFUSALS.find((code) => new RegExp(`\\b${code}\\b`).test(message));
  if (!found) console.error("[cv] unrecognised write refusal", error);
  throw new CvWriteError(found ?? "CV_UNKNOWN");
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/** Shared by create and save: the wording, and the two settings that are not
 *  facts. Facts are never in a payload -- only their ids. */
const contentSchema = {
  title: z.string().max(200).default(""),
  locale: z.enum(["sv", "en"]).default("sv"),
  purpose: z.enum(["general", "targeted"]).default("general"),
  targetJobText: z.string().max(MAX_TARGET_JOB_CHARS).nullable().default(null),
  includeCareerInsight: z.boolean().default(false),
  contact: storedContactSchema,
  providerMode: z.string().max(64).nullable().default(null),
  modelId: z.string().max(128).nullable().default(null),
} as const;

export const cvCreatePayloadSchema = z.object({
  /**
   * Generated ONCE by the browser, before the first attempt, and kept for
   * every retry of that attempt.
   *
   * This is what makes a lost response harmless. The insert commits, the
   * answer never arrives, the browser sends the identical request again --
   * and the database returns the original cvId instead of creating a second
   * document. A new id per attempt would defeat it completely, which is why
   * the screen holds one in state rather than generating one at call time.
   */
  operationId: z.string().uuid(),
  /** The facts to put ON this CV. An allowlist, intersected server-side with
   *  what the caller actually has -- see selection.ts. Required on create:
   *  a new CV has no carried set to fall back on. */
  includedIds: cvSelectionSchema,
  /** The draft the person is accepting. Null saves a purely factual CV. */
  presentation: z.unknown().nullable().default(null),
  ...contentSchema,
});

export interface SaveCvResult {
  readonly cvId: string;
  readonly savedAt: string;
  /** True when this call matched an operation that had already succeeded.
   *  Rendered as success, never as an error: the person's CV exists and
   *  exactly one of it exists. */
  readonly replayed: boolean;
  /** Non-empty only when a tampered or stale draft was refused. Nothing is
   *  written in that case. */
  readonly violations: readonly CvViolation[];
}

/**
 * Check a proposed AI draft before it is sent to be stored.
 *
 * ── WHY THIS SURVIVES THE MOVE TO SQL ──────────────────────────────────
 *
 * `cv_normalise_presentation` already drops any citation of a fact the
 * bundle does not contain, and that is the structural half of the guarantee.
 * What it does not do -- and should not -- is read PROSE: a fabricated year,
 * an invented team size, a sentence claiming somebody verified something.
 * Those are text checks over the person's own real dates, and they belong
 * here, in the language that has the vocabulary lists.
 *
 * The bundle used for the check is built in TypeScript from the same
 * allowlist the database will use. The two can in principle disagree; if they
 * do, the database's copy is authoritative and its normaliser is stricter --
 * it drops what it does not recognise. So drift makes the check weaker, never
 * the storage wronger, which is the safe direction for a duplicate to fail.
 */
async function validateProposedDraft(
  supabase: ScopedClient,
  userId: string,
  data: {
    presentation?: unknown;
    locale: "sv" | "en";
    purpose: "general" | "targeted";
    targetJobText: string | null;
    includeCareerInsight: boolean;
    includedIds: readonly string[];
  },
): Promise<readonly CvViolation[]> {
  if (data.presentation === null || data.presentation === undefined) return [];

  const identity = await readProfessionalIdentity(supabase, userId);
  const bundle = buildCvSourceBundle({
    identity,
    locale: data.locale,
    includeCareerInsight: data.includeCareerInsight,
    targetJobText: data.purpose === "targeted" ? data.targetJobText : null,
    includedIds: data.includedIds,
  });

  const shaped = cvPresentationOutput.safeParse(data.presentation);
  if (!shaped.success) {
    return [
      {
        kind: "fabricated_citation",
        field: "presentation",
        trigger: "the accepted draft did not match the agreed shape",
      },
    ];
  }
  return validateCvPresentation(shaped.data, bundle);
}

/**
 * Create one CV.
 *
 * Idempotent by `operationId`: the same id with the same resulting document
 * returns the original cvId, and the same id with a different one is refused
 * as CV_REQUEST_CONFLICT rather than overwriting anything.
 *
 * The facts are NOT in this payload. `includedIds` names them, and the
 * database derives every value from the caller's own records -- so there is
 * no employer name, role title or date for a client to send.
 */
export const createMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cvCreatePayloadSchema)
  .handler(async ({ context, data }): Promise<SaveCvResult> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };

    const violations = await validateProposedDraft(supabase, userId, data);
    if (violations.length > 0) {
      // Rejected whole, never repaired. Same rule as generation.
      return { cvId: "", savedAt: "", replayed: false, violations };
    }

    const { data: result, error } = await supabase.rpc("cv_create", {
      _operation_id: data.operationId,
      _title: data.title.trim(),
      _locale: data.locale,
      _purpose: data.purpose,
      _target_job_text: data.purpose === "targeted" ? data.targetJobText : null,
      _include_career_insight: data.includeCareerInsight,
      _included_ids: [...data.includedIds],
      _contact: data.contact,
      _presentation: data.presentation ?? {},
      _provider_mode: data.providerMode,
      _model_id: data.modelId,
    });
    if (error || !result) refuse(error);

    const row = result as { cv_id: string; updated_at: string; replayed: boolean };
    return {
      cvId: String(row.cv_id),
      savedAt: String(row.updated_at),
      replayed: Boolean(row.replayed),
      violations: [],
    };
  });

/**
 * The ONE write for everything a person may change about a saved CV.
 *
 * ── WHY IT IS ONE CALL ─────────────────────────────────────────────────
 *
 * It was two: a selection write and a wording write, from two round trips.
 * A failure between them left a document half-saved -- the facts changed and
 * the sentences about them not -- and the screen had no way to describe that
 * state, let alone recover from it.
 *
 * Now the database builds and validates everything before it touches the row,
 * so a refusal at any point leaves the CV exactly as it was and the person
 * still has every word they typed on screen in front of them.
 *
 * ── AND WHY IT DEMANDS A REVISION ──────────────────────────────────────
 *
 * `expectedUpdatedAt` is what the caller was looking at. A second tab open
 * since this morning holds a stale one, and its save would otherwise discard
 * whatever happened in between without telling anybody. It is refused with
 * CV_CHANGED and nothing is written.
 */
export const cvSavePayloadSchema = z.object({
  cvId: z.string().uuid(),
  /** The revision the caller was looking at. */
  expectedUpdatedAt: z.string().min(1),
  headline: z.string().max(160).optional(),
  summary: z.string().max(4000).optional(),
  bullets: z
    .array(z.object({ sourceId: z.string().min(1), bullets: z.array(z.string().max(600)).max(8) }))
    .max(40)
    .optional(),
  /** Absent means "keep what this CV already carries". Present and empty
   *  means "nothing", which readiness then refuses. */
  includedIds: cvSelectionSchema.optional(),
  /** A regenerated draft the person has accepted. Absent keeps the wording. */
  presentation: z.unknown().nullable().default(null),
  ...contentSchema,
});

export const saveMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cvSavePayloadSchema)
  .handler(async ({ context, data }): Promise<SaveCvResult> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };

    const violations = await validateProposedDraft(supabase, userId, {
      ...data,
      // For the CHECK only. An absent allowlist means "keep what this CV
      // carries", which only the database can resolve; validating against an
      // empty bundle would reject every citation in a legitimate draft, so a
      // draft is only ever accepted together with the selection it was
      // drafted against.
      includedIds: data.includedIds ?? [],
    });
    if (violations.length > 0) {
      return { cvId: data.cvId, savedAt: "", replayed: false, violations };
    }

    // A person's own edit is not a draft: `presentation` is null and the
    // headline/summary/bullets are folded onto whatever the row already
    // holds. `cv_save` takes one presentation object, so the merge happens
    // here -- over the CALLER'S OWN saved row, read back under their own RLS.
    // A person's own edit is not a draft: `presentation` is null and the
    // headline/summary/bullets are folded onto whatever the row already
    // holds. `cv_save` takes one presentation object, so the merge happens
    // here -- over the CALLER'S OWN saved row, read back under their own RLS,
    // through the one function that owns the authorship rule.
    let presentation: unknown = data.presentation;
    if (
      presentation === null &&
      (data.headline !== undefined || data.summary !== undefined || data.bullets)
    ) {
      const row = await loadOwnRow(supabase, userId, data.cvId);
      presentation = applyPersonEdit(parseStored(row.presentation), {
        headline: data.headline,
        summary: data.summary,
        bullets: data.bullets,
      });
    }

    const { data: result, error } = await supabase.rpc("cv_save", {
      _cv_id: data.cvId,
      _expected_updated_at: data.expectedUpdatedAt,
      _title: data.title.trim() || null,
      _locale: data.locale,
      _purpose: data.purpose,
      _target_job_text: data.purpose === "targeted" ? data.targetJobText : null,
      _include_career_insight: data.includeCareerInsight,
      _included_ids: data.includedIds ? [...data.includedIds] : null,
      _contact: data.contact,
      _presentation: presentation,
      _refresh_facts: false,
      _provider_mode: data.providerMode,
      _model_id: data.modelId,
    });
    if (error || !result) refuse(error);

    const row = result as { cv_id: string; updated_at: string };
    return {
      cvId: String(row.cv_id),
      savedAt: String(row.updated_at),
      replayed: false,
      violations: [],
    };
  });

/**
 * "Update from profile" -- explicit, never automatic.
 *
 * Re-derives current values for the facts this CV already carries. It ADDS
 * nothing: a newly recorded employment is a suggestion the screen offers, and
 * putting it on the document is a separate decision made through `saveMyCv`
 * with an explicit allowlist.
 */
export const refreshMyCvFromProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cvId: z.string().uuid(), expectedUpdatedAt: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { supabase } = context as { supabase: ScopedClient };
    const { data: result, error } = await supabase.rpc("cv_refresh_from_profile", {
      _cv_id: data.cvId,
      _expected_updated_at: data.expectedUpdatedAt,
    });
    if (error || !result) refuse(error);
    return { savedAt: String((result as { updated_at: string }).updated_at) };
  });

/** A CV is the person's own draft of their own presentation. Unlike a
 *  Passport entry -- a record other people act on, which is withdrawn rather
 *  than deleted -- nobody else has ever seen this row, so deleting it
 *  destroys no evidence. An application an employer already received keeps
 *  its own submitted copy and is untouched. */
export const deleteMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cvId: z.string().uuid(), expectedUpdatedAt: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ deleted: true }> => {
    const { supabase } = context as { supabase: ScopedClient };
    const { error } = await supabase.rpc("cv_delete", {
      _cv_id: data.cvId,
      _expected_updated_at: data.expectedUpdatedAt,
    });
    if (error) refuse(error);
    return { deleted: true };
  });
