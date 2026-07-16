import { useT } from "@/i18n/context";
import type { Bi } from "@/lib/career-center/types";
import { pickBi } from "@/lib/career-center/selectors";
import { cn } from "@/lib/utils";
import { confidenceLabel } from "@/lib/career-assessment";
import type { ConfidenceLevel } from "@/lib/career-assessment";

export function CareerMatchCard({
  title,
  score,
  confidence,
  rank,
  active,
  onSelect,
}: {
  title: Bi;
  score: number;
  confidence: ConfidenceLevel;
  rank: number;
  active?: boolean;
  onSelect?: () => void;
}) {
  const { t, lang } = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-lg border bg-background p-5 text-left transition-colors",
        active ? "border-accent" : "border-border hover:border-accent/60",
      )}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/40 text-sm font-semibold text-foreground">
          {rank}
        </span>
        <div>
          <p
            className="text-base font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pickBi(title, lang)}
          </p>
          <p className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground">
            {t("sca.results.match.label")} · {pickBi(confidenceLabel[confidence], lang)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {score}
          <span className="ml-0.5 text-sm text-muted-foreground">%</span>
        </p>
      </div>
    </button>
  );
}
