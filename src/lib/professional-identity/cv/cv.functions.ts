// The CV server functions.
//
// ── WHY GENERATION IS SERVER-SIDE, WITHOUT EXCEPTION ───────────────────
//
// Because the model credential lives in the server environment and there is
// no code path from a page to a provider — the adapter refuses to be
// constructed in a browser, and this is the only thing that calls it. A
// browser-side call would put the key in a bundle.
//
// ── WHY THE BUNDLE IS BUILT HERE AND NOT SENT BY THE CLIENT ────────────
//
// The client could assemble the facts itself; it already has them on screen.
// It must not, and the reason is not tampering with somebody else's data
// (RLS makes that impossible either way) — it is that a client-supplied
// bundle would let a person put text into the "facts" this product then
// vouches for. The facts are re-read here, from the tables that own them,
// on every run. The ONLY thing the client contributes is the target job
// text, which is treated as untrusted and labelled as such all the way
// down.
//
// ── WHAT IS AND IS NOT SAVED HERE ──────────────────────────────────────
//
// Nothing, still. These two functions PREPARE and GENERATE; persistence is
// `cv-store.functions.ts` and it is a separate file on purpose, because
// generating is not consent to keep. A person may draft a CV, read it,
// dislike it and close the tab, and this file will have written nothing
// about them anywhere.
//
// (When the CV feature first shipped there was no store at all: the table
// arrived in its own schema release, as this repository's schema-first
// contract requires. The split survived the store landing because it was
// never only about the table.)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readProfessionalIdentity } from "../identity.functions";
import { buildCvSourceBundle, type CvSourceBundle } from "./source-bundle";
import { computeCvReadiness, type CvReadiness } from "./readiness";
import { applyCvPresentation, buildFactualCvDocument, type CvDocument } from "./document";
import { buildCvTrustAnnotations } from "./trust-annotations";
import { generateCvPresentation, type CvGenerationStatus } from "./generation";
import { resolveCvContact, storedContactSchema } from "./stored";
import { cvSelectionSchema } from "./selection";
import type { CvPresentation } from "./schema";
import type { QuarantinedPassage } from "@/lib/interview-intelligence/ai/injection";
import type { ProviderMode } from "@/lib/interview-intelligence/ai/orchestrator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScopedClient = any;

/** A pasted advert is a page of text, not a book. Bounded so a paste
 *  cannot become an unbounded provider request. */
const MAX_TARGET_JOB_CHARS = 12_000;

const generateSchema = z.object({
  /** "General CV" or "tailor to a role" — the second requires the text. */
  purpose: z.enum(["general", "targeted"]).default("general"),
  targetJobText: z.string().max(MAX_TARGET_JOB_CHARS).nullable().default(null),
  /** Opt-IN. An assessment insight on a CV is a choice the person makes. */
  includeCareerInsight: z.boolean().default(false),
  locale: z.enum(["sv", "en"]).default("sv"),
  /** The facts to put ON this CV. Applied while the bundle is built, so a
   *  fact the person left off is not in the provider request either. */
  includedIds: cvSelectionSchema,
  /** Rendered on the preview so the person reviews the document they will
   *  actually save. Never reaches the bundle, so never reaches a prompt. */
  contact: storedContactSchema,
});

export interface CvPreparation {
  readonly readiness: CvReadiness;
  /** The facts, so the review step can show exactly what will be used
   *  BEFORE anything is generated. A person is entitled to see the input. */
  readonly bundle: CvSourceBundle;
  /** Always present, always renderable, model or no model. */
  readonly factualDocument: CvDocument;
  /** Whether there IS a Career Discovery result to offer including.
   *
   *  A separate flag rather than reading `bundle.careerInsight`, because the
   *  preparation bundle is deliberately built with the insight OFF — it is
   *  opt-in — so the bundle can never answer "could this person opt in". */
  readonly hasCareerInsight: boolean;
  /**
   * The account email, offered as a contact line the person may switch on.
   *
   * Read from the verified session claims on the server, never accepted
   * from the browser, and never turned on by default -- "we already know
   * this" is a reason to save somebody typing, not a reason to publish it.
   * Null when the session carries no email, in which case the field is
   * simply empty and the person may type one.
   */
  readonly accountEmail: string | null;
  /** The language the person's account is set to, as the starting choice for
   *  the document. They may pick the other one; this is a default, not a
   *  constraint, because the language a CV is READ in is decided by whoever
   *  is being applied to. */
  readonly defaultLocale: "sv" | "en";
}

export interface CvGenerationOutcome {
  readonly status: CvGenerationStatus | "not_ready";
  readonly readiness: CvReadiness;
  /**
   * The validated draft itself, so the person can ACCEPT it and the caller
   * can send it back to be saved.
   *
   * Round-tripping it through the browser is what the "generate -> preview
   * -> accept" contract requires, and it opens exactly one hole: a client
   * could return something other than what was generated. `saveCvDraft`
   * closes it by re-running the same schema check and the same
   * anti-fabrication sweep against a server-rebuilt bundle before writing.
   * Null on every path that produced no usable draft.
   */
  readonly presentation: CvPresentation | null;
  /** The document to render. On every failure path this is the FACTUAL
   *  document rather than null — the person still has a CV. */
  readonly document: CvDocument | null;
  readonly providerMode: ProviderMode | null;
  readonly model: string | null;
  /** Paragraphs of the pasted advert withheld because they carried
   *  instructions rather than role information. Shown, never silent. */
  readonly quarantinedPassages: readonly QuarantinedPassage[];
  /** Why an assisted draft is not on screen, when it is not. */
  readonly failureReason: string | null;
  /** How many anti-fabrication violations rejected the draft. Surfaced so
   *  a rejection is visible rather than looking like an outage. */
  readonly violationCount: number;
}

/**
 * What the CV step should show before anything is generated.
 *
 * Contacts no provider. A person with an incomplete profile gets a precise
 * list of what is missing without a model ever being consulted about them.
 */
export const prepareMyCv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CvPreparation> => {
    const { supabase, userId, claims } = context as {
      supabase: ScopedClient;
      userId: string;
      claims: Record<string, unknown>;
    };
    const identity = await readProfessionalIdentity(supabase, userId);
    const locale = identity.locale === "en" ? "en" : "sv";
    // UNFILTERED, deliberately. This is the picker's input: it has to show
    // everything the person could put on a CV, including what they will
    // choose to leave off. The exclusions are applied when a document is
    // generated or saved, not here.
    const bundle = buildCvSourceBundle({
      identity,
      locale,
      includeCareerInsight: false,
      targetJobText: null,
    });
    const email = typeof claims?.email === "string" ? claims.email : null;
    return {
      readiness: computeCvReadiness(identity),
      bundle,
      factualDocument: buildFactualCvDocument(bundle, buildCvTrustAnnotations(identity)),
      hasCareerInsight: identity.discovery.hasCompletedReport,
      accountEmail: email,
      defaultLocale: locale,
    };
  });

/**
 * Generate an assisted draft.
 *
 * The readiness check runs FIRST and refuses before any provider is
 * contacted, because a model cannot supply a missing employment history and
 * asking it to try is how one gets invented.
 */
export const generateMyCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(generateSchema)
  .handler(async ({ context, data }): Promise<CvGenerationOutcome> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    const identity = await readProfessionalIdentity(supabase, userId);
    const readiness = computeCvReadiness(identity);

    const locale = data.locale;
    const bundle = buildCvSourceBundle({
      identity,
      locale,
      includeCareerInsight: data.includeCareerInsight,
      // A "general" CV never carries the advert, even if one was sent.
      // Purpose is the person's stated intent and it decides what is used.
      targetJobText: data.purpose === "targeted" ? data.targetJobText : null,
      includedIds: data.includedIds,
    });
    const contact = resolveCvContact(data.contact);

    if (readiness.state !== "ready") {
      return {
        status: "not_ready",
        readiness,
        presentation: null,
        document: null,
        providerMode: null,
        model: null,
        quarantinedPassages: [],
        failureReason: null,
        violationCount: 0,
      };
    }

    // Built from the identity, NOT from the bundle, and handed to the
    // document rather than to the generator. `generateCvPresentation` below
    // receives the bundle alone -- which is the whole point: the provider
    // is never given a verifier organisation to weave into prose.
    const trust = buildCvTrustAnnotations(identity);
    const factual = buildFactualCvDocument(bundle, trust, contact);
    const result = await generateCvPresentation(bundle);

    if (result.status !== "succeeded" || !result.presentation) {
      return {
        status: result.status,
        readiness,
        presentation: null,
        // The fallback is not an error state. It is the CV.
        document: factual,
        providerMode: result.providerMode,
        model: result.model,
        quarantinedPassages: result.quarantinedPassages,
        failureReason: result.failureReason,
        violationCount: result.violations.length,
      };
    }

    return {
      status: "succeeded",
      readiness,
      presentation: result.presentation,
      document: applyCvPresentation(bundle, result.presentation, trust, contact),
      providerMode: result.providerMode,
      model: result.model,
      quarantinedPassages: result.quarantinedPassages,
      failureReason: null,
      violationCount: 0,
    };
  });
