// What one interview produced, as records a person already made.
//
// This is the material the report is built from, shown BEFORE the report is
// locked: the confirmed examples, which requirements they cover and which they
// do not, what still has to be followed up or verified, the recruiter's own
// assessments, and their closing comments.
//
// It generates nothing. Every section is a projection of records a human has
// already made, and with AI switched off it is exactly as complete as it is
// with AI on. That is deliberate: this is the one place where a model would be
// most tempting and most dangerous, because a plausible paragraph reads as a
// conclusion.
//
// It carries the two sentences this product exists to keep saying. A
// requirement with no material means the question was not answered, not that
// the candidate lacks the ability. Two facts that do not line up mean something
// needs clarifying, not that anyone was dishonest.
//
// Used by the Report screen while the report is still open (so the recruiter
// reads what they are about to lock) and by the summary route.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { CaseDetail } from "@/lib/interview-intelligence/runtime.functions";
import { Chip, LevelZeroNote, MaterialBadge, uiLabel, BUTTON } from "./InterviewUi";
import { Nothing } from "./InterviewLayout";

const FINDING_LABEL: Record<string, TranslationKey> = {
  gap: "iiu.find.gap",
  unclear: "iiu.find.unclear",
  contradiction: "iiu.find.contradiction",
  verification: "iiu.find.verification",
};

/** The recruiter's own words for each level. Same keys as the assessment
 *  screen, so a level reads the same when it is chosen and when it is read
 *  back. Level 0 is an evidence state and is never shown as the bottom of a
 *  scale here either. */
const LEVEL_LABEL: Record<number, TranslationKey> = {
  0: "iiu.as2.lvl.0",
  1: "iiu.as2.lvl.1",
  2: "iiu.as2.lvl.2",
  3: "iiu.as2.lvl.3",
  4: "iiu.as2.lvl.4",
};

const clampLevel = (level: number): number => (level >= 0 && level <= 4 ? level : 0);

export function InterviewOutcome({
  d,
  employerSlug,
  caseId,
}: {
  d: CaseDetail;
  employerSlug: string;
  caseId: string;
}) {
  const { t, lang } = useT();

  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;

  // Everything is reported against the ROLE REQUIREMENTS, not the question
  // numbers. "Q2 has nothing" tells a recruiter which row of a table is empty;
  // "conflict handling has nothing" tells them what they still do not know.
  const groups = d.competencies
    .map((c) => ({
      requirement: c,
      questions: d.questions.filter((qq) => qq.competencyCodes[0] === c.code),
    }))
    .filter((g) => g.questions.length > 0);
  const orphans = d.questions.filter(
    (qq) => !qq.competencyCodes[0] || !d.competencies.some((c) => c.code === qq.competencyCodes[0]),
  );
  const evidenceFor = (id: string) => d.evidence.filter((e) => e.questionId === id);
  const assessmentFor = (id: string) => d.assessments.find((a) => a.questionId === id) ?? null;

  const questionsWithEvidence = new Set(d.evidence.map((e) => e.questionId));
  const coveredCodes = new Set(
    d.questions
      .filter((qq) => questionsWithEvidence.has(qq.id))
      .flatMap((qq) => qq.competencyCodes.slice(0, 1)),
  );
  const covered = d.competencies.filter((c) => coveredCodes.has(c.code));
  const missing = d.competencies.filter((c) => !coveredCodes.has(c.code));

  const open = d.findings.filter((f) => f.resolutionState !== "resolved");
  const verify = open.filter((f) => f.findingKind === "verification");
  const followUp = open.filter((f) => f.findingKind !== "verification");
  const comments = (d.session?.notes ?? []).filter(
    (n) => n.noteKind === "closing_summary" || n.noteKind === "process",
  );
  const anyLevelZero = d.assessments.some((a) => a.level === 0);

  /** One requirement's worth of questions: the confirmed examples and the
   *  recorded assessment for each, side by side. */
  const questionBlock = (qq: CaseDetail["questions"][number]) => {
    const evidence = evidenceFor(qq.id);
    const a = assessmentFor(qq.id);
    // Material confirmed after the judgement was recorded: shown as exactly
    // that, beside the judgement, so the reader never takes the two together.
    const uncovered =
      a !== null && evidence.some((e) => Date.parse(e.confirmedAt) > Date.parse(a.assessedAt));
    return (
      <li key={qq.id} className="py-3">
        <p className="text-sm font-medium leading-relaxed text-foreground">
          <span aria-hidden="true" className="mr-2 font-mono text-xs text-muted-foreground">
            {qq.code}
          </span>
          {qq.promptSv}
        </p>
        {evidence.length === 0 ? (
          <p className="mt-1.5 text-sm italic text-muted-foreground">
            {t("iiu.rp.doc.noexamples")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {evidence.map((e) => (
              <li
                key={e.id}
                className="border-l-2 border-teal-700/40 pl-3.5 text-sm leading-relaxed text-foreground"
              >
                {e.excerpt}
              </li>
            ))}
          </ul>
        )}
        {a && (
          <div className="mt-2.5 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <MaterialBadge state="assessment" />
              <Chip tone={a.level === 0 ? "attention" : "confirmed"}>
                {t(LEVEL_LABEL[clampLevel(a.level)])}
              </Chip>
              {uncovered && <Chip tone="attention">{t("iiu.ev.stale.chip")}</Chip>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{a.rationale}</p>
            {a.uncertaintyNote && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium">{t("iiu.as2.unclear")}: </span>
                {a.uncertaintyNote}
              </p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      {/* ---- 1 · What the conversation gave, requirement by requirement ---- */}
      <section aria-labelledby="oc-ex">
        <h3 id="oc-ex" className="text-sm font-semibold text-foreground">
          {t("iiu.sm.examples")}
        </h3>
        <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
          {t("iiu.rp.s.examples.body")}
        </p>
        {d.evidence.length === 0 && d.assessments.length === 0 ? (
          <div className="mt-2 space-y-3">
            <Nothing>{t("iiu.sm.examples.none")}</Nothing>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
              params={{ employerSlug, caseId }}
              className={BUTTON}
            >
              {t("iiu.ov.cta.review")}
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-6">
            {groups.map((g) => (
              <section key={g.requirement.id} aria-labelledby={`oc-req-${g.requirement.id}`}>
                <h4
                  id={`oc-req-${g.requirement.id}`}
                  className="flex items-baseline gap-2 border-b border-border pb-1.5 text-sm font-semibold text-foreground"
                >
                  <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                    {g.requirement.code}
                  </span>
                  {reqName(g.requirement)}
                </h4>
                <ul className="divide-y divide-border">{g.questions.map(questionBlock)}</ul>
              </section>
            ))}
            {orphans.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {orphans.map(questionBlock)}
              </ul>
            )}
            {anyLevelZero && (
              <div className="max-w-[70ch]">
                <LevelZeroNote />
              </div>
            )}
          </div>
        )}
        <p className="mt-3 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
          {t("iiu.rp.doc.nomaterial")}
        </p>
      </section>

      {/* ---- 2 · Covered, and not ---- */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="oc-cov">
          <h3 id="oc-cov" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.explored")}
          </h3>
          {covered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.explored.none")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {covered.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <span aria-hidden="true" className="text-teal-700 dark:text-teal-300">
                    ✓
                  </span>
                  <span className="leading-snug text-foreground">{reqName(c)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="oc-miss">
          <h3 id="oc-miss" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.missing")}
          </h3>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.missing.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {missing.map((c) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    <span aria-hidden="true" className="text-amber-700 dark:text-amber-300">
                      ○
                    </span>
                    <span className="leading-snug text-foreground">{reqName(c)}</span>
                  </li>
                ))}
              </ul>
              {/* The sentence that keeps an absence from being read as a finding. */}
              <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.sm.missing.body")}
              </p>
            </>
          )}
        </section>
      </div>

      {/* ---- 3 · Still to chase ---- */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="oc-fu">
          <h3 id="oc-fu" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.followup")}
          </h3>
          {followUp.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.followup.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-2.5">
                {followUp.map((f) => (
                  <li key={f.id} className="text-sm leading-relaxed">
                    <Chip tone="attention">{uiLabel(FINDING_LABEL, f.findingKind, t)}</Chip>{" "}
                    <span className="text-foreground">{f.statement}</span>
                  </li>
                ))}
              </ul>
              {followUp.some((f) => f.findingKind === "contradiction") && (
                // Said where a contradiction is actually on screen, not in a
                // policy document nobody opens.
                <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                  {t("iiu.find.contradiction.note")}
                </p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="oc-ver">
          <h3 id="oc-ver" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.verify")}
          </h3>
          {verify.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.verify.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-2.5">
                {verify.map((f) => (
                  <li key={f.id} className="text-sm leading-relaxed">
                    <MaterialBadge state="verify" />{" "}
                    <span className="text-foreground">{f.statement}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.sm.verify.body")}
              </p>
            </>
          )}
        </section>
      </div>

      {/* ---- 4 · Your assessments, when none exist yet ----
           When they do, they sit beside their question above; an empty state
           still needs somewhere to go. */}
      {d.assessments.length === 0 && (
        <section aria-labelledby="oc-as">
          <h3
            id="oc-as"
            className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground"
          >
            {t("iiu.sm.assessments")}
            <MaterialBadge state="assessment" />
          </h3>
          <div className="mt-2 space-y-3">
            <Nothing>{t("iiu.sm.assessments.none")}</Nothing>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
              params={{ employerSlug, caseId }}
              className={BUTTON}
            >
              {t("iiu.sm.assessments.cta")}
            </Link>
          </div>
        </section>
      )}

      {/* ---- 5 · The interviewer's own comments ---- */}
      <section aria-labelledby="oc-com">
        <h3 id="oc-com" className="text-sm font-semibold text-foreground">
          {t("iiu.sm.comments")}
        </h3>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.comments.none")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {comments.map((n) => (
              <li key={n.id} className="rounded-lg border border-border px-3.5 py-3">
                <MaterialBadge state="note" />
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- The boundary this product exists to hold ---- */}
      <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {t("iiu.sm.nodecision")}
      </p>
    </div>
  );
}
