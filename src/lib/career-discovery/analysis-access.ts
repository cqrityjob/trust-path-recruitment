// Is the career analysis open to THIS reader right now?
//
// ── ONE RESOLVER, NOT A COPY PER SURFACE ───────────────────────────────
//
// The release control (public.cd_access_policy, migration 20261222090000)
// answers three questions in the database:
//
//   cd_access_state()      internal_test | public | paused   (callable by anon)
//   cd_v31_may_start(uid)  may THIS signed-in person start and save a run
//   lifecycle_status       is the instrument administrable at all
//
// The application reads them through two server functions
// (getV31Availability, getV31TesterStatus). Until this module existed, every
// surface that offered the analysis turned those answers into "open or not"
// itself: the canonical route, My Career, the retake link and the career
// centre each carried their own copy, and four other surfaces carried none at
// all and linked to the route unconditionally. Copies drift, and a drifted
// copy is a door the product then refuses to open.
//
// This is the only place the three answers become a decision. It is pure — no
// server function, no React, no storage — so the route, the hook every other
// surface reads, the guard that runs the matrix and the SQL suite's mirror all
// speak about the same rule.
//
// ── THREE ANSWERS, AND THE THIRD ONE MATTERS ──────────────────────────
//
//   open     offer the action
//   closed   definitely not open to this reader, with the reason to say
//   unknown  not answered yet, or the read failed. A caller KEEPS its action:
//            the route asks again and shows its own honest state, so the link
//            is never a dead end and a failed read is never a closed analysis.
//
// ── WHAT THE UI DOES UNDER `paused`, DELIBERATELY ─────────────────────
//
// `paused` is closed to EVERY reader in the UI, platform administrators
// included, although cd_v31_may_start itself still says yes to an admin. The
// anonymous result build refuses under paused whoever asks, so an admin could
// not finish a run anyway; admins verify under internal_test, where they are
// admitted, before opening to `public`. The database function is unchanged
// and reachable only by a direct call.
//
// Read-only. It decides nothing and grants nothing: the database and
// resolveSaveGate remain the enforcement.

/** The release control's three states. Moved here from
 *  v31-public.functions.ts (which re-exports it) so the pure rule and the
 *  server function name the same type. */
export type V31AccessState = "internal_test" | "public" | "paused";

export function readV31AccessState(value: unknown): V31AccessState {
  // Fails closed: an unknown or missing answer reads as paused, which is what
  // the database function itself returns for a missing policy row.
  return value === "internal_test" || value === "public" ? value : "paused";
}

/** What the unauthenticated availability read says. `accessState` is optional
 *  on purpose: a caller that only knows `available` (a stub, an older
 *  deployment) still gets a decision, and `available` already carries
 *  "paused". */
export interface AnalysisAvailabilityAnswer {
  readonly available: boolean;
  readonly accessState?: V31AccessState;
}

export type AnalysisClosedReason =
  /** The release control says paused: closed for everyone. */
  | "paused"
  /** The instrument is not administrable (lifecycle), or its row is missing. */
  | "unavailable"
  /** internal_test, and this signed-in account is not on the allowlist. */
  | "account";

export type AnalysisOpenBasis =
  /** Signed out: the anonymous entrance, open under internal_test and public. */
  | "anonymous"
  /** Signed in under public: every signed-in account. */
  | "public"
  /** Signed in under internal_test: a tester or a platform administrator. */
  | "allowlisted";

export type AnalysisAccess =
  | { readonly door: "open"; readonly basis: AnalysisOpenBasis }
  | { readonly door: "closed"; readonly reason: AnalysisClosedReason }
  | { readonly door: "unknown" };

export interface AnalysisAccessInput {
  /** The availability read, or null when it did not answer. */
  readonly availability: AnalysisAvailabilityAnswer | null;
  /** Whether there is a session. */
  readonly signedIn: boolean;
  /** cd_v31_may_start's answer for the signed-in account: true, false, or null
   *  when it was not asked (signed out) or did not answer (a read failure). */
  readonly mayStart: boolean | null;
}

export function resolveAnalysisAccess(input: AnalysisAccessInput): AnalysisAccess {
  const { availability, signedIn, mayStart } = input;
  if (!availability) return { door: "unknown" };

  // The release control closes the product for everyone, the anonymous
  // entrance included. `available` already folds this in on the server; the
  // explicit test keeps the REASON honest when it is the cause.
  if (availability.accessState === "paused") return { door: "closed", reason: "paused" };
  if (!availability.available) return { door: "closed", reason: "unavailable" };

  // Signed out: the anonymous entrance. Open under internal_test and public;
  // what the visitor may do with the result is decided at the save, by the
  // claim, not here.
  if (!signedIn) return { door: "open", basis: "anonymous" };

  // Signed in: the database's own answer, never a copy of it.
  if (mayStart === null) return { door: "unknown" };
  if (!mayStart) return { door: "closed", reason: "account" };
  return {
    door: "open",
    basis: availability.accessState === "public" ? "public" : "allowlisted",
  };
}

/** The three-valued answer every surface that only needs "offer it or not"
 *  reads: true = offer, false = withdraw, undefined = not answered, keep. */
export function analysisOpenFlag(access: AnalysisAccess | undefined): boolean | undefined {
  if (!access || access.door === "unknown") return undefined;
  return access.door === "open";
}

/** Whether the person may be sent to the canonical route from a link. The
 *  same flag, named for the question a link asks: anything but a definite
 *  "closed" keeps the link. */
export function keepsAnalysisLink(access: AnalysisAccess | undefined): boolean {
  return analysisOpenFlag(access) !== false;
}

/** The server's answer for the signed-in gate, as the resolver wants it.
 *  `answered: false` is a read that failed; it must become `null`, never
 *  `false`, or a database hiccup reads as "this account may not start". */
export function mayStartFrom(
  status: { readonly allowed: boolean; readonly answered?: boolean } | null | undefined,
): boolean | null {
  if (!status) return null;
  if (status.answered === false) return null;
  return Boolean(status.allowed);
}

/** How the indexing decision follows the access state: only `public` is
 *  indexable, and only when the instrument is administrable. Anything else,
 *  including an unreadable state, is not. */
export function analysisIndexable(
  availability: AnalysisAvailabilityAnswer | null | undefined,
): boolean {
  return Boolean(availability && availability.available && availability.accessState === "public");
}

/** The robots rule for the canonical route. One value per decision, so the
 *  route's head and the guard read the same strings. */
export const ANALYSIS_ROBOTS_INDEXABLE = "index, follow";
export const ANALYSIS_ROBOTS_BLOCKED = "noindex, nofollow";

export function analysisRobots(indexable: boolean): string {
  return indexable ? ANALYSIS_ROBOTS_INDEXABLE : ANALYSIS_ROBOTS_BLOCKED;
}
