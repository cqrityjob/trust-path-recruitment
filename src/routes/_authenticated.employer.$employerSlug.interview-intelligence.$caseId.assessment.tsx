// Assess — the recruiter interprets confirmed material against the role.
//
// This lived at the bottom of the review screen, which made Review and Assess
// two names for one page: the workflow said they were different steps and
// clicking either opened the same scroll. They are different cognitive jobs.
// Review decides what counts as material. Assessment decides what the material
// means against a requirement. Running them together encourages the thing the
// product exists to prevent -- forming a judgement while still deciding what
// the evidence is.
//
// The screen is three zones, and the order of them is the argument:
//
//   the requirement  ->  the material  ->  your conclusion
//
// You read what the role asks for BEFORE you read what the candidate said, and
// you write your conclusion last. A layout that put the candidate's words
// first would invite an impression looking for a requirement to attach itself
// to.
//
// No new data model. Same recordAssessment and markAssessed, same governed
// anchors, same levels. The uncertainty note was already accepted by
// recordAssessment and already published in the report; it simply had no field
// on the screen that records it.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  Chip,
  LevelZeroNote,
  MaterialBadge,
  Panel,
  State,
  WorkflowNav,
  interviewErrorMessage,
  uiLabel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Disclosure,
  Eyebrow,
  Nothing,
  RailPanel,
  Section,
  Tally,
} from "@/components/employer/interview/InterviewLayout";
import {
  getInterviewCase,
  markAssessed,
  recordAssessment,
} from "@/lib/interview-intelligence/runtime.functions";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/assessment",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const FINDING_LABEL: Record<string, TranslationKey> = {
  gap: "iiu.find.gap",
  unclear: "iiu.find.unclear",
  contradiction: "iiu.find.contradiction",
  verification: "iiu.find.verification",
};

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const assessFn = useServerFn(recordAssessment);
  const doneFn = useServerFn(markAssessed);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ii"] });

  const [levels, setLevels] = useState<Record<string, number>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [uncertainties, setUncertainties] = useState<Record<string, string>>({});
  // Which half of the form is still missing, per requirement, so the message
  // names the actual gap instead of a generic "fill in the fields".
  const [assessHint, setAssessHint] = useState<Record<string, "level" | "rationale" | null>>({});

  const assess = useMutation({
    mutationFn: (v: {
      questionId: string;
      level: number;
      rationale: string;
      uncertaintyNote: string | null;
    }) =>
      assessFn({
        data: {
          caseId,
          questionId: v.questionId,
          level: v.level,
          rationale: v.rationale,
          uncertaintyNote: v.uncertaintyNote,
        },
      }),
    onSuccess: refresh,
  });
  const finishAssessing = useMutation({
    mutationFn: () => doneFn({ data: { caseId } }),
    onSuccess: refresh,
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const shell = (children: React.ReactNode) => (
    <EmployerAppShell
      employerSlug={ws.workspace!.employerSlug}
      employerName={ws.workspace!.employerName}
      role={ws.workspace!.role}
      status={ws.workspace!.employerStatus}
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
      wide
    >
      {children}
    </EmployerAppShell>
  );

  if (q.isLoading) return shell(<State kind="loading" />);
  if (q.isError) {
    const nf = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={nf ? "denied" : "error"}
        message={nf ? undefined : interviewErrorMessage(q.error, t)}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  // Work completion, never performance. "5 of 8 assessed" says how far the
  // recruiter has got; it says nothing whatever about Marcus Lindqvist.
  const done = d.assessments.length;
  const total = d.questions.length;
  const openItems = d.findings.filter((f) => f.resolutionState !== "resolved");
  const openVerify = openItems.filter((f) => f.findingKind === "verification");
  const openClarify = openItems.filter((f) => f.findingKind !== "verification");

  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;
  const reqMeaning = (c: { definitionSv: string | null; definitionEn: string | null }) =>
    (lang === "en" ? c.definitionEn : c.definitionSv) ?? c.definitionSv;
  const packUntranslated =
    lang === "en" && d.competencies.length > 0 && d.competencies.some((c) => !c.nameEn);

  /** Questions grouped under the requirement they principally explore.
   *  The assessment record stays per question — this is presentation, not a
   *  change to what is stored. */
  const groups = d.competencies
    .map((c) => ({
      requirement: c,
      questions: d.questions.filter((qq) => qq.competencyCodes[0] === c.code),
    }))
    .filter((g) => g.questions.length > 0);
  const orphans = d.questions.filter(
    (qq) => !qq.competencyCodes[0] || !d.competencies.some((c) => c.code === qq.competencyCodes[0]),
  );

  const renderQuestion = (qq: (typeof d.questions)[number], requirementNote: React.ReactNode) => {
    const existing = d.assessments.find((a) => a.questionId === qq.id);
    const evidence = d.evidence.filter((e) => e.questionId === qq.id);
    const questionFindings = openItems.filter((f) => f.questionId === qq.id);
    const anchors = [...qq.anchors].sort((a, b) => a.level - b.level);
    const chosen = levels[qq.id];

    return (
      <li key={qq.id} className="grid gap-5 py-6 lg:grid-cols-[15rem_minmax(0,1fr)_20rem] lg:gap-7">
        {/* ---- 1 · what the role asks for ---- */}
        <div className="min-w-0">
          <Eyebrow>{t("iiu.as2.col.requirement")}</Eyebrow>
          <div className="mt-2">{requirementNote}</div>
          <p className="mt-3 flex items-baseline gap-2 text-sm font-medium leading-relaxed text-foreground">
            <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground">
              {qq.code}
            </span>
            <span>{qq.promptSv}</span>
          </p>
        </div>

        {/* ---- 2 · what the conversation actually produced ---- */}
        <div className="min-w-0">
          <Eyebrow>{t("iiu.as2.col.material")}</Eyebrow>
          {evidence.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-amber-600/40 bg-amber-500/5 p-3.5">
              <p className="text-sm font-medium text-foreground">{t("iiu.as2.nomaterial")}</p>
              {/* The single most important sentence on this screen. An empty
                  column is the shape a low score takes when nobody says what
                  the emptiness means. */}
              <p className="mt-1.5 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.as2.nomaterial.body")}
              </p>
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                params={{ employerSlug, caseId }}
                className="mt-2.5 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("iiu.as2.nomaterial.cta")}
              </Link>
            </div>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {evidence.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-teal-700/30 bg-teal-700/5 p-3.5 text-sm"
                >
                  <p className="leading-relaxed text-foreground">{e.excerpt}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    <MaterialBadge state="confirmed" />
                    <span className="text-xs text-muted-foreground">
                      {qq.code} ·{" "}
                      {e.origin === "human_authored"
                        ? t("iiu.ev.origin.human")
                        : e.origin === "ai_proposed_edited"
                          ? t("iiu.ev.origin.ai_corrected")
                          : t("iiu.ev.origin.ai_confirmed")}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          {questionFindings.length > 0 && (
            <div className="mt-3">
              <Eyebrow>{t("iiu.as2.openitems")}</Eyebrow>
              <ul className="mt-1.5 space-y-1.5">
                {questionFindings.map((f) => (
                  <li key={f.id} className="text-xs leading-relaxed">
                    <Chip tone="attention">{uiLabel(FINDING_LABEL, f.findingKind, t)}</Chip>{" "}
                    <span className="text-foreground">{f.statement}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ---- 3 · what a person concludes ---- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>{t("iiu.as2.col.assessment")}</Eyebrow>
            <MaterialBadge state="assessment" />
          </div>

          {existing ? (
            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={existing.level === 0 ? "attention" : "confirmed"}>
                  {t("iiu.ev.level")} {existing.level}
                </Chip>
                <Chip tone="confirmed">{t("iiu.as2.recorded")}</Chip>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-foreground">{existing.rationale}</p>
              {existing.uncertaintyNote && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium">{t("iiu.as2.unclear")}: </span>
                  {existing.uncertaintyNote}
                </p>
              )}
            </div>
          ) : (
            <form
              className="mt-2 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const lvl = levels[qq.id];
                const rat = rationales[qq.id] ?? "";
                // Silent returns taught the interviewer nothing about
                // why the button did nothing. Say it instead.
                if (lvl === undefined) {
                  setAssessHint((st) => ({ ...st, [qq.id]: "level" }));
                  return;
                }
                if (rat.trim() === "") {
                  setAssessHint((st) => ({ ...st, [qq.id]: "rationale" }));
                  return;
                }
                setAssessHint((st) => ({ ...st, [qq.id]: null }));
                assess.mutate({
                  questionId: qq.id,
                  level: lvl,
                  rationale: rat,
                  uncertaintyNote: (uncertainties[qq.id] ?? "").trim() || null,
                });
              }}
            >
              {/* The database refuses a level above 0 without confirmed
                  evidence, and rightly so. Saying that AFTER the save button
                  is a bad way to teach a rule the interviewer could have been
                  told up front — which is exactly how the owner met it. */}
              {evidence.length === 0 && (
                <Panel tone="attention" title={t("iiu.ev.needevidence.title")}>
                  <p>{t("iiu.ev.needevidence.body")}</p>
                  <p className="mt-2">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => setLevels((st) => ({ ...st, [qq.id]: 0 }))}
                    >
                      {t("iiu.ev.needevidence.cta.zero")}
                    </button>
                  </p>
                </Panel>
              )}

              <fieldset>
                <legend className="text-xs font-medium text-foreground">{t("iiu.ev.level")}</legend>
                <div className="mt-1.5 space-y-1.5">
                  {anchors.map((a) => {
                    // Levels 1-4 are unreachable until evidence exists.
                    // Disabled rather than hidden: the interviewer should see
                    // the scale they are working within.
                    const locked = a.level > 0 && evidence.length === 0;
                    const selected = chosen === a.level;
                    return (
                      <label
                        key={a.id}
                        title={locked ? t("iiu.ev.needevidence.locked") : undefined}
                        className={`flex w-full cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors ${
                          locked ? "cursor-not-allowed border-border opacity-50" : ""
                        } ${
                          selected
                            ? "border-accent bg-accent/5 font-semibold"
                            : "border-border hover:bg-muted/50"
                        } ${a.level === 0 && !selected ? "bg-amber-500/5" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`lvl-${qq.id}`}
                          value={a.level}
                          className="sr-only"
                          disabled={locked}
                          checked={selected}
                          onChange={() => setLevels((st) => ({ ...st, [qq.id]: a.level }))}
                        />
                        <span
                          aria-hidden="true"
                          className={`mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] tabular-nums ${
                            selected
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {a.level}
                        </span>
                        <span className="min-w-0 leading-snug text-foreground">
                          {(lang === "en" ? a.labelEn : a.labelSv) ?? a.labelSv}
                          {locked && (
                            <span className="sr-only"> ({t("iiu.ev.needevidence.locked")})</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* The full governed wording, one click away. Five anchor
                  paragraphs open beside every question would bury the form. */}
              <Disclosure summary={t("iiu.as2.scale")} className="!px-3 !py-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.as2.scale.note")}
                </p>
                <dl className="mt-2 space-y-2">
                  {anchors.map((a) => (
                    <div key={`anchor-${a.id}`}>
                      <dt className="text-xs font-semibold text-foreground">
                        {a.level} — {(lang === "en" ? a.labelEn : a.labelSv) ?? a.labelSv}
                      </dt>
                      <dd className="text-xs leading-relaxed text-muted-foreground">
                        {(lang === "en" ? a.anchorEn : a.anchorSv) ?? a.anchorSv}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>

              <div>
                <label htmlFor={`rat-${qq.id}`} className="text-xs font-medium text-foreground">
                  {t("iiu.as2.reasoning")}
                </label>
                <textarea
                  id={`rat-${qq.id}`}
                  rows={3}
                  className={FIELD}
                  aria-describedby={`rat-hint-${qq.id}`}
                  value={rationales[qq.id] ?? ""}
                  onChange={(e) => setRationales((s) => ({ ...s, [qq.id]: e.target.value }))}
                />
                <p id={`rat-hint-${qq.id}`} className="mt-1 text-[11px] text-muted-foreground">
                  {t("iiu.as2.reasoning.hint")}
                </p>
              </div>

              {/* Already accepted by recordAssessment, already published in the
                  report, and until now impossible to write. */}
              <div>
                <label htmlFor={`unc-${qq.id}`} className="text-xs font-medium text-foreground">
                  {t("iiu.as2.unclear")}
                </label>
                <textarea
                  id={`unc-${qq.id}`}
                  rows={2}
                  className={FIELD}
                  aria-describedby={`unc-hint-${qq.id}`}
                  value={uncertainties[qq.id] ?? ""}
                  onChange={(e) => setUncertainties((s) => ({ ...s, [qq.id]: e.target.value }))}
                />
                <p id={`unc-hint-${qq.id}`} className="mt-1 text-[11px] text-muted-foreground">
                  {t("iiu.as2.unclear.hint")}
                </p>
              </div>

              {/* Three different situations, three different messages. Reusing
                  the evidence guidance when a level simply had not been picked
                  told the interviewer to go and find evidence they already had. */}
              {assessHint[qq.id] === "level" && (
                <p role="alert" className="text-xs text-destructive">
                  {evidence.length === 0 ? t("iiu.ev.needevidence.body") : t("iiu.ev.hint.level")}
                </p>
              )}
              {assessHint[qq.id] === "rationale" && (
                <p role="alert" className="text-xs text-destructive">
                  {t("iiu.ev.rationale.missing")}
                </p>
              )}
              <button type="submit" className={PRIMARY_BUTTON} disabled={assess.isPending}>
                {t("iiu.ev.save")}
              </button>
            </form>
          )}
        </div>
      </li>
    );
  };

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId }}
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      <div className="mt-3">
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
          action={
            done > 0 ? (
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/summary"
                params={{ employerSlug, caseId }}
                className={PRIMARY_BUTTON}
              >
                {t("iiu.as.tosummary")}
              </Link>
            ) : undefined
          }
        />
      </div>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="assess"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <Section id="s-assess" title={t("iiu.as2.title")} description={t("iiu.as2.lead")}>
            {/* Both of these are true of every row on the page, so they are
                said once. Eight copies of an amber paragraph is not eight
                times the emphasis; it is a screen that looks like it is
                shouting. */}
            <div className="mb-3">
              <LevelZeroNote />
            </div>
            <p className="mb-4 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
              {t("iiu.as2.edit.locked")}
            </p>

            {/* The pack is authored in one language and locked to its version.
                An English-reading assessor meeting Swedish requirement text
                should be told that is deliberate, not a gap. */}
            {packUntranslated && (
              <p className="mb-5 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.pp.packlocale.short")}
              </p>
            )}

            {groups.map((g) => (
              <section key={g.requirement.id} aria-labelledby={`req-${g.requirement.id}`}>
                <h3
                  id={`req-${g.requirement.id}`}
                  className="mt-6 flex items-baseline gap-2 border-b border-border pb-2 text-sm font-semibold text-foreground"
                >
                  <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                    {g.requirement.code}
                  </span>
                  {reqName(g.requirement)}
                </h3>
                {/* The requirement is written out once for the group. Three
                    of the eight questions explore the same one, and printing
                    its definition and indicators beside each of them filled a
                    column with the same paragraph three times. */}
                <ul className="divide-y divide-border">
                  {g.questions.map((qq, i) =>
                    renderQuestion(
                      qq,
                      i === 0 ? (
                        <RequirementNote
                          name={reqName(g.requirement)}
                          meaning={reqMeaning(g.requirement)}
                          indicators={g.requirement.indicatorsSv}
                          t={t}
                        />
                      ) : (
                        <p className="flex gap-2 text-sm">
                          <span
                            aria-hidden="true"
                            className="mt-px font-mono text-xs text-muted-foreground"
                          >
                            {g.requirement.code}
                          </span>
                          <span className="font-medium leading-snug text-foreground">
                            {reqName(g.requirement)}
                          </span>
                        </p>
                      ),
                    ),
                  )}
                </ul>
              </section>
            ))}

            {orphans.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {orphans.map((qq) => renderQuestion(qq, null))}
              </ul>
            )}

            {assess.isError && (
              <div className="mt-4">
                <Panel tone="governance" role="alert" title={t("iiu.ev.savefailed")}>
                  <p className="whitespace-pre-line">{interviewErrorMessage(assess.error, t)}</p>
                </Panel>
              </div>
            )}

            {d.status === "evidence_review" && d.assessments.length === d.questions.length && (
              <button
                type="button"
                className={`${PRIMARY_BUTTON} mt-6`}
                onClick={() => finishAssessing.mutate()}
                disabled={finishAssessing.isPending}
              >
                {t("iiu.ev.done")}
              </button>
            )}
          </Section>
        </div>

        {/* Workflow completion, and what is still open. Deliberately counts
            and a plain fraction: a ring or a percentage here would be read as
            how well the candidate did, which is exactly the reading this
            product must never invite. */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <RailPanel
            id="s-progress"
            title={t("iiu.as2.overview")}
            note={t("iiu.as2.overview.note")}
          >
            <div className="space-y-4">
              <Tally value={`${done} / ${total}`} label={t("iiu.as2.assessed")} />
              <Tally
                value={openVerify.length}
                label={t("iiu.as2.openverify")}
                tone={openVerify.length > 0 ? "attention" : "neutral"}
              />
              <Tally
                value={openClarify.length}
                label={t("iiu.as2.openclarify")}
                tone={openClarify.length > 0 ? "attention" : "neutral"}
              />
            </div>

            {openItems.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("iiu.as.open")}
                </h3>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                  {openItems.slice(0, 5).map((f) => (
                    <li key={f.id}>{f.statement}</li>
                  ))}
                </ul>
              </>
            )}
          </RailPanel>

          {d.evidence.length === 0 && (
            <div className="mt-4">
              <Nothing hint={t("iiu.as2.nomaterial.body")}>{t("iiu.as2.nomaterial")}</Nothing>
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                params={{ employerSlug, caseId }}
                className={`${BUTTON} mt-3`}
              >
                {t("iiu.as2.nomaterial.cta")}
              </Link>
            </div>
          )}
        </aside>
      </div>
    </>,
  );
}

/** What the role asks for, in the pack's own words. Rendered once per
 *  question so the requirement is beside the material rather than a scroll
 *  above it. */
function RequirementNote({
  name,
  meaning,
  indicators,
  t,
}: {
  name: string;
  meaning: string | null;
  indicators: readonly string[];
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold leading-snug text-foreground">{name}</p>
      {meaning && (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("iiu.as2.meaning")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{meaning}</p>
        </>
      )}
      {indicators.length > 0 && (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("iiu.as2.observable")}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {indicators.map((i) => (
              <li
                key={i}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] leading-snug text-muted-foreground"
              >
                {i}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
