// The four fields whose change sends an approved organisation back to review,
// and the cache entry that lets the review page say THAT is what happened.
//
// ── THE RULE, AND WHERE IT LIVES ────────────────────────────────────────
//
// employers_validate_before_write() (20270123090000, P1-I) sets an ACTIVE
// organisation back to `pending` when its name, country, registration number or
// website changes -- compared trimmed and case-insensitively, so a cosmetic
// re-type is not a change. Description and logo are profile fields and are not
// reviewed. The database owns the rule. Nothing here enforces it; this file only
// lets the settings page SAY it before the owner presses save (they used to
// discover it afterwards, on a page that thanked them for registering).
//
// The comparison below mirrors the trigger's and is advisory: if it were ever to
// miss a change the database makes, the organisation would still go to review,
// and the review page would still be told so by the SERVER'S answer
// (updateEmployerOrganisation returns the status it found after the write),
// not by this function. Pinned against the migration by
// scripts/employer-access-lifecycle-check.ts.

export const IDENTITY_FIELDS = ["name", "country", "registrationNumber", "website"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export type IdentityValues = Partial<Record<IdentityField, string | null | undefined>>;

/** lower(btrim(coalesce(x, ''))) -- what the trigger compares. */
export function normaliseIdentityValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export type IdentityChange = { field: IdentityField; from: string; to: string };

/** The identity fields whose value differs after normalisation, with the values
 *  as the person typed them. A field absent from `after` is not being changed. */
export function identityChanges(before: IdentityValues, after: IdentityValues): IdentityChange[] {
  const out: IdentityChange[] = [];
  for (const field of IDENTITY_FIELDS) {
    if (after[field] === undefined) continue;
    if (normaliseIdentityValue(before[field]) !== normaliseIdentityValue(after[field])) {
      out.push({ field, from: (before[field] ?? "").trim(), to: (after[field] ?? "").trim() });
    }
  }
  return out;
}

/** Cache-only, like the registration notice: nothing fetches this key, and a
 *  reload legitimately clears it -- at which point the review page falls back to
 *  the neutral wording rather than repeating a claim it can no longer support. */
export const EMPLOYER_IDENTITY_REREVIEW_KEY = ["employer", "identity-rereview"] as const;

export type EmployerIdentityRereview = {
  employerId: string;
};
