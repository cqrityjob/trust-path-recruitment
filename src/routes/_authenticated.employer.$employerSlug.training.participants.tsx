// Deltagare — training progress, under Kompetensutveckling.
//
// This moved out of the assessment participant list. The two answer different
// questions, and mixing them made an employer reconcile "what was measured"
// with "what was assigned to develop" on one screen.
//
// What this shows is status, module counts and dates. What it does not show is
// a single answer: the RPC returns none, the assignment table has no answer
// column, and the suite asserts both. The responses a person gives in a
// formative activity are theirs, and "it is only training" is exactly the
// argument that would erode that.
//
// Identity stays pseudonymous behind the same subject reference the assessment
// participant list uses.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, TrainingPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import {
  listTrainingStatus,
  type TrainingStatusRow,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/training/participants",
)({
  ssr: false,
  component: TrainingParticipantsRoute,
  errorComponent: EmployerErrorState,
});

function TrainingParticipantsRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <TrainingPage employerSlug={employerSlug}>
      {(ws) => <Participants employerId={ws.employerId} employerSlug={ws.employerSlug} />}
    </TrainingPage>
  );
}

function Participants({ employerId, employerSlug }: { employerId: string; employerSlug: string }) {
  const { t, lang } = useT();
  const listFn = useServerFn(listTrainingStatus);
  const query = useQuery({
    queryKey: ["academy", "training-status", employerId],
    queryFn: () => listFn({ data: { employerId } }),
  });

  return (
    <>
      <AcademyHeading
        title={t("training.participants.title")}
        lede={t("training.participants.lede")}
      />

      <AcademyQueryState
        query={query}
        surface="training/participants"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle={t("employer.training.none")}
        emptyBody={t("employer.training.noneBody")}
        emptyAction={
          <Link
            to="/employer/$employerSlug/training/programmes"
            params={{ employerSlug }}
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("training.overview.openProgrammes")}
          </Link>
        }
      >
        {(rows) => (
          <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
            {rows.map((r) => (
              <TrainingStatusItem key={r.assignmentId} row={r} lang={lang} />
            ))}
          </ul>
        )}
      </AcademyQueryState>
    </>
  );
}

function TrainingStatusItem({ row, lang }: { row: TrainingStatusRow; lang: string }) {
  const { t } = useT();
  const name = lang === "en" ? row.programmeNameEn : row.programmeNameSv;
  const stateKey =
    row.status === "completed"
      ? "academy.state.completed"
      : row.status === "in_progress"
        ? "academy.state.inProgress"
        : "academy.state.notStarted";
  const locale = lang === "en" ? "en-GB" : "sv-SE";

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold leading-snug text-foreground">{name}</h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t(stateKey as never)}
          </span>
        </div>
        {/* The subject reference, not a name. Identity resolution is a separate,
            governed act and this surface is not it. */}
        <p className="mt-1 font-mono text-[12px] text-muted-foreground">
          {t("academy.participants.subject")} {row.subjectId.slice(0, 8)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {row.modulesCompleted}/{row.modulesTotal} {t("employer.training.modules")}
          </span>
          <span>
            {t("employer.training.assigned")}{" "}
            {row.assignedAt ? new Date(row.assignedAt).toLocaleDateString(locale) : "—"}
          </span>
          {row.completedAt && (
            <span>
              {t("employer.training.completed")}{" "}
              {new Date(row.completedAt).toLocaleDateString(locale)}
            </span>
          )}
        </p>
      </div>
      <div className="w-full max-w-[160px] shrink-0">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-subtle)]"
          role="progressbar"
          aria-valuenow={row.modulesCompleted}
          aria-valuemin={0}
          aria-valuemax={row.modulesTotal}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${row.modulesTotal > 0 ? Math.round((row.modulesCompleted / row.modulesTotal) * 100) : 0}%`,
            }}
          />
        </div>
      </div>
    </li>
  );
}
