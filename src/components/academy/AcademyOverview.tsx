// Assessment Center Overview.
//
// Separates competence development — the active product — from recruitment
// assessment, which is deliberately unavailable. The recruitment card is not a
// teaser for a coming feature: it states that recruitment use requires a
// validation level this content has not reached, because an employer who
// assumes otherwise would be the most costly misunderstanding this product can
// produce.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Lock, Users , Send, Hourglass } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  getAcademyReviewPressure,
} from "@/lib/security-competency/academy-employer.functions";
import { getEmployerAssessmentPipeline } from "@/lib/security-competency/assessment-lifecycle.functions";

export function AcademyOverview({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { t } = useT();
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

  const rows = participants.data ?? [];
  const active = rows.filter(
    (r) => r.lifecycleState === "invited" || r.lifecycleState === "in_progress",
  ).length;
  // Two different measures, deliberately named apart: how many ATTEMPTS are
  // waiting on a human, and how many individual RESPONSES that amounts to.
  // Both come from the same employer scope, so they can no longer contradict
  // each other the way the old counter did.
  const attemptsAwaitingReview = rows.filter((r) => r.lifecycleState === "under_review").length;
  const readyToRelease = rows.filter((r) => r.lifecycleState === "ready_to_release").length;
  const released = rows.filter((r) => r.lifecycleState === "result_available").length;
  const awaitingReview = pressure.data?.awaitingReview ?? 0;

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

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat icon={Users} label={t("academy.overview.active")} value={active} />
        {/* "Ready to release" is the one state where the EMPLOYER is the party
            being waited on, so it is surfaced next to the others rather than
            left for them to discover by scrolling the list. */}
        <Stat
          icon={Send}
          label={t("academy.overview.readyToRelease")}
          value={readyToRelease}
        />
        <Stat icon={ClipboardCheck} label={t("academy.overview.released")} value={released} />
        <Stat
          icon={Hourglass}
          label={t("academy.overview.attemptsAwaitingReview")}
          value={attemptsAwaitingReview}
        />
        {/* The tab strip already navigates to Reviews, so this is not a second
            way in — it is the difference between reporting a number and
            letting someone act on it. A non-zero "awaiting review" is work
            waiting for a person, and the count is where they will look for it.
            At zero it stays inert: nothing to go and do. */}
        {awaitingReview > 0 ? (
          <Link
            to="/employer/$employerSlug/assessments/reviews"
            params={{ employerSlug }}
            className={`${STAT_SHELL} block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none`}
          >
            <StatBody
              icon={Lock}
              label={t("academy.overview.awaitingReview")}
              value={awaitingReview}
            />
          </Link>
        ) : (
          <Stat icon={Lock} label={t("academy.overview.awaitingReview")} value={0} />
        )}
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

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className={STAT_SHELL}>
      <StatBody icon={Icon} label={label} value={value} />
    </div>
  );
}

function StatBody({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </>
  );
}
