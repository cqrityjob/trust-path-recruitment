// Your Possible Path — a compact visual pathway (Master Completion Mandate
// item 9's "Possible Path" section: "visual: if current profession known:
// YOU ARE HERE→NEXT→DEVELOP→FUTURE; if unknown:
// STARTING POINT→EXPLORE→DEVELOP, never fabricate current profession").
//
// Purely presentational — reuses stage buckets ReportSnapshot already
// computed (professions.matches, .longerTermPossibilities,
// .currentProfessionMatch) and the frozen currentProfession title (item 8).
// No new engine logic, no re-scoring, nothing invented: when
// snapshot.currentProfession is absent, the "YOU ARE HERE" step never
// renders — the STARTING POINT step is a deliberately generic sentence,
// never a guessed profession (item 2).

import { ArrowRight } from "lucide-react";
import { translateFor } from "@/i18n/context";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";
import type { ReportSnapshot } from "@/lib/career-discovery/v31/snapshot";

type Locale = "sv" | "en";

function titleList(matches: readonly ProfessionMatch[], locale: Locale, max = 3): string {
  return matches
    .slice(0, max)
    .map((m) => (locale === "sv" ? m.titleSv : m.titleEn))
    .join(" · ");
}

interface PathStep {
  readonly eyebrow: string;
  readonly body: string;
}

function Step({ step }: { step: PathStep }) {
  return (
    <div className="min-w-[180px] flex-1 rounded-lg border border-border bg-background p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
        {step.eyebrow}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{step.body}</p>
    </div>
  );
}

function StepConnector() {
  return (
    <div className="flex shrink-0 items-center justify-center px-0 py-1 sm:px-2 sm:py-0">
      <ArrowRight
        className="h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0"
        aria-hidden="true"
      />
    </div>
  );
}

export function PossiblePathway({
  snapshot,
  locale,
}: {
  snapshot: ReportSnapshot;
  locale: Locale;
}) {
  if (snapshot.professions.available !== true) return null;

  const t = translateFor(locale);
  const { matches, longerTermPossibilities, currentProfessionMatch } = snapshot.professions;
  const nextStepMatches = matches.filter((m) => m.stage === "possible_next_step");
  const exploreNowMatches = matches.filter((m) => m.stage === "explore_now");

  const steps: PathStep[] = [];

  if (snapshot.currentProfession) {
    const title =
      locale === "sv" ? snapshot.currentProfession.titleSv : snapshot.currentProfession.titleEn;
    steps.push({ eyebrow: t("careerDiscovery.report.v31.youAreHereEyebrow"), body: title });
    if (nextStepMatches.length > 0) {
      steps.push({
        eyebrow: t("careerDiscovery.report.v31.yourPath.next"),
        body: titleList(nextStepMatches, locale),
      });
    }
    if (currentProfessionMatch) {
      steps.push({
        eyebrow: t("careerDiscovery.report.v31.yourPath.develop"),
        body: t("careerDiscovery.report.v31.developCurrentRole"),
      });
    }
    if (longerTermPossibilities.length > 0) {
      steps.push({
        eyebrow: t("careerDiscovery.report.v31.yourPath.future"),
        body: titleList(longerTermPossibilities, locale),
      });
    }
  } else {
    // Item 2: current profession unknown -> no "YOU ARE HERE" step, ever.
    // A generic starting point, never a guessed one.
    steps.push({
      eyebrow: t("careerDiscovery.report.v31.yourPath.startingPoint"),
      body: t("careerDiscovery.report.v31.yourPath.startingPointBody"),
    });
    if (exploreNowMatches.length > 0) {
      steps.push({
        eyebrow: t("careerDiscovery.report.v31.yourPath.explore"),
        body: titleList(exploreNowMatches, locale),
      });
    }
    if (longerTermPossibilities.length > 0) {
      steps.push({
        eyebrow: t("careerDiscovery.report.v31.yourPath.develop"),
        body: titleList(longerTermPossibilities, locale),
      });
    }
  }

  // Nothing meaningful to draw a path with (e.g. only strongestDirections
  // exist and none of the other buckets do) -- the existing Career
  // Directions list already covers that case; no need for a one-box path.
  if (steps.length < 2) return null;

  return (
    <section className="mt-16">
      <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {t("careerDiscovery.report.v31.yourPath.title")}
      </h2>
      <div className="mt-6 flex flex-col items-stretch sm:flex-row sm:items-stretch">
        {steps.map((step, i) => (
          <div key={step.eyebrow} className="flex flex-col sm:contents">
            <Step step={step} />
            {i < steps.length - 1 && <StepConnector />}
          </div>
        ))}
      </div>
    </section>
  );
}
