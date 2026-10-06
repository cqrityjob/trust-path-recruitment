// The holder's name, read from both columns and resolved by the one rule in
// holder-display-name.ts. Server tier only: the callers are the Passport's
// identity reader, the professional-identity seam's neighbour and the
// international metadata function, each through the caller's own client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveHolderDisplayName } from "./holder-display-name";

export interface HolderDisplayNameRead {
  /** The resolved name, or null when neither column has one. */
  readonly name: string | null;
  /** True when either read failed: the caller decides whether that is fatal
   *  (the Passport's own identity) or tolerable (a consistency hint). */
  readonly failed: boolean;
}

/** Both columns, through the caller's own client (row-level security applies
 *  as before: a holder reads their own rows and nobody else's). */
export async function readHolderDisplayName(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<HolderDisplayNameRead> {
  const [passport, account] = await Promise.all([
    db
      .from("sp_passport_profiles")
      .select("display_name")
      .eq("holder_user_id", userId)
      .maybeSingle(),
    db.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  return {
    name: resolveHolderDisplayName(
      passport.error ? null : passport.data?.display_name,
      account.error ? null : account.data?.display_name,
    ),
    failed: Boolean(passport.error || account.error),
  };
}
