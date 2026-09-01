// The Passport's contribution to Career Readiness: two counts and a
// boolean.
//
// ── WHY THIS IS ITS OWN FUNCTION AND NOT A FIELD ON getMyPassport ──────
//
// getMyPassport returns a holder's whole Passport — profiles, claims,
// periods, credential availability. The Career Journey needs to know
// whether verified evidence EXISTS. Handing the journey the whole Passport
// so it could count two things itself would put every credential title,
// issuer and reference number on a code path whose job is to render a
// career report, and the next person to add a field there would not know
// they had widened anything.
//
// So the narrowing happens here, in the Passport, where it can be reviewed:
// this function cannot return a title even by accident, because it never
// selects one. It is modelled directly on getApplicationPassportOffer,
// which made the same argument for the application form, with one
// difference — that one returns credential NAMES because the holder is
// about to decide what to share. Nobody is sharing anything here, so this
// one returns none.
//
// ── WHAT THE JOURNEY MAY DO WITH IT ───────────────────────────────────
//
// Set a provenance label, and lift a "formal pathway required" headline it
// would otherwise have to state. It may not raise a readiness category, and
// it may never reach an employer surface: this is a candidate-facing read
// of the candidate's own Passport, through the holder's own RLS-scoped
// client, and it creates no disclosure of any kind.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PassportEvidenceProvenance {
  readonly hasPassport: boolean;
  readonly verifiedCredentialCount: number;
  readonly verifiedExperienceCount: number;
  /** Employment periods on record at any assertion level. The Journey uses
   *  it to answer "do we know anything about this person's working life",
   *  never to place them on a career ladder — see JourneyEvidenceInput. */
  readonly recordedExperienceCount: number;
  /** Whether the holder has stated a work country. Presence only: the code
   *  itself never leaves the Passport through this function. */
  readonly hasWorkCountry: boolean;
}

const NONE: PassportEvidenceProvenance = {
  hasPassport: false,
  verifiedCredentialCount: 0,
  verifiedExperienceCount: 0,
  recordedExperienceCount: 0,
  hasWorkCountry: false,
};

/**
 * The read itself, as a plain helper over a caller-supplied client.
 *
 * Same shape as security-career-profile/snapshot.ts's
 * readSecurityCareerProfileSnapshot, and for the same reason: the Career
 * Journey composes this with three other reads inside ONE server function
 * and one request context. Invoking a second createServerFn from inside the
 * first would re-enter the auth middleware with no request to authenticate.
 * The client is always the caller's own, RLS-scoped one.
 */
export async function readPassportEvidenceProvenance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<PassportEvidenceProvenance> {
  const [profileRes, claimRes, expRes, recordedExpRes] = await Promise.all([
    supabase
      .from("sp_passport_profiles")
      // `jurisdiction_code` is read as a PRESENCE test and nothing else. The
      // value is not returned by this function and no caller can reach it;
      // the Passport's own surfaces render the work location, with the
      // sub-jurisdiction attached, because a Dubai holder is not a UAE-wide
      // one and only `formatWorkLocation` keeps that true.
      .select("holder_user_id, jurisdiction_code")
      .eq("holder_user_id", userId)
      .maybeSingle(),
    supabase
      .from("sp_claims")
      .select("id", { count: "exact", head: true })
      .eq("holder_user_id", userId)
      .eq("assertion_level", "verified")
      .eq("lifecycle_state", "active"),
    supabase
      .from("sp_experience_periods")
      .select("id", { count: "exact", head: true })
      .eq("holder_user_id", userId)
      .eq("assertion_level", "verified")
      .eq("lifecycle_state", "active"),
    // Every active period, at any assertion level. Deliberately separate
    // from the verified count above rather than replacing it: they answer
    // different questions and the Journey is allowed to do different things
    // with them.
    supabase
      .from("sp_experience_periods")
      .select("id", { count: "exact", head: true })
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "active"),
  ]);

  // A Passport read failure must never break a career report. The journey
  // then reads as self-reported only, which is TRUE — it is what the
  // journey would have said for a holder with no verified evidence — so
  // the degraded state cannot make a claim the full state would not.
  if (profileRes.error || claimRes.error || expRes.error || recordedExpRes.error) {
    console.error("[passport] journey evidence read failed", {
      profile: profileRes.error?.message,
      claims: claimRes.error?.message,
      experience: expRes.error?.message,
      recordedExperience: recordedExpRes.error?.message,
    });
    return NONE;
  }

  return {
    hasPassport: profileRes.data !== null,
    verifiedCredentialCount: claimRes.count ?? 0,
    verifiedExperienceCount: expRes.count ?? 0,
    recordedExperienceCount: recordedExpRes.count ?? 0,
    hasWorkCountry: typeof profileRes.data?.jurisdiction_code === "string",
  };
}

/** The client-callable form, for any surface that needs the provenance on
 *  its own rather than folded into a journey. */
export const getMyPassportEvidenceProvenance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PassportEvidenceProvenance> => {
    const { supabase, userId } = context;
    return readPassportEvidenceProvenance(supabase, userId);
  });
