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

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  Chip,
  LevelZeroNote,
  MaterialBadge,
  NextStepLink,
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
)({
  ssr: false,
  component: Page,
  errorComponent: EmployerErrorState,
  // `?q=Q2` is how the review screen sends the recruiter back to the exact
  // question they went to fetch material for. Without it the round trip ends
  // at the top of a page of eight and they have to find their place again.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const raw = typeof search.q === "string" ? search.q.trim() : "";
    return /^Q\d{1,2}$/.test(raw) ? { q: raw } : {};
  },
});

/** The scale a recruiter reads.
 *
 *  The pack's own anchor wording -- "Riskfyllt/otillräckligt",
 *  "Grundläggande/ojämnt" -- is pinned governed content: it is inside
 *  scp_interview_pack_content_hash(), every case pins that hash, and a pack
 *  review is bound to the hash it saw. Rewriting it in a migration would
 *  invalidate the pinned hash on every existing case, so it stays exactly as
 *  it is and remains one click away, labelled as what the assessment is
 *  recorded against.
 *
 *  What changes is the language a person chooses in. These say what the
 *  RESPONSE demonstrated, never what the candidate is: no pass, no fail, no
 *  suitability. */
const LEVEL_LABEL: Record<number, TranslationKey> = {
  0: "iiu.as2.lvl.0",
  1: "iiu.as2.lvl.1",
  2: "iiu.as2.lvl.2",
  3: "iiu.as2.lvl.3",
  4: "iiu.as2.lvl.4",
};

const LEVEL_BODY: Record<number, TranslationKey> = {
  0: "iiu.as2.lvl.0.body",
  1: "iiu.as2.lvl.1.body",
  2: "iiu.as2.lvl.2.body",
  3: "iiu.as2.lvl.3.body",
  4: "iiu.as2.lvl.4.body",
};

/** A level from the record, kept inside the scale the copy covers. A pack that
 *  one day defines a level 5 must not render `undefined` at a recruiter. */
const clampLevel = (level: number): number => (level >= 0 && level <= 4 ? level : 0);

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
  const navigate = useNavigate();

  const getFn = useServerFn(getInterviewCase);
  const assessFn = useServerFn(recordAssessment);
  const doneFn = useServerFn(markAssessed);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ii"] });

  const { q: focusCode } = Route.useSearch();

  const [levels, setLevels] = useState<Record<string, number>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [uncertainties, setUncertainties] = useState<Record<string, string>>({});
  // Reopening a recorded assessment, and the documented reason the database
  // requires before it will supersede one.
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editReasons, setEditReasons] = useState<Record<string, string>>({});
  // Which part of the form is still missing, per question, so the message
  // names the actual gap instead of a generic "fill in the fields".
  const [assessHint, setAssessHint] = useState<
    Record<string, "level" | "rationale" | "reason" | null>
  >({});

  // A half-written assessment must survive the trip to review and back. It is
  // per case and per session -- a draft judgement is not something to leave on
  // a shared machine for longer than the tab is open.
  const draftKey = `ii.assess.draft.${caseId}`;
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        levels?: Record<string, number>;
        rationales?: Record<string, string>;
        uncertainties?: Record<string, string>;
      };
      if (saved.levels) setLevels(saved.levels);
      if (saved.rationales) setRationales(saved.rationales);
      if (saved.uncertainties) setUncertainties(saved.uncertainties);
    } catch {
      /* a browser that refuses session storage still gets a working form */
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({ levels, rationales, uncertainties }),
      );
    } catch {
      /* ignore */
    }
  }, [draftKey, levels, rationales, uncertainties]);

  // Land on the question the review screen sent us back to.
  useEffect(() => {
    if (!focusCode) return;
    const el = document.getElementById(`q-${focusCode}`);
    if (el) el.scrollIntoView({ block: "center" });
  }, [focusCode, q.dataUpdatedAt]);

  const assess = useMutation({
    mutationFn: (v: {
      questionId: string;
      level: number;
      rationale: string;
      uncertaintyNote: string | null;
      /** Set only when replacing a recorded assessment. The database refuses a
       *  second assessment of the same question without one, precisely so a
       *  changed judgement leaves a trace. */
      supersedeReason: string | null;
    }) =>
      assessFn({
        data: {
          caseId,
          questionId: v.questionId,
          level: v.level,
          rationale: v.rationale,
          uncertaintyNote: v.uncertaintyNote,
          supersedeReason: v.supersedeReason,
        },
      }),
    onSuccess: (_result, v) => {
      // The saved question leaves edit mode and drops its draft; everything
      // else the recruiter has half-written stays exactly where it was.
      setEditing((st) => ({ ...st, [v.questionId]: false }));
      setEditReasons((st) => ({ ...st, [v.questionId]: "" }));
      refresh();
    },
  });
  // Finishing the assessment is the end of the stage, so it lands the
  // recruiter on the next one: the report, showing what it will be built
  // from. Nothing is locked by arriving there.
  const finishAssessing = useMutation({
    mutationFn: () => doneFn({ data: { caseId } }),
    onSuccess: () => {
      refresh();
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/report",
        params: { employerSlug, caseId },
      });
    },
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
  // Editable until the record is released. The database supersedes rather than
  // overwrites at any point; what the product locks is the published report.
  const released = d.report?.status === "final" || d.status === "reported";

  const withMaterial = d.questions.filter((qq) => d.evidence.some((e) => e.questionId === qq.id));
  const blockedQuestions = d.questions.filter(
    (qq) => !d.evidence.some((e) => e.questionId === qq.id),
  );

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

  /* ---------------------------------------------------------------- */
  /* One question: requirement, material, conclusion                    */
  /* ---------------------------------------------------------------- */

  const renderQuestion = (qq: (typeof d.questions)[number], requirementNote: React.ReactNode) => {
    const existing = d.assessments.find((a) => a.questionId === qq.id);
    const evidence = d.evidence.filter((e) => e.questionId === qq.id);
    const questionFindings = openItems.filter((f) => f.questionId === qq.id);
    const anchors = [...qq.anchors].sort((a, b) => a.level - b.level);
    const chosen = levels[qq.id];
    const blocked = evidence.length === 0;
    const isEditing = editing[qq.id] === true;
    const showForm = !existing || isEditing;
    const highlighted = focusCode !== undefined && focusCode === qq.code;

    /** The pinned pack wording for a level, kept beside the recruiter copy so
     *  the person choosing can see what is actually recorded. */
    const anchorFor = (level: number) => anchors.find((a) => a.level === level) ?? null;

    const levelRow = (level: 0 | 1 | 2 | 3 | 4) => {
      const a = anchorFor(level);
      if (!a) return null;
      // Levels 1-4 are unreachable until confirmed material exists. Shown
      // rather than hidden: a recruiter should see the scale they are working
      // within, and the panel above says plainly why it is closed.
      const locked = level > 0 && blocked;
      const selected = chosen === level;
      return (
        <label
          key={a.id}
          className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
            locked
              ? "cursor-not-allowed border-border opacity-55"
              : selected
                ? "cursor-pointer border-accent bg-accent/5"
                : "cursor-pointer border-border hover:bg-muted/50"
          }`}
        >
          <input
            type="radio"
            name={`lvl-${qq.id}`}
            value={level}
            className="sr-only"
            disabled={locked}
            checked={selected}
            onChange={() => setLevels((st) => ({ ...st, [qq.id]: level }))}
          />
          <span
            aria-hidden="true"
            className={`mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] tabular-nums ${
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {level}
          </span>
          <span className="min-w-0">
            <span
              className={`block text-xs leading-snug text-foreground ${selected ? "font-semibold" : ""}`}
            >
              {t(LEVEL_LABEL[level])}
              {locked && <span className="sr-only"> ({t("iiu.ev.needevidence.locked")})</span>}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              {t(LEVEL_BODY[level])}
            </span>
          </span>
        </label>
      );
    };

    return (
      <li
        key={qq.id}
        id={`q-${qq.code}`}
        className={`grid scroll-mt-24 gap-5 py-6 lg:grid-cols-[15rem_minmax(0,1fr)_20rem] lg:gap-7 ${
          highlighted ? "-mx-3 rounded-lg bg-accent/5 px-3 ring-1 ring-accent/40" : ""
        }`}
      >
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
          {blocked ? (
            /* Not a dead end. What is missing, why it matters, and one link
               that lands on exactly this question in the review screen. */
            <div className="mt-2 rounded-lg border border-amber-600/40 bg-amber-500/5 p-3.5">
              <p className="text-sm font-medium text-foreground">{t("iiu.as2.blocked.title")}</p>
              {/* The single most important sentence on this screen. An empty
                  column is the shape a low score takes when nobody says what
                  the emptiness means. */}
              <p className="mt-1.5 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.as2.nomaterial.body")}
              </p>
              <p className="mt-1.5 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.as2.blocked.body")}
              </p>
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                params={{ employerSlug, caseId }}
                search={{ q: qq.code }}
                className={`${PRIMARY_BUTTON} mt-3`}
              >
                {t("iiu.as2.blocked.cta")}
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

          {existing && !isEditing && (
            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={existing.level === 0 ? "attention" : "confirmed"}>
                  {existing.level} — {t(LEVEL_LABEL[clampLevel(existing.level)])}
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
              {/* A recorded assessment is a human judgement, and a human may
                  change their mind up to the moment the report is locked. The
                  database has always supported this: it supersedes rather than
                  overwrites, and asks for a documented reason. Nothing on the
                  screen offered it, so the owner met a saved rating as a dead
                  end. */}
              {released ? (
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.as2.locked")}
                </p>
              ) : (
                <button
                  type="button"
                  className={`${BUTTON} mt-3`}
                  onClick={() => {
                    setLevels((st) => ({ ...st, [qq.id]: existing.level }));
                    setRationales((st) => ({ ...st, [qq.id]: existing.rationale }));
                    setUncertainties((st) => ({
                      ...st,
                      [qq.id]: existing.uncertaintyNote ?? "",
                    }));
                    setEditing((st) => ({ ...st, [qq.id]: true }));
                  }}
                >
                  {t("iiu.as2.edit")}
                </button>
              )}
            </div>
          )}

          {showForm && (
            <form
              className="mt-2 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const lvl = levels[qq.id];
                const rat = rationales[qq.id] ?? "";
                const why = (editReasons[qq.id] ?? "").trim();
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
                if (isEditing && why === "") {
                  setAssessHint((st) => ({ ...st, [qq.id]: "reason" }));
                  return;
                }
                setAssessHint((st) => ({ ...st, [qq.id]: null }));
                assess.mutate({
                  questionId: qq.id,
                  level: lvl,
                  rationale: rat,
                  uncertaintyNote: (uncertainties[qq.id] ?? "").trim() || null,
                  supersedeReason: isEditing ? why : null,
                });
              }}
            >
              {/* The database refuses a level above 0 without confirmed
                  material, and rightly so. Saying that AFTER the save button
                  is a bad way to teach a rule the recruiter could have been
                  told up front — which is exactly how the owner met it. */}
              {blocked && (
                <Panel tone="attention" title={t("iiu.as2.blocked.title")}>
                  {/* The explanation sits in the material column, immediately
                      to the left of this and directly above it on a phone.
                      Saying it twice on one screen is not twice as clear. */}
                  <p className="flex flex-wrap gap-2">
                    <Link
                      to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                      params={{ employerSlug, caseId }}
                      search={{ q: qq.code }}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {t("iiu.as2.blocked.cta")}
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => setLevels((st) => ({ ...st, [qq.id]: 0 }))}
                    >
                      {t("iiu.as2.blocked.zero")}
                    </button>
                  </p>
                </Panel>
              )}

              {/* ---- the scale, in two semantically separate groups ----
                  1-4 answer "how clearly is the behaviour demonstrated".
                  0 answers a different question entirely -- whether there is
                  enough material to answer the first one at all. Drawing them
                  as one 0-4 run is what makes a 0 read as a score of zero. */}
              <fieldset>
                <legend className="text-xs font-medium leading-relaxed text-foreground">
                  {t("iiu.as2.q")}
                </legend>

                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("iiu.as2.group.demonstrated")}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {([1, 2, 3, 4] as const).map((l) => levelRow(l))}
                </div>

                <div className="mt-3 rounded-md border border-amber-600/40 bg-amber-500/5 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-900 dark:text-amber-200">
                    {t("iiu.as2.group.assessable")}
                  </p>
                  <div className="mt-1.5">{levelRow(0)}</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {t("iiu.as2.zero.apart")}
                  </p>
                </div>
              </fieldset>

              {/* The pinned pack wording, one click away. It is what the
                  assessment is actually recorded against, so it stays
                  reachable; it is also long and written for a method reviewer,
                  so it does not sit in front of the choice. */}
              <Disclosure summary={t("iiu.as2.anchor.governed")} className="!px-3 !py-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.as2.anchor.note")}
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

              {/* Changing a recorded judgement is allowed and documented. The
                  database refuses it without a reason, so the field is here
                  rather than as a surprise in an error message. */}
              {isEditing && (
                <div>
                  <label htmlFor={`why-${qq.id}`} className="text-xs font-medium text-foreground">
                    {t("iiu.as2.edit.why")}
                  </label>
                  <textarea
                    id={`why-${qq.id}`}
                    rows={2}
                    className={FIELD}
                    aria-describedby={`why-hint-${qq.id}`}
                    value={editReasons[qq.id] ?? ""}
                    onChange={(e) => setEditReasons((s) => ({ ...s, [qq.id]: e.target.value }))}
                  />
                  <p id={`why-hint-${qq.id}`} className="mt-1 text-[11px] text-muted-foreground">
                    {t("iiu.as2.edit.why.hint")}
                  </p>
                </div>
              )}

              {/* Four different situations, four different messages. Reusing
                  the material guidance when a level simply had not been picked
                  told the recruiter to go and find material they already had. */}
              {assessHint[qq.id] === "level" && (
                <p role="alert" className="text-xs text-destructive">
                  {blocked ? t("iiu.as2.blocked.body") : t("iiu.ev.hint.level")}
                </p>
              )}
              {assessHint[qq.id] === "rationale" && (
                <p role="alert" className="text-xs text-destructive">
                  {t("iiu.ev.rationale.missing")}
                </p>
              )}
              {assessHint[qq.id] === "reason" && (
                <p role="alert" className="text-xs text-destructive">
                  {t("iiu.as2.edit.reason.missing")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={PRIMARY_BUTTON} disabled={assess.isPending}>
                  {isEditing ? t("iiu.as2.edit.save") : t("iiu.ev.save")}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => {
                      setEditing((st) => ({ ...st, [qq.id]: false }));
                      setAssessHint((st) => ({ ...st, [qq.id]: null }));
                    }}
                  >
                    {t("iiu.ev.cancel")}
                  </button>
                )}
              </div>
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
          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      <div className="mt-3">
        {/* While the assessment is the recruiter's job, the primary actions
            are the per-question saves and the finish button below; the
            header offers nothing that competes with them. Once the stage is
            done the header carries the one next step. */}
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
          action={
            d.status === "assessed" || d.status === "reported" ? (
              <NextStepLink status={d.status} employerSlug={employerSlug} caseId={caseId} />
            ) : undefined
          }
        />
      </div>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="assess"
          step="assess"
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
              {/* Three different states, and a recruiter has to be able to
                  tell them apart: how much material exists, how much has been
                  assessed, and how much cannot be assessed yet BECAUSE the
                  material does not exist. Only the last one has a next step. */}
              <Tally
                value={`${withMaterial.length} / ${total}`}
                label={t("iiu.as2.withmaterial")}
              />
              <Tally
                value={blockedQuestions.length}
                label={t("iiu.as2.blockedcount")}
                tone={blockedQuestions.length > 0 ? "attention" : "neutral"}
              />
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

            {/* Which questions are blocked, and one click to unblock each.
                A count on its own tells a recruiter they are stuck without
                telling them where. */}
            {blockedQuestions.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("iiu.as2.blockedlist")}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {blockedQuestions.map((qq) => (
                    <li key={qq.id}>
                      <Link
                        to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                        params={{ employerSlug, caseId }}
                        search={{ q: qq.code }}
                        className="inline-flex min-h-8 items-center rounded-md border border-amber-600/40 bg-amber-500/5 px-2.5 text-xs font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
                      >
                        {qq.code}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("iiu.as2.blocked.body")}
                </p>
              </>
            )}

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
