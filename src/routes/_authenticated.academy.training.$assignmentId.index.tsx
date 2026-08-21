// A development programme, as the participant sees it.
//
// The landing page answers four questions in order: what is this, who asked
// for it, how far am I, and what do I do next. The fifth thing it has to say --
// that completing this does not verify professional competence -- is stated
// once, prominently, rather than buried: a participant who believes a
// development programme certifies them has been misled by the product, not by
// themselves.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Circle, CircleDot, Eye } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import {
  completeTrainingProgramme,
  getTrainingProgramme,
  listTrainingModules,
  startTrainingModule,
  type TrainingModule,
} from "@/lib/security-competency/academy-training.functions";

export const Route = createFileRoute("/_authenticated/academy/training/$assignmentId/")({
  ssr: false,
  component: TrainingProgrammeRoute,
  errorComponent: EmployerErrorState,
});

function TrainingProgrammeRoute() {
  const { assignmentId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const programmeFn = useServerFn(getTrainingProgramme);
  const modulesFn = useServerFn(listTrainingModules);
  const startFn = useServerFn(startTrainingModule);
  const completeFn = useServerFn(completeTrainingProgramme);

  const programme = useQuery({
    queryKey: ["academy", "training", assignmentId],
    queryFn: () => programmeFn({ data: { assignmentId } }),
  });
  const modules = useQuery({
    queryKey: ["academy", "training", assignmentId, "modules"],
    queryFn: () => modulesFn({ data: { assignmentId } }),
  });

  const start = useMutation({
    mutationFn: (moduleVersionId: string) => startFn({ data: { assignmentId, moduleVersionId } }),
    onSuccess: (_r, moduleVersionId) => {
      void qc.invalidateQueries({ queryKey: ["academy", "training", assignmentId] });
      void navigate({
        to: "/academy/training/$assignmentId/$moduleVersionId",
        params: { assignmentId, moduleVersionId },
      });
    },
  });

  const complete = useMutation({
    mutationFn: () => completeFn({ data: { assignmentId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["academy", "training", assignmentId] });
      void qc.invalidateQueries({ queryKey: ["academy", "work"] });
    },
  });

  const p = programme.data;
  const rows = modules.data ?? [];
  const allDone = rows.length > 0 && rows.every((m) => m.status === "completed");
  const done = p?.status === "completed";

  return (
    <AssessmentShell wide>
      <Link
        to="/academy"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.training.backToAcademy")}
      </Link>

      <AcademyQueryState
        query={programme}
        surface="academy/training"
        isEmpty={(v) => v === null}
        emptyTitle={t("academy.training.notFound")}
        emptyBody={t("academy.training.notFoundBody")}
      >
        {() =>
          p && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-2.5 py-1 text-[11px] font-medium text-accent">
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  {t("academy.training.internalTesting")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {t("academy.library.version")} v{p.versionNumber}
                </span>
              </div>

              <h1
                className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {lang === "en" ? p.nameEn : p.nameSv}
              </h1>

              {(lang === "en" ? p.purposeEn : p.purposeSv) && (
                <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                  {lang === "en" ? p.purposeEn : p.purposeSv}
                </p>
              )}

              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                {p.employerName && (
                  <Meta label={t("academy.training.assignedBy")} value={p.employerName} />
                )}
                <Meta
                  label={t("academy.training.progress")}
                  value={`${p.modulesCompleted}/${p.modulesTotal} ${t("academy.training.moduleHeading").toLowerCase()}`}
                />
                {p.estimatedMinutes ? (
                  <Meta label={t("academy.library.duration")} value={`${p.estimatedMinutes} min`} />
                ) : null}
                {p.dueAt && (
                  <Meta
                    label={t("academy.training.dueAt")}
                    value={new Date(p.dueAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
                  />
                )}
              </dl>

              {/* Stated once, prominently, and never as fine print. */}
              <p className="mt-5 rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-3 text-[13px] leading-relaxed text-muted-foreground">
                {t("academy.training.notCompetence")}
              </p>

              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {t("academy.training.moduleHeading")}
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
                  {rows.map((m, i) => (
                    <ModuleRow
                      key={m.moduleVersionId}
                      module={m}
                      index={i + 1}
                      total={rows.length}
                      lang={lang}
                      assignmentId={assignmentId}
                      programmeDone={done}
                      onStart={() => start.mutate(m.moduleVersionId)}
                      starting={start.isPending}
                    />
                  ))}
                </ul>
              </section>

              {done ? (
                <div className="mt-6 rounded-[12px] border border-accent/40 bg-[color:var(--surface-subtle)] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
                    {t("academy.training.doneTitle")}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {t("academy.training.doneBody")}
                  </p>
                </div>
              ) : allDone ? (
                <div className="mt-6">
                  <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                    {t("academy.training.allModulesDone")}
                  </p>
                  <button
                    type="button"
                    onClick={() => complete.mutate()}
                    disabled={complete.isPending}
                    className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("academy.training.completeProgramme")}
                  </button>
                </div>
              ) : null}
            </>
          )
        }
      </AcademyQueryState>
    </AssessmentShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ModuleRow({
  module,
  index,
  total,
  lang,
  assignmentId,
  programmeDone,
  onStart,
  starting,
}: {
  module: TrainingModule;
  index: number;
  total: number;
  lang: string;
  assignmentId: string;
  programmeDone: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  const { t } = useT();
  const name = lang === "en" ? module.nameEn : module.nameSv;
  const summary = lang === "en" ? module.summaryEn : module.summarySv;
  const Icon =
    module.status === "completed"
      ? CheckCircle2
      : module.status === "in_progress"
        ? CircleDot
        : Circle;

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
      <Icon
        className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${module.status === "completed" ? "text-accent" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("academy.training.module")} {index}/{total}
        </p>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{name}</h3>
        {summary && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted-foreground">
          <span>{t(`academy.state.${statusKey(module.status)}` as never)}</span>
          {module.hasActivity && (
            <span className="tabular-nums">
              {module.answered}/{module.totalItems} {t("academy.training.activities")}
            </span>
          )}
          {module.estimatedMinutes ? (
            <span className="tabular-nums">{module.estimatedMinutes} min</span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0">
        {module.status === "completed" || programmeDone ? (
          <Link
            to="/academy/training/$assignmentId/$moduleVersionId"
            params={{ assignmentId, moduleVersionId: module.moduleVersionId }}
            className="inline-flex h-10 items-center rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.training.reviewModule")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {module.status === "in_progress"
              ? t("academy.training.continueModule")
              : t("academy.training.startModule")}
          </button>
        )}
      </div>
    </li>
  );
}

function statusKey(s: TrainingModule["status"]) {
  return s === "completed" ? "completed" : s === "in_progress" ? "inProgress" : "notStarted";
}
