import { useT } from "@/i18n/context";
import type { InterviewContextResult } from "@/lib/interview-intelligence/context";
import { contextOf } from "@/lib/interview-intelligence/context-outcome";

/** Current application context and selected case sources are separate reads.
 * This status never turns a failed context read into an assertion of absence
 * and never adds application material to the interview record. */
export function CandidateBackgroundStatus({
  result,
  isLoading,
  savedSourceCount,
}: {
  result: InterviewContextResult | undefined;
  isLoading: boolean;
  savedSourceCount: number;
}) {
  const { t } = useT();
  const context = contextOf(result);
  const liveKey = isLoading
    ? "iiu.pp.background.live.loading"
    : context?.link === "linked"
      ? "iiu.pp.background.live.available"
      : context?.link === "standalone"
        ? "iiu.pp.background.live.standalone"
        : "iiu.pp.background.live.unavailable";
  return (
    <dl className="mb-4 space-y-3 text-sm">
      <div>
        <dt className="font-medium text-foreground">{t("iiu.pp.background.live.title")}</dt>
        <dd className="mt-1 leading-relaxed text-muted-foreground">{t(liveKey)}</dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">{t("iiu.pp.background.saved.title")}</dt>
        <dd className="mt-1 leading-relaxed text-muted-foreground">
          {savedSourceCount > 0
            ? t("iiu.pp.background.saved.available").replace("{n}", String(savedSourceCount))
            : t("iiu.pp.background.saved.none")}
        </dd>
      </div>
    </dl>
  );
}
