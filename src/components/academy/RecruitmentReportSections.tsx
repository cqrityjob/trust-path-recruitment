// Report V2, sections 5–7: competency overview, self-reported work behaviour,
// and the structured interview guide.
//
// ── WHAT CHANGED AND WHAT DID NOT ───────────────────────────────────────
//
// The three sections that used to split observed areas into "strengths",
// "development and follow-up" and "too little evidence" are one ordered list
// now. Nothing was merged in the data — each card still states its own signal
// in words — but three headed sections over eight areas meant a recruiter read
// three ledes, three caveats and three lists to see one competency picture, and
// the middle heading ("Utvecklings- och uppföljningsområden") did the work of
// labelling a person that the signal on the card does more precisely.
//
// The self-report section and the interview guide are unchanged in substance.
// The guide in particular is the most useful thing on the page and is kept
// whole: authored questions, the reason each area was selected, the evidence
// type it came from, and what to listen for — which is guidance for the
// interviewer and never a key, a score or a preferred answer.

import { CircleCheck, CircleDashed } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import type {
  BriefModule,
  InterviewGuideEntry,
  ObservedArea,
  SelfReportedArea,
} from "@/lib/security-competency/academy-employer.functions";
import type { DecisionSupport } from "@/lib/security-competency/decision-support";
import { CompetencyAssessmentCard, EvidenceTag } from "./DecisionSupportSummary";

/** The recruitment reading of why a question was selected. Separate from
 *  `brief.focus.*` for the same reason the signal labels are: "För lite
 *  underlag" reads as a shortfall, and what it describes is an assessment that
 *  did not ask enough. */
const FOCUS_LABEL: Record<InterviewGuideEntry["focus"], TranslationKey> = {
  explore_development: "decision.focus.explore_development",
  explore_self_report: "decision.focus.explore_self_report",
  explore_limited_evidence: "decision.focus.explore_limited_evidence",
  confirm_strength: "decision.focus.confirm_strength",
};

export function ReportSection({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-[14px] border border-border bg-card p-5">
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

/**
 * Section 5 — every competency the assessment touched, in one list.
 *
 * Ordered strongest support first, then what needs following up, then the areas
 * the assessment barely reached. That last group is last because it is the
 * least actionable, not because it is the worst: a thin area says the
 * instrument did not ask, and the card says so in those words.
 */
export function CompetencyOverviewSection({
  support,
  modules,
  interviewGuide,
  sv,
}: {
  support: DecisionSupport;
  modules: BriefModule[];
  /** The frozen guide, read here as well as in section 7. Nothing is generated
   *  from it: this section shows the question, section 7 shows the question
   *  with its follow-up, its reason and what to listen for. */
  interviewGuide: InterviewGuideEntry[];
  sv: boolean;
}) {
  const { t } = useT();

  // ── WHY THIS READS THE GUIDE AND NOT priorityFollowUp ─────────────────
  //
  // It used to read the follow-up bucket, which holds only `developing` and
  // `mixed` areas -- so seven of eight cards on a real report carried no
  // question while the lede promised one. The governed guide has an entry for
  // the strong areas (confirm_strength) and the thin ones
  // (explore_limited_evidence) too; they were simply never looked up.
  //
  // The match is on evidence type as well as area code, and that is the whole
  // subtlety: one area code can carry both an observed entry and a
  // self-reported one, and putting a question drawn from a self-description on
  // an OBSERVED competency card is exactly the blur this report may not make.
  // An area with no observed entry gets no row -- the lede says "where the
  // guide selected a question", because a governed guide is entitled to have
  // nothing to ask.
  const promptFor = (area: ObservedArea) =>
    interviewGuide.find((g) => g.areaCode === area.areaCode && g.evidenceType === "observed") ??
    null;

  const ordered: ObservedArea[] = [
    ...support.strongestSupported,
    ...support.priorityFollowUp.map((f) => f.area),
    ...support.uncertainties,
  ];

  if (ordered.length === 0) return null;

  return (
    <ReportSection title={t("decision.competencies.title")} lede={t("decision.competencies.lede")}>
      {modules.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {modules.map((m) => (
            <li
              key={m.blockKey}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-xs text-foreground"
            >
              <CircleCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {sv ? m.nameSv : m.nameEn}
              <span className="tabular-nums text-muted-foreground">
                {m.answered}/{m.items}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-4">
        {ordered.map((a) => (
          <CompetencyAssessmentCard key={a.areaCode} area={a} prompt={promptFor(a)} sv={sv} />
        ))}
      </ul>
    </ReportSection>
  );
}

/** Section 6 — what the person says about how they usually work.
 *
 *  Its own section, its own component and its own key in the frozen brief, so a
 *  self-description cannot be rendered where an observation belongs. The stamp
 *  is repeated on every row anyway: this is the one distinction the report may
 *  never let a hurried reader blur. */
export function SelfReportedSection({ areas, sv }: { areas: SelfReportedArea[]; sv: boolean }) {
  const { t } = useT();
  if (areas.length === 0) return null;

  // Varied first: an area where related answers pointed different ways is the
  // one worth a question, and burying it under seven consistent ones is how it
  // gets missed.
  const ordered = [
    ...areas.filter((s) => s.consistency === "varied"),
    ...areas.filter((s) => s.consistency !== "varied"),
  ];

  return (
    <ReportSection title={t("brief.selfReported")} lede={t("brief.selfReportedLede")}>
      <ul className="mt-3">
        {ordered.map((area) => (
          <li
            key={area.domainKey}
            className="border-b border-border py-3.5 last:border-b-0 last:pb-0"
          >
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
                area.consistency === "varied"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {t(`brief.consistency.${area.consistency}` as TranslationKey)} · {area.items}{" "}
              {t("brief.questionsAnswered")}
            </p>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}

/** Section 7 — the structured interview guide, kept whole. */
export function InterviewGuideSection({
  entries,
  sv,
}: {
  entries: InterviewGuideEntry[];
  sv: boolean;
}) {
  const { t } = useT();
  if (entries.length === 0) return null;

  return (
    <ReportSection title={t("brief.interviewGuide")} lede={t("brief.interviewGuideLede")}>
      <ol className="mt-3.5 space-y-3">
        {entries.map((g, i) => (
          <li
            key={`${g.areaCode}-${g.focus}-${i}`}
            className="rounded-[10px] border border-border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h3 className="text-sm font-semibold text-foreground">{sv ? g.areaSv : g.areaEn}</h3>
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
                    <CircleDashed className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </ReportSection>
  );
}
