// Part A (context and integrity) and Part B (decision summary).
//
// ── WHY THESE ARE ONE FILE ────────────────────────────────────────────
//
// Both read the frozen context object and nothing else. Keeping them together
// means there is one place that decides how a report describes itself, and one
// place to check when the question is "could this leak something".
//
// ── WHY EVERY FIELD IS CONDITIONAL ────────────────────────────────────
//
// Snapshots released before the context existed carry none of it, and history
// is never rewritten to add it. Target role, customer and site have no schema
// until Phase 9, so they are absent rather than rendered as "not provided" on
// every report — a field that is empty on every document teaches the reader to
// skip the section where it will one day matter.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  CompetencyLine,
  ReportContext,
} from "@/lib/security-competency/academy-employer.functions";

const PURPOSE_LABEL: Record<string, TranslationKey> = {
  competence_development: "academy.reviews.purposeDevelopment",
  selection_support: "academy.reviews.purposeRecruitment",
  reassessment: "academy.report.purposeReassessment",
  // Deliberately worded to distinguish it from selection_support at a glance:
  // a report that said only "recruitment" would read as a selection basis,
  // which is precisely what this purpose is not.
  closed_test_recruitment: "academy.report.purposeClosedTestRecruitment",
};

const PERSON_LABEL: Record<string, TranslationKey> = {
  employee: "academy.report.personEmployee",
  candidate: "academy.report.personCandidate",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

function fmt(iso: string | undefined, lang: string): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE");
}

/**
 * Part A — what this report is about.
 *
 * `identityAction` is how the employer surface passes in the audited reveal.
 * The name is deliberately not in the snapshot: it could never be erased from
 * an immutable row, and resolving identity is an explicit, logged act rather
 * than something that happens by opening a page.
 */
export function ReportContextPanel({
  context,
  identityAction,
  reportId,
  releasedAt,
}: {
  context: ReportContext | null;
  identityAction?: React.ReactNode;
  /** Snapshot id and release date. On screen they sit in the lineage section;
   *  in print they are promoted to the top, because a printed page that leaves
   *  the system has to be identifiable on its own. */
  reportId?: string;
  releasedAt?: string;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  if (!context) return null;
  const c = context;

  const assessment = lang === "en" ? c.assessmentNameEn : c.assessmentNameSv;
  const closedTest = c.governanceMode === "closed_test";

  return (
    <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("academy.report.contextTitle")}</h2>

      {/* Print carries the identity of the document itself. A sheet of paper
          with competency states and no report id cannot be traced back. */}
      {reportId && (
        <p className="print-only mt-2 text-[11px] text-muted-foreground">
          {t("academy.report.reportIdLabel")}: {reportId}
          {c.reportKey ? ` · ${c.reportKey} v${c.reportVersion ?? 1}` : ""}
          {releasedAt ? ` · ${t("academy.report.releasedOn")} ${fmt(releasedAt, lang)}` : ""}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {c.participantRef && (
          <Fact label={t("academy.reviews.participant")} value={c.participantRef} />
        )}
        {c.personContext && (
          <Fact
            label={t("academy.report.personContext")}
            value={t(PERSON_LABEL[c.personContext] ?? "academy.reviews.unknown")}
          />
        )}
        {c.organisationName && (
          <Fact label={t("academy.reviews.organisation")} value={c.organisationName} />
        )}
        {c.purposeCode && (
          <Fact
            label={t("academy.reviews.purpose")}
            value={t(PURPOSE_LABEL[c.purposeCode] ?? "academy.reviews.unknown")}
          />
        )}
        {assessment && <Fact label={t("academy.reviews.assessment")} value={assessment} />}
        {c.assessmentVersion != null && (
          <Fact
            label={t("academy.report.version")}
            value={`${t("academy.report.versionShort")} ${c.assessmentVersion}`}
          />
        )}
        {fmt(c.submittedAt, lang) && (
          <Fact label={t("academy.report.completed")} value={fmt(c.submittedAt, lang)!} />
        )}
      </dl>

      {identityAction && <div className="mt-4">{identityAction}</div>}

      {/* The governance basis, said before anything is read into the evidence. */}
      {closedTest && (
        <p className="mt-4 rounded-[10px] border border-border px-3 py-2 text-[12px] leading-relaxed text-foreground">
          {t("academy.report.closedTestBanner")}
        </p>
      )}

      {/* Lineage: complete, but folded away. It is what makes the report
          auditable, and it is not what a manager reads first. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-[8px] text-[13px] font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
        {t("academy.report.lineageToggle")}
      </button>

      {open && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-3">
          {c.assessmentSlug && (
            <Fact label={t("academy.report.instrument")} value={c.assessmentSlug} />
          )}
          {c.governanceMode && (
            <Fact label={t("academy.report.governance")} value={c.governanceMode} />
          )}
          {c.validationStatus && (
            <Fact label={t("academy.report.validation")} value={c.validationStatus} />
          )}
          {c.contentStatus && (
            <Fact label={t("academy.report.contentStatus")} value={c.contentStatus} />
          )}
          {c.attemptStatus && (
            <Fact label={t("academy.report.attemptStatus")} value={c.attemptStatus} />
          )}
          {c.reviewsTotal != null && (
            <Fact
              label={t("academy.report.reviewStatus")}
              value={`${c.reviewsCompleted ?? 0} / ${c.reviewsTotal}`}
            />
          )}
          {c.language && <Fact label={t("academy.report.language")} value={c.language} />}
          {fmt(c.startedAt, lang) && (
            <Fact label={t("academy.report.started")} value={fmt(c.startedAt, lang)!} />
          )}
          {c.reportKey && (
            <Fact
              label={t("academy.report.reportVersion")}
              value={`${c.reportKey} v${c.reportVersion ?? 1}`}
            />
          )}
          {c.evidenceStateVersion && (
            <Fact label={t("academy.report.derivation")} value={c.evidenceStateVersion} />
          )}
          {c.thresholdVersion && (
            <Fact label={t("academy.report.threshold")} value={c.thresholdVersion} />
          )}
          {c.scoringModelVersion && (
            <Fact label={t("academy.report.scoringModel")} value={c.scoringModelVersion} />
          )}
        </dl>
      )}
    </section>
  );
}

/**
 * Part B — what this report can and cannot support.
 *
 * Counted from the states, never scored. There is deliberately no total, no
 * percentage and no verdict: the summary says which competencies need a
 * conversation and what the evidence cannot carry, and then hands the decision
 * back to the employer in as many words.
 */
export function DecisionSummary({
  lines,
  context,
  safetyCount,
}: {
  lines: CompetencyLine[];
  context: ReportContext | null;
  safetyCount: number;
}) {
  const { t, lang } = useT();
  const critical = lines.filter((l) => l.evidenceState === "critical_follow_up");
  const followUp = lines.filter((l) => l.evidenceState === "follow_up");
  const shown = lines.filter(
    (l) => l.evidenceState === "shown" || l.evidenceState === "strongly_shown",
  );
  const notYet = lines.filter((l) => l.evidenceState === "not_yet_shown");
  const name = (l: CompetencyLine) => (lang === "en" ? l.competencyNameEn : l.competencyNameSv);

  const reviewsOutstanding =
    context?.reviewsTotal != null &&
    context.reviewsCompleted != null &&
    context.reviewsCompleted < context.reviewsTotal;

  return (
    <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("academy.report.summaryTitle")}</h2>

      <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-foreground">
        <p>
          <span className="font-medium">{t("academy.report.canSupport")}</span>{" "}
          <span className="text-muted-foreground">{t("academy.report.canSupportBody")}</span>
        </p>
        <p>
          <span className="font-medium">{t("academy.report.cannotSupport")}</span>{" "}
          <span className="text-muted-foreground">{t("academy.report.cannotSupportBody")}</span>
        </p>

        {critical.length > 0 && (
          <p>
            <span className="font-medium">{t("academy.report.needsCritical")}</span>{" "}
            <span className="text-muted-foreground">{critical.map(name).join(", ")}</span>
          </p>
        )}

        {followUp.length > 0 && (
          <p>
            <span className="font-medium">{t("academy.report.needsFollowUp")}</span>{" "}
            <span className="text-muted-foreground">{followUp.map(name).join(", ")}</span>
          </p>
        )}

        {shown.length > 0 && (
          <p>
            <span className="font-medium">{t("academy.report.evidenced")}</span>{" "}
            <span className="text-muted-foreground">{shown.map(name).join(", ")}</span>
          </p>
        )}

        {notYet.length > 0 && (
          <p>
            <span className="font-medium">{t("academy.report.notYet")}</span>{" "}
            <span className="text-muted-foreground">{notYet.map(name).join(", ")}</span>
          </p>
        )}

        {safetyCount > 0 && (
          <p className="text-muted-foreground">
            {safetyCount} {t("academy.report.safetyCounted")}
          </p>
        )}

        {/* A missing step is a fact about the run, and belongs in the summary
            rather than being discovered later. */}
        {reviewsOutstanding && (
          <p className="text-muted-foreground">{t("academy.report.reviewsOutstanding")}</p>
        )}

        <p className="border-t border-border pt-3 font-medium">
          {t("academy.report.employerDecides")}
        </p>
      </div>
    </section>
  );
}
