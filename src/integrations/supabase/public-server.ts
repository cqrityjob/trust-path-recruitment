// Sprint 09C — Server-side publishable Supabase client for public reads.
//
// Use for: server functions / server routes that read `content_status='published'`
// rows behind narrow `TO anon` SELECT policies. NEVER for user-owned data
// (use `requireSupabaseAuth`) or admin writes (use `supabaseAdmin`).
//
// Handles the opaque `sb_publishable_*` key: PostgREST expects a JWT in
// `Authorization: Bearer`, so we strip the header the JS client would otherwise
// send and pass the key only via `apikey`.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function serverPublicClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "serverPublicClient(): missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}