// Candidate Decision Support Report V2 — the first screen.
//
// ── WHAT THIS REPLACED ──────────────────────────────────────────────────
//
// A report that opened with provenance, then with usage limits, then with
// methodology, and only then with anything about the person — repeating the
// same four caveats in every section afterwards. All of it is still on the
// page; it is stated once, at the bottom, under "Om bedömningsunderlaget".
//
// ── AND WHAT THE POLISH PASS CHANGED ────────────────────────────────────
//
// The structure was right and the screen was still slow to read, for three
// reasons that were all about weight rather than content.
//
// Four panels of equal size said the four things mattered equally. They do not:
// a safety-critical response outranks everything, what to follow up is what the
// recruiter acts on, and "these areas were barely touched" is true, necessary
// and the least actionable line on the page. So safety is full width and first,
// follow-up and stability are a pair, and uncertainty is one muted line under
// them instead of a card competing with them.
//
// "Starkast stöd i underlaget: none" was a prominent empty box announcing an
// absence. It is now either the real thing, or the steadiest signal that
// honestly exists (what the candidate consistently DESCRIBES, labelled as
// self-report), or nothing at all. It is never a box saying there is nothing.
//
// The governance sentence under the recommendation is still there and still
// unhedged; it is set smaller than the reason above it, because a caveat
// printed at the same weight as the finding is a caveat nobody finishes.
//
// ── WHAT THIS COMPONENT CANNOT SAY ──────────────────────────────────────
//
// There is no prop here that takes a verdict, a total, a band or another
// candidate. The recommendation is one of four PROCESS steps and arrives as an
// enum from the builder; this file maps it to a translated label and cannot
// widen the set.

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleDashed,
  MessageSquare,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import type {
  ObservedArea,
  ReportContext,
  SelfReportedArea,
} from "@/lib/security-competency/academy-employer.functions";
import {
  FOLLOW_UP_LIMIT,
  type DecisionSupport,
  type FollowUpItem,
  type RecommendedNextStep,
} from "@/lib/security-competency/decision-support";

const STEP_LABEL: Record<RecommendedNextStep, TranslationKey> = {
  structured_interview: "decision.step.structuredInterview",
  additional_assessment: "decision.step.additionalAssessment",
  request_clarification: "decision.step.requestClarification",
  gather_more_evidence: "decision.step.gatherMoreEvidence",
};

/** The recruitment reading of an assessment signal.
 *
 *  Deliberately not `brief.signal.*`. "Utvecklingsområde" is competence
 *  development's word: it belongs on somebody the organisation employs and has
 *  a development plan with. On a candidate it quietly says the organisation has
 *  taken a view on how this person needs to grow, from one assessment, before
 *  anybody has met them. "Behöver följas upp" says what the report actually
 *  supports — ask about this — and the workforce report keeps its own word. */
const RECRUITMENT_SIGNAL_LABEL: Record<ObservedArea["signal"], TranslationKey> = {
  strong: "decision.signal.strong",
  consistent: "decision.signal.consistent",
  mixed: "decision.signal.mixed",
  developing: "decision.signal.followUp",
  limited: "decision.signal.limited",
};

/** The evidence-type stamp, kept on every row in every section. Words, not a
 *  colour and not an icon alone: this is the one distinction the report may
 *  never blur, so it survives greyscale, print and a colour-blind reader. */
export function EvidenceTag({ kind }: { kind: "observed" | "self_reported" }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
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

function Panel({
  title,
  icon: Icon,
  emphasis,
  wide,
  children,
}: {
  title: string;
  icon: typeof Scale;
  emphasis?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[12px] border p-4",
        emphasis ? "border-accent bg-[color:var(--surface-subtle)]" : "border-border bg-card",
        wide && "md:col-span-2",
      )}
    >
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AreaLine({
  name,
  detail,
  action,
  kind,
}: {
  name: string;
  detail: string;
  /** The one thing to do about it. Omitted rather than filled with a
   *  placeholder when the governed guide selected no question for this area. */
  action?: string | null;
  kind: "observed" | "self_reported";
}) {
  const { t } = useT();
  return (
    <li className="border-b border-border py-2 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <EvidenceTag kind={kind} />
      </div>
      <p className="mt-0.5 max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
      {action && (
        <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-foreground">
          <span className="font-medium">{t("decision.card.followUp")}: </span>
          {action}
        </p>
      )}
    </li>
  );
}

/**
 * Section 1 — the executive summary.
 *
 * Recommendation, narrative, then the panels in the order they matter. The
 * context strip closes it, compact and last within the section: it is what the
 * document is about, not what it says.
 */
export function DecisionSupportSummary({
  support,
  context,
  sv,
}: {
  support: DecisionSupport;
  context: ReportContext | null;
  sv: boolean;
}) {
  const { t } = useT();
  const name = (a: ObservedArea) => (sv ? a.areaSv : a.areaEn);
  const why = (a: ObservedArea) => (sv ? a.whySv : a.whyEn);
  const selfName = (s: SelfReportedArea) => (sv ? s.domainSv : s.domainEn);
  const stability = support.stability;

  return (
    <section className="mt-5 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("decision.summaryTitle")}</h2>

      {/* A. The recommended PROCESS step. Compact: a label, the step, the
          reason a recruiter can act on, and the governance line set smaller
          underneath it. */}
      <div className="mt-3 rounded-[12px] border border-accent bg-[color:var(--surface-subtle)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          {t("decision.recommendedStep")}
        </p>
        <p className="mt-0.5 text-[17px] font-semibold leading-snug text-foreground">
          {t(STEP_LABEL[support.recommendedNextStep])}
        </p>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-foreground">
          {t(support.rationaleKey)}
        </p>
        <p className="mt-1.5 max-w-[74ch] text-[11.5px] leading-relaxed text-muted-foreground">
          {t("decision.stepIsProcessOnly")}
        </p>
      </div>

      {/* B. The narrative. Three to five sentences, composed from the facts the
          selection layer kept — not a catalogue of every competency. */}
      {support.narrative && (
        <p className="mt-4 max-w-[68ch] border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-foreground">
          {sv ? support.narrative.sv : support.narrative.en}
        </p>
      )}

      {/* C. The panels, weighted. Safety first and full width when it exists;
             what to follow up and what holds as a pair; and everything the
             assessment could not reach as one quiet line below them. */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {support.safetyCriticalFollowUp && (
          <Panel title={t("decision.panel.safety")} icon={ShieldAlert} emphasis wide>
            <p className="max-w-[74ch] text-[13px] leading-relaxed text-foreground">
              {support.safetyCriticalFollowUp.count === 1
                ? t("decision.panel.safetyBodyOne")
                : t("decision.panel.safetyBodyMany").replace(
                    "{n}",
                    String(support.safetyCriticalFollowUp.count),
                  )}
            </p>
            <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-foreground">
              <span className="font-medium">{t("decision.card.followUp")}: </span>
              {t("decision.panel.safetyAction")}
            </p>
            <p className="mt-1.5 max-w-[74ch] text-[11.5px] leading-relaxed text-muted-foreground">
              {t("decision.panel.safetyNote")}
            </p>
          </Panel>
        )}

        {support.priorityFollowUp.length > 0 && (
          <Panel title={t("decision.panel.followUp")} icon={CircleDashed}>
            <ul>
              {/* The question is carried on the TOP priority only. Three
                  areas with three interview questions is a guide, and there is
                  one of those further down the page; what the panel owes the
                  reader is the one thing to open the conversation with. */}
              {support.priorityFollowUp.slice(0, FOLLOW_UP_LIMIT).map((f, i) => (
                <AreaLine
                  key={f.area.areaCode}
                  name={name(f.area)}
                  detail={why(f.area)}
                  action={
                    i === 0 && f.prompt ? (sv ? f.prompt.questionSv : f.prompt.questionEn) : null
                  }
                  kind="observed"
                />
              ))}
            </ul>
          </Panel>
        )}

        {/* Either the real thing, or the steadiest signal that honestly exists,
            or nothing. Never a box announcing an absence. */}
        {stability && (
          <Panel
            title={t(
              stability.kind === "supported"
                ? "decision.panel.strongest"
                : "decision.panel.steadiest",
            )}
            icon={Sparkles}
          >
            {stability.kind === "provisional" && (
              <p className="mb-2 max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
                {t("decision.panel.steadiestLede")}
              </p>
            )}
            <ul>
              {stability.observed.map((a) => (
                <AreaLine key={a.areaCode} name={name(a)} detail={why(a)} kind="observed" />
              ))}
              {stability.selfReported.map((s) => (
                <AreaLine
                  key={s.domainKey}
                  name={selfName(s)}
                  detail={t(`brief.pattern.${s.pattern}` as TranslationKey)}
                  kind="self_reported"
                />
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {/* The least actionable true thing on the page, given the least weight —
          but never omitted, because a reader who does not know how thin the
          coverage was will over-read everything above it. */}
      {support.uncertainties.length > 0 && (
        <p className="mt-3 max-w-[86ch] text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("decision.panel.uncertain")}: </span>
          {/* Counted, not listed. Naming five areas here would rebuild the
              catalogue one line below the paragraph that stopped being one —
              and all five are in the competency overview a screen down. */}
          {t("decision.panel.uncertainBody").replace("{n}", String(support.uncertainties.length))}
        </p>
      )}

      {/* D. The context strip. Compact by construction; everything else about
          provenance is folded into the traceability section at the bottom. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
        <Strip label={t("academy.reviews.assessment")}>
          {(sv ? context?.assessmentNameSv : context?.assessmentNameEn) ?? "—"}
        </Strip>
        <Strip label={t("academy.reviews.participant")}>{context?.participantRef ?? "—"}</Strip>
        <Strip label={t("academy.report.completed")}>
          {context?.submittedAt
            ? new Date(context.submittedAt).toLocaleDateString(sv ? "sv-SE" : "en-GB")
            : "—"}
        </Strip>
        <Strip label={t("decision.strip.observed")}>
          <span className="tabular-nums">{context?.evidenceObservations ?? 0}</span>
        </Strip>
        <Strip label={t("decision.strip.selfReported")}>
          <span className="tabular-nums">{context?.selfReportObservations ?? 0}</span>
        </Strip>
        <Strip label={t("decision.strip.review")}>
          {support.reviewComplete ? t("decision.strip.reviewDone") : t("decision.strip.reviewOpen")}
        </Strip>
      </dl>
    </section>
  );
}

function Strip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One competency, as a compact assessment card.
 *
 * Four labelled lines, in the order a reader needs them: what the pattern was,
 * what it rests on, why it matters for the work, and what to ask. Each is one
 * line by construction, so eight competencies stay a page rather than becoming
 * eight essays.
 *
 * The breadth caveat that used to close every card ("Ett bedömningstillfälle.
 * Underlagets bredd är därför begränsad...") is gone from here and stated once
 * in the methodology section. It was true on all eight cards, which is exactly
 * why printing it eight times taught the reader to stop reading the last line.
 *
 * The "why it matters" line is the authored behaviour statement from the
 * governed competency library, and the follow-up is the authored interview
 * question. Neither is generated here.
 */
export function CompetencyAssessmentCard({
  area,
  prompt,
  sv,
}: {
  area: ObservedArea;
  prompt: FollowUpItem["prompt"];
  sv: boolean;
}) {
  const { t } = useT();
  const behaviour = sv ? area.behaviourSv : area.behaviourEn;

  return (
    <li className="border-b border-border py-3.5 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">{sv ? area.areaSv : area.areaEn}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {t(RECRUITMENT_SIGNAL_LABEL[area.signal])}
          </span>
          <EvidenceTag kind="observed" />
        </div>
      </div>

      <dl className="mt-1.5 space-y-1">
        <CardLine term={t("decision.card.summary")}>{sv ? area.whySv : area.whyEn}</CardLine>
        <CardLine term={t("decision.card.evidence")}>
          {t("decision.card.evidenceBody").replace("{n}", String(area.items))}
        </CardLine>
        {behaviour && <CardLine term={t("decision.card.whyRelevant")}>{behaviour}</CardLine>}
        {prompt && (
          <CardLine term={t("decision.card.followUp")}>
            {sv ? prompt.questionSv : prompt.questionEn}
          </CardLine>
        )}
      </dl>
    </li>
  );
}

/** One labelled line of a competency card.
 *
 *  The term is the `dt` and it is VISIBLE. An earlier pass hid it with sr-only
 *  and repeated it as a bold span inside the `dd`, which looked identical and
 *  made a screen reader announce every label twice. */
function CardLine({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[74ch] text-[13px] leading-relaxed">
      <dt className="inline font-medium text-foreground">{term}: </dt>
      <dd className="inline text-muted-foreground">{children}</dd>
    </div>
  );
}

/**
 * The way back into the recruitment process.
 *
 * Deliberately a LINK and not a second set of status buttons. Moving an
 * application to interview, requesting a complement or rejecting it are the
 * application lifecycle's own transitions, they already exist on the candidate
 * page, and the database's transition allow-list is the only thing entitled to
 * decide which of them is offered. A duplicate set here would be a second
 * implementation of a rule that has one.
 *
 * Rendered only when the report was reached from an application, because that
 * is the only case where this report belongs to one.
 */
export function RecruitmentActions({
  employerSlug,
  applicationId,
}: {
  employerSlug: string;
  applicationId: string | null;
}) {
  const { t } = useT();
  if (!applicationId) return null;
  return (
    <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] px-4 py-3">
      <p className="max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{t("decision.actions.title")}. </span>
        {t("decision.actions.lede")}
      </p>
      <Link
        to="/employer/$employerSlug/applications/$applicationId"
        params={{ employerSlug, applicationId }}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("decision.actions.backToCandidate")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
