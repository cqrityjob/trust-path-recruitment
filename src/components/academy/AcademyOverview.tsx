// Assessment Center Overview.
//
// Separates competence development — the active product — from recruitment
// assessment, which is deliberately unavailable. The recruitment card is not a
// teaser for a coming feature: it states that recruitment use requires a
// validation level this content has not reached, because an employer who
// assumes otherwise would be the most costly misunderstanding this product can
// produce.
//
// ── #63: A COUNT OF WORK IS A DOOR, NOT A NOTICE ──────────────────────
//
// Every number here counts something an employer has to DO something about,
// and each one used to be inert: "Klara att frisläppa: 3" told you three
// results were waiting for you and gave you no way to reach them. The fix is
// not a link next to the number — it is the number, because that is where a
// person clicks. Each card names the state it counts and opens the list
// filtered to exactly that state, so the destination visibly matches the card.
//
// The two review numbers are deliberately different destinations, because they
// are different questions: how many RESULTS are stuck (an attempt list, with
// the release control on it) versus how many RESPONSES need a person (the
// review workspace). They were also both labelled "Väntar på granskning",
// which made the pair unreadable; they now say which one they mean.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Lock, Users, Send, Hourglass } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { getAcademyReviewPressure } from "@/lib/security-competency/academy-employer.functions";
import { getEmployerAssessmentPipeline } from "@/lib/security-competency/assessment-lifecycle.functions";

export function AcademyOverview({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { t, tp } = useT();
  const participantsFn = useServerFn(getEmployerAssessmentPipeline);
  const pressureFn = useServerFn(getAcademyReviewPressure);

  const participants = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => participantsFn({ data: { employerId } }),
  });
  const pressure = useQuery({
    queryKey: ["academy", "review-pressure", employerId],
    queryFn: () => pressureFn({ data: { employerId } }),
  });

  // ── A NUMBER YOU DO NOT HAVE YET IS NOT ZERO ─────────────────────────
  //
  // These tiles rendered `data ?? []` straight into a count, so for the second
  // or so before the query resolved every card read 0 -- and then silently
  // changed. "Väntar på granskning: 0" is not a slow answer, it is a wrong
  // one, and it is the answer an employer glancing at the page actually took
  // away. While either query is in flight the tiles show a dash instead.
  const loading = participants.isPending || pressure.isPending;
  const rows = participants.data ?? [];
  const active = rows.filter(
    (r) => r.lifecycleState === "invited" || r.lifecycleState === "in_progress",
  ).length;
  const readyToRelease = rows.filter((r) => r.lifecycleState === "ready_to_release").length;
  const released = rows.filter((r) => r.lifecycleState === "result_available").length;

  // ── ONE QUESTION, ONE TILE ──────────────────────────────────────────
  //
  // This section showed FIVE numbers, two of which were about review:
  // "Genomförda tester att granska" (attempts stuck) and "Svar att granska"
  // (individual responses open). They are genuinely different measures, and
  // the pair was named apart precisely so they would stop contradicting each
  // other -- but an employer does not have two review decisions to make. They
  // have one: somebody has to sit down and review. Attempt-versus-response is
  // how the ENGINE counts the work, not a distinction the reader acts on, and
  // two tiles asking the same question is what made this grid unreadable.
  //
  // So: one tile. The attempt count leads, because attempts are what an
  // employer recognises ("three tests are waiting"), and the response count
  // rides underneath as the size of the job. The destination is the review
  // workspace -- the place where a person actually clears it.
  //
  // Governance is untouched: no review control is weakened, removed or
  // widened, and scp_employer_review_pressure still decides both numbers.
  // attemptsBlocked comes from the SAME RPC call as awaitingReview instead of
  // being re-derived from the participant list, so the two halves of one tile
  // cannot disagree.
  const awaitingReview = pressure.data?.awaitingReview ?? 0;
  const attemptsAwaitingReview = pressure.data?.attemptsBlocked ?? 0;

  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-accent">
        {/* Deliberately NOT "Kompetensutveckling": that is now a separate
            top-level area, and reusing its name as a section heading inside
            Tester is exactly the mixing the two areas were split to end. This
            section is about the EVIDENCE this workspace produces. */}
        {t("academy.overview.competenceTitle")}
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        {t("academy.overview.competenceLede")}
      </p>

      {/* Four tiles, in lifecycle order, answering exactly the four questions
          the employer has: what is running, what needs a person, what is
          waiting on me, what is done. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatLink
          icon={Users}
          label="academy.overview.active"
          value={active}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "active" as const }}
        />
        {/* The one tile where the work is a person's time. Its sub-line says
            how many responses that is, so the number is a workload rather
            than a mystery. */}
        <StatLink
          icon={Hourglass}
          label="academy.overview.awaitingReviewUnified"
          value={attemptsAwaitingReview}
          loading={loading}
          detail={
            awaitingReview > 0
              ? `${awaitingReview} ${tp("academy.overview.awaitingReviewDetail", awaitingReview)}`
              : undefined
          }
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/reviews"
          search={{ scope: "all" as const }}
        />
        {/* "Ready to release" is the one state where the EMPLOYER is the party
            being waited on, so it is surfaced next to the others rather than
            left for them to discover by scrolling the list. */}
        <StatLink
          icon={Send}
          label="academy.overview.readyToRelease"
          value={readyToRelease}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "ready_to_release" as const }}
        />
        <StatLink
          icon={ClipboardCheck}
          label="academy.overview.released"
          value={released}
          loading={loading}
          employerSlug={employerSlug}
          to="/employer/$employerSlug/assessments/participants"
          search={{ state: "result_available" as const }}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/employer/$employerSlug/assessments/library"
          params={{ employerSlug }}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.overview.openLibrary")}
        </Link>
        <Link
          to="/employer/$employerSlug/assessments/participants"
          params={{ employerSlug }}
          className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.overview.openParticipants")}
        </Link>
      </div>

      {/* The boundary, stated rather than implied by absence. */}
      <div className="mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5">
        <h3 className="text-sm font-semibold text-foreground">
          {t("academy.overview.recruitmentTitle")}
        </h3>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.overview.recruitmentBody")}
        </p>
      </div>
    </section>
  );
}

const STAT_SHELL = "rounded-[14px] border border-border bg-card p-5";

/** A metric that is also the way to the work it counts.
 *
 *  A zero is still a link. Disabling the card at zero looked tidy and made the
 *  affordance flicker: the same tile was clickable on Monday and dead on
 *  Tuesday, which teaches people not to try. An empty filtered list is a
 *  perfectly good answer to "show me the three that are ready" when there are
 *  none, and the list says so in words. */
function StatLink<S extends Record<string, string>>({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  employerSlug,
  to,
  search,
}: {
  icon: typeof Users;
  label: TranslationKey;
  value: number;
  loading?: boolean;
  /** Optional second line: the same work, measured the way the engine counts
   *  it. Supporting information, never a competing headline. */
  detail?: string;
  employerSlug: string;
  to: string;
  search: S;
}) {
  const { t } = useT();
  return (
    <Link
      to={to}
      params={{ employerSlug }}
      search={search}
      className={`${STAT_SHELL} block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none`}
    >
      <StatBody icon={Icon} label={t(label)} value={value} detail={detail} loading={loading} />
    </Link>
  );
}

function StatBody({
  icon: Icon,
  label,
  value,
  detail,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail?: string;
  loading?: boolean;
}) {
  return (
    <>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {loading ? <span className="text-muted-foreground/50">&mdash;</span> : value}
      </p>
      {!loading && detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </>
  );
}
