// The organisation-registration intent, as it survives authentication.
//
// ── WHY THIS IS A MODULE AND NOT AN INLINE READ ────────────────────────
//
// Somebody ticks "I am creating this account for an organisation" and types
// a company name. At that instant there is no session — the address is
// unverified — so nothing can be written under their identity. The two
// strings travel in Supabase auth user metadata, which is the only place
// that outlives an unauthenticated form submission.
//
// Two callers then have to agree, exactly, on what "this person registered
// on behalf of an organisation" means: the client, deciding whether to run
// the provisioning call at all, and `ensureMyEmployerCompanyFromSignup` on
// the server, deciding whether there is a company to create. When that
// predicate was written twice it drifted — the server required BOTH name
// and country, the comment describing the client half said "a company
// name". A single exported function is the fix.
//
// ── IT GRANTS NOTHING, AND THAT IS LOAD-BEARING ────────────────────────
//
// User metadata is writable by the user it belongs to. That is true of
// Supabase generally and is not a hole this module opens: a person could
// always set `company_name` on themselves through the auth API. What the
// value buys is a call to `create_my_employer_company`, which every
// authenticated user may already call directly, and which creates the
// organisation as `pending` with the caller as its owner. So the worst a
// forged intent achieves is the same organisation the onboarding form
// would have created, in the same status, awaiting the same approval.
//
// Permission is derived from `employer_memberships` server-side, always.
// This is a routing and provisioning hint and must never be read as more.

/** The two strings registration carries into user metadata. */
export type EmployerSignupIntent = {
  readonly companyName: string;
  readonly companyCountry: string;
};

/** The metadata keys. Exported so the guard script asserts against the same
 *  literals the server function reads, rather than a copy of them. */
export const EMPLOYER_SIGNUP_NAME_KEY = "company_name";
export const EMPLOYER_SIGNUP_COUNTRY_KEY = "company_country";

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The intent held in a user's auth metadata, or null when there is none.
 *
 * Requires BOTH values, matching `ensureMyEmployerCompanyFromSignup`
 * exactly: `create_my_employer_company` rejects an empty country, so a name
 * on its own is not an intent that can be acted on — treating it as one
 * would produce a provisioning attempt that can only fail.
 *
 * Accepts the raw metadata bag rather than a Supabase `User` so it stays a
 * pure function with no dependency on the auth client, and can be proven
 * over hand-written objects in the guard script.
 */
export function readEmployerSignupIntent(
  metadata: Record<string, unknown> | null | undefined,
): EmployerSignupIntent | null {
  if (!metadata) return null;
  const companyName = trimmedString(metadata[EMPLOYER_SIGNUP_NAME_KEY]);
  const companyCountry = trimmedString(metadata[EMPLOYER_SIGNUP_COUNTRY_KEY]);
  if (!companyName || !companyCountry) return null;
  return { companyName, companyCountry };
}

/** Whether this metadata bag carries an actionable organisation intent. */
export function hasEmployerSignupIntent(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return readEmployerSignupIntent(metadata) !== null;
}
