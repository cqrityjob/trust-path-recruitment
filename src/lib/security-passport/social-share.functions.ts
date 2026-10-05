// Security Passport — the public social share, server side.
//
// Two tiers, kept apart on purpose:
//
//   * the HOLDER's calls (create, list, revoke, read their own number) run as
//     the signed-in holder through the auth middleware, so RLS and the
//     functions' own `auth.uid()` checks are the boundary;
//   * the PUBLIC read has no session. It calls the one anon-executable
//     function with the publishable key and nothing else: no service role, no
//     table read. What it returns is a payload the database built from the
//     holder's CURRENT rows for the credentials they approved.
//
// The public id is validated before it reaches the database, so a malformed
// id is answered without a query, and the single "unavailable" answer is the
// same for unknown, expired and revoked.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isWellFormedPublicId,
  parsePublicSocialShare,
  socialShareErrorCode,
  type CreateSocialShareResult,
  type MyPassportNumber,
  type MySocialShare,
  type PublicSocialShare,
} from "./social-share-public";

export type {
  CreateSocialShareResult,
  MyPassportNumber,
  MySocialShare,
  SocialShareErrorCode,
} from "./social-share-public";

export const getPublicSocialShare = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ publicId: z.string().max(64) }).parse(data))
  .handler(async ({ data }): Promise<PublicSocialShare> => {
    if (!isWellFormedPublicId(data.publicId)) return { status: "unavailable" };
    try {
      const { serverPublicClient } = await import("@/integrations/supabase/public-server");
      const { data: raw, error } = await serverPublicClient().rpc("sp_get_social_share", {
        _public_id: data.publicId,
      });
      if (error) return { status: "error" };
      return parsePublicSocialShare(raw, new Date().toISOString());
    } catch {
      return { status: "error" };
    }
  });

const createInput = z
  .object({
    claimIds: z.array(z.string().uuid()).min(1).max(200),
    locale: z.enum(["sv", "en"]),
    expiresDays: z.number().refine((v) => [7, 30, 90].includes(v)),
    // A personal share is NAMED: there is no anonymity or initials choice in
    // this flow, so anything but "full_name" is refused before it reaches the
    // database. (The page still shows the more restrictive of this and the
    // holder's privacy setting at the moment of each read, so a share made
    // earlier can never show more than it was approved to.)
    holderLabel: z.literal("full_name"),
    requestKey: z.string().uuid(),
  })
  .strict();

export const createSocialShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createInput.parse(data))
  .handler(async ({ context, data }): Promise<CreateSocialShareResult> => {
    // ── THE NAME CONDITION, CHECKED HERE AS WELL AS ON SCREEN ─────────────
    //
    // A named share must not be made while the holder's own privacy setting
    // hides their name: it would publish something other than what they saw
    // and approved. This is the holder's own row read as the holder, and it
    // FAILS CLOSED: a read that cannot be completed creates nothing. Nothing is
    // changed on the holder's behalf, neither the setting nor any earlier
    // share's approval; the page sends them to the setting to change it
    // themselves.
    const { data: profile, error: profileError } = await context.supabase
      .from("sp_passport_profiles")
      .select("privacy_mode")
      .eq("holder_user_id", context.userId)
      .maybeSingle();
    if (profileError) return { status: "failed", code: "unknown" };
    if (profile && profile.privacy_mode !== "full_name") {
      return { status: "failed", code: "name_not_approved" };
    }

    const { data: raw, error } = await context.supabase.rpc("sp_create_social_share", {
      _claim_ids: data.claimIds,
      _locale: data.locale,
      _expires_days: data.expiresDays,
      _holder_label: data.holderLabel,
      _request_key: data.requestKey,
    });
    if (error) return { status: "failed", code: socialShareErrorCode(error.message) };
    const r = (raw ?? {}) as Record<string, unknown>;
    if (
      (r.status !== "created" && r.status !== "already_created") ||
      !isWellFormedPublicId(r.public_id) ||
      typeof r.expires_at !== "string"
    ) {
      return { status: "failed", code: "unknown" };
    }
    return { status: r.status, publicId: r.public_id, expiresAt: r.expires_at };
  });

export const listMySocialShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly MySocialShare[]> => {
    const { data, error } = await context.supabase.rpc("sp_list_my_social_shares");
    if (error) throw new Error("Public shares unavailable");
    if (!Array.isArray(data)) return [];
    const out: MySocialShare[] = [];
    for (const row of data as Record<string, unknown>[]) {
      if (!isWellFormedPublicId(row.public_id)) continue;
      const status = row.status === "revoked" || row.status === "expired" ? row.status : "active";
      out.push({
        publicId: row.public_id,
        locale: row.locale === "en" ? "en" : "sv",
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
        status,
        claims: typeof row.claims === "number" ? row.claims : 0,
      });
    }
    return out;
  });

export const revokeSocialShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ publicId: z.string().length(24) }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    if (!isWellFormedPublicId(data.publicId)) throw new Error("Invalid share");
    const { error } = await context.supabase.rpc("sp_revoke_social_share", {
      _public_id: data.publicId,
    });
    if (error) throw new Error("Share could not be revoked");
    return { ok: true };
  });

/** The holder's own number and designation, as the database holds them. The
 *  number is assigned by the server; nothing here can set it. */
export const getMyPassportNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPassportNumber> => {
    const { data, error } = await context.supabase.rpc("sp_my_passport_number");
    if (error) throw new Error("Passport number unavailable");
    const r = (data ?? {}) as Record<string, unknown>;
    const n = typeof r.passport_number === "number" ? r.passport_number : null;
    return { number: n, designation: r.designation === "founder" ? "founder" : null };
  });
