// HAYAT — the server boundary.
//
// ── WHAT CROSSES IT ────────────────────────────────────────────────────
//
// IN:  the holder's selected definition code, the two dates they typed, and
//      EITHER the text of a signed credential found inside their own image OR
//      their public badge link (which is parsed for an id and never fetched). No
//      document, no OCR text, no page image, and -- on purpose -- no field in
//      which a browser could say "this is verified". There is nothing here for
//      a client to set.
// OUT: a decision made by ./verification from a signature, a pinned key and a
//      governed issuer policy.
//
// The account the credential is bound against is read from the authenticated
// session on the server. It is never an input.
//
// ── WHAT THIS DOES NOT DO, YET ─────────────────────────────────────────
//
// It does not write. A HAYAT decision is shown to the holder and is not
// recorded on the claim, and `assertion_level` is untouched: today the only
// writer that can produce `verified` is the reviewer path (`sp_verifier_decide`)
// and `issuer_confirmation` is refused for every request kind by
// 20261030090000. Letting a machine decision reach a claim means a new,
// service-only writer and a change to that containment -- a schema-first
// migration and an owner decision, not a side effect of a form. Until then a
// positive decision is reported as `recorded: false`, and the form says so.
//
// Nothing about the credential is logged.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isCalendarDate } from "../dates";
import { BAKED_CREDENTIAL_MAX_CHARS } from "./baked-badge";
import { assessHostedBadge } from "./verification/hosted-open-badge";
import { PRODUCTION_ISSUER_POLICIES } from "./verification/issuer-registry";
import type { HayatDecision } from "./verification/model";
import { assessSignedCredential } from "./verification/signed-credential";
import {
  CREDLY_OB2,
  PRODUCTION_SOURCES,
  verifiableDefinitionCodes,
} from "./verification/source-registry";

// A real calendar date, not merely a date-shaped string.
const isoDay = z.string().refine(isCalendarDate, "not a calendar date").nullable();

const assessInput = z
  .object({
    definitionCode: z.string().min(1).max(120),
    issuedOn: isoDay,
    validUntil: isoDay,
    /** A signed credential found baked into the holder's own image. */
    signedCredential: z.string().min(1).max(BAKED_CREDENTIAL_MAX_CHARS).nullable(),
    /** The holder's public badge link. Parsed for an id; never fetched as given. */
    badgeLink: z.string().min(1).max(400).nullable(),
  })
  // Strict: an unexpected key -- `verified: true`, say -- is a refused request,
  // not an ignored one.
  .strict()
  .refine((d) => (d.signedCredential === null) !== (d.badgeLink === null), {
    message: "exactly one kind of evidence",
  });

export interface HayatAssessment {
  readonly decision: HayatDecision;
  /** Always false in this release: see the header. */
  readonly recorded: false;
}

/** Which link-based sources the holder can actually use right now. A disabled
 *  source is not offered: the form shows only actions that work. */
export interface HayatAvailability {
  readonly linkSources: readonly {
    readonly id: string;
    readonly name: string;
    readonly definitionCodes: readonly string[];
  }[];
}

export const getHayatAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<HayatAvailability> => ({
      linkSources: PRODUCTION_SOURCES.filter((s) => s.enabled).map((s) => ({
        id: s.id,
        name: s.name,
        definitionCodes: verifiableDefinitionCodes([s]),
      })),
    }),
  );

export const assessCredentialEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => assessInput.parse(data))
  .handler(async ({ context, data }): Promise<HayatAssessment> => {
    const { data: session } = await context.supabase.auth.getUser();
    const user = session?.user ?? null;
    const account = {
      email: user?.email ?? null,
      emailConfirmed: Boolean(user?.email_confirmed_at),
    };
    const now = new Date();
    const decision =
      data.badgeLink !== null
        ? await assessHostedBadge(
            {
              link: data.badgeLink,
              claim: { definitionCode: data.definitionCode, validUntil: data.validUntil },
              account,
            },
            { source: CREDLY_OB2, now },
          )
        : await assessSignedCredential(
            {
              credential: data.signedCredential ?? "",
              claim: {
                definitionCode: data.definitionCode,
                issuedOn: data.issuedOn,
                validUntil: data.validUntil,
              },
              account,
            },
            { registry: PRODUCTION_ISSUER_POLICIES, now },
          );
    return { decision, recorded: false };
  });
