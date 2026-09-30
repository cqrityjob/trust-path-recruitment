// Durable abuse limits for the public /contact form.
//
// ── WHY THE DATABASE, NOT MEMORY ───────────────────────────────────────
//
// The form is anonymous and makes the mail provider send: to CQrityjob's
// inbox, and an acknowledgement to the address typed in. In-memory counters
// live per server isolate and reset on every cold start, so on edge hosting
// they bound nothing. This reuses the existing throttle function,
// `sp_throttle_public_access` (service_role only, fixed windows, rows pruned
// after a day), under its own `contact-*` key namespace. No new table,
// migration, vendor or secret.
//
// Two buckets, both must allow:
//
//   * per client address — a handful of enquiries per hour from one client;
//   * per recipient address — how many acknowledgements any one mailbox can
//     be sent per day, so the form cannot be used to mail-bomb a stranger.
//
// Only a salted SHA-256 prefix of each key reaches the database: never the
// IP address, never the e-mail address, never the enquiry text.
//
// If the throttle cannot be reached the caller falls back to its in-memory
// limits rather than closing the form: a database hiccup should not stop a
// real customer from reaching CQrityjob.

const PER_CLIENT_LIMIT = 5;
const PER_CLIENT_WINDOW_SECONDS = 60 * 60;
const PER_RECIPIENT_LIMIT = 3;
const PER_RECIPIENT_WINDOW_SECONDS = 24 * 60 * 60;

async function bucket(kind: "contact-ip" | "contact-to", value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${kind}:${day}:${value}`).digest("hex").slice(0, 32);
}

async function take(
  kind: "contact-ip" | "contact-to",
  value: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc(
    "sp_throttle_public_access" as never,
    {
      _client_hash: await bucket(kind, value),
      _limit: limit,
      _window_seconds: windowSeconds,
    } as never,
  );
  if (error || typeof data !== "boolean") return null;
  return data;
}

/** `true` allowed, `false` refused, `null` throttle unavailable. */
export async function takeEnquiryAllowance(
  clientHint: string,
  email: string,
): Promise<boolean | null> {
  try {
    const client = await take(
      "contact-ip",
      clientHint,
      PER_CLIENT_LIMIT,
      PER_CLIENT_WINDOW_SECONDS,
    );
    if (client !== true) return client;
    return await take(
      "contact-to",
      email.trim().toLowerCase(),
      PER_RECIPIENT_LIMIT,
      PER_RECIPIENT_WINDOW_SECONDS,
    );
  } catch {
    return null;
  }
}
