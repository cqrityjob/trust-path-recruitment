// Security Passport — the holder's side of "I cannot find my certification".
//
// Three small server functions over three database functions
// (20270206090000_sp_catalogue_research_foundation):
//
//   searchUnavailableDefinitions   what the research knows of but the catalogue
//                                  has not approved yet, with a controlled reason
//   requestCatalogueDefinition     a REQUEST that a certification be considered
//   listMyCatalogueRequests        the holder's own requests and their answers
//
// ── WHAT A REQUEST IS NOT ──────────────────────────────────────────────
//
// It is text the holder typed. It creates no definition, no issuer and no
// claim, changes nothing that is selectable, and verifies nothing. The browser
// never receives, and these functions never write, a catalogue table: every
// write goes through `sp_request_catalogue_definition`, which checks the
// session, the Passport and the limits itself. A platform administrator answers
// it from /admin/passport-catalogue.
//
// ── SCHEMA-FIRST ────────────────────────────────────────────────────────
//
// The search is a convenience on top of the catalogue, so a database that has
// not received the migration yet answers it with "nothing to add", never an
// error that takes the picker down. The request is the one call that must say
// so when it cannot be recorded: silently swallowing a holder's request would
// be worse than refusing it.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REQUEST_LIMITS } from "./credential-picker";

export interface UnavailableDefinition {
  /** The research record's stable id: what a request can point at. */
  readonly researchId: string;
  readonly name: string;
  readonly abbreviation: string | null;
  readonly issuer: string;
  /** A controlled vocabulary: see UNAVAILABLE_REASONS. Never an internal note. */
  readonly reason: string | null;
}

export const searchUnavailableDefinitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ search: z.string().max(120) })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<readonly UnavailableDefinition[]> => {
    if (data.search.trim().length < 2) return [];
    const result = await context.supabase.rpc("sp_catalogue_unavailable_matches", {
      _search: data.search,
      _limit: 8,
    });
    // Tolerant: without the function the picker simply has no "not available yet" group.
    if (result.error) return [];
    return (result.data ?? []).map((r) => ({
      researchId: r.research_id,
      name: r.official_name,
      abbreviation: r.acronym || null,
      issuer: r.issuer_name,
      reason: r.holder_reason || null,
    }));
  });

const requestInput = z
  .object({
    requested_name: z.string().trim().min(REQUEST_LIMITS.nameMin).max(REQUEST_LIMITS.nameMax),
    requested_issuer: z.string().trim().min(REQUEST_LIMITS.issuerMin).max(REQUEST_LIMITS.issuerMax),
    requested_abbreviation: z.string().trim().max(REQUEST_LIMITS.abbreviationMax).optional(),
    source_url: z
      .string()
      .trim()
      .max(REQUEST_LIMITS.urlMax)
      .regex(/^(https:\/\/\S+)?$/)
      .optional(),
    note: z.string().max(REQUEST_LIMITS.noteMax).optional(),
    /** The not-yet-available record the holder was looking at, where there was one. */
    research_id: z
      .string()
      .regex(/^cred_[0-9a-f]{16}$/)
      .optional(),
  })
  .strict();
export type CatalogueRequestInput = z.infer<typeof requestInput>;

/** The database's own refusal name, so the form can say what to fix. */
function refusal(message: string | undefined): string {
  return /SP_[A-Z_]+/.exec(message ?? "")?.[0] ?? "SP_REQUEST_FAILED";
}

export const requestCatalogueDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => requestInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    // Only keys that carry a value travel: the RPC refuses unknown keys, and an
    // empty optional is simply absent.
    const input: Record<string, string> = {
      requested_name: data.requested_name,
      requested_issuer: data.requested_issuer,
    };
    for (const key of ["requested_abbreviation", "source_url", "note", "research_id"] as const) {
      const value = data[key]?.trim();
      if (value) input[key] = value;
    }
    const result = await context.supabase.rpc("sp_request_catalogue_definition", {
      _input: input,
    });
    if (result.error || typeof result.data !== "string")
      throw new Error(refusal(result.error?.message));
    return { id: result.data };
  });

export interface MyCatalogueRequest {
  readonly id: string;
  readonly name: string;
  readonly issuer: string;
  readonly abbreviation: string | null;
  readonly status: string;
  /** Written for the holder by the administrator who answered. */
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export const listMyCatalogueRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly MyCatalogueRequest[]> => {
    const result = await context.supabase.rpc("sp_list_my_catalogue_requests");
    if (result.error) return [];
    return (result.data ?? []).map((r) => ({
      id: r.id,
      name: r.requested_name,
      issuer: r.requested_issuer,
      abbreviation: r.requested_abbreviation || null,
      status: r.status,
      resolutionNote: r.resolution_note || null,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at || null,
    }));
  });
