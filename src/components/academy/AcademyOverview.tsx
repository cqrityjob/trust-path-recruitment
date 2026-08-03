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
import { ClipboardCheck, Lock, Users } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  getAcademyReviewPressure,
  listAcademyParticipants,
} from "@/lib/security-competency/academy-employer.functions";

export function AcademyOverview({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { t } = useT();
  const participantsFn = useServerFn(listAcademyParticipants);
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
  const active = rows.filter((r) => r.attemptStatus === "in_progress").length;
  const released = rows.filter((r) => r.releasedAt).length;

  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-accent">
        {t("academy.overview.competenceTitle")}
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        {t("academy.overview.competenceLede")}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat icon={Users} label={t("academy.overview.active")} value={active} />
        <Stat icon={ClipboardCheck} label={t("academy.overview.released")} value={released} />
        <Stat
          icon={Lock}
          label={t("academy.overview.awaitingReview")}
          value={pressure.data?.awaitingReview ?? 0}
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

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
