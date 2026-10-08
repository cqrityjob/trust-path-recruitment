import { useT } from "@/i18n/context";
import type { CandidateView } from "@/lib/recruitment/definitions";

import { requirementLabels, reviewLabels } from "@/lib/recruitment/requirement-presentation";
const tones = {
  green:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  yellow: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  gray: "border-border bg-muted text-foreground",
  not_established: "border-border bg-background text-muted-foreground",
} as const;

/** Presentation of the server's requirement status, never a client classifier. */
export function RequirementStatusBadge({ status }: { status: keyof typeof tones }) {
  const { lang } = useT();
  return (
    <span
      data-testid="requirement-status"
      data-status={status}
      className={`inline-flex rounded border px-2 py-1 text-xs ${tones[status]}`}
    >
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
import type { IntelligenceCounts } from "@/lib/recruitment/requirement-intelligence";

export function RecruiterCounts({
  counts,
  onView,
  scopeLabel,
}: {
  counts: IntelligenceCounts;
  onView: (view: CandidateView) => void;
  scopeLabel?: string;
}) {
  const { lang } = useT();
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
      aria-label={sv ? "Ansökningar och granskning" : "Applications and review"}
    >
      {scopeLabel && <p className="mb-2 text-xs font-semibold">{scopeLabel}</p>}
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <button
            type="button"
            data-testid={`count-${card.view.review ?? "received"}`}
            key={card.label}
            onClick={() => onView(card.view)}
            className="min-h-11 rounded border border-border p-2 text-left hover:bg-muted/50"
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
        {(["green", "yellow", "gray", "not_established"] as const).map((status) => (
          <button
            type="button"
            data-testid={`count-${status}`}
            key={status}
            onClick={() => onView({ stage: "received", requirement: status })}
            className="min-h-11 rounded border border-border px-2 text-xs hover:bg-muted/50"
          >
            {requirementLabels[lang][status]}:{" "}
            <strong className="tabular-nums">
              {status === "not_established" ? counts.notEstablished : counts[status]}
            </strong>
          </button>
        ))}
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
    </section>
  );
}
