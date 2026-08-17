// Security Passport — the holder's sharing centre, server side.
//
// The holder controls WHETHER to share, WHICH package, TO WHOM, FOR HOW
// LONG, and whether to revoke. The holder does not control what a package
// contains: `sp_get_disclosure` assembles the payload from the package code
// on the server, so a recipient cannot receive more than the package allows
// however the request is crafted, and no full profile is ever sent to a
// browser to be filtered visually.
//
// The plaintext token exists exactly once, in the response to
// `createDisclosure`. Only its SHA-256 is stored, so a leaked database
// backup does not hand over live share links — and neither this application
// nor CQrityjob can recover a link after the holder closes the page. That is
// a deliberate trade: a lost link is re-created, a recoverable link is a
// standing liability.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orNull } from "./rpc";
import { DISCLOSURE_PACKAGE_CODES, type DisclosurePackageCode } from "./packages";

export interface DisclosureRecord {
  readonly id: string;
  readonly packageCode: DisclosurePackageCode;
  readonly purpose: string | null;
  readonly recipientHint: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly accessCount: number;
  /** Derived, not stored: a share is active until it is revoked or its
   *  expiry passes. Computed on the server so the three states cannot
   *  disagree between the list and the recipient page. */
  readonly state: "active" | "expired" | "revoked";
}

type DisclosureRow = {
  id: string;
  package_code: string;
  purpose: string | null;
  recipient_hint: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  access_count: number;
};

function toDisclosure(row: DisclosureRow): DisclosureRecord {
  const state: DisclosureRecord["state"] = row.revoked_at
    ? "revoked"
    : row.expires_at && new Date(row.expires_at).getTime() < Date.now()
      ? "expired"
      : "active";
  return {
    id: row.id,
    packageCode: row.package_code as DisclosurePackageCode,
    purpose: row.purpose,
    recipientHint: row.recipient_hint,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    accessCount: row.access_count,
    state,
  };
}

export const listMyDisclosures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly DisclosureRecord[]> => {
    const { supabase, userId } = context;
    // `token_hash` is deliberately not selected. It is of no use to the
    // holder and there is no reason for it to leave the database.
    const { data, error } = await supabase
      .from("sp_disclosures")
      .select(
        "id, package_code, purpose, recipient_hint, created_at, expires_at, revoked_at, access_count",
      )
      .eq("holder_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as DisclosureRow[]).map(toDisclosure);
  });

const createInput = z.object({
  packageCode: z.enum(DISCLOSURE_PACKAGE_CODES),
  /** Null means no expiry. The UI defaults to 30 days rather than never. */
  expiresDays: z.number().int().min(1).max(365).nullable(),
  purpose: z.string().max(200).nullable(),
  recipientHint: z.string().max(200).nullable(),
});

export const createDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createInput.parse(data))
  .handler(async ({ context, data }): Promise<{ token: string }> => {
    const { data: token, error } = await context.supabase.rpc("sp_create_disclosure", {
      _package_code: data.packageCode,
      _expires_days: orNull(data.expiresDays),
      _purpose: orNull(data.purpose),
      _recipient_hint: orNull(data.recipientHint),
    });
    if (error) throw new Error(error.message);
    return { token: token as unknown as string };
  });

export const revokeDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ disclosureId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_revoke_disclosure", {
      _id: data.disclosureId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
