// Kompetensutveckling — the employer's development workspace.
//
// This replaces the Coming Soon placeholder. Every number on this page is
// counted from the training read model; nothing here is invented, and where a
// count would have to be guessed it is simply absent.
//
// The boundary is stated on the landing page rather than buried in a detail
// view, because this is where an employer forms their mental model of what
// training is FOR. A development programme records that somebody did the work.
// It is not evidence of competence, and it never moves a maturity level.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, TrainingPage } from "@/components/academy/AcademyWorkspace";
import {
  listContentLibrary,
  listTrainingStatus,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/training/")({
  ssr: false,
  component: TrainingOverviewRoute,
  errorComponent: EmployerErrorState,
});

function TrainingOverviewRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <TrainingPage employerSlug={employerSlug}>
      {(ws) => <Overview employerId={ws.employerId} employerSlug={ws.employerSlug} />}
    </TrainingPage>
  );
}

function Overview({ employerId, employerSlug }: { employerId: string; employerSlug: string }) {
  const { t } = useT();
  const statusFn = useServerFn(listTrainingStatus);
  const libraryFn = useServerFn(listContentLibrary);

  const status = useQuery({
    queryKey: ["academy", "training-status", employerId],
    queryFn: () => statusFn({ data: { employerId } }),
  });
  const library = useQuery({
    queryKey: ["academy", "content-library", employerId],
    queryFn: () => libraryFn({ data: { employerId } }),
  });

  const rows = status.data ?? [];
  const active = rows.filter((r) => r.status === "assigned" || r.status === "in_progress").length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const assignable = (library.data ?? []).filter(
    (e) => e.libraryKind === "training" && e.assignable,
  ).length;

  return (
    <>
      <AcademyHeading title={t("training.overview.title")} lede={t("training.overview.lede")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={t("training.overview.stat.active")}
          value={active}
          loading={status.isLoading}
        />
        <Stat
          label={t("training.overview.stat.completed")}
          value={completed}
          loading={status.isLoading}
        />
        <Stat
          label={t("training.overview.stat.available")}
          value={assignable}
          loading={library.isLoading}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/employer/$employerSlug/training/programmes"
          params={{ employerSlug }}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("training.overview.openProgrammes")}
        </Link>
        <Link
          to="/employer/$employerSlug/training/participants"
          params={{ employerSlug }}
          className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("training.overview.openParticipants")}
        </Link>
      </div>

      {/* ── THE BOUNDARY, KEPT BUT NOT SHOUTED ────────────────────────────
          This was a bordered card with an alert icon and a bold heading
          reading "Utbildning styrker inte kompetens" -- the loudest element on
          a page whose actual job is planning and following development. The
          statement is load-bearing and stays exactly as binding; what changes
          is that it now reads as the footnote it is rather than as a warning
          about the page the employer is standing on. Nothing in the evidence
          model moves: training still never raises a maturity level. */}
      <p className="mt-8 max-w-[72ch] border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        {t("training.overview.boundaryBody")}
      </p>
    </>
  );
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
        {loading ? "—" : value}
      </p>
    </div>
  );
}
