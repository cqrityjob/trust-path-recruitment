// The holder's name, as the holder wrote it.
//
// ── WHY TWO COLUMNS, AND WHICH ONE WINS ─────────────────────────────────
//
// `profiles.display_name` is the ACCOUNT name: set once at registration from
// the sign-up metadata or the e-mail's local part, and editable nowhere in the
// application. `sp_passport_profiles.display_name` is the PASSPORT name: the
// "Namn som visas" field on the profile page, saved by `savePassportBasics`,
// and the name every public share, page and image is built from.
//
// The Passport card, the profile header and the international overview read
// the account column, so a holder who had corrected their name on the profile
// page kept seeing the registration name on their own card and in their
// initials, with no way to change it. The owner found it on the first live
// Passport: "Mos Als" on the card, "Mostafa Alshawi" on the share.
//
// One rule, in one place: the Passport name wins; the account name is the
// reserve when the Passport name is missing, empty or only whitespace. Nothing
// here changes what a share shows (that is decided in the database, from the
// Passport column and the holder's privacy setting) and nothing here writes.
//
// This module is the pure rule, importable from any tier. The database read
// that applies it is holder-display-name.server.ts (the server tier, as
// scripts/passport-separation-check.ts requires).

/** The Passport name when it has any non-blank content, else the account
 *  name on the same terms, else null. Both inputs are trimmed. */
export function resolveHolderDisplayName(
  passportName: string | null | undefined,
  accountName: string | null | undefined,
): string | null {
  const passport = passportName?.trim();
  if (passport) return passport;
  const account = accountName?.trim();
  return account || null;
}
