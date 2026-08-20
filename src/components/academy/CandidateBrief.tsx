// The Candidate Assessment Brief — the employer surface after an assessment.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────
//
// A recruiter has forty minutes and an interview to run. In under a minute this
// page has to answer four questions: what are this person's strengths, what
// should I explore, what was observed versus what did they say about
// themselves, and what should I ask. Everything below is ordered by those four
// questions rather than by the shape of the data.
//
// ── THE TWO THINGS IT MUST NEVER DO ─────────────────────────────────────
//
// It must not make the employment decision, and it must not let a
// self-description read as demonstrated competence. Both are handled the same
// way: the component cannot express them. There is no prop here that takes a
// verdict, a total or a rank; observed areas and self-reported areas come from
// two different keys in the frozen brief, are rendered by two different
// components, and each carries its evidence type in words on the face of the
// row.
//
// ── WHY THERE ARE TWO AXES ON A STRENGTH ────────────────────────────────
//
// A strength row says two things that must both be true at once:
//
//   "Strong evidence"  — how they answered THESE tasks, in THIS assessment;
//   "one occasion"     — how much evidence that is, across occasions.
//
// The first is what a recruiter needs and the platform used to refuse to say.
// The second is what keeps it honest, and it is printed next to the first
// rather than in a footnote, because a footnote is where breadth caveats go to
// be ignored.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck, CircleDashed, CircleHelp, MessageSquare, Scale, Timer } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import {
  listInterviewNotes,
  recordInterviewNote,
  type AssessmentSignal,
  type InterviewGuideEntry,
  type InterviewNote,
  type InterviewNoteOutcome,
  type ObservedArea,
  type ReportBrief,
  type SelfReportedArea,
} from "@/lib/security-competency/academy-employer.functions";

const SIGNAL_LABEL: Record<AssessmentSignal, TranslationKey> = {
  strong: "brief.signal.strong",
  consistent: "brief.signal.consistent",
  mixed: "brief.signal.mixed",
  developing: "brief.signal.developing",
  limited: "brief.signal.limited",
};

const FOCUS_LABEL: Record<InterviewGuideEntry["focus"], TranslationKey> = {
  explore_development: "brief.focus.explore_development",
  explore_self_report: "brief.focus.explore_self_report",
  explore_limited_evidence: "brief.focus.explore_limited_evidence",
  confirm_strength: "brief.focus.confirm_strength",
};

const OUTCOMES: InterviewNoteOutcome[] = [
  "evidence_confirmed",
  "evidence_not_confirmed",
  "additional_context",
];

const OUTCOME_LABEL: Record<InterviewNoteOutcome, TranslationKey> = {
  evidence_confirmed: "brief.notes.evidence_confirmed",
  evidence_not_confirmed: "brief.notes.evidence_not_confirmed",
  additional_context: "brief.notes.additional_context",
};

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {lede && (
        <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {lede}
        </p>
      )}
      {children}
    </section>
  );
}

/** The evidence-type stamp. Deliberately words, on every row, in both
 *  sections — not a colour, not an icon alone, and never omitted from the
 *  self-reported side on the grounds that the heading already said it. */
function EvidenceTag({ kind }: { kind: "observed" | "self_reported" }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        kind === "observed"
          ? "border-border bg-[color:var(--surface-subtle)] text-foreground"
          : "border-dashed border-border bg-transparent text-muted-foreground",
      )}
    >
      {kind === "observed" ? (
        <Scale className="h-3 w-3" aria-hidden="true" />
      ) : (
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
      )}
      {t(`brief.evidenceType.${kind}` as TranslationKey)}
    </span>
  );
}

function ObservedRow({ area, sv }: { area: ObservedArea; sv: boolean }) {
  const { t } = useT();
  return (
    <li className="border-b border-border py-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-foreground">{sv ? area.areaSv : area.areaEn}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {t(SIGNAL_LABEL[area.signal])}
          </span>
          <EvidenceTag kind="observed" />
        </div>
      </div>
      <p className="mt-2 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
        {sv ? area.whySv : area.whyEn}
      </p>
      {(sv ? area.behaviourSv : area.behaviourEn) && (
        <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {sv ? area.behaviourSv : area.behaviourEn}
        </p>
      )}
      {/* The breadth axis, beside the strength axis rather than beneath it. */}
      <p className="mt-2 text-xs text-muted-foreground">
        {area.items} {t("brief.tasks")} · {t("brief.breadthNote")}
      </p>
    </li>
  );
}

function SelfReportedRow({ area, sv }: { area: SelfReportedArea; sv: boolean }) {
  const { t } = useT();
  return (
    <li className="border-b border-border py-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {sv ? area.domainSv : area.domainEn}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {t(`brief.pattern.${area.pattern}` as TranslationKey)}
          </span>
          <EvidenceTag kind="self_reported" />
        </div>
      </div>
      {(sv ? area.whySv : area.whyEn) && (
        <p className="mt-2 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {sv ? area.whySv : area.whyEn}
        </p>
      )}
      <p
        className={cn(
          "mt-2 text-xs",
          area.consistency === "varied" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {t(`brief.consistency.${area.consistency}` as TranslationKey)} · {area.items}{" "}
        {t("brief.questionsAnswered")}
      </p>
    </li>
  );
}

export function CandidateBrief({
  brief,
  attemptId,
  canRecord,
}: {
  brief: ReportBrief | null;
  attemptId: string;
  canRecord: boolean;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";

  if (!brief) {
    return (
      <Section title={t("brief.title")}>
        <p className="mt-3 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("brief.none")}
        </p>
      </Section>
    );
  }

  // Three buckets, from one list, by one rule each. A strength is not "the top
  // three"; it is an area whose answers actually held together, and if there
  // are none the section simply does not render rather than promoting the
  // least-bad area into it.
  const strengths = brief.observed.filter(
    (o) => o.signal === "strong" || o.signal === "consistent",
  );
  const development = brief.observed.filter(
    (o) => o.signal === "developing" || o.signal === "mixed",
  );
  const limited = brief.observed.filter((o) => o.signal === "limited");
  const varied = brief.selfReported.filter((s) => s.consistency === "varied");

  return (
    <>
      <Section title={t("brief.title")} lede={t("brief.lede")}>
        <ul className="mt-4 flex flex-wrap gap-2">
          {brief.modules.map((m) => (
            <li
              key={m.blockKey}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-xs text-foreground"
            >
              <CircleCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {sv ? m.nameSv : m.nameEn}
              <span className="text-muted-foreground">
                {m.answered}/{m.items}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("brief.coverageBody")
            .replace("{observed}", String(brief.coverage.observedObservations))
            .replace("{self}", String(brief.coverage.selfReportObservations))}
        </p>

        {brief.pace && (
          <p className="mt-3 flex max-w-[74ch] items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <Timer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("brief.paceBody")
                .replace("{n}", String(brief.pace.rapidAnswers))
                .replace("{total}", String(brief.pace.answered))}
            </span>
          </p>
        )}
      </Section>

      {strengths.length > 0 && (
        <Section title={t("brief.strengths")} lede={t("brief.strengthsLede")}>
          <ul className="mt-3">
            {strengths.map((a) => (
              <ObservedRow key={a.areaCode} area={a} sv={sv} />
            ))}
          </ul>
        </Section>
      )}

      {development.length > 0 && (
        <Section title={t("brief.development")} lede={t("brief.developmentLede")}>
          <ul className="mt-3">
            {development.map((a) => (
              <ObservedRow key={a.areaCode} area={a} sv={sv} />
            ))}
          </ul>
        </Section>
      )}

      {limited.length > 0 && (
        <Section title={t("brief.limited")} lede={t("brief.limitedLede")}>
          <ul className="mt-3">
            {limited.map((a) => (
              <ObservedRow key={a.areaCode} area={a} sv={sv} />
            ))}
          </ul>
        </Section>
      )}

      {brief.selfReported.length > 0 && (
        <Section title={t("brief.selfReported")} lede={t("brief.selfReportedLede")}>
          <ul className="mt-3">
            {/* Varied first: an area where related answers pointed different
                ways is the one worth a question, and burying it under seven
                consistent ones is how it gets missed. */}
            {[...varied, ...brief.selfReported.filter((s) => s.consistency !== "varied")].map(
              (a) => (
                <SelfReportedRow key={a.domainKey} area={a} sv={sv} />
              ),
            )}
          </ul>
        </Section>
      )}

      {brief.interviewGuide.length > 0 && (
        <Section title={t("brief.interviewGuide")} lede={t("brief.interviewGuideLede")}>
          <ol className="mt-4 space-y-4">
            {brief.interviewGuide.map((g, i) => (
              <li
                key={`${g.areaCode}-${g.focus}-${i}`}
                className="rounded-[10px] border border-border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {sv ? g.areaSv : g.areaEn}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">
                      {t(FOCUS_LABEL[g.focus])}
                    </span>
                    <EvidenceTag kind={g.evidenceType} />
                  </div>
                </div>

                <p className="mt-2 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{t("brief.why")}: </span>
                  {sv ? g.whySv : g.whyEn}
                </p>

                <p className="mt-3 max-w-[74ch] text-[15px] font-medium leading-relaxed text-foreground">
                  {sv ? g.questionSv : g.questionEn}
                </p>
                <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
                  <span className="font-medium">{t("brief.followup")}: </span>
                  {sv ? g.followupSv : g.followupEn}
                </p>

                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
                    {t("brief.listenFor")}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {(sv ? g.listenForSv : g.listenForEn).map((l) => (
                      <li
                        key={l}
                        className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <CircleDashed
                          className="mt-[3px] h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <InterviewNotesPanel
        attemptId={attemptId}
        canRecord={canRecord}
        areas={[
          ...brief.observed.map((o) => ({
            code: o.areaCode,
            label: sv ? o.areaSv : o.areaEn,
          })),
        ]}
      />

      <p className="mt-6 flex items-start gap-2 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-foreground">
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span>{t("brief.notADecision")}</span>
      </p>
    </>
  );
}

/** Interview evidence, recorded after the conversation.
 *
 *  Append-only in the database and append-only here: there is no edit control,
 *  because there is nothing to edit. A later reading is a further note, which
 *  is how a record of a conversation should behave. */
function InterviewNotesPanel({
  attemptId,
  canRecord,
  areas,
}: {
  attemptId: string;
  canRecord: boolean;
  areas: { code: string; label: string }[];
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listInterviewNotes);
  const recordFn = useServerFn(recordInterviewNote);

  const [area, setArea] = useState(areas[0]?.code ?? "");
  const [outcome, setOutcome] = useState<InterviewNoteOutcome>("evidence_confirmed");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const notes = useQuery({
    queryKey: ["academy", "interviewNotes", attemptId],
    queryFn: () => listFn({ data: { attemptId } }),
  });

  const labelFor = (code: string) => areas.find((a) => a.code === code)?.label ?? code;

  async function save() {
    if (!area) return;
    setSaving(true);
    setFailed(false);
    try {
      await recordFn({
        data: { attemptId, areaCode: area, outcome, note: note.trim() || null },
      });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["academy", "interviewNotes", attemptId] });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title={t("brief.notes")} lede={t("brief.notesLede")}>
      {(notes.data?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("brief.notes.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {(notes.data ?? []).map((n: InterviewNote) => (
            <li key={n.id} className="rounded-[10px] border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-foreground">{labelFor(n.areaCode)}</p>
                <p className="text-[13px] font-medium text-foreground">
                  {t(OUTCOME_LABEL[n.outcome])}
                </p>
              </div>
              {n.note && (
                <p className="mt-2 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
                  {n.note}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {n.recordedByEmail} ·{" "}
                {new Date(n.recordedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!canRecord ? (
        <p className="mt-4 text-[13px] text-muted-foreground">{t("brief.notes.notPermitted")}</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-foreground">
            {t("brief.notes.area")}
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {areas.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[13px] font-medium text-foreground">
            {t("brief.notes.outcome")}
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InterviewNoteOutcome)}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {t(OUTCOME_LABEL[o])}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[13px] font-medium text-foreground sm:col-span-2">
            {t("brief.notes.note")}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1.5 w-full rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={saving || !area}
              onClick={() => void save()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none"
            >
              {saving ? t("brief.notes.saving") : t("brief.notes.add")}
            </button>
            {failed && (
              <p role="alert" className="mt-2 text-[13px] text-foreground">
                {t("brief.notes.failed")}
              </p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
