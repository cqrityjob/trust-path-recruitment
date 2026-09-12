// Admin Portal — Security Passport internal-pilot access, per user, per market.
//
// ── WHAT THIS IS ───────────────────────────────────────────────────────
//
// The United Kingdom, Northern Ireland and Dubai market packs are in
// INTERNAL PILOT: their regulatory content is unreviewed, `is_active` stays
// false, and the only way a holder reaches their catalogue is a named, per-
// market entitlement in `sp_pilot_members`, granted by a platform
// administrator through `sp_grant_pilot_member()`. Until now that grant could
// only be made by hand in SQL. This file is the administrative surface for
// it: one user, one market, one decision at a time.
//
// ── SECURITY MODEL ─────────────────────────────────────────────────────
//
//   * Every function re-verifies the caller server-side with
//     `is_platform_admin()` before doing anything. The client's own idea of
//     who it is decides nothing.
//   * Granting and revoking go through the two SECURITY DEFINER RPCs, called
//     on the CALLER'S authenticated session — never the service role. The
//     RPC re-checks `is_platform_admin(auth.uid())` itself and records
//     `granted_by` / `revoked_by` as `auth.uid()`, so the audit row names the
//     administrator who actually decided, not a shared master key.
//   * There is no direct write to `sp_pilot_members` here. There is no
//     INSERT or UPDATE policy on that table for any role, so there could not
//     be one that worked; this file does not try.
//   * The READ of another user's entitlement is the one thing RLS cannot
//     grant an administrator (the table's only SELECT policy is
//     `user_id = auth.uid()`), so it goes through the service-role client,
//     AFTER the admin check, selecting only the audit columns. It is the same
//     pattern `adminGetUserDetail` uses to read `profiles`, and it is a read.
//   * One user and one market per call. There is deliberately no list input
//     and no "grant all": a pilot entitlement is a decision about one person
//     exercising one regulator's catalogue, and a mass grant is exactly the
//     bypass the per-market design refuses.
//   * An administrator MAY grant themselves. `sp_is_pilot_member()` makes
//     admins deliberately NOT implicit members, so an administrator who wants
//     to test the pilot experience grants their own account and that grant is
//     recorded like any other.
//
// ── WHAT A GRANT IS NOT ────────────────────────────────────────────────
//
// It permits registration in an unreviewed market. It is not legal approval
// of the market, not verification of anything the holder records, not a
// statement about the person, and not an authority to work. The copy on the
// admin surface says so beside the button.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

/** The only markets this surface manages. Sweden is production and has no
 *  pilot; Abu Dhabi is closed by owner decision and must not be offered. A
 *  code outside this list is refused before the database is asked. */
export const PILOT_MANAGED_MARKETS = ["GB", "GB-NI", "AE-DU"] as const;
export type PilotManagedMarket = (typeof PILOT_MANAGED_MARKETS)[number];

const marketSchema = z.enum(PILOT_MANAGED_MARKETS);

export interface AdminPilotAccessRow {
  readonly marketPackCode: PilotManagedMarket;
  readonly nameSv: string;
  readonly nameEn: string;
  /** True when the pack is in internal pilot, which is the only state in
   *  which `sp_grant_pilot_member()` accepts a grant. */
  readonly inPilot: boolean;
  /** The entitlement row, or null when this user was never granted. The
   *  granting and revoking administrators' ids stay in the database: the
   *  page needs WHEN and WHETHER, and an actor id in a browser response is
   *  personal data it has no use for. */
  readonly entitlement: {
    readonly active: boolean;
    readonly grantedAt: string;
    readonly revokedAt: string | null;
    readonly note: string | null;
  } | null;
}

const userSchema = z.object({ userId: z.string().uuid() });

export const adminListPassportPilotAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userSchema.parse(d))
  .handler(async ({ data, context }): Promise<readonly AdminPilotAccessRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    // The packs, through the caller's own session: every authenticated user
    // may read sp_market_packs. `pilot_state` is read separately so a
    // database without the pilot layer yields "not in pilot" (grant disabled)
    // rather than a failed page.
    const { data: packs, error: packErr } = await ctx.supabase
      .from("sp_market_packs")
      .select("code, name_sv, name_en")
      .in("code", [...PILOT_MANAGED_MARKETS])
      .is("superseded_on", null);
    if (packErr) throw new Error("PILOT_PACKS_LOAD_FAILED");

    const pilotStates = new Map<string, string>();
    const { data: pilotRows, error: pilotErr } = await ctx.supabase
      .from("sp_market_packs")
      .select("code, pilot_state")
      .in("code", [...PILOT_MANAGED_MARKETS]);
    if (!pilotErr) {
      for (const r of (pilotRows ?? []) as Array<{ code: string; pilot_state: string }>) {
        pilotStates.set(r.code, r.pilot_state);
      }
    }

    // The entitlement rows for THIS user: market, moments and note, and no
    // actor id. Service role, after the admin check, because the table's
    // SELECT policy is the holder's own and an administrator is not the
    // holder; the read is scoped to one user id and three market codes.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error: memberErr } = await supabaseAdmin
      .from("sp_pilot_members")
      .select("market_pack_code, granted_at, revoked_at, note")
      .eq("user_id", data.userId)
      .in("market_pack_code", [...PILOT_MANAGED_MARKETS]);
    // A database without the pilot layer has no table to read. That is "no
    // entitlements", not a failure, and it fails closed: nobody appears
    // granted.
    const memberByCode = new Map<string, NonNullable<typeof members>[number]>();
    if (!memberErr) {
      for (const m of members ?? []) memberByCode.set(m.market_pack_code, m);
    }

    const byCode = new Map(
      ((packs ?? []) as Array<{ code: string; name_sv: string; name_en: string }>).map((p) => [
        p.code,
        p,
      ]),
    );

    return PILOT_MANAGED_MARKETS.flatMap((code): AdminPilotAccessRow[] => {
      const pack = byCode.get(code);
      if (!pack) return [];
      const m = memberByCode.get(code);
      return [
        {
          marketPackCode: code,
          nameSv: pack.name_sv,
          nameEn: pack.name_en,
          inPilot: pilotStates.get(code) === "internal_pilot",
          entitlement: m
            ? {
                active: m.revoked_at === null,
                grantedAt: m.granted_at,
                revokedAt: m.revoked_at,
                note: m.note,
              }
            : null,
        },
      ];
    });
  });

/** The refusal codes the RPCs raise by name, surfaced as the message the
 *  route maps to copy. Anything else stays generic, with the real reason in
 *  the server log. */
function rpcRefusal(message: string): string {
  if (message.includes("SP_PILOT_GRANT_REQUIRES_ADMIN")) return "FORBIDDEN_ADMIN_REQUIRED";
  if (message.includes("SP_PILOT_REVOKE_REQUIRES_ADMIN")) return "FORBIDDEN_ADMIN_REQUIRED";
  if (message.includes("SP_PILOT_MARKET_NOT_IN_PILOT")) return "PILOT_MARKET_NOT_IN_PILOT";
  if (message.includes("SP_PILOT_MARKET_UNKNOWN")) return "PILOT_MARKET_UNKNOWN";
  return "PILOT_ACTION_FAILED";
}

const grantSchema = z.object({
  userId: z.string().uuid(),
  marketPackCode: marketSchema,
  // Short and internal. It is stored on the entitlement row as an
  // administrator's own note — never shown to the holder, never a fact
  // about them.
  note: z.string().trim().max(200).optional(),
});

export const adminGrantPassportPilotAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => grantSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    // The caller's OWN session. `auth.uid()` inside the RPC is this
    // administrator, which is what makes `granted_by` true.
    const { error } = await ctx.supabase.rpc("sp_grant_pilot_member", {
      _user_id: data.userId,
      _market_pack_code: data.marketPackCode,
      _note: data.note && data.note.length > 0 ? data.note : undefined,
    });
    if (error) {
      console.error("[admin-passport-pilot] grant refused", error);
      throw new Error(rpcRefusal(String(error.message ?? "")));
    }
    return { ok: true };
  });

const revokeSchema = z.object({
  userId: z.string().uuid(),
  marketPackCode: marketSchema,
});

export const adminRevokePassportPilotAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => revokeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    // Revocation ends the ability to register something NEW in this market.
    // The RPC touches nothing in sp_claims: what the holder already recorded
    // stays theirs, with its own jurisdiction and lifecycle.
    const { error } = await ctx.supabase.rpc("sp_revoke_pilot_member", {
      _user_id: data.userId,
      _market_pack_code: data.marketPackCode,
    });
    if (error) {
      console.error("[admin-passport-pilot] revoke refused", error);
      throw new Error(rpcRefusal(String(error.message ?? "")));
    }
    return { ok: true };
  });
