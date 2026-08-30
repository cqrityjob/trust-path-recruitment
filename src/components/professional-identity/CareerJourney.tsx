// The career journey — where this person stands, across the five stages the
// product actually has.
//
// ── WHY THIS IS NOT AN ONBOARDING WIZARD ───────────────────────────────
//
// A career does not complete. There is no final step here, no percentage
// across the row, no "4 of 5 done" and no lock on a later stage: somebody
// who has been in the industry for twenty years may open Career Discovery
// last, or never, and a strip that scored them 20% for it would be wrong
// about them rather than informative.
//
// So each stage states ONE fact about the account, in words, and offers the
// place that fact lives. That is all. The ordering is the product's
// narrative — Discover, Profile, Verify, Grow, Work — not a sequence
// anybody is required to walk.
//
// ── EVERY FIGURE IS ALREADY OWNED SOMEWHERE ────────────────────────────
//
// Nothing here is computed for this strip. Completeness comes from the
// governed `completeness.ts`; verified and pending come from the single
// `isVerifiedClaim` / `isPendingClaim` definitions the Passport uses; the
// workload counts come from the identity seam, which scopes applications to
// the person rather than to the vacancies an employer member can see. This
// component reads them and writes sentences.
//
// ── AND A READ THAT DID NOT ANSWER SAYS SO ─────────────────────────────
//
// `isUnavailable` is asked before every stage. "0 verified" and "we could
// not read your Passport" are different sentences about somebody's
// professional standing, and this strip is exactly the kind of compact
// summary where the second quietly becomes the first.

import { Link } from "@tanstack/react-router";
import { Briefcase, Compass, GraduationCap, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { computeProfileCompleteness } from "@/lib/professional-identity/completeness";
import {
  isPendingClaim,
  isUnavailable,
  isVerifiedClaim,
  type IdentityFactGroup,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";
import { c, L, Lf, type Copy, type Lang } from "./copy";

const COPY = {
  heading: c("Din karriärresa", "Your career journey"),
  lede: c(
    "Var du står i dag. Ingen av delarna är obligatorisk och ingen av dem tar slut.",
    "Where you stand today. None of these are required, and none of them ever finish.",
  ),
  unreadable: c("Kunde inte läsas", "Could not be read"),

  discover: c("Utforska", "Discover"),
  discoverDone: c("Karriärutforskning genomförd", "Career Discovery completed"),
  discoverNone: c("Inte genomförd ännu", "Not taken yet"),

  profile: c("Profil", "Profile"),
  profileState: c("{0} % ifyllt", "{0} % filled in"),

  verify: c("Verifiera", "Verify"),
  verifyState: c("{0} verifierade", "{0} verified"),
  verifyPending: c("{0} väntar på granskning", "{0} awaiting review"),
  verifyNone: c("Passet är inte öppnat", "Passport not opened"),

  grow: c("Utveckla", "Grow"),
  growAssigned: c("{0} bedömning tilldelad", "{0} assessment assigned"),
  growAssignedMany: c("{0} bedömningar tilldelade", "{0} assessments assigned"),
  growReleased: c("{0} rapport släppt till dig", "{0} report released to you"),
  growReleasedMany: c("{0} rapporter släppta till dig", "{0} reports released to you"),
  growNone: c("Inget pågående just nu", "Nothing in progress"),

  work: c("Arbeta", "Work"),
  workState: c("{0} ansökningar skickade", "{0} applications sent"),
  workOne: c("1 ansökan skickad", "1 application sent"),
  workNone: c("Inga ansökningar ännu", "No applications yet"),
} as const;

/** One stage. `state` is always a sentence, never a bare number and never a
 *  colour on its own — nothing here depends on seeing hue. */
interface Stage {
  readonly key: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly state: string;
  readonly href: string;
  /** Whether this stage has something recorded. Drives a quiet emphasis only;
   *  it is never summed into a score across the row. */
  readonly active: boolean;
  /** The read behind this stage did not answer. */
  readonly unknown: boolean;
}

export function CareerJourney({
  identity,
  className,
}: {
  identity: ProfessionalIdentityV1;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const known = (group: IdentityFactGroup) => !isUnavailable(identity, group);
  const say = (v: Copy) => L(v, l);
  const sayf = (v: Copy, n: string | number) => Lf(v, l, n);

  const completeness = computeProfileCompleteness(identity);
  const verified = identity.claims.filter(isVerifiedClaim).length;
  const pending = identity.claims.filter(isPendingClaim).length;
  const { workload } = identity;

  // Which reads each stage depends on. A stage whose source failed states
  // that instead of a figure derived from a partial read.
  const discoveryKnown = known("discovery");
  const passportKnown = known("passport") && known("claims");
  const profileKnown = known("account") && known("profile") && known("passport");
  const assessmentsKnown = known("assessments");
  const applicationsKnown = known("applications");

  const stages: readonly Stage[] = [
    {
      key: "discover",
      icon: <Compass className="h-4 w-4" aria-hidden="true" />,
      label: say(COPY.discover),
      state: !discoveryKnown
        ? say(COPY.unreadable)
        : identity.discovery.hasCompletedReport
          ? say(COPY.discoverDone)
          : say(COPY.discoverNone),
      href: "/security-career-assessment",
      active: discoveryKnown && identity.discovery.hasCompletedReport,
      unknown: !discoveryKnown,
    },
    {
      key: "profile",
      icon: <UserRound className="h-4 w-4" aria-hidden="true" />,
      // The percentage counts answered sections. It is not a quality score and
      // never reaches an employer — `completeness.ts` carries the same warning
      // where the number is computed.
      label: say(COPY.profile),
      state: !profileKnown ? say(COPY.unreadable) : sayf(COPY.profileState, completeness.score),
      href: "/my-career/profile",
      active: profileKnown && completeness.score > 0,
      unknown: !profileKnown,
    },
    {
      key: "verify",
      icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
      label: say(COPY.verify),
      state: !passportKnown
        ? say(COPY.unreadable)
        : !identity.hasPassport
          ? say(COPY.verifyNone)
          : pending > 0 && verified === 0
            ? sayf(COPY.verifyPending, pending)
            : sayf(COPY.verifyState, verified),
      href: "/passport",
      active: passportKnown && verified > 0,
      unknown: !passportKnown,
    },
    {
      key: "grow",
      icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />,
      label: say(COPY.grow),
      state: !assessmentsKnown
        ? say(COPY.unreadable)
        : workload.assessmentAssignmentCount > 0
          ? sayf(
              workload.assessmentAssignmentCount === 1 ? COPY.growAssigned : COPY.growAssignedMany,
              workload.assessmentAssignmentCount,
            )
          : workload.releasedReportCount > 0
            ? sayf(
                workload.releasedReportCount === 1 ? COPY.growReleased : COPY.growReleasedMany,
                workload.releasedReportCount,
              )
            : say(COPY.growNone),
      href: "/academy",
      active:
        assessmentsKnown &&
        (workload.assessmentAssignmentCount > 0 || workload.releasedReportCount > 0),
      unknown: !assessmentsKnown,
    },
    {
      key: "work",
      icon: <Briefcase className="h-4 w-4" aria-hidden="true" />,
      label: say(COPY.work),
      // The seam counts applications THIS person sent, at every status. The
      // Jobs card counts the ones still live, under its own label — two
      // different questions, worded so they can never read as a contradiction.
      state: !applicationsKnown
        ? say(COPY.unreadable)
        : workload.applicationCount === 0
          ? say(COPY.workNone)
          : workload.applicationCount === 1
            ? say(COPY.workOne)
            : sayf(COPY.workState, workload.applicationCount),
      href: "/my-career/applications",
      active: applicationsKnown && workload.applicationCount > 0,
      unknown: !applicationsKnown,
    },
  ];

  return (
    <section aria-labelledby="career-journey-heading" className={className}>
      <h2
        id="career-journey-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {say(COPY.heading)}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{say(COPY.lede)}</p>

      {/* One column on a phone would be five full-width rows of chrome for
          five short sentences, so the strip pairs up at 375px and opens to a
          single row only when there is genuinely space for five. */}
      <ul className="mt-4 grid grid-cols-2 items-start gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {stages.map((stage) => (
          // Five stages into two or three columns leaves a hole in the last
          // row, and the hole is the container's own border colour showing
          // through the 1px gaps — a grey block on a phone that reads as a
          // sixth, broken stage. The last card takes the remaining width
          // instead. At lg the row is exactly five wide and it does not.
          <li key={stage.key} className="bg-card last:col-span-2 lg:last:col-span-1">
            <Link
              to={stage.href}
              className="flex h-full min-h-24 flex-col justify-start gap-1.5 p-4 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                  stage.active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {stage.icon}
                {stage.label}
              </span>
              <span
                className={cn(
                  "text-sm leading-snug text-balance",
                  stage.unknown
                    ? "text-muted-foreground italic"
                    : stage.active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {stage.state}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
