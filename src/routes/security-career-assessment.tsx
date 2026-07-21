import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  Info,
  ShieldCheck,
} from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { AssessmentProgress } from "@/components/assessment/AssessmentProgress";
import { AssessmentQuestion, type Answer } from "@/components/assessment/AssessmentQuestion";
import { ProfileStep } from "@/components/assessment/ProfileStep";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { Question } from "@/lib/assessment-content";
import { computeCareerIntelligenceMatches } from "@/lib/career-intelligence-engine/compute.functions";
import { EngineResultView } from "@/components/assessment/result/engine-view";
import type { AnswerMap } from "@/lib/career-assessment/types";
import { CareerProfileForJobsSaver } from "@/components/assessment/CareerProfileForJobsSaver";
import { assembleQuestionSet } from "@/lib/question-library/query";
import { profileForCurrentStatus } from "@/lib/question-library/current-situation";
import type { AssessmentProfileId } from "@/lib/question-library/types";
import type { CurrentStatus } from "@/lib/security-career-profile/types";

// This route is the Public Career Assessment's live entry point. The
// Assessment Catalog definition it saves against (see supabase/migrations/
// ..._assessment_catalog_public_career_assessment.sql) -- distinct from the
// preserved 'security-guard-foundation' definition, whose original static
// 16-question run this route no longer renders directly, though 8 of its
// questions are reused verbatim as the security_professional profile pool.
const ASSESSMENT_DEFINITION_ID = "public-career-assessment";

type Phase = "landing" | "intro" | "current-situation" | "questions" | "results";

// sessionStorage key + shape for in-progress assessment persistence.
// Bumped when the persisted shape changes so stale payloads are ignored.
const PROGRESS_STORAGE_KEY = "cqj:assessment:progress:v1";

type PersistedProgress = {
  v: 1;
  phase: Phase;
  index: number;
  answers: Record<string, Answer>;
  currentStatus: CurrentStatus | null;
  completionId: string;
};

function readPersistedProgress(): PersistedProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProgress;
    if (!parsed || parsed.v !== 1 || typeof parsed.completionId !== "string") return null;
    // Never restore into a terminal or pre-flow phase — those clear storage.
    if (parsed.phase !== "questions" && parsed.phase !== "current-situation") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedProgress() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const Route = createFileRoute("/security-career-assessment")({
  head: () => ({
    meta: [
      { title: "Security Career Assessment — CQrityjob" },
      {
        name: "description",
        content:
          "A free career assessment for the security industry. Discover which roles may suit your interests, strengths and preferred ways of working.",
      },
      { property: "og:title", content: "Security Career Assessment — CQrityjob" },
      {
        property: "og:description",
        content:
          "Discover which security careers may suit you. Free, about 5 minutes, no account required.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:url",
        content: "https://trust-path-recruitment.lovable.app/security-career-assessment",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://trust-path-recruitment.lovable.app/security-career-assessment",
      },
    ],
  }),
  component: AssessmentApp,
});

function AssessmentApp() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // Current Situation: drives which 8 profile questions are assembled
  // alongside the 8 Universal Core questions (src/lib/question-library/).
  // Never fed into scoring weights directly — see ProfileStep.tsx.
  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(null);
  // Idempotency key for one genuine assessment-completion attempt. Generated
  // once per mount, reused across every phase transition and any component
  // remount within the same attempt (React StrictMode double-invoke, a
  // saver component re-rendering) because it lives on this stable ancestor.
  // Only reset() below mints a new one — a genuine retake, even with
  // identical answers, must be treated as a new completion.
  const [completionId, setCompletionId] = useState<string>(() => crypto.randomUUID());

  const profileId = useMemo(() => profileForCurrentStatus(currentStatus), [currentStatus]);
  const questionSet = useMemo(
    () => assembleQuestionSet(ASSESSMENT_DEFINITION_ID, profileId),
    [profileId],
  );

  const reset = () => {
    setAnswers({});
    setIndex(0);
    setCurrentStatus(null);
    setPhase("landing");
    setCompletionId(crypto.randomUUID());
  };

  if (phase === "landing") return <Landing onStart={() => setPhase("intro")} />;
  if (phase === "intro")
    return (
      <Intro
        questionCount={questionSet.questions.length}
        onContinue={() => setPhase("current-situation")}
      />
    );
  if (phase === "current-situation")
    return (
      <ProfileStep
        onContinue={(status) => {
          setCurrentStatus(status);
          setPhase("questions");
        }}
      />
    );
  if (phase === "questions")
    return (
      <Questions
        questions={questionSet.questions}
        index={index}
        setIndex={setIndex}
        answers={answers}
        setAnswers={setAnswers}
        onFinish={() => setPhase("results")}
        onBack={() => setPhase("intro")}
      />
    );
  return (
    <Results answers={answers} profileId={profileId} onRetake={reset} completionId={completionId} />
  );
}

/* -------------------------------- Landing -------------------------------- */

function Landing({ onStart }: { onStart: () => void }) {
  const { t } = useT();
  const points = [
    { icon: Clock, key: "sca.landing.point.time" as const },
    { icon: CheckCircle2, key: "sca.landing.point.free" as const },
    { icon: ShieldCheck, key: "sca.landing.point.noaccount" as const },
    { icon: Compass, key: "sca.landing.point.guidance" as const },
  ];
  const steps = [
    { n: 1, title: t("sca.how.step1.title"), body: t("sca.how.step1.body") },
    { n: 2, title: t("sca.how.step2.title"), body: t("sca.how.step2.body") },
    { n: 3, title: t("sca.how.step3.title"), body: t("sca.how.step3.body") },
  ];
  return (
    <AssessmentLayout>
      <div className="grid grid-cols-1 gap-16 md:grid-cols-5 md:items-start">
        <div className="md:col-span-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            {t("sca.badge")}
          </span>
          <h1
            className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("sca.landing.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("sca.landing.lead")}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={onStart}>
              {t("sca.landing.cta.start")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryButton>
            <a
              href="#how-it-works"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {t("sca.landing.cta.how")}
            </a>
          </div>
        </div>

        <ul className="rounded-lg border border-border bg-background p-2 md:col-span-2">
          {points.map(({ icon: Icon, key }) => (
            <li
              key={key}
              className="flex items-start gap-3 border-b border-border/60 px-4 py-4 text-sm text-foreground last:border-b-0"
            >
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div id="how-it-works" className="mt-24 border-t border-border pt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("sca.how.title")}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="bg-background p-8">
              <span className="text-xs font-medium uppercase tracking-widest text-accent">
                0{s.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </AssessmentLayout>
  );
}

/* --------------------------------- Intro --------------------------------- */

function Intro({ questionCount, onContinue }: { questionCount: number; onContinue: () => void }) {
  const { t } = useT();
  const stats = [
    { label: t("sca.intro.stat.time"), value: t("sca.intro.stat.time.value") },
    { label: t("sca.intro.stat.questions"), value: String(questionCount) },
    { label: t("sca.intro.stat.privacy"), value: t("sca.intro.stat.privacy.value") },
  ];
  return (
    <AssessmentLayout narrow>
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t("sca.badge")}
      </span>
      <h1
        className="mt-6 text-3xl font-semibold tracking-tight text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("sca.intro.title")}
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
        {t("sca.intro.body")}
      </p>

      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-background p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p
              className="mt-2 text-xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <AssessmentProgress current={0} total={questionCount} />
      </div>

      <div className="mt-10 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
        <p>{t("sca.intro.note")}</p>
      </div>

      <div className="mt-10">
        <PrimaryButton onClick={onContinue}>
          {t("sca.intro.cta")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </PrimaryButton>
      </div>
    </AssessmentLayout>
  );
}

/* ------------------------------- Questions ------------------------------- */

function Questions({
  questions,
  index,
  setIndex,
  answers,
  setAnswers,
  onFinish,
  onBack,
}: {
  questions: Question[];
  index: number;
  setIndex: (i: number) => void;
  answers: Record<string, Answer>;
  setAnswers: (a: Record<string, Answer>) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const q = questions[index];
  const value = answers[q.id];
  const isLast = index === questions.length - 1;
  const hasAnswer = value !== undefined && !(Array.isArray(value) && value.length === 0);

  const setValue = (v: Answer) => setAnswers({ ...answers, [q.id]: v });

  return (
    <AssessmentLayout narrow>
      <AssessmentProgress current={index + 1} total={questions.length} />
      <div className="mt-12">
        <AssessmentQuestion question={q} value={value} onChange={setValue} />
      </div>

      <div className="mt-14 flex items-center justify-between border-t border-border pt-6">
        <button
          type="button"
          onClick={() => {
            if (index === 0) onBack();
            else setIndex(index - 1);
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("sca.q.previous")}
        </button>

        <div className="flex items-center gap-3">
          {!hasAnswer && !isLast && (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("sca.q.skip")}
            </button>
          )}
          {isLast ? (
            <PrimaryButton onClick={onFinish}>
              {t("sca.q.finish")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => setIndex(index + 1)} disabled={!hasAnswer}>
              {t("sca.q.next")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </PrimaryButton>
          )}
        </div>
      </div>
    </AssessmentLayout>
  );
}

/* -------------------------------- Results -------------------------------- */

function Results({
  answers,
  profileId,
  onRetake,
  completionId,
}: {
  answers: Record<string, Answer>;
  profileId: AssessmentProfileId;
  onRetake: () => void;
  completionId: string;
}) {
  const { lang } = useT();
  const compute = useServerFn(computeCareerIntelligenceMatches);

  const answerMap = answers as AnswerMap;

  const query = useQuery({
    queryKey: ["cie-v1", answerMap, ASSESSMENT_DEFINITION_ID, profileId],
    queryFn: () =>
      compute({
        data: {
          answers: answerMap,
          topN: 5,
          assessmentDefinitionId: ASSESSMENT_DEFINITION_ID,
          profileId,
        },
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <AssessmentLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-40 rounded-lg border border-border bg-muted/40" />
          <div className="h-64 rounded-lg border border-border bg-muted/30" />
          <div className="h-64 rounded-lg border border-border bg-muted/30" />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {lang === "sv"
            ? "Beräknar din karriärintelligens…"
            : "Computing your career intelligence…"}
        </p>
      </AssessmentLayout>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AssessmentLayout>
        <div className="rounded-lg border border-border bg-background p-6">
          <p className="text-sm text-foreground">
            {lang === "sv"
              ? "Vi kunde inte beräkna ditt resultat just nu. Försök igen."
              : "We couldn't compute your result right now. Please try again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton onClick={() => query.refetch()}>
              {lang === "sv" ? "Försök igen" : "Try again"}
            </PrimaryButton>
            <PrimaryButton onClick={onRetake} variant="ghost">
              {lang === "sv" ? "Gör om testet" : "Retake"}
            </PrimaryButton>
          </div>
        </div>
      </AssessmentLayout>
    );
  }

  const result = query.data;
  if (result.matches.length === 0) {
    return (
      <AssessmentLayout>
        <p className="text-sm text-muted-foreground">
          {lang === "sv" ? "Inga resultat att visa ännu." : "No results to display yet."}
        </p>
        <div className="mt-4">
          <PrimaryButton onClick={onRetake} variant="ghost">
            {lang === "sv" ? "Gör om testet" : "Retake"}
          </PrimaryButton>
        </div>
      </AssessmentLayout>
    );
  }

  return (
    <AssessmentLayout>
      <CareerProfileForJobsSaver
        answers={answerMap}
        lang={lang}
        completionId={completionId}
        assessmentDefinitionId={ASSESSMENT_DEFINITION_ID}
        profileId={profileId}
      />
      <EngineResultView result={result} lang={lang} onRetake={onRetake} />
    </AssessmentLayout>
  );
}
