// Whether a registration was started from the employer entrance.
//
// ── THE DEFECT THIS CLOSES, WHICH IS THE WHOLE REGISTRATION ────────────
//
// "Registrera företag" on / and on /employers both navigate to
// `/signup?redirect=/employer`. The organisation section of the registration
// form was a collapsed, unticked checkbox regardless — so somebody who
// pressed a button that says "register your company" was shown a personal
// account form, typed a name, an address and a password, and created a
// CANDIDATE account.
//
// Nothing downstream could recover from that. No company name was collected,
// so no organisation intent existed in user metadata, so
// `ensureMyEmployerCompanyFromSignup` answered `no_company_in_signup`, so no
// `employers` row was ever created — and the administrator's moderation queue
// stayed empty because there was genuinely nothing in it to show.
//
// The live database says exactly this: the most recent account created on the
// hosted project carries no `company_name` and holds no employer membership,
// and no `employers` row has been created since the August UAT.
//
// ── WHY THIS IS ITS OWN MODULE ─────────────────────────────────────────
//
// The same reason employer-signup-intent.ts is: it is a predicate that two
// things have to agree about — the form that pre-selects the section, and the
// guard that proves it does — and a predicate written twice drifts. It is
// pure, it takes a query string rather than reading `window`, and it can
// therefore be proved over hand-written inputs.
//
// ── IT GRANTS NOTHING ──────────────────────────────────────────────────
//
// It ticks a checkbox the person can untick, and opens two fields they must
// fill in themselves. Every permission is still derived from
// `employer_memberships` server-side, and the organisation this eventually
// produces is created `pending` and awaits the same human approval as any
// other. It is a form default, not an authorisation.

import { safeReturnPath } from "./safe-redirect";

/**
 * True when this registration should open the organisation section.
 *
 * Reads the ALREADY VALIDATED return path rather than a second, unvalidated
 * `intent` parameter of the kind `legacy-entry.ts` deliberately stopped
 * carrying: `safeReturnPath` refuses an absolute URL, a protocol-relative
 * one, a smuggled line break and any path back into an auth surface, so a
 * value that survives it is a path this application itself owns.
 *
 * `/employer/join` is deliberately excluded. That destination is an
 * invitation to an organisation that ALREADY EXISTS, and pre-selecting
 * "I am creating this account for an organisation" there would invite a
 * colleague to register a second company with the same name — which
 * `create_my_employer_company`'s duplicate detection refuses, after asking
 * them for details they should never have been asked for.
 *
 * Sign-in is always false: there is no organisation section on that form, and
 * a person who already has an account already has whatever memberships they
 * have.
 */
export function registrationTargetsOrganisation(search: string, isSignup: boolean): boolean {
  if (!isSignup) return false;
  const requested = safeReturnPath(new URLSearchParams(search).get("redirect"), "");
  if (!requested) return false;
  const path = requested.split(/[?#]/)[0];
  if (path === "/employer/join" || path.startsWith("/employer/join/")) return false;
  return path === "/employer" || path.startsWith("/employer/");
}
