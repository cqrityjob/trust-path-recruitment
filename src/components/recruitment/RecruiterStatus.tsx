import { CheckCircle2, CircleDashed, HelpCircle, XCircle, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n/context";
import type { CandidateView } from "@/lib/recruitment/definitions";
import type { IntelligenceCounts } from "@/lib/recruitment/requirement-intelligence";
import { requirementLabels, reviewLabels } from "@/lib/recruitment/requirement-presentation";

// Requirement status is shown with TEXT and a SYMBOL as well as a colour, so a
// reader who cannot tell green from amber, or who prints the page, still reads
// the same answer. The meaning of each status is the server's; nothing here
// classifies anything.
const tones = {
  green:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  yellow: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  gray: "border-border bg-muted text-foreground",
  not_established: "border-dashed border-border bg-background text-muted-foreground",
} as const;

export type RequirementStatus = keyof typeof tones;

const STATUS_ICON: Record<RequirementStatus, LucideIcon> = {
  green: CheckCircle2,
  yellow: XCircle,
  gray: HelpCircle,
  not_established: CircleDashed,
};

/** Presentation of the server's requirement status, never a client classifier. */
export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const { lang } = useT();
  const Icon = STATUS_ICON[status];
  return (
    <span
      data-testid="requirement-status"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${tones[status]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {requirementLabels[lang][status]}
    </span>
  );
}
export function ReviewStatusBadge({ status }: { status: "reviewed" | "pending" | "stale" }) {
  const { lang } = useT();
  return (
    <span
      data-testid="human-review-status"
      data-status={status}
      className="inline-flex rounded border border-border px-2 py-1 text-xs"
    >
      {reviewLabels[lang][status]}
    </span>
  );
}
export function AnalysisStatusBadge() {
  const { lang } = useT();
  return (
    <span data-testid="analysis-status" className="text-xs text-muted-foreground">
      {lang === "sv" ? "Teknisk analys: används inte" : "Technical analysis: not used"}
    </span>
  );
}

/** The plain-language account of what each number covers. Rendered as a
 *  closed disclosure under the counts, in the same component everywhere the
 *  counts appear, so the overview, the organisation list and the job hub all
 *  explain the same numbers the same way. */
export function CountsExplanation() {
  const { t } = useT();
  return (
    <details data-testid="counts-explanation" className="mt-2 text-xs text-muted-foreground">
      <summary className="min-h-11 cursor-pointer list-item py-2 font-medium text-foreground underline-offset-4 hover:underline sm:min-h-0 sm:py-0">
        {t("rec.counts.explainSummary")}
      </summary>
      <ul className="mt-2 space-y-1.5 leading-relaxed">
        <li>{t("rec.counts.explain.received")}</li>
        <li>{t("rec.counts.explain.reviewed")}</li>
        <li>{t("rec.counts.explain.remaining")}</li>
        <li>{t("rec.counts.explain.status")}</li>
        <li>{t("rec.counts.explain.open")}</li>
      </ul>
    </details>
  );
}

export function RecruiterCounts({
  counts,
  onView,
  scopeLabel,
  title,
  intro,
  queue,
}: {
  counts: IntelligenceCounts;
  onView: (view: CandidateView) => void;
  scopeLabel?: string;
  /** A heading when the block stands on its own (the overview); the lists
   *  already have a heading above the table and pass none. */
  title?: string;
  /** One sentence that separates this population from the numbers next to it. */
  intro?: string;
  /** The actionable queue -- open applications without a confirmed review --
   *  shown first and apart from the historical coverage below it. `count` is
   *  null while loading and "failed" when the read failed; the view is what
   *  its button opens. Lists that already are a queue pass none. */
  queue?: { count: number | null | "failed"; view: CandidateView; retry: () => void };
}) {
  const { lang, t } = useT();
  const sv = lang === "sv";
  const cards: { label: string; count: number; view: CandidateView }[] = [
    { label: sv ? "Mottagna" : "Received", count: counts.received, view: { stage: "received" } },
    {
      label: sv ? "Mänskligt granskade" : "Human reviewed",
      count: counts.reviewed,
      view: { stage: "received", review: "reviewed" },
    },
    {
      label: sv ? "Återstående" : "Remaining",
      count: counts.remaining,
      view: { stage: "received", review: "remaining" },
    },
  ];
  return (
    <section
      data-testid="recruiter-counts"
      className="mb-4 rounded-lg border border-border p-3"
      aria-label={title ?? (sv ? "Ansökningar och granskning" : "Applications and review")}
    >
      {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
      {intro && <p className="mt-1 mb-2 text-xs leading-relaxed text-muted-foreground">{intro}</p>}
      {queue && (
        <div
          data-testid="review-queue"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/5 p-3"
        >
          <div className="min-w-0">
            <span className="block text-xs font-semibold text-foreground">
              {t("rec.counts.queue.label")}
            </span>
            {queue.count === "failed" ? (
              <span role="alert" className="text-sm">
                {t("rec.counts.queue.unavailable")}{" "}
                <button type="button" onClick={queue.retry} className="underline">
                  {sv ? "Försök igen" : "Retry"}
                </button>
              </span>
            ) : (
              <strong data-testid="review-queue-count" className="text-2xl tabular-nums">
                {queue.count ?? "…"}
              </strong>
            )}
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {t("rec.counts.queue.hint")}
            </span>
          </div>
          <button
            type="button"
            data-testid="review-queue-open"
            onClick={() => onView(queue.view)}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("rec.counts.queue.cta")}
          </button>
        </div>
      )}
      {queue && (
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("rec.counts.history.heading")}
        </h3>
      )}
      {scopeLabel && <p className="mb-2 text-xs font-semibold">{scopeLabel}</p>}
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <button
            type="button"
            data-testid={`count-${card.view.review ?? "received"}`}
            key={card.label}
            onClick={() => onView(card.view)}
            className="min-h-11 rounded border border-border p-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-xs text-muted-foreground">{card.label}</span>
            <strong className="text-xl tabular-nums">{card.count}</strong>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {sv
          ? "Mottagna omfattar även arkiverade ansökningar. Test- och intervjuindikatorer kan överlappa och summeras inte som unika ansökningar."
          : "Received includes archived applications. Test and interview indicators may overlap and are not added as unique applications."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["green", "yellow", "gray", "not_established"] as const).map((status) => {
          const Icon = STATUS_ICON[status];
          return (
            <button
              type="button"
              data-testid={`count-${status}`}
              key={status}
              onClick={() => onView({ stage: "received", requirement: status })}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded border px-2 text-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tones[status]}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {requirementLabels[lang][status]}:{" "}
                <strong className="tabular-nums">
                  {status === "not_established" ? counts.notEstablished : counts[status]}
                </strong>
              </span>
            </button>
          );
        })}
      </div>
      <p data-testid="filtered-review-counts" className="mt-2 text-xs text-muted-foreground">
        {sv
          ? `Vald lista: ${counts.filtered} ansökningar · ${counts.filteredReviewed} granskade · ${counts.filteredRemaining} återstående.`
          : `Selected list: ${counts.filtered} applications · ${counts.filteredReviewed} reviewed · ${counts.filteredRemaining} remaining.`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {sv
          ? `Arkiverade: ${counts.archived}. Återkallade: ${counts.withdrawn}. Med beslut: ${counts.decided}. Kravstatus ändrar inte rekryteringssteg eller beslut.`
          : `Archived: ${counts.archived}. Withdrawn: ${counts.withdrawn}. With a decision: ${counts.decided}. Requirement status does not change recruitment stage or decision.`}
      </p>
      <CountsExplanation />
    </section>
  );
}
