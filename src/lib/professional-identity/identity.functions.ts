// The Professional Identity seam — where one person's products are read
// together, and the only place that happens.
//
// ── WHY A SEAM AND NOT A JOIN ──────────────────────────────────────────
//
// The products this reads are separated on purpose, and two of those
// separations are enforced by CI: Career Discovery may not import the
// Passport (scripts/passport-separation-check.ts), and the Security
// Competency Platform shares nothing with Career Guidance. Those boundaries
// are correct and this file does not weaken them — it sits ABOVE all of
// them, reads each through its own owner's rules, and hands the result to
// pure functions that have no idea any of these systems exist.
//
// `career-journey/career-journey.functions.ts` established this pattern for
// the Career Journey. This is the same shape for the personal home and the
// CV builder.
//
// ── WITH WHOSE AUTHORITY ───────────────────────────────────────────────
//
// Every read goes through the caller's own RLS-scoped client. There is no
// service role here, no admin client, and no parameter naming another
// person: the handler takes no input at all, so there is nothing to
// tamper with. A caller who wanted somebody else's identity would have to
// defeat row-level security, and hiding this function would not help them.
//
// ── WHAT IT WRITES ─────────────────────────────────────────────────────
//
// Nothing. Not one statement in this file is an INSERT, UPDATE or DELETE.
// Reading five products together must never be a way to change one of them.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  IdentityClaim,
  IdentityEmployment,
  IdentityFactGroup,
  ProfessionalIdentityV1,
} from "./types";
import type { CurrentStatus, YearsOfExperience } from "@/lib/security-career-profile/types";

/** The generated `Database` type does not describe every table reached here,
 *  and the codebase's established answer to that is one declared alias with
 *  one suppression rather than a cast at each call site. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScopedClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Read the whole identity.
 *
 * Every query is independent and every one of them has a safe empty
 * fallback. That is deliberate: this object drives the home screen, and a
 * single failing read must degrade one section rather than blank the page a
 * person just signed in to see.
 *
 * ── ABSENT AND UNREADABLE ARE NOT THE SAME ANSWER ──────────────────────
 *
 * What the fallbacks may NOT do is make those two look alike. A missing
 * Passport and a failed `sp_claims` read both produce an empty array, and
 * the screen printed "0 verifierade" for both — telling a holder with four
 * verified credentials that they have none. So each read's failure is
 * recorded in `unavailable`, the empty fallback stays, and the surfaces
 * decide what to show instead of a number. One broken read still costs one
 * section rather than the page.
 *
 * ── EVERY READ NAMES THE CALLER ────────────────────────────────────────
 *
 * RLS is the boundary and remains mandatory. It is not, however, the only
 * thing standing between one person's dashboard and another person's rows:
 * `job_applications` is SELECT-able by employer members for their own
 * vacancies, so an unfiltered `count` returned the applications this person
 * can SEE rather than the ones they SENT. For an employer's recruiter who is
 * also a candidate those are different numbers, and the dashboard showed the
 * larger one as their own job search. Every user-owned read below therefore
 * carries its own `user = me` predicate, RLS underneath it.
 */
export async function readProfessionalIdentity(
  supabase: ScopedClient,
  userId: string,
): Promise<ProfessionalIdentityV1> {
  const [
    account,
    career,
    passport,
    experience,
    claims,
    snapshot,
    applications,
    assignments,
    history,
    memberships,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, country, locale")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("security_career_profiles")
      .select(
        "current_status, current_profession_slug, current_profession_other, years_of_experience",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("sp_passport_profiles")
      .select("headline, jurisdiction_code, sub_jurisdiction_code")
      .eq("holder_user_id", userId)
      .maybeSingle(),
    supabase
      .from("sp_experience_periods")
      .select(
        "id, employer_name, role_title, started_on, ended_on, employment_type, jurisdiction_code, assertion_level",
      )
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "active")
      .order("started_on", { ascending: false }),
    supabase
      .from("sp_claims")
      .select(
        "id, claim_type, title, claimed_issuer_name, issued_on, valid_until, skill_level, assertion_level, lifecycle_state",
      )
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "active"),
    // Newest report only. The dashboard shows one; a history page reads
    // its own list.
    //
    // The embedded session is not decoration and not a join for data: it
    // is the RLS predicate written out. `cd own snapshots select` admits a
    // snapshot whose `cd_sessions.user_id = auth.uid()`, and `!inner` plus
    // the same equality states that here, so the read is correct on its own
    // terms rather than only because the database refused the alternative.
    supabase
      .from("cd_report_snapshots")
      .select("id, generated_at, dna_scores, cd_sessions!inner(user_id)")
      .eq("cd_sessions.user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // THE candidate-state read that RLS alone gets wrong. See the note on
    // this function: employer members may SELECT applications to their own
    // vacancies, so "how many applications are there" and "how many did I
    // send" are different questions, and only the second one belongs on a
    // person's own career page.
    supabase
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("applicant_user_id", userId),
    supabase.rpc("scp_my_academy_assignments"),
    supabase.rpc("scp_my_assessment_history"),
    supabase
      .from("employer_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active")
      .is("removed_at", null),
  ]);

  const accountRow = (account?.data ?? null) as Row | null;
  const careerRow = (career?.data ?? null) as Row | null;
  const passportRow = (passport?.data ?? null) as Row | null;

  // Which reads did not answer. PostgREST reports failure in `error` rather
  // than by throwing, so an unrecorded failure is indistinguishable from an
  // empty table — which is the whole defect. A read that came back `undefined`
  // (a rejected member of the Promise.all shape) counts as failed too.
  const unavailable: IdentityFactGroup[] = [];
  const note = (group: IdentityFactGroup, result: { error?: unknown } | undefined) => {
    if ((!result || result.error) && !unavailable.includes(group)) unavailable.push(group);
  };
  note("account", account);
  note("profile", career);
  note("passport", passport);
  note("employment", experience);
  note("claims", claims);
  note("discovery", snapshot);
  note("applications", applications);
  note("assessments", assignments);
  note("assessments", history);
  note("memberships", memberships);

  // The profession's published title, from the SAME catalogue the picker
  // offers. Sequential rather than part of the Promise.all above because it
  // depends on the slug that read returns, and a second round trip is the
  // honest cost of not keeping a second profession dictionary in the client.
  //
  // Its failure is deliberately NOT recorded as an unavailable group: the
  // profile itself was read, and `professionLabel` already refuses to print a
  // slug when no title resolved. A catalogue outage costs the word, not the
  // section.
  const professionSlug = (careerRow?.current_profession_slug as string | null) ?? null;
  let professionTitleSv: string | null = null;
  let professionTitleEn: string | null = null;
  if (professionSlug) {
    const cig = await supabase
      .from("cig_professions")
      .select("title_sv, title_en")
      .eq("slug", professionSlug)
      .eq("content_status", "published")
      .maybeSingle();
    const row = (cig?.data ?? null) as Row | null;
    professionTitleSv = (row?.title_sv as string | null) ?? null;
    professionTitleEn = (row?.title_en as string | null) ?? null;
  }

  const employment: IdentityEmployment[] = ((experience?.data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    employerName: String(r.employer_name ?? ""),
    roleTitle: String(r.role_title ?? ""),
    startedOn: String(r.started_on ?? ""),
    endedOn: (r.ended_on as string | null) ?? null,
    employmentType: String(r.employment_type ?? ""),
    jurisdictionCode: String(r.jurisdiction_code ?? ""),
    assertionLevel: String(r.assertion_level ?? "self_declared"),
  }));

  const claimList: IdentityClaim[] = ((claims?.data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    claimType: String(r.claim_type ?? ""),
    title: String(r.title ?? ""),
    issuerName: (r.claimed_issuer_name as string | null) ?? null,
    issuedOn: (r.issued_on as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    skillLevel: (r.skill_level as string | null) ?? null,
    assertionLevel: String(r.assertion_level ?? "self_declared"),
    lifecycleState: String(r.lifecycle_state ?? "active"),
  }));

  // "Does the report NAME careers" is read from the stored payload, not
  // inferred from the report existing. The two differ for a genuinely
  // balanced profile, and offering a Career Card built on nothing is a door
  // onto an empty room — the report view applies exactly this condition
  // before it offers the card, and this must agree with it.
  const snapshotRow = (snapshot?.data ?? null) as Row | null;
  const storedReport = (snapshotRow?.dna_scores as { report?: Row } | null)?.report ?? null;
  const rankedCount = Array.isArray(storedReport?.professions?.ranked)
    ? storedReport!.professions.ranked.length
    : 0;

  // A report is "released" to this person when the platform recorded a
  // release date. Anything else is somebody else's work in progress.
  const historyRows = ((history?.data ?? []) as Row[]).filter((r) => Boolean(r.released_at));
  const releasedReportCount = historyRows.length;

  // WHICH released report to open, when the answer is unambiguous.
  //
  // The condition is copied from ParticipantAssessmentHistory, deliberately
  // and exactly: a report is offered only when the lifecycle says the result
  // is available AND a participant snapshot exists. That is the server
  // deciding there is something to read — never this seam inferring a
  // document from a date. Newest first, because a released report is read in
  // the order it arrived.
  //
  // Null when nothing qualifies, which routes to the assessments area rather
  // than to a document that may not render.
  const readable = historyRows
    .filter(
      (r) => String(r.lifecycle_state) === "result_available" && Boolean(r.participant_snapshot_id),
    )
    .sort((a, b) => String(b.released_at ?? "").localeCompare(String(a.released_at ?? "")));
  const releasedReportAttemptId = readable[0]?.attempt_id ? String(readable[0].attempt_id) : null;

  // Assessment work that is genuinely waiting for THIS person. A submitted
  // attempt awaiting review asks nothing of them, and counting it would put
  // a number next to an action they cannot take — the same rule the header
  // badge already follows.
  const openAssignments = ((assignments?.data ?? []) as Row[]).filter(
    (r) => String(r.mode) === "assessment" && String(r.attempt_status) === "in_progress",
  ).length;

  return {
    identityVersion: "professional-identity-v1",

    displayName: (accountRow?.display_name as string | null) ?? null,
    accountCountry: (accountRow?.country as string | null) ?? null,
    locale: (accountRow?.locale as string | null) ?? "sv",

    currentStatus: (careerRow?.current_status as CurrentStatus | null) ?? null,
    currentProfessionSlug: professionSlug,
    currentProfessionOther: (careerRow?.current_profession_other as string | null) ?? null,
    currentProfessionTitleSv: professionTitleSv,
    currentProfessionTitleEn: professionTitleEn,
    yearsOfExperience: (careerRow?.years_of_experience as YearsOfExperience | null) ?? null,

    hasPassport: Boolean(passportRow),
    headline: (passportRow?.headline as string | null) ?? null,
    workCountry: (passportRow?.jurisdiction_code as string | null) ?? null,
    workSubJurisdiction: (passportRow?.sub_jurisdiction_code as string | null) ?? null,

    employment,
    claims: claimList,
    discovery: {
      hasCompletedReport: Boolean(snapshotRow?.id),
      snapshotId: (snapshotRow?.id as string | null) ?? null,
      generatedAt: (snapshotRow?.generated_at as string | null) ?? null,
      namesCareers: rankedCount > 0,
    },
    workload: {
      applicationCount: applications?.count ?? 0,
      assessmentAssignmentCount: openAssignments,
      releasedReportCount,
      releasedReportAttemptId,
      employerWorkspaceCount: memberships?.count ?? 0,
    },
    unavailable,
  };
}

/** The client-callable form. */
export const getMyProfessionalIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfessionalIdentityV1> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
    return readProfessionalIdentity(supabase, userId);
  });
