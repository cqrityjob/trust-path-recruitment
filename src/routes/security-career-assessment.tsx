import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  Compass,
  Info,
  RotateCcw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { AssessmentProgress } from "@/components/assessment/AssessmentProgress";
import { AssessmentQuestion, type Answer } from "@/components/assessment/AssessmentQuestion";
import { CareerMatchCard } from "@/components/assessment/CareerMatchCard";
import { ResultSection } from "@/components/assessment/ResultSection";
import { FutureRecommendation } from "@/components/assessment/FutureRecommendation";
import { PrimaryButton, PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { careerMatches, pickList, pickText, questions } from "@/lib/assessment-content";

type Phase = "landing" | "intro" | "questions" | "results";

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
      { property: "og:url", content: "/security-career-assessment" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/security-career-assessment" }],
  }),
  component: AssessmentApp,
});

function AssessmentApp() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  const reset = () => {
    setAnswers({});
    setIndex(0);
    setPhase("landing");
  };

  if (phase === "landing") return <Landing onStart={() => setPhase("intro")} />;
  if (phase === "intro") return <Intro onContinue={() => setPhase("questions")} />;
  if (phase === "questions")
    return (
      <Questions
        index={index}
        setIndex={setIndex}
        answers={answers}
        setAnswers={setAnswers}
        onFinish={() => setPhase("results")}
        onBack={() => setPhase("intro")}
      />
    );
  return <Results onRetake={reset} />;
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

function Intro({ onContinue }: { onContinue: () => void }) {
  const { t } = useT();
  const stats = [
    { label: t("sca.intro.stat.time"), value: t("sca.intro.stat.time.value") },
    { label: t("sca.intro.stat.questions"), value: String(questions.length) },
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
        <AssessmentProgress current={0} total={questions.length} />
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
  index,
  setIndex,
  answers,
  setAnswers,
  onFinish,
  onBack,
}: {
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
  const hasAnswer =
    value !== undefined && !(Array.isArray(value) && value.length === 0);

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

function Results({ onRetake }: { onRetake: () => void }) {
  const { t, lang } = useT();
  const [activeId, setActiveId] = useState(careerMatches[0].id);
  const active = useMemo(
    () => careerMatches.find((m) => m.id === activeId) ?? careerMatches[0],
    [activeId],
  );

  return (
    <AssessmentLayout>
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {t("sca.results.eyebrow")}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("sca.results.title")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("sca.results.subtitle")}</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-5">
        <aside className="lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("sca.results.section.top")}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {careerMatches.map((m, i) => (
              <CareerMatchCard
                key={m.id}
                match={m}
                rank={i + 1}
                active={m.id === activeId}
                onSelect={() => setActiveId(m.id)}
              />
            ))}
          </div>
        </aside>

        <div className="lg:col-span-3">
          <div className="rounded-lg border border-border bg-muted/30 p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-accent">
                  {t("sca.results.match.label")}
                </p>
                <h2
                  className="mt-2 text-3xl font-semibold tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {pickText(active.title, lang)}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                  {active.score}
                  <span className="ml-0.5 text-lg text-muted-foreground">%</span>
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-foreground">
              {pickText(active.why, lang)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ResultSection title={t("sca.results.section.strengths")}>
              <ul className="space-y-2">
                {pickList(active.strengths, lang).map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
            <ResultSection title={t("sca.results.section.develop")}>
              <ul className="space-y-2">
                {pickList(active.develop, lang).map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </ResultSection>
            <ResultSection title={t("sca.results.section.education")}>
              <p>{pickText(active.education, lang)}</p>
            </ResultSection>
            <ResultSection title={t("sca.results.section.certs")}>
              <div className="flex flex-wrap gap-2">
                {pickList(active.certifications, lang).map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </ResultSection>
            <ResultSection title={t("sca.results.section.next")}>
              <p>{pickText(active.nextStep, lang)}</p>
            </ResultSection>
            <ResultSection title={t("sca.results.related_jobs")}>
              <p className="text-muted-foreground">{t("sca.results.related_jobs.hint")}</p>
            </ResultSection>
          </div>

          <div className="mt-4">
            <ResultSection title={t("sca.results.profession_guide")}>
              <p className="text-muted-foreground">{t("sca.results.profession_guide.hint")}</p>
            </ResultSection>
          </div>
        </div>
      </div>

      <div className="mt-14 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
        <p>{t("sca.results.disclaimer")}</p>
      </div>

      {/* Continue your journey */}
      <div className="mt-20 border-t border-border pt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("sca.next.title")}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FutureRecommendation
            icon={<Compass className="h-5 w-5" strokeWidth={1.5} />}
            title={t("sca.next.explore.title")}
            body={t("sca.next.explore.body")}
            to="/careers"
          />
          <FutureRecommendation
            icon={<Briefcase className="h-5 w-5" strokeWidth={1.5} />}
            title={t("sca.next.jobs.title")}
            body={t("sca.next.jobs.body")}
            to="/jobs"
          />
          <FutureRecommendation
            icon={<BookOpen className="h-5 w-5" strokeWidth={1.5} />}
            title={t("sca.next.guide.title")}
            body={t("sca.next.guide.body")}
            to="/careers"
          />
          <FutureRecommendation
            icon={<UserPlus className="h-5 w-5" strokeWidth={1.5} />}
            title={t("sca.next.profile.title")}
            body={t("sca.next.profile.body")}
            soon
          />
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <PrimaryLink to="/careers" variant="ghost">
            {t("cta.all_careers")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </PrimaryLink>
          <button
            type="button"
            onClick={onRetake}
            className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            {t("sca.next.retake")}
          </button>
        </div>
      </div>
    </AssessmentLayout>
  );
}
