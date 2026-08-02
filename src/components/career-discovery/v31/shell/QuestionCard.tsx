// Presentation primitives for the v3.1 assessment question surface.
//
// Every control here is a semantic radio inside a fieldset, so arrow-key
// behaviour, screen-reader grouping and form semantics are the browser's, not
// ours. The visuals are drawn on top with `has-[:checked]` / `has-[:focus-visible]`,
// which means no state is communicated by colour alone: the indicator changes
// shape as well.

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

export function AssessmentCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border border-border bg-card shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Slim progress bar plus the human-readable "Fråga 3 av 26". */
export function AssessmentProgressBar({
  stageLabel,
  current,
  total,
  answered,
}: {
  stageLabel: string;
  /** 1-based, user-facing. */
  current: number;
  total: number;
  /** How many answers exist — drives the bar, not the number. */
  answered: number;
}) {
  const { t } = useT();
  const pct = Math.min(100, Math.round((answered / total) * 100));
  const label = `${t("cd.public.progress")} ${current} ${t("cd.public.of")} ${total}`;
  return (
    <div className="border-b border-border px-5 py-4 sm:px-8 sm:py-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          {stageLabel}
        </p>
        <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{label}</p>
      </div>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-subtle)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-valuetext={label}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* The number itself, announced politely, for screen readers. */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

/** One descriptive alternative: full row is the label, so the whole row clicks. */
export function SelectableAnswer({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "group flex min-h-[52px] w-full cursor-pointer items-start gap-3.5 rounded-[12px] border bg-card px-4 py-3.5 text-sm leading-relaxed text-foreground",
        "transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "border-border hover:border-accent/50 hover:bg-muted/60",
        "has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:checked]:shadow-[var(--shadow-xs)]",
        "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-border bg-background transition-colors",
          "peer-checked:border-accent",
        )}
      >
        <span className="h-2.5 w-2.5 scale-0 rounded-full bg-accent transition-transform duration-150 group-has-[:checked]:scale-100 motion-reduce:transition-none" />
      </span>
      <span className="min-w-0 font-medium">{children}</span>
    </label>
  );
}

/** The 1–10 Likert scale. Horizontal on desktop, 5×2 on small screens. */
export function LikertScale({
  name,
  value,
  onSelect,
  lowLabel,
  highLabel,
}: {
  name: string;
  value: number | undefined;
  onSelect: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => {
          const checked = value === v;
          return (
            <label
              key={v}
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center rounded-[10px] border text-sm font-semibold tabular-nums sm:h-14",
                "transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none",
                checked
                  ? "border-accent bg-accent text-accent-foreground shadow-[var(--shadow-xs)]"
                  : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-muted/60",
                "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              )}
            >
              <input
                type="radio"
                name={name}
                value={v}
                checked={checked}
                onChange={() => onSelect(v)}
                className="sr-only"
              />
              <span aria-hidden="true">{v}</span>
              {/* Not colour alone: the chosen value is also stated in text. */}
              {checked && <span className="sr-only">✓</span>}
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4 text-xs text-muted-foreground">
        <span>1 · {lowLabel}</span>
        <span className="text-right">10 · {highLabel}</span>
      </div>
    </div>
  );
}

/** Stable footer inside the card. Forward action is optional by design. */
export function AssessmentNavigation({
  onBack,
  backDisabled,
  forward,
}: {
  onBack: () => void;
  backDisabled: boolean;
  forward?: { label: string; onClick: () => void };
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5">
      <button
        type="button"
        disabled={backDisabled}
        onClick={onBack}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("cd.public.back")}
      </button>
      {forward && (
        <button
          type="button"
          onClick={forward.onClick}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          {forward.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}