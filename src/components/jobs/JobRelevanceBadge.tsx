import { Sparkles } from "lucide-react";
import { useT } from "@/i18n/context";
import type { RelevanceBand } from "@/lib/job-intelligence/personal-relevance";

/**
 * Small, discreet indicator rendered on job cards when the current
 * user's saved Career Profile aligns with the role. Never shows a raw
 * score. Only appears when the band is strong / promising / exploratory
 * or when there is a family-level basis worth mentioning.
 */
export function JobRelevanceBadge({
  band,
  basis,
}: {
  band: RelevanceBand;
  basis: "profession" | "family" | "none";
}) {
  const { t } = useT();
  if (band === "none") return null;

  let label: string;
  if (basis === "family") {
    label = t("jobs.relevance.badge.family");
  } else if (band === "strong") {
    label = t("jobs.relevance.badge.strong");
  } else if (band === "promising") {
    label = t("jobs.relevance.badge.promising");
  } else {
    label = t("jobs.relevance.badge.exploratory");
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
      aria-label={label}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}