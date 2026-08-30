// Saved CV documents -- the persistence half.
//
// -- WHY THIS FILE MAKES ITS RELEASE GATED -----------------------------
//
// It names `cv_documents`, a table introduced by
// 20261010090000_cv_documents.sql. This repository's schema-first release
// contract therefore refuses to let it merge until that migration is
// recorded as applied on the owner Supabase project. That is deliberate and
// it is not worked around: Lovable rebuilds from `origin/main` at merge
// while migrations run when somebody applies them, and code that reaches
// for a table the live database has never heard of is the 2026-08-25
// outage. The release is split; the order is the point.
//
// -- WHAT A SAVED CV IS, AND IS NOT ------------------------------------
//
// A PRESENTATION DOCUMENT over facts that live somewhere else. It stores
// the arrangement, the wording and the purpose. It stores a SNAPSHOT of the
// facts so that reopening it shows what was sent rather than something
// quietly rewritten since. It is not, and must never become, a second
// employment database:
//
//   * no handler here writes security_career_profiles, sp_experience_periods,
//     sp_claims, sp_passport_profiles or profiles. Not one statement.
//   * the edit payload has no field for an employer, a role title, a date,
//     an institution or a credential name, so a factual correction cannot
//     arrive through this door even by mistake.
//   * facts are re-read from the saved snapshot on every render, never from
//     anything the client sent.
//
// -- WHY THE CLIENT NEVER SUPPLIES THE FACTS ---------------------------
//
// The bundle is rebuilt on the server from the caller's own RLS-scoped
// reads on every write. A client-supplied bundle would let somebody put
// text into the "facts" this product then vouches for. The only things a
// client contributes are the target job text (untrusted, screened) and
// presentation wording (re-validated against the server's own bundle
// before it is stored -- see `saveCvDraft`).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readProfessionalIdentity } from "../identity.functions";
import { buildCvSourceBundle, type CvSourceBundle } from "./source-bundle";
import { computeCvReadiness } from "./readiness";
import { cvPresentationOutput } from "./schema";
import { validateCvPresentation, type CvViolation } from "./validation";
import { diffCvSourceBundles, type BundleDiff } from "./bundle-diff";
import {
  applyCvEdit,
  buildSavedCvDocument,
  cvEditSchema,
  factualStoredPresentation,
  reconcileStoredPresentation,
  storedFromAiPresentation,
  storedPresentationSchema,
  type StoredPresentation,
} from "./stored";
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

/** Rebuild the bundle as it stands NOW, for drift detection and refresh. */
async function freshBundle(
  supabase: ScopedClient,
  userId: string,
  locale: "sv" | "en",
  saved: CvSourceBundle,
): Promise<CvSourceBundle> {
  const identity = await readProfessionalIdentity(supabase, userId);
  return buildCvSourceBundle({
    identity,
    locale,
    includeCareerInsight: saved.careerInsight !== null,
    targetJobText: saved.targetJobText,
  });
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
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const row = await loadOwnRow(supabase, userId, data.cvId);

    const bundle = parseBundle(row.source_bundle);
    const stored = parseStored(row.presentation);
    const locale = (row.locale === "en" ? "en" : "sv") as "sv" | "en";

    return {
      cvId: String(row.id),
      title: String(row.title ?? ""),
      purpose: (row.purpose === "targeted" ? "targeted" : "general") as "general" | "targeted",
      locale,
      document: buildSavedCvDocument(bundle, stored),
      bundle,
      presentation: stored,
      providerMode: (row.provider_mode as string | null) ?? null,
      modelId: (row.model_id as string | null) ?? null,
      updatedAt: String(row.updated_at),
      profileDrift: diffCvSourceBundles(
        bundle,
        await freshBundle(supabase, userId, locale, bundle),
      ),
    };
  });

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

const saveDraftSchema = z.object({
  /** Absent to create; present to replace the presentation of a saved CV
   *  after the person has ACCEPTED a regenerated draft. */
  cvId: z.string().uuid().nullable().default(null),
  title: z.string().max(200).default(""),
  purpose: z.enum(["general", "targeted"]).default("general"),
  targetJobText: z.string().max(MAX_TARGET_JOB_CHARS).nullable().default(null),
  includeCareerInsight: z.boolean().default(false),
  locale: z.enum(["sv", "en"]).default("sv"),
  /** The draft the person is accepting. Null saves a purely factual CV. */
  presentation: z.unknown().nullable().default(null),
  providerMode: z.string().max(64).nullable().default(null),
  modelId: z.string().max(128).nullable().default(null),
});

export interface SaveCvResult {
  readonly cvId: string;
  readonly savedAt: string;
  /** Non-empty only when a tampered or stale draft was refused. The row is
   *  NOT written in that case. */
  readonly violations: readonly CvViolation[];
}

/**
 * Save a draft the person has accepted.
 *
 * -- WHY THE DRAFT IS RE-VALIDATED HERE --------------------------------
 *
 * The regeneration contract is "generate -> preview -> accept", which means
 * the proposed presentation necessarily travels to the browser and back.
 * A browser is not a trusted source, so the presentation arriving here is
 * treated exactly like a model's answer: the bundle is rebuilt from the
 * caller's own reads, and `validateCvPresentation` runs again against it.
 * A draft that cites an employment this person does not have, invents a
 * year or claims verification is REFUSED and nothing is written.
 *
 * That closes the one hole the round trip would otherwise open, and it
 * costs nothing: the check is the same pure function the generator uses.
 */
export const saveCvDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(saveDraftSchema)
  .handler(async ({ context, data }): Promise<SaveCvResult> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };

    const identity = await readProfessionalIdentity(supabase, userId);
    if (computeCvReadiness(identity).state !== "ready") {
      throw new Error("CV_NOT_READY");
    }

    const bundle = buildCvSourceBundle({
      identity,
      locale: data.locale,
      includeCareerInsight: data.includeCareerInsight,
      targetJobText: data.purpose === "targeted" ? data.targetJobText : null,
    });

    let stored: StoredPresentation;
    let origin: "factual" | "ai_assisted";

    if (data.presentation === null) {
      stored = factualStoredPresentation(bundle);
      origin = "factual";
    } else {
      const shaped = cvPresentationOutput.safeParse(data.presentation);
      if (!shaped.success) {
        return {
          cvId: data.cvId ?? "",
          savedAt: "",
          violations: [
            {
              kind: "fabricated_citation",
              field: "presentation",
              trigger: "the accepted draft did not match the agreed shape",
            },
          ],
        };
      }
      const violations = validateCvPresentation(shaped.data, bundle);
      if (violations.length > 0) {
        // Rejected whole, never repaired. Same rule as generation.
        return { cvId: data.cvId ?? "", savedAt: "", violations };
      }
      stored = storedFromAiPresentation(shaped.data);
      origin = "ai_assisted";
    }

    const title =
      data.title.trim() ||
      (data.purpose === "targeted" ? "Anpassat CV" : "Allmänt CV");

    if (data.cvId) {
      const { data: updated, error } = await supabase
        .from("cv_documents")
        .update({
          title,
          locale: data.locale,
          purpose: data.purpose,
          origin,
          source_bundle: bundle,
          presentation: stored,
          provider_mode: data.providerMode,
          model_id: data.modelId,
        })
        .eq("id", data.cvId)
        .eq("owner_user_id", userId)
        .select("id, updated_at")
        .maybeSingle();
      if (error || !updated) throw new Error("Could not save your CV.");
      return { cvId: String(updated.id), savedAt: String(updated.updated_at), violations: [] };
    }

    const { count } = await supabase
      .from("cv_documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId);
    if ((count ?? 0) >= MAX_SAVED_CVS) throw new Error("CV_LIMIT_REACHED");

    const { data: created, error } = await supabase
      .from("cv_documents")
      .insert({
        owner_user_id: userId,
        title,
        locale: data.locale,
        purpose: data.purpose,
        origin,
        source_bundle: bundle,
        presentation: stored,
        provider_mode: data.providerMode,
        model_id: data.modelId,
      })
      .select("id, updated_at")
      .single();
    if (error || !created) throw new Error("Could not save your CV.");
    return { cvId: String(created.id), savedAt: String(created.updated_at), violations: [] };
  });

/**
 * A presentation edit: wording and order, never a fact.
 *
 * The payload schema is the boundary -- it has no field that could carry an
 * employer, a title or a date. The bundle is untouched by construction: it
 * is read to validate ids and written back byte-for-byte.
 */
export const editMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(cvEditSchema)
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const row = await loadOwnRow(supabase, userId, data.cvId);

    const bundle = parseBundle(row.source_bundle);
    const next = applyCvEdit(parseStored(row.presentation), data, bundle);

    const patch: Row = { presentation: next };
    if (data.title !== undefined) patch.title = data.title.trim();

    const { data: updated, error } = await supabase
      .from("cv_documents")
      .update(patch)
      .eq("id", data.cvId)
      .eq("owner_user_id", userId)
      .select("updated_at")
      .maybeSingle();
    if (error || !updated) throw new Error("Could not save your changes.");
    return { savedAt: String(updated.updated_at) };
  });

/**
 * "Update from profile" -- explicit, never automatic.
 *
 * Re-reads the facts, keeps the wording, and reports any employment whose
 * bullets had to be dropped because the record is gone. Nothing about this
 * happens on a read: a saved CV that changed itself when you opened it
 * would not be a snapshot.
 */
export const refreshMyCvFromProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cvId: z.string().uuid() }))
  .handler(
    async ({ context, data }): Promise<{ savedAt: string; droppedIds: readonly string[] }> => {
      const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
      const row = await loadOwnRow(supabase, userId, data.cvId);
      const locale = (row.locale === "en" ? "en" : "sv") as "sv" | "en";

      const fresh = await freshBundle(supabase, userId, locale, parseBundle(row.source_bundle));
      const { presentation, droppedIds } = reconcileStoredPresentation(
        parseStored(row.presentation),
        fresh,
      );

      const { data: updated, error } = await supabase
        .from("cv_documents")
        .update({ source_bundle: fresh, presentation })
        .eq("id", data.cvId)
        .eq("owner_user_id", userId)
        .select("updated_at")
        .maybeSingle();
      if (error || !updated) throw new Error("Could not update your CV from your profile.");
      return { savedAt: String(updated.updated_at), droppedIds };
    },
  );

/** A CV is the person's own draft of their own presentation. Unlike a
 *  Passport entry -- a record other people act on, which is withdrawn
 *  rather than deleted -- nobody else has ever seen this, so deleting it
 *  destroys no evidence. */
export const deleteMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ cvId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<{ deleted: true }> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const { error } = await supabase
      .from("cv_documents")
      .delete()
      .eq("id", data.cvId)
      .eq("owner_user_id", userId);
    if (error) throw new Error("Could not delete that CV.");
    return { deleted: true };
  });
