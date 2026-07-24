// Employer Assessment Assignment — recipient secure execution route.
//
// The invitation token is the recipient's entire credential (same threat
// model as a password-reset link) -- this route requires no sign-in and
// performs no employer/candidate authorization of its own; every read and
// write goes through the token-authorized server functions in
// assessment-assignments.functions.ts, which are themselves the complete
// security boundary (hash the token, verify status/expiry, never return or
// accept anything beyond that one assignment).
//
// Reuses the exact existing Assessment Platform runtime: assembleQuestionSet
// (Question Library), AssessmentLayout/AssessmentProgress/AssessmentQuestion
// (the same components security-career-assessment.tsx uses), and the
// server-computed EngineResultV1 rendered through EngineResultView -- no
// second question-rendering or scoring implementation.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Clock, Info, ShieldCheck } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { AssessmentProgress } from "@/components/assessment/AssessmentProgress";
import { AssessmentQuestion, type Answer } from "@/components/assessment/AssessmentQuestion";
import { EngineResultView } from "@/components/assessment/result/engine-view";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { assembleQuestionSet } from "@/lib/question-library/query";
import type { AssessmentProfileId } from "@/lib/question-library/types";
import type { EngineResultV1 } from "@/lib/career-intelligence-engine/types";
import {
  getAssignmentByToken,
  getCompletedAssignmentResultByToken,
  startAssessmentAssignment,
  completeAssessmentAssignment,
  claimAssessmentAssignment,
  type AssignmentTokenView,
} from "@/lib/job-intelligence/assessment-assignments.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitedAssessmentPage,
});

type Phase =
  | "loading"
  | "not-found"
  | "unavailable"
  | "intro"
  | "questions"
  | "submitting"
  | "results";

function progressKey(token: string) {
  return `cqj:assignment:progress:${token}`;
}

type PersistedProgress = {
  v: 1;
  index: number;
  answers: Record<string, Answer>;
  completionId: string;
};

function InvitedAssessmentPage() {
  const { token } = Route.useParams();
  const { t, lang } = useT();
  const getAssignment = useServerFn(getAssignmentByToken);
  const getCompletedResult = useServerFn(getCompletedAssignmentResultByToken);
  const startAssignment = useServerFn(startAssessmentAssignment);
  const completeAssignment = useServerFn(completeAssessmentAssignment);
  const claimAssignment = useServerFn(claimAssessmentAssignment);

  const [phase, setPhase] = useState<Phase>("loading");
  const [assignment, setAssignment] = useState<AssignmentTokenView | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [completionId, setCompletionId] = useState<string | null>(null);
  const [result, setResult] = useState<EngineResultV1 | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    void getAssignment({ data: { token } })
      .then((view) => {
        if (!alive) return;
        if (!view) {
          setPhase("not-found");
          return;
        }
        if (view.status === "completed") {
          setAssignment(view);
          void getCompletedResult({ data: { token } })
            .then((r) => {
              if (!alive) return;
              setResult(r?.engineResult ?? null);
              setPhase("results");
            })
            .catch(() => {
              if (alive) setPhase("results"); // result stays null -> "already completed" fallback message
            });
          return;
        }
        if (view.status === "expired" || view.status === "cancelled") {
          setAssignment(view);
          setPhase("unavailable");
          return;
        }
        setAssignment(view);
        try {
          const raw = window.sessionStorage.getItem(progressKey(token));
          if (raw) {
            const parsed = JSON.parse(raw) as PersistedProgress;
            if (parsed?.v === 1) {
              setIndex(parsed.index);
              setAnswers(parsed.answers);
              setCompletionId(parsed.completionId);
            }
          }
        } catch {
          /* ignore -- resume is best-effort */
        }
        setPhase("intro");
      })
      .catch(() => {
        // A load failure (network hiccup, transient server error) must never
        // leave the recipient staring at an infinite loader -- fail into the
        // same neutral "not found" state as an unknown token, since neither
        // case should reveal whether a specific assignment exists.
        if (alive) setPhase("not-found");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(!!data.session);
    });
    return () => {
      alive = false;
    };
  }, []);

  const questionSet = useMemo(() => {
    if (!assignment) return null;
    return assembleQuestionSet(
      assignment.assessmentId,
      assignment.profileId as AssessmentProfileId,
    );
  }, [assignment]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (phase !== "questions" || !completionId) return;
    try {
      window.sessionStorage.setItem(
        progressKey(token),
        JSON.stringify({ v: 1, index, answers, completionId } satisfies PersistedProgress),
      );
    } catch {
      /* ignore -- persistence is best-effort */
    }
  }, [phase, index, answers, completionId, token]);

  async function onStart() {
    try {
      const { completionId: id } = await startAssignment({ data: { token } });
      setCompletionId(id);
      setPhase("questions");
    } catch {
      setSubmitError(t("assignment.recipient.error.submit"));
    }
  }

  async function onFinish() {
    if (!completionId) return;
    setPhase("submitting");
    setSubmitError(null);
    try {
      const res = await completeAssignment({ data: { token, completionId, answers } });
      setResult(res.engineResult);
      try {
        window.sessionStorage.removeItem(progressKey(token));
      } catch {
        /* ignore */
      }
      setPhase("results");
    } catch {
      setSubmitError(t("assignment.recipient.error.submit"));
      setPhase("questions");
    }
  }

  async function onLinkToProfile(assignmentId: string) {
    try {
      await claimAssignment({ data: { assignmentId } });
    } catch {
      /* best-effort -- the completed result is already safely stored regardless */
    }
  }

  if (phase === "loading") {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </AssessmentLayout>
    );
  }

  if (phase === "not-found") {
    return (
      <AssessmentLayout narrow>
        <h1 className="text-2xl font-semibold text-foreground">
          {t("assignment.recipient.notFound.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("assignment.recipient.notFound.body")}
        </p>
      </AssessmentLayout>
    );
  }

  if (phase === "unavailable" && assignment) {
    return (
      <AssessmentLayout narrow>
        <h1 className="text-2xl font-semibold text-foreground">
          {assignment.status === "expired"
            ? t("assignment.recipient.expired.heading")
            : t("assignment.recipient.cancelled.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {assignment.status === "expired"
            ? t("assignment.recipient.expired.body")
            : t("assignment.recipient.cancelled.body")}
        </p>
      </AssessmentLayout>
    );
  }

  if (phase === "intro" && assignment) {
    const name = lang === "sv" ? assignment.assessmentNameSv : assignment.assessmentNameEn;
    return (
      <AssessmentLayout narrow>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          {t("assignment.recipient.badge")}
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          {name}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("assignment.recipient.invitedBy").replace("{employer}", assignment.employerName)}
        </p>
        {assignment.employerMessage && (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground">
            {assignment.employerMessage}
          </div>
        )}
        {submitError && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <div className="bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("employer.assessments.card.questionCount")}
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">{assignment.questionCount}</p>
          </div>
          <div className="bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("employer.assessments.card.duration")}
            </p>
            <p className="mt-2 text-xl font-semibold text-foreground">
              ~{assignment.estimatedMinutes} min
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("assignment.recipient.privacyNote")}</p>
        </div>

        <div className="mt-10">
          <PrimaryButton onClick={onStart}>
            {t("assignment.recipient.start")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryButton>
        </div>
      </AssessmentLayout>
    );
  }

  if ((phase === "questions" || phase === "submitting") && questionSet) {
    const q = questionSet.questions[index];
    const value = answers[q.id];
    const isLast = index === questionSet.questions.length - 1;
    const hasAnswer = value !== undefined && !(Array.isArray(value) && value.length === 0);

    return (
      <AssessmentLayout narrow>
        <AssessmentProgress current={index + 1} total={questionSet.questions.length} />
        {submitError && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {submitError}
          </p>
        )}
        <div className="mt-12">
          <AssessmentQuestion
            question={q}
            value={value}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
          />
        </div>
        <div className="mt-14 flex items-center justify-between border-t border-border pt-6">
          <button
            type="button"
            disabled={index === 0 || phase === "submitting"}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("sca.q.previous")}
          </button>
          {isLast ? (
            <PrimaryButton onClick={onFinish} disabled={phase === "submitting"}>
              {phase === "submitting" ? t("employer.loading") : t("sca.q.finish")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => setIndex((i) => i + 1)} disabled={!hasAnswer}>
              {t("sca.q.next")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryButton>
          )}
        </div>
      </AssessmentLayout>
    );
  }

  if (phase === "results") {
    if (!result) {
      return (
        <AssessmentLayout narrow>
          <p className="text-sm text-muted-foreground">
            {t("assignment.recipient.alreadyCompleted")}
          </p>
        </AssessmentLayout>
      );
    }
    return (
      <AssessmentLayout>
        <div className="mb-8 rounded-md border border-accent/30 bg-accent/5 p-5 text-sm text-foreground">
          {t("assessment.disclaimer.decisionSupport")}
        </div>
        <EngineResultView result={result} lang={lang} onRetake={() => {}} />
        {!signedIn && assignment && (
          <div className="mt-10 rounded-lg border border-border bg-muted/20 p-6">
            <h2 className="text-base font-semibold text-foreground">
              {t("assignment.recipient.saveResult.heading")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("assignment.recipient.saveResult.body")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/candidate/register"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {t("assignment.recipient.saveResult.createAccount")}
              </Link>
              <Link
                to="/candidate/login"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                {t("assignment.recipient.saveResult.signIn")}
              </Link>
            </div>
          </div>
        )}
        {signedIn && assignment && (
          <div className="mt-10">
            <PrimaryButton onClick={() => onLinkToProfile(assignment.id)} variant="ghost">
              {t("assignment.recipient.saveResult.link")}
            </PrimaryButton>
          </div>
        )}
      </AssessmentLayout>
    );
  }

  return null;
}
