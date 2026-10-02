import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  MATURITY_LEVELS,
  SECURITY_DOMAINS,
  baselineQuestions,
  type BaselineQuestion,
} from "@/lib/security-work/programme/content/baseline-v1";
import { answerMap, computeMaturity } from "@/lib/security-work/programme/maturity";
import { potentialGapsFromBaseline } from "@/lib/security-work/programme/gaps";
import {
  answerSecurityBaseline,
  completeSecurityBaseline,
  startSecurityBaseline,
} from "@/lib/security-work/programme/programme.functions";
import type {
  BaselineAnswerValue,
  Market,
  SecurityDomainId,
} from "@/lib/security-work/programme/types";
import { cn } from "@/lib/utils";
import { useSecurityWorkspace } from "./context";
import { useWorkText } from "./analysis-ui";
import { Explain, Tag, programmeKey, useProgramme } from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeading,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
} from "./ui";

const ANSWERS: BaselineAnswerValue[] = ["yes", "partly", "no", "not_applicable"];

function MaturityBadge({ level, notAssessed }: { level: number; notAssessed: boolean }) {
  const { t } = useT();
  const tone = notAssessed ? "neutral" : level >= 3 ? "good" : level === 2 ? "neutral" : "warn";
  return (
    <Tag tone={tone}>
      {notAssessed
        ? t("sw.prog.maturity.not_assessed")
        : `${level} · ${t(`sw.prog.maturity.${level as 1 | 2 | 3 | 4}`)}`}
    </Tag>
  );
}

/**
 * Security Baseline: quick mode (3–4 questions per domain, ~15 minutes) and
 * a detailed review per domain. Answers are the only thing stored; content,
 * levels and the maturity ladder live in the repository, versioned.
 */
export function SecurityBaselinePage() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const start = useServerFn(startSecurityBaseline);
  const answer = useServerFn(answerSecurityBaseline);
  const complete = useServerFn(completeSecurityBaseline);
  const [market, setMarket] = useState<Market>(workspace.language === "sv" ? "se" : "global");
  // null = default (first unfinished domain open); "" = everything collapsed.
  const [expanded, setExpanded] = useState<SecurityDomainId | "" | null>(null);
  const [focused, setFocused] = useState<BaselineQuestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  useAssistantContext({
    kind: "baseline_question",
    id: focused?.id ?? null,
    title: focused ? focused.text[lang] : t("sw.prog.nav.baseline"),
  });
  if (programme.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  const assessment = programme.data.baseline.assessment;
  const begin = async (mode: "quick" | "detailed") => {
    setBusy("start");
    setError(null);
    const result = await start({
      data: {
        workspaceId: workspace.id,
        market: assessment ? (assessment.market as Market) : market,
        mode,
      },
    });
    if (!result.ok) setError(result.code);
    await refresh();
    setBusy(null);
  };
  if (!assessment) {
    return (
      <>
        <PageHeading
          title={t("sw.prog.nav.baseline")}
          body={l(
            "Hur strukturerat är ert säkerhetsarbete i dag? Inte en revision – en snabb, ärlig bild.",
            "How structured is your security work today? Not an audit: a quick, honest picture.",
          )}
          action={<AssistantButton />}
        />
        <EmptyState
          title={l("Snabbt nuläge på cirka 15 minuter", "Quick baseline in about 15 minutes")}
          body={l(
            "Tre till fyra frågor per område med svaren Ja, Delvis, Nej eller Inte tillämpligt. Svar med Nej eller Delvis blir möjliga gap som du själv väljer att registrera. Du kan fördjupa område för område senare.",
            "Three to four questions per domain, answered Yes, Partly, No or Not applicable. No and Partly become potential gaps that you choose to record. You can go deeper domain by domain later.",
          )}
        >
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={l("Innehållspaket", "Content pack")}
                hint={l(
                  "Den globala basen gäller alla; Sverige lägger till svenska krav.",
                  "The global base applies to everyone; Sweden adds Swedish requirements.",
                )}
              >
                {(id, hintId) => (
                  <select
                    id={id}
                    aria-describedby={hintId}
                    className={cn(selectClass, "max-w-xs")}
                    value={market}
                    onChange={(e) => setMarket(e.target.value as Market)}
                  >
                    <option value="se">{l("Global bas + Sverige", "Global base + Sweden")}</option>
                    <option value="global">{l("Global bas", "Global base")}</option>
                  </select>
                )}
              </Field>
              <WorkButton
                disabled={busy !== null}
                onClick={() => void begin("quick")}
                data-testid="sw-baseline-start"
              >
                {l("Starta snabbt nuläge", "Start quick baseline")}
              </WorkButton>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sw.viewer")}</p>
          )}
        </EmptyState>
        <WorkError code={error} />
      </>
    );
  }
  const questions = baselineQuestions(assessment.market as Market);
  const answers = answerMap(programme.data.baseline.answers);
  const quick = computeMaturity(questions, answers, "quick");
  const detailed = computeMaturity(questions, answers, "detailed");
  const quickDone = quick.answered >= quick.total;
  const potential = potentialGapsFromBaseline(
    questions,
    answers,
    programme.data.gaps,
    assessment.id,
  );
  const setAnswer = async (question: BaselineQuestion, value: BaselineAnswerValue) => {
    setBusy(question.id);
    setError(null);
    const result = await answer({
      data: {
        workspaceId: workspace.id,
        baselineId: assessment.id,
        questionId: question.id,
        answer: value,
        note: "",
      },
    });
    if (!result.ok) setError(result.code);
    await refresh();
    setBusy(null);
  };
  const showDetailed = assessment.mode === "detailed";
  return (
    <>
      <PageHeading
        title={t("sw.prog.nav.baseline")}
        body={l(
          "Svara utifrån hur det faktiskt fungerar i dag. Mognaden räknas ut av fasta regler; ett område är aldrig bättre än sitt svagaste svar.",
          "Answer from how things actually work today. Maturity is calculated by fixed rules; a domain is never better than its weakest answer.",
        )}
        action={<AssistantButton />}
      />
      <section className={`${panelClass} space-y-3`} data-testid="sw-baseline-summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {showDetailed
                ? l("Fördjupad genomgång", "Detailed review")
                : l("Snabbt nuläge", "Quick baseline")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {assessment.content_version} ·{" "}
              {assessment.market === "se"
                ? l("Global bas + Sverige", "Global base + Sweden")
                : l("Global bas", "Global base")}{" "}
              · {assessment.assessment_date}
              {assessment.status === "completed" && ` · ${l("Slutförd", "Completed")}`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>{l("Säkerhetsmognad", "Security maturity")}:</span>
            <MaturityBadge
              level={(showDetailed ? detailed : quick).overall}
              notAssessed={(showDetailed ? detailed : quick).overallNotAssessed}
            />
          </div>
        </div>
        <p className="text-sm">
          {quick.answered}/{quick.total} {l("snabbfrågor besvarade", "quick questions answered")}
          {showDetailed && ` · ${detailed.answered}/${detailed.total} ${l("totalt", "in total")}`}
          {potential.length > 0 && (
            <>
              {" · "}
              <Link
                to="/security-work/$workspaceId/gaps"
                params={{ workspaceId: workspace.id }}
                className="text-accent underline-offset-4 hover:underline"
              >
                {potential.length}{" "}
                {l("möjliga gap att ta ställning till", "potential gaps to decide on")}
              </Link>
            </>
          )}
        </p>
        {canEdit && assessment.status === "open" && (
          <div className="flex flex-wrap gap-2">
            {!showDetailed && (
              <WorkButton
                variant="outline"
                disabled={busy !== null}
                onClick={() => void begin("detailed")}
                data-testid="sw-baseline-detailed"
              >
                {l("Öppna fördjupad genomgång", "Open detailed review")}
              </WorkButton>
            )}
            {quickDone && (
              <WorkButton
                variant="outline"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("complete");
                  const result = await complete({
                    data: {
                      workspaceId: workspace.id,
                      baselineId: assessment.id,
                      version: assessment.version,
                      mode: assessment.mode as "quick" | "detailed",
                    },
                  });
                  if (!result.ok) setError(result.code);
                  await refresh();
                  setBusy(null);
                }}
              >
                {l("Markera nuläget som slutfört", "Mark the baseline as completed")}
              </WorkButton>
            )}
          </div>
        )}
      </section>
      <WorkError code={error} />
      <ol className="space-y-3">
        {SECURITY_DOMAINS.map((domain, index) => {
          const summary = (showDetailed ? detailed : quick).domains.find(
            (row) => row.domain === domain.id,
          )!;
          const own = questions.filter(
            (question) => question.domain === domain.id && (showDetailed || question.quick),
          );
          const isOpen =
            expanded === domain.id ||
            (!expanded && index === 0 && summary.answered < summary.total);
          return (
            <li
              key={domain.id}
              className="rounded-xl border border-border bg-card"
              data-testid={`sw-domain-${domain.id}`}
            >
              <button
                type="button"
                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded(isOpen ? "" : domain.id)
                }
              >
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {index + 1}. {domain.title[lang]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {domain.summary[lang]} · {summary.answered}/{summary.total}
                  </span>
                </span>
                <MaturityBadge level={summary.level} notAssessed={summary.notAssessed} />
              </button>
              {isOpen && (
                <ol className="divide-y divide-border border-t border-border">
                  {own.map((question) => {
                    const current = answers[question.id];
                    return (
                      <li
                        key={question.id}
                        className="space-y-3 px-4 py-4"
                        data-testid="sw-question"
                        data-question={question.id}
                        data-answer={current ?? ""}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium leading-snug">{question.text[lang]}</p>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t(`sw.prog.maturity.${question.level}`)}
                            {!question.quick && ` · ${l("fördjupning", "detailed")}`}
                          </span>
                        </div>
                        <div
                          className="flex flex-wrap gap-2"
                          role="group"
                          aria-label={question.text[lang]}
                        >
                          {ANSWERS.map((value) => (
                            <WorkButton
                              key={value}
                              variant={current === value ? "default" : "outline"}
                              aria-pressed={current === value}
                              className="min-h-10"
                              disabled={!canEdit || assessment.status !== "open" || busy !== null}
                              onClick={() => void setAnswer(question, value)}
                            >
                              {t(`sw.prog.answer.${value}`)}
                            </WorkButton>
                          ))}
                        </div>
                        <details
                          className="text-sm"
                          onToggle={(e) =>
                            e.currentTarget.open ? setFocused(question) : setFocused(null)
                          }
                        >
                          <summary className="min-h-8 cursor-pointer text-accent">
                            {l(
                              "Varför det spelar roll och exempel på underlag",
                              "Why it matters and example evidence",
                            )}
                          </summary>
                          <div className="mt-2 space-y-2 text-muted-foreground">
                            <p>
                              <span className="font-semibold text-foreground">
                                {l("Varför", "Why")}:{" "}
                              </span>
                              {question.why[lang]}
                            </p>
                            <p>
                              <span className="font-semibold text-foreground">
                                {l("Exempel på underlag", "Example evidence")}:{" "}
                              </span>
                              {question.evidence[lang]}
                            </p>
                            <AssistantButton
                              label={l(
                                "Förklara frågan med Security AI",
                                "Explain this question with Security AI",
                              )}
                              className="min-h-10"
                            />
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      <Explain title={l("Så räknas mognaden", "How maturity is calculated")}>
        <ul className="list-disc space-y-1 pl-5">
          {MATURITY_LEVELS.map((level) => (
            <li key={level.level}>
              <span className="font-semibold text-foreground">
                {level.level} · {level.title[lang]}
              </span>
              : {level.summary[lang]}
            </li>
          ))}
        </ul>
        <p>
          {l(
            "En nivå nås bara när alla frågor för den nivån och nivåerna under är besvarade med Ja. Delvis och Nej stoppar; Inte tillämpligt tas bort ur beräkningen. Det snabba nuläget når som högst Uppföljt; Optimerat kräver fördjupad genomgång.",
            "A level is reached only when every question for that level and the levels below is answered Yes. Partly and No stop the ladder; Not applicable is removed from it. The quick baseline reaches Measured at most; Optimised requires the detailed review.",
          )}
        </p>
      </Explain>
    </>
  );
}
