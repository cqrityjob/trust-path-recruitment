// The participant's Academy home: what has been asked of them, and how far
// through it they are.
//
// ── TWO KINDS OF WORK, ONE LIST MODEL ─────────────────────────────────
//
// Assessments and development programmes arrive from one RPC
// (scp_my_academy_work) discriminated by workKind, and are rendered under two
// clearly labelled headings. A participant has to be able to tell instantly
// which of these measures them and which develops them -- so the distinction is
// a heading and a badge, not a subtle difference in card colour.
//
// Purpose and privacy are stated on the card, next to the action, rather than
// in a policy page nobody opens. Somebody about to answer questions about their
// professional judgement is entitled to know who asked and why, at the moment
// they decide whether to begin.

// ── WHY THIS DESTINATION LEFT THE DISTRACTION-FREE SHELL ───────────────
//
// AssessmentShell exists so that a RUN in progress is not competing with
// site navigation, and for a run that is exactly right. This page is not a
// run. It is the list, and as of the candidate app navigation it is also a
// primary destination ("Bedömningar") that somebody arrives at by clicking
// a nav item — and arrived at a page whose only link was the CQrityjob
// logo, pointing back out to the marketing landing page. Browser Back was
// the way home.
//
// So the list and the released report carry the workspace chrome, and the
// assessment run, the learning form and the training module keep
// AssessmentShell. The rule did not change; it is applied to the surfaces
// it was written for.

import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, GraduationCap, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { AssessmentPanel } from "@/components/career-discovery/v31/shell/AssessmentShell";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import { getLearningFormForModule } from "@/lib/security-competency/academy-learning.functions";
import { ParticipantAssessmentHistory } from "@/components/academy/ParticipantAssessmentHistory";
import {
  claimAssessmentInvitations,
  listAcademyWork,
  type AcademyWorkItem,
} from "@/lib/security-competency/academy-training.functions";

export const Route = createFileRoute("/_authenticated/academy/")({
  ssr: false,
  component: AcademyHome,
});

function AcademyHome() {
  const { t, lang } = useT();
  const listWork = useServerFn(listAcademyWork);
  const claimFn = useServerFn(claimAssessmentInvitations);
  const formFn = useServerFn(getLearningFormForModule);

  // Both start immediately, and the list is deliberately NOT gated on the
  // claim. Gating it left the query disabled on first render, which is
  // indistinguishable from `data === undefined` — and AcademyQueryState reads
  // that as a failure, so every visit flashed an error panel before recovering.
  //
  // Instead the claim runs alongside, and the list is refetched only if it
  // actually bound something. Somebody who was invited before they had an
  // account still sees the assessment on THIS visit; everybody else pays one
  // cheap call and never notices.
  const work = useQuery({ queryKey: ["academy", "work"], queryFn: () => listWork() });

  const claim = useQuery({
    queryKey: ["academy", "claim-invitations"],
    queryFn: () => claimFn(),
    staleTime: Infinity,
    retry: false,
  });

  const bound = claim.data?.bound ?? 0;
  const refetchWork = work.refetch;
  useEffect(() => {
    if (bound > 0) void refetchWork();
  }, [bound, refetchWork]);
  const learningForm = useQuery({
    queryKey: ["academy", "learning-form"],
    queryFn: () => formFn(),
  });

  const rows = work.data ?? [];
  const assessments = rows.filter((w) => w.workKind === "assessment");
  const training = rows.filter((w) => w.workKind === "training");

  // ── PURPOSE DRIVES WORDING ────────────────────────────────────────────
  //
  // Everything on this page used to be phrased for an EMPLOYEE doing
  // competence development: "My competence development", "released by your
  // employer", a purpose of "Competence development". Shown to somebody who
  // is a JOB APPLICANT and not an employee, that is three untrue statements
  // at once -- the organisation is not their employer, a selection instrument
  // is not development, and the result very much does inform the decision.
  //
  // `useCase` already travels on every row (scp_my_academy_work), so the page
  // asks what this person actually has rather than assuming. A person can
  // legitimately hold both at once (an employee of A applying to B), so this
  // is not an either/or: the employee wording is used whenever any employee
  // work exists, and the recruitment-only case gets its own.
  const workforceWork = rows.filter((w) => w.useCase !== "recruitment");
  const recruitmentOnly = rows.length > 0 && workforceWork.length === 0;

  return (
    <AssessmentLayout>
      <h1
        className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t(recruitmentOnly ? "academy.home.titleRecruitment" : "academy.home.title")}
      </h1>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {t(recruitmentOnly ? "academy.home.ledeRecruitment" : "academy.home.lede")}
      </p>

      <AcademyQueryState
        query={work}
        surface="academy/home"
        isEmpty={(r) => r.length === 0}
        emptyTitle={t("academy.home.noneTitle")}
        emptyBody={t("academy.home.noneBody")}
      >
        {() => (
          <>
            {assessments.length > 0 && (
              <section className="mt-8">
                <SectionHeading
                  icon={ShieldCheck}
                  title={t("academy.home.assessmentHeading")}
                  lede={t(
                    assessments.every((a) => a.useCase === "recruitment")
                      ? "academy.home.assessmentLedeRecruitment"
                      : "academy.home.assessmentLede",
                  )}
                />
                <div className="space-y-3">
                  {assessments.map((a) => (
                    <AssessmentCard key={a.workId} row={a} lang={lang} />
                  ))}
                </div>
              </section>
            )}

            {training.length > 0 && (
              <section className="mt-10">
                <SectionHeading
                  icon={GraduationCap}
                  title={t("academy.home.trainingHeading")}
                  lede={t("academy.home.trainingLede")}
                />
                <div className="space-y-3">
                  {training.map((a) => (
                    <TrainingCard key={a.workId} row={a} lang={lang} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </AcademyQueryState>

      {/* Durable history, independent of whether anything is currently due.
          This is where a completed assessment goes, rather than vanishing from
          the active list on submit. */}
      <ParticipantAssessmentHistory lang={lang} />

      {/* Practice is only offered to somebody who actually has a competence
          profile. Learning Mode requires a subject identity, and this link used
          to be rendered for everyone -- including accounts that had never been
          assigned anything, for whom it could only ever produce an error.

          It is also NOT offered on the strength of a recruitment assessment.
          Practice is a development affordance; next to a live selection
          instrument it reads as "have another go at the thing you are being
          judged on", which is exactly the impression a recruitment assessment
          must not give -- regardless of the fact that Learning Mode serves
          different items. `workforceWork`, not `rows`: only employee-purpose
          work opens practice. The server refuses independently
          (getLearningFormForModule), so removing the link is the visible half
          of the rule, not the whole of it. */}
      {workforceWork.length > 0 && learningForm.data && (
        <section className="mt-10">
          <SectionHeading
            icon={BookOpen}
            title={t("academy.home.learning")}
            lede={t("academy.home.learningLede")}
          />
          <Link
            to="/academy/learning/$formId"
            params={{ formId: learningForm.data.formId }}
            className="inline-flex h-11 items-center rounded-[10px] border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.home.practise")}
          </Link>
        </section>
      )}
    </AssessmentLayout>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  lede,
}: {
  icon: typeof ShieldCheck;
  title: string;
  lede: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {title}
      </h2>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">{lede}</p>
    </div>
  );
}

/** Why this arrived and what happens to it.
 *
 *  `recruitment` is not a cosmetic variant. An applicant must not be told
 *  that a selection instrument is "competence development", that the
 *  organisation asking is "your employer", or anything that implies the
 *  result is kept out of the decision. What they are told instead is the
 *  truth: it is decision support, and a person decides. */
function PurposePanel({ purpose, recruitment }: { purpose: string | null; recruitment: boolean }) {
  const { t } = useT();
  return (
    <div className="mt-3 rounded-[10px] bg-[color:var(--surface-subtle)] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("academy.home.purpose")}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {purpose ??
          t(
            recruitment
              ? "academy.home.purposeFallbackRecruitment"
              : "academy.home.purposeFallback",
          )}
      </p>
      {recruitment && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.home.recruitmentDecision")}
        </p>
      )}
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {t(recruitment ? "academy.home.privacyRecruitment" : "academy.home.privacy")}
      </p>
    </div>
  );
}

function AssessmentCard({ row, lang }: { row: AcademyWorkItem; lang: string }) {
  const { t } = useT();
  const name = (lang === "en" ? row.titleEn : row.titleSv) ?? "—";
  const purpose = lang === "en" ? row.purposeEn : row.purposeSv;
  const done = row.status !== "in_progress";

  return (
    <AssessmentPanel className="p-5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <KindBadge kind="assessment" />
          </div>
          {row.employerName && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("academy.home.requestedBy")} {row.employerName}
            </p>
          )}
          {/* Why this arrived. An assessment that turns up unexplained in
              somebody's account is alarming; one that names the job they
              applied for is a step in a process they started. */}
          {row.useCase === "recruitment" && (row.jobTitleSv || row.jobTitleEn) && (
            <p className="mt-1 text-[13px] text-foreground">
              {t("academy.work.forJob")}{" "}
              <span className="font-medium">
                {(lang === "en" ? row.jobTitleEn : row.jobTitleSv) ?? ""}
              </span>
            </p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
          {row.progressDone}/{row.progressTotal}
        </span>
      </div>

      <PurposePanel purpose={purpose} recruitment={row.useCase === "recruitment"} />

      <div className="mt-4 flex flex-wrap gap-2">
        {!done && (
          <Link
            to="/academy/$attemptId"
            params={{ attemptId: row.workId }}
            className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {row.progressDone > 0 ? t("academy.resume") : t("academy.start")}
          </Link>
        )}
        {row.releasedAt && (
          <Link
            to="/academy/report/$attemptId"
            params={{ attemptId: row.workId }}
            className="inline-flex h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.home.openReport")}
          </Link>
        )}
        {/* Between submitting and the report arriving, the participant used to
            get one line and no explanation. That gap is where a person decides
            whether something has gone wrong -- so the steps are named, in
            order, including the ones that are not theirs to do. No timeframe is
            promised, because none exists. */}
        {done && !row.releasedAt && (
          <div className="w-full rounded-[10px] bg-[color:var(--surface-subtle)] p-3">
            <p className="text-[13px] font-medium text-foreground">
              {t("academy.home.awaitingRelease")}
            </p>
            <ol className="mt-2 space-y-1.5">
              {(
                [
                  "academy.home.nextReview",
                  "academy.home.nextRelease",
                  "academy.home.nextReport",
                ] as const
              ).map((k) => (
                <li
                  key={k}
                  className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground"
                >
                  <span aria-hidden="true">·</span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </AssessmentPanel>
  );
}

function TrainingCard({ row, lang }: { row: AcademyWorkItem; lang: string }) {
  const { t } = useT();
  const name = (lang === "en" ? row.titleEn : row.titleSv) ?? "—";
  const purpose = lang === "en" ? row.purposeEn : row.purposeSv;
  const done = row.status === "completed";

  return (
    <AssessmentPanel className="p-5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <KindBadge kind="training" />
          </div>
          {row.employerName && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("academy.home.requestedBy")} {row.employerName}
            </p>
          )}
        </div>
        <StatusBadge status={row.status} done={row.progressDone} total={row.progressTotal} />
      </div>

      <ProgressBar done={row.progressDone} total={row.progressTotal} />
      <PurposePanel purpose={purpose} recruitment={row.useCase === "recruitment"} />

      {/* The one thing a participant must not misunderstand about training. */}
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.training.notCompetence")}
      </p>

      <div className="mt-4">
        <Link
          to="/academy/training/$assignmentId"
          params={{ assignmentId: row.workId }}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* "Continue" keys off the assignment having been STARTED, not off a
              module having been finished. progressDone counts completed
              modules, so a participant halfway through their first module was
              being invited to "Start" work they had already begun. */}
          {done
            ? t("academy.training.review")
            : row.status === "in_progress" || row.progressDone > 0
              ? t("academy.continue")
              : t("academy.start")}
        </Link>
      </div>
    </AssessmentPanel>
  );
}

export function KindBadge({ kind }: { kind: "assessment" | "training" }) {
  const { t } = useT();
  const Icon = kind === "training" ? GraduationCap : ShieldCheck;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
      {t(`academy.library.kind.${kind}` as never)}
    </span>
  );
}

export function StatusBadge({
  status,
  done,
  total,
}: {
  status: string;
  done: number;
  total: number;
}) {
  const { t } = useT();
  const key =
    status === "completed"
      ? "academy.state.completed"
      : done > 0 || status === "in_progress"
        ? "academy.state.inProgress"
        : "academy.state.notStarted";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {t(key as never)}
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-subtle)]"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
