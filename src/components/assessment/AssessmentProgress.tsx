import { useT } from "@/i18n/context";

export function AssessmentProgress({ current, total }: { current: number; total: number }) {
  const { t } = useT();
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span>
          {t("sca.progress.question")} {current} {t("sca.progress.of")} {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("sca.progress.label")}
        />
      </div>
    </div>
  );
}
