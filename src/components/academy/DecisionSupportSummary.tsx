// Candidate Decision Support Report V2 — the first screen.
//
// ── THE PROBLEM THIS REPLACES ───────────────────────────────────────────
//
// The released candidate report was correct and nearly unusable. It opened
// with provenance, then with what the report may and may not be used for, then
// with a methodological paragraph, and only then with anything about the
// person — and it repeated the caveats in every section afterwards. A recruiter
// with forty minutes had to read several hundred words of governance before
// learning what the assessment indicated.
//
// Nothing has been removed. The caveats, the provenance and the limitations are
// all still on the page: they are stated once, at the bottom, under
// "Om bedömningsunderlaget", with the short provenance stamps kept on every row
// so a reader can never mistake a self-description for an observation.
//
// ── WHAT REPLACED IT ────────────────────────────────────────────────────
//
// One screen that answers, in order: what should I do next, what does this say,
// what is strongest, what needs following up, what is safety-critical, and what
// is simply uncertain. All six come from `buildDecisionSupport`, which is a
// filter over the frozen brief — this file chooses layout and nothing else.
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
  PANEL_LIMIT,
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

const SIGNAL_LABEL: Record<ObservedArea["signal"], TranslationKey> = {
  strong: "brief.signal.strong",
  consistent: "brief.signal.consistent",
  mixed: "brief.signal.mixed",
  developing: "brief.signal.developing",
  limited: "brief.signal.limited",
};

/** The evidence-type stamp, kept on every row in every section. Words, not a
 *  colour and not an icon alone: this is the one distinction the report may
 *  never blur, so it survives greyscale, print and a colour-blind reader. */
export function EvidenceTag({ kind }: { kind: "observed" | "self_reported" }) {
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

/** One of the four summary panels.
 *
 *  A panel with nothing in it does not render an alarming empty box — with one
 *  exception: "strongest support" says in words that the assessment produced
 *  none, because silence there would read as an oversight and inventing a
 *  least-bad area to fill it would be worse than either. */
function Panel({
  title,
  icon: Icon,
  emphasis,
  children,
}: {
  title: string;
  icon: typeof Scale;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[12px] border p-4",
        emphasis ? "border-accent bg-[color:var(--surface-subtle)]" : "border-border bg-card",
      )}
    >
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function AreaLine({
  name,
  detail,
  kind,
}: {
  name: string;
  detail: string;
  kind: "observed" | "self_reported";
}) {
  return (
    <li className="border-b border-border py-2 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <EvidenceTag kind={kind} />
      </div>
      <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </li>
  );
}

/**
 * Section 1 — the executive summary.
 *
 * Everything above the fold: the recommended process step and why, the
 * candidate-specific narrative, and the four panels. The context strip closes
 * it, deliberately compact and deliberately last within the section — it is
 * what the document is about, not what it says.
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

  return (
    <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("decision.summaryTitle")}</h2>

      {/* A. The recommended PROCESS step, first thing on the page. Stated with
          its reason beside it, because a recommendation a reader cannot
          interrogate is one they either obey or ignore. */}
      <div className="mt-4 rounded-[12px] border border-accent bg-[color:var(--surface-subtle)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          {t("decision.recommendedStep")}
        </p>
        <p className="mt-1 text-[17px] font-semibold leading-snug text-foreground">
          {t(STEP_LABEL[support.recommendedNextStep])}
        </p>
        <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          {t(support.rationaleKey)}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {t("decision.stepIsProcessOnly")}
        </p>
      </div>

      {/* B. The narrative. Frozen with the snapshot and specific to this
          person; absent on snapshots released before it existed, and the page
          then simply starts at the panels. */}
      {support.narrative && (
        <p className="mt-4 max-w-[70ch] border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-foreground">
          {sv ? support.narrative.sv : support.narrative.en}
        </p>
      )}

      {/* C. The four panels. */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Panel title={t("decision.panel.strongest")} icon={Sparkles}>
          {support.strongestSupported.length === 0 ? (
            <p className="max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
              {t("decision.panel.strongestNone")}
            </p>
          ) : (
            <ul>
              {support.strongestSupported.slice(0, PANEL_LIMIT).map((a) => (
                <AreaLine key={a.areaCode} name={name(a)} detail={why(a)} kind="observed" />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("decision.panel.followUp")} icon={CircleDashed}>
          {support.priorityFollowUp.length === 0 ? (
            <p className="max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
              {t("decision.panel.followUpNone")}
            </p>
          ) : (
            <ul>
              {support.priorityFollowUp.slice(0, PANEL_LIMIT).map((f) => (
                <AreaLine
                  key={f.area.areaCode}
                  name={name(f.area)}
                  detail={why(f.area)}
                  kind="observed"
                />
              ))}
            </ul>
          )}
        </Panel>

        {/* Rendered from its own field, and only when there is something in
            it. A clean report shows no safety panel at all rather than an
            empty one that reads as a warning. */}
        {support.safetyCriticalFollowUp && (
          <Panel title={t("decision.panel.safety")} icon={ShieldAlert} emphasis>
            <p className="max-w-[62ch] text-[12px] leading-relaxed text-foreground">
              {support.safetyCriticalFollowUp.count === 1
                ? t("academy.safety.bodyOne")
                : `${support.safetyCriticalFollowUp.count} ${t("academy.safety.bodyMany")}`}
            </p>
            <p className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
              {t("decision.panel.safetyNote")}
            </p>
          </Panel>
        )}

        <Panel title={t("decision.panel.uncertain")} icon={Scale}>
          {support.uncertainties.length === 0 && support.selfReportedPatterns.length === 0 ? (
            <p className="max-w-[62ch] text-[12px] leading-relaxed text-muted-foreground">
              {t("decision.panel.uncertainNone")}
            </p>
          ) : (
            <ul>
              {support.uncertainties.slice(0, PANEL_LIMIT).map((a) => (
                <AreaLine
                  key={a.areaCode}
                  name={name(a)}
                  detail={t("decision.panel.thinArea").replace("{n}", String(a.items))}
                  kind="observed"
                />
              ))}
              {support.selfReportedPatterns.slice(0, PANEL_LIMIT).map((s) => (
                <AreaLine
                  key={s.domainKey}
                  name={selfName(s)}
                  detail={t(`brief.consistency.${s.consistency}` as TranslationKey)}
                  kind="self_reported"
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* D. The context strip. Compact by construction: seven facts on one
          line each, and everything else about provenance folded into the
          traceability section at the bottom of the page. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4 sm:grid-cols-4">
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
 * Phase 4 — one competency, as a compact assessment card.
 *
 * Four short parts, in the order a reader needs them: what the pattern was,
 * what it rests on, why it matters for the work, and what to ask. Each part is
 * one or two lines by construction, so eight competencies stay a page rather
 * than becoming eight essays.
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

      {behaviour && (
        <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("decision.card.whyRelevant")}: </span>
          {behaviour}
        </p>
      )}

      {prompt && (
        <p className="mt-1.5 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("decision.card.followUp")}: </span>
          {sv ? prompt.questionSv : prompt.questionEn}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {area.items} {t("brief.tasks")}
      </p>
    </li>
  );
}

/**
 * Phase 8 — the way back into the recruitment process.
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
    <div className="no-print mt-6 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4">
      <p className="text-[13px] font-semibold text-foreground">{t("decision.actions.title")}</p>
      <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-muted-foreground">
        {t("decision.actions.lede")}
      </p>
      <Link
        to="/employer/$employerSlug/applications/$applicationId"
        params={{ employerSlug, applicationId }}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("decision.actions.backToCandidate")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
