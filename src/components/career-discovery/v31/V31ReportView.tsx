// The v3.1 report renderer.
//
// ── EVERY CANDIDATE-FACING STRING COMES FROM THE SNAPSHOT ──────────────
//
// A v3.1 snapshot is self-contained: Output B carries the pattern name, the
// section headings and the seven story answers already rendered in the locale
// the candidate took the assessment in. This component looks nothing up. It
// does not re-score, re-rank, re-word or re-translate — reopening a two-year
// old report shows exactly what it said the day it was generated.
//
// Only the surrounding chrome (back links, the internal-test note, the
// version table labels) is translated live, because that is app furniture and
// not report content.
//
// ── DEFENSIVE, NOT FORGIVING ───────────────────────────────────────────
//
// Optional chaining guards a field that a future snapshot revision might not
// carry, so one absent key can never blank the page. It never invents a value.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { CareerCardCreator } from "@/components/career-discovery/v31/CareerCardCreator";
import { FeedbackForm } from "@/components/career-discovery/v31/FeedbackForm";
import { ProfessionRecommendations } from "@/components/career-discovery/v31/ProfessionRecommendations";
import type { DimensionId } from "@/lib/career-discovery/v31/dimensions";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";
import type { ReportSnapshot } from "@/lib/career-discovery/v31/snapshot";
import type { StoredReportVersions } from "@/lib/career-discovery/stored-report.functions";
import { setCareerGoal } from "@/lib/career-discovery/v31-feedback.functions";

/** Presentation order of the seven story questions. Declared here rather than
 *  imported so a change to the live story module can never re-order a report
 *  that was already written. Any heading present in the snapshot but unknown
 *  here is still rendered, after these. */
const QUESTION_ORDER = [
  "howYouWork",
  "givesEnergy",
  "takesEnergy",
  "superpower",
  "growthEdge",
  "whyTheseCareers",
  "whereItLeads",
] as const;

/** The subset shown for a SUPPORTING pattern. Frustrations (takesEnergy) are
 *  shown for the leading pattern only. */
const SUPPORTING_QUESTIONS = new Set<string>([
  "howYouWork",
  "givesEnergy",
  "superpower",
  "growthEdge",
  "whereItLeads",
]);

function orderedQuestions(answers: Record<string, string> | undefined): string[] {
  const keys = Object.keys(answers ?? {});
  const known = QUESTION_ORDER.filter((q) => keys.includes(q));
  const extra = keys.filter((k) => !(QUESTION_ORDER as readonly string[]).includes(k));
  return [...known, ...extra];
}

export function V31ReportView({
  snapshot,
  generatedAt,
  versions,
  isInternalTest = false,
  /** "authenticated" (default): a stored report reached by its owner, with
   *  links into their saved history. "anonymous": a result computed
   *  client-side, straight after completion, before any account exists —
   *  see PublicAssessmentFlow. There is nowhere those links could go yet, so
   *  they are hidden rather than pointed at a page that would 401. */
  mode = "authenticated",
  onCareerCardEvent,
  /** Present only for a claimed, owned report (see cd_career_goals) —
   *  "Set as career goal" is hidden without it rather than shown and
   *  failing against RLS. */
  sessionId,
}: {
  snapshot: ReportSnapshot;
  generatedAt: string;
  versions: StoredReportVersions;
  isInternalTest?: boolean;
  mode?: "authenticated" | "anonymous";
  /** Privacy-safe funnel events (Execution Mandate §34) — forwarded from
   *  CareerCardCreator; the host decides how/whether to record them. */
  onCareerCardEvent?: (name: string, detail?: Record<string, unknown>) => void;
  sessionId?: string | null;
}) {
  // Deliberately NOT `lang` from useT(): everything in this component is
  // either frozen report content (must render in the locale the candidate
  // actually took the assessment in, snapshot.locale) or the small set of
  // live chrome the file header calls out (back links, method labels) via
  // `t`, which is fine to follow the live site toggle. Using the live
  // `lang` for report content (professions, feedback form, Career Card) was
  // the real defect behind "Swedish assessment showed English content" —
  // see v31-layer4-implementation-state.md.
  const { t } = useT();
  const [careerCardMatch, setCareerCardMatch] = useState<ProfessionMatch | null>(null);
  const [goalProfessionId, setGoalProfessionId] = useState<string | null>(null);
  const [settingGoal, setSettingGoal] = useState(false);
  const setGoal = useServerFn(setCareerGoal);

  async function handleSetGoal(match: ProfessionMatch) {
    if (!sessionId || settingGoal) return;
    setSettingGoal(true);
    try {
      await setGoal({ data: { sessionId, professionId: match.professionId } });
      setGoalProfessionId(match.professionId);
    } catch (err) {
      console.error("[v31] set career goal failed", err);
    } finally {
      setSettingGoal(false);
    }
  }

  const dimensionScores: Readonly<Record<DimensionId, number | null>> = Object.fromEntries(
    snapshot.outputA.dimensions.map((d) => [d.id, d.score]),
  ) as Record<DimensionId, number | null>;

  const outputA = snapshot.outputA;
  const outputB = snapshot.outputB;
  const headings = (outputB?.headings ?? {}) as Record<string, string>;
  const leading = outputB?.leading;
  const leadingAnswers = (leading?.answers ?? {}) as Record<string, string>;
  const supporting = outputB?.supporting ?? [];
  const areas = outputA?.areas ?? [];

  const date = new Intl.DateTimeFormat(snapshot.locale === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(snapshot.completedAt ?? generatedAt));

  return (
    <div data-report-contract="v3.1">
      {mode === "authenticated" && (
        <Link
          to="/security-career-assessment/history"
          className="no-print inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("careerDiscovery.report.backToHistory")}
        </Link>
      )}

      <p className="mt-8 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t("careerDiscovery.report.header.product")} · {date}
      </p>

      {isInternalTest && (
        <p
          role="note"
          className="mt-3 flex gap-2 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {t("careerDiscovery.report.header.internalTest")}
        </p>
      )}

      {/* 1 · The pattern — the candidate's result, in their own words. */}
      <p className="mt-10 text-sm font-medium uppercase tracking-widest text-accent">
        {t("careerDiscovery.report.v31.patternEyebrow")}
      </p>
      <h1
        className="mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {leading?.name ?? t("careerDiscovery.report.v31.patternFallback")}
      </h1>
      {outputA?.balanced && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("careerDiscovery.report.v31.balancedNote")}
        </p>
      )}

      <div className="mt-10 space-y-8">
        {orderedQuestions(leadingAnswers).map((q) => (
          <section key={q}>
            <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
              {headings[q] ?? q}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {leadingAnswers[q]}
            </p>
          </section>
        ))}
      </div>

      {/* 2 · Supporting patterns */}
      {supporting.length > 0 && (
        <>
          <h2 className="mt-16 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {t("careerDiscovery.report.v31.supportingTitle")}
          </h2>
          <div className="mt-6 space-y-6">
            {supporting.map((s) => {
              const ans = (s?.answers ?? {}) as Record<string, string>;
              return (
                <div
                  key={s?.patternId ?? s?.name}
                  className="rounded-lg border border-border bg-background p-6"
                >
                  <h3 className="text-base font-semibold text-foreground">{s?.name}</h3>
                  <div className="mt-4 space-y-4">
                    {orderedQuestions(ans)
                      .filter((q) => SUPPORTING_QUESTIONS.has(q))
                      .map((q) => (
                        <div key={q}>
                          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            {headings[q] ?? q}
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {ans[q]}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 3 · Career areas, ranked */}
      {areas.length > 0 && (
        <>
          <h2 className="mt-16 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {t("careerDiscovery.report.v31.areasTitle")}
          </h2>
          {outputA?.areaEvidenceSufficient === false && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("careerDiscovery.report.v31.areasThinEvidence")}
            </p>
          )}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {areas.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-background p-5">
                <span className="text-xs font-medium uppercase tracking-widest text-accent">
                  {String(a.rank).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-base font-semibold text-foreground">{a.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {a.description}
                </p>
                {a.alignedWith?.length > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {t("careerDiscovery.report.v31.alignedWith")}: {a.alignedWith.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {areas.length > 3 && (
            <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {areas.slice(3).map((a) => (
                <li
                  key={a.id}
                  className="flex items-baseline justify-between gap-4 bg-background p-4"
                >
                  <span className="text-sm text-foreground">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {String(a.rank).padStart(2, "0")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 4 · Professions — declared, and honestly empty until calibration. */}
      {snapshot.professions?.available === false && (
        <p
          role="note"
          className="mt-10 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground"
        >
          {t("careerDiscovery.report.v31.professionsPending")}
        </p>
      )}
      {snapshot.professions?.available === true && (
        <>
          <h2 className="mt-16 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {t("careerDiscovery.report.v31.professionsTitle")}
          </h2>
          <div className="mt-6">
            <ProfessionRecommendations
              strongestDirections={snapshot.professions.strongestDirections}
              alsoWorthExploring={snapshot.professions.alsoWorthExploring}
              longerTermPossibilities={snapshot.professions.longerTermPossibilities}
              careerPivots={snapshot.professions.careerPivots}
              locale={snapshot.locale === "en" ? "en" : "sv"}
              onOpenCareerCard={setCareerCardMatch}
              sessionId={sessionId}
              goalProfessionId={goalProfessionId}
              onSetGoal={(match) => void handleSetGoal(match)}
              settingGoal={settingGoal}
              onEvent={onCareerCardEvent}
            />
          </div>
        </>
      )}

      {/* 5 · Method / provenance */}
      <h2 className="mt-16 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {t("careerDiscovery.report.method.title")}
      </h2>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm sm:grid-cols-4">
        {[
          [t("careerDiscovery.report.method.definition"), versions.definition],
          [t("careerDiscovery.report.method.content"), versions.content],
          [t("careerDiscovery.report.method.scoring"), versions.scoring],
          [t("careerDiscovery.report.method.taxonomy"), versions.taxonomy],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-background p-4">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">{k}</dt>
            <dd className="mt-1 font-mono text-xs text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="no-print">
        <FeedbackForm locale={snapshot.locale === "en" ? "en" : "sv"} />
      </div>

      {mode === "authenticated" && (
        <div className="no-print mt-16 flex flex-wrap gap-3 border-t border-border pt-8">
          <Link
            to="/my-career"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("careerDiscovery.report.actions.myCareer")}
          </Link>
          <Link
            to="/security-career-assessment/history"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("careerDiscovery.report.actions.allReports")}
          </Link>
        </div>
      )}

      {snapshot.professions?.available === true && (
        <CareerCardCreator
          open={careerCardMatch !== null}
          onOpenChange={(next) => {
            if (!next) setCareerCardMatch(null);
          }}
          matches={snapshot.professions.matches}
          initialProfessionId={careerCardMatch?.professionId}
          dimensionScores={dimensionScores}
          locale={snapshot.locale === "en" ? "en" : "sv"}
          definitionVersion={snapshot.versions.definitionVersion}
          generatedAt={snapshot.completedAt ?? generatedAt}
          onEvent={onCareerCardEvent}
        />
      )}
    </div>
  );
}
