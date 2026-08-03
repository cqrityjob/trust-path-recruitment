// The participant's Academy home: what has been asked of them, what they have
// finished, what they can practise.
//
// Purpose and privacy are stated on the card for each assignment, next to the
// Start button, rather than in a policy page nobody opens. Somebody about to
// answer questions about their professional judgement is entitled to know who
// asked and why, at the moment they decide whether to begin.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import {
  getLearningFormForModule,
  listMyAcademyWork,
  type MyAssignment,
} from "@/lib/security-competency/academy-learning.functions";

export const Route = createFileRoute("/_authenticated/academy/")({
  ssr: false,
  component: AcademyHome,
});

function AcademyHome() {
  const { t, lang } = useT();
  const listWork = useServerFn(listMyAcademyWork);
  const formFn = useServerFn(getLearningFormForModule);

  const work = useQuery({ queryKey: ["academy", "my-work"], queryFn: () => listWork() });
  const learningForm = useQuery({
    queryKey: ["academy", "learning-form"],
    queryFn: () => formFn(),
  });

  const assessments = (work.data ?? []).filter((w) => w.mode === "assessment");
  const learning = (work.data ?? []).filter((w) => w.mode === "learning");

  return (
    <AssessmentShell wide>
      <h1
        className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("academy.home.title")}
      </h1>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {t("academy.home.lede")}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("academy.home.assigned")}</h2>
        {work.isLoading && <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>}
        {!work.isLoading && assessments.length === 0 && (
          <NoEvidenceState title={t("academy.home.noneTitle")} body={t("academy.home.noneBody")} />
        )}
        <div className="space-y-3">
          {assessments.map((a) => (
            <AssignmentCard key={a.attemptId} row={a} lang={lang} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("academy.home.learning")}
        </h2>
        <p className="mb-3 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.home.learningLede")}
        </p>
        {learningForm.data ? (
          <Link
            to="/academy/learning/$formId"
            params={{ formId: learningForm.data.formId }}
            className="inline-flex h-11 items-center rounded-[10px] border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {learning.length > 0 ? t("academy.home.practiseAgain") : t("academy.home.practise")}
          </Link>
        ) : (
          <NoEvidenceState
            title={t("academy.home.noModulesTitle")}
            body={t("academy.home.noModulesBody")}
          />
        )}
      </section>
    </AssessmentShell>
  );
}

function AssignmentCard({ row, lang }: { row: MyAssignment; lang: string }) {
  const { t } = useT();
  const name = (lang === "en" ? row.programmeNameEn : row.programmeNameSv) ?? "—";
  const purpose = lang === "en" ? row.purposeEn : row.purposeSv;
  const done = row.attemptStatus !== "in_progress";

  return (
    <AssessmentPanel className="p-5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          {row.employerName && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("academy.home.requestedBy")} {row.employerName}
            </p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {row.answered}/{row.totalItems}
        </span>
      </div>

      {/* Purpose and privacy, stated where the decision is made. */}
      <div className="mt-3 rounded-[10px] bg-[color:var(--surface-subtle)] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("academy.home.purpose")}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {purpose ?? t("academy.home.purposeFallback")}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.home.privacy")}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!done && (
          <Link
            to="/academy/$attemptId"
            params={{ attemptId: row.attemptId }}
            className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {row.answered > 0 ? t("academy.resume") : t("academy.start")}
          </Link>
        )}
        {row.releasedAt && (
          <Link
            to="/academy/report/$attemptId"
            params={{ attemptId: row.attemptId }}
            className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.home.openReport")}
          </Link>
        )}
        {done && !row.releasedAt && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.home.awaitingRelease")}
          </p>
        )}
      </div>
    </AssessmentPanel>
  );
}
